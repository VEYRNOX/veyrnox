# TIP Intelligence Dashboard — Microsoft Sentinel Design System

**Target:** Redesign https://tip.veyrnox.com/dashboard to match Microsoft Sentinel aesthetic  
**Status:** Design System v1.0 (Ready for Implementation)  
**Last Updated:** 2026-08-06

---

## 1. Design System Overview

### 1.1 Color Tokens

```css
/* Base Palette */
--color-surface-primary: #0d1117;    /* Page background */
--color-surface-secondary: #161b22;  /* Card background */
--color-surface-tertiary: #21262d;   /* Elevated surfaces */
--color-surface-hover: rgba(88, 166, 255, 0.05);

--color-text-primary: #e6edf3;       /* 88% white - body text */
--color-text-secondary: #8b949e;     /* Subtle gray - meta/helper */
--color-text-tertiary: #6e7681;      /* Darker gray - disabled */
--color-text-muted: rgba(139, 148, 158, 0.6);

/* Accent Colors */
--color-accent-primary: #58a6ff;     /* Azure blue - primary interaction */
--color-accent-hover: #79c0ff;       /* Lighter blue - hover state */
--color-accent-dark: #0969da;        /* Dark blue - active state */

/* Semantic Colors */
--color-success: #3fb950;            /* Allow/Safe - green */
--color-warning: #d29922;            /* Warn/Caution - amber */
--color-danger: #f85149;             /* Block/Critical - red */
--color-info: #79c0ff;               /* Info/Secondary - light blue */

/* Utility Colors */
--color-border: rgba(48, 54, 61, 0.5);
--color-border-light: rgba(48, 54, 61, 0.2);
--color-divider: rgba(48, 54, 61, 0.3);
--color-overlay: rgba(0, 0, 0, 0.5);
```

### 1.2 Typography Scale

```css
/* Font Stack */
--font-family-base: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", sans-serif;
--font-family-mono: "SF Mono", Monaco, "Cascadia Code", "Roboto Mono", monospace;

/* Display - H1 */
--font-size-display: 32px;
--font-weight-display: 600;
--line-height-display: 1.2;

/* Headline - H2 */
--font-size-headline: 24px;
--font-weight-headline: 600;
--line-height-headline: 1.3;

/* Title - H3 */
--font-size-title: 18px;
--font-weight-title: 600;
--line-height-title: 1.4;

/* Body Large */
--font-size-body-lg: 16px;
--font-weight-body: 400;
--line-height-body: 1.5;

/* Body (Default) */
--font-size-body: 14px;
--font-weight-body: 400;
--line-height-body: 1.5;

/* Small / Caption */
--font-size-small: 12px;
--font-weight-small: 400;
--line-height-small: 1.4;

/* Data / Monospace */
--font-size-mono: 13px;
--font-family-data: var(--font-family-mono);
--font-variant-numeric: tabular-nums;
```

### 1.3 Spacing Scale (8pt increments)

```css
--spacing-2xs: 4px;
--spacing-xs: 8px;
--spacing-sm: 12px;
--spacing-md: 16px;
--spacing-lg: 24px;
--spacing-xl: 32px;
--spacing-2xl: 48px;

/* Common Usage */
--gap-compact: var(--spacing-xs);    /* 8px - tight grouping */
--gap-default: var(--spacing-md);    /* 16px - standard spacing */
--gap-comfortable: var(--spacing-lg);/* 24px - section spacing */
--gap-generous: var(--spacing-xl);   /* 32px - major section breaks */
```

### 1.4 Border Radius

```css
--radius-sm: 4px;
--radius-md: 8px;
--radius-lg: 12px;
--radius-full: 9999px;

/* Usage */
--radius-input: var(--radius-md);    /* 8px - buttons, inputs */
--radius-card: var(--radius-md);     /* 8px - cards, panels */
--radius-modal: var(--radius-lg);    /* 12px - dialogs, sheets */
```

### 1.5 Shadows & Elevation

```css
/* Shadow System */
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
--shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
--shadow-lg: 0 12px 24px rgba(0, 0, 0, 0.5);

/* Inset Shadow (borders) */
--shadow-inset-light: inset 0 0 0 1px rgba(88, 166, 255, 0.2);
--shadow-inset-focus: inset 0 0 0 1px #58a6ff;

/* Elevation (hover states) */
--elevation-raised: 0 0 0 1px var(--color-border), 0 4px 8px rgba(0, 0, 0, 0.2);
--elevation-focus: 0 0 0 2px #58a6ff;
```

