const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

class ConversationViewerManager {
    constructor(extensionUri, conversationManager) {
        this._extensionUri = extensionUri;
        this._manager = conversationManager;
        this._activePanels = new Map(); // cid -> WebviewPanel
    }

    async openConversation(cid, customTitle) {
        if (!cid) return;

        // If panel already exists, reveal it
        if (this._activePanels.has(cid)) {
            const existing = this._activePanels.get(cid);
            existing.reveal(vscode.ViewColumn.Active);
            return;
        }

        const details = this._manager.getConversationDetails(cid);
        const title = customTitle || details.conv.title || 'Conversation Detail';
        const displayTabTitle = title.length > 25 ? title.substring(0, 22) + '...' : title;

        const panel = vscode.window.createWebviewPanel(
            'antigravityChatHistory.detail',
            `💬 ${displayTabTitle}`,
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [this._extensionUri]
            }
        );

        this._activePanels.set(cid, panel);

        panel.onDidDispose(() => {
            this._activePanels.delete(cid);
        });

        panel.webview.html = this._getHtmlForWebview(panel.webview);

        panel.webview.onDidReceiveMessage(async (msg) => {
            switch (msg.command) {
                case 'viewerReady':
                    panel.webview.postMessage({
                        type: 'initData',
                        ...details
                    });
                    break;

                case 'openWorkspace':
                    if (msg.wsPath) {
                        try {
                            const uri = vscode.Uri.parse(msg.wsPath);
                            await vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: true });
                        } catch (e) {
                            vscode.window.showErrorMessage(`Failed to open workspace: ${e.message}`);
                        }
                    }
                    break;

                case 'focusChat':
                    try {
                        await vscode.commands.executeCommand('workbench.view.extension.antigravity.agentViewContainerId');
                    } catch {}
                    try {
                        await vscode.commands.executeCommand('antigravity.openChatView');
                    } catch {}
                    try {
                        await vscode.commands.executeCommand('antigravity.agentSidePanel.focus');
                    } catch {}
                    break;

                case 'openArtifact':
                    if (msg.path && fs.existsSync(msg.path)) {
                        try {
                            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(msg.path));
                            await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside });
                        } catch (e) {
                            vscode.window.showErrorMessage(`Failed to open artifact: ${e.message}`);
                        }
                    }
                    break;

                case 'openLogs':
                    if (details.logFilePath && fs.existsSync(details.logFilePath)) {
                        try {
                            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(details.logFilePath));
                            await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside });
                        } catch (e) {
                            vscode.window.showErrorMessage(`Failed to open log file: ${e.message}`);
                        }
                    } else {
                        vscode.window.showInformationMessage(`No raw transcript log available for ${cid}.`);
                    }
                    break;

                case 'copyText':
                    if (msg.text) {
                        await vscode.env.clipboard.writeText(msg.text);
                    }
                    break;
            }
        });
    }

    _getHtmlForWebview(webview) {
        const htmlPath = path.join(this._extensionUri.fsPath, 'src', 'viewer', 'viewer.html');
        const cssPath = path.join(this._extensionUri.fsPath, 'src', 'viewer', 'viewer.css');
        const jsPath = path.join(this._extensionUri.fsPath, 'src', 'viewer', 'viewer.js');

        const cssUri = webview.asWebviewUri(vscode.Uri.file(cssPath));
        const jsUri = webview.asWebviewUri(vscode.Uri.file(jsPath));

        let html = fs.readFileSync(htmlPath, 'utf8');
        html = html.replace('{{CSS_URI}}', cssUri.toString());
        html = html.replace('{{JS_URI}}', jsUri.toString());
        return html;
    }
}

module.exports = { ConversationViewerManager };
