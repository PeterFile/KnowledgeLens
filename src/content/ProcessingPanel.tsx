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

// Close icon
const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

// Extract text icon
const ExtractIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

// Note card icon
const NoteCardIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <line x1="9" y1="21" x2="9" y2="9" />
  </svg>
);

// Copy icon
const CopyIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </svg>
);

// Download icon
const DownloadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

// Skeleton loader
const SkeletonLoader = () => (
  <div className="p-4 animate-pulse">
    <div className="h-4 bg-gray-200 rounded w-3/4 mb-3" />
    <div className="h-4 bg-gray-200 rounded w-full mb-3" />
    <div className="h-4 bg-gray-200 rounded w-5/6 mb-3" />
    <div className="h-4 bg-gray-200 rounded w-2/3" />
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

  // Download note card as image (Requirement 7.4)
  const handleDownloadNoteCard = () => {
    if (!noteCard) return;
    const link = document.createElement('a');
    link.href = noteCard.imageDataUrl;
    link.download = `note-card-${Date.now()}.png`;
    link.click();
  };

  // Copy note card to clipboard (Requirement 7.4)
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

  return (
    <div
      data-knowledgelens="processing-panel"
      className="fixed right-0 top-0 h-full w-96 bg-white shadow-xl z-[999998] flex flex-col font-sans"
      style={{ maxWidth: '100vw' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800">Screenshot</h2>
        <button
          onClick={onClose}
          className="p-2 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700 cursor-pointer transition border-0 bg-white"
          title="Close"
        >
          <CloseIcon />
        </button>
      </div>

      {/* Screenshot preview */}
      <div className="p-3 bg-gray-50 border-b border-gray-200">
        <img
          src={`data:image/png;base64,${screenshot.imageBase64}`}
          alt="Captured screenshot"
          className="w-full rounded-lg shadow-md"
          style={{ maxHeight: '200px', objectFit: 'contain' }}
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={handleDownloadImage}
            className="px-2 py-1 rounded text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center gap-1 cursor-pointer transition border-0"
          >
            <DownloadIcon />
            <span>Download</span>
          </button>
        </div>
      </div>

      {/* AI Actions */}
      <div className="p-3 border-b border-gray-200">
        <p className="text-xs text-gray-500 mb-2">AI Analysis</p>
        <div className="flex gap-2">
          <button
            onClick={handleExtractText}
            disabled={mode === 'loading' || mode === 'streaming'}
            className="flex-1 px-3 py-2 rounded-md bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium flex items-center justify-center gap-2 cursor-pointer transition border-0 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ExtractIcon />
            <span>Extract Text</span>
          </button>
          <button
            onClick={handleGenerateNoteCard}
            disabled={mode === 'loading' || mode === 'streaming'}
            className="flex-1 px-3 py-2 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium flex items-center justify-center gap-2 cursor-pointer transition border-0 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <NoteCardIcon />
            <span>Note Card</span>
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {mode === 'loading' && <SkeletonLoader />}

        {(mode === 'streaming' || mode === 'success') && extractedText && (
          <div className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-500">Extracted Text</p>
              <button
                onClick={handleCopyText}
                className="px-2 py-1 rounded text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center gap-1 cursor-pointer transition border-0"
              >
                <CopyIcon />
                <span>{copied ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
            <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap break-words bg-gray-50 rounded-lg p-3">
              {extractedText}
              {mode === 'streaming' && (
                <span className="inline-block w-2 h-4 bg-blue-500 ml-1 animate-pulse" />
              )}
            </div>
          </div>
        )}

        {mode === 'notecard' && noteCard && (
          <div className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-500">Generated Note Card</p>
              <div className="flex gap-2">
                <button
                  onClick={handleCopyNoteCard}
                  className="px-2 py-1 rounded text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center gap-1 cursor-pointer transition border-0"
                >
                  <CopyIcon />
                  <span>{noteCardCopied ? 'Copied!' : 'Copy'}</span>
                </button>
                <button
                  onClick={handleDownloadNoteCard}
                  className="px-2 py-1 rounded text-xs bg-blue-500 hover:bg-blue-600 text-white flex items-center gap-1 cursor-pointer transition border-0"
                >
                  <DownloadIcon />
                  <span>Download</span>
                </button>
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <img
                src={noteCard.imageDataUrl}
                alt="Generated note card"
                className="w-full rounded shadow-md"
              />
            </div>
          </div>
        )}

        {mode === 'error' && (
          <div className="p-4">
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}

        {mode === 'idle' && (
          <div className="p-4 text-center text-gray-500 text-sm">
            <p>Select an AI action above to analyze this screenshot</p>
          </div>
        )}
      </div>

      {/* Source info */}
      <div className="p-3 border-t border-gray-200 bg-gray-50">
        <p className="text-xs text-gray-500 truncate">
          Source: {screenshot.pageTitle || screenshot.pageUrl}
        </p>
      </div>
    </div>
  );
}