### 1.6 Animation / Timing

```css
/* Durations */
--duration-instant: 0ms;
--duration-fast: 80ms;      /* Press feedback */
--duration-quick: 120ms;    /* Hover transitions */
--duration-normal: 200ms;   /* Standard transitions */
--duration-slow: 300ms;     /* Chart animations */
--duration-slower: 400ms;   /* Complex animations */

/* Easing Functions */
--ease-out: cubic-bezier(0.16, 1, 0.3, 1);       /* Entrance */
--ease-in: cubic-bezier(0.7, 0, 0.84, 0);        /* Exit */
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);    /* Sustained */
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1); /* Bouncy */
```

---

## 2. Component Styles

### 2.1 Stat Card (Allow/Warn/Block)

```css
.stat-card {
  padding: var(--spacing-md);
  background: var(--color-surface-secondary);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-card);
  
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  
  transition: all var(--duration-quick) var(--ease-out);
  cursor: pointer;
}

.stat-card:hover {
  background: var(--color-surface-tertiary);
  border-color: var(--color-accent-primary);
  box-shadow: var(--elevation-raised);
}

.stat-card:active {
  transform: scale(0.98);
  box-shadow: var(--shadow-inset-focus);
}

.stat-card__label {
  font-size: var(--font-size-small);
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.stat-card__value {
  font-size: 32px;
  font-weight: 600;
  line-height: 1.2;
  font-family: var(--font-family-mono);
  font-variant-numeric: tabular-nums;
}

/* Severity-based coloring */
.stat-card--allow .stat-card__value { color: var(--color-success); }
.stat-card--warn .stat-card__value { color: var(--color-warning); }
.stat-card--block .stat-card__value { color: var(--color-danger); }

.stat-card__meta {
  font-size: var(--font-size-small);
  color: var(--color-text-secondary);
  line-height: 1.4;
}
```

### 2.2 Data Table / High-Risk IOCs

```css
.data-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  background: var(--color-surface-secondary);
  border-radius: var(--radius-card);
  overflow: hidden;
}

.data-table__head {
  background: rgba(88, 166, 255, 0.08);
  border-bottom: 1px solid var(--color-border);
}

.data-table__header-cell {
  padding: var(--spacing-md) var(--spacing-md);
  font-size: var(--font-size-small);
  font-weight: 600;
  color: var(--color-text-secondary);
  text-align: left;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.data-table__body-row {
  border-bottom: 1px solid var(--color-divider);
  transition: background var(--duration-quick) var(--ease-out);
}

.data-table__body-row:last-child {
  border-bottom: none;
}

.data-table__body-row:hover {
  background: var(--color-surface-hover);
  cursor: pointer;
}

.data-table__body-row:active {
  background: rgba(88, 166, 255, 0.1);
}

.data-table__cell {
  padding: 14px var(--spacing-md);
  font-size: var(--font-size-body);
  color: var(--color-text-primary);
  vertical-align: middle;
}

.data-table__cell--mono {
  font-family: var(--font-family-mono);
  font-size: var(--font-size-small);
  color: var(--color-text-secondary);
  font-variant-numeric: tabular-nums;
}

.data-table__severity {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  font-weight: 600;
  font-size: var(--font-size-small);
  padding: 2px 8px;
  border-radius: var(--radius-md);
}

.data-table__severity--critical {
  color: var(--color-danger);
  background: rgba(248, 81, 73, 0.1);
}

.data-table__severity--high {
  color: var(--color-warning);
  background: rgba(210, 153, 34, 0.1);
}

.data-table__severity--medium {
  color: #d0883c;
  background: rgba(208, 136, 60, 0.1);
}

.data-table__severity--low {
  color: var(--color-success);
  background: rgba(63, 185, 80, 0.1);
}
```

### 2.3 Chart Container (Verdict Timeline)

