import { useState, useEffect } from 'react';
import './DatabaseModal.css';

interface Database {
  name: string;
  gameType: number; // 0-unknown, 1-genshin impact, 2-star rail
}

interface DatabaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  databases: Database[];
  currentDatabase: string;
  onSelectDatabase: (name: string) => void;
  onCreateDatabase: (name: string, gameType: number) => void;
}

export const DatabaseModal = ({
  isOpen,
  onClose,
  databases,
  currentDatabase,
  onSelectDatabase,
  onCreateDatabase,
}: DatabaseModalProps) => {
  const [newDbName, setNewDbName] = useState('');
  const [newDbGameType, setNewDbGameType] = useState<number>(0);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setNewDbName('');
      setNewDbGameType(0);
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCreate = () => {
    const trimmedName = newDbName.trim();
    if (!trimmedName) {
      setError('Database name cannot be empty.');
      return;
    }
    if (databases.some(db => db.name === trimmedName)) {
      setError('Database name already exists.');
      return;
    }
    onCreateDatabase(trimmedName, newDbGameType);
    onClose();
  };

  const getGameTypeName = (type: number) => {
    switch (type) {
      case 1: return 'Genshin Impact';
      case 2: return 'Star Rail';
      default: return 'Unknown';
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2>Database Selection</h2>
        
        <div className="database-list">
          {databases.map((db) => (
            <div
              key={db.name}
              className={`database-item ${currentDatabase === db.name ? 'active' : ''}`}
              onClick={() => {
                if (currentDatabase !== db.name) {
                  onSelectDatabase(db.name);
                  onClose();
                }
              }}
            >
              <div className="database-info">
                <span className="database-name">{db.name}</span>
                <span className="database-type">{getGameTypeName(db.gameType)}</span>
              </div>
              {currentDatabase === db.name && <span className="current-badge">✓</span>}
            </div>
          ))}
        </div>

        <div className="create-section">
          <h3>Create New Database</h3>
          <div className="input-group">
            <label>Name</label>
            <input
              type="text"
              value={newDbName}
              onChange={(e) => setNewDbName(e.target.value)}
              placeholder="Enter database name"
            />
          </div>
          <div className="input-group">
            <label>Game Type</label>
            <select
              value={newDbGameType}
              onChange={(e) => setNewDbGameType(Number(e.target.value))}
            >
              <option value={0}>Unknown</option>
              <option value={1}>Genshin Impact</option>
              <option value={2}>Star Rail</option>
            </select>
          </div>
          
          {error && <div className="error-message" style={{ color: 'red', marginBottom: '10px' }}>{error}</div>}

          <div className="modal-actions">
            <button className="cancel-btn" onClick={onClose}>Cancel</button>
            <button
              className="create-btn"
              onClick={handleCreate}
              disabled={!newDbName.trim()}
            >
              Create & Switch
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
