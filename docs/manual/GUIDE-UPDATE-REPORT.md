# Power BI Viewer User Guide — Update Report

**Date:** 2026-06-07  
**Guide version:** v2.0.4  
**Files updated:**

| File | Size | Notes |
|------|------|-------|
| `docs/manual/PowerBI-Viewer-User-Guide.html` | 69.4 KB | Rebuilt from scratch — single self-contained file |
| `docs/manual/PowerBI-Viewer-User-Guide.pdf` | 972.5 KB | Regenerated from HTML via puppeteer (this session) |
| `scripts/generate-guide-pdf.mjs` | new | Reusable PDF generation script |

---

## What Changed vs. the Previous Guide

### Content corrections
- **Version number:** corrected from 2.0.3 → **2.0.4** (matches `package.json` and the sign-in footer visible in `01-login.png`).
- **Sidebar behaviour:** clarified that the sidebar starts **collapsed** on every launch, not expanded.
- **Featured Workspaces cards:** corrected — clicking any card navigates to the **Workspaces page**, not into the workspace directly.
- **Settings location:** confirmed at the **bottom** of the sidebar (below all workspace entries).
- **Dashboards:** noted that dashboards have **no Slideshow button** (reports-only feature).
- **Default theme:** corrected to **Dark** (not Light); auto-refresh default is **On**.
- **Stale data threshold:** documented as **>24 hours** for the orange toolbar warning.
- **Kiosk/Fullscreen specifics:** cursor auto-hides after 4 s; backoff is 5 s / 30 s / 60 s; correct exit shortcut is **Ctrl+Shift+Q** (not Task Manager).

### New sections and content added
- Full **Appendix A — Admin Setup** covering Azure AD app registration, tenant-wide consent, and the Power BI Admin Portal "Push apps / Install automatically" steps.
- Expanded **Slideshow / Kiosk mode** section with triple-row EXIT-warning box and dot-indicator explanation.
- Keyboard shortcut reference table (all app-wide and viewer-specific shortcuts).
- **12 FAQ / Troubleshooting accordions** covering the most common user issues.
- Numbered step-by-step instructions throughout (non-technical tone).
- Tip / Note / Warning callout boxes throughout.

### Screenshots
**23 new screenshots captured** via puppeteer + Vite dev server mock (script: `scripts/take-screenshots.mjs`):

| File | What it shows |
|------|--------------|
| `01-login.png` | Sign-in page (logo, orange button, version footer) |
| `02-login-error.png` | Sign-in error state |
| `03-home-populated.png` | Home page with Featured Workspaces + Frequent + Recent |
| `04-home-empty.png` | Home page, first-launch empty state |
| `05-titlebar.png` | Title bar chrome |
| `05b-titlebar-menu.png` | Title bar menu open |
| `06-sidebar-expanded.png` | Full sidebar, workspaces expanded |
| `07-sidebar-collapsed.png` | Sidebar collapsed (initial state) |
| `08-search-dialog.png` | Search dialog with live results |
| `09-workspaces-collapsed.png` | Workspaces page (groups collapsed) |
| `09b-workspaces-expanded.png` | Workspaces page (group expanded) |
| `10-apps-page.png` | Apps catalogue page |
| `11-report-toolbar-fresh.png` | Report viewer toolbar, data current |
| `12-report-toolbar-stale.png` | Report viewer toolbar, data stale (>24h) |
| `13-settings-full.png` | Settings page (full) |
| `13a-settings-top.png` | Settings — top section |
| `13b-settings-bottom.png` | Settings — bottom section |
| `14-settings-light.png` | Settings in light theme |
| `15-signout-dialog.png` | Sign-out confirmation dialog |
| `16-home-light.png` | Home page in light theme |
| `16b-home-dark.png` | Home page in dark theme |
| `17-kiosk-exit-overlay.png` | Kiosk exit countdown overlay |
| `18-dashboard-toolbar.png` | Dashboard viewer toolbar |

### Interactive features added to the HTML guide
- Sticky left table-of-contents with smooth-scroll anchor links
- Scroll-spy highlighting active TOC section (IntersectionObserver)
- Live search/filter with debounce, result-count banner, and `<mark>` highlights
- **Ctrl/Cmd+K** focuses the guide search box (mirrors the app shortcut)
- Clear (×) button and Esc-to-clear in the search box
- Light/Dark theme toggle defaulting to Dark, persisted in `localStorage`
- 12 collapsible troubleshooting/FAQ accordions (`<details>`/`<summary>`)
- Floating Back-to-top button
- Print stylesheet: hides navigation chrome, force-reveals all search-hidden sections, auto-opens every accordion before printing then restores state afterward
- Fully responsive layout (TOC collapses to a 2-column list on narrow widths)

