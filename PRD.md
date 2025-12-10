# 产品需求文档 (PRD): "KnowledgeLens" 智能浏览器助手

## 1\. 项目概述 (Project Overview)

  * **产品名称：** KnowledgeLens (暂定名)
  * **产品类型：** Google Chrome 浏览器扩展 (Extension)
  * **核心价值：** 这是一个集成了“阅读辅助”与“知识管理”的AI助手。旨在通过AI摘要、增强搜索和智能截图功能，帮助用户在浏览网页时极速获取核心信息，并高效沉淀为笔记。
  * **目标用户：** 学生、研究人员、内容创作者、需要大量阅读资讯的职场人士。

-----

## 2\. 系统架构与技术栈 (Architecture & Tech Stack)

在深入功能之前，确立技术基础至关重要。本项目将采用 **Chrome Manifest V3** 标准。

  * **前端框架：** React 或 Vue.js (用于构建复杂的 Popup 和侧边栏 UI)。
  * **核心逻辑 (Background Service Worker)：** 处理 API 请求、上下文菜单和跨域通信。
  * **AI 模型接口 (LLM)：** OpenAI API (GPT-4o) 或 Anthropic (Claude 3.5 Sonnet) 或 Google Gemini API。
      * *理由：GPT-4o/Gemini Pro Vision 支持多模态，可直接处理截图，无需额外的 OCR 库。*
  * **搜索增强 API：** SerpApi 或 Google Custom Search JSON API (用于实时联网搜索)。
  * **截图工具：** `html2canvas` 或 Chrome Native Capture API。

-----

## 3\. 功能详细说明 (Functional Requirements)

### 3.1 功能模块一：全局内容摘要 (One-Click Summary)

> **用户场景：** 用户打开一篇长文章，不想通读全文，只想快速了解核心观点。

  * **触发方式：** 点击浏览器右上角的扩展图标，弹出主面板 (Popup)。
  * **交互流程：**
    1.  用户点击图标。
    2.  扩展自动抓取当前页面的主要正文内容 (去除广告、导航栏)。
    3.  调用 LLM API 进行总结。
    4.  **UI 展示：** 以 Markdown 格式流式输出摘要（支持分点陈述）。
  * **关键逻辑：** 需包含“重试”和“复制摘要”按钮。

### 3.2 功能模块二：智能文本处理 (Contextual Text Actions)

> **用户场景：** 用户在阅读时遇到不懂的术语，或者想深入了解某段话的背景。

  * **触发方式：** 鼠标选中网页上的任意文本段落。

  * **UI 表现：** 选中文字后，并在文字附近悬浮一个轻量级“AI 图标” (Floating Icon)。

  * **子功能详情：**

    #### 2.1 上下文解释 (Context Aware Explanation)

      * **输入：** 选中的文本 + 前后各 500 字符的上下文 (Context Window)。
      * **处理：** Prompt 提示词设定为“作为专家，根据上下文解释以下概念...”。
      * **输出：** 在悬浮卡片或侧边栏中显示解释。

    #### 2.2 联网搜索增强 (Search Enhancement)

      * **输入：** 选中的文本。
      * **处理流程：**
        1.  **意图识别：** 提取选中文本中的关键实体 (Keywords)。
        2.  **联网检索：** 调用 Search API 获取最新的 Top 3-5 搜索结果摘要。
        3.  **AI 整合：** 将搜索结果喂给 LLM，要求其结合搜索结果补充解释选中的内容。
      * **价值：** 解决大模型知识库滞后的问题，获取最新资讯。

### 3.3 功能模块三：智能截图笔记 (Smart Screenshot)

> **用户场景：** 用户看到一张图表或一段精彩的排版，想将其保存为笔记卡片。

  * **触发方式：** 在扩展 Popup 菜单中点击“截图工具”，或使用快捷键 (如 `Ctrl+Shift+X`)。

  * **交互流程：**

    1.  屏幕变暗，出现选框工具 (类似系统截图)。
    2.  用户拖拽选择区域。
    3.  松开鼠标后，弹出“处理面板”。

    #### 3.1 截图转笔记文本 (Vision to Text)

      * **技术实现：** 将截取的图片 Base64 编码发送给多模态大模型 (如 GPT-4o/Gemini Pro Vision)。
      * **Prompt 设定：** "提取图片中的所有文字信息，并根据布局逻辑整理成结构清晰的笔记。如果是图表，请分析图表数据的趋势。"
      * **输出：** 可编辑的文本笔记。

    #### 3.2 生成笔记卡片 (Note Card Generation)

      * **功能：** 将截图内容 + AI 生成的总结/金句，合成一张精美的图片卡片。
      * **模板设计：**
          * **头部：** 来源网站 Title + Favicon。
          * **中部：** 用户截图原图 或 AI 提炼的重点引用。
          * **底部：** AI 生成的简短点评 + 二维码 (指向原链接)。
      * **操作：** 用户可点击“下载图片”或“复制到剪贴板”。

-----

## 4\. 用户界面 (UI/UX) 设计规范

为了保证体验流畅，建议界面遵循以下层级：

1.  **Popup (主面板)：**

      * 宽度：400px，高度：600px。
      * 顶部：功能导航 (摘要 | 聊天 | 设置)。
      * 中部：内容展示区 (Markdown渲染)。
      * 底部：操作栏 (截图按钮 | 复制 | 清除)。

2.  **Floating Bubble (悬浮气泡)：**

      * 仅在选中文本时出现。
      * 设计要极简，避免遮挡视线。
      * 点击后展开为 **Sidebar (侧边栏)** 而不是遮挡页面内容的小弹窗，提供更好的阅读体验。

3.  **Screenshot Overlay (截图层)：**

      * 参考 Chrome 扩展 "Shotbox" 或 "Eagle" 的截图交互体验。

-----

## 5\. 数据结构与 API 示例 (Data Structure)

**请求示例 (Feature 2.2 - 搜索增强):**

```json
{
  "action": "search_enhance",
  "selected_text": "RAG architecture",
  "context": "...retrieval augmented generation is useful for...",
  "user_prompt": "Explain this with latest examples"
}
```

**Prompt 策略 (System Prompt 示例):**

> "你是一个专业的知识管理助手。用户会提供网页截图或文本。
>
> 1.  如果是文本，请结合上下文解释。
> 2.  如果涉及搜索请求，请根据提供的搜索结果（Search Results）进行综合回答，必须标注来源。
> 3.  如果是截图，请提取信息并转化为结构化笔记。"

-----

## 6\. 非功能性需求 (Non-Functional Requirements)

1.  **响应速度：** 截图处理和文本解释需显示“加载动画” (Skeleton loader)，若 API 响应超过 10 秒需提示超时。
2.  **隐私安全：**
      * 除非用户点击触发，否则不主动分析网页内容。
      * 用户的 API Key 必须存储在 `chrome.storage.local` 中，不得上传至第三方服务器。
3.  **Token 优化：** 发送给 LLM 的 HTML 内容需先进行清洗（去除 tag、script、style），以减少 Token 消耗。