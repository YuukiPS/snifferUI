import { useState } from 'react';
import * as protobuf from 'protobufjs';
import './ProtoUploadModal.css';

interface ProtoUploadModalProps {
    isOpen: boolean;
    onClose: () => void;
    onProtoUploaded: (protoText: string) => { success: boolean; mappingCount: number; error?: string };
}

interface UploadResult {
    successCount: number;
    errorCount: number;
    cmdIdMappings: number;
    errors: Array<{ fileName: string; error: string }>;
}

export const ProtoUploadModal = ({ isOpen, onClose, onProtoUploaded }: ProtoUploadModalProps) => {
    const [isDragging, setIsDragging] = useState(false);
    const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    const validateProtoFile = async (protoText: string): Promise<{ success: boolean; error?: string }> => {
        try {
            const parsed = protobuf.parse(protoText);
            if (!parsed.root) {
                return { success: false, error: 'Invalid proto file structure' };
            }
            return { success: true };
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    };

    const processFiles = async (files: FileList | File[]) => {
        setIsProcessing(true);
        const fileArray = Array.from(files);
        const protoFiles = fileArray.filter(file => file.name.endsWith('.proto'));

        if (protoFiles.length === 0) {
            setUploadResult({
                successCount: 0,
                errorCount: 0,
                cmdIdMappings: 0,
                errors: [{ fileName: 'N/A', error: 'No .proto files found' }]
            });
            setIsProcessing(false);
            return;
        }

        const results: UploadResult = {
            successCount: 0,
            errorCount: 0,
            cmdIdMappings: 0,
            errors: []
        };

        let combinedProtoText = '';

        for (const file of protoFiles) {
            try {
                const text = await file.text();
                const validation = await validateProtoFile(text);

                if (validation.success) {
                    results.successCount++;
                    // Combine all successful proto files
                    combinedProtoText += `\n// File: ${file.name}\n${text}\n`;
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

        // If at least one file succeeded, save and upload
        if (results.successCount > 0) {
            localStorage.setItem("protoFileContent", combinedProtoText);
            const result = onProtoUploaded(combinedProtoText);

            if (result.success) {
                results.cmdIdMappings = result.mappingCount;
            } else {
                // Proto parsing failed - treat all files as errors
                results.errorCount = results.successCount;
                results.successCount = 0;
                results.cmdIdMappings = 0;
                results.errors.push({
                    fileName: 'Combined Proto',
                    error: result.error || 'Failed to parse combined proto files'
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
                    <h2>Upload Proto Files</h2>
                    <p>Upload one or more .proto files to enable binary packet decoding.</p>

                    <div
                        className={`upload-area ${isDragging ? 'dragging' : ''}`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                    >
                        <input
                            type="file"
                            accept=".proto"
                            onChange={handleFileSelect}
                            id="proto-file-input"
                            multiple
                            style={{ display: 'none' }}
                        />
                        <label htmlFor="proto-file-input" className="upload-label">
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
                                            ? 'Drop .proto files here'
                                            : 'Drag & drop .proto files here or click to select'}
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
                                        <div>{uploadResult.successCount} proto file{uploadResult.successCount !== 1 ? 's' : ''} successfully built</div>
                                        <div className="mapping-count">{uploadResult.cmdIdMappings} cmdId mapping{uploadResult.cmdIdMappings !== 1 ? 's' : ''} found</div>
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
