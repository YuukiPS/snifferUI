import { useState } from 'react';
import './ProtoUploadModal.css';

interface ProtoUploadModalProps {
    isOpen: boolean;
    onClose: () => void;
    onProtoUploaded: (protoText: string) => void;
}

export const ProtoUploadModal = ({ isOpen, onClose, onProtoUploaded }: ProtoUploadModalProps) => {
    const [fileName, setFileName] = useState<string>('');

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setFileName(file.name);
        const reader = new FileReader();
        reader.onload = (event) => {
            const protoText = event.target?.result as string;
            localStorage.setItem("protoFileContent", protoText);
            onProtoUploaded(protoText);
            onClose();
        };
        reader.readAsText(file);
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <h2>Upload Proto File</h2>
                <p>Upload a .proto file to enable binary packet decoding.</p>

                <div className="upload-area">
                    <input
                        type="file"
                        accept=".proto"
                        onChange={handleFileSelect}
                        id="proto-file-input"
                        style={{ display: 'none' }}
                    />
                    <label htmlFor="proto-file-input" className="upload-label">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48">
                            <path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z" />
                        </svg>
                        <span>{fileName || 'Click to select .proto file'}</span>
                    </label>
                </div>

                <div className="modal-actions">
                    <button className="cancel-btn" onClick={onClose}>Close</button>
                </div>
            </div>
        </div>
    );
};
