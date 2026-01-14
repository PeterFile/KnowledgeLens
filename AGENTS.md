# Repository Guidelines

## Project Structure & Module Organization
- `src/background/` service worker for API routing and messaging.
- `src/content/` content scripts (bubble, panel, overlay) injected into pages.
- `src/popup/` React SPA for the extension popup UI.
- `src/lib/` shared utilities, agent loop, and LLM client code.
- `src/components/`, `src/hooks/`, `src/types/` for shared UI, hooks, and typings.
- `tests/` unit tests (`tests/lib`, `tests/content`).
- `assets/` icons/diagrams; `dist/` build output; `manifest.json` at repo root.
- `scripts/` release helpers (tagging, versioning).

## Build, Test, and Development Commands
- Use `pnpm install` to install dependencies (pnpm is the standard package manager here).
- `pnpm dev` starts the Vite dev server with HMR for extension UI work.
- `pnpm build` runs `tsc` then builds the extension into `dist/`.
- `pnpm preview` serves the production build locally.
- `pnpm test` runs Vitest once; `pnpm test:watch` watches tests.
- `pnpm lint` lints `src/`; `pnpm format` formats `src/**/*.{ts,tsx,css}`.

## Coding Style & Naming Conventions
- TypeScript strict mode; React 19 + Tailwind CSS.
- Prettier rules: 2-space indent, single quotes, semicolons, 100-char print width.
- ESLint enforces style; pre-commit runs lint-staged (`eslint --fix`, `prettier --write`).
- Follow existing file naming in each folder; tests use `*.test.ts` in `tests/`.

## Testing Guidelines
- Framework: Vitest with `happy-dom`; property-based tests use `fast-check`.
- Put utility/agent tests in `tests/lib` and content script tests in `tests/content`.
- Mock browser APIs with Vitest helpers to keep tests deterministic.

## Commit & Pull Request Guidelines
- Conventional Commits enforced via commitlint/husky: `type(scope): subject` (e.g., `feat(popup): add settings view`).
- Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`; common scopes: `popup`, `content`, `background`, `lib`, `types`, `ci`, `repo`.
- Branches follow GitHub Flow (e.g., `feat/add-obsidian-sync`).
- PRs include: concise summary, linked issue if applicable, test results, and UI screenshots/GIFs.

## Docs & Architecture Notes
- High-level context lives in `README.md` and `GEMINI.md`; deeper guidance is under `.kiro/steering/`.

