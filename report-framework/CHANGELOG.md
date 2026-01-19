# Changelog

## [Unreleased] - Senior Developer Audit

### Design Tokens & Theming

#### Fixed
- **AreaChartComponent**: Replaced hardcoded `#E4E4E7` grid stroke with `var(--border)`
- **AreaChartComponent**: Replaced hardcoded `#71717A` tick fill with `var(--text-muted)`
- **BarChartComponent**: Replaced hardcoded `#E4E4E7` grid stroke with `var(--border)`
- **BarChartComponent**: Replaced hardcoded `#71717A` tick fill with `var(--text-muted)`
- **MultiLineChart**: Replaced hardcoded `#E4E4E7` grid stroke with `var(--border)`
- **MultiLineChart**: Replaced hardcoded `#71717A` tick fill with `var(--text-muted)`
- **Badge**: Converted all variant colors from Tailwind classes (`bg-blue-50`, `text-blue-700`, etc.) to CSS variables
- **Heatmap**: Replaced hardcoded `rgba(37, 99, 235, alpha)` with CSS variable-based `color-mix(in oklch, var(--accent), transparent)`

#### Added
- **globals.css**: Added `--info: #06B6D4` and `--info-light: #ECFEFF` CSS variables for info state
- **globals.css**: Added semantic badge text colors for better contrast:
  - `--accent-text: #1D4ED8`
  - `--positive-text: #047857`
  - `--negative-text: #DC2626`
  - `--warning-text: #B45309`
  - `--info-text: #0E7490`

### Accessibility

#### Fixed
- **GaugeChart**: Added `role="meter"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, and auto-generated `aria-label`
- **GaugeChart**: Added `aria-hidden="true"` to decorative SVG element
- **FunnelChart**: Added `role="img"` and descriptive `aria-label` that includes data summary for screen readers
- **Sparkline**: Added `role="img"` and auto-generated `aria-label` with data range (min, max, current value)
- **Heatmap**: Added `role="grid"` and `aria-label` to container
- **Heatmap**: Added full keyboard navigation (arrow keys) for cell traversal
- **Heatmap**: Added visible focus states with ring indicator
- **Heatmap**: Tooltip now shows on both hover AND keyboard focus

### Mobile / Touch Targets

#### Fixed
- **Dropdown**: Added `min-h-[44px]` to menu items for WCAG-compliant touch targets
- **Tabs**: Added `min-h-[44px]` to tab buttons for proper touch targets
- **Modal**: Increased close button from 40px to 44px (`h-11 w-11`) for proper touch targets

### Interactions

#### Fixed
- **CompactTable**: Added `hover:bg-[var(--bg-hover)]` and `transition-colors` to table rows (parity with DataTable)

---

## [Previous] - Quality Audit & Fixes

### Summary

Complete quality audit and refactor of the report-framework component library. This update brings the codebase to production-ready standards with proper accessibility, consistent design token usage, reduced-motion support, and fixes for multiple UX issues.

---

## Design Quality Improvements

### CSS Variables & Design Tokens

**Before:** Hardcoded Tailwind classes like `bg-zinc-100`, `text-zinc-500`, `border-zinc-200` scattered throughout.

**After:** Consistent use of CSS variables: `var(--bg-muted)`, `var(--text-secondary)`, `var(--border)`.

**Why:** Design tokens allow global theme changes. Hardcoded values make theming impossible and create inconsistency.

### New CSS Variables Added

```css
--border-light: #F4F4F5;     /* Subtle dividers */
--radius-sm/md/lg/xl;         /* Consistent border radius */
--nav-height: 4rem;           /* Computed nav offset */
--transition-fast/base/slow;  /* Consistent timing */
--ease-out/ease-in-out;       /* Premium easing curves */
```

### Typography

- Added `font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11'` for Inter's alternate glyphs
- Consistent `tracking-tight` on large numbers
- Proper `tabular-nums` on all numeric columns