```css
.chart-container {
  padding: var(--spacing-lg);
  background: var(--color-surface-secondary);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-card);
  min-height: 300px;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.chart-container__title {
  font-size: var(--font-size-title);
  font-weight: 600;
  color: var(--color-text-primary);
}

.chart-container__legend {
  display: flex;
  gap: var(--spacing-lg);
  flex-wrap: wrap;
  font-size: var(--font-size-small);
}

.chart-container__legend-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  cursor: pointer;
  transition: opacity var(--duration-quick) var(--ease-out);
}

.chart-container__legend-item:hover {
  opacity: 0.8;
}

.chart-container__legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.chart-container__legend-dot--allow { background: var(--color-success); }
.chart-container__legend-dot--warn { background: var(--color-warning); }
.chart-container__legend-dot--block { background: var(--color-danger); }

.chart-container__canvas {
  flex: 1;
  background: rgba(0, 0, 0, 0.1);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
}

.chart-container__tooltip {
  position: absolute;
  background: var(--color-surface-primary);
  border: 1px solid var(--color-accent-primary);
  border-radius: var(--radius-md);
  padding: var(--spacing-sm) var(--spacing-md);
  font-size: var(--font-size-small);
  color: var(--color-text-primary);
  z-index: 1000;
  opacity: 0;
  transition: opacity var(--duration-normal) var(--ease-out);
  pointer-events: none;
}

.chart-container__tooltip.visible {
  opacity: 1;
  pointer-events: auto;
}
```

### 2.4 Activity List Item

```css
.activity-item {
  padding: var(--spacing-md);
  border-bottom: 1px solid var(--color-divider);
  display: flex;
  gap: var(--spacing-md);
  align-items: flex-start;
  transition: background var(--duration-quick) var(--ease-out);
}

.activity-item:last-child {
  border-bottom: none;
}

.activity-item:hover {
  background: var(--color-surface-hover);
  cursor: pointer;
}

.activity-item__icon {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: bold;
  color: white;
}

.activity-item__icon--allow { background: var(--color-success); }
.activity-item__icon--warn { background: var(--color-warning); }
.activity-item__icon--block { background: var(--color-danger); }

.activity-item__content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.activity-item__title {
  font-size: var(--font-size-body);
  font-weight: 500;
  color: var(--color-text-primary);
}

.activity-item__description {
  font-size: var(--font-size-small);
  color: var(--color-text-secondary);
}

.activity-item__id {
  font-family: var(--font-family-mono);
  font-size: var(--font-size-small);
  color: var(--color-text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}

.activity-item__timestamp {
  font-size: var(--font-size-small);
  color: var(--color-text-tertiary);
  white-space: nowrap;
  flex-shrink: 0;
}
```

### 2.5 Button Styles

```css
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-xs);
  
  padding: 8px 16px;
  font-size: var(--font-size-body);
  font-weight: 500;
  border: none;
  border-radius: var(--radius-input);
  cursor: pointer;
  
  transition: all var(--duration-quick) var(--ease-out);
  min-height: 44px;
  min-width: 44px;
  
  touch-action: manipulation;
}

.btn:focus-visible {
  outline: 2px solid var(--color-accent-primary);
  outline-offset: 2px;
}

.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Primary Button */
.btn--primary {
  background: var(--color-accent-primary);
  color: var(--color-surface-primary);
}

.btn--primary:hover:not(:disabled) {
  background: var(--color-accent-hover);
  box-shadow: var(--elevation-raised);
}

.btn--primary:active:not(:disabled) {
  transform: scale(0.98) translateY(1px);
}

/* Secondary Button */
.btn--secondary {
  background: transparent;
  color: var(--color-accent-primary);
  border: 1px solid var(--color-accent-primary);
}

.btn--secondary:hover:not(:disabled) {
  background: rgba(88, 166, 255, 0.1);
  border-color: var(--color-accent-hover);
}

.btn--secondary:active:not(:disabled) {
  transform: scale(0.98) translateY(1px);
}

/* Danger Button */
.btn--danger {
  background: var(--color-danger);
  color: white;
}

.btn--danger:hover:not(:disabled) {
  background: #f0423a;
  box-shadow: var(--elevation-raised);
}
```

### 2.6 Input & Form Elements

