---
inclusion: always
---

# Project Structure

```
├── manifest.json              # Chrome Extension Manifest V3
├── src/
│   ├── background/            # Service worker
│   │   └── index.ts           # API routing, context menus, message hub
│   ├── content/               # Content scripts (injected into pages)
│   │   ├── index.tsx          # Entry point, mounts React components
│   │   ├── FloatingBubble.tsx # Selection action trigger
│   │   ├── FloatingPanel.tsx  # Expanded sidebar UI
│   │   ├── ProcessingPanel.tsx# Loading/progress states
│   │   ├── ScreenshotOverlay.tsx
│   │   ├── selection.ts       # Text selection handling
│   │   ├── shadow-container.ts# Shadow DOM isolation
│   │   └── content.css
│   ├── popup/                 # Extension popup (React SPA)
│   │   ├── index.html
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   └── components/        # Popup-specific components
│   ├── offscreen/             # Offscreen document for background tasks
│   │   ├── offscreen.html
│   │   └── offscreen.ts
│   ├── components/            # Shared React components
│   ├── hooks/                 # Custom React hooks
│   ├── lib/                   # Core utilities and services
│   │   ├── agent/             # Agentic loop system
│   │   │   ├── loop.ts        # Main agent execution loop
│   │   │   ├── state.ts       # Agent state management
│   │   │   ├── context.ts     # Context window management
│   │   │   ├── tokens.ts      # Token budget tracking
│   │   │   ├── prompts.ts     # System prompts
│   │   │   ├── tools.ts       # Tool implementations
│   │   │   ├── tool-definitions.ts
│   │   │   ├── goal-handlers.ts
│   │   │   ├── reflection.ts  # Self-reflection logic
│   │   │   ├── rag.ts         # Retrieval-augmented generation
│   │   │   ├── logger.ts
│   │   │   └── types.ts
│   │   ├── api.ts             # LLM API client
│   │   ├── storage.ts         # chrome.storage wrapper
│   │   ├── extractor.ts       # Page content extraction
│   │   ├── screenshot.ts      # Screen capture utilities
│   │   ├── tokenizer.ts       # Token counting
│   │   ├── markdown.ts        # Markdown processing
│   │   ├── notecard.ts        # Note card generation
│   │   ├── request-manager.ts # Request deduplication/cancellation
│   │   ├── bubble-position.ts # Floating bubble positioning
│   │   └── utils.ts           # General helpers
│   ├── styles/
│   │   └── globals.css        # Tailwind base styles
│   └── types/
│       └── index.ts           # Shared TypeScript definitions
├── tests/                     # Mirror src/ structure
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

## Architecture

| Layer | Responsibility | Communication |
|-------|----------------|---------------|
| Background | API calls, message routing, context menus | Hub for all cross-origin requests |
| Content | DOM interaction, UI injection via Shadow DOM | `chrome.runtime.sendMessage()` to background |
| Popup | Main user interface | Direct `chrome.runtime` calls |
| Offscreen | Background tasks requiring DOM (e.g., canvas) | Message passing from background |

## File Placement Rules

| Type | Location | Notes |
|------|----------|-------|
| Shared React components | `src/components/` | Reusable across popup and content |
| Popup-only components | `src/popup/components/` | Views, dialogs specific to popup |
| Content script components | `src/content/` | Injected UI (bubble, panel, overlay) |
| Custom hooks | `src/hooks/` | |
| API clients & utilities | `src/lib/` | Pure functions preferred |
| Agent system modules | `src/lib/agent/` | Agentic loop, tools, state |
| TypeScript types | `src/types/index.ts` | Export all shared types from here |
| Tests | `tests/` | Mirror `src/` directory structure |

## Content Script Isolation

Content scripts use Shadow DOM to prevent style conflicts with host pages:
- Mount React components inside shadow root via `shadow-container.ts`
- Import Tailwind styles into shadow DOM
- Never rely on host page CSS

## Agent System

The `src/lib/agent/` module implements a multi-step agentic loop:
- `loop.ts` - Orchestrates thinking → executing → reflecting phases
- `state.ts` - Immutable state transitions
- `tokens.ts` - Budget tracking and enforcement
- `tools.ts` - Available tool implementations
- `reflection.ts` - Self-evaluation between steps
