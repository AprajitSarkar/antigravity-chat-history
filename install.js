const fs = require('fs');
const path = require('path');
const { ConversationManager } = require('./src/conversationManager');
const { ensureWorkbenchPatched } = require('./src/patchWorkbench');

const USER_PROFILE = process.env.USERPROFILE || 'C:\\Users\\Aprajit';
const EXTENSIONS_DIR = path.join(USER_PROFILE, '.antigravity-ide', 'extensions');
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
const version = pkg.version || '1.1.0';
const TARGET_DIR = path.join(EXTENSIONS_DIR, `antigravity-community.antigravity-chat-history-${version}-universal`);
const EXT_JSON_PATH = path.join(EXTENSIONS_DIR, 'extensions.json');

console.log('====================================================');
console.log(` Installing Antigravity Chat History Extension v${version}`);
console.log('====================================================');

// 1. Clean up any existing installations
if (fs.existsSync(EXTENSIONS_DIR)) {
    const existing = fs.readdirSync(EXTENSIONS_DIR);
    for (const item of existing) {
        if (item.startsWith('antigravity-community.antigravity-chat-history')) {
            const oldPath = path.join(EXTENSIONS_DIR, item);
            try {
                fs.rmSync(oldPath, { recursive: true, force: true });
                console.log(`[-] Removed previous version: ${item}`);
            } catch (e) {}
        }
    }
}
fs.mkdirSync(TARGET_DIR, { recursive: true });

// Helper to copy directory recursively
function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

// 2. Copy extension files
console.log(`[*] Copying extension files from ${__dirname} to ${TARGET_DIR}...`);
fs.copyFileSync(path.join(__dirname, 'package.json'), path.join(TARGET_DIR, 'package.json'));
fs.copyFileSync(path.join(__dirname, 'README.md'), path.join(TARGET_DIR, 'README.md'));
copyDir(path.join(__dirname, 'resources'), path.join(TARGET_DIR, 'resources'));
copyDir(path.join(__dirname, 'src'), path.join(TARGET_DIR, 'src'));
console.log('[+] Files copied successfully.');

// 3. Register in extensions.json
console.log(`[*] Updating ${EXT_JSON_PATH}...`);
let list = [];
try {
    list = JSON.parse(fs.readFileSync(EXT_JSON_PATH, 'utf8'));
} catch (e) {
    list = [];
}

const extId = 'antigravity-community.antigravity-chat-history';
list = list.filter(item => item.identifier?.id !== extId);

const newEntry = {
    identifier: { id: extId },
    version: version,
    location: {
        $mid: 1,
        fsPath: TARGET_DIR.toLowerCase(),
        _sep: 1,
        external: 'file:///' + TARGET_DIR.replace(/\\/g, '/'),
        path: '/' + TARGET_DIR.replace(/\\/g, '/'),
        scheme: 'file'
    },
    relativeLocation: `antigravity-community.antigravity-chat-history-${version}-universal`,
    metadata: {
        installedTimestamp: Date.now(),
        pinned: true,
        source: 'local',
        publisherDisplayName: 'Antigravity Community',
        targetPlatform: 'universal',
        updated: true,
        isApplicationScoped: false,
        isMachineScoped: false,
        isBuiltin: false
    }
};

list.push(newEntry);
fs.writeFileSync(EXT_JSON_PATH, JSON.stringify(list, null, 2), 'utf8');
console.log(`[+] Extension registered in extensions.json (Total: ${list.length}).`);

// 4. Initial Sync of all conversations to state.vscdb
console.log('[*] Performing initial conversation scan and database sync...');
const manager = new ConversationManager();
const convs = manager.reload();
const synced = manager.syncToVscdb();
// 5. Ensure Antigravity IDE workbench has direct conversation switching registered
console.log('[*] Verifying Antigravity IDE workbench native chat integration...');
const patchRes = ensureWorkbenchPatched();
if (patchRes.success) {
    console.log(`[+] Antigravity workbench verified (alreadyPatched: ${patchRes.alreadyPatched}).`);
} else {
    console.warn(`[!] Workbench integration note: ${patchRes.error}`);
}

console.log('====================================================');
console.log(' SUCCESS: Extension successfully installed!');
console.log(' Run "Developer: Reload Window" in Antigravity IDE');
console.log(' to activate direct conversation restoration & left panel!');
console.log('====================================================');