```css
.input {
  width: 100%;
  padding: 8px 12px;
  font-size: var(--font-size-body);
  font-family: inherit;
  
  background: var(--color-surface-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-input);
  
  color: var(--color-text-primary);
  transition: all var(--duration-quick) var(--ease-out);
  
  min-height: 44px;
}

.input::placeholder {
  color: var(--color-text-muted);
}

.input:hover {
  border-color: var(--color-border);
}

.input:focus {
  outline: none;
  border-color: var(--color-accent-primary);
  box-shadow: var(--shadow-inset-focus);
}

.input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.input--error {
  border-color: var(--color-danger);
}

.input--error:focus {
  box-shadow: inset 0 0 0 1px var(--color-danger);
}

/* Form Label */
.form__label {
  display: block;
  font-size: var(--font-size-body);
  font-weight: 500;
  color: var(--color-text-primary);
  margin-bottom: var(--spacing-xs);
}

.form__label--required::after {
  content: " *";
  color: var(--color-danger);
}

/* Form Error */
.form__error {
  font-size: var(--font-size-small);
  color: var(--color-danger);
  margin-top: var(--spacing-xs);
}

/* Form Helper */
.form__helper {
  font-size: var(--font-size-small);
  color: var(--color-text-secondary);
  margin-top: var(--spacing-xs);
}
```

---

## 3. Layout Grid System

### 3.1 Container

```css
.container {
  width: 100%;
  margin: 0 auto;
  padding: 0 var(--spacing-md);
}

/* Breakpoints */
@media (min-width: 768px) {
  .container {
    max-width: 768px;
    padding: 0 var(--spacing-lg);
  }
}

@media (min-width: 1024px) {
  .container {
    max-width: 1024px;
  }
}

@media (min-width: 1280px) {
  .container {
    max-width: 1280px;
    padding: 0 var(--spacing-xl);
  }
}
```

### 3.2 Grid System

```css
.grid {
  display: grid;
  gap: var(--spacing-lg);
  grid-template-columns: 1fr;
}

/* 2-Column on tablet+ */
@media (min-width: 768px) {
  .grid--2col {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* 3-Column on desktop+ */
@media (min-width: 1024px) {
  .grid--3col {
    grid-template-columns: repeat(3, 1fr);
  }
}

/* Full width component */
.grid--full {
  grid-column: 1 / -1;
}
```

### 3.3 Flex Utilities

```css
.flex {
  display: flex;
  gap: var(--spacing-md);
}

.flex--row { flex-direction: row; }
.flex--col { flex-direction: column; }

.flex--center { justify-content: center; align-items: center; }
.flex--between { justify-content: space-between; align-items: center; }
.flex--end { justify-content: flex-end; }

.flex--wrap { flex-wrap: wrap; }

.flex--1 { flex: 1; }
```

---

## 4. Responsive Design

### 4.1 Mobile-First Breakpoints

```css
/* Mobile (375px - 767px) */
/* Default styles apply here */

/* Tablet (768px - 1023px) */
@media (min-width: 768px) {
  /* Adjust spacing, grid columns, font sizes */
}

/* Desktop (1024px - 1279px) */
@media (min-width: 1024px) {
  /* Full 2-3 column layouts */
}

/* Large Desktop (1280px+) */
@media (min-width: 1280px) {
  /* Max-width containers, sidebar layouts */
}
```

### 4.2 Safe Areas (Mobile Notch/Gesture Bar)

```css
/* Reserve space for notch/home indicator */
.header {
  padding-top: max(var(--spacing-md), env(safe-area-inset-top));
  padding-left: max(var(--spacing-md), env(safe-area-inset-left));
  padding-right: max(var(--spacing-md), env(safe-area-inset-right));
}

.footer {
  padding-bottom: max(var(--spacing-lg), env(safe-area-inset-bottom));
}
```

---

## 5. Accessibility & Responsive Motion

### 5.1 Focus Management

```css
/* Remove default outline and apply custom */
:focus {
  outline: none;
}

:focus-visible {
  outline: 2px solid var(--color-accent-primary);
  outline-offset: 2px;
}

/* High contrast mode */
@media (prefers-contrast: more) {
  :focus-visible {
    outline-width: 3px;
  }
}
```

### 5.2 Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

### 5.3 Dark Mode (Already implemented - these are dark mode colors)

```css
/* All colors above are dark mode by default */
/* Light mode can be added via data-theme="light" if needed */

@media (prefers-color-scheme: light) {
  :root {
    /* Define light mode colors if light mode is supported */
  }
}
```

