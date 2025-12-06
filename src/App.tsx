import { useState, useEffect, useMemo } from 'react';
import './App.css';
import { Sidebar } from './components/Sidebar';
import { PacketTable } from './components/PacketTable';
import { PacketDetail } from './components/PacketDetail';
import { generateMockPackets } from './utils/mockData';
import type { Packet } from './types';

function App() {
  const [packets, setPackets] = useState<Packet[]>([]);
  const [selectedPacket, setSelectedPacket] = useState<Packet | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    // Simulate loading data
    const data = generateMockPackets(100);
    setPackets(data);
  }, []);

  const filteredPackets = useMemo(() => {
    if (!searchTerm) return packets;
    const term = searchTerm.toLowerCase();
    return packets.filter(p =>
      p.packetName.toLowerCase().includes(term) ||
      p.id.toString().includes(term) ||
      JSON.stringify(p.data).toLowerCase().includes(term)
    );
  }, [packets, searchTerm]);

  return (
    <div className="app-container">
      <Sidebar />
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
        <PacketTable
          packets={filteredPackets}
          selectedPacket={selectedPacket}
          onSelectPacket={setSelectedPacket}
        />
      </div>
      <PacketDetail packet={selectedPacket} />
    </div>
  );
}

export default App;
