// Processing Panel component for screenshot analysis
// Requirements: 5.4, 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3, 7.4
// - Display captured screenshot, provide AI analysis options
// - Send screenshot to multimodal LLM for text extraction
// - Generate note cards with metadata and QR codes
// - Download and copy note cards

import { useState, useEffect, useCallback } from 'react';
import type { ScreenshotResult, StreamingMessage } from '../types';

interface ProcessingPanelProps {
  screenshot: ScreenshotResult;
  onClose: () => void;
}

type PanelMode = 'idle' | 'loading' | 'streaming' | 'success' | 'error' | 'notecard';

interface NoteCardResult {
  imageDataUrl: string;
  width: number;
  height: number;
}

// Shared styles
const styles = {
  panel: {
    position: 'fixed' as const,
    right: 0,
    top: 0,
    height: '100%',
    width: '384px',
    maxWidth: '100vw',
    backgroundColor: 'white',
    boxShadow: '-4px 0 20px rgba(0, 0, 0, 0.15)',
    zIndex: 999998,
    display: 'flex',
    flexDirection: 'column' as const,
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px',
    borderBottom: '1px solid #e5e7eb',
  },
  title: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#1f2937',
    margin: 0,
  },
  iconButton: {
    padding: '8px',
    borderRadius: '6px',
    border: 'none',
    background: 'transparent',
    color: '#6b7280',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewSection: {
    padding: '12px',
    backgroundColor: '#f9fafb',
    borderBottom: '1px solid #e5e7eb',
  },
  previewImage: {
    width: '100%',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
    maxHeight: '200px',
    objectFit: 'contain' as const,
  },
  actionsRow: {
    marginTop: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  smallButton: {
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    backgroundColor: '#f3f4f6',
    color: '#374151',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  aiSection: {
    padding: '12px',
    borderBottom: '1px solid #e5e7eb',
  },
  sectionLabel: {
    fontSize: '12px',
    color: '#6b7280',
    marginBottom: '8px',
  },
  buttonRow: {
    display: 'flex',
    gap: '8px',
  },
  primaryButton: {
    flex: 1,
    padding: '8px 12px',
    borderRadius: '6px',
    backgroundColor: '#3b82f6',
    color: 'white',
    fontSize: '14px',
    fontWeight: 500,
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
  secondaryButton: {
    flex: 1,
    padding: '8px 12px',
    borderRadius: '6px',
    backgroundColor: '#f3f4f6',
    color: '#374151',
    fontSize: '14px',
    fontWeight: 500,
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
  disabledButton: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  contentArea: {
    flex: 1,
    overflowY: 'auto' as const,
    minHeight: 0,
  },
  contentPadding: {
    padding: '16px',
  },
  extractedTextBox: {
    fontSize: '14px',
    color: '#374151',
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
    padding: '12px',
  },
  cursor: {
    display: 'inline-block',
    width: '8px',
    height: '16px',
    backgroundColor: '#3b82f6',
    marginLeft: '4px',
    animation: 'pulse 1s infinite',
  },
  errorBox: {
    padding: '12px',
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
  },
  errorText: {
    fontSize: '14px',
    color: '#b91c1c',
    margin: 0,
  },
  idleText: {
    textAlign: 'center' as const,
    color: '#6b7280',
    fontSize: '14px',
  },
  footer: {
    padding: '12px',
    borderTop: '1px solid #e5e7eb',
    backgroundColor: '#f9fafb',
  },
  footerText: {
    fontSize: '12px',
    color: '#6b7280',
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  skeleton: {
    height: '16px',
    backgroundColor: '#e5e7eb',
    borderRadius: '4px',
    marginBottom: '12px',
  },
};

// Close icon
const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

// Extract text icon
const ExtractIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  </svg>
);

// Note card icon
const NoteCardIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <line x1="9" y1="21" x2="9" y2="9" />
  </svg>
);

// Copy icon
const CopyIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </svg>
);

// Download icon
const DownloadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

// Skeleton loader
const SkeletonLoader = () => (
  <div style={styles.contentPadding}>
    <div style={{ ...styles.skeleton, width: '75%' }} />
    <div style={{ ...styles.skeleton, width: '100%' }} />
    <div style={{ ...styles.skeleton, width: '85%' }} />
    <div style={{ ...styles.skeleton, width: '65%' }} />
  </div>
);

export function ProcessingPanel({ screenshot, onClose }: ProcessingPanelProps) {
  const [mode, setMode] = useState<PanelMode>('idle');
  const [extractedText, setExtractedText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [noteCard, setNoteCard] = useState<NoteCardResult | null>(null);
  const [noteCardCopied, setNoteCardCopied] = useState(false);

  // Handle streaming messages
  useEffect(() => {
    const handleMessage = (message: StreamingMessage) => {
      if (!requestId || message.requestId !== requestId) return;

      switch (message.type) {
        case 'streaming_start':
          setMode('streaming');
          setExtractedText('');
          break;
        case 'streaming_chunk':
          if (message.chunk) {
            setExtractedText((prev) => prev + message.chunk);
          }
          break;
        case 'streaming_end':
          setMode('success');
          break;
        case 'streaming_error':
          setError(message.error || 'An error occurred');
          setMode('error');
          break;
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [requestId]);

  // Cancel request on unmount
  useEffect(() => {
    return () => {
      if (requestId) {
        chrome.runtime.sendMessage({
          action: 'cancel_request',
          payload: { requestId },
        });
      }
    };
  }, [requestId]);

  const handleExtractText = useCallback(() => {
    setMode('loading');
    setExtractedText('');
    setError(null);

    chrome.runtime.sendMessage(
      {
        action: 'extract_screenshot',
        payload: { imageBase64: screenshot.imageBase64 },
      },
      (response) => {
        if (response?.success && response.data?.requestId) {
          setRequestId(response.data.requestId);
        } else if (response?.error) {
          setError(response.error);
          setMode('error');
        }
      }
    );
  }, [screenshot.imageBase64]);

  const handleGenerateNoteCard = useCallback(() => {
    setMode('loading');
    setError(null);
    setNoteCard(null);

    chrome.runtime.sendMessage(
      {
        action: 'generate_note_card',
        payload: {
          imageBase64: screenshot.imageBase64,
          extractedText: extractedText || '',
          pageUrl: screenshot.pageUrl,
          pageTitle: screenshot.pageTitle,
          favicon: screenshot.favicon,
        },
      },
      (response) => {
        if (response?.success && response.data) {
          setNoteCard(response.data as NoteCardResult);
          setMode('notecard');
        } else if (response?.error) {
          setError(response.error);
          setMode('error');
        }
      }
    );
  }, [screenshot, extractedText]);

  const handleCopyText = async () => {
    if (!extractedText) return;
    try {
      await navigator.clipboard.writeText(extractedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API might fail in some contexts
    }
  };

  const handleDownloadImage = () => {
    const link = document.createElement('a');
    link.href = `data:image/png;base64,${screenshot.imageBase64}`;
    link.download = `screenshot-${Date.now()}.png`;
    link.click();
  };

  const handleDownloadNoteCard = () => {
    if (!noteCard) return;
    const link = document.createElement('a');
    link.href = noteCard.imageDataUrl;
    link.download = `note-card-${Date.now()}.png`;
    link.click();
  };

  const handleCopyNoteCard = async () => {
    if (!noteCard) return;
    try {
      const response = await fetch(noteCard.imageDataUrl);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob,
        }),
      ]);
      setNoteCardCopied(true);
      setTimeout(() => setNoteCardCopied(false), 2000);
    } catch {
      // Clipboard API might fail in some contexts
    }
  };

  const isDisabled = mode === 'loading' || mode === 'streaming';

  return (
    <div data-knowledgelens="processing-panel" style={styles.panel}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>Screenshot</h2>
        <button onClick={onClose} style={styles.iconButton} title="Close">
          <CloseIcon />
        </button>
      </div>

      {/* Screenshot preview */}
      <div style={styles.previewSection}>
        <img
          src={`data:image/png;base64,${screenshot.imageBase64}`}
          alt="Captured screenshot"
          style={styles.previewImage}
        />
        <div style={styles.actionsRow}>
          <button onClick={handleDownloadImage} style={styles.smallButton}>
            <DownloadIcon />
            <span>Download</span>
          </button>
        </div>
      </div>

      {/* AI Actions */}
      <div style={styles.aiSection}>
        <p style={styles.sectionLabel}>AI Analysis</p>
        <div style={styles.buttonRow}>
          <button
            onClick={handleExtractText}
            disabled={isDisabled}
            style={{
              ...styles.primaryButton,
              ...(isDisabled ? styles.disabledButton : {}),
            }}
          >
            <ExtractIcon />
            <span>Extract Text</span>
          </button>
          <button
            onClick={handleGenerateNoteCard}
            disabled={isDisabled}
            style={{
              ...styles.secondaryButton,
              ...(isDisabled ? styles.disabledButton : {}),
            }}
          >
            <NoteCardIcon />
            <span>Note Card</span>
          </button>
        </div>
      </div>

      {/* Content area */}
      <div style={styles.contentArea}>
        {mode === 'loading' && <SkeletonLoader />}

        {(mode === 'streaming' || mode === 'success') && extractedText && (
          <div style={styles.contentPadding}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '8px',
              }}
            >
              <p style={styles.sectionLabel}>Extracted Text</p>
              <button onClick={handleCopyText} style={styles.smallButton}>
                <CopyIcon />
                <span>{copied ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
            <div style={styles.extractedTextBox}>
              {extractedText}
              {mode === 'streaming' && <span style={styles.cursor} />}
            </div>
          </div>
        )}

        {mode === 'notecard' && noteCard && (
          <div style={styles.contentPadding}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '8px',
              }}
            >
              <p style={styles.sectionLabel}>Generated Note Card</p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={handleCopyNoteCard} style={styles.smallButton}>
                  <CopyIcon />
                  <span>{noteCardCopied ? 'Copied!' : 'Copy'}</span>
                </button>
                <button
                  onClick={handleDownloadNoteCard}
                  style={{ ...styles.smallButton, backgroundColor: '#3b82f6', color: 'white' }}
                >
                  <DownloadIcon />
                  <span>Download</span>
                </button>
              </div>
            </div>
            <div style={{ backgroundColor: '#f9fafb', borderRadius: '8px', padding: '12px' }}>
              <img
                src={noteCard.imageDataUrl}
                alt="Generated note card"
                style={{
                  width: '100%',
                  borderRadius: '4px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                }}
              />
            </div>
          </div>
        )}

        {mode === 'error' && (
          <div style={styles.contentPadding}>
            <div style={styles.errorBox}>
              <p style={styles.errorText}>{error}</p>
            </div>
          </div>
        )}

        {mode === 'idle' && (
          <div style={styles.contentPadding}>
            <p style={styles.idleText}>Select an AI action above to analyze this screenshot</p>
          </div>
        )}
      </div>

      {/* Source info */}
      <div style={styles.footer}>
        <p style={styles.footerText}>Source: {screenshot.pageTitle || screenshot.pageUrl}</p>
      </div>
    </div>
  );
}
