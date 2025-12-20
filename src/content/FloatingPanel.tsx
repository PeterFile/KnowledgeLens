// Modern draggable and resizable floating panel for AI responses
// Style: Refined Neo-Brutalism with Web3 Tech Header

import { useEffect, useState, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { StreamingMessage, AgentStatusMessage, StoredSettings } from '../types';
import type { AgentPhase } from '../lib/agent/types';
import { t } from '../lib/i18n';

type PanelStatus = 'loading' | 'streaming' | 'done' | 'error' | 'agent_running';

interface FloatingPanelProps {
  selectedText?: string;
  context?: string;
  mode: 'explain' | 'search' | 'summary';
  settings?: StoredSettings | null;
  onClose: () => void;
}

// Tech Loader - Glitch effect style
const LoadingIndicator = ({ language }: { language: string }) => (
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
      {t('common.loading', language)}
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
  done: { label: 'DONE', bg: '#ECFDF5', color: '#059669' },
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
            {t(`agent.${phase}`, (onCancel as any)?.language || 'en')}
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
            [{t('common.cancel', (onCancel as any)?.language || 'en')}]
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

function useDrag(
  position: { x: number; y: number },
  setPosition: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>
) {
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only drag if it's the header and not a button
      if ((e.target as HTMLElement).closest('button')) return;

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
  }, [isDragging, setPosition]);

  return { isDragging, handleMouseDown };
}

function useResize(
  size: { width: number; height: number },
  setSize: React.Dispatch<React.SetStateAction<{ width: number; height: number }>>,
  position: { x: number; y: number },
  setPosition: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>
) {
  const [isResizing, setIsResizing] = useState(false);
  const resizeInfo = useRef<{
    direction: string;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    startPosX: number;
    startPosY: number;
  } | null>(null);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent, direction: string) => {
      e.preventDefault();
      e.stopPropagation();
      setIsResizing(true);
      resizeInfo.current = {
        direction,
        startX: e.clientX,
        startY: e.clientY,
        startWidth: size.width,
        startHeight: size.height,
        startPosX: position.x,
        startPosY: position.y,
      };
    },
    [size, position]
  );

  useEffect(() => {
    if (!isResizing || !resizeInfo.current) return;

    const handleMove = (e: MouseEvent) => {
      const { direction, startX, startY, startWidth, startHeight, startPosX, startPosY } =
        resizeInfo.current!;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      let newWidth = startWidth;
      let newHeight = startHeight;
      let newX = startPosX;
      let newY = startPosY;

      const MIN_WIDTH = 300;
      const MIN_HEIGHT = 150;

      if (direction.includes('e')) {
        newWidth = Math.max(MIN_WIDTH, startWidth + dx);
      }
      if (direction.includes('w')) {
        const potentialWidth = startWidth - dx;
        if (potentialWidth >= MIN_WIDTH) {
          newWidth = potentialWidth;
          newX = startPosX + dx;
        }
      }
      if (direction.includes('s')) {
        newHeight = Math.max(MIN_HEIGHT, startHeight + dy);
      }
      if (direction.includes('n')) {
        const potentialHeight = startHeight - dy;
        if (potentialHeight >= MIN_HEIGHT) {
          newHeight = potentialHeight;
          newY = startPosY + dy;
        }
      }

      setSize({ width: newWidth, height: newHeight });
      setPosition({ x: newX, y: newY });
    };

    const handleUp = () => setIsResizing(false);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isResizing, setPosition, setSize]);

  return { isResizing, handleResizeStart };
}

