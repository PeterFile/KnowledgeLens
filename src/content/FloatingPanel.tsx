// Draggable and resizable floating panel for AI responses with Markdown support

import { useEffect, useState, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { StreamingMessage } from '../types';

type PanelStatus = 'loading' | 'streaming' | 'done' | 'error';

interface FloatingPanelProps {
  selectedText: string;
  context: string;
  mode: 'explain' | 'search';
  onClose: () => void;
}

// Icons
const CloseIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

const CopyIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect width="14" height="14" x="8" y="8" rx="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </svg>
);

const RetryIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
    <path d="M16 16h5v5" />
  </svg>
);

const MinimizeIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
  >
    <path d="M5 12h14" />
  </svg>
);

const ExpandIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
  >
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </svg>
);

const SkeletonLoader = () => (
  <div className="animate-pulse space-y-4 p-1">
    <div className="h-4 bg-gray-200 rounded w-4/5" />
    <div className="space-y-2">
      <div className="h-3 bg-gray-200 rounded w-full" />
      <div className="h-3 bg-gray-200 rounded w-11/12" />
      <div className="h-3 bg-gray-200 rounded w-3/4" />
    </div>
    <div className="h-4 bg-gray-200 rounded w-2/3" />
    <div className="space-y-2">
      <div className="h-3 bg-gray-200 rounded w-full" />
      <div className="h-3 bg-gray-200 rounded w-5/6" />
    </div>
  </div>
);

// Drag hook
function useDrag(initialPos: { x: number; y: number }) {
  const [position, setPosition] = useState(initialPos);
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
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
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, [isDragging]);

  return { position, isDragging, handleMouseDown };
}

// Resize hook
function useResize(
  initialSize: { width: number; height: number },
  minSize = { width: 320, height: 200 }
) {
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
      const deltaX = e.clientX - startInfo.current.x;
      const deltaY = e.clientY - startInfo.current.y;
      setSize({
        width: Math.max(minSize.width, Math.min(800, startInfo.current.width + deltaX)),
        height: Math.max(
          minSize.height,
          Math.min(window.innerHeight - 40, startInfo.current.height + deltaY)
        ),
      });
    };
    const handleUp = () => setIsResizing(false);
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, [isResizing, minSize.width, minSize.height]);

  return { size, isResizing, handleResizeStart };
}

