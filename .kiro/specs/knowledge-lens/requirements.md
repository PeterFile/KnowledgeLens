# Requirements Document

## Introduction

KnowledgeLens is a Chrome browser extension (Manifest V3) that serves as an AI-powered reading assistant and knowledge management tool. The extension helps users quickly extract core information while browsing web pages through AI summarization, contextual text explanations, web search enhancement, and smart screenshot-to-notes conversion. Target users include students, researchers, content creators, and professionals who need to consume large amounts of online content.

## Glossary

- **KnowledgeLens**: The Chrome extension system being developed
- **Popup**: The main UI panel (400x600px) that appears when clicking the extension icon
- **Floating Bubble**: A lightweight AI icon that appears near selected text
- **Sidebar**: An expandable panel for displaying AI responses without blocking page content
- **Screenshot Overlay**: A full-page selection tool for capturing screen regions
- **LLM**: Large Language Model API (OpenAI GPT-4o, Anthropic Claude, or Google Gemini)
- **Content Script**: JavaScript injected into web pages for DOM interaction
- **Background Service Worker**: The extension's background process handling API calls and messaging
- **Context Window**: The surrounding text (500 characters before and after) around selected content
- **Note Card**: A formatted image combining screenshot, AI summary, and source metadata

## Requirements

### Requirement 1: Page Content Summarization

**User Story:** As a reader, I want to get a quick summary of the current web page, so that I can understand the core content without reading the entire article.

#### Acceptance Criteria

1. WHEN a user clicks the extension icon THEN KnowledgeLens SHALL display the Popup panel with summarization capability
2. WHEN a user requests page summarization THEN KnowledgeLens SHALL extract the main content from the current page excluding advertisements and navigation elements
3. WHEN page content is extracted THEN KnowledgeLens SHALL send the cleaned content to the configured LLM API for summarization
4. WHEN the LLM generates a summary THEN KnowledgeLens SHALL display the response in Markdown format with streaming output support
5. WHEN a summary is displayed THEN KnowledgeLens SHALL provide retry and copy-to-clipboard buttons
6. WHEN content extraction fails THEN KnowledgeLens SHALL display a clear error message indicating the failure reason

### Requirement 2: Text Selection Detection

**User Story:** As a reader, I want to select text on any webpage and see an AI action button, so that I can quickly get explanations or search results for the selected content.

#### Acceptance Criteria

1. WHEN a user selects text on a webpage THEN KnowledgeLens SHALL display a Floating Bubble near the selection
2. WHEN the Floating Bubble is clicked THEN KnowledgeLens SHALL expand into a Sidebar panel
3. WHEN text selection is cleared THEN KnowledgeLens SHALL hide the Floating Bubble
4. WHEN the Sidebar is open THEN KnowledgeLens SHALL provide options for contextual explanation and search enhancement

### Requirement 3: Contextual Text Explanation

**User Story:** As a reader, I want to get AI-powered explanations for selected text with surrounding context, so that I can understand unfamiliar terms or concepts in their proper context.

#### Acceptance Criteria

1. WHEN a user requests contextual explanation THEN KnowledgeLens SHALL capture the selected text plus 500 characters of surrounding context
2. WHEN context is captured THEN KnowledgeLens SHALL send the text and context to the LLM with an expert explanation prompt
3. WHEN the LLM generates an explanation THEN KnowledgeLens SHALL display the response in the Sidebar with Markdown formatting
4. WHEN explanation generation fails THEN KnowledgeLens SHALL display an error message with retry option

### Requirement 4: Search-Enhanced Explanation

**User Story:** As a reader, I want to get explanations enhanced with real-time web search results, so that I can access the latest information beyond the LLM's training data.

#### Acceptance Criteria

1. WHEN a user requests search-enhanced explanation THEN KnowledgeLens SHALL extract keywords from the selected text
2. WHEN keywords are extracted THEN KnowledgeLens SHALL query the Search API for the top 3-5 relevant results
3. WHEN search results are retrieved THEN KnowledgeLens SHALL combine them with the selected text and send to the LLM for integrated explanation
4. WHEN the LLM generates a search-enhanced response THEN KnowledgeLens SHALL display the response with source citations in the Sidebar
5. WHEN search API fails THEN KnowledgeLens SHALL fall back to contextual explanation without search results
6. WHEN the selected text contains Chinese characters THEN KnowledgeLens SHALL use Chinese-aware keyword extraction that segments text into meaningful words

### Requirement 5: Screenshot Capture

**User Story:** As a user, I want to capture a specific region of the screen, so that I can convert visual content into notes.

#### Acceptance Criteria

