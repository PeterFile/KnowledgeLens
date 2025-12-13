// Floating Bubble component
// Style: Refined Brutalist Square

import React from 'react';

interface FloatingBubbleProps {
  position: { x: number; y: number };
  onExplain: () => void;
  onSearch: () => void;
}

// Tech Icons
const LensIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="square"
    strokeLinejoin="miter"
  >
    <circle cx="11" cy="11" r="8"></circle>
    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
  </svg>
);

const BoltIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="square"
    strokeLinejoin="miter"
  >
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path>
  </svg>
);

const SearchIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="square"
    strokeLinejoin="miter"
  >
    <circle cx="11" cy="11" r="8"></circle>
    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
  </svg>
);

export function FloatingBubble({ position, onExplain, onSearch }: FloatingBubbleProps) {
  const [expanded, setExpanded] = React.useState(false);

  // Calculate position to keep bubble in viewport
  const bubbleStyle: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(position.x + 10, window.innerWidth - 160),
    top: Math.min(position.y - window.scrollY + 10, window.innerHeight - 60),
    zIndex: 999999,
  };

  const btnBaseStyle: React.CSSProperties = {
    border: '1px solid #000',
    borderRadius: '4px', // Tight radius
    boxShadow: '2px 2px 0 0 #000',
    background: '#fff',
    color: '#000',
    cursor: 'pointer',
    transition: 'transform 0.1s ease',
    fontFamily: '"Space Grotesk", sans-serif',
    fontWeight: 700,
    fontSize: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 12px',
    textTransform: 'uppercase',
  };

  const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.transform = 'translate(-1px, -1px)';
    e.currentTarget.style.boxShadow = '3px 3px 0 0 #000';
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.transform = 'translate(0, 0)';
    e.currentTarget.style.boxShadow = '2px 2px 0 0 #000';
  };

  const handleMainClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(!expanded);
  };

  return (
    <div
      style={bubbleStyle}
      data-knowledgelens="bubble"
      className="flex items-start gap-2"
      onMouseLeave={() => setExpanded(false)}
    >
      {/* Main Trigger Button */}
      <button
        onClick={handleMainClick}
        onMouseEnter={(e) => {
          handleMouseEnter(e);
          setExpanded(true);
        }}
        style={{
          ...btnBaseStyle,
          padding: '10px',
          background: '#4F46E5', // Web3 Blue
          color: '#fff',
        }}
        title="KnowledgeLens"
      >
        <LensIcon />
      </button>

      {/* Expanded Actions */}
      {expanded && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            animation: 'slideIn 0.1s ease-out',
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onExplain();
            }}
            style={{ ...btnBaseStyle }}
            onMouseEnter={(e) => {
              handleMouseEnter(e);
              e.currentTarget.style.background = '#10B981'; // Acid Green hover
              e.currentTarget.style.color = '#000';
            }}
            onMouseLeave={(e) => {
              handleMouseLeave(e);
              e.currentTarget.style.background = '#fff';
            }}
          >
            <BoltIcon /> Explain
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSearch();
            }}
            style={{ ...btnBaseStyle }}
            onMouseEnter={(e) => {
              handleMouseEnter(e);
              e.currentTarget.style.background = '#F59E0B'; // Warn Orange hover
              e.currentTarget.style.color = '#000';
            }}
            onMouseLeave={(e) => {
              handleMouseLeave(e);
              e.currentTarget.style.background = '#fff';
            }}
          >
            <SearchIcon /> Search
          </button>
        </div>
      )}
      <style>{`@keyframes slideIn { from { opacity: 0; transform: translateX(-5px); } to { opacity: 1; transform: translateX(0); } }`}</style>
    </div>
  );
}
