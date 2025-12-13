// Processing Panel component for screenshot analysis
// Requirements: 5.4, 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3, 7.4
// Style: Unified Neo-Brutalism with FloatingPanel - Draggable & Resizable

import { useState, useEffect, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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

// Icons
const CloseIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
  >
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

const ExtractIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  </svg>
);

const NoteCardIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <line x1="9" y1="21" x2="9" y2="9" />
  </svg>
);

const CopyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </svg>
);

const DownloadIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

// Loading skeleton with Neo-Brutalism style
const SkeletonLoader = () => (
  <div style={{ padding: '20px' }}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {[75, 100, 85, 65].map((width, i) => (
        <div
          key={i}
          style={{
            height: '14px',
            width: `${width}%`,
            background: '#E5E7EB',
            border: '1px solid #000',
          }}
        />
      ))}
    </div>
    <div
      style={{
        marginTop: '16px',
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: '11px',
        color: '#666',
        textTransform: 'uppercase',
      }}
    >
      Processing...
    </div>
  </div>
);

// Drag hook - reused from FloatingPanel
function useDrag(initialPos: { x: number; y: number }) {
  const [position, setPosition] = useState(initialPos);
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      dragOffset.current = { x: e.clientX - position.x, y: e.clientY - position.y };
    },
    [position]
  );

  useEffect(() => {
    if (!isDragging) return;
    const handleMove = (e: MouseEvent) => {
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - 100, e.clientX - dragOffset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 50, e.clientY - dragOffset.current.y)),
      });
    };
    const handleUp = () => setIsDragging(false);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isDragging]);

  return { position, isDragging, handleMouseDown };
}

// Resize hook - reused from FloatingPanel
function useResize(initialSize: { width: number; height: number }) {
  const [size, setSize] = useState(initialSize);
  const [isResizing, setIsResizing] = useState(false);
  const startInfo = useRef({ x: 0, y: 0, width: 0, height: 0 });

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsResizing(true);
      startInfo.current = { x: e.clientX, y: e.clientY, width: size.width, height: size.height };
    },
    [size]
  );

  useEffect(() => {
    if (!isResizing) return;
    const handleMove = (e: MouseEvent) => {
      setSize({
        width: Math.max(
          360,
          Math.min(700, startInfo.current.width + (e.clientX - startInfo.current.x))
        ),
        height: Math.max(
          400,
          Math.min(
            window.innerHeight - 60,
            startInfo.current.height + (e.clientY - startInfo.current.y)
          )
        ),
      });
    };
    const handleUp = () => setIsResizing(false);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isResizing]);

  return { size, isResizing, handleResizeStart };
}

// Button styles with hover/active animations matching SettingsView
const buttonBaseStyle: React.CSSProperties = {
  position: 'relative',
  padding: '8px 16px',
  fontSize: '12px',
  fontWeight: 700,
  fontFamily: '"Space Grotesk", sans-serif',
  textTransform: 'uppercase',
  border: '1px solid #000',
  borderRadius: '4px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  transition: 'all 150ms ease-out',
};

// Action button with hover effects
const ActionButton = ({
  onClick,
  disabled,
  primary,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  children: React.ReactNode;
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  const getTransform = () => {
    if (disabled) return 'none';
    if (isPressed) return 'translate(1px, 1px)';
    if (isHovered) return 'translate(-1px, -1px)';
    return 'none';
  };

  const getShadow = () => {
    if (disabled) return '2px 2px 0 0 #ccc';
    if (isPressed) return '0 0 0 0 #000';
    if (isHovered) return '3px 3px 0 0 #000';
    return '2px 2px 0 0 #000';
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setIsPressed(false);
      }}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      style={{
        ...buttonBaseStyle,
        flex: 1,
        background: primary ? '#000' : '#fff',
        color: primary ? '#fff' : '#000',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transform: getTransform(),
        boxShadow: getShadow(),
      }}
    >
      {children}
    </button>
  );
};