---

## Real-Data Screenshots the Owner Still Needs to Provide

The following 4 placeholder boxes appear in the guide. They cannot be auto-captured because they require a live Power BI session or an OS-level action:

### 1. Windows SmartScreen dialog (Section 2 — Installation)
**What to capture:** The "Windows protected your PC — Unknown publisher" dialog that appears the first time the installer is run on a new machine.  
**How:** Run the `.exe` installer on a freshly imaged or test machine. Windows will show the SmartScreen dialog before the installer proceeds. Screenshot the full dialog (include the "More info" link if visible).  
**Placeholder text in guide:** *"Windows SmartScreen 'Windows protected your PC / Unknown publisher' dialog (Section 2 - OS-level, must be captured on a real install)"*

### 2. Report full-screen page-navigation hint (Section 6 — Viewing Reports)
**What to capture:** The pill/banner reading something like *"Arrow keys to navigate pages (n/total)"* that appears briefly after entering full-screen with a multi-page report.  
**How:** Open a multi-page report, press F11 (or the full-screen toolbar button), then screenshot the pill overlay at the bottom of the screen within ~3 seconds of entering full-screen.  
**Placeholder text in guide:** *"Full-screen report page-navigation hint pill: 'Arrow keys to navigate pages (n/total)' (Section 6 - needs a live multi-page report in full screen)"*

### 3. Apps page with embedded app content (Section 8 — Power BI Apps)
**What to capture:** The app viewer showing the "Back to Apps" + Refresh toolbar with embedded `app.powerbi.com` content visible in the webview.  
**How:** Sign in to the app with a real account that has at least one published Power BI App visible. Navigate to the Apps page, click an app, and screenshot the full viewer while the app content loads.  
**Placeholder text in guide:** *"App viewer: 'Back to Apps' + Refresh toolbar with embedded app.powerbi.com content (Section 8 - embedded webview needs a live signed-in session)"*

### 4. Slideshow controls overlay (Section 10 — Slideshow / Kiosk Mode)
**What to capture:** The full slideshow UI including: top bar (Exit, slide name, n/total count, gear icon), bottom bar (Prev / Play-Pause / Next buttons), dot indicators, and optionally the keyboard-hints panel.  
**How:** Open a workspace that contains at least two reports, click the Slideshow button on any report, and screenshot the overlay once the first report has loaded inside it. A second screenshot with the gear/settings panel open would also be useful.  
**Placeholder text in guide:** *"Slideshow controls overlay: top bar (Exit, slide name, n/total, gear), bottom Prev/Play-Pause/Next, dot indicators, keyboard-hints panel (Section 10 - slide content needs a live report)"*

**To add a real screenshot:** save the PNG to `docs/manual/screenshots/` and replace the placeholder `<div class="img-placeholder">` block in the HTML with a standard `<figure><img>` element using the same styling pattern as the other screenshots in the guide.

---

## How to Regenerate the PDF

The PDF is generated with puppeteer (already installed as a devDependency). Run:

```powershell
cd "C:\Users\Brendan Cameron\Desktop\powerbi-viewer"
node scripts/generate-guide-pdf.mjs
```

The script:
1. Loads the HTML via `file://` URL — no dev server needed.
2. Forces light theme (cleaner on paper).
3. Opens all accordions and removes any search-hidden state.
4. Calls `page.pdf()` with A4 format and `printBackground: true`.
5. Writes the result to `docs/manual/PowerBI-Viewer-User-Guide.pdf`.

**Re-run this script any time the HTML guide is updated.**

If puppeteer's Chrome binary is ever missing (e.g. after a clean `node_modules` reinstall), run `npm install` first — puppeteer downloads its bundled Chrome automatically.

Alternative (manual): open the HTML file in Chrome, press **Ctrl+P**, set destination to "Save as PDF", paper size A4, enable "Background graphics". The print stylesheet will handle the rest.

---

## Version Note

The spec for this guide quoted version **2.0.3**, but `package.json` and the captured login-screen footer (`01-login.png`) both show **2.0.4**. The guide was authored at **2.0.4** so it matches what users see in-app (Settings > About and the sign-in footer). If 2.0.3 was intentional for a specific release artifact, do a find-and-replace of `2.0.4` → `2.0.3` in the HTML before regenerating the PDF.
