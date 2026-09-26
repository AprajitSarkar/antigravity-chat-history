const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { encodeTrajectorySummaries } = require('./protoEncoder');

const USER_PROFILE = process.env.USERPROFILE || 'C:\\Users\\Aprajit';
const CONV_DIR = path.join(USER_PROFILE, '.gemini\\antigravity-ide\\conversations');
const BRAIN_DIR = path.join(USER_PROFILE, '.gemini\\antigravity-ide\\brain');
const GLOBAL_STORAGE = path.join(USER_PROFILE, 'AppData\\Roaming\\Antigravity IDE\\User\\globalStorage');
const VSCDB_PATH = path.join(GLOBAL_STORAGE, 'state.vscdb');

function cleanText(s) {
    if (!s) return "";
    s = s.replace(/<[^>]+>/g, '');
    s = s.replace(/The current local time is:[\s\S]*/g, '');
    s = s.replace(/# Conversation History[\s\S]*?<\/conversation_summaries>/g, '');
    s = s.replace(/The user's current state is as follows:[\s\S]*/g, '');
    s = s.replace(/@\[[^\]]+\]/g, '');
    s = s.replace(/is a \[(?:File|Directory)\]:[^\r\n]*/gi, ' ');
    s = s.replace(/^[a-zA-Z]:\\[^\s]+\s*/g, '');
    s = s.replace(/^[#*`\s-]+/g, '');
    return s.replace(/[\r\n\t]+/g, ' ').trim();
}

function formatRelativeTime(timestampMs) {
    const diff = Date.now() - timestampMs;
    const sec = Math.floor(diff / 1000);
    if (sec < 45) return 'Just now';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hrs = Math.floor(min / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    const date = new Date(timestampMs);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatFullDate(timestampMs) {
    const date = new Date(timestampMs);
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isToday) {
        return `Today at ${timeStr}`;
    }
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
        return `Yesterday at ${timeStr}`;
    }
    return `${date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })} ${timeStr}`;
}

function extractDirectoryName(wsPath) {
    if (!wsPath) return 'Global (No Folder)';
    try {
        let clean = wsPath.replace(/file:\/\/\//i, '').replace(/file:\/\//i, '');
        clean = decodeURIComponent(clean);
        clean = clean.replace(/\\/g, '/');
        if (clean.endsWith('/')) clean = clean.slice(0, -1);
        const parts = clean.split('/').filter(Boolean);
        return parts[parts.length - 1] || clean;
    } catch {
        return wsPath;
    }
}

const CUSTOM_TITLES_FILE = path.join(USER_PROFILE, '.gemini\\antigravity-ide\\custom_titles.json');

function loadCustomTitles() {
    try {
        if (fs.existsSync(CUSTOM_TITLES_FILE)) {
            return JSON.parse(fs.readFileSync(CUSTOM_TITLES_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Error loading custom titles:', e);
    }
    return {};
}

function saveCustomTitles(titles) {
    try {
        const dir = path.dirname(CUSTOM_TITLES_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(CUSTOM_TITLES_FILE, JSON.stringify(titles, null, 2), 'utf8');
        return true;
    } catch (e) {
        console.error('Error saving custom titles:', e);
        return false;
    }
}

function extractPromptsAndPurpose(cid, wsPath, mtime, bdir, walkthroughPath, planPath) {
    let firstPrompt = "";
    let lastPrompt = "";
    const userPrompts = [];
    let detectedObjective = "";
    let plannerFirstHeading = "";

    // 1. Walkthrough.md
    let walkthroughTitle = "";
    if (fs.existsSync(walkthroughPath)) {
        try {
            const lines = fs.readFileSync(walkthroughPath, 'utf8').split('\n');
            for (const l of lines) {
                const trimmed = l.trim();
                if (trimmed.startsWith('# ')) {
                    const t = trimmed.substring(2).trim();
                    if (t && !/^walkthrough/i.test(t)) {
                        walkthroughTitle = t;
                        break;
                    }
                }
            }
        } catch {}
    }

    // 2. Implementation plan.md
    let planTitle = "";
    if (fs.existsSync(planPath)) {
        try {
            const lines = fs.readFileSync(planPath, 'utf8').split('\n');
            for (const l of lines) {
                const trimmed = l.trim();
                if (trimmed.startsWith('# ')) {
                    const t = trimmed.substring(2).trim();
                    if (t && !/^implementation plan/i.test(t)) {
                        planTitle = t;
                        break;
                    }
                }
            }
        } catch {}
    }

    // 3. Task.md
    let taskTitle = "";
    const taskPath = path.join(bdir, 'task.md');
    if (fs.existsSync(taskPath)) {
        try {
            const lines = fs.readFileSync(taskPath, 'utf8').split('\n');
            for (const l of lines) {
                const trimmed = l.trim();
                if (trimmed.startsWith('# ')) {
                    const t = trimmed.substring(2).trim();
                    if (t && !/^task/i.test(t)) {
                        taskTitle = t;
                        break;
                    }
                }
            }
        } catch {}
    }

    // 4. Transcript logs
    const tpath = path.join(bdir, '.system_generated', 'logs', 'transcript.jsonl');
    const fullTpath = path.join(bdir, '.system_generated', 'logs', 'transcript_full.jsonl');
    const logFile = fs.existsSync(tpath) ? tpath : (fs.existsSync(fullTpath) ? fullTpath : null);

    if (logFile) {
        try {
            const content = fs.readFileSync(logFile, 'utf8');
            const lines = content.split('\n');

            for (const l of lines) {
                if (l.includes('"type":"USER_INPUT"')) {
                    try {
                        const obj = JSON.parse(l);
                        let raw = obj.content || '';
                        const match = raw.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/);
                        if (match) raw = match[1];
                        const c = cleanText(raw);
                        const isOnlyFilePaths = /^([a-zA-Z]:\\[^\s]+\s*)+$/i.test(c) || /^[a-zA-Z]:\\[a-zA-Z0-9_\\\-.]+/i.test(c);
                        if (c && c.length > 1 && !c.startsWith('http') && !isOnlyFilePaths) {
                            userPrompts.push(c);
                        } else if (c && c.startsWith('http')) {
                            const repoName = c.split('/').pop().replace('.git', '');
                            if (repoName) userPrompts.push(`Project: ${repoName}`);
                        }
                    } catch {}
                } else if (l.includes('"type":"PLANNER_RESPONSE"')) {
                    try {
                        const obj = JSON.parse(l);
                        const text = obj.content || '';
                        if (!detectedObjective) {
                            const objMatch = text.match(/###\s*(?:USER\s+)?Objective:\s*([^\r\n]+)/i) ||
                                             text.match(/\*\*(?:User\s+)?Objective\*\*:\s*([^\r\n]+)/i) ||
                                             text.match(/###\s*Goal:\s*([^\r\n]+)/i) ||
                                             text.match(/###\s*1\.\s*Task Overview[\s\S]*?[-*]\s+\*\*User Request\*\*:\s*([^\r\n]+)/i);
                            if (objMatch && objMatch[1]) {
                                detectedObjective = cleanText(objMatch[1]);
                            }
                        }
                        if (!plannerFirstHeading) {
                            const hMatch = text.match(/###\s+([^\n\r]+)/) || text.match(/##\s+([^\n\r]+)/);
                            if (hMatch && hMatch[1]) {
                                const heading = hMatch[1].replace(/[*#]/g, '').trim();
                                if (heading.length > 5 && heading.length < 85) {
                                    plannerFirstHeading = heading;
                                }
                            }
                        }
                    } catch {}
                }
            }
        } catch {}
    }

    if (userPrompts.length > 0) {
        firstPrompt = userPrompts[0];
        lastPrompt = userPrompts[userPrompts.length - 1];
    } else {
        firstPrompt = "[Voice / Audio Conversation]";
        lastPrompt = "[Voice / Audio Conversation]";
    }

    function isValidTitle(t) {
        if (!t) return false;
        const stripped = t.replace(/[^a-zA-Z0-9]/g, '').trim();
        return stripped.length >= 3;
    }

    // Determine targeted purpose title
    let autoTitle = "";
    if (walkthroughTitle && isValidTitle(walkthroughTitle)) {
        autoTitle = walkthroughTitle;
    } else if (planTitle && isValidTitle(planTitle)) {
        autoTitle = planTitle;
    } else if (taskTitle && isValidTitle(taskTitle)) {
        autoTitle = taskTitle;
    } else if (firstPrompt && firstPrompt !== "[Voice / Audio Conversation]" && isValidTitle(firstPrompt)) {
        autoTitle = firstPrompt.length > 80 ? firstPrompt.substring(0, 77) + '...' : firstPrompt;
    } else if (plannerFirstHeading && isValidTitle(plannerFirstHeading)) {
        autoTitle = plannerFirstHeading;
    } else if (detectedObjective && isValidTitle(detectedObjective)) {
        autoTitle = detectedObjective.length > 80 ? detectedObjective.substring(0, 77) + '...' : detectedObjective;
    } else {
        const dirName = extractDirectoryName(wsPath);
        const date = new Date(mtime * 1000);
        autoTitle = `${dirName} Chat (${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })})`;
    }

    return {
        autoTitle,
        firstPrompt,
        lastPrompt
    };
}

function getConversationData(cid) {
    const dbPath = path.join(CONV_DIR, `${cid}.db`);
    if (!fs.existsSync(dbPath)) return null;

    let mtime = 0;
    let sizeBytes = 0;
    try {
        const stat = fs.statSync(dbPath);
        mtime = stat.mtimeMs / 1000;
        sizeBytes = stat.size;
    } catch {}

    let trajId = cid;
    let stepCount = 0;
    let rawMetaBlob = null;
    let wsPath = "";

    try {
        const db = new DatabaseSync(dbPath, { readOnly: true });
        try {
            const metaRow = db.prepare("SELECT trajectory_id FROM trajectory_meta LIMIT 1").get();
            if (metaRow && metaRow.trajectory_id) trajId = metaRow.trajectory_id;
        } catch {}

        try {
            const countRow = db.prepare("SELECT count(*) as count FROM steps").get();
            if (countRow) stepCount = countRow.count;
        } catch {}

        try {
            const blobRow = db.prepare("SELECT data FROM trajectory_metadata_blob WHERE id = 'main' LIMIT 1").get();
            if (blobRow && blobRow.data) {
                rawMetaBlob = Buffer.isBuffer(blobRow.data) ? blobRow.data : Buffer.from(blobRow.data);
                const str = rawMetaBlob.toString('utf8');
                const match = str.match(/file:\/\/\/[a-zA-Z0-9%_/.:-]+/);
                if (match) wsPath = match[0];
            }
        } catch {}

        db.close();
    } catch (e) {
        // SQLite lock or error fallback
    }

    const bdir = path.join(BRAIN_DIR, cid);
    const tpath = path.join(bdir, '.system_generated', 'logs', 'transcript.jsonl');
    const fullTpath = path.join(bdir, '.system_generated', 'logs', 'transcript_full.jsonl');
    const walkthroughPath = path.join(bdir, 'walkthrough.md');
    const planPath = path.join(bdir, 'implementation_plan.md');

    const { autoTitle, firstPrompt, lastPrompt } = extractPromptsAndPurpose(cid, wsPath, mtime, bdir, walkthroughPath, planPath);
    const customTitles = loadCustomTitles();
    const isCustomTitle = !!customTitles[cid];
    const title = isCustomTitle ? customTitles[cid] : autoTitle;

    const timestampMs = Math.round(mtime * 1000);
    return {
        cid,
        trajId,
        title,
        autoTitle,
        isCustomTitle,
        firstPrompt,
        lastPrompt,
        stepCount,
        mtime,
        timestampMs,
        dateStr: formatFullDate(timestampMs),
        relativeTime: formatRelativeTime(timestampMs),
        wsPath,
        wsName: extractDirectoryName(wsPath),
        rawMetaBlob,
        hasWalkthrough: fs.existsSync(walkthroughPath),
        hasPlan: fs.existsSync(planPath),
        hasTranscript: fs.existsSync(tpath) || fs.existsSync(fullTpath),
        transcriptPath: fs.existsSync(fullTpath) ? fullTpath : (fs.existsSync(tpath) ? tpath : null),
        sizeBytes
    };
}

class ConversationManager {
    setCustomTitle(cid, newTitle) {
        const titles = loadCustomTitles();
        const trimmed = (newTitle || '').trim();
        if (!trimmed) {
            delete titles[cid];
        } else {
            titles[cid] = trimmed;
        }
        saveCustomTitles(titles);

        const cached = this.cache.get(cid);
        if (cached) {
            cached.title = titles[cid] || cached.autoTitle || cached.title;
            cached.isCustomTitle = !!titles[cid];
        }

        this.notifyListeners();
        this.syncToVscdb();
        return true;
    }
    constructor() {
        this.cache = new Map();
        this.watcher = null;
        this.listeners = new Set();
        this.debounceTimer = null;
        this.pollInterval = null;
    }

    addListener(fn) {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }

    notifyListeners() {
        const list = this.getConversations();
        for (const fn of this.listeners) {
            try { fn(list); } catch (e) { console.error('Listener error:', e); }
        }
    }

    startWatching() {
        if (!fs.existsSync(CONV_DIR)) return;

        try {
            this.watcher = fs.watch(CONV_DIR, (eventType, filename) => {
                if (filename && filename.endsWith('.db')) {
                    if (this.debounceTimer) clearTimeout(this.debounceTimer);
                    this.debounceTimer = setTimeout(() => {
                        this.reload();
                    }, 400);
                }
            });
        } catch (e) {
            console.error('Error starting fs.watch:', e);
        }

        // Secondary polling every 5 seconds to ensure 100% sync
        this.pollInterval = setInterval(() => {
            this.checkChanges();
        }, 5000);
    }

    stopWatching() {
        if (this.watcher) {
            try { this.watcher.close(); } catch {}
            this.watcher = null;
        }
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }

    checkChanges() {
        if (!fs.existsSync(CONV_DIR)) return;
        try {
            const files = fs.readdirSync(CONV_DIR).filter(f => f.endsWith('.db'));
            if (files.length !== this.cache.size) {
                this.reload();
                return;
            }
            for (const f of files) {
                const p = path.join(CONV_DIR, f);
                const stat = fs.statSync(p);
                const cid = f.replace('.db', '');
                const cached = this.cache.get(cid);
                if (!cached || Math.abs(cached.mtime - (stat.mtimeMs / 1000)) > 1) {
                    this.reload();
                    return;
                }
            }
        } catch {}
    }

    reload() {
        if (!fs.existsSync(CONV_DIR)) return [];
        try {
            const files = fs.readdirSync(CONV_DIR).filter(f => f.endsWith('.db'));
            const newMap = new Map();
            for (const f of files) {
                const cid = f.replace('.db', '');
                const data = getConversationData(cid);
                if (data) {
                    newMap.set(cid, data);
                }
            }
            this.cache = newMap;
            this.notifyListeners();
            // Automatically background sync to state.vscdb
            this.syncToVscdb();
        } catch (e) {
            console.error('Error reloading conversations:', e);
        }
        return this.getConversations();
    }

    getConversations() {
        const list = Array.from(this.cache.values());
        list.sort((a, b) => b.mtime - a.mtime);
        return list;
    }

    deleteConversation(cid) {
        const dbPath = path.join(CONV_DIR, `${cid}.db`);
        const walPath = path.join(CONV_DIR, `${cid}.db-wal`);
        const shmPath = path.join(CONV_DIR, `${cid}.db-shm`);

        try {
            if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
            if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
            if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
        } catch (e) {
            console.error(`Failed to delete DB files for ${cid}:`, e);
            throw e;
        }

        this.cache.delete(cid);
        this.notifyListeners();
        this.syncToVscdb();
        return true;
    }

    syncToVscdb() {
        if (!fs.existsSync(VSCDB_PATH)) return false;
        const convs = this.getConversations();
        if (convs.length === 0) return false;

        try {
            const b64 = encodeTrajectorySummaries(convs);
            const db = new DatabaseSync(VSCDB_PATH);
            db.prepare(`
                INSERT OR REPLACE INTO ItemTable ([key], value) 
                VALUES ('antigravityUnifiedStateSync.trajectorySummaries', ?);
            `).run(b64);
            db.close();
            return true;
        } catch (e) {
            if (e.code === 'ERR_SQLITE_ERROR' && (e.errcode === 5 || (e.message && e.message.includes('locked')))) {
                // state.vscdb is locked by currently active IDE window
                return false;
            }
            console.error('Error writing trajectorySummaries to state.vscdb:', e);
            return false;
        }
    }

    setWorkspaceCascade(wsUri, cid) {
        if (!fs.existsSync(VSCDB_PATH)) return false;
        try {
            const db = new DatabaseSync(VSCDB_PATH);
            const row = db.prepare("SELECT value FROM ItemTable WHERE [key] = 'google.antigravity'").get();
            let stateObj = {};
            if (row && row.value) {
                try { stateObj = JSON.parse(row.value); } catch {}
            }
            if (!stateObj['antigravity.workspaceCascadeMap']) {
                stateObj['antigravity.workspaceCascadeMap'] = {};
            }
            stateObj['antigravity.workspaceCascadeMap'][wsUri] = cid;
            const updated = JSON.stringify(stateObj);
            db.prepare(`
                INSERT OR REPLACE INTO ItemTable ([key], value)
                VALUES ('google.antigravity', ?);
            `).run(updated);
            db.close();
            return true;
        } catch (e) {
            console.error('Error setting workspaceCascadeMap in state.vscdb:', e);
            return false;
        }
    }
}

module.exports = {
    ConversationManager,
    cleanText,
    formatRelativeTime,
    formatFullDate,
    extractDirectoryName,
    extractPromptsAndPurpose,
    extractRealTitle: (cid, wsPath, mtime, bdir, w, p) => extractPromptsAndPurpose(cid, wsPath, mtime, bdir, w, p).autoTitle,
    loadCustomTitles,
    saveCustomTitles
};
