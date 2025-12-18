---
inclusion: always
---

# Git Workflow & Version Control

## Branch Model: GitHub Flow

- `main` is always deployable - NEVER commit directly
- All changes require Pull Requests from feature branches

## Feature Branch Workflow

```bash
# 1. Create branch from latest main
git checkout main && git pull origin main
git checkout -b [type]/[short-description]

# 2. Before pushing, sync with main
git pull origin main
git push origin [branch-name]
```

**Branch naming:** `[type]/[short-description]`
- `feat/add-screenshot-overlay`
- `fix/popup-rendering-bug`
- `docs/update-readme`

## Commit Message Format

**Required format:** `type(scope): description`

### Types
| Type | Use Case |
|------|----------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Code formatting (no logic change) |
| `refactor` | Code restructuring (no behavior change) |
| `test` | Test changes |
| `chore` | Build/tooling changes |

### Scopes (Project-Specific)
| Scope | Directory/Area |
|-------|----------------|
| `popup` | `src/popup/` - Extension popup UI |
| `content` | `src/content/` - Content scripts |
| `background` | `src/background/` - Service worker |
| `lib` | `src/lib/` - Utilities and services |
| `types` | `src/types/` - TypeScript definitions |
| `ci` | GitHub Actions workflows |
| `repo` | Repository-wide changes |

### Description Rules
- English, imperative mood, lowercase start
- Concise and descriptive

### Examples
```
feat(popup): add settings view for API key configuration
fix(content): correct floating bubble position on scroll
refactor(lib): extract screenshot logic to separate module
chore(repo): update vite to v6
```

## AI Assistant Guidelines

- Make atomic commits for each logical change
- Always use Conventional Commits format
- Do NOT create version tags or releases (managed by maintainers)
- After PR merge, delete the feature branch
- When creating PRs, provide clear title and description
