# EasyApp

A minimal, Vercel-terminal-style dashboard that lists and hosts projects in `C:\Projects`.

## Quick Start

- **Desktop:** `dist\EasyApp-1.0.0-Portable.exe`
- **Web:** `start-web.bat` → opens `http://localhost:3000`
- **Desktop shortcut:** `create-desktop-shortcut.bat`

## Commands

Double-click a project command to run it:

- `host static` — static file server
- `npm run dev` / `npm start` / `npm run build` — Node projects
- `python app.py` / `python manage.py runserver` — Python projects

## Build

```bash
npm run build:portable
```

Output: `dist\EasyApp-1.0.0-Portable.exe`
