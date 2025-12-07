import React, { useState, useMemo } from 'react';
import type { Packet } from '../types';
import './PacketDetail.css';

interface PacketDetailProps {
    packet: Packet | null;
    onClose?: () => void;
}

type ViewMode = 'text' | 'tree' | 'table';

// --- Text View (JSON Syntax Highlighting) ---
const JsonViewer = ({ data }: { data: string }) => {
    // Try to prettify if valid JSON
    const displayData = useMemo(() => {
        try {
            const parsed = JSON.parse(data);
            return JSON.stringify(parsed, null, 2);
        } catch {
            return data;
        }
    }, [data]);

    const highlighted = useMemo(() => {
        return displayData.replace(
            /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
            function (match) {
                let cls = 'json-number';
                if (/^"/.test(match)) {
                    if (/:$/.test(match)) {
                        cls = 'json-key';
                    } else {
                        cls = 'json-string';
                    }
                } else if (/true|false/.test(match)) {
                    cls = 'json-boolean';
                } else if (/null/.test(match)) {
                    cls = 'json-null';
                }
                return '<span class="' + cls + '">' + match + '</span>';
            }
        );
    }, [displayData]);

    return (
        <pre
            className="json-viewer"
            dangerouslySetInnerHTML={{ __html: highlighted }}
        />
    );
};

// --- Tree View ---
const JsonTreeItem = ({ name, value, isLast, level = 0 }: { name?: string, value: any, isLast?: boolean, level?: number }) => {
    const [expanded, setExpanded] = useState(true);
    const isObject = value !== null && typeof value === 'object';
    const isArray = Array.isArray(value);
    const isEmpty = isObject && Object.keys(value).length === 0;

    const toggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        setExpanded(!expanded);
    };

    const renderValue = (val: any) => {
        if (val === null) return <span className="json-null">null</span>;
        if (typeof val === 'boolean') return <span className="json-boolean">{String(val)}</span>;
        if (typeof val === 'number') return <span className="json-number">{val}</span>;
        if (typeof val === 'string') return <span className="json-string">"{val}"</span>;
        return <span>{String(val)}</span>;
    };

    const indent = level * 20;

    if (!isObject) {
        return (
            <div className="tree-line" style={{ paddingLeft: indent }}>
                {name && <span className="json-key">"{name}": </span>}
                {renderValue(value)}
                {!isLast && <span className="json-comma">,</span>}
            </div>
        );
    }

    const keys = Object.keys(value);

    return (
        <div className="tree-node">
            <div className="tree-line" onClick={toggle} style={{ paddingLeft: indent, cursor: 'pointer' }}>
                <span className="tree-toggler" style={{ display: 'inline-block', width: '12px', marginRight: '4px' }}>
                    {isEmpty ? '' : (expanded ? '▼' : '▶')}
                </span>
                {name && <span className="json-key">"{name}": </span>}
                <span className="json-bracket">{isArray ? '[' : '{'}</span>
                {!expanded && !isEmpty && <span className="collapsed-indicator">...</span>}
                {!expanded && <span className="json-bracket">{isArray ? ']' : '}'}</span>}
                {!expanded && !isLast && <span className="json-comma">,</span>}
                {isEmpty && <span className="json-bracket">{isArray ? ']' : '}'}</span>}
                {isEmpty && !isLast && <span className="json-comma">,</span>}
            </div>

            {expanded && !isEmpty && (
                <div className="tree-children">
                    {keys.map((key, i) => (
                        <JsonTreeItem
                            key={key}
                            name={isArray ? undefined : key}
                            value={value[key as keyof typeof value]}
                            isLast={i === keys.length - 1}
                            level={level + 1}
                        />
                    ))}
                    <div className="tree-line" style={{ paddingLeft: indent }}>
                        <span className="json-bracket">{isArray ? ']' : '}'}</span>
                        {!isLast && <span className="json-comma">,</span>}
                    </div>
                </div>
            )}
        </div>
    );
};

const JsonTreeView = ({ data }: { data: any }) => {
    return (
        <div className="json-tree-container">
            <JsonTreeItem value={data} isLast={true} />
        </div>
    );
};

