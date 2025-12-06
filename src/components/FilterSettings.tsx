import React from 'react';
import './FilterSettings.css';

interface FilterSettingsProps {
    hiddenNames: string[];
    onUnhide: (name: string) => void;
    onClose: () => void;
}

export const FilterSettings: React.FC<FilterSettingsProps> = ({ hiddenNames, onUnhide, onClose }) => {
    return (
        <div className="filter-settings-overlay" onClick={onClose}>
            <div className="filter-settings-modal" onClick={e => e.stopPropagation()}>
                <div className="filter-settings-header">
                    <h3>Filter Settings</h3>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>
                <div className="filter-settings-content">
                    <h4>Hidden Packet Names</h4>
                    {hiddenNames.length === 0 ? (
                        <p className="no-filters">No active filters</p>
                    ) : (
                        <ul className="hidden-list">
                            {hiddenNames.map(name => (
                                <li key={name} className="hidden-item">
                                    <span>{name}</span>
                                    <button
                                        className="unhide-btn"
                                        onClick={() => onUnhide(name)}
                                        title="Remove filter"
                                    >
                                        ×
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
};
