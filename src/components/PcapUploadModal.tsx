import { useState } from 'react';
import './PcapUploadModal.css';

interface PcapUploadModalProps {
    isOpen: boolean;
    onClose: () => void;
    serverAddress: string;
    isMonitoring: boolean;
}

interface UploadResult {
    successCount: number;
    errorCount: number;
    errors: Array<{ fileName: string; error: string }>;
}

export const PcapUploadModal = ({ isOpen, onClose, serverAddress, isMonitoring }: PcapUploadModalProps) => {
    const [isDragging, setIsDragging] = useState(false);
    const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    const uploadPcapFile = async (file: File): Promise<{ success: boolean; error?: string }> => {
        try {
            const formData = new FormData();
            formData.append('file', file);

            const baseUrl = serverAddress.replace(/\/$/, "");
            const response = await fetch(`${baseUrl}/api/upload`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                return { success: false, error: `Server returned ${response.status}: ${response.statusText}` };
            }

            return { success: true };
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Network error' };
        }
    };

    const processFiles = async (files: FileList | File[]) => {
        // Check if monitoring is active before uploading
        if (!isMonitoring) {
            setUploadResult({
                successCount: 0,
                errorCount: 1,
                errors: [{ fileName: 'N/A', error: 'Real-time monitoring must be active to upload PCAP files. Click the Play button to start monitoring first.' }]
            });
            return;
        }

        setIsProcessing(true);
        const fileArray = Array.from(files);
        const pcapFiles = fileArray.filter(file =>
            file.name.endsWith('.gcap') ||
            file.name.endsWith('.pcap') ||
            file.name.endsWith('.pcapng')
        );

        if (pcapFiles.length === 0) {
            setUploadResult({
                successCount: 0,
                errorCount: 0,
                errors: [{ fileName: 'N/A', error: 'No .gcap, .pcap, or .pcapng files found' }]
            });
            setIsProcessing(false);
            return;
        }

        const results: UploadResult = {
            successCount: 0,
            errorCount: 0,
            errors: []
        };

        for (const file of pcapFiles) {
            const result = await uploadPcapFile(file);

            if (result.success) {
                results.successCount++;
            } else {
                results.errorCount++;
                results.errors.push({
                    fileName: file.name,
                    error: result.error || 'Unknown error'
                });
            }
        }

        setUploadResult(results);
        setIsProcessing(false);
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        processFiles(files);
        // Reset value so same file can be selected again
        e.target.value = '';
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            processFiles(files);
        }
    };

    const handleCloseModal = () => {
        setUploadResult(null);
        setIsDragging(false);
        setIsProcessing(false);
        onClose();
    };

    const handleCloseResultPopup = () => {
        setUploadResult(null);
        if (uploadResult && uploadResult.successCount > 0) {
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <>
            <div className="modal-overlay" onClick={handleCloseModal}>
                <div className="modal-content" onClick={e => e.stopPropagation()}>
                    <h2>Upload PCAP Files</h2>
                    <p>Upload packet capture files (.gcap, .pcap, .pcapng) to the server for processing.</p>

                    {!isMonitoring && (
                        <div className="warning-message">
                            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                                <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
                            </svg>
                            <span>Real-time monitoring must be active. Start monitoring first by clicking the Play button.</span>
                        </div>
                    )}

                    <div
                        className={`upload-area ${isDragging ? 'dragging' : ''}`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                    >
                        <input
                            type="file"
                            accept=".gcap,.pcap,.pcapng"
                            onChange={handleFileSelect}
                            id="pcap-file-input"
                            multiple
                            style={{ display: 'none' }}
                        />
                        <label htmlFor="pcap-file-input" className="upload-label">
                            {isProcessing ? (
                                <>
                                    <div className="spinner"></div>
                                    <span>Uploading files...</span>
                                </>
                            ) : (
                                <>
                                    <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48">
                                        <path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z" />
                                    </svg>
                                    <span>
                                        {isDragging
                                            ? 'Drop PCAP files here'
                                            : 'Drag & drop PCAP files here or click to select'}
                                    </span>
                                </>
                            )}
                        </label>
                    </div>

                    <div className="modal-actions">
                        <button className="cancel-btn" onClick={handleCloseModal}>Close</button>
                    </div>
                </div>
            </div>

            {/* Result Popup */}
            {uploadResult && (
                <div className="result-overlay" onClick={handleCloseResultPopup}>
                    <div className="result-popup" onClick={e => e.stopPropagation()}>
                        <div className="result-header">
                            <h3>Upload Results</h3>
                            <button className="close-btn" onClick={handleCloseResultPopup}>×</button>
                        </div>
                        <div className="result-content">
                            {uploadResult.successCount > 0 && (
                                <div className="result-success">
                                    <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                                    </svg>
                                    <div>
                                        <div>{uploadResult.successCount} PCAP file{uploadResult.successCount !== 1 ? 's' : ''} successfully uploaded</div>
                                        <div className="mapping-count">Files sent to server for processing</div>
                                    </div>
                                </div>
                            )}
                            {uploadResult.errorCount > 0 && (
                                <div className="result-error">
                                    <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                                    </svg>
                                    <span>{uploadResult.errorCount} error{uploadResult.errorCount !== 1 ? 's' : ''} occurred</span>
                                </div>
                            )}
                            {uploadResult.errors.length > 0 && (
                                <div className="error-details">
                                    <h4>Error Details:</h4>
                                    <ul>
                                        {uploadResult.errors.map((err, idx) => (
                                            <li key={idx}>
                                                <strong>{err.fileName}:</strong> {err.error}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                        <div className="result-actions">
                            <button className="ok-btn" onClick={handleCloseResultPopup}>OK</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
