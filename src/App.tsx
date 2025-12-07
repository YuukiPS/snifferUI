import { useState, useMemo, useEffect, useRef } from 'react';
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

function App() {
  const [packets, setPackets] = useState<Packet[]>([]);
  const [selectedPacket, setSelectedPacket] = useState<Packet | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [hiddenNames, setHiddenNames] = useState<string[]>([]);
  const [isFilterSettingsOpen, setIsFilterSettingsOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, packetName: string } | null>(null);
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
  const globalPacketIndexRef = useRef(0);

  // Auto-scroll state
  const [autoScroll, setAutoScroll] = useState(false);

  useEffect(() => {
    const handleClick = () => {
      if (contextMenu) setContextMenu(null);
    };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [contextMenu]);

  // Load saved proto on mount
  useEffect(() => {
    const savedProto = localStorage.getItem("protoFileContent");
    if (savedProto) {
      console.log("Found saved proto file. Rebuilding proto...");
      rebuildFromProto(savedProto);
    }
  }, []);

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
      result = result.filter(p =>
        p.packetName.toLowerCase().includes(term) ||
        p.id.toString().includes(term) ||
        JSON.stringify(p.data).toLowerCase().includes(term)
      );
    }

    return result;
  }, [packets, searchTerm, hiddenNames]);

  const handleRowContextMenu = (event: React.MouseEvent, packet: Packet) => {
    event.preventDefault(); // Prevent native context menu just in case, though PacketTable handles it
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      packetName: packet.packetName
    });
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

  const handleClear = () => {
    setPackets([]);
    setSelectedPacket(null);
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

          const protoName = cmdIdToMessageMap[packetData.packetId] || packetData.packetName;

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
    <div className="app-container">
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
      <div className="main-content">
        <div className="top-bar">
          <svg className="search-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" /></svg>
          <div className="search-group">
            <input
              type="text"
              placeholder="Search Name, ID, JSON..."
              className="search-input-main"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button className="filter-btn">AND</button>
          <button className="filter-btn" style={{ backgroundColor: '#333' }}>OR</button>
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
      <PacketDetail packet={selectedPacket} />

      {contextMenu && (
        <div
          className="context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="context-menu-item"
            onClick={() => handleHidePacketName(contextMenu.packetName)}
          >
            Hide "{contextMenu.packetName}"
          </div>
        </div>
      )}

      {isFilterSettingsOpen && (
        <FilterSettings
          hiddenNames={hiddenNames}
          onUnhide={handleUnhidePacketName}
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
