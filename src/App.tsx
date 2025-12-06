import { useState, useMemo, useEffect } from 'react';
import './App.css';
import { Sidebar } from './components/Sidebar';
import { PacketTable } from './components/PacketTable';
import { PacketDetail } from './components/PacketDetail';
import { FilterSettings } from './components/FilterSettings';
import type { Packet } from './types';

function App() {
  const [packets, setPackets] = useState<Packet[]>([]);
  const [selectedPacket, setSelectedPacket] = useState<Packet | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [hiddenNames, setHiddenNames] = useState<string[]>([]);
  const [isFilterSettingsOpen, setIsFilterSettingsOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, packetName: string } | null>(null);

  useEffect(() => {
    const handleClick = () => {
      if (contextMenu) setContextMenu(null);
    };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [contextMenu]);

  const handleUpload = (data: any[]) => {
    try {
      const mappedPackets: Packet[] = data.map((item: any, index: number) => {
        let parsedData = item.data;
        if (typeof item.data === 'string') {
          try {
            parsedData = JSON.parse(item.data);
          } catch (e) {
            console.error('Failed to parse inner data JSON for packet', item.packetId, e);
            parsedData = item.data; // Fallback to string
          }
        }

        return {
          timestamp: new Date(item.time).toLocaleTimeString(),
          source: (item.source?.toUpperCase() === 'CLIENT' ? 'CLIENT' : 'SERVER'),
          id: item.packetId,
          packetName: item.packetName,
          length: item.length,
          index: index,
          data: parsedData
        };
      });
      setPackets(mappedPackets);
    } catch (error) {
      console.error("Error processing uploaded data:", error);
      alert("Error processing uploaded data. Please check the console.");
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

  return (
    <div className="app-container">
      <Sidebar
        onUpload={handleUpload}
        onFilterClick={() => setIsFilterSettingsOpen(true)}
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
            <h2>Please upload JSON</h2>
            <p style={{ marginTop: '10px', fontSize: '0.9em' }}>Click the upload icon in the sidebar to get started.</p>
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
    </div>
  );
}

export default App;
