## 2024-05-15 - Replace aria-live with Semantic Time Elements
**Learning:** Using `aria-live="polite"` on continuously updating components (like taskbar clocks) creates a poor experience by constantly interrupting screen readers.
**Action:** Always prefer semantic `<time dateTime={...}>` elements over generic `<span>` elements with `aria-live` for continuously updating time displays.
