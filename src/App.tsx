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
import type { Packet } from './types';
import {
  savePackets,
  loadAllPackets,
  clearAllPackets,
  queuePacketSave,
  flushWriteBuffer,
  getStorageEstimate,
  formatBytes,
} from './utils/packetStorage';

function App() {
  const [packets, setPackets] = useState<Packet[]>([]);
  const [selectedPacket, setSelectedPacket] = useState<Packet | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchScope, setSearchScope] = useState<'ALL' | 'NAME' | 'ID' | 'SEQ' | 'CONTENT'>('ALL');
  const [hiddenNames, setHiddenNames] = useState<string[]>(() => {
    const saved = localStorage.getItem('packet_monitor_hidden_names');
    return saved ? JSON.parse(saved) : [];
  });
  const [isFilterSettingsOpen, setIsFilterSettingsOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, type: 'name' | 'data', packet: Packet } | null>(null);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const [isServerModalOpen, setIsServerModalOpen] = useState(false);
  const [isProtoModalOpen, setIsProtoModalOpen] = useState(false);
  const [isJsonModalOpen, setIsJsonModalOpen] = useState(false);
  const [isPcapModalOpen, setIsPcapModalOpen] = useState(false);
  const [serverAddress, setServerAddress] = useState(() => {
    return localStorage.getItem('packet_monitor_server_address') || "http://localhost:1985";
  });

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

  // Load packets from IndexedDB on mount, then check server status
  useEffect(() => {
    const init = async () => {
      // 1. Restore persisted packets
      try {
        const stored = await loadAllPackets();
        if (stored.length > 0) {
          setPackets(stored);
          // Restore the global index counter so new packets don't collide
          const maxIndex = stored.reduce((max, p) => Math.max(max, p.index), 0);
          globalPacketIndexRef.current = maxIndex + 1;
          console.log(`Restored ${stored.length} packets from IndexedDB (next index: ${globalPacketIndexRef.current})`);
        }
      } catch (err) {
        console.warn('Failed to load packets from IndexedDB:', err);
      }

      // 2. Refresh storage stats
      await refreshStorageStats();

      // 3. Check server status
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
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Periodically refresh storage stats (every 5s)
  useEffect(() => {
    const interval = setInterval(refreshStorageStats, 5000);
    return () => clearInterval(interval);
  }, [refreshStorageStats]);

  // Load saved proto on mount
  useEffect(() => {
    const savedProto = localStorage.getItem("protoFileContent");
    if (savedProto) {
      console.log("Found saved proto file. Rebuilding proto...");
      rebuildFromProto(savedProto);
    }
  }, []);

  // Persist hiddenNames
  useEffect(() => {
    localStorage.setItem('packet_monitor_hidden_names', JSON.stringify(hiddenNames));
  }, [hiddenNames]);

  // Persist autoScroll
  useEffect(() => {
    localStorage.setItem('packet_monitor_auto_scroll', String(autoScroll));
  }, [autoScroll]);

  const rebuildFromProto = (protoText: string): { success: boolean; mappingCount: number; error?: string } => {
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

    // Rebuild existing packets with new proto definitions
    if (packets.length > 0) {
      const updatedPackets = packets.map(packet => {
        const protoName = newMap[packet.id];

        // If we have a matching message in the new proto and binary data, try to decode
        if (protoName && packet.binary) {
          try {
            const buffer = Uint8Array.from(atob(packet.binary), c => c.charCodeAt(0));
            // protoRootRef.current is already updated with the new proto
            const Message = protoRootRef.current.lookupType(protoName); // Note: Type lookup might throw if not found, but we have protoName from newMap which was derived from keys?
            // Wait, newMap contains names. protoRootRef.current might not contain the type if the map parsing logic is simpler than the full proto parse logic 
            // but here we used protobuf.parse first, so protoRootRef should be valid.
            
            const decodedMessage = Message.decode(buffer).toJSON();

            return {
              ...packet,
              packetName: protoName,
              data: JSON.stringify(decodedMessage),
              dataSource: 'BINARY'
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
          source: (item.source?.toUpperCase() === 'CLIENT' ? 'CLIENT' : 'SERVER'),
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
            p.packetName.toLowerCase().includes(term) ||
            p.id.toString().includes(term) ||
            p.index.toString().includes(term) ||
            (typeof p.data === 'string' ? p.data : JSON.stringify(p.data)).toLowerCase().includes(term)
          );
        } else if (searchScope === 'NAME') {
          return p.packetName.toLowerCase().includes(term);
        } else if (searchScope === 'ID') {
          return p.id.toString().includes(term);
        } else if (searchScope === 'SEQ') {
          return p.index.toString().includes(term);
        } else if (searchScope === 'CONTENT') {
          return (typeof p.data === 'string' ? p.data : JSON.stringify(p.data)).toLowerCase().includes(term);
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

  const handleCopyJson = (packet: Packet) => {
    navigator.clipboard.writeText(packet.data);
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
    navigator.clipboard.writeText(packet.packetName);
    setContextMenu(null);
  };

  const handleCopyId = (packet: Packet) => {
    navigator.clipboard.writeText(packet.id.toString());
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

          // Logic: Prioritize Binary -> Proto Decode. Fallback -> JSON data.
          let finalDataStr = "";
          let finalSource: 'BINARY' | 'JSON' = 'JSON';
          let decodedSuccess = false;

          const protoName = cmdIdToMessageMapRef.current[packetData.packetId] || packetData.packetName;

          if (packetData.binary && protoName) {
            try {
              // Decode binary using protobuf
              const buffer = Uint8Array.from(atob(packetData.binary), c => c.charCodeAt(0));
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

          const newPacket: Packet = {
            timestamp: new Date(packetData.time || Date.now()).toLocaleTimeString(),
            source: (packetData.source?.toUpperCase() === 'CLIENT' ? 'CLIENT' : 'SERVER'),
            id: packetData.packetId,
            packetName: protoName || 'Unknown',
            length: packetData.length || (packetData.binary ? packetData.binary.length : 0),
            index: currentIndex,
            data: finalDataStr,
            binary: packetData.binary,
            dataSource: finalSource
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
              <div
                className="context-menu-item"
                onClick={() => handleHidePacketName(contextMenu.packet.packetName)}
              >
                Hide "{contextMenu.packet.packetName}"
              </div>
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
              <div className="context-menu-item" onClick={() => handleCopyJson(contextMenu.packet)}>
                Copy as Json
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
    </div>
  );

}

export default App;
