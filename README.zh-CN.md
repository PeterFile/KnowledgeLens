<p align="center">
  <img src="assets/icons/icon128.png" alt="KnowledgeLens" width="100" height="100">
</p>

<h1 align="center">KnowledgeLens</h1>

<p align="center">
  <strong>AI 驱动的浏览器阅读助手与知识管理工具</strong>
</p>

<p align="center">
  简体中文 | <a href="README.md">English</a>
</p>

<p align="center">
  <img alt="Chrome Extension Manifest V3" src="https://img.shields.io/badge/Manifest-V3-4285F4?style=flat-square&logo=googlechrome&logoColor=white" />
  <img alt="React 19" src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-Strict-3178C6?style=flat-square&logo=typescript&logoColor=white" />
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind-3.x-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" />
  <img alt="License" src="https://img.shields.io/badge/License-ISC-green?style=flat-square" />
</p>

<!-- TODO: 在此添加产品截图 -->
<!-- <p align="center">
  <img src="assets/screenshots/demo.png" alt="KnowledgeLens 演示" width="800">
</p> -->

---

## ✨ 功能特性

| 功能 | 触发方式 | 描述 |
|------|----------|------|
| 🚀 **一键摘要** | 点击扩展图标 | 即时总结任意网页，支持流式 Markdown 输出 |
| 💡 **上下文解释** | 选中文本 → 悬浮气泡 | 结合前后 500 字符上下文的智能解释 |
| 🔍 **搜索增强** | 选中文本 → 搜索按钮 | 实时网络搜索 + AI 综合分析，带来源引用 |
| 📸 **智能截图** | `Ctrl+Shift+X` | 区域截取、Vision AI 文字提取、生成笔记卡片 |
| 🤖 **智能体循环** | 复杂任务 | 基于 ReAct 模式的多步推理与反思机制 |

## 🏗️ 架构设计

<p align="center">
  <img src="assets/architecture.svg" alt="Architecture" width="800">
</p>

## 🤖 智能体系统

KnowledgeLens 实现了 ReAct（推理 + 行动）智能体循环，用于处理复杂的多步骤任务。

<p align="center">
  <img src="assets/react-loop.svg" alt="ReAct Loop" width="600">
</p>

**核心特性：**
- 🧠 **ReAct 模式** — 每次行动前进行显式推理
- 🔄 **自我反思** — 从失败中学习并调整策略
- 🎯 **工具注册表** — 可扩展的工具系统，带参数校验
- 📊 **Token 预算** — 达到限制时优雅降级
- 💾 **状态持久化** — 支持恢复中断的会话

## 🛠️ 技术栈

| 类别 | 技术 |
|------|------|
| 平台 | Chrome 扩展 (Manifest V3) |
| 语言 | TypeScript (严格模式) |
| UI | React 19 + Tailwind CSS 3 |
| 构建 | Vite 6 + @crxjs/vite-plugin |
| LLM | OpenAI / Anthropic Claude / Google Gemini |
| 搜索 | SerpApi / Google Custom Search |

## 📦 安装

### 从源码安装

```bash
# 克隆仓库
git clone https://github.com/user/knowledgelens.git
cd knowledgelens

# 安装依赖
npm install

# 构建生产版本
npm run build
```

然后在 Chrome 中加载：
1. 访问 `chrome://extensions/`
2. 启用 **开发者模式**
3. 点击 **加载已解压的扩展程序** → 选择 `dist/` 文件夹

## 🔧 开发

```bash
npm run dev      # 启动开发服务器 (HMR)
npm run build    # 生产构建
npm run test     # 运行测试
npm run lint     # 代码检查
```

## 🔐 隐私与安全

- ✅ API 密钥仅存储在本地 `chrome.storage.local`
- ✅ 未经用户明确操作不会分析页面内容
- ✅ 不向第三方服务器传输数据（除配置的 LLM/搜索 API 外）
- ✅ 发送给 LLM 前会清理内容（移除脚本、样式、广告）


## 🗺️ 未来计划

### 🔗 笔记应用深度同步
> Obsidian / Notion / Logseq 集成

一键同步功能，将结构化 Markdown（包含标题、URL、作者等元数据）、AI 摘要、高亮和批注直接导出到你的知识库。

### 🕸️ 知识关联
> 连接你阅读中的知识点

智能提示如 *「你上周阅读的《文章A》也提到了这个概念」* —— 帮助你在不同来源之间建立知识关联。

### 🏠 本地大模型支持
> Ollama / DeepSeek / Llama — 零数据泄露

支持连接本地运行的模型（`localhost:11434`）。非常适合隐私敏感用户和处理敏感文档的企业环境。

### 📚 抽认卡生成器
> 将文章转化为学习材料

从任意文章生成 Anki/Quizlet 兼容的抽认卡。非常适合学生背论文或开发者学习新文档。

### 🎓 苏格拉底式导读
> 通过思考学习，而非仅仅阅读

「导师模式」下，AI 通过提问引导你思考，而非直接给出答案 —— 通过主动参与促进更深层次的理解。

## 📁 项目结构

```
src/
├── background/     # Service Worker (API 路由、消息中枢)
├── content/        # 内容脚本 (悬浮气泡、面板、遮罩层)
├── popup/          # 扩展弹窗 UI (React SPA)
├── lib/
│   ├── agent/      # 智能体循环 (ReAct 模式、反思、工具)
│   ├── api.ts      # 多服务商 LLM 客户端
│   └── ...         # 工具库 (存储、分词器、截图)
├── components/     # 共享 React 组件
├── hooks/          # 自定义 React Hooks
└── types/          # TypeScript 类型定义
```

## 🤝 贡献指南

我们遵循 [GitHub Flow](https://guides.github.com/introduction/flow/) 和 [约定式提交](https://www.conventionalcommits.org/zh-hans/)。

```bash
# 分支命名
feat/add-obsidian-sync
fix/popup-rendering-bug

# 提交格式
feat(popup): add settings view for API key configuration
fix(content): correct floating bubble position on scroll
```

## 📄 许可证

[ISC License](LICENSE)

---

<p align="center">
  <sub>为知识探索者而建 🔍</sub>
</p>
