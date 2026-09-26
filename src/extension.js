const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { ConversationManager } = require('./conversationManager');

class ChatHistoryViewProvider {
    constructor(extensionUri, conversationManager) {
        this._extensionUri = extensionUri;
        this._manager = conversationManager;
        this._view = null;
    }

    resolveWebviewView(webviewView, context, _token) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.command) {
                case 'ready':
                case 'refresh':
                    this.sendConversations();
                    break;
                case 'syncState':
                    this.syncState();
                    break;
                case 'openConversation':
                    await this.handleOpenConversation(data.cid, data.wsPath, data.title);
                    break;
                case 'openConversationCurrentWindow':
                    await this.openInCurrentWindow(data.cid);
                    break;
                case 'openConversationWorkspace':
                    await this.openInWorkspace(data.cid, data.wsPath);
                    break;
                case 'deleteConversation':
                    await this.handleDeleteConversation(data.cid, data.title);
                    break;
                case 'openLogs':
                    await this.handleOpenLogs(data.cid);
                    break;
                case 'copyId':
                    if (data.cid) {
                        await vscode.env.clipboard.writeText(data.cid);
                        vscode.window.showInformationMessage(`Conversation ID copied to clipboard: ${data.cid}`);
                    }
                    break;
            }
        });

        // Listen for data updates
        const removeListener = this._manager.addListener(() => {
            this.sendConversations();
        });

        webviewView.onDidDispose(() => {
            removeListener();
        });

        // Send initial list
        this.sendConversations();
    }

    getCurrentWorkspaceUri() {
        const folders = vscode.workspace.workspaceFolders;
        if (folders && folders.length > 0) {
            return folders[0].uri.toString();
        }
        return '';
    }

    sendConversations() {
        if (!this._view) return;
        const list = this._manager.getConversations();
        const currentWsUri = this.getCurrentWorkspaceUri();
        this._view.webview.postMessage({
            type: 'updateConversations',
            list,
            currentWsUri
        });
    }

    async syncState() {
        const success = this._manager.syncToVscdb();
        const list = this._manager.getConversations();
        if (this._view) {
            this._view.webview.postMessage({
                type: 'syncFinished',
                success,
                count: list.length
            });
        }
        if (success) {
            vscode.window.showInformationMessage(`Successfully synced ${list.length} conversations to Antigravity internal state!`);
        } else {
            vscode.window.showWarningMessage('Could not update Antigravity state.vscdb');
        }
    }

    async handleOpenConversation(cid, wsPath, title) {
        const currentWs = this.getCurrentWorkspaceUri();
        const norm = (s) => (s || '').replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();

        // 1. If currently in the exact same workspace as the conversation:
        if (wsPath && currentWs && norm(wsPath) === norm(currentWs)) {
            await this.openInCurrentWindow(cid);
            return;
        }

        // 2. If different workspace (or no workspace), prompt user with exact IDE options
        try {
            const wsUris = wsPath ? [wsPath] : [];
            // Try native Antigravity command first
            const res = await vscode.commands.executeCommand("antigravity.openConversationWorkspaceQuickPick", {
                cascadeId: cid,
                workspaceUris: wsUris
            });

            if (res && res.openInCurrentWindow) {
                await this.openInCurrentWindow(cid);
            }
        } catch (e) {
            // Fallback to custom QuickPick matching the exact same UX
            await this.showWorkspaceQuickPickFallback(cid, wsPath, title);
        }
    }

    async showWorkspaceQuickPickFallback(cid, wsPath, title) {
        const items = [
            {
                label: "$(window) Open in current window",
                description: "Continue conversation in the current workspace",
                action: 'current'
            }
        ];

        if (wsPath) {
            try {
                const targetUri = vscode.Uri.parse(wsPath);
                items.push({
                    label: `$(folder) Open in workspace: ${targetUri.fsPath}`,
                    description: "Open the conversation in its original project window",
                    action: 'target',
                    targetUri
                });
            } catch {}
        }

        const picked = await vscode.window.showQuickPick(items, {
            placeHolder: `Select where to open conversation: ${title || cid}`,
            ignoreFocusOut: false
        });

        if (!picked) return;

        if (picked.action === 'current') {
            await this.openInCurrentWindow(cid);
        } else if (picked.action === 'target' && picked.targetUri) {
            this._manager.setWorkspaceCascade(picked.targetUri.toString(), cid);
            await vscode.commands.executeCommand("vscode.openFolder", picked.targetUri, { forceNewWindow: true });
        }
    }

    async openInCurrentWindow(cid) {
        const currentWs = this.getCurrentWorkspaceUri();
        if (currentWs) {
            this._manager.setWorkspaceCascade(currentWs, cid);
        }

        // Focus chat panel on the right side
        try {
            await vscode.commands.executeCommand("workbench.view.extension.antigravity.agentViewContainerId");
        } catch {}
        try {
            await vscode.commands.executeCommand("antigravity.openChatView");
        } catch {}
        try {
            await vscode.commands.executeCommand("antigravity.agentSidePanel.focus");
        } catch {}
    }

    async openInWorkspace(cid, wsPath) {
        if (!wsPath) {
            await this.openInCurrentWindow(cid);
            return;
        }

        try {
            const targetUri = vscode.Uri.parse(wsPath);
            this._manager.setWorkspaceCascade(targetUri.toString(), cid);
            await vscode.commands.executeCommand("vscode.openFolder", targetUri, { forceNewWindow: true });
        } catch (e) {
            vscode.window.showErrorMessage(`Failed to open workspace: ${e.message}`);
        }
    }

    async handleDeleteConversation(cid, title) {
        const displayName = title ? `"${title}"` : cid;
        const confirm = await vscode.window.showWarningMessage(
            `Are you sure you want to permanently delete conversation ${displayName}?`,
            { modal: true },
            'Delete Conversation'
        );

        if (confirm === 'Delete Conversation') {
            try {
                this._manager.deleteConversation(cid);
                vscode.window.showInformationMessage(`Conversation ${displayName} deleted successfully.`);
            } catch (e) {
                vscode.window.showErrorMessage(`Failed to delete conversation: ${e.message}`);
            }
        }
    }

    async handleOpenLogs(cid) {
        const conv = this._manager.getConversations().find(c => c.cid === cid);
        if (conv && conv.transcriptPath && fs.existsSync(conv.transcriptPath)) {
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(conv.transcriptPath));
            await vscode.window.showTextDocument(doc);
        } else {
            vscode.window.showInformationMessage(`No transcript file found for conversation ${cid}.`);
        }
    }

    _getHtmlForWebview(webview) {
        const htmlPath = path.join(this._extensionUri.fsPath, 'src', 'webview', 'view.html');
        const cssPath = path.join(this._extensionUri.fsPath, 'src', 'webview', 'view.css');
        const jsPath = path.join(this._extensionUri.fsPath, 'src', 'webview', 'view.js');

        const cssUri = webview.asWebviewUri(vscode.Uri.file(cssPath));
        const jsUri = webview.asWebviewUri(vscode.Uri.file(jsPath));

        let html = fs.readFileSync(htmlPath, 'utf8');
        html = html.replace('{{CSS_URI}}', cssUri.toString());
        html = html.replace('{{JS_URI}}', jsUri.toString());
        return html;
    }
}

function activate(context) {
    const manager = new ConversationManager();
    manager.reload();
    manager.startWatching();

    const provider = new ChatHistoryViewProvider(context.extensionUri, manager);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'antigravity-chat-history.view',
            provider,
            { webviewOptions: { retainContextWhenHidden: true } }
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('antigravity-chat-history.refresh', () => {
            manager.reload();
            provider.sendConversations();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('antigravity-chat-history.syncState', () => {
            provider.syncState();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('antigravity-chat-history.openChat', (item) => {
            if (item && item.cid) {
                provider.handleOpenConversation(item.cid, item.wsPath, item.title);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('antigravity-chat-history.deleteChat', (item) => {
            if (item && item.cid) {
                provider.handleDeleteConversation(item.cid, item.title);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('antigravity-chat-history.openLogs', (item) => {
            if (item && item.cid) {
                provider.handleOpenLogs(item.cid);
            }
        })
    );

    context.subscriptions.push({
        dispose: () => {
            manager.stopWatching();
        }
    });

    console.log('[Antigravity Chat History] Extension activated successfully.');
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};