export function FloatingPanel({
  selectedText,
  context,
  mode,
  settings,
  onClose,
}: FloatingPanelProps) {
  const [status, setStatus] = useState<PanelStatus>('loading');
  const language = settings?.language || 'en';
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const requestIdRef = useRef<string | null>(null); // Ref to avoid listener race condition
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [deepDiveContent, setDeepDiveContent] = useState('');

  const [agentPhase, setAgentPhase] = useState<AgentPhase | 'idle'>('idle');
  const [agentStep, setAgentStep] = useState({ current: 0, max: 5 });
  const [agentTool, setAgentTool] = useState<string | undefined>();
  const [degradedMode, setDegradedMode] = useState(false);
  const [degradedReason, setDegradedReason] = useState<string | undefined>();

  const [position, setPosition] = useState({
    x: Math.max(20, window.innerWidth - 460),
    y: Math.max(20, (window.innerHeight - 480) / 2),
  });
  const [size, setSize] = useState({ width: 420, height: 500 });

  const { isDragging, handleMouseDown } = useDrag(position, setPosition);
  const { isResizing, handleResizeStart } = useResize(size, setSize, position, setPosition);

  const sendRequest = useCallback(() => {
    setStatus('loading');
    setContent('');
    setError(null);
    if (mode === 'summary') {
      const newRequestId = `summary_${Date.now()}`;
      setRequestId(newRequestId);
      requestIdRef.current = newRequestId;
      chrome.runtime.sendMessage({
        action: 'summarize_page',
        payload: { content: context || '', pageUrl: window.location.href, requestId: newRequestId },
        requestId: newRequestId,
      });
      return;
    }
    const action = mode === 'search' ? 'search_enhance' : 'explain_text';
    chrome.runtime.sendMessage(
      { action, payload: { text: selectedText || '', context: context || '' } },
      (response) => {
        if (response?.success && response.data?.requestId) {
          const newRequestId = response.data.requestId;
          setRequestId(newRequestId);
          requestIdRef.current = newRequestId;
        } else if (response?.error) {
          setError(response.error);
          setStatus('error');
        }
      }
    );
  }, [mode, selectedText, context]);

  useEffect(() => {
    const handleMessage = (message: StreamingMessage | AgentStatusMessage) => {
      // Use ref to check ID without re-attaching listener
      const currentRequestId = requestIdRef.current;

      if ('requestId' in message && currentRequestId && message.requestId === currentRequestId) {
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

      if ('sessionId' in message && currentRequestId && message.sessionId === currentRequestId) {
        const agentMsg = message as AgentStatusMessage;
        switch (agentMsg.type) {
          case 'agent_status_update':
            // Don't overwrite 'done' status if streaming finished first
            setStatus((prev) => (prev === 'done' ? 'done' : 'agent_running'));
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
  }, []); // Run once on mount

  // Sync ref when requestId prop changes
  useEffect(() => {
    requestIdRef.current = requestId;
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
      let fullContent = content;
      if (deepDiveContent) {
        fullContent += '\n\n' + deepDiveContent;
      }
      await navigator.clipboard.writeText(fullContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  // Helper to render content based on phase/mode
  const renderContent = () => {
    if (
      status === 'loading' ||
      status === 'streaming' ||
      status === 'done' ||
      status === 'agent_running'
    ) {
      // If we have hierarchical content for summary
      if (mode === 'summary' && content.includes('# Level 1: TL;DR')) {
        return (
          <HierarchicalSummaryView
            content={content}
            originalContent={context || ''}
            pageUrl={window.location.href}
            onDeepDiveUpdate={setDeepDiveContent}
          />
        );
      }
      return (
        <div className="kl-markdown">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({ node: _node, className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || '');
                return match ? (
                  <div style={{ position: 'relative' }}>
                    <code className={className} {...props}>
                      {children}
                    </code>
                  </div>
                ) : (
                  <code className={className} {...props}>
                    {children}
                  </code>
                );
              },
            }}
          >
            {content}
          </ReactMarkdown>
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
      );
    }
    return null;
  };

  const title =
    mode === 'summary'
      ? t('summary.title', language)
      : mode === 'search'
        ? t('settings.search_config', language)
        : t('types.explain', language) === 'types.explain'
          ? 'CONTEXT EXPLAIN'
          : t('types.explain', language);
  const headerBg = mode === 'summary' ? '#F59E0B' : '#4F46E5'; // Amber for summary, Indigo for others
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
          background: headerBg,
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
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="kl-header-btn"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: 'bold',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '4px',
              transition: 'background 0.2s',
            }}
            title={
              collapsed
                ? language === 'zh'
                  ? '展开'
                  : language === 'ja'
                    ? '展開'
                    : 'Expand'
                : language === 'zh'
                  ? '折叠'
                  : language === 'ja'
                    ? '折りたたむ'
                    : 'Collapse'
            }
          >
            {collapsed ? '□' : '_'}
          </button>
          <button
            onClick={onClose}
            className="kl-header-btn"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: 'bold',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '4px',
              transition: 'background 0.2s',
            }}
            title={language === 'zh' ? '关闭' : language === 'ja' ? '閉じる' : 'Close'}
          >
            X
          </button>
        </div>
      </div>
      {/* The rest of the panel content */}
      {!collapsed && (
        <>
          {/* Input Summary */}
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
              {mode === 'summary'
                ? 'FULL PAGE'
                : selectedText && selectedText.length > 50
                  ? selectedText.slice(0, 50) + '...'
                  : selectedText}
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
            {status === 'loading' && <LoadingIndicator language={language} />}

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
                    {/* Agent Running Preview */}
                    {mode === 'summary' && content.includes('# Level 1: TL;DR') ? (
                      <HierarchicalSummaryView
                        content={content}
                        originalContent={context || ''}
                        pageUrl={window.location.href}
                        onDeepDiveUpdate={setDeepDiveContent}
                      />
                    ) : (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                    )}
                  </div>
                )}
              </>
            )}

            {!(status === 'agent_running' || status === 'loading') && renderContent()}

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
              className="kl-btn kl-btn-secondary"
              style={{
                padding: '6px 16px',
                background: copied ? '#10B981' : '#fff',
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
              {copied ? t('common.saved', language) : t('summary.copy', language)}
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
                e.currentTarget.style.boxShadow =
                  '0 0 0 0 ' + (mode === 'summary' ? '#F59E0B' : '#4F46E5');
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.transform = 'translate(0, 0)';
                e.currentTarget.style.boxShadow =
                  '2px 2px 0 0 ' + (mode === 'summary' ? '#F59E0B' : '#4F46E5');
              }}
            >
              {t('summary.regenerate', language)}
            </button>
          </div>

          {/* Resize Handles */}
          {/* Edges */}
          <div
            onMouseDown={(e) => handleResizeStart(e, 'n')}
            style={{
              position: 'absolute',
              top: -4,
              left: 4,
              right: 4,
              height: 8,
              cursor: 'n-resize',
              zIndex: 10,
            }}
          />
          <div
            onMouseDown={(e) => handleResizeStart(e, 's')}
            style={{
              position: 'absolute',
              bottom: -4,
              left: 4,
              right: 4,
              height: 8,
              cursor: 's-resize',
              zIndex: 10,
            }}
          />
          <div
            onMouseDown={(e) => handleResizeStart(e, 'e')}
            style={{
              position: 'absolute',
              right: -4,
              top: 4,
              bottom: 4,
              width: 8,
              cursor: 'e-resize',
              zIndex: 10,
            }}
          />
          <div
            onMouseDown={(e) => handleResizeStart(e, 'w')}
            style={{
              position: 'absolute',
              left: -4,
              top: 4,
              bottom: 4,
              width: 8,
              cursor: 'w-resize',
              zIndex: 10,
            }}
          />
          {/* Corners */}
          <div
            onMouseDown={(e) => handleResizeStart(e, 'nw')}
            style={{
              position: 'absolute',
              top: -4,
              left: -4,
              width: 12,
              height: 12,
              cursor: 'nw-resize',
              zIndex: 11,
            }}
          />
          <div
            onMouseDown={(e) => handleResizeStart(e, 'ne')}
            style={{
              position: 'absolute',
              top: -4,
              right: -4,
              width: 12,
              height: 12,
              cursor: 'ne-resize',
              zIndex: 11,
            }}
          />
          <div
            onMouseDown={(e) => handleResizeStart(e, 'sw')}
            style={{
              position: 'absolute',
              bottom: -4,
              left: -4,
              width: 12,
              height: 12,
              cursor: 'sw-resize',
              zIndex: 11,
            }}
          />
          <div
            onMouseDown={(e) => handleResizeStart(e, 'se')}
            style={{
              position: 'absolute',
              bottom: -4,
              right: -4,
              width: 12,
              height: 12,
              cursor: 'se-resize',
              zIndex: 11,
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
        .kl-header-btn:hover {
           background: rgba(0, 0, 0, 0.15) !important;
        }
      `}</style>
    </div>
  );
}

// Hierarchical Summary Component
// Hierarchical Summary Component
function HierarchicalSummaryView({
  content,
  originalContent,
  pageUrl,
  onDeepDiveUpdate,
}: {
  content: string;
  originalContent: string;
  pageUrl: string;
  onDeepDiveUpdate: (val: string) => void;
}) {
  const [showDeepDive, setShowDeepDive] = useState(false);
  const [ddStatus, setDdStatus] = useState<'idle' | 'loading' | 'streaming' | 'done' | 'error'>(
    'idle'
  );
  const [ddContent, setDdContent] = useState('');
  const [ddError, setDdError] = useState<string | null>(null);
  const [ddCopied, setDdCopied] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // Parse content manually since we want specific control
  const tldrMatch = content.match(/# Level 1: TL;DR\s*\n> (.*)/);
  const tldr = tldrMatch ? tldrMatch[1] : '';

  const execSummaryStart = content.indexOf('# Level 2: Executive Brief');
  const execSummary = execSummaryStart !== -1 ? content.slice(execSummaryStart + 26).trim() : '';

  const handleDeepDive = useCallback(() => {
    if (showDeepDive) {
      setShowDeepDive(false);
      return;
    }

    setShowDeepDive(true);

    // If already loaded or loading, don't re-trigger
    if (ddStatus !== 'idle' && ddStatus !== 'error') return;

    setDdStatus('loading');
    setDdError(null);
    const requestId = `deep_dive_${Date.now()}`;

    // Send Request
    chrome.runtime.sendMessage({
      action: 'agent_deep_dive',
      payload: {
        content: originalContent,
        pageUrl: pageUrl,
        requestId: requestId,
      },
    });

    // Setup Listener
    const listener = (message: any) => {
      // We only care about streaming messages for THIS specific deep dive request
      // The background script appends "_deep_dive" to the ID we sent if we sent a base ID,
      // OR we can just check if the message requestId *contains* our unique key.
      // Actually, looking at background script:
      // const deepDiveRequestId = `${payload.requestId}_deep_dive`;
      // So we should listen for the suffixed ID.

      const expectedId = `${requestId}_deep_dive`;

      if (message.requestId !== expectedId) return;

      if (message.type === 'streaming_chunk') {
        setDdStatus('streaming');
        setDdContent((prev) => prev + (message.chunk || ''));
      }
      if (message.type === 'streaming_end') {
        setDdStatus('done');
        const finalContent = message.content || ddContent;
        if (message.content) setDdContent(message.content); // Final sync
        onDeepDiveUpdate(finalContent);
        chrome.runtime.onMessage.removeListener(listener);
      }
      if (message.type === 'streaming_error') {
        setDdStatus('error');
        setDdError(message.error);
        chrome.runtime.onMessage.removeListener(listener);
      }
    };

    chrome.runtime.onMessage.addListener(listener);
  }, [ddStatus, originalContent, pageUrl, showDeepDive, ddContent, onDeepDiveUpdate]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Level 1: TL;DR - Hero Section */}
      {tldr && (
        <div
          style={{
            background: '#FFFBEB',
            borderLeft: '4px solid #F59E0B',
            padding: '12px 16px',
            fontSize: '15px',
            fontWeight: '500',
            color: '#1F2937',
          }}
        >
          <span
            style={{
              display: 'block',
              fontSize: '10px',
              textTransform: 'uppercase',
              color: '#D97706',
              fontWeight: '700',
              marginBottom: '4px',
            }}
          >
            TL;DR
          </span>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ node: _node, ...props }) => <p style={{ margin: 0 }} {...props} />,
            }}
          >
            {tldr}
          </ReactMarkdown>
        </div>
      )}

      {/* Level 2: Executive Summary */}
      {execSummary && (
        <div style={{ padding: '0 4px' }}>
          <h3
            style={{
              fontSize: '13px',
              textTransform: 'uppercase',
              fontWeight: '700',
              borderBottom: '2px solid #E5E7EB',
              paddingBottom: '4px',
              marginBottom: '8px',
            }}
          >
            Executive Brief
          </h3>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{execSummary}</ReactMarkdown>
        </div>
      )}

      {/* Level 3: Deep Dive Action */}
      <div style={{ marginTop: '8px' }}>
        <button
          onClick={handleDeepDive}
          style={{
            width: '100%',
            padding: '8px',
            background: showDeepDive ? '#F3F4F6' : '#fff',
            border: '1px dashed #9CA3AF',
            color: '#4B5563',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: '600',
            transition: 'all 0.2s',
          }}
        >
          {showDeepDive ? '▼ HIDE DEEP DIVE' : '▶ EXPAND DEEP DIVE (LEVEL 3)'}
        </button>

        {showDeepDive && (
          <div
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
              marginTop: '12px',
              padding: '12px',
              background: '#F9FAFB',
              borderRadius: '4px',
              border: '1px solid #E5E7EB',
              position: 'relative',
            }}
          >
            <div
              style={{
                fontSize: '13px',
                textTransform: 'uppercase',
                fontWeight: '700',
                marginBottom: '8px',
                color: '#4B5563',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                position: 'relative',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                Deep Dive Analysis
                {ddStatus === 'loading' && (
                  <span style={{ fontSize: '12px', fontWeight: '400' }}>(Thinking...)</span>
                )}
              </div>
            </div>

            {ddStatus === 'done' && (isHovered || ddCopied) && (
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(ddContent);
                    setDdCopied(true);
                    setTimeout(() => setDdCopied(false), 2000);
                  } catch {
                    /* ignore */
                  }
                }}
                style={{
                  position: 'sticky',
                  float: 'right',
                  top: '0px',
                  marginTop: '-24px',
                  padding: '4px 10px',
                  background: ddCopied ? '#10B981' : '#fff',
                  border: '1px solid #000',
                  color: '#000',
                  fontSize: '10px',
                  fontWeight: 700,
                  fontFamily: '"Space Grotesk", sans-serif',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  boxShadow: ddCopied ? '0 0 0 0 #000' : '2px 2px 0 0 #000',
                  transform: ddCopied ? 'translate(1px, 1px)' : 'none',
                  transition: 'all 0.1s',
                  zIndex: 20,
                  pointerEvents: 'auto',
                }}
              >
                {ddCopied ? 'COPIED' : 'COPY'}
              </button>
            )}

            {ddStatus === 'error' ? (
              <div style={{ color: '#DC2626', fontSize: '13px' }}>Error: {ddError}</div>
            ) : (
              <div className="kl-markdown">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{ddContent}</ReactMarkdown>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