// --- Table View ---
const JsonTableView = ({ data }: { data: any }) => {
    if (data === null || typeof data !== 'object') {
        return <div className="table-message">Data is not an object or array</div>;
    }

    const isArray = Array.isArray(data);

    if (isArray) {
        if (data.length === 0) return <div className="table-message">Empty Array</div>;

        // Find all unique keys from the first few items to build headers
        // Limiting to first 20 items for performance checking keys
        const sampleSize = Math.min(data.length, 20);
        const allKeys = new Set<string>();
        for (let i = 0; i < sampleSize; i++) {
            if (data[i] && typeof data[i] === 'object') {
                Object.keys(data[i]).forEach(k => allKeys.add(k));
            }
        }
        const columns = Array.from(allKeys);

        if (columns.length === 0) {
            // Array of primitives
            return (
                <div className="table-wrapper">
                    <table className="json-table">
                        <thead>
                            <tr>
                                <th>Index</th>
                                <th>Value</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.map((item: any, idx: number) => (
                                <tr key={idx}>
                                    <td>{idx}</td>
                                    <td>{typeof item === 'object' ? JSON.stringify(item) : String(item)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        }

        return (
            <div className="table-wrapper">
                <table className="json-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            {columns.map(col => <th key={col}>{col}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((row: any, idx: number) => (
                            <tr key={idx}>
                                <td>{idx}</td>
                                {columns.map(col => (
                                    <td key={col}>
                                        {row[col] !== undefined
                                            ? (typeof row[col] === 'object' ? JSON.stringify(row[col]) : String(row[col]))
                                            : '-'}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    } else {
        // Single Object
        const keys = Object.keys(data);
        if (keys.length === 0) return <div className="table-message">Empty Object</div>;

        return (
            <div className="table-wrapper">
                <table className="json-table">
                    <thead>
                        <tr>
                            <th>Key</th>
                            <th>Value</th>
                        </tr>
                    </thead>
                    <tbody>
                        {keys.map(key => (
                            <tr key={key}>
                                <td className="key-cell">{key}</td>
                                <td>
                                    {typeof data[key] === 'object'
                                        ? JSON.stringify(data[key])
                                        : String(data[key])}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    }
};

export const PacketDetail: React.FC<PacketDetailProps> = ({ packet }) => {
    const [viewMode, setViewMode] = useState<ViewMode>('text');
    const [searchTerm, setSearchTerm] = useState('');

    const parsedData = useMemo(() => {
        if (!packet) return null;
        try {
            return JSON.parse(packet.data);
        } catch (e) {
            console.error("Failed to parse packet data", e);
            return null;
        }
    }, [packet]);

    if (!packet) {
        return (
            <div className="packet-detail empty">
                <div className="empty-message">Select a packet to view details</div>
            </div>
        );
    }

    // Determine the source info to display
    // Fallback to checking dataSource if sourceInfo is missing (it was recently added in types but might not be in mock/old types completely?)
    // Actually the user said "sourceInfo" in previous turn summary, but checking Packet interface in previous step:
    // 8:     data: string; // JSON string (decode proto data from server side)
    // 9:     binary: string; // raw network data with base64 (need decode proto in client side)
    // 10:    dataSource?: 'BINARY' | 'JSON';
    // Use dataSource as it is in the type definition I read.

    return (
        <div className="packet-detail">
            <div className="detail-header">
                <div className="detail-title">{packet.packetName}</div>
                <div className="detail-toolbar">
                    <button
                        className={`toolbar-btn ${viewMode === 'text' ? 'active' : ''}`}
                        onClick={() => setViewMode('text')}
                    >
                        text
                    </button>
                    <button
                        className={`toolbar-btn ${viewMode === 'tree' ? 'active' : ''}`}
                        onClick={() => setViewMode('tree')}
                    >
                        tree
                    </button>
                    <button
                        className={`toolbar-btn ${viewMode === 'table' ? 'active' : ''}`}
                        onClick={() => setViewMode('table')}
                        disabled={!parsedData}
                    >
                        table
                    </button>
                    <div className="divider" />
                    <input
                        type="text"
                        placeholder="Find..."
                        className="search-input"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>
            <div className="detail-content">
                <div className="meta-info">
                    <span className="label">Time:</span> {packet.timestamp} <span className="sep">|</span>
                    <span className="label">ID:</span> {packet.id} <span className="sep">|</span>
                    <span className="label">Length:</span> {packet.length} <span className="sep">|</span>
                    <span className="label">Source:</span> {packet.dataSource || 'JSON'}
                </div>

                <div className="view-container">
                    {viewMode === 'text' && (
                        <JsonViewer data={packet.data} />
                    )}
                    {viewMode === 'tree' && (
                        parsedData ? <JsonTreeView data={parsedData} /> : <div className="error-msg">Invalid JSON Data</div>
                    )}
                    {viewMode === 'table' && (
                        parsedData ? <JsonTableView data={parsedData} /> : <div className="error-msg">Invalid JSON Data</div>
                    )}
                </div>
            </div>
        </div>
    );
};
