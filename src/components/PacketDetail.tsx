import React, { useState, useMemo, useEffect } from 'react';
import type { Packet } from '../types';
import { formatTime } from '../types';
import './PacketDetail.css';
import { UnknownProtobufDecoder } from './UnknownProtobufDecoder';
import { decodeUnknownProtobufJson, decodeBase64ToBytes } from '../utils/packetDecoding';

interface PacketDetailProps {
    packet: Packet | null;
    onClose?: () => void;
}

type ViewMode = 'text' | 'tree' | 'table' | 'protobuf';

// Generic interface for matches to support both Text (line based) and Tree (path based)
interface BaseMatch {
    type: 'text' | 'tree';
}

interface TextMatch extends BaseMatch {
    type: 'text';
    line: number;
    start: number;
    end: number;
}

interface TreeMatch extends BaseMatch {
    type: 'tree';
    path: string[];
    fullPathString: string;
}

type SearchMatch = TextMatch | TreeMatch;


// --- Helper Functions ---

const highlightText = (text: string, term: string, isActive: boolean) => {
    if (!term || !text) return <>{text}</>;
    // Naive split might break if we want to preserve case, so use matchAll or specific logic
    // But split with Regex works well for preserving case
    const parts = text.split(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    const lowerTerm = term.toLowerCase();

    return (
        <>
            {parts.map((part, i) =>
                part.toLowerCase() === lowerTerm ? (
                    <span key={i} className={`search-match ${isActive ? 'current' : ''}`}>{part}</span>
                ) : (
                    part
                )
            )}
        </>
    );
};

// --- View Components ---

// --- TREE ITEM COMPONENT ---
// Needs to be defined before JsonTreeView
interface JsonTreeItemProps {
    name?: string;
    value: any;
    isLast?: boolean;
    level?: number;
    path: string[];
    searchTerm: string;
    expandedPaths: Set<string>;
    currentMatchPath: string | null;
}

const JsonTreeItem: React.FC<JsonTreeItemProps> = ({
    name,
    value,
    isLast,
    level = 0,
    path,
    searchTerm,
    expandedPaths,
    currentMatchPath
}) => {
    const [expanded, setExpanded] = useState(true);
    const isObject = value !== null && typeof value === 'object';
    const isArray = Array.isArray(value);
    const isEmpty = isObject && Object.keys(value).length === 0;

    const pathString = path.join('.');

    // Auto-expand if in search results
    useEffect(() => {
        if (expandedPaths.has(pathString)) {
            setExpanded(true);
        }
    }, [expandedPaths, pathString]);

    const toggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        setExpanded(!expanded);
    };

    // Rendering Helpers
    const isCurrentMatch = () => {
        if (!currentMatchPath) return false;
        return currentMatchPath === pathString;
    };

    const renderValue = (val: any) => {
        const valString = String(val);
        const isActive = isCurrentMatch() && String(val).toLowerCase().includes(searchTerm.toLowerCase());

        if (val === null) return <span className="json-null">null</span>;

        let content;
        if (typeof val === 'string') {
            content = (
                <>
                    "<span className="json-string">{highlightText(val, searchTerm, isActive)}</span>"
                </>
            );
        } else if (typeof val === 'number') {
            content = <span className="json-number">{highlightText(valString, searchTerm, isActive)}</span>;
        } else if (typeof val === 'boolean') {
            content = <span className="json-boolean">{highlightText(valString, searchTerm, isActive)}</span>;
        } else {
            content = <span>{highlightText(valString, searchTerm, isActive)}</span>;
        }

        return content;
    };

    const indent = level * 20;
    const rowId = `tree-node-${pathString}`;

    if (!isObject) {
        // Primitive value node (leaf)
        const isKeyMatch = name && name.toLowerCase().includes(searchTerm.toLowerCase());
        const isActive = (currentMatchPath === pathString);

        return (
            <div
                id={rowId}
                className={`tree-line ${isActive ? 'active-match-line' : ''}`}
                style={{ paddingLeft: indent }}
            >
                {name && (
                    <span className="json-key">
                        "{highlightText(name, searchTerm, isActive && !!isKeyMatch)}":{' '}
                    </span>
                )}
                {renderValue(value)}
                {!isLast && <span className="json-comma">,</span>}
            </div>
        );
    }

    // Object/Array Node
    const keys = Object.keys(value);

    // For object key match
    const isKeyMatch = name && name.toLowerCase().includes(searchTerm.toLowerCase());
    const isActive = currentMatchPath === pathString && !!isKeyMatch;

    return (
        <div className="tree-node">
            <div
                id={rowId}
                className={`tree-line ${isActive ? 'active-match-line' : ''}`}
                onClick={toggle}
                style={{ paddingLeft: indent, cursor: 'pointer' }}
            >
                <span className="tree-toggler" style={{ display: 'inline-block', width: '12px', marginRight: '4px' }}>
                    {isEmpty ? '' : (expanded ? '▼' : '▶')}
                </span>
                {name && (
                    <span className="json-key">
                        "{highlightText(name, searchTerm, isActive)}":{' '}
                    </span>
                )}
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
                            path={[...path, key]}
                            searchTerm={searchTerm}
                            expandedPaths={expandedPaths}
                            currentMatchPath={currentMatchPath}
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


// --- TEXT VIEW (JSON TEXT WITH LINE NUMBERS) ---
const JsonTextView = ({
    data,
    searchTerm,
    onMatchesFound,
    focusedMatchIndex
}: {
    data: string,
    searchTerm: string,
    onMatchesFound: (matches: SearchMatch[]) => void,
    focusedMatchIndex: number
}) => {

    // Formatting
    const formattedData = useMemo(() => {
        try {
            const parsed = JSON.parse(data);
            return JSON.stringify(parsed, null, 2);
        } catch {
            return data;
        }
    }, [data]);

    const lines = useMemo(() => formattedData.split('\n'), [formattedData]);

    // Calculate matches when searchTerm or data changes
    const matches = useMemo(() => {
        if (!searchTerm) return [];
        const term = searchTerm.toLowerCase();
        const found: TextMatch[] = [];
        lines.forEach((line, index) => {
            let startIndex = 0;
            const lowerLine = line.toLowerCase();
            let matchIndex = lowerLine.indexOf(term, startIndex);
            while (matchIndex !== -1) {
                found.push({
                    type: 'text',
                    line: index,
                    start: matchIndex,
                    end: matchIndex + term.length
                });
                startIndex = matchIndex + term.length;
                matchIndex = lowerLine.indexOf(term, startIndex);
            }
        });
        return found;
    }, [lines, searchTerm]);

    // Report matches up
    useEffect(() => {
        onMatchesFound(matches);
    }, [matches, onMatchesFound]);

    // Scroll to active match
    useEffect(() => {
        if (matches.length > 0 && focusedMatchIndex >= 0 && focusedMatchIndex < matches.length) {
            const match = matches[focusedMatchIndex];
            if (match.type === 'text') {
                const el = document.getElementById(`line-${match.line}`);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        }
    }, [focusedMatchIndex, matches]);

    // Helper to highlight a chunk of text if it overlaps with matches
    const highlightToken = (text: string, lineIdx: number, offsetCol: number) => {
        if (!searchTerm) return text;

        const parts: React.ReactNode[] = [];
        const lowerText = text.toLowerCase();
        const lowerTerm = searchTerm.toLowerCase();
        let localCursor = 0;
        let found = lowerText.indexOf(lowerTerm, localCursor);

        while (found !== -1) {
            // Text before
            if (found > localCursor) {
                parts.push(text.slice(localCursor, found));
            }

            // The match
            const actualMatchStart = offsetCol + found;

            // Is this the currently focused match?
            // "Active" match means matches[focusedMatchIndex] is this specific match
            const focusedMatch = matches[focusedMatchIndex];
            const isFocused = focusedMatch &&
                focusedMatch.type === 'text' &&
                focusedMatch.line === lineIdx &&
                focusedMatch.start === actualMatchStart;

            parts.push(
                <span key={offsetCol + found} className={`search-match ${isFocused ? 'current' : ''}`}>
                    {text.slice(found, found + searchTerm.length)}
                </span>
            );

            localCursor = found + searchTerm.length;
            found = lowerText.indexOf(lowerTerm, localCursor);
        }

        if (localCursor < text.length) {
            parts.push(text.slice(localCursor));
        }

        return parts.length > 0 ? <>{parts}</> : text;
    };

    // Render Line Logic (Syntax + Search Highlight)
    const renderLineContent = (text: string, lineIndex: number) => {
        const regex = /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g;

        const elements: React.ReactNode[] = [];
        let lastIndex = 0;
        let match;

        while ((match = regex.exec(text)) !== null) {
            // Text before match (whitespace, punctuation)
            if (match.index > lastIndex) {
                const plainText = text.slice(lastIndex, match.index);
                elements.push(highlightToken(plainText, lineIndex, lastIndex));
            }

            // The Match
            const token = match[0];
            let cls = 'json-number';
            if (/^"/.test(token)) {
                if (/:$/.test(token)) {
                    cls = 'json-key';
                } else {
                    cls = 'json-string';
                }
            } else if (/true|false/.test(token)) {
                cls = 'json-boolean';
            } else if (/null/.test(token)) {
                cls = 'json-null';
            }

            elements.push(
                <span key={match.index} className={cls}>
                    {highlightToken(token, lineIndex, match.index)}
                </span>
            );

            lastIndex = regex.lastIndex;
        }

        // Remaining text
        if (lastIndex < text.length) {
            const plainText = text.slice(lastIndex);
            elements.push(highlightToken(plainText, lineIndex, lastIndex));
        }

        return elements;
    };

    return (
        <div className="json-text-view">
            {lines.map((line, idx) => (
                <div key={idx} id={`line-${idx}`} className="code-line-row">
                    <div className="line-number">{idx + 1}</div>
                    <div className="code-content">{renderLineContent(line, idx)}</div>
                </div>
            ))}
        </div>
    );
};


// --- Tree View Wrapper (Same as before but integrates props) ---

const JsonTreeView = ({
    data,
    searchTerm,
    onMatchesFound,
    focusedMatchIndex
}: {
    data: any,
    searchTerm: string,
    onMatchesFound: (matches: SearchMatch[]) => void,
    focusedMatchIndex: number
}) => {

    // Calculate matches
    const matches = useMemo(() => {
        if (!searchTerm) return [];
        const foundMatches: TreeMatch[] = [];
        const term = searchTerm.toLowerCase();

        const traverse = (current: any, path: string[]) => {
            if (current && typeof current === 'object') {
                Object.keys(current).forEach(key => {
                    if (key.toLowerCase().includes(term)) {
                        foundMatches.push({
                            type: 'tree',
                            path: [...path, key],
                            fullPathString: [...path, key].join('.')
                        });
                    }
                    traverse(current[key], [...path, key]);
                });
            } else {
                if (String(current).toLowerCase().includes(term)) {
                    foundMatches.push({
                        type: 'tree',
                        path: path,
                        fullPathString: path.join('.')
                    });
                }
            }
        };
        traverse(data, []);
        return foundMatches;
    }, [data, searchTerm]);

    useEffect(() => {
        onMatchesFound(matches);
    }, [matches, onMatchesFound]);

    const currentMatch = matches[focusedMatchIndex] as TreeMatch;
    const currentMatchPath = currentMatch?.fullPathString || null;

    // Scroll Logic handled in JsonTreeItem or here?
    // Let's handle it here generically for the tree root
    useEffect(() => {
        if (currentMatchPath) {
            // Note: This relies on JsonTreeItem rendering IDs correctly
            const element = document.getElementById(`tree-node-${currentMatchPath}`);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }, [currentMatchPath]);

    // Expand Logic
    const expandedPaths = useMemo(() => {
        const paths = new Set<string>();
        if (!searchTerm) return paths;

        matches.forEach(match => {
            const tm = match as TreeMatch;
            let currentPath: string[] = [];
            for (let i = 0; i < tm.path.length; i++) {
                currentPath.push(tm.path[i]);
                paths.add(currentPath.join('.'));
            }
        });
        return paths;
    }, [matches, searchTerm]);

    return (
        <div className="json-tree-container">
            <JsonTreeItem
                value={data}
                isLast={true}
                path={[]}
                searchTerm={searchTerm}
                expandedPaths={expandedPaths}
                currentMatchPath={currentMatchPath}
            />
        </div>
    );
};

// --- Table View (Unchanged mosty) ---
const JsonTableView = ({ data }: { data: any }) => {
    if (data === null || typeof data !== 'object') {
        return <div className="table-message">Data is not an object or array</div>;
    }

    const isArray = Array.isArray(data);

    if (isArray) {
        if (data.length === 0) return <div className="table-message">Empty Array</div>;

        const sampleSize = Math.min(data.length, 20);
        const allKeys = new Set<string>();
        for (let i = 0; i < sampleSize; i++) {
            if (data[i] && typeof data[i] === 'object') {
                Object.keys(data[i]).forEach(k => allKeys.add(k));
            }
        }
        const columns = Array.from(allKeys);

        if (columns.length === 0) {
            return (
                <div className="table-wrapper">
                    <table className="json-table">
                        <thead><tr><th>Index</th><th>Value</th></tr></thead>
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
                        <tr><th>#</th>{columns.map(col => <th key={col}>{col}</th>)}</tr>
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
        const keys = Object.keys(data);
        if (keys.length === 0) return <div className="table-message">Empty Object</div>;

        return (
            <div className="table-wrapper">
                <table className="json-table">
                    <thead><tr><th>Key</th><th>Value</th></tr></thead>
                    <tbody>
                        {keys.map(key => (
                            <tr key={key}>
                                <td className="key-cell">{key}</td>
                                <td>{typeof data[key] === 'object' ? JSON.stringify(data[key]) : String(data[key])}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    }
};


// --- PacketDetail Main ---

export const PacketDetail: React.FC<PacketDetailProps> = ({ packet, onClose }) => {
    const [viewMode, setViewMode] = useState<ViewMode>('text');
    const [searchTerm, setSearchTerm] = useState('');
    const [matches, setMatches] = useState<SearchMatch[]>([]);
    const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

    // Compute fallback protobuf decoded data for when proto class JSON is missing
    const protobufFallback = useMemo(() => {
        if (!packet || !packet.binary) return null;
        try {
            const buffer = decodeBase64ToBytes(packet.binary);
            const unknown = decodeUnknownProtobufJson(buffer);
            return {
                unknownDecoded: unknown.decoded,
                unknownDecodeMode: unknown.mode,
            };
        } catch {
            return null;
        }
    }, [packet]);

    const parsedData = useMemo(() => {
        if (!packet) return null;
        // Try proto class JSON first
        if (packet.data && packet.data !== '{}') {
            try {
                return JSON.parse(packet.data);
            } catch (e) {
                // Fall through to protobuf fallback
            }
        }
        // Fallback to raw protobuf decoded data
        return protobufFallback;
    }, [packet, protobufFallback]);

    // Compare proto JSON vs raw protobuf decoded data to detect truly missing fields.
    // For each matching array pair (matched by length), compare per-object field counts.
    // If raw protobuf has MORE fields than proto JSON keys at the same level,
    // some fields exist in binary but were dropped during proto deserialization.
    const missingFieldInfo = useMemo(() => {
        if (!packet || !protobufFallback) return null;
        // Only relevant when we have both proto JSON and raw protobuf
        let protoParsed: any = null;
        try {
            protoParsed = JSON.parse(packet.data);
        } catch {}
        if (!protoParsed) return null;

        const rawDecoded = protobufFallback as any;
        const rawTopArray = rawDecoded?.unknownDecoded;
        if (!Array.isArray(rawTopArray)) return null;

        // Collect per-nesting-level comparisons
        interface LevelComparison {
            protoKey: string;
            rawFieldCount: number;    // total field numbers in raw protobuf at this level
            protoFieldCount: number;  // total keys in proto JSON at this level
            diff: number;              // positive = raw has more (missing), negative = proto has more (defaults)
            itemCount: number;
        }
        const comparisons: LevelComparison[] = [];

        // Helper: for a raw protobuf "message" node, count its nested fields
        const countRawFields = (node: any): number => {
            if (Array.isArray(node?.nested)) return node.nested.length;
            return 0;
        };

        // Helper: count keys in a proto JSON object (including nested)
        const countProtoKeys = (node: any): number => {
            if (node && typeof node === 'object' && !Array.isArray(node)) {
                return Object.keys(node).length;
            }
            return 0;
        };

        // Compare top-level: find proto JSON arrays matching rawDecoded.unknownDecoded length
        const rawItems = rawTopArray.length;
        const protoKeys = Object.keys(protoParsed);

        for (const key of protoKeys) {
            const protoVal = protoParsed[key];
            if (!Array.isArray(protoVal)) continue;
            if (protoVal.length !== rawItems) continue;

            // Matched array pair at top level — compare per-item fields
            let rawTotal = 0;
            let protoTotal = 0;
            let comparableItems = 0;
            const minLen = Math.min(rawTopArray.length, protoVal.length);

            for (let i = 0; i < minLen; i++) {
                const rf = countRawFields(rawTopArray[i]);
                const pf = countProtoKeys(protoVal[i]);
                if (rf > 0 || pf > 0) {
                    rawTotal += rf;
                    protoTotal += pf;
                    comparableItems++;
                }
            }

            if (comparableItems > 0 && rawTotal > protoTotal) {
                comparisons.push({
                    protoKey: key,
                    rawFieldCount: rawTotal,
                    protoFieldCount: protoTotal,
                    diff: rawTotal - protoTotal,
                    itemCount: comparableItems,
                });
            }
        }

        if (comparisons.length > 0) {
            return {
                totalDiff: comparisons.reduce((s, c) => s + c.diff, 0),
                comparisons,
            };
        }
        return null;
    }, [packet, protobufFallback]);

    // Whether the current data source is protobuf fallback (not proto class JSON)
    const isProtobufFallback = useMemo(() => {
        if (!packet) return false;
        let hasProtoJson = false;
        try {
            if (packet.data && packet.data !== '{}') {
                JSON.parse(packet.data);
                hasProtoJson = true;
            }
        } catch {}
        return !hasProtoJson && protobufFallback !== null;
    }, [packet, protobufFallback]);

    useEffect(() => {
        setCurrentMatchIndex(0);
    }, [searchTerm, viewMode]);

    const handleNextMatch = () => {
        if (matches.length === 0) return;
        setCurrentMatchIndex((prev) => (prev + 1) % matches.length);
    };

    const handlePrevMatch = () => {
        if (matches.length === 0) return;
        setCurrentMatchIndex((prev) => (prev - 1 + matches.length) % matches.length);
    };

    if (!packet) {
        return null;
    }

    return (
        <div className="packet-detail">
            <div className="detail-header">
                <div className="detail-title-row">
                    <div className="detail-title">{packet.packetName}</div>
                    {onClose && (
                        <button
                            className="detail-close-btn"
                            onClick={onClose}
                            title="Close packet details"
                            aria-label="Close packet details"
                        >
                            ×
                        </button>
                    )}
                </div>
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
                        disabled={!parsedData && !protobufFallback}
                    >
                        table
                    </button>
                    <button
                        className={`toolbar-btn ${viewMode === 'protobuf' ? 'active' : ''}`}
                        onClick={() => setViewMode('protobuf')}
                        disabled={!packet.binary}
                    >
                        protobuf
                    </button>

                    {viewMode !== 'protobuf' && (
                        <>
                            <div className="divider" />

                            <div className="search-box">
                                <div className="search-input-wrapper">
                                    <input
                                        type="text"
                                        placeholder="Find..."
                                        className="search-input"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                if (e.shiftKey) handlePrevMatch();
                                                else handleNextMatch();
                                            }
                                        }}
                                    />
                                    {searchTerm && matches.length > 0 && (
                                        <span className="search-count">
                                            {currentMatchIndex + 1}/{matches.length}
                                        </span>
                                    )}
                                    {searchTerm && matches.length === 0 && (
                                        <span className="search-count">0/0</span>
                                    )}
                                </div>
                                <div className="search-controls">
                                    <button className="search-nav-btn" onClick={handlePrevMatch} disabled={matches.length === 0}>
                                        ▲
                                    </button>
                                    <button className="search-nav-btn" onClick={handleNextMatch} disabled={matches.length === 0}>
                                        ▼
                                    </button>
                                    {searchTerm && (
                                        <button className="search-nav-btn close" onClick={() => setSearchTerm('')}>
                                            ×
                                        </button>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            <div className="detail-content">
                <div className="meta-info">
                    <span className="label">Time:</span> {formatTime(packet.timestamp)} <span className="sep">|</span>
                    <span className="label">ID:</span> {packet.id} <span className="sep">|</span>
                    <span className="label">Length:</span> {packet.length} <span className="sep">|</span>
                    <span className="label">Source:</span> {packet.dataSource || 'JSON'}
                </div>

                {isProtobufFallback && (
                    <div className="warning-banner" style={{
                        background: 'rgba(234, 179, 8, 0.12)',
                        border: '1px solid rgba(234, 179, 8, 0.3)',
                        borderRadius: 6,
                        padding: '8px 14px',
                        margin: '0 0 10px 0',
                        color: '#fbbf24',
                        fontSize: 12,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                    }}>
                        <span style={{ fontWeight: 600 }}>&#9888;</span>
                        <span>No proto class available. Data decoded from <strong>raw protobuf</strong> (field numbers only, not original proto JSON).</span>
                    </div>
                )}

                {missingFieldInfo && (
                    <div className="warning-banner" style={{
                        background: 'rgba(59, 130, 246, 0.12)',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        borderRadius: 6,
                        padding: '8px 14px',
                        margin: '0 0 10px 0',
                        color: '#60a5fa',
                        fontSize: 12,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontWeight: 600 }}>&#8505;</span>
                            <span>
                                Raw protobuf has <strong>{missingFieldInfo.totalDiff} more field(s)</strong> than proto JSON.
                                Some fields exist in binary data but were dropped during proto deserialization.
                            </span>
                        </div>
                        {missingFieldInfo.comparisons.map((c: any) => (
                            <div key={c.protoKey} style={{
                                paddingLeft: 24,
                                fontFamily: 'monospace',
                                fontSize: 11,
                                opacity: 0.85,
                            }}>
                                <strong>{c.protoKey}</strong>: raw {c.rawFieldCount} fields / proto {c.protoFieldCount} keys
                                across {c.itemCount} items (diff: +{c.diff})
                            </div>
                        ))}
                    </div>
                )}

                <div className="view-container">
                    {viewMode === 'text' && (
                        <JsonTextView
                            data={packet.data && packet.data !== '{}' ? packet.data : JSON.stringify(protobufFallback || {}, null, 2)}
                            searchTerm={searchTerm}
                            onMatchesFound={setMatches}
                            focusedMatchIndex={currentMatchIndex}
                        />
                    )}
                    {viewMode === 'tree' && (
                        parsedData
                            ? <JsonTreeView
                                data={parsedData}
                                searchTerm={searchTerm}
                                onMatchesFound={setMatches}
                                focusedMatchIndex={currentMatchIndex}
                            />
                            : <div className="error-msg">Invalid JSON Data</div>
                    )}
                    {viewMode === 'table' && (
                        parsedData ? <JsonTableView data={parsedData} /> : <div className="error-msg">Invalid JSON Data</div>
                    )}
                    {viewMode === 'protobuf' && (
                        packet.binary
                            ? <UnknownProtobufDecoder initialBase64={packet.binary} />
                            : <div className="error-msg">No binary data</div>
                    )}
                </div>
            </div>
        </div>
    );
};
