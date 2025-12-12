# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## 0.1.0 (2025-12-12)


### ⚠ BREAKING CHANGES

* **content:** Sidebar component removed, replaced by FloatingPanel

### Features

* **agent:** set up agent module structure and core types ([764169b](https://github.com/PeterFile/KnowledgeLens/commit/764169b6efcf5411bebe379664fe2b8103ad3964))
* **api:** add search results integration with property test ([927d07a](https://github.com/PeterFile/KnowledgeLens/commit/927d07a7cf083373e252289ad00da1be39927132))
* **api:** implement llm and search api clients with streaming support ([a10298c](https://github.com/PeterFile/KnowledgeLens/commit/a10298cc73573d5395d208676f8324e929a82a86))
* **api:** update llm models to late 2025 versions and fix google search ([6fa06ea](https://github.com/PeterFile/KnowledgeLens/commit/6fa06ea597fe1fb627fd75a8d0deeca6c6c1493b))
* **background:** implement service worker with message handlers ([a24de76](https://github.com/PeterFile/KnowledgeLens/commit/a24de7625a79755d881b75de1bc2bfddb6372980))
* **content:** implement screenshot overlay and processing panel ([6a6d268](https://github.com/PeterFile/KnowledgeLens/commit/6a6d268c0b82cfac801bbbb961987b106d929f3b))
* **content:** implement shadow dom container and text selection ui ([4a3f799](https://github.com/PeterFile/KnowledgeLens/commit/4a3f799484725b96a3481c16d0292c34c221fd8c))
* **content:** replace sidebar with draggable floating panel and markdown support ([#3](https://github.com/PeterFile/KnowledgeLens/issues/3)) ([8abf2e0](https://github.com/PeterFile/KnowledgeLens/commit/8abf2e0b0151eb18be99a7d66a9469fe8e7fa0b0)), closes [#667](https://github.com/PeterFile/KnowledgeLens/issues/667) [#764ba2](https://github.com/PeterFile/KnowledgeLens/issues/764ba2)
* implement screenshot-to-notes features ([167f00c](https://github.com/PeterFile/KnowledgeLens/commit/167f00ceafd8b258f291b1fb8f4bd760ea6f8b01))
* **lib:** add content extractor module for page content extraction and cleaning ([bb4da43](https://github.com/PeterFile/KnowledgeLens/commit/bb4da430c872b9ae8fba8a77a552ccd633e5be72))
* **lib:** add tokenizer and request manager modules ([e19cf05](https://github.com/PeterFile/KnowledgeLens/commit/e19cf05208326fd6ebe014291792062659d6fe73))
* **screenshot:** implement screenshot capture pipeline ([a01f15e](https://github.com/PeterFile/KnowledgeLens/commit/a01f15ed8710fdb7d187a541768029be8780ff8f))
* **storage:** add storage manager for api keys ([4db26cb](https://github.com/PeterFile/KnowledgeLens/commit/4db26cbb6f514b940cd4aba39eeab16a53483e4f))


### Bug Fixes

* add context truncation and activate agentic search ([483aa7e](https://github.com/PeterFile/KnowledgeLens/commit/483aa7eac8c888b53adeecf508a88242b2c27cec))
* improve context extraction by walking up DOM tree ([443f569](https://github.com/PeterFile/KnowledgeLens/commit/443f56961050ebbf44db9ec7bc3f59cf1a05102f))
* pass tabId to sendStreamingMessage for content script communication ([4b9cdec](https://github.com/PeterFile/KnowledgeLens/commit/4b9cdecd51cb318981d33a87a799b00f2d7c8cbb))
* replace unload event with pagehide to avoid permissions policy violation ([b6ec4d2](https://github.com/PeterFile/KnowledgeLens/commit/b6ec4d2d7f854a55b5e7fed960fbf092ae79c9e0))


### Tests

* add property test for markdown rendering preserves content ([2d651af](https://github.com/PeterFile/KnowledgeLens/commit/2d651af61da6dd1968b91bd76ed59dff78a0a810))
* add property test for qr code round trip ([103e787](https://github.com/PeterFile/KnowledgeLens/commit/103e78777bfde3e68c8d941f9d2c63a49d707d32))
* add property test for shadow dom style isolation ([577d117](https://github.com/PeterFile/KnowledgeLens/commit/577d1177461de226a550d2e69c8ffa8797691406))
* add property tests for screenshot operations ([fc274c3](https://github.com/PeterFile/KnowledgeLens/commit/fc274c3fea269005130200c59dc6f9cbf67b2a7e))
* add property-based tests for content extraction ([c761fa2](https://github.com/PeterFile/KnowledgeLens/commit/c761fa294e88ae187ed7355ad1a6163a66dad927))
* **content:** add property tests for floating bubble positioning ([d0a4b65](https://github.com/PeterFile/KnowledgeLens/commit/d0a4b653bfa293485c46f6dee32d98c1d2210f6c))
* **extractor:** add property-based test for context window extraction ([1518abd](https://github.com/PeterFile/KnowledgeLens/commit/1518abd265b165b8f49c5d64ae18c994fc01163b))
* **request-manager:** add property tests for request cancellation ([68ec531](https://github.com/PeterFile/KnowledgeLens/commit/68ec531b1f753cdea725a8cbe9a8f6b6f3ddb5d4))
* **storage:** add property tests for storage operations ([f699e7f](https://github.com/PeterFile/KnowledgeLens/commit/f699e7fcea7d624e9a8ebca6938d5845a46f2ef0))
* **tokenizer:** add property-based test for token truncation ([68efb8f](https://github.com/PeterFile/KnowledgeLens/commit/68efb8f7f1fc39e256081c9fd7af716b7fc7ceb2))


### Refactors

* **api:** use structured messages to prevent prompt injection ([97d52e7](https://github.com/PeterFile/KnowledgeLens/commit/97d52e798df1636a4eb30520671a3373067e48f5))
* componentize popup and add agentic search query generation ([71ea7f0](https://github.com/PeterFile/KnowledgeLens/commit/71ea7f056d678e33b3250473a98f8dc54e2e40fe))


### Chores

* remove .vscode from version control ([412e291](https://github.com/PeterFile/KnowledgeLens/commit/412e29115da80be0d70bc3ebb0b65a82917e480c))
* **repo:** add code quality tools and CI/CD workflows ([#1](https://github.com/PeterFile/KnowledgeLens/issues/1)) ([e2324d2](https://github.com/PeterFile/KnowledgeLens/commit/e2324d279af88e2882b176b6a18418438ce01f1e))
* **repo:** add cross-platform release:tag script ([60c64a2](https://github.com/PeterFile/KnowledgeLens/commit/60c64a2428ca731a31c863df2da8ad3bb3627330))
* **repo:** release v0.0.1 ([#2](https://github.com/PeterFile/KnowledgeLens/issues/2)) ([fd56f16](https://github.com/PeterFile/KnowledgeLens/commit/fd56f16a8c17947d5c6807be9cd48f1aa821cd88))

### 0.0.1 (2025-12-12)


### Features

* **agent:** set up agent module structure and core types ([764169b](https://github.com/PeterFile/KnowledgeLens/commit/764169b6efcf5411bebe379664fe2b8103ad3964))
* **api:** add search results integration with property test ([927d07a](https://github.com/PeterFile/KnowledgeLens/commit/927d07a7cf083373e252289ad00da1be39927132))
* **api:** implement llm and search api clients with streaming support ([a10298c](https://github.com/PeterFile/KnowledgeLens/commit/a10298cc73573d5395d208676f8324e929a82a86))
* **api:** update llm models to late 2025 versions and fix google search ([6fa06ea](https://github.com/PeterFile/KnowledgeLens/commit/6fa06ea597fe1fb627fd75a8d0deeca6c6c1493b))
* **background:** implement service worker with message handlers ([a24de76](https://github.com/PeterFile/KnowledgeLens/commit/a24de7625a79755d881b75de1bc2bfddb6372980))
* **content:** implement screenshot overlay and processing panel ([6a6d268](https://github.com/PeterFile/KnowledgeLens/commit/6a6d268c0b82cfac801bbbb961987b106d929f3b))
* **content:** implement shadow dom container and text selection ui ([4a3f799](https://github.com/PeterFile/KnowledgeLens/commit/4a3f799484725b96a3481c16d0292c34c221fd8c))
* implement screenshot-to-notes features ([167f00c](https://github.com/PeterFile/KnowledgeLens/commit/167f00ceafd8b258f291b1fb8f4bd760ea6f8b01))
* **lib:** add content extractor module for page content extraction and cleaning ([bb4da43](https://github.com/PeterFile/KnowledgeLens/commit/bb4da430c872b9ae8fba8a77a552ccd633e5be72))
* **lib:** add tokenizer and request manager modules ([e19cf05](https://github.com/PeterFile/KnowledgeLens/commit/e19cf05208326fd6ebe014291792062659d6fe73))
* **screenshot:** implement screenshot capture pipeline ([a01f15e](https://github.com/PeterFile/KnowledgeLens/commit/a01f15ed8710fdb7d187a541768029be8780ff8f))
* **storage:** add storage manager for api keys ([4db26cb](https://github.com/PeterFile/KnowledgeLens/commit/4db26cbb6f514b940cd4aba39eeab16a53483e4f))


### Bug Fixes

* add context truncation and activate agentic search ([483aa7e](https://github.com/PeterFile/KnowledgeLens/commit/483aa7eac8c888b53adeecf508a88242b2c27cec))
* improve context extraction by walking up DOM tree ([443f569](https://github.com/PeterFile/KnowledgeLens/commit/443f56961050ebbf44db9ec7bc3f59cf1a05102f))
* pass tabId to sendStreamingMessage for content script communication ([4b9cdec](https://github.com/PeterFile/KnowledgeLens/commit/4b9cdecd51cb318981d33a87a799b00f2d7c8cbb))
* replace unload event with pagehide to avoid permissions policy violation ([b6ec4d2](https://github.com/PeterFile/KnowledgeLens/commit/b6ec4d2d7f854a55b5e7fed960fbf092ae79c9e0))


### Tests

* add property test for markdown rendering preserves content ([2d651af](https://github.com/PeterFile/KnowledgeLens/commit/2d651af61da6dd1968b91bd76ed59dff78a0a810))
* add property test for qr code round trip ([103e787](https://github.com/PeterFile/KnowledgeLens/commit/103e78777bfde3e68c8d941f9d2c63a49d707d32))
* add property test for shadow dom style isolation ([577d117](https://github.com/PeterFile/KnowledgeLens/commit/577d1177461de226a550d2e69c8ffa8797691406))
* add property tests for screenshot operations ([fc274c3](https://github.com/PeterFile/KnowledgeLens/commit/fc274c3fea269005130200c59dc6f9cbf67b2a7e))
* add property-based tests for content extraction ([c761fa2](https://github.com/PeterFile/KnowledgeLens/commit/c761fa294e88ae187ed7355ad1a6163a66dad927))
* **content:** add property tests for floating bubble positioning ([d0a4b65](https://github.com/PeterFile/KnowledgeLens/commit/d0a4b653bfa293485c46f6dee32d98c1d2210f6c))
* **extractor:** add property-based test for context window extraction ([1518abd](https://github.com/PeterFile/KnowledgeLens/commit/1518abd265b165b8f49c5d64ae18c994fc01163b))
* **request-manager:** add property tests for request cancellation ([68ec531](https://github.com/PeterFile/KnowledgeLens/commit/68ec531b1f753cdea725a8cbe9a8f6b6f3ddb5d4))
* **storage:** add property tests for storage operations ([f699e7f](https://github.com/PeterFile/KnowledgeLens/commit/f699e7fcea7d624e9a8ebca6938d5845a46f2ef0))
* **tokenizer:** add property-based test for token truncation ([68efb8f](https://github.com/PeterFile/KnowledgeLens/commit/68efb8f7f1fc39e256081c9fd7af716b7fc7ceb2))


### Refactors

* **api:** use structured messages to prevent prompt injection ([97d52e7](https://github.com/PeterFile/KnowledgeLens/commit/97d52e798df1636a4eb30520671a3373067e48f5))
* componentize popup and add agentic search query generation ([71ea7f0](https://github.com/PeterFile/KnowledgeLens/commit/71ea7f056d678e33b3250473a98f8dc54e2e40fe))


### Chores

* remove .vscode from version control ([412e291](https://github.com/PeterFile/KnowledgeLens/commit/412e29115da80be0d70bc3ebb0b65a82917e480c))
* **repo:** add code quality tools and CI/CD workflows ([#1](https://github.com/PeterFile/KnowledgeLens/issues/1)) ([e2324d2](https://github.com/PeterFile/KnowledgeLens/commit/e2324d279af88e2882b176b6a18418438ce01f1e))
* **repo:** add standard-version and set initial version to 0.0.1 ([92ab057](https://github.com/PeterFile/KnowledgeLens/commit/92ab057f9c6715287e9209c8d49c8ab94bd99423))

## 1.0.0 (2025-12-12)


### Features

* **agent:** set up agent module structure and core types ([764169b](https://github.com/PeterFile/KnowledgeLens/commit/764169b6efcf5411bebe379664fe2b8103ad3964))
* **api:** add search results integration with property test ([927d07a](https://github.com/PeterFile/KnowledgeLens/commit/927d07a7cf083373e252289ad00da1be39927132))
* **api:** implement llm and search api clients with streaming support ([a10298c](https://github.com/PeterFile/KnowledgeLens/commit/a10298cc73573d5395d208676f8324e929a82a86))
* **api:** update llm models to late 2025 versions and fix google search ([6fa06ea](https://github.com/PeterFile/KnowledgeLens/commit/6fa06ea597fe1fb627fd75a8d0deeca6c6c1493b))
* **background:** implement service worker with message handlers ([a24de76](https://github.com/PeterFile/KnowledgeLens/commit/a24de7625a79755d881b75de1bc2bfddb6372980))
* **content:** implement screenshot overlay and processing panel ([6a6d268](https://github.com/PeterFile/KnowledgeLens/commit/6a6d268c0b82cfac801bbbb961987b106d929f3b))
* **content:** implement shadow dom container and text selection ui ([4a3f799](https://github.com/PeterFile/KnowledgeLens/commit/4a3f799484725b96a3481c16d0292c34c221fd8c))
* implement screenshot-to-notes features ([167f00c](https://github.com/PeterFile/KnowledgeLens/commit/167f00ceafd8b258f291b1fb8f4bd760ea6f8b01))
* **lib:** add content extractor module for page content extraction and cleaning ([bb4da43](https://github.com/PeterFile/KnowledgeLens/commit/bb4da430c872b9ae8fba8a77a552ccd633e5be72))
* **lib:** add tokenizer and request manager modules ([e19cf05](https://github.com/PeterFile/KnowledgeLens/commit/e19cf05208326fd6ebe014291792062659d6fe73))
* **screenshot:** implement screenshot capture pipeline ([a01f15e](https://github.com/PeterFile/KnowledgeLens/commit/a01f15ed8710fdb7d187a541768029be8780ff8f))
* **storage:** add storage manager for api keys ([4db26cb](https://github.com/PeterFile/KnowledgeLens/commit/4db26cbb6f514b940cd4aba39eeab16a53483e4f))


### Bug Fixes

* add context truncation and activate agentic search ([483aa7e](https://github.com/PeterFile/KnowledgeLens/commit/483aa7eac8c888b53adeecf508a88242b2c27cec))
* improve context extraction by walking up DOM tree ([443f569](https://github.com/PeterFile/KnowledgeLens/commit/443f56961050ebbf44db9ec7bc3f59cf1a05102f))
* pass tabId to sendStreamingMessage for content script communication ([4b9cdec](https://github.com/PeterFile/KnowledgeLens/commit/4b9cdecd51cb318981d33a87a799b00f2d7c8cbb))
* replace unload event with pagehide to avoid permissions policy violation ([b6ec4d2](https://github.com/PeterFile/KnowledgeLens/commit/b6ec4d2d7f854a55b5e7fed960fbf092ae79c9e0))


### Tests

* add property test for markdown rendering preserves content ([2d651af](https://github.com/PeterFile/KnowledgeLens/commit/2d651af61da6dd1968b91bd76ed59dff78a0a810))
* add property test for qr code round trip ([103e787](https://github.com/PeterFile/KnowledgeLens/commit/103e78777bfde3e68c8d941f9d2c63a49d707d32))
* add property test for shadow dom style isolation ([577d117](https://github.com/PeterFile/KnowledgeLens/commit/577d1177461de226a550d2e69c8ffa8797691406))
* add property tests for screenshot operations ([fc274c3](https://github.com/PeterFile/KnowledgeLens/commit/fc274c3fea269005130200c59dc6f9cbf67b2a7e))
* add property-based tests for content extraction ([c761fa2](https://github.com/PeterFile/KnowledgeLens/commit/c761fa294e88ae187ed7355ad1a6163a66dad927))
* **content:** add property tests for floating bubble positioning ([d0a4b65](https://github.com/PeterFile/KnowledgeLens/commit/d0a4b653bfa293485c46f6dee32d98c1d2210f6c))
* **extractor:** add property-based test for context window extraction ([1518abd](https://github.com/PeterFile/KnowledgeLens/commit/1518abd265b165b8f49c5d64ae18c994fc01163b))
* **request-manager:** add property tests for request cancellation ([68ec531](https://github.com/PeterFile/KnowledgeLens/commit/68ec531b1f753cdea725a8cbe9a8f6b6f3ddb5d4))
* **storage:** add property tests for storage operations ([f699e7f](https://github.com/PeterFile/KnowledgeLens/commit/f699e7fcea7d624e9a8ebca6938d5845a46f2ef0))
* **tokenizer:** add property-based test for token truncation ([68efb8f](https://github.com/PeterFile/KnowledgeLens/commit/68efb8f7f1fc39e256081c9fd7af716b7fc7ceb2))


### Refactors

* **api:** use structured messages to prevent prompt injection ([97d52e7](https://github.com/PeterFile/KnowledgeLens/commit/97d52e798df1636a4eb30520671a3373067e48f5))
* componentize popup and add agentic search query generation ([71ea7f0](https://github.com/PeterFile/KnowledgeLens/commit/71ea7f056d678e33b3250473a98f8dc54e2e40fe))


### Chores

* remove .vscode from version control ([412e291](https://github.com/PeterFile/KnowledgeLens/commit/412e29115da80be0d70bc3ebb0b65a82917e480c))
* **repo:** add code quality tools and CI/CD workflows ([#1](https://github.com/PeterFile/KnowledgeLens/issues/1)) ([e2324d2](https://github.com/PeterFile/KnowledgeLens/commit/e2324d279af88e2882b176b6a18418438ce01f1e))
