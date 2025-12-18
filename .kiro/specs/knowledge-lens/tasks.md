# Implementation Plan

- [x] 1. Set up core infrastructure and utilities





  - [x] 1.1 Create tokenizer module with js-tiktoken


    - Install `js-tiktoken` package
    - Implement `getEncodingForModel()` for provider-specific encoding selection
    - Implement `countTokens()` and `truncateToTokens()` functions
    - _Requirements: 10.3_
  - [x] 1.2 Write property test for token truncation










    - **Property 14: Content truncation respects limits**
    - **Validates: Requirements 10.3**

  - [x] 1.3 Create request manager for AbortController support

    - Implement `create()`, `cancel()`, `cancelAll()`, `get()` methods
    - Track active requests with unique IDs
    - _Requirements: 9.2_
  - [x] 1.4 Write property test for request cancellation






    - **Property 15: Request cancellation stops processing**
    - **Validates: Requirements 9.2**

- [x] 2. Implement content extraction and cleaning





  - [x] 2.1 Create content extractor module


    - Implement `extractPageContent()` to extract main content from DOM
    - Implement `cleanHtml()` to remove scripts, styles, and navigation
    - Integrate tokenizer for accurate token counting
    - _Requirements: 1.2, 10.1, 10.2_
  - [ ] 2.2 Write property test for content cleaning





    - **Property 1: Content extraction removes unwanted elements**
    - **Property 13: HTML cleaning preserves visible text**
    - **Validates: Requirements 1.2, 10.1, 10.2**

  - [x] 2.3 Implement context window extraction

    - Extract 500 characters before and after selection
    - Handle document boundary cases
    - _Requirements: 3.1_
  - [x] 2.4 Write property test for context extraction






    - **Property 4: Context window extraction**
    - **Validates: Requirements 3.1**

- [x] 3. Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement API client with streaming support




  - [x] 4.1 Create base API client structure


    - Define `LLMConfig` and `SearchConfig` interfaces
    - Implement AbortSignal support for all API calls
    - _Requirements: 8.1, 8.2_
  - [x] 4.2 Implement OpenAI streaming API client


    - Implement `callLLMStreaming()` with `onToken` callback
    - Handle SSE (Server-Sent Events) parsing
    - _Requirements: 1.4_
  - [x] 4.3 Implement multimodal API client


    - Implement `callLLMWithImage()` for vision models
    - Support Base64 image encoding
    - _Requirements: 6.1_
  - [x] 4.4 Implement search API client


    - Implement `searchWeb()` for SerpApi/Google Custom Search
    - Extract keywords from selected text
    - _Requirements: 4.1, 4.2_
  - [x]* 4.5 Write property test for keyword extraction
    - **Property 5: Keyword extraction produces valid substrings**
    - **Validates: Requirements 4.1**

- [x] 5. Implement storage manager

  - [x] 5.1 Create storage module for API keys

    - Implement `saveSettings()`, `loadSettings()`, `clearSettings()`
    - Use `chrome.storage.local` for secure storage
    - _Requirements: 8.2, 8.3, 8.4_
  - [x] 5.2 Write property tests for storage operations






    - **Property 11: API key storage round trip**
    - **Property 12: API key deletion**
    - **Validates: Requirements 8.2, 8.4**

- [ ] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement background service worker







  - [ ] 7.1 Set up message handler with discriminated unions
    - Define `ExtensionMessage` type with all action variants
    - Implement type-safe message routing

    - _Requirements: 1.1, 2.2, 3.2, 4.3_
  - [ ] 7.2 Implement page summarization handler
    - Receive content from content script
    - Call LLM API with streaming

    - Forward streaming responses to popup
    - _Requirements: 1.3, 1.4_
  - [x] 7.3 Implement text explanation handler

    - Handle contextual explanation requests
    - Combine selected text with context window
    - _Requirements: 3.2, 3.3_
  - [ ] 7.4 Implement search-enhanced explanation handler
    - Extract keywords and call search API
    - Combine search results with LLM prompt
    - _Requirements: 4.2, 4.3, 4.4_
  - [x] 7.5 Write property test for search results integration






    - **Property 6: Search results integration**
    - **Validates: Requirements 4.3**

