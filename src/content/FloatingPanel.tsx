// Modern draggable and resizable floating panel for AI responses
// Style: Refined Neo-Brutalism with Web3 Tech Header

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

// Tech Loader - Glitch effect style
const LoadingIndicator = () => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      padding: '24px',
      alignItems: 'center',
    }}
  >
    <div style={{ display: 'flex', gap: '4px' }}>
      <div
        style={{ width: '8px', height: '8px', background: '#000', animation: 'pulse 1s infinite' }}
      ></div>
      <div
        style={{
          width: '8px',
          height: '8px',
          background: '#000',
          animation: 'pulse 1s infinite 0.2s',
        }}
      ></div>
      <div
        style={{
          width: '8px',
          height: '8px',
          background: '#000',
          animation: 'pulse 1s infinite 0.4s',
        }}
      ></div>
    </div>
    <div
      style={{
        marginTop: '12px',
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: '11px',
        color: '#666',
        textTransform: 'uppercase',
      }}
    >
      Initialising Agent...
    </div>
    <style>{`@keyframes pulse { 0%, 100% { opacity: 0.2; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1); } }`}</style>
  </div>
);

const PHASE_CONFIG: Record<AgentPhase | 'idle', { label: string; bg: string; color: string }> = {
  idle: { label: 'IDLE', bg: '#F3F4F6', color: '#6B7280' },
  thinking: { label: 'THINKING', bg: '#EFF6FF', color: '#2563EB' },
  executing: { label: 'EXECUTING', bg: '#FFFBEB', color: '#D97706' },
  analyzing: { label: 'ANALYZING', bg: '#F5F3FF', color: '#7C3AED' },
  reflecting: { label: 'REFLECTING', bg: '#FDF2F8', color: '#DB2777' },
  synthesizing: { label: 'WRITING', bg: '#ECFDF5', color: '#059669' },
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
  const config = PHASE_CONFIG[phase];
  const isRunning = phase !== 'idle';
  const progressPercent = step.max > 0 ? Math.round((step.current / step.max) * 100) : 0;

  return (
    <div
      style={{
        marginBottom: 16,
        border: '1px solid #000',
        borderRadius: '4px',
        padding: '10px',
        background: '#fff',
        boxShadow: '2px 2px 0 0 #000',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              background: config.bg,
              color: config.color,
              padding: '2px 6px',
              fontSize: '10px',
              fontWeight: 700,
              fontFamily: '"JetBrains Mono", monospace',
              border: '1px solid',
              borderColor: config.color,
              borderRadius: '2px',
              textTransform: 'uppercase',
            }}
          >
            {config.label}
          </span>
          {currentTool && (
            <span
              style={{ fontSize: '11px', color: '#444', fontFamily: '"JetBrains Mono", monospace' }}
            >
              ./{currentTool}
            </span>
          )}
        </div>
        {isRunning && onCancel && (
          <button
            onClick={onCancel}
            style={{
              border: 'none',
              background: 'none',
              color: '#EF4444',
              fontSize: '10px',
              fontFamily: 'monospace',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            [ABORT]
          </button>
        )}
      </div>

      {isRunning && (
        <div
          style={{ height: '6px', width: '100%', border: '1px solid #000', background: '#F3F4F6' }}
        >
          <div
            style={{
              height: '100%',
              width: `${progressPercent}%`,
              background: '#4F46E5', // Web3 Blue
              transition: 'width 0.3s ease',
            }}
          ></div>
        </div>
      )}

      {degradedMode && (
        <div style={{ marginTop: 8, fontSize: '10px', color: '#D97706', fontFamily: 'monospace' }}>
          WARN: {degradedReason}
        </div>
      )}
    </div>
  );
};

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
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const [agentPhase, setAgentPhase] = useState<AgentPhase | 'idle'>('idle');
  const [agentStep, setAgentStep] = useState({ current: 0, max: 5 });
  const [agentTool, setAgentTool] = useState<string | undefined>();
  const [degradedMode, setDegradedMode] = useState(false);
  const [degradedReason, setDegradedReason] = useState<string | undefined>();

  const { position, isDragging, handleMouseDown } = useDrag({
    x: Math.max(20, window.innerWidth - 460),
    y: Math.max(20, (window.innerHeight - 480) / 2),
  });

  const { size, isResizing, handleResizeStart } = useResize({ width: 420, height: 500 });

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
            setAgentPhase('idle');
            break;
          case 'streaming_error':
            setError(streamMsg.error || 'An error occurred');
            setStatus('error');
            setAgentPhase('idle');
            break;
        }
      }

      if ('sessionId' in message && requestId && message.sessionId === requestId) {
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
  }, [requestId]);

  useEffect(() => {
    sendRequest();
  }, [sendRequest]);

  useEffect(() => {
    return () => {
      if (requestId) {
        chrome.runtime.sendMessage({ action: 'cancel_request', payload: { requestId } });
        chrome.runtime.sendMessage({ action: 'agent_cancel', payload: { sessionId: requestId } });
      }
    };
  }, [requestId]);

  const handleCancel = () => {
    if (requestId) {
      chrome.runtime.sendMessage({ action: 'cancel_request', payload: { requestId } });
      chrome.runtime.sendMessage({ action: 'agent_cancel', payload: { sessionId: requestId } });
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

  const title = mode === 'search' ? 'WEB SEARCH' : 'CONTEXT EXPLAIN';
  const isInteracting = isDragging || isResizing;

  // -- STYLE DEFINITIONS: REFINED NEO-BRUTALISM --
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
    border: '1px solid #000', // Thin hard border
    borderRadius: '6px', // Slight radius
    boxShadow: isDragging ? '4px 4px 0px rgba(0,0,0,0.5)' : '2px 2px 0px #000', // Small hard shadow
    transition: 'box-shadow 0.1s, width 0.1s, height 0.1s',
    userSelect: isInteracting ? 'none' : 'auto',
  };

  return (
    <div data-knowledgelens="floating-panel" style={panelStyle}>
      {/* Header Bar - THE WEB3 TECH ACCENT */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          background: '#4F46E5', // Electric Indigo
          borderBottom: '1px solid #000',
          borderRadius: '5px 5px 0 0',
          cursor: isDragging ? 'grabbing' : 'grab',
          flexShrink: 0,
        }}
        onMouseDown={handleMouseDown}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Tech Decoration */}
          <div
            style={{
              width: '10px',
              height: '10px',
              background: '#10B981',
              border: '1px solid #000',
            }}
          ></div>
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
            {title}
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
              fontSize: '14px',
              fontWeight: 'bold',
            }}
          >
            X
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* Input Summary - REFINED BRUTALIST STYLE */}
          <div
            style={{
              padding: '8px 14px',
              borderBottom: '1px solid #000',
              background: '#fff',
              fontSize: '11px',
              color: '#000',
              fontFamily: '"JetBrains Mono", monospace',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span
              style={{
                fontWeight: 700,
                background: '#000',
                color: '#fff',
                padding: '1px 4px',
                borderRadius: '2px',
              }}
            >
              INPUT
            </span>
            <span style={{ opacity: 0.8 }}>
              &quot;{selectedText.length > 50 ? selectedText.slice(0, 50) + '...' : selectedText}
              &quot;
            </span>
          </div>

          {/* Main Content Area */}
          <div
            style={{
              flex: 1,
              overflow: 'auto',
              padding: '20px',
              minHeight: 0,
              lineHeight: '1.6',
              background: '#FAFAFA',
            }}
          >
            {status === 'loading' && <LoadingIndicator />}

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
                  <div className="kl-markdown" style={{ opacity: 0.7 }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                  </div>
                )}
              </>
            )}

            {(status === 'streaming' || status === 'done') && (
              <div className="kl-markdown">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                {status === 'streaming' && (
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
            )}

            {status === 'error' && (
              <div
                style={{
                  border: '1px solid #000',
                  background: '#FEF2F2',
                  padding: '12px',
                  color: '#DC2626',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  boxShadow: '2px 2px 0 0 #000',
                }}
              >
                ERROR: {error}
              </div>
            )}
          </div>

          {/* Action Footer */}
          <div
            style={{
              padding: '12px 16px',
              borderTop: '1px solid #000',
              background: '#fff',
              display: 'flex',
              gap: '10px',
              justifyContent: 'flex-end',
              borderRadius: '0 0 5px 5px',
            }}
          >
            <button
              onClick={handleCopy}
              disabled={!content}
              style={{
                padding: '6px 16px',
                background: copied ? '#10B981' : '#fff', // Acid Green on success
                border: '1px solid #000',
                color: '#000',
                fontSize: '12px',
                fontWeight: 700,
                fontFamily: '"Space Grotesk", sans-serif',
                textTransform: 'uppercase',
                cursor: content ? 'pointer' : 'not-allowed',
                boxShadow: copied ? '0 0 0 0 #000' : '2px 2px 0 0 #000',
                transform: copied ? 'translate(1px, 1px)' : 'none',
                transition: 'all 0.1s',
              }}
            >
              {copied ? 'COPIED' : 'COPY'}
            </button>
            <button
              onClick={sendRequest}
              style={{
                padding: '6px 16px',
                background: '#000',
                border: '1px solid #000',
                color: '#fff',
                fontSize: '12px',
                fontWeight: 700,
                fontFamily: '"Space Grotesk", sans-serif',
                textTransform: 'uppercase',
                cursor: 'pointer',
                boxShadow: '2px 2px 0 0 #4F46E5', // Blue shadow for primary
                transition: 'all 0.1s',
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.transform = 'translate(1px, 1px)';
                e.currentTarget.style.boxShadow = '0 0 0 0 #4F46E5';
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.transform = 'translate(0, 0)';
                e.currentTarget.style.boxShadow = '2px 2px 0 0 #4F46E5';
              }}
            >
              REGENERATE
            </button>
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

      <style>{`
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        
        .kl-markdown {
           font-family: 'Space Grotesk', -apple-system, sans-serif;
           font-size: 14px;
           color: #171717;
           line-height: 1.6;
        }
        .kl-markdown h1, .kl-markdown h2, .kl-markdown h3 {
           font-weight: 700;
           margin-top: 1.5em;
           margin-bottom: 0.5em;
           color: #000;
           text-transform: uppercase;
           letter-spacing: -0.02em;
        }
        .kl-markdown h1 { font-size: 1.3em; border-bottom: 2px solid #000; padding-bottom: 4px; }
        .kl-markdown h2 { font-size: 1.1em; }
        
        .kl-markdown code {
           background: #F3F4F6;
           border: 1px solid #E5E7EB;
           padding: 2px 4px;
           font-family: 'JetBrains Mono', monospace;
           font-size: 0.9em;
           color: #4F46E5;
           border-radius: 2px;
        }
        .kl-markdown pre {
           background: #111;
           color: #eee;
           padding: 12px;
           border: 1px solid #000;
           overflow-x: auto;
           margin: 1em 0;
           border-radius: 4px;
           box-shadow: 2px 2px 0 0 #ccc;
        }
        .kl-markdown a {
           color: #4F46E5;
           text-decoration: underline;
           text-decoration-thickness: 2px;
           font-weight: 600;
        }
        .kl-markdown blockquote {
           border-left: 3px solid #000;
           margin: 1em 0;
           padding-left: 1em;
           font-style: italic;
           background: #fff;
        }
        .kl-markdown ul, .kl-markdown ol {
           padding-left: 1.5em;
           margin: 1em 0;
        }
      `}</style>
    </div>
  );
}
