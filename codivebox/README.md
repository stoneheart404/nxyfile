# CodiveBox

A desktop IDE built on Electron that is fully self-contained.

## Features
- **Code Editor** — CodeMirror 5 with syntax highlighting, folding, autocomplete, and split view
- **File System** — Virtual FS stored in localStorage with real folder open via Electron
- **Code Runner** — Python via Pyodide (in-browser WASM), HTML preview via Blob URL
- **AI Chat** — Right-side panel connecting to any OpenAI-compatible API (DeepSeek, GPT-4o, Claude, Gemini, or you're custom AI)
- **Shell/UI** — Custom titlebar, activity bar, sidebar views (Explorer, Search, SCM, Debug, Extensions, Settings), output panel, status bar, command palette

## Tech Stack
Electron, CodeMirror 5, Pyodide, Vanilla JS

## Getting Started
```bash
npm install
npm start
```
