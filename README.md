# Files

AI-powered desktop file manager. Chat with an AI to organize, clean, and manage your files.

## Design

Minimal, dark interface inspired by modern design systems. All icons are lightweight SVGs with no emojis. Smooth animations throughout.

```
+------------------+-----------------------------+------------------+
| [settings] [_][□][×]                                             |
+------------------+-----------------------------+------------------+
| FILES            | CHAT           [Cloud]      | PREVIEW          |
| [Open folder]    |                             |                  |
| /Users/...       | Welcome to Files.           | Name    notes.md |
|                  |                             | Size    12KB     |
| > folder-a/      | I can help manage your      | Type    .md      |
| > folder-b/      | files through conversation. | Mod     ...      |
|   image.png      |                             |                  |
|   notes.md       | > "organize by type"        | # Hello World    |
|   data.csv       |                             |                  |
|                  | [Execute] [Ignore]          | [Open] [Delete]  |
|                  |                             |                  |
|                  | +-------------------------+ |                  |
|                  | | Type a command... [->]  | |                  |
+------------------+-----------------------------+------------------+
```

## Stack

| Layer | Technology |
|-------|-----------|
| Shell | Electron 33 |
| UI | Vanilla HTML/CSS/JS |
| Icons | Inline SVG (Feather-style) |
| AI | OpenAI API + Ollama local |
| File ops | Node.js fs, path, crypto |
| Packaging | electron-builder (Windows .exe, macOS .dmg) |

## Architecture

```
file-organizer-app/
│
├── main.js              # Electron main process
│   ├── Window management (frameless, draggable titlebar)
│   ├── IPC handlers for all file system operations
│   ├── AI bridge (delegates to ai/* modules)
│   └── Security: contextIsolation, no nodeIntegration
│
├── preload.js           # Secure context bridge
│   └── Exposes api.* methods to renderer via contextBridge
│
├── ai/
│   ├── openai.js        # OpenAI chat completions (gpt-4o-mini)
│   │   └── System prompt defines capabilities + JSON action format
│   └── ollama.js        # Ollama local API (http://localhost:11434)
│       ├── Chat with local models
│       └── List available models
│
├── renderer/
│   ├── index.html       # 3-panel layout + SVG icon library + modals
│   ├── style.css        # Dark theme, CSS variables, animations
│   ├── settings.js      # Settings state, modal, localStorage persistence
│   ├── files.js         # File tree rendering, directory scanning
│   ├── preview.js       # File preview (text, images, metadata)
│   └── chat.js          # AI chat, action parsing, confirmation flow
│
└── package.json         # Dependencies + electron-builder config
```

## How it works

### 1. File Browser (Left Panel)
- Click the folder icon to open a native directory picker
- Scans the selected directory via `fs:scan` IPC
- Renders files sorted: directories first, then alphabetical
- Each entry shows an SVG icon based on file type
- Click a file to preview it; click a directory to navigate in
- Path bar shows the current directory

### 2. AI Chat (Center Panel)
The chat is the primary interaction method. Instead of buttons for every operation, you describe what you want and the AI executes it.

**Flow:**
1. User types a command (e.g., "organize downloads by file type")
2. The current directory listing is injected as system context
3. The AI (OpenAI or Ollama) responds with:
   - A human-readable message explaining the plan
   - A JSON array of actions with type, path, description
4. Actions are displayed as tags below the message
5. User clicks "Execute" to see a confirmation dialog
6. After confirmation, actions run sequentially
7. Results are reported back in chat

**Action types the AI can request:**
`scan`, `read`, `delete`, `move`, `copy`, `rename`, `mkdir`, `findDuplicates`, `openExplorer`

**Safety:** The AI is instructed to always explain before acting. Confirmation is required for destructive operations. Deleted files go to the system trash.

### 3. File Preview (Right Panel)
- Shows file metadata (name, size, type, modified date)
- Renders image previews for common image formats
- Renders text content for text/code files (truncated at 10KB)
- Binary files show a placeholder
- Action buttons: Open in Explorer, Delete

### 4. Settings (Ctrl+, or gear icon)
- **AI Mode:** Toggle between Cloud (OpenAI) and Local (Ollama)
- **OpenAI:** Enter your API key (stored in localStorage)
- **Ollama:** Select from available local models
- **Safety:** Toggle confirmation before destructive actions

### AI Prompt Engineering

The system prompt sent to the AI defines its capabilities and enforces rules:

```
You are FileOrganizer AI...
Capabilities: scan, read, delete, move, copy, rename, mkdir, findDuplicates
Rules:
  1. Always explain what you will do before doing it
  2. Ask for confirmation before destructive actions
  3. Return response in JSON format with message + actions array
  4. Never delete without explicit user confirmation
  5. Organization defaults: Images/, Documents/, Videos/, Audio/, Archives/, Code/, Others/
```

### File Operations (main.js)

All file system access happens in the main process through IPC handlers:

| IPC Channel | Function | Description |
|------------|----------|-------------|
| `fs:scan` | `fs.readdir` + `fs.stat` | List directory contents |
| `fs:read` | `fs.readFile` | Read file content for preview |
| `fs:delete` | `shell.trashItem` | Move to system trash |
| `fs:move` | `fs.rename` | Move file to new location |
| `fs:copy` | `fs.copyFile` | Copy file |
| `fs:mkdir` | `fs.mkdir` | Create directory |
| `fs:rename` | `fs.rename` | Rename file |
| `fs:hash` | `crypto.createHash` | SHA-256 hash for duplicate detection |
| `fs:findDuplicates` | Walk + hash compare | Find duplicate files |
| `fs:openExplorer` | `shell.showItemInFolder` | Open in native file manager |

## Running

```bash
# Install dependencies
npm install

# Run in development
npm start

# Build for Windows
npm run build:win

# Build for macOS
npm run build:mac

# Build both
npm run build:all
```

## Cross-platform

The same codebase builds for both Windows and macOS:

- **Windows:** NSIS installer (`dist/file-organizer-setup.exe`)
- **macOS:** DMG image (`dist/file-organizer.dmg`)
- Platform-specific behavior: `process.platform === 'darwin'` for Mac-only quirks
- `shell.trashItem` works on both platforms (Electron 30+)
- Native file dialogs adapt to each OS

## Customization

### AI Backend
- **OpenAI:** Set `OPENAI_API_KEY` or enter in Settings. Model: `gpt-4o-mini` (configurable in `ai/openai.js`)
- **Ollama:** Install [Ollama](https://ollama.com), run `ollama pull llama3.2`, then select it in Settings

### Design Tokens
All colors, radii, and transitions are CSS custom properties in `:root` inside `style.css`. Change `--accent`, `--bg-*`, `--text-*` to rebrand.

### Icons
SVG icons are defined in `index.html` as `<defs>` inside a hidden `<svg>` element. Reference them with `<use href="#icon-name"/>`. Based on Feather icons (MIT licensed). Add new icons by appending to the `<defs>` block.

## Security

- `contextIsolation: true` -- renderer cannot access Node.js directly
- `nodeIntegration: false` -- no `require()` in renderer
- All file operations go through typed IPC channels in `preload.js`
- CSP header restricts script sources to `'self'`
- API keys stored in `localStorage` (not written to disk as plaintext)
- No secrets in the codebase

## License

MIT