export function FloatingPanel({ selectedText, context, mode, onClose }: FloatingPanelProps) {
  const [status, setStatus] = useState<PanelStatus>('loading');
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const { position, isDragging, handleMouseDown } = useDrag({
    x: Math.max(20, window.innerWidth - 480),
    y: Math.max(20, (window.innerHeight - 450) / 2),
  });

  const { size, isResizing, handleResizeStart } = useResize({ width: 440, height: 420 });

  const sendRequest = useCallback(() => {
    setStatus('loading');
    setContent('');
    setError(null);
    const action = mode === 'search' ? 'search_enhance' : 'explain_text';
    chrome.runtime.sendMessage({ action, payload: { text: selectedText, context } }, (response) => {
      if (response?.success && response.data?.requestId) {
        setRequestId(response.data.requestId);
      } else if (response?.error) {
        setError(response.error);
        setStatus('error');
      }
    });
  }, [mode, selectedText, context]);

  useEffect(() => {
    const handleMessage = (message: StreamingMessage) => {
      if (!requestId || message.requestId !== requestId) return;
      switch (message.type) {
        case 'streaming_start':
          setStatus('streaming');
          setContent('');
          break;
        case 'streaming_chunk':
          if (message.chunk) setContent((prev) => prev + message.chunk);
          break;
        case 'streaming_end':
          setStatus('done');
          break;
        case 'streaming_error':
          setError(message.error || 'An error occurred');
          setStatus('error');
          break;
      }
    };
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [requestId]);

  // Initial request on mount
  useEffect(() => {
    sendRequest();
  }, [sendRequest]);

  useEffect(() => {
    return () => {
      if (requestId) {
        chrome.runtime.sendMessage({ action: 'cancel_request', payload: { requestId } });
      }
    };
  }, [requestId]);

  const handleCopy = async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API might fail in some contexts
    }
  };

  const title = mode === 'search' ? 'Search & Explain' : 'AI Explanation';
  const isInteracting = isDragging || isResizing;

  return (
    <div
      data-knowledgelens="floating-panel"
      className="fixed flex flex-col font-sans overflow-hidden"
      style={{
        left: position.x,
        top: position.y,
        width: collapsed ? 280 : size.width,
        height: collapsed ? 'auto' : size.height,
        maxWidth: 'calc(100vw - 40px)',
        maxHeight: 'calc(100vh - 40px)',
        zIndex: 999998,
        userSelect: isInteracting ? 'none' : 'auto',
        borderRadius: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.1)',
        background: '#ffffff',
        border: '1px solid #e5e7eb',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2.5 select-none shrink-0"
        style={{
          background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
          cursor: isDragging ? 'grabbing' : 'grab',
          borderRadius: '11px 11px 0 0',
        }}
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2 text-white">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
          </svg>
          <span className="text-sm font-semibold tracking-wide">{title}</span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-7 h-7 rounded-md flex items-center justify-center transition-colors border-0 cursor-pointer"
            style={{ background: 'rgba(255,255,255,0.15)', color: 'white' }}
            onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.25)')}
            onMouseOut={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
            title={collapsed ? 'Expand' : 'Minimize'}
          >
            {collapsed ? <ExpandIcon /> : <MinimizeIcon />}
          </button>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md flex items-center justify-center transition-colors border-0 cursor-pointer"
            style={{ background: 'rgba(255,255,255,0.15)', color: 'white' }}
            onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(239,68,68,0.9)')}
            onMouseOut={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
            title="Close"
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* Selected text */}
          <div
            className="px-4 py-2.5 border-b shrink-0"
            style={{ background: '#f8fafc', borderColor: '#e2e8f0' }}
          >
            <p className="text-xs font-medium mb-1" style={{ color: '#64748b' }}>
              Selected text:
            </p>
            <p className="text-sm leading-relaxed line-clamp-2" style={{ color: '#334155' }}>
              {selectedText}
            </p>
          </div>

          {/* Content */}
          <div
            className="flex-1 overflow-y-auto min-h-0 px-5 py-4"
            style={{ background: '#ffffff' }}
          >
            {status === 'loading' && <SkeletonLoader />}

            {(status === 'streaming' || status === 'done') && (
              <article className="markdown-content">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                {status === 'streaming' && (
                  <span
                    className="inline-block w-2 h-5 ml-0.5 animate-pulse align-text-bottom"
                    style={{ background: '#3b82f6' }}
                  />
                )}
              </article>
            )}

            {status === 'error' && (
              <div
                className="p-4 rounded-lg"
                style={{ background: '#fef2f2', border: '1px solid #fecaca' }}
              >
                <p className="text-sm" style={{ color: '#dc2626' }}>
                  {error}
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            className="px-4 py-2.5 border-t flex items-center gap-2 shrink-0"
            style={{ background: '#f8fafc', borderColor: '#e2e8f0' }}
          >
            <button
              onClick={sendRequest}
              disabled={status === 'loading' || status === 'streaming'}
              className="px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: '#e2e8f0', color: '#475569' }}
              onMouseOver={(e) =>
                !e.currentTarget.disabled && (e.currentTarget.style.background = '#cbd5e1')
              }
              onMouseOut={(e) => (e.currentTarget.style.background = '#e2e8f0')}
            >
              <RetryIcon />
              <span>Retry</span>
            </button>
            <button
              onClick={handleCopy}
              disabled={!content}
              className="px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: '#e2e8f0', color: '#475569' }}
              onMouseOver={(e) =>
                !e.currentTarget.disabled && (e.currentTarget.style.background = '#cbd5e1')
              }
              onMouseOut={(e) => (e.currentTarget.style.background = '#e2e8f0')}
            >
              <CopyIcon />
              <span>{copied ? 'Copied!' : 'Copy'}</span>
            </button>
          </div>

          {/* Resize handle */}
          <div
            className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
            style={{ background: 'linear-gradient(135deg, transparent 50%, #cbd5e1 50%)' }}
            onMouseDown={handleResizeStart}
          />
        </>
      )}
    </div>
  );
}
