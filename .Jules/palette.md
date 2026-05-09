## 2025-02-12 - Accessible Clocks
**Learning:** Using `aria-live="polite"` on continuously updating components like clocks interrupts screen readers every minute, causing a highly disruptive experience.
**Action:** Use semantic `<time dateTime={...}>` elements without `aria-live` for frequently updating timestamps to avoid breaking screen reader flows.
