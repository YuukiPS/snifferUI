import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import * as protobuf from 'protobufjs';
import './App.css';
import { Sidebar } from './components/Sidebar';
import { PacketTable } from './components/PacketTable';
import { PacketDetail } from './components/PacketDetail';
import { FilterSettings } from './components/FilterSettings';
import { ServerModal } from './components/ServerModal';
import { ProtoUploadModal } from './components/ProtoUploadModal';
import { JsonUploadModal } from './components/JsonUploadModal';
import { PcapUploadModal } from './components/PcapUploadModal';
import { DatabaseModal } from './components/DatabaseModal';
import type { Packet } from './types';
import {
  savePackets,
  loadAllPackets,
  clearAllPackets,
  queuePacketSave,
  flushWriteBuffer,
  getStorageEstimate,
  formatBytes,
  setDatabaseName,
} from './utils/packetStorage';

function App() {
  const [packets, setPackets] = useState<Packet[]>([]);
  const [selectedPacket, setSelectedPacket] = useState<Packet | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchScope, setSearchScope] = useState<'ALL' | 'NAME' | 'ID' | 'SEQ' | 'CONTENT'>('ALL');
  const [hiddenNames, setHiddenNames] = useState<string[]>(() => {
    const currentDb = localStorage.getItem('packet_monitor_current_db') || 'default';
    const key = currentDb === 'default' ? 'packet_monitor_hidden_names' : `packet_monitor_hidden_names_${currentDb}`;
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : [];
  });
  const [isFilterSettingsOpen, setIsFilterSettingsOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, type: 'name' | 'data', packet: Packet } | null>(null);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const [isDatabaseModalOpen, setIsDatabaseModalOpen] = useState(false);
  const [currentDatabase, setCurrentDatabase] = useState(() => {
    return localStorage.getItem('packet_monitor_current_db') || 'default';
  });
  const [databases, setDatabases] = useState<{name: string, gameType: number}[]>(() => {
    const saved = localStorage.getItem('packet_monitor_databases');
    return saved ? JSON.parse(saved) : [{ name: 'default', gameType: 0 }];
  });

  const [isServerModalOpen, setIsServerModalOpen] = useState(false);
  const [isProtoModalOpen, setIsProtoModalOpen] = useState(false);
  const [isJsonModalOpen, setIsJsonModalOpen] = useState(false);
  const [isPcapModalOpen, setIsPcapModalOpen] = useState(false);
  const [serverAddress, setServerAddress] = useState(() => {
    return localStorage.getItem('packet_monitor_server_address') || "http://localhost:1985";
  });

  const GAME_GI = 1;
  const COMBAT_ARG_TYPE_TO_MESSAGE: Record<string, string> = {
    "CombatTypeArgument_COMBAT_EVT_BEING_HIT": "EvtBeingHitInfo",
    "CombatTypeArgument_ENTITY_MOVE": "EntityMoveInfo",
    "CombatTypeArgument_ANIMATOR_PARAMETER_CHANGED": "EvtAnimatorParameterInfo"
  };
  const decodeUnknownProtobuf = (buf: Uint8Array) => {
    const readVarint = (b: Uint8Array, o: number) => {
      let x = 0;
      let s = 0;
      let i = o;
      for (;;) {
        const v = b[i++];
        x |= (v & 0x7f) << s;
        if ((v & 0x80) === 0) break;
        s += 7;
      }
      return [x, i] as const;
    };
    const toHex = (b: Uint8Array) => {
      let h = "";
      for (let i = 0; i < b.length; i++) {
        const v = b[i].toString(16).padStart(2, "0");
        h += v;
      }
      return h;
    };
    const toBase64 = (b: Uint8Array) => {
      let s = "";
      for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
      return btoa(s);
    };
    const out: any[] = [];
    let o = 0;
    while (o < buf.length) {
      const [key, o1] = readVarint(buf, o);
      o = o1;
      const f = key >>> 3;
      const wt = key & 0x7;
      if (wt === 0) {
        const [val, o2] = readVarint(buf, o);
        o = o2;
        out.push({ field: f, wireType: wt, varint: val });
      } else if (wt === 1) {
        const bytes = buf.slice(o, o + 8);
        o += 8;
        out.push({ field: f, wireType: wt, fixed64: toHex(bytes), base64: toBase64(bytes) });
      } else if (wt === 2) {
        const [len, o2] = readVarint(buf, o);
        o = o2;
        const bytes = buf.slice(o, o + len);
        o += len;
        let nested: any = null;
        try {
          nested = decodeUnknownProtobuf(bytes);
        } catch {}
        out.push({ field: f, wireType: wt, length: len, bytesHex: toHex(bytes), bytesBase64: toBase64(bytes), nested });
      } else if (wt === 5) {
        const bytes = buf.slice(o, o + 4);
        o += 4;
        out.push({ field: f, wireType: wt, fixed32: toHex(bytes), base64: toBase64(bytes) });
      } else {
        break;
      }
    }
    return out;
  };
  const currentGameType = useMemo(() => {
    return databases.find(d => d.name === currentDatabase)?.gameType ?? GAME_GI;
  }, [databases, currentDatabase]);

  // Proto-related state
  const protoRootRef = useRef<protobuf.Root>(new protobuf.Root());
  const [cmdIdToMessageMap, setCmdIdToMessageMap] = useState<{ [cmdId: number]: string }>({});
  const cmdIdToMessageMapRef = useRef<{ [cmdId: number]: string }>({});

  useEffect(() => {
    cmdIdToMessageMapRef.current = cmdIdToMessageMap;
  }, [cmdIdToMessageMap]);

  const globalPacketIndexRef = useRef(0);

  // Auto-scroll state (persisted)
  const [autoScroll, setAutoScroll] = useState(() => {
    return localStorage.getItem('packet_monitor_auto_scroll') === 'true';
  });

  // Resize state
  const [packetDetailWidth, setPacketDetailWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);

  // Storage stats state
  const [storageUsage, setStorageUsage] = useState(0);
  const [storageQuota, setStorageQuota] = useState(0);

  const refreshStorageStats = useCallback(async () => {
    try {
      const { usage, quota } = await getStorageEstimate();
      setStorageUsage(usage);
      setStorageQuota(quota);
    } catch (err) {
      console.warn('Failed to get storage estimate:', err);
    }
  }, []);

  useEffect(() => {
    const handleClick = () => {
      if (contextMenu) setContextMenu(null);
    };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [contextMenu]);

  // Load packets from IndexedDB when database changes
  useEffect(() => {
    const init = async () => {
      // 0. Update DB name
      const dbName = currentDatabase === 'default' ? 'packet_monitor_db' : `packet_monitor_db_${currentDatabase}`;
      setDatabaseName(dbName);
      
      // Clear current state first
      setPackets([]);
      setSelectedPacket(null);
      globalPacketIndexRef.current = 0;
      setCmdIdToMessageMap({});
      protoRootRef.current = new protobuf.Root();

      // 1. Restore persisted packets
      let storedPackets: Packet[] = [];
      try {
        const stored = await loadAllPackets();
        if (stored.length > 0) {
          storedPackets = stored;
          setPackets(stored);
          const maxIndex = stored.reduce((max, p) => Math.max(max, p.index), 0);
          globalPacketIndexRef.current = maxIndex + 1;
          console.log(`Restored ${stored.length} packets from IndexedDB (next index: ${globalPacketIndexRef.current})`);
        }
      } catch (err) {
        console.warn('Failed to load packets from IndexedDB:', err);
      }

      // 2. Refresh storage stats
      await refreshStorageStats();

      // 3. Load proto for this DB
      const protoKey = currentDatabase === 'default' ? 'protoFileContent' : `protoFileContent_${currentDatabase}`;
      const savedProto = localStorage.getItem(protoKey);
      if (savedProto) {
        console.log("Found saved proto file. Rebuilding proto...");
        // Pass storedPackets to ensure we re-decode the newly loaded packets with the proto map
        rebuildFromProto(savedProto, storedPackets);
      }

      // 4. Check server status (only on initial load effectively, or if connection lost)
      if (!isMonitoring) {
        try {
          const baseUrl = serverAddress.replace(/\/$/, "");
          const res = await fetch(`${baseUrl}/api/status`);
          if (res.ok) {
            const data = await res.json();
            if (data.is_running) {
              console.log("Server is running, resuming monitoring...");
              startMonitoring(baseUrl);
            }
          }
        } catch (err) {
          console.log("Server check failed (server might be down):", err);
        }
      }
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDatabase]);

  // Periodically refresh storage stats (every 5s)
  useEffect(() => {
    const interval = setInterval(refreshStorageStats, 5000);
    return () => clearInterval(interval);
  }, [refreshStorageStats]);

  // Persist hiddenNames
  useEffect(() => {
    const key = currentDatabase === 'default' ? 'packet_monitor_hidden_names' : `packet_monitor_hidden_names_${currentDatabase}`;
    localStorage.setItem(key, JSON.stringify(hiddenNames));
  }, [hiddenNames, currentDatabase]);

  // Persist autoScroll
  useEffect(() => {
    localStorage.setItem('packet_monitor_auto_scroll', String(autoScroll));
  }, [autoScroll]);

  const rebuildFromProto = (protoText: string, existingPackets?: Packet[]): { success: boolean; mappingCount: number; error?: string } => {
    try {
      const parsed = protobuf.parse(protoText);
      protoRootRef.current = parsed.root;
    } catch (error) {
      console.error("Error parsing proto file:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, mappingCount: 0, error: errorMessage };
    }

    const newMap: { [cmdId: number]: string } = {};
    let pendingCmdId: number | null = null;
    const cmdIdRegex = /^\/\/\s*CmdId:\s*(\d+)/;
    const messageRegex = /^message\s+(\w+)/;
    const lines = protoText.split(/\r?\n/);

    for (const line of lines) {
      const trimmedLine = line.trim();
      const cmdMatch = trimmedLine.match(cmdIdRegex);
      if (cmdMatch) {
        pendingCmdId = Number(cmdMatch[1]);
        continue;
      }
      const msgMatch = trimmedLine.match(messageRegex);
      if (msgMatch && pendingCmdId !== null) {
        const messageName = msgMatch[1];
        newMap[pendingCmdId] = messageName;
        pendingCmdId = null;
      }
    }

    setCmdIdToMessageMap(newMap);

    const decodeBase64ToBytes = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const base64ByteLength = (b64?: string) => {
      if (!b64) return 0;
      try {
        return decodeBase64ToBytes(b64).length;
      } catch {
        return b64.length;
      }
    };
    const getFirstArrayProp = (obj: any, keys: string[]) => {
      if (!obj || typeof obj !== 'object') return null;
      for (const k of keys) {
        const v = obj[k];
        if (Array.isArray(v)) return v;
      }
      return null;
    };
    const getBase64String = (v: any): string | undefined => {
      if (typeof v === 'string') return v;
      if (!v || typeof v !== 'object') return undefined;
      const candidates = ['base64', 'b64', 'data', 'value'];
      for (const k of candidates) {
        if (typeof v[k] === 'string') return v[k];
      }
      return undefined;
    };
    const buildSubPackets = (parent: Packet, parentName: string, decodedObj: any): Packet[] | undefined => {
      if (parentName === 'UnionCmdNotify') {
        const cmdList = getFirstArrayProp(decodedObj, ['cmdList', 'cmdListList', 'cmd_list']);
        if (!cmdList || cmdList.length === 0) return undefined;
        const subs: Packet[] = [];
        for (let i = 0; i < cmdList.length; i++) {
          const sub = cmdList[i];
          try {
            const subId = Number(sub.messageId);
            const subBinary = getBase64String(sub.body);
            if (!subBinary) continue;
            const subProtoName = newMap[subId];
            let subDataStr = JSON.stringify(sub);
            let subSource: 'BINARY' | 'JSON' = 'JSON';
            if (subProtoName) {
              try {
                const subBuf = decodeBase64ToBytes(subBinary);
                const SubMessage = protoRootRef.current.lookupType(subProtoName);
                const subDecoded = SubMessage.decode(subBuf).toJSON();
                subDataStr = JSON.stringify(subDecoded);
                subSource = 'BINARY';
              } catch {
                subDataStr = JSON.stringify(sub);
                subSource = 'JSON';
              }
            }
            subs.push({
              timestamp: parent.timestamp,
              source: parent.source === 'CLIENT' ? 'SUB_CLIENT' : 'SUB_SERVER',
              id: subId,
              packetName: subProtoName || 'Unknown',
              length: base64ByteLength(subBinary),
              index: parent.index * 1000 + (i + 1),
              data: subDataStr,
              binary: subBinary,
              dataSource: subSource
            });
          } catch {}
        }
        return subs.length > 0 ? subs : undefined;
      }

      if (parentName === 'CombatInvocationsNotify') {
        const list = getFirstArrayProp(decodedObj, ['invokeList', 'invokeListList', 'invoke_list']);
        if (!list || list.length === 0) return undefined;
        const subs: Packet[] = [];
        for (let i = 0; i < list.length; i++) {
          const inv = list[i];
          try {
            const argType: string = String(inv.argumentType || '');
            const forwardType: string = String(inv.forwardType || '');
            const subBinary = getBase64String(inv.combatData);
            if (!subBinary) continue;
            const mappedName = COMBAT_ARG_TYPE_TO_MESSAGE[argType];
            const guessName = mappedName || argType || 'Unknown';
            let decodedPayload: any = inv;
            let subSource: 'BINARY' | 'JSON' = 'JSON';
            try {
              const buf = decodeBase64ToBytes(subBinary);
              if (mappedName) {
                const Msg = protoRootRef.current.lookupType(mappedName);
                decodedPayload = Msg.decode(buf).toJSON();
                subSource = 'BINARY';
              } else {
                decodedPayload = { unknownDecoded: decodeUnknownProtobuf(buf) };
                subSource = 'BINARY';
              }
            } catch {
              decodedPayload = inv;
              subSource = 'JSON';
            }
            subs.push({
              timestamp: parent.timestamp,
              source: parent.source === 'CLIENT' ? 'SUB_CLIENT' : 'SUB_SERVER',
              id: 0,
              packetName: guessName,
              length: base64ByteLength(subBinary),
              index: parent.index * 1000 + (i + 1),
              data: JSON.stringify({ argumentType: argType, forwardType: forwardType, payload: decodedPayload }),
              binary: subBinary,
              dataSource: subSource
            });
          } catch {}
        }
        return subs.length > 0 ? subs : undefined;
      }

      return undefined;
    };

    // Rebuild existing packets with new proto definitions
    // Use provided packets or fallback to state packets (but state might be stale in some contexts)
    const packetsToProcess = existingPackets || packets;

    if (packetsToProcess.length > 0) {
      const updatedPackets = packetsToProcess.map(packet => {
        const protoName = newMap[packet.id];

        // If we have a matching message in the new proto and binary data, try to decode
        if (protoName && packet.binary) {
          try {
            const buffer = decodeBase64ToBytes(packet.binary);
            // protoRootRef.current is already updated with the new proto
            const Message = protoRootRef.current.lookupType(protoName); 
            
            const decodedMessage = Message.decode(buffer).toJSON();
            const subs = currentGameType === GAME_GI ? buildSubPackets(packet, protoName, decodedMessage) : undefined;

            return {
              ...packet,
              packetName: protoName,
              data: JSON.stringify(decodedMessage),
              dataSource: 'BINARY',
              subPackets: subs
            };
          } catch (e) {
            console.warn(`Failed to re-decode packet ${packet.id} (${protoName}):`, e);
            // If decode fails, keep original packet data but update name if possible
            return {
              ...packet,
              packetName: protoName
            };
          }
        } else if (protoName) {
          // Update name even if no binary or decode not needed
          return {
            ...packet,
            packetName: protoName
          };
        }

        return packet;
      });

      setPackets(updatedPackets as Packet[]);
      // Persist re-decoded packets to IndexedDB
      clearAllPackets().then(() => savePackets(updatedPackets as Packet[])).then(refreshStorageStats);
    }

    const mappingCount = Object.keys(newMap).length;
    console.log(`Proto processed with ${mappingCount} cmdId mappings.`);
    return { success: true, mappingCount };
  };

  const handleUpload = (data: any[]): { success: boolean; packetCount: number; error?: string } => {
    try {
      const mappedPackets: Packet[] = data.map((item: any, index: number) => {
        let parsedData = "";
        let dataSource: 'BINARY' | 'JSON' = 'JSON';

        // Try decoding binary first if available
        let decoded = false;
        if (item.binary) {
          try {
            const protoName = item.packetName || cmdIdToMessageMap[item.packetId];
            if (protoName) {
              const buffer = Uint8Array.from(atob(item.binary), c => c.charCodeAt(0));
              const Message = protoRootRef.current.lookupType(protoName);
              const decodedMessage = Message.decode(buffer).toJSON();
              parsedData = JSON.stringify(decodedMessage);
              dataSource = 'BINARY';
              decoded = true;
            }
          } catch (e) {
            console.warn(`Failed to decode binary for packet ${item.packetId}, falling back to JSON`, e);
          }
        }

        // If binary decoding failed or wasn't possible, use item.data
        if (!decoded && item.data) {
          if (typeof item.data === 'string') {
            parsedData = item.data;
          } else {
            parsedData = JSON.stringify(item.data);
          }
          dataSource = 'JSON';
        }

        return {
          timestamp: new Date(item.time).toLocaleTimeString(),
          source: (() => {
            const src = String(item.source || '').toUpperCase();
            if (src === 'CLIENT' || src === 'SERVER' || src === 'SUB_CLIENT' || src === 'SUB_SERVER') {
              return src as Packet['source'];
            }
            return 'SERVER';
          })(),
          id: item.packetId,
          packetName: item.packetName,
          length: item.length,
          index: index,
          data: parsedData,
          binary: item.binary,
          dataSource: dataSource
        };
      });
      setPackets(mappedPackets);
      // Persist uploaded packets to IndexedDB (replace old data)
      clearAllPackets().then(() => savePackets(mappedPackets)).then(refreshStorageStats);
      globalPacketIndexRef.current = mappedPackets.length;
      return { success: true, packetCount: mappedPackets.length };
    } catch (error) {
      console.error("Error processing uploaded data:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, packetCount: 0, error: errorMessage };
    }
  };

  const filteredPackets = useMemo(() => {
    let result = packets;

    // Apply hidden filter
    if (hiddenNames.length > 0) {
      result = result.filter(p => !hiddenNames.includes(p.packetName));
    }

    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(p => {
        if (searchScope === 'ALL') {
          return (
            (p.packetName || '').toLowerCase().includes(term) ||
            (p.id?.toString() || '').includes(term) ||
            (p.index?.toString() || '').includes(term) ||
            ((typeof p.data === 'string' ? p.data : JSON.stringify(p.data)) || '').toLowerCase().includes(term)
          );
        } else if (searchScope === 'NAME') {
          return (p.packetName || '').toLowerCase().includes(term);
        } else if (searchScope === 'ID') {
          return (p.id?.toString() || '').includes(term);
        } else if (searchScope === 'SEQ') {
          return (p.index?.toString() || '').includes(term);
        } else if (searchScope === 'CONTENT') {
          return ((typeof p.data === 'string' ? p.data : JSON.stringify(p.data)) || '').toLowerCase().includes(term);
        }
        return false;
      });
    }

    return result;
  }, [packets, searchTerm, hiddenNames]);

  const handleRowContextMenu = (event: React.MouseEvent, packet: Packet, type: 'name' | 'data') => {
    event.preventDefault(); // Prevent native context menu just in case, though PacketTable handles it
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      type,
      packet
    });
  };

  const handleCopyJson = (packet: Packet, pretty: boolean = true) => {
    try {
      const parsed = JSON.parse(packet.data);
      const formatted = pretty ? JSON.stringify(parsed, null, 2) : JSON.stringify(parsed);
      navigator.clipboard.writeText(formatted);
    } catch (e) {
      console.error("Failed to parse JSON", e);
      navigator.clipboard.writeText(packet.data);
    }
    setContextMenu(null);
  };

  const handleCopyBinary = (packet: Packet) => {
    if (packet.binary) {
      navigator.clipboard.writeText(packet.binary);
    } else {
      alert("No binary data available for this packet.");
    }
    setContextMenu(null);
  };

  const handleCopyName = (packet: Packet) => {
    if (packet.packetName) {
      navigator.clipboard.writeText(packet.packetName);
    }
    setContextMenu(null);
  };

  const handleCopyId = (packet: Packet) => {
    if (packet.id !== undefined && packet.id !== null) {
      navigator.clipboard.writeText(packet.id.toString());
    }
    setContextMenu(null);
  };

  const handleHidePacketName = (name: string) => {
    if (!hiddenNames.includes(name)) {
      setHiddenNames(prev => [...prev, name]);
    }
    setContextMenu(null);
  };

  const handleUnhidePacketName = (name: string) => {
    setHiddenNames(prev => prev.filter(n => n !== name));
  };

  const handleUnhideAll = () => {
    setHiddenNames([]);
  };

  const handleClear = async () => {
    setPackets([]);
    setSelectedPacket(null);
    globalPacketIndexRef.current = 0;
    // Clear persisted packets from IndexedDB
    try {
      await flushWriteBuffer();
      console.log(`Clearing packets for database: ${currentDatabase}`);
      await clearAllPackets();
      await refreshStorageStats();
      console.log('Cleared all persisted packets from IndexedDB.');
    } catch (err) {
      console.error('Failed to clear IndexedDB:', err);
    }
  };

  const stopMonitoring = async () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsMonitoring(false);

    // Hit the backend stop endpoint
    try {
      const baseUrl = serverAddress.replace(/\/$/, "");
      await fetch(`${baseUrl}/api/stop`);
    } catch (err) {
      console.error("Failed to call stop API:", err);
    }
  };

  const startMonitoring = (address: string) => {
    // Close existing if any
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    try {
      // Normalize address (remove trailing slash)
      const baseUrl = address.replace(/\/$/, "");

      // Trigger backend start
      fetch(`${baseUrl}/api/start`).catch(err => {
        console.error("Failed to start backend capture:", err);
        alert("Failed to start backend capture. Ensure the server is running.");
      });

      const es = new EventSource(`${baseUrl}/api/stream`);

      es.addEventListener("packetNotify", (e) => {
        try {
          const packetData = JSON.parse(e.data);
          const currentIndex = globalPacketIndexRef.current++;

          const decodeBase64ToBytes = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
          const base64ByteLength = (b64?: string) => {
            if (!b64) return 0;
            try {
              return decodeBase64ToBytes(b64).length;
            } catch {
              return b64.length;
            }
          };

          // Logic: Prioritize Binary -> Proto Decode. Fallback -> JSON data.
          let finalDataStr = "";
          let finalSource: 'BINARY' | 'JSON' = 'JSON';
          let decodedSuccess = false;

          const protoName = cmdIdToMessageMapRef.current[packetData.packetId] || packetData.packetName;
          const packetSource = (packetData.source?.toUpperCase() === 'CLIENT' ? 'CLIENT' : 'SERVER') as Packet['source'];

          if (packetData.binary && protoName) {
            try {
              // Decode binary using protobuf
              const buffer = decodeBase64ToBytes(packetData.binary);
              const Message = protoRootRef.current.lookupType(protoName);
              const decodedMessage = Message.decode(buffer).toJSON();
              finalDataStr = JSON.stringify(decodedMessage);
              finalSource = 'BINARY';
              decodedSuccess = true;
            } catch (error) {
              console.error("Proto decode failed:", error);
            }
          }

          if (!decodedSuccess) {
            // Fallback to JSON data
            if (packetData.data) {
              if (typeof packetData.data === 'string') {
                finalDataStr = packetData.data;
              } else {
                finalDataStr = JSON.stringify(packetData.data);
              }
              finalSource = 'JSON';
            }
          }

          let subPackets: Packet[] | undefined;
          const getFirstArrayProp = (obj: any, keys: string[]) => {
            if (!obj || typeof obj !== 'object') return null;
            for (const k of keys) {
              const v = obj[k];
              if (Array.isArray(v)) return v;
            }
            return null;
          };
          const getBase64String = (v: any): string | undefined => {
            if (typeof v === 'string') return v;
            if (!v || typeof v !== 'object') return undefined;
            const candidates = ['base64', 'b64', 'data', 'value'];
            for (const k of candidates) {
              if (typeof v[k] === 'string') return v[k];
            }
            return undefined;
          };
          if (currentGameType === GAME_GI && (protoName === 'UnionCmdNotify' || protoName === 'CombatInvocationsNotify') && finalDataStr) {
            try {
              const parsed = JSON.parse(finalDataStr);
              if (protoName === 'UnionCmdNotify') {
                const cmdList = getFirstArrayProp(parsed, ['cmdList', 'cmdListList', 'cmd_list']);
                if (cmdList && cmdList.length > 0) {
                  const subs: Packet[] = [];
                  for (const sub of cmdList) {
                    try {
                      const subId = Number(sub.messageId);
                      const subBinary = getBase64String(sub.body);
                      if (!subBinary) continue;
                      const subProtoName = cmdIdToMessageMapRef.current[subId];
                      let subDataStr = "";
                      let subSource: 'BINARY' | 'JSON' = 'JSON';
                      if (subProtoName) {
                        try {
                          const subBuf = decodeBase64ToBytes(subBinary);
                          const SubMessage = protoRootRef.current.lookupType(subProtoName);
                          const subDecoded = SubMessage.decode(subBuf).toJSON();
                          subDataStr = JSON.stringify(subDecoded);
                          subSource = 'BINARY';
                        } catch {
                          subDataStr = JSON.stringify(sub);
                          subSource = 'JSON';
                        }
                      } else {
                        subDataStr = JSON.stringify(sub);
                        subSource = 'JSON';
                      }
                      subs.push({
                        timestamp: new Date(packetData.time || Date.now()).toLocaleTimeString(),
                        source: packetSource === 'CLIENT' ? 'SUB_CLIENT' : 'SUB_SERVER',
                        id: subId,
                        packetName: subProtoName || 'Unknown',
                        length: base64ByteLength(subBinary),
                        index: globalPacketIndexRef.current++,
                        data: subDataStr,
                        binary: subBinary,
                        dataSource: subSource
                      });
                    } catch {}
                  }
                  if (subs.length > 0) subPackets = subs;
                }
              } else if (protoName === 'CombatInvocationsNotify') {
                const list = getFirstArrayProp(parsed, ['invokeList', 'invokeListList', 'invoke_list']);
                if (list && list.length > 0) {
                  const subs: Packet[] = [];
                  for (const inv of list) {
                    try {
                      const argType: string = String(inv.argumentType || '');
                      const forwardType: string = String(inv.forwardType || '');
                      const subBinary = getBase64String(inv.combatData);
                      if (!subBinary) continue;
                      const mappedName = COMBAT_ARG_TYPE_TO_MESSAGE[argType];
                      const guessName = mappedName || argType || 'Unknown';
                      let decodedObj: any = null;
                      let subSource: 'BINARY' | 'JSON' = 'JSON';
                      try {
                        const buf = decodeBase64ToBytes(subBinary);
                        if (mappedName) {
                          const Msg = protoRootRef.current.lookupType(mappedName);
                          decodedObj = Msg.decode(buf).toJSON();
                          subSource = 'BINARY';
                        } else {
                          decodedObj = { unknownDecoded: decodeUnknownProtobuf(buf) };
                          subSource = 'BINARY';
                        }
                      } catch {
                        decodedObj = inv;
                        subSource = 'JSON';
                      }
                      subs.push({
                        timestamp: new Date(packetData.time || Date.now()).toLocaleTimeString(),
                        source: packetSource === 'CLIENT' ? 'SUB_CLIENT' : 'SUB_SERVER',
                        id: 0,
                        packetName: guessName,
                        length: base64ByteLength(subBinary),
                        index: globalPacketIndexRef.current++,
                        data: JSON.stringify({ argumentType: argType, forwardType: forwardType, payload: decodedObj }),
                        binary: subBinary,
                        dataSource: subSource
                      });
                    } catch {}
                  }
                  if (subs.length > 0) subPackets = subs;
                }
              }
            } catch {}
          }

          const newPacket: Packet = {
            timestamp: new Date(packetData.time || Date.now()).toLocaleTimeString(),
            source: packetSource,
            id: packetData.packetId,
            packetName: protoName || 'Unknown',
            length: (() => {
              try {
                if (packetData.binary) {
                  const buf = decodeBase64ToBytes(packetData.binary);
                  return buf.length;
                }
              } catch {}
              return packetData.length || (packetData.binary ? packetData.binary.length : 0);
            })(),
            index: currentIndex,
            data: finalDataStr,
            binary: packetData.binary,
            dataSource: finalSource,
            subPackets
          };

          setPackets(prev => [...prev, newPacket]);

            // Persist to IndexedDB via batched write buffer
            queuePacketSave(newPacket, refreshStorageStats);
        } catch (err) {
          console.error("Error parsing stream packet:", err);
        }
      });

      es.onerror = (err) => {
        console.error("EventSource failed:", err);
        es.close();
        setIsMonitoring(false);
        eventSourceRef.current = null;
        alert("Connection lost or failed to connect.");
      };

      eventSourceRef.current = es;
      setIsMonitoring(true);

    } catch (e) {
      console.error("Error initiating stream:", e);
      alert("Invalid URL or connection error.");
    }
  };

  const handleStartButton = () => {
    if (isMonitoring) {
      stopMonitoring();
    } else {
      setIsServerModalOpen(true);
    }
  };

  const handleConnect = (address: string) => {
    setServerAddress(address);
    localStorage.setItem('packet_monitor_server_address', address);
    setIsServerModalOpen(false);
    startMonitoring(address);
  };

  const handleProtoUpload = (protoText: string): { success: boolean; mappingCount: number; error?: string } => {
    const protoKey = currentDatabase === 'default' ? 'protoFileContent' : `protoFileContent_${currentDatabase}`;
    localStorage.setItem(protoKey, protoText);
    return rebuildFromProto(protoText);
  };

  const handleSave = () => {
    const jsonString = JSON.stringify(packets, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `packets_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleSelectDatabase = async (name: string) => {
    // Flush current write buffer before switching
    await flushWriteBuffer();
    
    // Load hidden names for the new database
    const hiddenKey = name === 'default' ? 'packet_monitor_hidden_names' : `packet_monitor_hidden_names_${name}`;
    const savedHidden = localStorage.getItem(hiddenKey);
    const newHiddenNames = savedHidden ? JSON.parse(savedHidden) : [];
    
    // Update state in batch (React 18 handles this automatically in async functions too)
    setHiddenNames(newHiddenNames);
    setCurrentDatabase(name);
    localStorage.setItem('packet_monitor_current_db', name);
    setIsDatabaseModalOpen(false);
  };

  const handleCreateDatabase = async (name: string, gameType: number) => {
    const newDbs = [...databases, { name, gameType }];
    setDatabases(newDbs);
    localStorage.setItem('packet_monitor_databases', JSON.stringify(newDbs));
    await handleSelectDatabase(name);
  };

  return (
    <div className="app-container" style={{ userSelect: isResizing ? 'none' : 'auto', cursor: isResizing ? 'col-resize' : 'default' }} onMouseMove={(e) => {
      if (isResizing) {
        const newWidth = window.innerWidth - e.clientX;
        // Clamp width
        if (newWidth > 300 && newWidth < window.innerWidth - 300) {
          setPacketDetailWidth(newWidth);
        }
      }
    }} onMouseUp={() => setIsResizing(false)} onMouseLeave={() => setIsResizing(false)}>
      <Sidebar
        onFilterClick={() => setIsFilterSettingsOpen(true)}
        onClear={handleClear}
        onStart={handleStartButton}
        isMonitoring={isMonitoring}
        onProtoClick={() => setIsProtoModalOpen(true)}
        onJsonClick={() => setIsJsonModalOpen(true)}
        onPcapClick={() => setIsPcapModalOpen(true)}
        onDatabaseClick={() => setIsDatabaseModalOpen(true)}
        autoScroll={autoScroll}
        onAutoScrollToggle={() => setAutoScroll(!autoScroll)}
        onSave={handleSave}
      />
      <div className="main-content" style={{ flex: 1, marginRight: 0 }}>
        <div className="top-bar">
          <svg className="search-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" /></svg>
          <div className="search-group">
            <select
              value={searchScope}
              onChange={(e) => setSearchScope(e.target.value as any)}
              className="search-scope-select"
            >
              <option value="ALL">All</option>
              <option value="NAME">Name</option>
              <option value="ID">ID</option>
              <option value="SEQ">Seq</option>
              <option value="CONTENT">Content</option>
            </select>
            <input
              type="text"
              placeholder={`Search ${searchScope === 'ALL' ? 'Name, ID, Seq, Content' : searchScope}...`}
              className="search-input-main"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Storage Stats */}
          <div className="storage-stats" title={`Storage: ${formatBytes(storageUsage)} / ${formatBytes(storageQuota)}`}>
            <svg className="storage-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2 20h20v-4H2v4zm2-3h2v2H4v-2zM2 4v4h20V4H2zm4 3H4V5h2v2zm-4 7h20v-4H2v4zm2-3h2v2H4v-2z" />
            </svg>
            <div className="storage-bar-container">
              <div
                className="storage-bar-fill"
                style={{
                  width: storageQuota > 0 ? `${Math.min((storageUsage / storageQuota) * 100, 100)}%` : '0%',
                  backgroundColor: storageQuota > 0 && (storageUsage / storageQuota) > 0.9 ? '#f87171' :
                                   storageQuota > 0 && (storageUsage / storageQuota) > 0.7 ? '#fbbf24' : '#4ade80',
                }}
              />
            </div>
            <span className="storage-text">
              {formatBytes(storageUsage)} / {formatBytes(storageQuota)}
            </span>
          </div>
        </div>

        {packets.length > 0 ? (
          <PacketTable
            packets={filteredPackets}
            selectedPacket={selectedPacket}
            onSelectPacket={setSelectedPacket}
            onRowContextMenu={handleRowContextMenu}
            autoScroll={autoScroll}
            searchTerm={searchTerm}
            filterVersion={hiddenNames.length}
          />
        ) : (
          <div className="empty-state" style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100%',
            color: '#888',
            flexDirection: 'column'
          }}>
            <h2>Please upload JSON or Start Monitoring</h2>
            <p style={{ marginTop: '10px', fontSize: '0.9em' }}>Click the upload icon or play button to get started.</p>
          </div>
        )}
      </div>

      <div
        className="resizer"
        onMouseDown={() => setIsResizing(true)}
        style={{
          width: '4px',
          cursor: 'col-resize',
          backgroundColor: isResizing ? '#007acc' : 'transparent',
          zIndex: 10
        }}
      />

      <div style={{ width: packetDetailWidth, minWidth: '300px', display: 'flex', flexDirection: 'column' }}>
        <PacketDetail packet={selectedPacket} />
      </div>

      {contextMenu && (
        <div
          className="context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.type === 'name' && (
            <>
              {contextMenu.packet.packetName && (
                <div
                  className="context-menu-item"
                  onClick={() => handleHidePacketName(contextMenu.packet.packetName)}
                >
                  Hide "{contextMenu.packet.packetName}"
                </div>
              )}
              <div
                className="context-menu-item"
                onClick={() => handleCopyName(contextMenu.packet)}
              >
                Copy as Name
              </div>
              <div
                className="context-menu-item"
                onClick={() => handleCopyId(contextMenu.packet)}
              >
                Copy as CmdId
              </div>
            </>
          )}
          {contextMenu.type === 'data' && (
            <>
              <div className="context-menu-item" onClick={() => handleCopyJson(contextMenu.packet, true)}>
                Copy as Json (Pretty)
              </div>
              <div className="context-menu-item" onClick={() => handleCopyJson(contextMenu.packet, false)}>
                Copy as Json (Min)
              </div>
              <div className="context-menu-item" onClick={() => handleCopyBinary(contextMenu.packet)}>
                Copy as Binary (Base64)
              </div>
            </>
          )}
        </div>
      )}

      {isFilterSettingsOpen && (
        <FilterSettings
          hiddenNames={hiddenNames}
          onUnhide={handleUnhidePacketName}
          onUnhideAll={handleUnhideAll}
          onClose={() => setIsFilterSettingsOpen(false)}
        />
      )}

      <ServerModal
        isOpen={isServerModalOpen}
        onClose={() => setIsServerModalOpen(false)}
        onConnect={handleConnect}
        initialAddress={serverAddress}
      />

      <ProtoUploadModal
        isOpen={isProtoModalOpen}
        onClose={() => setIsProtoModalOpen(false)}
        onProtoUploaded={handleProtoUpload}
      />

      <JsonUploadModal
        isOpen={isJsonModalOpen}
        onClose={() => setIsJsonModalOpen(false)}
        onJsonUploaded={handleUpload}
      />

      <PcapUploadModal
        isOpen={isPcapModalOpen}
        onClose={() => setIsPcapModalOpen(false)}
        serverAddress={serverAddress}
        isMonitoring={isMonitoring}
      />

      <DatabaseModal
        isOpen={isDatabaseModalOpen}
        onClose={() => setIsDatabaseModalOpen(false)}
        databases={databases}
        currentDatabase={currentDatabase}
        onSelectDatabase={handleSelectDatabase}
        onCreateDatabase={handleCreateDatabase}
      />
    </div>
  );

}

export default App;
