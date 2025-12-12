// Floating Bubble component
// Requirements: 2.1, 2.3 - Show bubble near selection, hide on selection clear

import React from 'react';

interface FloatingBubbleProps {
  position: { x: number; y: number };
  onExplain: () => void;
  onSearch: () => void;
}

// AI icon SVG
const AIIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
    <circle cx="7.5" cy="14.5" r="1.5" fill="currentColor" />
    <circle cx="16.5" cy="14.5" r="1.5" fill="currentColor" />
  </svg>
);

// Explain icon
const ExplainIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
    <path d="M12 17h.01" />
  </svg>
);

// Search icon
const SearchIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

export function FloatingBubble({ position, onExplain, onSearch }: FloatingBubbleProps) {
  const [expanded, setExpanded] = React.useState(false);

  // Calculate position to keep bubble in viewport
  const bubbleStyle: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(position.x + 8, window.innerWidth - 160),
    top: Math.min(position.y - window.scrollY + 8, window.innerHeight - 60),
    zIndex: 999999,
  };

  const handleMainClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(!expanded);
  };

  const handleExplain = (e: React.MouseEvent) => {
    e.stopPropagation();
    onExplain();
  };

  const handleSearch = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSearch();
  };

  return (
    <div style={bubbleStyle} data-knowledgelens="bubble" className="inline-flex items-center gap-1">
      {/* Main AI button */}
      <button
        onClick={handleMainClick}
        className="w-10 h-10 rounded-full bg-blue-500 hover:bg-blue-600 text-white shadow-lg flex items-center justify-center cursor-pointer transition border-0"
        title="KnowledgeLens AI"
      >
        <AIIcon />
      </button>

      {/* Expanded action buttons */}
      {expanded && (
        <div className="flex items-center gap-1 bg-white rounded-lg shadow-lg p-1 border border-gray-200">
          <button
            onClick={handleExplain}
            className="px-3 py-2 rounded-md hover:bg-gray-100 text-gray-700 text-sm font-medium flex items-center gap-2 cursor-pointer transition border-0 bg-white"
            title="Explain with AI"
          >
            <ExplainIcon />
            <span>Explain</span>
          </button>
          <button
            onClick={handleSearch}
            className="px-3 py-2 rounded-md hover:bg-gray-100 text-gray-700 text-sm font-medium flex items-center gap-2 cursor-pointer transition border-0 bg-white"
            title="Search & Explain"
          >
            <SearchIcon />
            <span>Search</span>
          </button>
        </div>
      )}
    </div>
  );
}
