import React from 'react';
import type { Packet } from '../types';
import './PacketDetail.css';

interface PacketDetailProps {
    packet: Packet | null;
    onClose?: () => void;
}

const JsonViewer = ({ data }: { data: any }) => {
    const jsonString = JSON.stringify(data, null, 2);
    // Simple syntax highlighter logic: wrapping keys, strings, numbers, booleans in spans
    // This is a naive implementation but works for display
    const highlighted = jsonString.replace(
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

    return (
        <pre
            className="json-viewer"
            dangerouslySetInnerHTML={{ __html: highlighted }}
        />
    );
};

export const PacketDetail: React.FC<PacketDetailProps> = ({ packet }) => {
    if (!packet) {
        return (
            <div className="packet-detail empty">
                <div className="empty-message">Select a packet to view details</div>
            </div>
        );
    }

    return (
        <div className="packet-detail">
            <div className="detail-header">
                <div className="detail-title">{packet.packetName}</div>
                <div className="detail-toolbar">
                    <button className="toolbar-btn">text</button>
                    <button className="toolbar-btn active">tree</button>
                    <button className="toolbar-btn">table</button>
                    <div className="divider" />
                    <input type="text" placeholder="Find..." className="search-input" />
                </div>
            </div>
            <div className="detail-content">
                <div className="meta-info">
                    <span className="label">Time:</span> {packet.timestamp} <span className="sep">|</span>
                    <span className="label">ID:</span> {packet.id} <span className="sep">|</span>
                    <span className="label">Length:</span> {packet.length}
                </div>
                <JsonViewer data={packet.data} />
            </div>
        </div>
    );
};
