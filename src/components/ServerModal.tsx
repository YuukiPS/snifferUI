import { useState, useEffect } from 'react';
import './ServerModal.css';

interface ServerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConnect: (address: string) => void;
    initialAddress: string;
}

export const ServerModal = ({ isOpen, onClose, onConnect, initialAddress }: ServerModalProps) => {
    const [address, setAddress] = useState(initialAddress);

    useEffect(() => {
        setAddress(initialAddress);
    }, [initialAddress]);

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <h2>Connect to Server</h2>
                <p>Enter the address of your packet capture server.</p>

                <div className="input-group">
                    <input
                        type="text"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="http://localhost:1985"
                        autoFocus
                    />
                </div>

                <div className="modal-actions">
                    <button className="cancel-btn" onClick={onClose}>Cancel</button>
                    <button className="connect-btn" onClick={() => onConnect(address)}>Connect</button>
                </div>
            </div>
        </div>
    );
};
