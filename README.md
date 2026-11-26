# ATL

Personal productivity PWA: tasks, hierarchical projects, planning and time tracking.
Offline-first. All data stays on your device (IndexedDB). No server, no account, no cost.

## Current status: Phase 1

Working now:
- Installable PWA (Android + Windows browser), offline via service worker
- Persian (RTL) and English UI, Jalali and Gregorian date display, light/dark/auto theme
- Tasks: create, edit, delete, complete, priority, status, project, planned start, deadline, estimate, notes
- Original time estimate is preserved; later estimate changes are logged in the task history
- Unlimited nested projects with progress bars
- Search and filters (text, project including subprojects, status)
- Dashboard with pending / overdue / done counts
- Backup to JSON file and atomic restore with validation

Planned (see roadmap): subtasks and dependencies, recurring tasks, tags, custom fields, calendar views,
timer and sessions, prediction accuracy reports, XLSX export, notifications, attachments, tests.

## Run locally

No build step. Serve the folder with any static server (service workers need http://localhost or https):

    python -m http.server 8000

Then open http://localhost:8000

## Deploy to GitHub Pages

1. Create a public repository and upload ALL files of this folder to the repository root
   (`index.html` must be at the root).
2. Repository Settings -> Pages -> Source: "Deploy from a branch" -> Branch: `main`, folder `/ (root)` -> Save.
3. After about a minute the app is available at `https://<username>.github.io/<repository>/`.

Never commit backup files. Personal data is never stored in the repository.

## Install

- Android: open the URL in Chrome -> menu -> "Install app" (or use the button in Settings).
- Windows: open the URL in Edge or Chrome -> install icon in the address bar (optional).

## Updating the app

After changing any cached file, bump `CACHE_VERSION` in `sw.js`, otherwise installed copies keep the old version.

## Storage

IndexedDB database `atl` with stores `tasks`, `projects`, `settings`. The app requests persistent storage
(`navigator.storage.persist()`), but browsers may still clear data in rare cases, so export backups regularly.

## Backup and restore

Settings -> "Download backup file" creates `atl-backup-YYYY-MM-DD.json`.
"Restore from backup file" validates the file, asks for confirmation, then replaces all data in one transaction
(if it fails, existing data is untouched).

## Known platform limits

- Notifications while the app is closed need a server (Web Push) or unreliable browser APIs.
  Planned alternative: export reminders as an `.ics` calendar file so the phone calendar fires them reliably.
- No automatic cross-device sync; transfer data with backup files.
- Jalali dates are displayed with the built-in Intl API; date inputs use the browser's Gregorian picker for now.