1. WHEN a user activates screenshot mode from Popup or keyboard shortcut THEN KnowledgeLens SHALL display the Screenshot Overlay with a dimmed background
2. WHEN the Screenshot Overlay is active THEN KnowledgeLens SHALL allow the user to drag and select a rectangular region
3. WHEN a region is selected THEN KnowledgeLens SHALL capture the selected area as a Base64-encoded image
4. WHEN screenshot capture completes THEN KnowledgeLens SHALL display a processing panel with AI analysis options
5. WHEN the user cancels screenshot mode THEN KnowledgeLens SHALL remove the Screenshot Overlay and restore normal page view

### Requirement 6: Screenshot to Text Conversion

**User Story:** As a user, I want to extract and structure text from screenshots using AI, so that I can convert visual content into editable notes.

#### Acceptance Criteria

1. WHEN a user requests text extraction from a screenshot THEN KnowledgeLens SHALL send the Base64 image to a multimodal LLM
2. WHEN the LLM processes the image THEN KnowledgeLens SHALL extract text content and organize it based on visual layout
3. WHEN the image contains charts or graphs THEN KnowledgeLens SHALL analyze and describe data trends
4. WHEN text extraction completes THEN KnowledgeLens SHALL display editable text in the processing panel
5. WHEN image processing fails THEN KnowledgeLens SHALL display an error message with retry option

### Requirement 7: Note Card Generation

**User Story:** As a user, I want to generate shareable note cards from screenshots, so that I can save and share visual content with AI-generated insights.

#### Acceptance Criteria

1. WHEN a user requests note card generation THEN KnowledgeLens SHALL create a card template with source website title and favicon
2. WHEN the card template is created THEN KnowledgeLens SHALL include the original screenshot or AI-extracted key quotes
3. WHEN card content is assembled THEN KnowledgeLens SHALL add AI-generated commentary and a QR code linking to the source URL
4. WHEN the note card is generated THEN KnowledgeLens SHALL provide download-as-image and copy-to-clipboard options
5. WHEN card generation fails THEN KnowledgeLens SHALL display an error message indicating the failure reason

### Requirement 8: API Key Management

**User Story:** As a user, I want to securely configure and store my API keys, so that I can use the extension with my own LLM and search service accounts.

#### Acceptance Criteria

1. WHEN a user opens the settings panel THEN KnowledgeLens SHALL display input fields for LLM API key and Search API key
2. WHEN a user saves API keys THEN KnowledgeLens SHALL store them in chrome.storage.local
3. WHEN API keys are stored THEN KnowledgeLens SHALL never transmit them to third-party servers other than the configured API endpoints
4. WHEN a user clears API keys THEN KnowledgeLens SHALL remove them from chrome.storage.local immediately

### Requirement 9: Loading and Error States

**User Story:** As a user, I want to see clear loading indicators and error messages, so that I understand the system status during AI operations.

#### Acceptance Criteria

1. WHEN an API request is in progress THEN KnowledgeLens SHALL display a skeleton loader animation
2. WHEN an API request exceeds 10 seconds THEN KnowledgeLens SHALL display a timeout warning with retry option
3. WHEN an API request fails THEN KnowledgeLens SHALL display a descriptive error message
4. WHEN displaying errors THEN KnowledgeLens SHALL provide actionable guidance for resolution

### Requirement 10: Content Cleaning for Token Optimization

**User Story:** As a system, I want to clean HTML content before sending to LLM, so that token usage is minimized and costs are reduced.

#### Acceptance Criteria

1. WHEN extracting page content THEN KnowledgeLens SHALL remove HTML tags, script elements, and style elements
2. WHEN content is cleaned THEN KnowledgeLens SHALL preserve meaningful text structure and hierarchy
3. WHEN cleaned content exceeds token limits THEN KnowledgeLens SHALL truncate intelligently while preserving key sections

### Requirement 11: Multilingual Support (Chinese-Friendly)

**User Story:** As a Chinese-speaking user, I want the extension to properly handle Chinese text, so that I can use all features on Chinese web pages.

#### Acceptance Criteria

1. WHEN extracting keywords from Chinese text THEN KnowledgeLens SHALL segment text into meaningful Chinese words (2-4 character sequences) rather than splitting by whitespace
2. WHEN filtering keywords THEN KnowledgeLens SHALL remove common Chinese stop words (的、了、是、在、我、有、和、就、不 etc.)
3. WHEN processing mixed Chinese-English text THEN KnowledgeLens SHALL handle both languages appropriately in the same content
4. WHEN counting tokens for Chinese text THEN KnowledgeLens SHALL use appropriate tokenizer encoding that handles CJK characters correctly
5. WHEN displaying AI responses THEN KnowledgeLens SHALL render Chinese characters correctly in Markdown format