### Shadows

**Before:** Using Tailwind's generic `shadow-sm`.

**After:** Using layered CSS variable shadows that look softer and more premium.

---

## Accessibility Improvements

### Reduced Motion Support

**Before:** Zero reduced-motion support. Users with vestibular disorders see jarring animations.

**After:**
- Global CSS `prefers-reduced-motion` media query
- `useReducedMotion()` hook from Framer Motion in:
  - `Section.jsx`
  - `MobileDrawer.jsx`
  - `ProgressBar.jsx`
- `motion-safe:animate-pulse` on Skeleton components

### Focus States

**Before:** No visible focus indicators on interactive elements.

**After:**
- Global `:focus-visible` styles
- `.focus-ring` utility class
- Explicit `focus-visible:ring-2` on all buttons, links, and interactive elements

### Keyboard Navigation

**Before:** MobileDrawer had no keyboard support.

**After:**
- Escape key closes drawer
- Focus trap keeps keyboard users inside modal
- Auto-focus on close button when drawer opens
- Tab cycling between first and last elements

### ARIA Improvements

**Tabs.jsx:**
- Added `role="tablist"` and `role="tab"`
- Added `aria-selected` attribute
- Added `aria-controls` and `id` for tab/panel association
- Created `TabPanel` component with proper `role="tabpanel"`

**DataTable.jsx:**
- Added `scope="col"` on `<th>` elements
- Added `aria-label` prop for table description

**ProgressBar.jsx:**
- Added `role="progressbar"`
- Added `aria-valuenow`, `aria-valuemin`, `aria-valuemax`
- Added `aria-label` prop

**MobileDrawer.jsx:**
- Added `role="dialog"` and `aria-modal="true"`
- Added `aria-label` for screen readers

**Skeleton.jsx:**
- Added `aria-hidden="true"` to prevent screen reader noise

**LoadingState.jsx:**
- Added `role="status"` and screen-reader-only text

### Skip Link

**Before:** No skip link for keyboard users.

**After:** TopNav includes `<a href="#main" className="skip-link">` that appears on focus.

---

## UX Improvements

### Body Scroll Lock

**Before:** When MobileDrawer was open, users could scroll the background content. Amateur.

**After:** Proper scroll lock that:
- Saves scroll position before locking
- Restores scroll position after closing
- Prevents iOS rubber-band scrolling issues

### Empty States

**Before:** DataTable rendered nothing when `data` was empty. No feedback.

**After:**
- DataTable shows EmptyState component with icon
- CompactTable shows centered "No data available" message
- Configurable `emptyMessage` and `emptyDescription` props

### Button Component

**Before:** Missing entirely. ErrorState used plain underlined text for retry.

**After:** Full Button component with:
- Variants: `primary`, `secondary`, `ghost`, `danger`
- Sizes: `sm`, `md`, `lg`
- Loading state with spinner
- Icon support (left/right position)
- Proper disabled state
- `forwardRef` for composition

### Card Component

**Before:** Function component, no ref forwarding, no polymorphism.

**After:**
- `forwardRef` for ref forwarding
- `as` prop for semantic HTML (`<article>`, `<aside>`, etc.)
- `data-card` attribute for CSS targeting
- Premium easing curve on hover animation

---

## Code Quality Improvements

### Dead Code Removed

**Before:** DataTable had `sortable` and `pageSize` props that did nothing.

**After:** Removed unused props. If you need sorting/pagination, implement it properly.

### Consistent Row Keys

**Before:** Using `rowIndex` as key everywhere.

**After:** `getRowKey(row, index)` helper that uses `row.id` or `row.key` if available, falling back to index.

### Null Safety

**Before:** Cell content could render `undefined`.

**After:** `getCellContent` returns `-` for null/undefined values.

### Badge Component

**Before:** 5 variants, no size options, no status dot.

**After:**
- 6 variants (added `info`)
- 3 sizes: `sm`, `md`, `lg`
- `dot` prop for status indicators
- Subtle `ring-1 ring-inset` for definition