---

## 6. Implementation Checklist

### Phase 1: Foundation
- [ ] Apply CSS custom properties (variables) to root selector
- [ ] Set up breakpoint queries for responsive design
- [ ] Implement base typography and font loading

### Phase 2: Components
- [ ] Style stat cards with hover/active states
- [ ] Build data table with striping and hover states
- [ ] Implement chart container with legend
- [ ] Style activity list items with severity indicators

### Phase 3: Interactions
- [ ] Add button press feedback (scale 0.98)
- [ ] Implement hover transitions (120ms ease-out)
- [ ] Add focus ring styling for accessibility
- [ ] Set up chart tooltip show/hide behavior

### Phase 4: Polish
- [ ] Verify color contrast (4.5:1 minimum)
- [ ] Test touch targets (44×44px minimum)
- [ ] Validate reduced-motion support
- [ ] Test on mobile, tablet, and desktop viewports
- [ ] Verify dark mode rendering

### Phase 5: Deployment
- [ ] Build CSS bundle
- [ ] Deploy to Cloudflare
- [ ] Verify live on https://tip.veyrnox.com/dashboard
- [ ] Collect feedback and iterate

---

## 7. Quick Copy-Paste: CSS Variables Root

```css
:root {
  /* Base Colors */
  --color-surface-primary: #0d1117;
  --color-surface-secondary: #161b22;
  --color-surface-tertiary: #21262d;
  --color-surface-hover: rgba(88, 166, 255, 0.05);

  --color-text-primary: #e6edf3;
  --color-text-secondary: #8b949e;
  --color-text-tertiary: #6e7681;
  --color-text-muted: rgba(139, 148, 158, 0.6);

  /* Accent */
  --color-accent-primary: #58a6ff;
  --color-accent-hover: #79c0ff;
  --color-accent-dark: #0969da;

  /* Semantic */
  --color-success: #3fb950;
  --color-warning: #d29922;
  --color-danger: #f85149;
  --color-info: #79c0ff;

  /* Utility */
  --color-border: rgba(48, 54, 61, 0.5);
  --color-border-light: rgba(48, 54, 61, 0.2);
  --color-divider: rgba(48, 54, 61, 0.3);

  /* Typography */
  --font-family-base: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", sans-serif;
  --font-family-mono: "SF Mono", Monaco, "Cascadia Code", "Roboto Mono", monospace;

  --font-size-display: 32px;
  --font-size-headline: 24px;
  --font-size-title: 18px;
  --font-size-body-lg: 16px;
  --font-size-body: 14px;
  --font-size-small: 12px;
  --font-size-mono: 13px;

  --font-weight-headline: 600;
  --font-weight-title: 600;
  --font-weight-body: 400;

  --line-height-display: 1.2;
  --line-height-headline: 1.3;
  --line-height-title: 1.4;
  --line-height-body: 1.5;

  /* Spacing */
  --spacing-2xs: 4px;
  --spacing-xs: 8px;
  --spacing-sm: 12px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;
  --spacing-2xl: 48px;

  /* Radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-full: 9999px;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 12px 24px rgba(0, 0, 0, 0.5);
  --shadow-inset-light: inset 0 0 0 1px rgba(88, 166, 255, 0.2);
  --shadow-inset-focus: inset 0 0 0 1px #58a6ff;
  --elevation-raised: 0 0 0 1px var(--color-border), 0 4px 8px rgba(0, 0, 0, 0.2);
  --elevation-focus: 0 0 0 2px #58a6ff;

  /* Animation */
  --duration-instant: 0ms;
  --duration-fast: 80ms;
  --duration-quick: 120ms;
  --duration-normal: 200ms;
  --duration-slow: 300ms;
  --duration-slower: 400ms;

  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in: cubic-bezier(0.7, 0, 0.84, 0);
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
}
```

---

## 8. Next Steps

1. **Load this CSS file** into the TIP dashboard frontend
2. **Apply class names** to existing HTML elements (stat-card, data-table, etc.)
3. **Test responsively** on mobile (375px), tablet (768px), desktop (1280px)
4. **Verify accessibility** - focus rings, contrast, keyboard navigation
5. **Deploy to Cloudflare** and verify live

For questions or refinements, refer to the ui-ux-pro-max design guidelines in this repository.
