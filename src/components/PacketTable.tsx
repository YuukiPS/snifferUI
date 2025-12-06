import React, { useState, useMemo, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Packet } from '../types';
import './PacketTable.css';

interface PacketTableProps {
    packets: Packet[];
    selectedPacket: Packet | null;
    onSelectPacket: (packet: Packet) => void;
    onRowContextMenu: (event: React.MouseEvent, packet: Packet) => void;
    autoScroll?: boolean;
}

export interface PacketTableRef {
    scrollToBottom: () => void;
}

type SortKey = 'timestamp' | 'index' | 'id' | 'packetName' | 'length';


export const PacketTable = forwardRef<PacketTableRef, PacketTableProps>(({ packets, selectedPacket, onSelectPacket, onRowContextMenu, autoScroll = false }, ref) => {
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
        key: 'index',
        direction: 'asc'
    });

    const parentRef = useRef<HTMLDivElement>(null);

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

    const virtualizer = useVirtualizer({
        count: sortedPackets.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 40,
        overscan: 5,
    });

    // Expose scrollToBottom method via ref
    useImperativeHandle(ref, () => ({
        scrollToBottom: () => {
            const scrollElement = parentRef.current;
            if (scrollElement) {
                scrollElement.scrollTop = scrollElement.scrollHeight;
            }
        }
    }));

    // Auto-scroll when packets change and autoScroll is enabled
    // Use a timeout to debounce rapid updates
    useEffect(() => {
        if (!autoScroll || sortedPackets.length === 0) return;

        const timeoutId = setTimeout(() => {
            const scrollElement = parentRef.current;
            if (scrollElement) {
                // Scroll to bottom smoothly
                scrollElement.scrollTo({
                    top: scrollElement.scrollHeight,
                    behavior: 'auto' // Use 'auto' instead of 'smooth' for better performance
                });
            }
        }, 50); // Small delay to batch rapid updates

        return () => clearTimeout(timeoutId);
    }, [packets.length, autoScroll]);

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

    const handleNameContextMenu = (e: React.MouseEvent, packet: Packet) => {
        e.preventDefault();
        onRowContextMenu(e, packet);
    };

    return (
        <div className="packet-table-container">
            <div className="packet-table-header">
                <div className="header-row">
                    <div className="header-cell" style={{ width: '140px' }} onClick={() => handleSort('timestamp')}>
                        Time{getSortIndicator('timestamp')}
                    </div>
                    <div className="header-cell" style={{ width: '60px' }} onClick={() => handleSort('index')}>
                        #{getSortIndicator('index')}
                    </div>
                    <div className="header-cell" style={{ width: '100px' }}>
                        Source
                    </div>
                    <div className="header-cell" style={{ width: '80px' }} onClick={() => handleSort('id')}>
                        ID{getSortIndicator('id')}
                    </div>
                    <div className="header-cell" style={{ width: '200px' }} onClick={() => handleSort('packetName')}>
                        Packet Name{getSortIndicator('packetName')}
                    </div>
                    <div className="header-cell" style={{ width: '80px' }} onClick={() => handleSort('length')}>
                        Length{getSortIndicator('length')}
                    </div>
                    <div className="header-cell" style={{ flex: 1 }}>
                        Data
                    </div>
                </div>
            </div>
            <div ref={parentRef} className="virtual-list" style={{ height: 'calc(100vh - 90px)', overflow: 'auto' }}>
                <div
                    style={{
                        height: `${virtualizer.getTotalSize()}px`,
                        width: '100%',
                        position: 'relative',
                    }}
                >
                    {virtualizer.getVirtualItems().map((virtualRow) => {
                        const packet = sortedPackets[virtualRow.index];
                        return (
                            <div
                                key={virtualRow.key}
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    height: `${virtualRow.size}px`,
                                    transform: `translateY(${virtualRow.start}px)`,
                                }}
                                className={`virtual-row ${selectedPacket === packet ? 'selected' : ''}`}
                                onClick={() => onSelectPacket(packet)}
                            >
                                <div className="virtual-cell font-mono text-sm" style={{ width: '140px' }}>
                                    {packet.timestamp}
                                </div>
                                <div className="virtual-cell text-right text-sm" style={{ width: '60px' }}>
                                    {packet.index}
                                </div>
                                <div className="virtual-cell text-center" style={{ width: '100px' }}>
                                    <span className={`source-badge ${packet.source.toLowerCase()}`}>
                                        {packet.source}
                                    </span>
                                </div>
                                <div className="virtual-cell text-right font-mono text-sm" style={{ width: '80px' }}>
                                    {packet.id}
                                </div>
                                <div
                                    className="virtual-cell font-mono text-accent"
                                    style={{ width: '200px', cursor: 'context-menu' }}
                                    onContextMenu={(e) => handleNameContextMenu(e, packet)}
                                >
                                    {packet.packetName}
                                </div>
                                <div className="virtual-cell text-right font-mono text-sm" style={{ width: '80px' }}>
                                    {packet.length}
                                </div>
                                <div className="virtual-cell font-mono text-xs" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {typeof packet.data === 'string' ? packet.data : JSON.stringify(packet.data)}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
});

PacketTable.displayName = 'PacketTable';
