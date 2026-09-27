# Antigravity Permanent Chat History

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Google%20Antigravity%20IDE-blueviolet.svg)](#)
[![Version](https://img.shields.io/badge/Version-1.3.0-green.svg)](#)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#)

> **Never lose AI chat history again.** A high-performance, permanent, searchable chat history sidebar extension for **Google Antigravity IDE** that guarantees 100% of your AI conversations, trajectory logs, and prompts remain preserved across laptop restarts, IDE reloads, and workspace switches.

---

## ⚡ The Problem

In Google Antigravity IDE:
1. **Chat history vanishes or gets truncated** to 2–3 recent entries after laptop reboots or window reloads.
2. Chats from other workspaces are hidden or inaccessible unless you switch to that specific workspace.
3. Fallback titles often fail to reflect the actual goals or content of your prompt sessions.
4. Restoring past sessions from custom panels often failed to load the conversation into the native chat panel.

## 🚀 The Solution: Permanent Chat History

**Permanent Chat History** mounts directly onto the **Activity Bar** (Primary Sidebar) and connects directly to local SQLite databases on your disk (`.gemini/antigravity-ide/conversations/*.db`). 

Because it reads your persisted local databases directly, integrates natively with Antigravity IDE's internal conversation loader, and maintains recursive background watchers, **0 sessions are ever lost or truncated**, regardless of machine restarts or OS updates.

---

## 🌟 Key Features

### 1. 🛡️ 100% Native Architecture & Reboot Stability (v1.3.0)
- **Zero Core Bundle Modifications**: Completely avoids modifying any core Antigravity IDE / VS Code bundles (`workbench.desktop.main.js`), strictly honoring official `product.json` integrity checksums.
- **Zero Blank Screen Risk**: Completely eliminates startup crashes and blank screens across cold system reboots, sleep states, and window reloads.
- **Clean Safe Operation**: Reads persisted conversation databases safely with zero file-locking conflicts.

### 2. ⚡ Seamless Native Chat Restoration
- Restores any conversation target for the current workspace with single-click ease.
- When opening a chat from another workspace, launches the original workspace in a dedicated window with that session pre-loaded.
- Quick action button allows immediate window reload or native chat picker invocation.

### 3. 🔝 Real-Time LRU Reordering (Active Chats Jump to Top)
- **Last-Recently-Used (LRU)** prioritization: Whenever an older chat session receives a new prompt or assistant message, its recency timestamp immediately updates and it automatically jumps to the very top (position 1) of the list.
- Backed by efficient, non-blocking filesystem monitoring on active conversation database write-ahead logs (`.db-wal`).

### 3. 🗂️ "All Chats" vs "By Directory" Categories
- **All Chats**: Comprehensive chronological view of every chat session across all projects.
- **By Directory**: Clean accordion cards organized directory-by-directory.
  - **Collapsed**: Displays only the directory folder name and total chat count badge (e.g. `(14)`).
  - **Expanded**: Smoothly opens to reveal only that directory's conversations.
  - **Active Indicator**: Automatically flags your currently active open workspace with an `Active` badge.

### 4. 🔀 Flexible Sorting & Date Filtering
- **Sort Toggle**: Switch instantly between:
  - **Newest First** (default): Most recently active conversations on top, oldest on the bottom.
  - **Oldest First**: Oldest conversations on top, latest on the bottom.
- **Date Filter Chips**: Filter sessions by *All Time*, *Today*, *7 Days*, or *30 Days*.
- **State Persistence**: Your view mode, sort order, and expanded folders are automatically saved in IDE state and restored whenever you open the IDE.

### 5. 🎯 Targeted Purpose Titles & Inline Editing
- **Automatic Purpose Extraction**: Accurately targets the purpose of each chat by analyzing session objectives, `implementation_plan.md`, `walkthrough.md`, `task.md`, and clean user prompt intent.
- **✏️ Editable Titles**:
  - Click the **pencil icon** (`✏️`) on any conversation card or **double-click** the title to rename it inline.
  - Or right-click and select **Rename Title**.
  - Press <kbd>Enter</kbd> to save or <kbd>Esc</kbd> to cancel.
  - Custom titles are saved in `~/.gemini/antigravity-ide/custom_titles.json` and persist permanently across laptop reboots and IDE updates.
  - Clearing the input and saving instantly restores the automatically extracted purpose title.

### 6. 💬 Rich Hover Preview (Full Title & Last Prompt)
- Hover your mouse over any conversation card to open a glassmorphic preview tooltip showing:
  - **Title**: The unabridged chat title.
  - **Last Message / Prompt**: The exact last prompt you sent in that conversation.
  - **Directory**: The workspace location.
  - **Date & Time**: Exact creation/activity timestamp.

### 7. 🗑️ Inline Deletion & Context Menu
- Delete button (`🗑`) with modal confirmation dialog to safely remove obsolete chats and delete associated SQLite database files.
- Right-click context menu:
  - **Open in Current Window**
  - **Open in Workspace Folder**
  - **Rename Title**
  - **View Full Transcript Logs (`.jsonl`)**
  - **Copy Conversation ID**
  - **Delete Conversation**

### 7. 🔄 Live Sync & Native State Synchronization
- Automatically monitors disk changes via `fs.watch` and polls every 5 seconds. Chats created seconds ago appear immediately without manual refresh.
- Encodes protobuf summaries directly into Antigravity IDE's internal `state.vscdb` (`antigravityUnifiedStateSync.trajectorySummaries`), ensuring native pickers remain populated.

---

## 📦 Installation & Setup

### Prerequisites
- Google Antigravity IDE or compatible VS Code distribution
- Node.js (v18+ recommended; Node 22 built into Antigravity is supported)

### Quick One-Step Install

Clone the repository and run the built-in installer:

```bash
# Clone the repository
git clone https://github.com/AprajitSarkar/antigravity-chat-history.git
cd antigravity-chat-history

# Install extension into Antigravity IDE
node install.js
```

Then in Antigravity IDE:
1. Press <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd> (or <kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd> on macOS).
2. Type and select **`Developer: Reload Window`**.
3. Look for the **Chat History** icon on the left Activity Bar!

---

## 🏗️ Architecture & How It Works

```
┌────────────────────────────────────────────────────────┐
│               Antigravity Activity Bar                 │
│               [Chat History Sidebar]                   │
└──────────────────────────┬─────────────────────────────┘
                           │ IPC Message Protocol
┌──────────────────────────▼─────────────────────────────┐
│                 Extension Host                         │
│            (src/conversationManager.js)                │
└────────────┬─────────────────────────────┬─────────────┘
             │                             │
    SQLite Read (Read-Only)       Live fs.watch / Polling
             │                             │
┌────────────▼─────────────────────────────▼─────────────┐
│ Local Disk Storage                                     │
│ ├── ~/.gemini/antigravity-ide/conversations/*.db       │
│ ├── ~/.gemini/antigravity-ide/brain/<cid>/...          │
│ └── ~/AppData/Roaming/Antigravity IDE/.../state.vscdb  │
└────────────────────────────────────────────────────────┘
```

1. **Direct SQLite Querying**: Connects in read-only mode to `~/.gemini/antigravity-ide/conversations/*.db` using Node's native `DatabaseSync` (`node:sqlite`).
2. **Metadata Extraction**: Gathers step counts, timestamps, workspace URIs, and extracts real titles from Markdown artifacts and transcripts.
3. **Protobuf Sync**: Encodes conversation summaries into Antigravity's unified state in `state.vscdb`.

---

## 🛠️ Commands Contributed

| Command | Title | Description |
| :--- | :--- | :--- |
| `antigravity-chat-history.refresh` | **Refresh Chat History** | Force re-scans conversation databases on disk |
| `antigravity-chat-history.syncState` | **Sync All to Antigravity State** | Encodes and writes all sessions to `state.vscdb` |
| `antigravity-chat-history.openLogs` | **View Transcript Logs** | Opens raw `.jsonl` transcript in editor |
| `antigravity-chat-history.deleteChat` | **Delete Chat** | Permanently deletes session database files |

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

## 🔍 Tags & Keywords

`antigravity` · `antigravity-ide` · `chat-history` · `ai-chat` · `gemini` · `developer-tools` · `productivity` · `vscode-extension` · `trajectory-logs` · `session-recovery` · `persistent-chat`