// Small button for secondary actions with hover effects
const SmallButton = ({
  onClick,
  children,
  active,
  primary,
}: {
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
  primary?: boolean;
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  const getTransform = () => {
    if (active) return 'translate(1px, 1px)';
    if (isPressed) return 'translate(1px, 1px)';
    if (isHovered) return 'translate(-1px, -1px)';
    return 'none';
  };

  const getShadow = () => {
    if (active || isPressed) return '0 0 0 0 #000';
    if (isHovered) return '2px 2px 0 0 #000';
    return '1px 1px 0 0 #000';
  };

  const getBg = () => {
    if (active) return '#10B981';
    if (primary) return '#4F46E5';
    if (isHovered) return '#F9FAFB';
    return '#fff';
  };

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setIsPressed(false);
      }}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      style={{
        padding: '4px 10px',
        background: getBg(),
        border: '1px solid #000',
        borderRadius: '4px',
        color: active || primary ? '#fff' : '#000',
        fontSize: '11px',
        fontWeight: 700,
        fontFamily: '"JetBrains Mono", monospace',
        textTransform: 'uppercase',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        transition: 'all 150ms ease-out',
        transform: getTransform(),
        boxShadow: getShadow(),
      }}
    >
      {children}
    </button>
  );
};

export function ProcessingPanel({ screenshot, onClose }: ProcessingPanelProps) {
  const [mode, setMode] = useState<PanelMode>('idle');
  const [extractedText, setExtractedText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [noteCard, setNoteCard] = useState<NoteCardResult | null>(null);
  const [noteCardCopied, setNoteCardCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const requestIdRef = useRef<string | null>(null);

  // Draggable and resizable - positioned at right side initially
  const { position, isDragging, handleMouseDown } = useDrag({
    x: Math.max(20, window.innerWidth - 440),
    y: Math.max(20, (window.innerHeight - 550) / 2),
  });
  const { size, isResizing, handleResizeStart } = useResize({ width: 420, height: 550 });

  const isInteracting = isDragging || isResizing;

  useEffect(() => {
    requestIdRef.current = requestId;
  }, [requestId]);

  useEffect(() => {
    const handleMessage = (message: StreamingMessage) => {
      const currentRequestId = requestIdRef.current;
      if (!currentRequestId || message.requestId !== currentRequestId) return;

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
  }, []);

  useEffect(() => {
    return () => {
      if (requestId) {
        chrome.runtime.sendMessage({ action: 'cancel_request', payload: { requestId } });
      }
    };
  }, [requestId]);

  const handleExtractText = useCallback(() => {
    setMode('loading');
    setExtractedText('');
    setError(null);

    chrome.runtime.sendMessage(
      { action: 'extract_screenshot', payload: { imageBase64: screenshot.imageBase64 } },
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
      /* ignore */
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
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      setNoteCardCopied(true);
      setTimeout(() => setNoteCardCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const isDisabled = mode === 'loading' || mode === 'streaming';

  // Panel styles - matching FloatingPanel
  const panelStyle: React.CSSProperties = {
    position: 'fixed',
    left: position.x,
    top: position.y,
    width: collapsed ? 300 : size.width,
    height: collapsed ? 'auto' : size.height,
    zIndex: 999998,
    display: 'flex',
    flexDirection: 'column',
    fontFamily: '"Space Grotesk", sans-serif',
    background: '#FFFDF5',
    border: '1px solid #000',
    borderRadius: '6px',
    boxShadow: isDragging ? '4px 4px 0px rgba(0,0,0,0.5)' : '2px 2px 0px #000',
    transition: 'box-shadow 0.1s, width 0.1s, height 0.1s',
    userSelect: isInteracting ? 'none' : 'auto',
  };

  return (
    <div data-knowledgelens="processing-panel" style={panelStyle}>
      {/* Header - Draggable */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          background: '#4F46E5',
          borderBottom: '1px solid #000',
          borderRadius: '5px 5px 0 0',
          cursor: isDragging ? 'grabbing' : 'grab',
          flexShrink: 0,
        }}
        onMouseDown={handleMouseDown}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: '10px',
              height: '10px',
              background: '#10B981',
              border: '1px solid #000',
            }}
          />
          <span
            style={{
              fontWeight: 700,
              fontSize: '13px',
              color: '#fff',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              fontFamily: '"JetBrains Mono", monospace',
            }}
          >
            SCREENSHOT
          </span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => setCollapsed(!collapsed)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold',
            }}
          >
            {collapsed ? '□' : '_'}
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              padding: '2px',
              display: 'flex',
            }}
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* Screenshot preview */}
          <div style={{ padding: '12px', background: '#fff', borderBottom: '1px solid #000' }}>
            <div
              style={{
                border: '1px solid #000',
                boxShadow: '2px 2px 0 0 #000',
                overflow: 'hidden',
              }}
            >
              <img
                src={`data:image/png;base64,${screenshot.imageBase64}`}
                alt="Captured screenshot"
                style={{
                  width: '100%',
                  maxHeight: '160px',
                  objectFit: 'contain',
                  display: 'block',
                  background: '#F3F4F6',
                }}
              />
            </div>
            <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
              <SmallButton onClick={handleDownloadImage}>
                <DownloadIcon />
                <span>Download</span>
              </SmallButton>
            </div>
          </div>

          {/* AI Actions */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #000', background: '#fff' }}>
            <div
              style={{
                fontSize: '10px',
                fontWeight: 700,
                color: '#000',
                marginBottom: '10px',
                fontFamily: '"JetBrains Mono", monospace',
                textTransform: 'uppercase',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span style={{ background: '#000', color: '#fff', padding: '1px 4px' }}>AI</span>
              <span>Analysis</span>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <ActionButton onClick={handleExtractText} disabled={isDisabled} primary>
                <ExtractIcon />
                <span>Extract</span>
              </ActionButton>
              <ActionButton onClick={handleGenerateNoteCard} disabled={isDisabled}>
                <NoteCardIcon />
                <span>Note Card</span>
              </ActionButton>
            </div>
          </div>

          {/* Content area */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, background: '#FAFAFA' }}>
            {mode === 'loading' && <SkeletonLoader />}

            {(mode === 'streaming' || mode === 'success') && extractedText && (
              <div style={{ padding: '16px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '12px',
                  }}
                >
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      fontFamily: '"JetBrains Mono", monospace',
                      textTransform: 'uppercase',
                      background: '#000',
                      color: '#fff',
                      padding: '2px 6px',
                    }}
                  >
                    Extracted
                  </span>
                  <SmallButton onClick={handleCopyText} active={copied}>
                    <CopyIcon />
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </SmallButton>
                </div>
                <div
                  className="kl-markdown"
                  style={{
                    background: '#fff',
                    border: '1px solid #000',
                    padding: '16px',
                    boxShadow: '2px 2px 0 0 #ccc',
                  }}
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{extractedText}</ReactMarkdown>
                  {mode === 'streaming' && (
                    <span
                      style={{
                        display: 'inline-block',
                        width: '8px',
                        height: '16px',
                        background: '#4F46E5',
                        marginLeft: '4px',
                        animation: 'blink 1s step-end infinite',
                      }}
                    />
                  )}
                </div>
              </div>
            )}

            {mode === 'notecard' && noteCard && (
              <div style={{ padding: '16px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '12px',
                  }}
                >
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      fontFamily: '"JetBrains Mono", monospace',
                      textTransform: 'uppercase',
                      background: '#000',
                      color: '#fff',
                      padding: '2px 6px',
                    }}
                  >
                    Note Card
                  </span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <SmallButton onClick={handleCopyNoteCard} active={noteCardCopied}>
                      <CopyIcon />
                      <span>{noteCardCopied ? 'Copied' : 'Copy'}</span>
                    </SmallButton>
                    <SmallButton onClick={handleDownloadNoteCard} primary>
                      <DownloadIcon />
                      <span>Download</span>
                    </SmallButton>
                  </div>
                </div>
                <div
                  style={{
                    background: '#fff',
                    border: '1px solid #000',
                    padding: '12px',
                    boxShadow: '2px 2px 0 0 #ccc',
                  }}
                >
                  <img
                    src={noteCard.imageDataUrl}
                    alt="Generated note card"
                    style={{ width: '100%', display: 'block' }}
                  />
                </div>
              </div>
            )}

            {mode === 'error' && (
              <div style={{ padding: '16px' }}>
                <div
                  style={{
                    border: '1px solid #000',
                    background: '#FEF2F2',
                    padding: '12px',
                    color: '#DC2626',
                    fontFamily: '"JetBrains Mono", monospace',
                    fontSize: '12px',
                    boxShadow: '2px 2px 0 0 #000',
                  }}
                >
                  ERROR: {error}
                </div>
              </div>
            )}

            {mode === 'idle' && (
              <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                <div
                  style={{
                    fontSize: '12px',
                    color: '#666',
                    fontFamily: '"JetBrains Mono", monospace',
                  }}
                >
                  Select an AI action above to analyze this screenshot
                </div>
              </div>
            )}
          </div>

          {/* Footer - Source info */}
          <div
            style={{
              padding: '10px 16px',
              borderTop: '1px solid #000',
              background: '#fff',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              borderRadius: '0 0 5px 5px',
            }}
          >
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                fontFamily: '"JetBrains Mono", monospace',
                background: '#E5E7EB',
                padding: '2px 4px',
                border: '1px solid #000',
              }}
            >
              SRC
            </span>
            <span
              style={{
                fontSize: '11px',
                color: '#374151',
                fontFamily: '"JetBrains Mono", monospace',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
              }}
            >
              {screenshot.pageTitle || screenshot.pageUrl}
            </span>
          </div>

          {/* Resize Grip */}
          <div
            onMouseDown={handleResizeStart}
            style={{
              position: 'absolute',
              bottom: 2,
              right: 2,
              width: 12,
              height: 12,
              cursor: 'se-resize',
              background: 'linear-gradient(135deg, transparent 50%, #000 50%)',
              opacity: 0.5,
            }}
          />
        </>
      )}

      {/* Shared styles */}
      <style>{`
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        
        .kl-markdown {
          font-family: 'Space Grotesk', -apple-system, sans-serif;
          font-size: 14px;
          color: #171717;
          line-height: 1.7;
        }
        .kl-markdown > *:first-child { margin-top: 0; }
        .kl-markdown > *:last-child { margin-bottom: 0; }
        
        .kl-markdown h1, .kl-markdown h2, .kl-markdown h3 {
          font-weight: 700;
          margin-top: 1.5em;
          margin-bottom: 0.5em;
          color: #000;
          letter-spacing: -0.02em;
        }
        .kl-markdown h1 { font-size: 1.25em; border-bottom: 2px solid #000; padding-bottom: 4px; text-transform: uppercase; }
        .kl-markdown h2 { font-size: 1.1em; }
        .kl-markdown h3 { font-size: 1em; }
        
        .kl-markdown p { margin: 0.75em 0; }
        
        .kl-markdown code {
          background: #F3F4F6;
          border: 1px solid #E5E7EB;
          padding: 2px 5px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.85em;
          color: #4F46E5;
          border-radius: 2px;
        }
        .kl-markdown pre {
          background: #111;
          color: #eee;
          padding: 14px;
          border: 1px solid #000;
          overflow-x: auto;
          margin: 1em 0;
          box-shadow: 2px 2px 0 0 #ccc;
        }
        .kl-markdown pre code { background: none; border: none; padding: 0; color: inherit; font-size: 0.9em; }
        
        .kl-markdown a { color: #4F46E5; text-decoration: underline; text-decoration-thickness: 2px; font-weight: 600; }
        .kl-markdown a:hover { background: #EEF2FF; }
        
        .kl-markdown blockquote { border-left: 3px solid #000; margin: 1em 0; padding: 0.5em 1em; background: #fff; font-style: italic; }
        
        .kl-markdown ul, .kl-markdown ol { padding-left: 1.5em; margin: 0.75em 0; }
        .kl-markdown li { margin: 0.25em 0; }
        .kl-markdown li::marker { color: #4F46E5; font-weight: bold; }
        
        .kl-markdown table { width: 100%; border-collapse: collapse; margin: 1em 0; border: 1px solid #000; }
        .kl-markdown th, .kl-markdown td { border: 1px solid #000; padding: 8px 12px; text-align: left; }
        .kl-markdown th { background: #000; color: #fff; font-weight: 700; text-transform: uppercase; font-size: 0.85em; }
        .kl-markdown tr:nth-child(even) { background: #F9FAFB; }
        
        .kl-markdown hr { border: none; border-top: 2px solid #000; margin: 1.5em 0; }
        .kl-markdown img { max-width: 100%; border: 1px solid #000; box-shadow: 2px 2px 0 0 #ccc; }
      `}</style>
    </div>
  );
}
