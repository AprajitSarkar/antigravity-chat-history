const fs = require('fs');
const path = require('path');

function getWorkbenchPath() {
    const userProfile = process.env.USERPROFILE || 'C:\\Users\\Aprajit';
    const possiblePaths = [
        path.join(userProfile, '😡', 'Antigravity IDE', 'resources', 'app', 'out', 'vs', 'workbench', 'workbench.desktop.main.js'),
        path.join(userProfile, 'AppData', 'Local', 'Programs', 'Antigravity IDE', 'resources', 'app', 'out', 'vs', 'workbench', 'workbench.desktop.main.js'),
        path.join('C:', 'Program Files', 'Antigravity IDE', 'resources', 'app', 'out', 'vs', 'workbench', 'workbench.desktop.main.js')
    ];

    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            return p;
        }
    }

    // Try finding by scanning user directory if needed
    try {
        const dirs = fs.readdirSync(userProfile);
        for (const d of dirs) {
            const candidate = path.join(userProfile, d, 'Antigravity IDE', 'resources', 'app', 'out', 'vs', 'workbench', 'workbench.desktop.main.js');
            if (fs.existsSync(candidate)) {
                return candidate;
            }
        }
    } catch {}

    return null;
}

function isWorkbenchPatched() {
    const wbPath = getWorkbenchPath();
    if (!wbPath) return false;
    try {
        const content = fs.readFileSync(wbPath, 'utf8');
        return content.includes('antigravity.loadConversation');
    } catch {
        return false;
    }
}

function ensureWorkbenchPatched() {
    const wbPath = getWorkbenchPath();
    if (!wbPath) {
        return { success: false, error: 'Antigravity IDE workbench.desktop.main.js not found.' };
    }

    try {
        let content = fs.readFileSync(wbPath, 'utf8');
        if (content.includes('antigravity.loadConversation')) {
            return { success: true, alreadyPatched: true, path: wbPath };
        }

        const target = 've(Pvf);';
        if (!content.includes(target)) {
            return { success: false, error: 'Hook location ve(Pvf); not found in workbench bundle.' };
        }

        // Create backup if not already present
        const bakPath = wbPath + '.bak';
        if (!fs.existsSync(bakPath)) {
            try {
                fs.copyFileSync(wbPath, bakPath);
            } catch (e) {
                console.warn('Could not create backup file:', e.message);
            }
        }

        const patch = 'var Zvf=class extends ke{constructor(){super({id:"antigravity.loadConversation",title:"Load Conversation",f1:!1})}async run(t,e){const i=typeof e==="string"?e:e?.cascadeId;if(i)t.get(AJ).togglePanelTab?.("conversation",i)}};ve(Zvf);var Yvf=class extends ke{constructor(){super({id:"antigravity.openConversation",title:"Open Conversation",f1:!1})}async run(t,e){const i=typeof e==="string"?e:e?.cascadeId;if(i)t.get(AJ).togglePanelTab?.("conversation",i)}};ve(Yvf);';

        content = content.replace(target, target + patch);
        fs.writeFileSync(wbPath, content, 'utf8');

        return { success: true, alreadyPatched: false, path: wbPath };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

module.exports = {
    getWorkbenchPath,
    isWorkbenchPatched,
    ensureWorkbenchPatched
};
