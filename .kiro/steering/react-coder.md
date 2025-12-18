---
inclusion: fileMatch
fileMatchPattern: ['**/*.tsx', '**/*.jsx']
---

# React Code Standards

Write React 19 code optimized for React Compiler. This is a Chrome Extension—no Server Components, no SSR.

## Core Principles

| Principle | Implementation |
|-----------|----------------|
| Functional only | No class components. Hooks for state and effects |
| Pure rendering | No side effects in component body. Render = f(props, state) |
| One-way data flow | Props down, events up. Lift state or use Context |
| Immutable updates | Never mutate state. Use spread/map/filter |
| Compiler-first | Skip manual memoization (useMemo, useCallback, React.memo) |

## Hooks Rules

```typescript
// ✓ Top level, unconditional
function Component() {
  const [value, setValue] = useState(0);
  useEffect(() => { /* sync */ }, [deps]);
  return <div>{value}</div>;
}

// ✗ Never conditional or in loops
if (condition) { useState(0); }
items.map(() => useEffect(...));
```

## useEffect Guidelines

Avoid useEffect when possible. Valid uses in this extension:

| Use Case | Example |
|----------|---------|
| Chrome APIs | `chrome.storage`, `chrome.runtime` listeners |
| DOM APIs | Event listeners, ResizeObserver, IntersectionObserver |
| Timers | setTimeout/setInterval with cleanup |
| External sync | WebSocket, third-party libraries |

**Anti-patterns:**
- `setState` inside useEffect without functional update
- Missing dependencies (stale closures)
- User-action logic (use event handlers)
- Derived state (compute during render instead)

```typescript
// ✓ Always cleanup
useEffect(() => {
  const handler = () => { /* ... */ };
  window.addEventListener('resize', handler);
  return () => window.removeEventListener('resize', handler);
}, []);

// ✓ Functional updates
setCount(c => c + 1);

// ✓ Chrome API pattern
useEffect(() => {
  const listener = (message: Message) => { /* ... */ };
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}, []);
```

## useRef Guidelines

Valid uses:
- DOM element access (focus, scroll, measure)
- Timer/animation IDs
- Third-party library instances
- Mutable values that don't trigger re-render

Never read/write `ref.current` during render (except lazy init).

## Component Patterns

```typescript
// ✓ Small, focused, typed props
function UserCard({ user }: { user: User }) {
  return (
    <Card>
      <Avatar src={user.avatar} />
      <UserInfo name={user.name} />
    </Card>
  );
}

// ✓ Inline styles for content scripts (Shadow DOM isolation)
const style: React.CSSProperties = {
  position: 'fixed',
  zIndex: 999999,
};

// ✓ Event handlers defined inline or as const
const handleClick = (e: React.MouseEvent) => {
  e.stopPropagation();
  // ...
};
```

## Content Script Components

Components in `src/content/` run inside Shadow DOM:

- Use inline styles or import CSS into shadow root
- Always set high `zIndex` (999999) for overlays
- Use `e.stopPropagation()` to prevent host page interference
- Calculate positions relative to viewport (`window.innerWidth`, `window.innerHeight`)

## Popup Components

Components in `src/popup/` are standard React:

- Use Tailwind classes directly
- Fixed dimensions: 400×600px popup window
- Handle loading states with skeletons, not spinners

## Data Flow

| Pattern | When to Use |
|---------|-------------|
| `useState` | Local component state |
| Props drilling | Shallow hierarchies (2-3 levels) |
| Context | Shared state across component tree |
| `chrome.storage` | Persistent settings, cross-context data |
| Message passing | Background ↔ Content ↔ Popup communication |

```typescript
// ✓ Load settings pattern
useEffect(() => {
  loadSettings().then(setSettings);
}, []);

// ✓ Message listener pattern
useEffect(() => {
  const handler = (msg: Message) => {
    if (msg.type === 'UPDATE') setState(msg.data);
  };
  chrome.runtime.onMessage.addListener(handler);
  return () => chrome.runtime.onMessage.removeListener(handler);
}, []);
```

## Accessibility (WCAG 2.1 AA)

| Requirement | Implementation |
|-------------|----------------|
| Semantic HTML | `<button>` not `<div onClick>` |
| Keyboard | All interactive elements focusable via Tab |
| Focus visible | Show focus indicator (outline, ring) |
| Labels | Every input needs `<label>` or `aria-label` |
| Alt text | Meaningful for images, `alt=""` for decorative |

## Tailwind & Spacing

**8px system** - use multiples of 4px:
- `p-2`, `m-4`, `gap-2` (not `mt-[13px]`)

**Responsive** (popup is fixed size, content scripts adapt to viewport):
- `sm`: 640px, `md`: 768px, `lg`: 1024px

## Code Review Checklist

Before writing React code:

1. Is the component pure (no side effects in render)?
2. Are Hooks called unconditionally at top level?
3. Are useEffect dependencies complete with cleanup?
4. Is state update logic immutable?
5. Content script? Use inline styles and high zIndex
6. Interactive element? Ensure keyboard accessible
