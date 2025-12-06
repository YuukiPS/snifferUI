import React, { useState, useMemo } from 'react';
import type { Packet } from '../types';
import './PacketTable.css';

interface PacketTableProps {
    packets: Packet[];
    selectedPacket: Packet | null;
    onSelectPacket: (packet: Packet) => void;
}

type SortKey = 'timestamp' | 'index' | 'id' | 'packetName' | 'length';

export const PacketTable: React.FC<PacketTableProps> = ({ packets, selectedPacket, onSelectPacket }) => {
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
        key: 'index',
        direction: 'asc'
    });

    const sortedPackets = useMemo(() => {
        const sorted = [...packets];
        sorted.sort((a, b) => {
            let aValue: any;
            let bValue: any;

            switch (sortConfig.key) {
                case 'index':
                    aValue = a.index;
                    bValue = b.index;
                    break;
                case 'id':
                    aValue = a.id;
                    bValue = b.id;
                    break;
                case 'length':
                    aValue = a.length;
                    bValue = b.length;
                    break;
                case 'packetName':
                    aValue = a.packetName;
                    bValue = b.packetName;
                    break;
                case 'timestamp':
                    // If timestamp strings are comparable directly
                    aValue = a.timestamp;
                    bValue = b.timestamp;
                    break;
                default:
                    return 0;
            }

            if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
        return sorted;
    }, [packets, sortConfig]);

    const handleSort = (key: SortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const getSortIndicator = (key: SortKey) => {
        if (sortConfig.key !== key) return null;
        return <span className="sort-indicator">{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>;
    };

    return (
        <div className="packet-table-container">
            <table className="packet-table">
                <thead>
                    <tr>
                        <th style={{ width: '140px' }} onClick={() => handleSort('timestamp')}>
                            Time{getSortIndicator('timestamp')}
                        </th>
                        <th style={{ width: '60px' }} onClick={() => handleSort('index')}>
                            #{getSortIndicator('index')}
                        </th>
                        <th style={{ width: '100px' }}>Source</th>
                        <th style={{ width: '80px' }} onClick={() => handleSort('id')}>
                            ID{getSortIndicator('id')}
                        </th>
                        <th style={{ width: '200px' }} onClick={() => handleSort('packetName')}>
                            Packet Name{getSortIndicator('packetName')}
                        </th>
                        <th style={{ width: '80px' }} onClick={() => handleSort('length')}>
                            Length{getSortIndicator('length')}
                        </th>
                        <th>Data</th>
                    </tr>
                </thead>
                <tbody>
                    {sortedPackets.map((packet) => (
                        <tr
                            key={packet.index} // Use index as key if it's unique and stable for this view
                            className={selectedPacket === packet ? 'selected' : ''}
                            onClick={() => onSelectPacket(packet)}
                        >
                            <td className="font-mono text-sm">{packet.timestamp}</td>
                            <td className="text-right text-sm">{packet.index}</td>
                            <td className="text-center">
                                <span className={`source-badge ${packet.source.toLowerCase()}`}>
                                    {packet.source}
                                </span>
                            </td>
                            <td className="text-right font-mono text-sm">{packet.id}</td>
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