### Skeleton Component

**Before:** Basic div with pulse animation.

**After:**
- Compound components: `Skeleton.Text`, `Skeleton.Circle`, `Skeleton.Card`
- `motion-safe:` prefix respects reduced motion

---

## Tailwind Config Improvements

### Extended Theme

```js
colors: {
  accent: { DEFAULT, hover, light },
  positive: { DEFAULT, light },
  negative: { DEFAULT, light },
  warning: { DEFAULT, light },
}

boxShadow: {
  sm: 'var(--shadow-sm)',
  md: 'var(--shadow-md)',
  lg: 'var(--shadow-lg)',
}

spacing: {
  nav: 'var(--nav-height)',
}

animation: {
  'fade-in': 'fadeIn 0.2s ease-out',
  'slide-up': 'slideUp 0.3s ease-out',
  'slide-down': 'slideDown 0.3s ease-out',
}
```

---

## globals.css Improvements

### New Layer Components

```css
.focus-ring { /* Reusable focus styles */ }
.interactive { /* Base for clickable elements */ }
.skip-link { /* Accessibility skip link */ }
```

### New Utilities

```css
.scrollbar-hide { /* Hide scrollbar but keep scrolling */ }
.scrollbar-thin { /* Thin custom scrollbar */ }
```

### Selection Styling

Custom selection color using `--accent-light`.

### Print Improvements

- Hide link URL suffixes
- Proper page break avoidance

---

## Component-Specific Changes

### TopNav.jsx
- Logo is now a link (`<a>` instead of `<div>`)
- Added `logoHref` prop
- Skip link for accessibility
- `aria-expanded` and `aria-controls` on mobile button
- CSS variable for nav height

### Sidebar.jsx
- Wrapped in `<nav>` for semantics
- `aria-current="page"` on active link
- Icon support in sidebar items
- Active state uses `--bg-selected` and `--accent` colors

### Section.jsx
- `id` prop for anchor links
- Reduced motion support
- Tighter animation values (20px instead of 30px)

### MetricCard.jsx
- Neutral trend now shows `Minus` icon instead of nothing
- `min-w-0` on text container to prevent overflow
- `truncate` on label for long text

### StatCard.jsx
- `trend` prop for colored sublabels
- `tracking-tight` on value

### InfoCard.jsx
- `gap-4` between header content and action
- `min-w-0` to prevent overflow

### Tabs.jsx
- Complete ARIA implementation
- `TabPanel` export for proper panel rendering
- `count` prop support for badges in tabs
- `scrollbar-hide` on tab container

### ErrorState.jsx
- Uses Button component instead of plain link
- Better visual hierarchy

### CustomTooltip.jsx
- Uses CSS variables for styling

### ChartContainer.jsx
- Uses CSS variables for loading skeleton

---

## Files Added

- `src/components/ui/Button.jsx` - Full-featured button component

## Files Modified

- `src/styles/globals.css` - Comprehensive design system update
- `tailwind.config.js` - Extended theme with CSS variables
- All component files - CSS variable usage, accessibility fixes

---

## Breaking Changes

None. All changes are backwards compatible. New props are optional with sensible defaults.

---

## Upgrade Notes

1. The `sortable` and `pageSize` props on DataTable have been removed. They were non-functional.
2. Button component is now available - use it instead of plain `<button>` elements.
3. TabPanel component is now exported - use it for proper tab panel associations.

---

## What a Stripe Designer Would Notice

Before: Generic Bootstrap-y feel, inconsistent spacing, jarring animations, no accessibility.

After:
- Soft, layered shadows
- Consistent 4px/8px spacing rhythm
- Premium easing curves (cubic-bezier)
- Focus states that don't look like an afterthought
- Reduced motion that actually works
- Scroll lock that doesn't break on iOS
- Empty states that provide guidance
- Proper semantic HTML throughout
