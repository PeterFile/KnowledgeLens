// Modern draggable and resizable floating panel for AI responses
// Requirements: 1.6, 9.3 - Display agent status and partial results

import { useEffect, useState, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { StreamingMessage, AgentStatusMessage } from '../types';
import type { AgentPhase } from '../lib/agent/types';

type PanelStatus = 'loading' | 'streaming' | 'done' | 'error' | 'agent_running';

interface FloatingPanelProps {
  selectedText: string;
  context: string;
  mode: 'explain' | 'search';
  onClose: () => void;
}

// Modern skeleton loader
const SkeletonLoader = () => (
  <div className="space-y-4">
    <div className="space-y-2">
      <div className="h-4 rounded-full w-3/4" style={{ background: 'rgba(99,102,241,0.15)' }} />
      <div className="h-3 rounded-full w-full" style={{ background: 'rgba(99,102,241,0.1)' }} />
      <div className="h-3 rounded-full w-5/6" style={{ background: 'rgba(99,102,241,0.1)' }} />
    </div>
    <div className="space-y-2">
      <div className="h-3 rounded-full w-full" style={{ background: 'rgba(99,102,241,0.08)' }} />
      <div className="h-3 rounded-full w-4/5" style={{ background: 'rgba(99,102,241,0.08)' }} />
    </div>
  </div>
);

// Agent status indicator (inline styles for content script)
const PHASE_LABELS: Record<AgentPhase | 'idle', { label: string; icon: string }> = {
  idle: { label: 'Ready', icon: '⏸️' },
  thinking: { label: 'Thinking', icon: '🧠' },
  executing: { label: 'Executing', icon: '⚡' },
  analyzing: { label: 'Analyzing', icon: '🔍' },
  reflecting: { label: 'Reflecting', icon: '💭' },
  synthesizing: { label: 'Synthesizing', icon: '✨' },
};

interface AgentStatusIndicatorProps {
  phase: AgentPhase | 'idle';
  step: { current: number; max: number };
  currentTool?: string;
  degradedMode?: boolean;
  degradedReason?: string;
  onCancel?: () => void;
}

const AgentStatusIndicator = ({
  phase,
  step,
  currentTool,
  degradedMode,
  degradedReason,
  onCancel,
}: AgentStatusIndicatorProps) => {
  const config = PHASE_LABELS[phase];
  const isRunning = phase !== 'idle';
  const progressPercent = step.max > 0 ? Math.round((step.current / step.max) * 100) : 0;

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Status header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 12px',
          background: isRunning
            ? 'linear-gradient(135deg, rgba(102,126,234,0.1) 0%, rgba(118,75,162,0.1) 100%)'
            : 'rgba(249,250,251,1)',
          borderRadius: 10,
          marginBottom: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>{config.icon}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#4c1d95' }}>{config.label}</span>
          {isRunning && currentTool && (
            <span style={{ fontSize: 12, color: '#6b7280' }}>· {currentTool}</span>
          )}
          {isRunning && (
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#667eea',
                animation: 'kl-pulse 1.5s infinite',
              }}
            />
          )}
        </div>
        {isRunning && onCancel && (
          <button
            onClick={onCancel}
            style={{
              padding: '4px 8px',
              fontSize: 11,
              color: '#6b7280',
              background: 'transparent',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#dc2626';
              e.currentTarget.style.background = 'rgba(220,38,38,0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#6b7280';
              e.currentTarget.style.background = 'transparent';
            }}
          >
            Cancel
          </button>
        )}
      </div>

      {/* Progress bar */}
      {isRunning && (
        <div style={{ padding: '0 4px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 11,
              color: '#6b7280',
              marginBottom: 4,
            }}
          >
            <span>
              Step {step.current} of {step.max}
            </span>
            <span>{progressPercent}%</span>
          </div>
          <div
            style={{
              height: 4,
              background: 'rgba(0,0,0,0.06)',
              borderRadius: 2,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${progressPercent}%`,
                background: 'linear-gradient(90deg, #667eea, #764ba2)',
                borderRadius: 2,
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      )}

      {/* Degraded mode warning */}
      {degradedMode && (
        <div
          style={{
            marginTop: 8,
            padding: '8px 10px',
            background: 'rgba(251,191,36,0.1)',
            border: '1px solid rgba(251,191,36,0.3)',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 14 }}>⚠️</span>
          <div style={{ fontSize: 12, color: '#92400e' }}>
            <span style={{ fontWeight: 600 }}>Degraded Mode</span>
            {degradedReason && <p style={{ margin: '4px 0 0 0' }}>{degradedReason}</p>}
          </div>
        </div>
      )}
    </div>
  );
};

// Drag hook
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

// Resize hook
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
          280,
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

export function FloatingPanel({ selectedText, context, mode, onClose }: FloatingPanelProps) {
  const [status, setStatus] = useState<PanelStatus>('loading');
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  // sessionId is used for agent operations (set when agent_execute is called)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Agent status state
  const [agentPhase, setAgentPhase] = useState<AgentPhase | 'idle'>('idle');
  const [agentStep, setAgentStep] = useState({ current: 0, max: 5 });
  const [agentTool, setAgentTool] = useState<string | undefined>();
  const [degradedMode, setDegradedMode] = useState(false);
  const [degradedReason, setDegradedReason] = useState<string | undefined>();

  const { position, isDragging, handleMouseDown } = useDrag({
    x: Math.max(20, window.innerWidth - 460),
    y: Math.max(20, (window.innerHeight - 480) / 2),
  });

  const { size, isResizing, handleResizeStart } = useResize({ width: 420, height: 460 });

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
    const handleMessage = (message: StreamingMessage | AgentStatusMessage) => {
      // Handle streaming messages
      if ('requestId' in message && requestId && message.requestId === requestId) {
        const streamMsg = message as StreamingMessage;
        switch (streamMsg.type) {
          case 'streaming_start':
            setStatus('streaming');
            setContent('');
            break;
          case 'streaming_chunk':
            if (streamMsg.chunk) setContent((prev) => prev + streamMsg.chunk);
            break;
          case 'streaming_end':
            setStatus('done');
            break;
          case 'streaming_error':
            setError(streamMsg.error || 'An error occurred');
            setStatus('error');
            break;
        }
      }

      // Handle agent status messages
      if ('sessionId' in message && sessionId && message.sessionId === sessionId) {
        const agentMsg = message as AgentStatusMessage;
        switch (agentMsg.type) {
          case 'agent_status_update':
            setStatus('agent_running');
            if (agentMsg.phase) setAgentPhase(agentMsg.phase);
            if (agentMsg.stepNumber !== undefined && agentMsg.maxSteps !== undefined) {
              setAgentStep({ current: agentMsg.stepNumber, max: agentMsg.maxSteps });
            }
            setAgentTool(agentMsg.currentTool);
            if (agentMsg.degradedMode !== undefined) setDegradedMode(agentMsg.degradedMode);
            if (agentMsg.degradedReason) setDegradedReason(agentMsg.degradedReason);
            break;
          case 'agent_complete':
            setStatus('done');
            setAgentPhase('idle');
            if (agentMsg.result) setContent(agentMsg.result);
            break;
          case 'agent_error':
            setError(agentMsg.error || 'Agent error occurred');
            setStatus('error');
            setAgentPhase('idle');
            break;
        }
      }
    };
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [requestId, sessionId]);

  useEffect(() => {
    sendRequest();
  }, [sendRequest]);

  useEffect(() => {
    return () => {
      if (requestId)
        chrome.runtime.sendMessage({ action: 'cancel_request', payload: { requestId } });
      if (sessionId) chrome.runtime.sendMessage({ action: 'agent_cancel', payload: { sessionId } });
    };
  }, [requestId, sessionId]);

  const handleCancel = () => {
    if (requestId) {
      chrome.runtime.sendMessage({ action: 'cancel_request', payload: { requestId } });
    }
    if (sessionId) {
      chrome.runtime.sendMessage({ action: 'agent_cancel', payload: { sessionId } });
    }
    setStatus('done');
    setAgentPhase('idle');
  };

  const handleCopy = async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const title = mode === 'search' ? 'Search & Explain' : 'AI Explanation';
  const isInteracting = isDragging || isResizing;

  // Modern glassmorphism style
  const panelStyle: React.CSSProperties = {
    position: 'fixed',
    left: position.x,
    top: position.y,
    width: collapsed ? 300 : size.width,
    height: collapsed ? 'auto' : size.height,
    zIndex: 999998,
    display: 'flex',
    flexDirection: 'column',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    background: 'rgba(255, 255, 255, 0.95)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderRadius: 16,
    border: '1px solid rgba(255, 255, 255, 0.3)',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05)',
    overflow: 'hidden',
    userSelect: isInteracting ? 'none' : 'auto',
  };

  return (
    <div data-knowledgelens="floating-panel" style={panelStyle}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          cursor: isDragging ? 'grabbing' : 'grab',
          flexShrink: 0,
        }}
        onMouseDown={handleMouseDown}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'rgba(255,255,255,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2"
            >
              <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <span style={{ color: 'white', fontSize: 14, fontWeight: 600, letterSpacing: '0.01em' }}>
            {title}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => setCollapsed(!collapsed)}
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              border: 'none',
              background: 'rgba(255,255,255,0.15)',
              color: 'white',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.25)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              {collapsed ? (
                <>
                  <path d="M12 5v14" />
                  <path d="M5 12h14" />
                </>
              ) : (
                <path d="M5 12h14" />
              )}
            </svg>
          </button>
          <button
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              border: 'none',
              background: 'rgba(255,255,255,0.15)',
              color: 'white',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239,68,68,0.9)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* Selected text chip */}
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid rgba(0,0,0,0.06)',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                borderRadius: 8,
                background:
                  'linear-gradient(135deg, rgba(102,126,234,0.08) 0%, rgba(118,75,162,0.08) 100%)',
                maxWidth: '100%',
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#667eea"
                strokeWidth="2"
              >
                <path d="M4 7V4h16v3M9 20h6M12 4v16" />
              </svg>
              <span
                style={{
                  fontSize: 13,
                  color: '#4c1d95',
                  fontWeight: 500,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {selectedText.length > 60 ? selectedText.slice(0, 60) + '...' : selectedText}
              </span>
            </div>
          </div>

          {/* Content */}
          <div
            style={{
              flex: 1,
              overflow: 'auto',
              padding: '20px 20px',
              minHeight: 0,
              lineHeight: 1.7,
            }}
          >
            {status === 'loading' && <SkeletonLoader />}

            {status === 'agent_running' && (
              <>
                <AgentStatusIndicator
                  phase={agentPhase}
                  step={agentStep}
                  currentTool={agentTool}
                  degradedMode={degradedMode}
                  degradedReason={degradedReason}
                  onCancel={handleCancel}
                />
                {content && (
                  <article className="kl-markdown" style={{ opacity: 0.8 }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 8,
                        height: 18,
                        background: 'linear-gradient(135deg, #667eea, #764ba2)',
                        borderRadius: 2,
                        marginLeft: 2,
                        verticalAlign: 'text-bottom',
                        animation: 'kl-blink 1s infinite',
                      }}
                    />
                  </article>
                )}
              </>
            )}

            {(status === 'streaming' || status === 'done') && (
              <article className="kl-markdown">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                {status === 'streaming' && (
                  <span
                    style={{
                      display: 'inline-block',
                      width: 8,
                      height: 18,
                      background: 'linear-gradient(135deg, #667eea, #764ba2)',
                      borderRadius: 2,
                      marginLeft: 2,
                      verticalAlign: 'text-bottom',
                      animation: 'kl-blink 1s infinite',
                    }}
                  />
                )}
              </article>
            )}

            {status === 'error' && (
              <div
                style={{
                  padding: 16,
                  borderRadius: 12,
                  background:
                    'linear-gradient(135deg, rgba(239,68,68,0.08) 0%, rgba(220,38,38,0.08) 100%)',
                  border: '1px solid rgba(239,68,68,0.2)',
                }}
              >
                <p style={{ margin: 0, fontSize: 14, color: '#dc2626' }}>{error}</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '12px 16px',
              borderTop: '1px solid rgba(0,0,0,0.06)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexShrink: 0,
              background: 'rgba(249,250,251,0.8)',
            }}
          >
            <button
              onClick={sendRequest}
              disabled={status === 'loading' || status === 'streaming'}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: 'none',
                background:
                  status === 'loading' || status === 'streaming'
                    ? '#e5e7eb'
                    : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: status === 'loading' || status === 'streaming' ? '#9ca3af' : 'white',
                fontSize: 13,
                fontWeight: 500,
                cursor: status === 'loading' || status === 'streaming' ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'transform 0.15s, box-shadow 0.15s',
                boxShadow:
                  status === 'loading' || status === 'streaming'
                    ? 'none'
                    : '0 2px 8px rgba(102,126,234,0.3)',
              }}
              onMouseEnter={(e) => {
                if (status !== 'loading' && status !== 'streaming')
                  e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16M16 16h5v5" />
              </svg>
              Retry
            </button>
            <button
              onClick={handleCopy}
              disabled={!content}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: '1px solid rgba(0,0,0,0.1)',
                background: copied ? '#10b981' : 'white',
                color: copied ? 'white' : '#374151',
                fontSize: 13,
                fontWeight: 500,
                cursor: content ? 'pointer' : 'not-allowed',
                opacity: content ? 1 : 0.5,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.2s',
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                {copied ? (
                  <path d="M20 6L9 17l-5-5" />
                ) : (
                  <>
                    <rect width="14" height="14" x="8" y="8" rx="2" />
                    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                  </>
                )}
              </svg>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>

          {/* Resize handle */}
          <div
            onMouseDown={handleResizeStart}
            style={{
              position: 'absolute',
              bottom: 0,
              right: 0,
              width: 20,
              height: 20,
              cursor: 'se-resize',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: 0.4,
              transition: 'opacity 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.4')}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="#667eea">
              <circle cx="10" cy="10" r="1.5" />
              <circle cx="6" cy="10" r="1.5" />
              <circle cx="10" cy="6" r="1.5" />
            </svg>
          </div>
        </>
      )}

      {/* Animations */}
      <style>{`
        @keyframes kl-blink { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0.3; } }
        @keyframes kl-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </div>
  );
}
