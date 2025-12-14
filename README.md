<p align="center">
  <img src="assets/icons/icon128.png" alt="KnowledgeLens" width="100" height="100">
</p>

<h1 align="center">KnowledgeLens</h1>

<p align="center">
  <strong>AI-Powered Browser Assistant for Reading & Knowledge Management</strong>
</p>

<p align="center">
  <a href="README.zh-CN.md">简体中文</a> | English
</p>

<p align="center">
  <img alt="Chrome Extension Manifest V3" src="https://img.shields.io/badge/Manifest-V3-4285F4?style=flat-square&logo=googlechrome&logoColor=white" />
  <img alt="React 19" src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-Strict-3178C6?style=flat-square&logo=typescript&logoColor=white" />
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind-3.x-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" />
  <img alt="License" src="https://img.shields.io/badge/License-ISC-green?style=flat-square" />
</p>

<!-- TODO: Add product screenshot here -->
<!-- <p align="center">
  <img src="assets/screenshots/demo.png" alt="KnowledgeLens Demo" width="800">
</p> -->

---

## ✨ Features

| Feature | Trigger | Description |
|---------|---------|-------------|
| 🚀 **One-Click Summary** | Click extension icon | Instantly summarize any webpage with streaming Markdown output |
| 💡 **Context Explanation** | Select text → Floating Bubble | Get intelligent explanations considering ±500 chars context |
| 🔍 **Search Enhancement** | Select text → Search button | Real-time web search + AI synthesis with source citations |
| 📸 **Smart Screenshot** | `Ctrl+Shift+X` | Capture regions, extract text via Vision AI, generate note cards |
| 🤖 **Agentic Loop** | Complex tasks | Multi-step reasoning with ReAct pattern and reflection |

## 🏗️ Architecture

<p align="center">
  <img src="assets/architecture.svg" alt="Architecture" width="800">
</p>

## 🤖 Agent System

KnowledgeLens implements a ReAct (Reasoning + Acting) agent loop for complex multi-step tasks.

<p align="center">
  <img src="assets/react-loop.svg" alt="ReAct Loop" width="600">
</p>

**Key Features:**
- 🧠 **ReAct Pattern** — Explicit reasoning before each action
- 🔄 **Self-Reflection** — Learn from failures and adjust strategy
- 🎯 **Tool Registry** — Extensible tool system with validation
- 📊 **Token Budget** — Graceful degradation when limits reached
- 💾 **State Persistence** — Resume interrupted sessions

## 🛠️ Tech Stack

| Category | Technology |
|----------|------------|
| Platform | Chrome Extension (Manifest V3) |
| Language | TypeScript (strict mode) |
| UI | React 19 + Tailwind CSS 3 |
| Build | Vite 6 + @crxjs/vite-plugin |
| LLM | OpenAI / Anthropic Claude / Google Gemini |
| Search | SerpApi / Google Custom Search |

## 📦 Installation

### From Source

```bash
# Clone repository
git clone https://github.com/user/knowledgelens.git
cd knowledgelens

# Install dependencies
npm install

# Build for production
npm run build
```

Then load in Chrome:
1. Go to `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** → select `dist/` folder

## 🔧 Development

```bash
npm run dev      # Start dev server with HMR
npm run build    # Production build
npm run test     # Run tests
npm run lint     # Lint code
```

## 🔐 Privacy & Security

- ✅ API keys stored locally in `chrome.storage.local` only
- ✅ No page analysis without explicit user action
- ✅ No data transmitted to third-party servers (except configured LLM/Search APIs)
- ✅ Content cleaned before LLM calls (scripts, styles, ads removed)


## 🗺️ Roadmap

### 🔗 Deep Sync with Note-Taking Apps
> Obsidian / Notion / Logseq Integration

One-click export of structured Markdown with metadata (title, URL, author), AI summaries, highlights, and annotations directly to your knowledge base.

### 🕸️ Knowledge Graphing
> Connect the Dots Across Your Reading

Intelligent prompts like *"Article A you read last week also mentioned this concept"* — building connections between ideas across different sources.

### 🏠 Local LLM Support
> Ollama / DeepSeek / Llama — Zero Data Leakage

Connect to locally running models at `localhost:11434`. Perfect for privacy-conscious users and enterprise environments handling sensitive documents.

### 📚 Flashcard Generator
> Turn Articles into Learning Material

Generate Anki/Quizlet-compatible flashcards from any article. Ideal for students studying papers or developers learning new documentation.

### 🎓 Socratic Guide Mode
> Learn by Thinking, Not Just Reading

A "Tutor Mode" where AI guides you through questions instead of giving direct answers — fostering deeper understanding through active engagement.

## 📁 Project Structure

```
src/
├── background/     # Service worker (API routing, message hub)
├── content/        # Content scripts (FloatingBubble, Panel, Overlay)
├── popup/          # Extension popup UI (React SPA)
├── lib/
│   ├── agent/      # Agentic loop (ReAct pattern, reflection, tools)
│   ├── api.ts      # Multi-provider LLM client
│   └── ...         # Utilities (storage, tokenizer, screenshot)
├── components/     # Shared React components
├── hooks/          # Custom React hooks
└── types/          # TypeScript definitions
```

## 🤝 Contributing

We follow [GitHub Flow](https://guides.github.com/introduction/flow/) with [Conventional Commits](https://www.conventionalcommits.org/).

```bash
# Branch naming
feat/add-obsidian-sync
fix/popup-rendering-bug

# Commit format
feat(popup): add settings view for API key configuration
fix(content): correct floating bubble position on scroll
```

## 📄 License

[ISC License](LICENSE)

---

<p align="center">
  <sub>Built for knowledge seekers 🔍</sub>
</p>