- [x] 8. Implement screenshot capture pipeline






  - [x] 8.1 Create offscreen document for image cropping

    - Set up offscreen document with Canvas API
    - Implement `cropImage()` function
    - _Requirements: 5.3_

  - [x] 8.2 Implement screenshot capture in service worker

    - Use `chrome.tabs.captureVisibleTab()` for full screenshot
    - Send to offscreen document for cropping
    - _Requirements: 5.2, 5.3_
  - [x] 8.3 Write property tests for screenshot operations






    - **Property 7: Screenshot region dimensions**
    - **Property 8: Screenshot output format**
    - **Validates: Requirements 5.2, 5.3**

- [x] 9. Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement content script with Shadow DOM





  - [x] 10.1 Create Shadow DOM container utility


    - Implement `createShadowContainer()` for isolated UI
    - Inject Tailwind styles into shadow root
    - _Requirements: 2.1, 2.2_
  - [x] 10.2 Write property test for Shadow DOM isolation






    - **Property 16: Shadow DOM style isolation**
    - **Validates: Requirements 2.1, 2.2**


  - [ ] 10.3 Implement text selection detection
    - Listen for `mouseup` events


    - Extract selection with context
    - _Requirements: 2.1, 3.1_
  - [ ] 10.4 Implement floating bubble component
    - Show bubble near selection
    - Hide on selection clear


    - _Requirements: 2.1, 2.3_
  - [x] 10.5 Write property test for bubble positioning






    - **Property 3: Floating bubble positioning**
    - **Validates: Requirements 2.1**
  - [ ] 10.6 Implement sidebar component
    - Expand from bubble click
    - Display streaming LLM responses
    - Support explain and search modes
    - _Requirements: 2.2, 2.4, 3.3, 4.4_

- [x] 11. Implement screenshot overlay






  - [x] 11.1 Create screenshot overlay component

    - Dim background on activation
    - Handle drag selection for region
    - _Requirements: 5.1, 5.2_


  - [ ] 11.2 Implement processing panel
    - Display captured screenshot
    - Provide AI analysis options
    - _Requirements: 5.4_

- [ ] 12. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Implement popup UI
  - [x] 13.1 Create popup layout with tabs
    - Implement Summary, Chat, Settings tabs
    - Set up 400x600px dimensions
    - _Requirements: 1.1_
  - [x] 13.2 Implement summary view with streaming
    - Display skeleton loader during loading
    - Render Markdown with streaming updates
    - Add retry and copy buttons
    - _Requirements: 1.4, 1.5, 9.1_
  - [x] 13.3 Write property test for Markdown rendering






    - **Property 2: Markdown rendering preserves content**
    - **Validates: Requirements 1.4, 3.3**
  - [x] 13.4 Implement settings view
    - API key input fields for LLM and Search
    - Save/clear functionality
    - _Requirements: 8.1, 8.4_
  - [x] 13.5 Implement error and timeout handling

    - Display timeout warning after 10 seconds
    - Show descriptive error messages
    - _Requirements: 9.2, 9.3, 9.4_

- [x] 14. Implement screenshot-to-notes features





  - [x] 14.1 Implement vision-to-text extraction


    - Send screenshot to multimodal LLM
    - Display editable extracted text
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ] 14.2 Implement note card generator
    - Create card template with metadata
    - Generate QR code for source URL
    - _Requirements: 7.1, 7.2, 7.3_
  - [x] 14.3 Write property test for QR code round trip






    - **Property 10: QR code round trip**
    - **Validates: Requirements 7.3**
  - [x] 14.4 Write property test for note card metadata






    - **Property 9: Note card metadata inclusion**

    - **Validates: Requirements 7.1, 7.2**
  - [ ] 14.5 Implement download and copy actions
    - Download card as image
    - Copy to clipboard
    - _Requirements: 7.4_

- [ ] 15. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
