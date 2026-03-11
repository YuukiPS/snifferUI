import React, { useState, useMemo, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Packet } from '../types';
import './PacketTable.css';

interface PacketTableProps {
    packets: Packet[];
    selectedPacket: Packet | null;
    onSelectPacket: (packet: Packet) => void;
    onRowContextMenu: (event: React.MouseEvent, packet: Packet, type: 'name' | 'data') => void;
    autoScroll?: boolean;
    searchTerm?: string;
    filterVersion?: number;
}

export interface PacketTableRef {
    scrollToBottom: () => void;
}

type SortKey = 'timestamp' | 'index' | 'id' | 'packetName' | 'length' | 'dataSource';


export const PacketTable = forwardRef<PacketTableRef, PacketTableProps>(({ packets, selectedPacket, onSelectPacket, onRowContextMenu, autoScroll = false, searchTerm = '', filterVersion = 0 }, ref) => {
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
        key: 'index',
        direction: 'asc'
    });
    const [expandedParentIndex, setExpandedParentIndex] = useState<number | null>(null);

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
                case 'dataSource':
                    aValue = a.dataSource || '';
                    bValue = b.dataSource || '';
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

    type Row =
        | { kind: 'packet'; packet: Packet }
        | { kind: 'sub'; packet: Packet; parent: Packet; subPos: number };

    const rows = useMemo<Row[]>(() => {
        const out: Row[] = [];
        for (const p of sortedPackets) {
            out.push({ kind: 'packet', packet: p });
            if (expandedParentIndex === p.index && p.subPackets && p.subPackets.length > 0) {
                for (let i = 0; i < p.subPackets.length; i++) {
                    out.push({ kind: 'sub', packet: p.subPackets[i], parent: p, subPos: i });
                }
            }
        }
        return out;
    }, [sortedPackets, expandedParentIndex]);

    const virtualizer = useVirtualizer({
        count: rows.length,
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

    // When the search or filter changes, scroll to keep the selected packet visible
    const prevSearchRef = useRef(searchTerm);
    const prevFilterRef = useRef(filterVersion);

    useEffect(() => {
        const searchChanged = prevSearchRef.current !== searchTerm;
        const filterChanged = prevFilterRef.current !== filterVersion;
        prevSearchRef.current = searchTerm;
        prevFilterRef.current = filterVersion;

        if (!selectedPacket || (!searchChanged && !filterChanged)) return;

        const selectedIndex = rows.findIndex(r => r.packet === selectedPacket);
        if (selectedIndex >= 0) {
            // Delay to let the virtualizer recalculate after the list change
            setTimeout(() => {
                virtualizer.scrollToIndex(selectedIndex, { align: 'center', behavior: 'auto' });
            }, 50);
        }
    }, [searchTerm, filterVersion, rows, selectedPacket, virtualizer]);

    // Auto-scroll when packets change and autoScroll is enabled
    // Use a timeout to debounce rapid updates
    useEffect(() => {
        if (!autoScroll || packets.length === 0) return;

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

    const handleRowClick = (row: Row) => {
        if (row.kind === 'packet') {
            if (row.packet.subPackets && row.packet.subPackets.length > 0) {
                setExpandedParentIndex(current => (current === row.packet.index ? null : row.packet.index));
            } else {
                setExpandedParentIndex(null);
            }
            onSelectPacket(row.packet);
        } else {
            setExpandedParentIndex(row.parent.index);
            onSelectPacket(row.packet);
        }
    };

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
        onRowContextMenu(e, packet, 'name');
    };

    const handleDataContextMenu = (e: React.MouseEvent, packet: Packet) => {
        e.preventDefault();
        onRowContextMenu(e, packet, 'data');
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
                    <div className="header-cell" style={{ width: '80px' }} onClick={() => handleSort('dataSource')}>
                        Data Src{getSortIndicator('dataSource')}
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
                        const row = rows[virtualRow.index];
                        const packet = row.packet;
                        const isSub = row.kind === 'sub';
                        const displayIndex = isSub ? `${row.parent.index}.${row.subPos + 1}` : String(packet.index);
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
                                className={`virtual-row ${isSub ? 'sub' : ''} ${selectedPacket === packet ? 'selected' : ''}`}
                                onClick={() => handleRowClick(row)}
                            >
                                <div className="virtual-cell font-mono text-sm" style={{ width: '140px' }}>
                                    {packet.timestamp}
                                </div>
                                <div className="virtual-cell text-right text-sm" style={{ width: '60px' }}>
                                    {displayIndex}
                                </div>
                                <div className="virtual-cell text-center" style={{ width: '100px' }}>
                                    <span className={`source-badge ${packet.source.toLowerCase()}`}>
                                        {packet.source.replace('_', '+')}
                                    </span>
                                </div>
                                <div className="virtual-cell text-center" style={{ width: '80px' }}>
                                    {packet.dataSource && (
                                        <span className={`source-badge ${(packet.dataSource || '').toLowerCase()}`}>
                                            {packet.dataSource}
                                        </span>
                                    )}
                                </div>
                                <div className="virtual-cell text-right font-mono text-sm" style={{ width: '80px' }}>
                                    {isSub && packet.id === 0 ? '' : packet.id}
                                </div>
                                <div
                                    className="virtual-cell font-mono text-accent"
                                    style={{ width: '200px', cursor: 'context-menu', paddingLeft: isSub ? '22px' : undefined }}
                                    onContextMenu={(e) => handleNameContextMenu(e, packet)}
                                >
                                    {isSub
                                        ? `↳ ${packet.packetName}`
                                        : (() => {
                                            const count = (packet.subPackets && packet.subPackets.length) || 0;
                                            const hasSubs = count > 0;
                                            const arrow = hasSubs ? (expandedParentIndex === packet.index ? '▼' : '▶') : '';
                                            return `${arrow ? arrow + ' ' : ''}${packet.packetName}${hasSubs ? ` (${count})` : ''}`;
                                        })()
                                    }
                                </div>
                                <div className="virtual-cell text-right font-mono text-sm" style={{ width: '80px' }}>
                                    {packet.length}
                                </div>
                                <div
                                    className="virtual-cell font-mono text-xs"
                                    style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'context-menu' }}
                                    onContextMenu={(e) => handleDataContextMenu(e, packet)}
                                >
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
