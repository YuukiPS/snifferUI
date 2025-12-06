import { useState } from 'react';
import './JsonUploadModal.css';

interface JsonUploadModalProps {
    isOpen: boolean;
    onClose: () => void;
    onJsonUploaded: (data: any[]) => { success: boolean; packetCount: number; error?: string };
}

interface UploadResult {
    successCount: number;
    errorCount: number;
    packetCount: number;
    errors: Array<{ fileName: string; error: string }>;
}

export const JsonUploadModal = ({ isOpen, onClose, onJsonUploaded }: JsonUploadModalProps) => {
    const [isDragging, setIsDragging] = useState(false);
    const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    const validateJsonFile = async (jsonText: string): Promise<{ success: boolean; data?: any[]; error?: string }> => {
        try {
            const parsed = JSON.parse(jsonText);
            if (!Array.isArray(parsed)) {
                return { success: false, error: 'JSON must be an array of packets' };
            }
            return { success: true, data: parsed };
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Invalid JSON format' };
        }
    };

    const processFiles = async (files: FileList | File[]) => {
        setIsProcessing(true);
        const fileArray = Array.from(files);
        const jsonFiles = fileArray.filter(file => file.name.endsWith('.json'));

        if (jsonFiles.length === 0) {
            setUploadResult({
                successCount: 0,
                errorCount: 0,
                packetCount: 0,
                errors: [{ fileName: 'N/A', error: 'No .json files found' }]
            });
            setIsProcessing(false);
            return;
        }

        const results: UploadResult = {
            successCount: 0,
            errorCount: 0,
            packetCount: 0,
            errors: []
        };

        let combinedData: any[] = [];

        for (const file of jsonFiles) {
            try {
                const text = await file.text();
                const validation = await validateJsonFile(text);

                if (validation.success && validation.data) {
                    results.successCount++;
                    // Combine all successful JSON files
                    combinedData = [...combinedData, ...validation.data];
                } else {
                    results.errorCount++;
                    results.errors.push({
                        fileName: file.name,
                        error: validation.error || 'Unknown error'
                    });
                }
            } catch (error) {
                results.errorCount++;
                results.errors.push({
                    fileName: file.name,
                    error: error instanceof Error ? error.message : 'Failed to read file'
                });
            }
        }

        // If at least one file succeeded, process the data
        if (results.successCount > 0) {
            const result = onJsonUploaded(combinedData);

            if (result.success) {
                results.packetCount = result.packetCount;
            } else {
                // Data processing failed - treat all files as errors
                results.errorCount = results.successCount;
                results.successCount = 0;
                results.packetCount = 0;
                results.errors.push({
                    fileName: 'Combined Data',
                    error: result.error || 'Failed to process packet data'
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
                    <h2>Upload JSON Files</h2>
                    <p>Upload one or more .json files containing packet data.</p>

                    <div
                        className={`upload-area ${isDragging ? 'dragging' : ''}`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                    >
                        <input
                            type="file"
                            accept=".json"
                            onChange={handleFileSelect}
                            id="json-file-input"
                            multiple
                            style={{ display: 'none' }}
                        />
                        <label htmlFor="json-file-input" className="upload-label">
                            {isProcessing ? (
                                <>
                                    <div className="spinner"></div>
                                    <span>Processing files...</span>
                                </>
                            ) : (
                                <>
                                    <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48">
                                        <path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z" />
                                    </svg>
                                    <span>
                                        {isDragging
                                            ? 'Drop .json files here'
                                            : 'Drag & drop .json files here or click to select'}
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
                                        <div>{uploadResult.successCount} JSON file{uploadResult.successCount !== 1 ? 's' : ''} successfully loaded</div>
                                        <div className="mapping-count">{uploadResult.packetCount} packet{uploadResult.packetCount !== 1 ? 's' : ''} imported</div>
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
