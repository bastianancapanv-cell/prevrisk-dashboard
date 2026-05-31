# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

**PrevRisk - Dashboard de Prevención** — a single-page Progressive Web App (PWA) for occupational risk prevention management at Comercial Lafquen. It has no build step, no package manager, and no framework — just three files: `index.html`, `app.js`, and `styles.css`, plus PWA assets.

## Running the App

Open `index.html` directly in a browser, or serve via HTTP (required for the Service Worker):

```powershell
# Python 3
python -m http.server 8000

# Node.js
npx http-server
```

Then navigate to `http://localhost:8000`.

No installation, compilation, or dependency management is needed — all libraries load from CDN.

## Architecture

**Stack:** Vanilla JS (ES6+) · CSS3 · Firebase Firestore + Cloud Storage · Chart.js · Material Icons

**Key files:**
- `index.html` — all UI markup (~1,800 lines), loads CDN libs, `styles.css`, `app.js`
- `app.js` — all application logic (~4,440 lines), single global namespace
- `styles.css` — all styling, uses CSS custom properties for theming (dark/light modes)
- `sw.js` — Service Worker implementing a network-first caching strategy
- `manifest.json` — PWA manifest (app name: "PrevRisk", theme: `#6c5ce7`)

**Firebase project:** `prevrisk-dashboard` — config is embedded near the top of `app.js`.

**Data layer — dual persistence:**
- `localStorage` — primary offline storage, keyed by `prevrisk_*` prefixes (e.g., `prevrisk_items`, `prevrisk_dives`, `prevrisk_personal`)
- Firestore — cloud sync via `cloudSave()`, called automatically on data mutations
- On load, Firestore is tried first; falls back to localStorage on failure

**Navigation / module system:** All views live in `index.html` as hidden `<section>` or `<div>` elements. `app.js` shows/hides them via `showSection()` / `showView()` based on sidebar clicks — no client-side router.

**Major modules:**
| Module | Description |
|---|---|
| Dashboard | KPI cards, Chart.js charts, activity feed |
| Tareas | Kanban board (pendiente → en_progreso → completada), drag-and-drop |
| Personal | Employee directory with profile fichas |
| Calendario | Month-view calendar with event overlay |
| Bitácoras de Buceo | Dive logs with 25+ fields per record |
| Accidentes | Accident/incident reporting |
| Gantt | Project timeline view with CSV export |
| Extintores / EPP | Fire extinguisher and PPE tracking |
| Documentos / Protocolos / Planes | Document management with Google Drive links + local file upload |
| Embarcaciones | Fleet management |

**Seeding demo data:** Call these functions from the browser console:
```js
seedDemoData()        // tasks
seedDiveDemoData()    // dive logs
seedPersonalReal()    // employee directory
```

## Conventions

- All state is managed in plain JS objects/arrays in `app.js`; there is no reactive framework.
- CSS custom properties are defined on `:root` — always use variables (`var(--primary)`, etc.) rather than hard-coded color values.
- Dark mode is the default; light mode toggled via a class on `<body>`.
- Data exports (CSV) are triggered by UI buttons, not CLI commands.
- There is no automated test suite — verify changes manually in the browser and check the DevTools console for errors.
