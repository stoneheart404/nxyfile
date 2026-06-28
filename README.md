# Nyxfile

[![Download macOS](https://img.shields.io/badge/download-macOS%20.dmg-000?style=flat&logo=apple)](https://github.com/stoneheart404/nxyfile/releases/latest)
[![Download Windows](https://img.shields.io/badge/download-Windows%20.exe-000?style=flat&logo=windows)](https://github.com/stoneheart404/nxyfile/releases/latest)

AI-powered desktop file manager. Chat with an AI that can scan, organize, move, delete, and manage your files across your entire device.

## Quick Start

```bash
npm install
npm start
```

## Interface

```
+------------------+------------------------------+------------------+
| Nyxfile                                         [gear] [min] [max] [x] |
+------------------+------------------------------+------------------+
| FILES      [pc][^][folder]  CHAT         [Go]   PREVIEW           |
| C:\                   |                          |                 |
|                        | Nyxfile is ready.        | Name  notes.txt |
| [DIR] Users/           |                          | Size  2.3 KB    |
| [DIR] Windows/         | Full device access.      | Type  .txt      |
| [DIR] Projects/        | Chat to manage files.    | Mod   ...       |
| [IMG] photo_png  1.2M  |                          |                 |
| [DOC] notes.txt   2K   | > "organize by type"     | Hello world     |
| [CODE] app.js    5K    |                          |                 |
|                        | [Execute] [Ignore]       | [Open] [Delete] |
|                        +--------------------------+                 |
|                        | Type a command...  [->]  |                 |
+------------------+------------------------------+------------------+
```

## How to use

### 1. Pick a folder

Click one of the three navigation buttons in the top-left panel:

| Button | Action |
|--------|--------|
| Monitor icon | Browse all drives on your PC |
| Up arrow | Go to parent directory |
| Folder icon | Open a native folder picker |

The file tree shows everything in the current directory. Click a folder to navigate into it. Click a file to preview it in the right panel.

### 2. Choose an AI provider

Open Settings with `Ctrl+,` (or the gear icon in the titlebar). Pick a provider:

| Provider | What you need |
|----------|--------------|
| OpenAI | API key from platform.openai.com |
| Anthropic (Claude) | API key from console.anthropic.com |
| OpenCode Go | API key from opencode.ai/auth ($10/mo subscription) |
| Ollama | Nothing - runs locally. Install Ollama first |
| OpenRouter | API key from openrouter.ai |
| DeepSeek | API key from platform.deepseek.com |
| Groq | API key from console.groq.com |
| Custom | Any OpenAI-compatible endpoint + URL |

### 3. Chat with the AI

Type what you want in the center panel. The AI sees your current directory contents and can:

- Scan any folder to see what's inside
- Read text and code files for inspection
- Search for files by name across directories
- Find duplicate files
- Organize files by type, date, or custom rules
- Move, copy, rename, or delete files (to trash)
- Create folders
- Open files in system explorer

**Examples:**
```
"Organize this folder by file type"
"Find duplicate images in Downloads"
"Show me files larger than 100MB"
"Sort all files into year/month folders"
"Search for all .pdf files"
```

### 4. Review and execute

The AI streams its thinking in real-time. You see its response appear word by word. When it proposes actions:

- A "Thinking" block shows the AI's reasoning (click to expand/collapse)
- Action tags appear below the message (scan, move, delete, etc.)
- Click **Execute** to review and run the actions
- Click **Ignore** to dismiss

Scan and read actions run automatically so the AI always has fresh data.

### 5. Preview files

Click any file in the left panel to preview it on the right:

- Text and code files show their contents
- Images display as thumbnails
- Click **Open** to reveal in Explorer
- Click **Delete** to move to trash

## Build

```bash
npm start           # development
npm run build:win   # Windows .exe installer
npm run build:mac   # macOS .dmg (requires Mac)
npm run build:all   # both platforms
```

Outputs go to `dist/`.

### macOS DMG via GitHub Actions

A workflow automatically builds the macOS DMG on push to `main`. To get it:

1. Go to [Releases](https://github.com/stoneheart404/nxyfile/releases)
2. Download the latest `.dmg` for your architecture (`arm64` for Apple Silicon, `x64` for Intel)
3. Open the DMG and drag Nyxfile to Applications

**If macOS shows "damaged and can't be opened":**

This happens because the app isn't code-signed (requires Apple Developer account). To bypass:

```bash
# After installing, run this in Terminal:
xattr -cr /Applications/Nyxfile.app
```

Then right-click the app in Finder and select **Open** -- macOS will then let you run it.

## Security

- `contextIsolation` enabled - renderer has no direct Node.js access
- All file operations go through typed IPC channels
- API keys stored in localStorage, never written to disk
- Delete always moves to system trash, not permanent removal
- Confirmation required for destructive actions (toggleable in Settings)

## Architecture

```
nyxfile/
  main.js           Electron main process, IPC handlers, window management
  preload.js        Secure context bridge (contextBridge)
  ai/
    shared.js       System prompt (shared by all providers)
    openai.js       OpenAI chat + streaming
    anthropic.js    Claude chat + streaming
    ollama.js       Local Ollama chat + streaming
    custom.js       OpenAI-compatible endpoint chat + streaming
  renderer/
    index.html      3-panel layout, SVG icon library, modals
    style.css       Dark theme, CSS variables, animations
    settings.js     Multi-provider settings, localStorage persistence
    files.js        File tree, directory navigation, drive browser
    preview.js      File preview (images, text, metadata)
    chat.js         AI chat, streaming display, action execution
```

## License

MIT
