---
inclusion: always
---

# KnowledgeLens - Product Context

Chrome Extension (Manifest V3) serving as an AI-powered reading assistant and knowledge management tool.

## Core Features

| Feature | Trigger | Input | Output |
|---------|---------|-------|--------|
| One-Click Summary | Popup click | Page content (cleaned HTML) | Streaming Markdown summary |
| Context Explanation | Text selection → Floating Bubble | Selected text + 500 char context window | Explanation in sidebar |
| Search Enhancement | Text selection → Floating Bubble | Selected text + keywords | AI-synthesized answer with search results |
| Smart Screenshot | `Ctrl+Shift+X` or Popup button | Screen region capture | Structured notes or note card image |

## UI Component Hierarchy

1. **Popup Panel** (400×600px) - Main interface
   - Navigation: Summary | Chat | Settings
   - Content area: Markdown rendering with streaming support
   - Action bar: Screenshot, Copy, Clear buttons

2. **Floating Bubble** - Appears near text selection, minimal design
   - Expands to **Sidebar** (not modal) for better reading flow

3. **Screenshot Overlay** - Full-page darkened selection tool

## Message Flow

All AI operations route through Background Service Worker:
- Content Script → `chrome.runtime.sendMessage()` → Background → LLM API
- Background → `chrome.tabs.sendMessage()` → Content Script (streaming updates)

## Key Constraints

- **Privacy**: Never analyze page content without user action
- **API Keys**: Store only in `chrome.storage.local`, never transmit to third parties
- **Token Optimization**: Clean HTML (remove scripts, styles, ads) before LLM calls
- **Timeout**: Show loading skeleton, warn if API response exceeds 10 seconds
- **Streaming**: All LLM responses should stream to UI when possible

## Agent System

The extension includes an agentic loop for complex multi-step tasks:
- Token budget management (default: 100k tokens)
- Step limits (default: 5 steps)
- Phases: thinking → executing → analyzing → reflecting → synthesizing
- Supports graceful degradation when limits are reached
