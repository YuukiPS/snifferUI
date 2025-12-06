import './Sidebar.css';

interface SidebarProps {
    onFilterClick: () => void;
    onClear: () => void;
    onStart: () => void;
    isMonitoring: boolean;
    onProtoClick: () => void;
    onJsonClick: () => void;
    autoScroll: boolean;
    onAutoScrollToggle: () => void;
}

export const Sidebar = ({ onFilterClick, onClear, onStart, isMonitoring, onProtoClick, onJsonClick, autoScroll, onAutoScrollToggle }: SidebarProps) => {


    return (
        <div className="sidebar">
            <div className="sidebar-group">
                <button
                    className={`sidebar-btn ${isMonitoring ? 'stop' : 'play'}`}
                    title={isMonitoring ? "Stop Monitoring" : "Start Monitoring"}
                    onClick={onStart}
                >
                    {isMonitoring ? (
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6z" /></svg> // Stop icon
                    ) : (
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg> // Play icon
                    )}
                </button>
                <button className="sidebar-btn" title="Upload JSON" onClick={onJsonClick}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                </button>
                <button className="sidebar-btn" title="Filter Settings" onClick={onFilterClick}>
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" /></svg>
                </button>
                <button className="sidebar-btn" title="Upload Proto File" onClick={onProtoClick}>
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z" /></svg>
                </button>
            </div>

            <div className="sidebar-group bottom">
                <button className="sidebar-btn stop" title="Stop/Clear" onClick={onClear}>
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg>
                </button>
                <button
                    className={`sidebar-btn scroll ${autoScroll ? 'active' : ''}`}
                    title="Auto Scroll"
                    onClick={onAutoScrollToggle}
                >
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" /></svg>
                </button>
                <button className="sidebar-btn" title="Save">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z" /></svg>
                </button>
            </div>
        </div>
    );
};
