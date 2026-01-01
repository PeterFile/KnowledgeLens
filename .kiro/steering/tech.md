# Tech Stack & Build System

## Core Technologies

- **Platform**: Chrome Extension (Manifest V3)
- **Language**: TypeScript (strict mode)
- **UI Framework**: React 19
- **Styling**: Tailwind CSS 3
- **Build Tool**: Vite 6 with `@crxjs/vite-plugin`

## Chrome Extension APIs

- `chrome.storage.local` - Store user settings and API keys
- `chrome.scripting` - Inject content scripts
- `chrome.contextMenus` - Right-click menu integration
- `activeTab` - Access current tab content

## External Services (Planned)

- **LLM**: OpenAI GPT-4o / Anthropic Claude / Google Gemini (multimodal support)
- **Search**: SerpApi or Google Custom Search API
- **Screenshot**: html2canvas or Chrome Native Capture API

## Commands

```bash
# Development - starts Vite dev server with HMR
pnpm dev

# Production build - outputs to dist/
pnpm build

# Preview production build
pnpm preview

# Install dependencies
pnpm install
```

## Build Output

Extension files are built to `dist/` directory. Load this folder as an unpacked extension in Chrome for testing.

## TypeScript Configuration

- Target: ES2020
- Module: ESNext with bundler resolution
- Strict mode enabled
- Chrome types included (`@types/chrome`)
