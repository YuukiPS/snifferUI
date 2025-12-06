import React from 'react';
import type { Packet } from '../types';
import './PacketTable.css';

interface PacketTableProps {
    packets: Packet[];
    selectedPacket: Packet | null;
    onSelectPacket: (packet: Packet) => void;
}

export const PacketTable: React.FC<PacketTableProps> = ({ packets, selectedPacket, onSelectPacket }) => {
    return (
        <div className="packet-table-container">
            <table className="packet-table">
                <thead>
                    <tr>
                        <th style={{ width: '140px' }}>Time</th>
                        <th style={{ width: '60px' }}>#</th>
                        <th style={{ width: '100px' }}>Source</th>
                        <th style={{ width: '80px' }}>ID</th>
                        <th style={{ width: '200px' }}>Packet Name</th>
                        <th style={{ width: '80px' }}>Length</th>
                        <th>Data</th>
                    </tr>
                </thead>
                <tbody>
                    {packets.map((packet, index) => (
                        <tr
                            key={index}
                            className={selectedPacket === packet ? 'selected' : ''}
                            onClick={() => onSelectPacket(packet)}
                        >
                            <td className="font-mono text-sm">{packet.timestamp}</td>
                            <td className="text-right text-sm">{packet.id}</td>
                            <td className="text-center">
                                <span className={`source-badge ${packet.source.toLowerCase()}`}>
                                    {packet.source}
                                </span>
                            </td>
                            <td className="text-right font-mono text-sm">{packet.id % 1000}</td>
                            <td className="font-mono text-accent">{packet.packetName}</td>
                            <td className="text-right font-mono text-sm">{packet.length}</td>
                            <td className="font-mono text-xs text-muted truncate">
                                {JSON.stringify(packet.data)}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};
