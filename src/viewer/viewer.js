(function () {
  const vscode = acquireVsCodeApi();

  let conversationData = null;
  let allMessageElements = [];

  // DOM Elements
  const wsBadge = document.getElementById('wsBadge');
  const dateBadge = document.getElementById('dateBadge');
  const stepCountBadge = document.getElementById('stepCountBadge');
  const convTitle = document.getElementById('convTitle');
  const convIdSub = document.getElementById('convIdSub');
  const btnOpenWs = document.getElementById('btnOpenWs');
  const btnFocusChat = document.getElementById('btnFocusChat');
  const btnCopyId = document.getElementById('btnCopyId');
  const btnOpenLogs = document.getElementById('btnOpenLogs');
  const viewerSearch = document.getElementById('viewerSearch');
  const clearViewerSearch = document.getElementById('clearViewerSearch');
  const searchMatchCount = document.getElementById('searchMatchCount');
  const artifactsShelf = document.getElementById('artifactsShelf');
  const artifactsCount = document.getElementById('artifactsCount');
  const artifactsGrid = document.getElementById('artifactsGrid');
  const messagesContainer = document.getElementById('messagesContainer');
  const toastNotification = document.getElementById('toastNotification');

  // Handle messages from extension
  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'initData') {
      conversationData = msg;
      renderAll(msg);
    }
  });

  // Signal ready
  vscode.postMessage({ command: 'viewerReady' });

  function showToast(text, duration = 2000) {
    toastNotification.textContent = text;
    toastNotification.style.display = 'block';
    setTimeout(() => {
      toastNotification.style.display = 'none';
    }, duration);
  }

  // Header Actions
  btnCopyId.addEventListener('click', () => {
    if (conversationData && conversationData.conv) {
      vscode.postMessage({ command: 'copyText', text: conversationData.conv.cid });
      showToast('Conversation ID copied to clipboard!');
    }
  });

  btnFocusChat.addEventListener('click', () => {
    vscode.postMessage({ command: 'focusChat' });
  });

  btnOpenLogs.addEventListener('click', () => {
    if (conversationData && conversationData.conv) {
      vscode.postMessage({ command: 'openLogs', cid: conversationData.conv.cid });
    }
  });

  btnOpenWs.addEventListener('click', () => {
    if (conversationData && conversationData.conv && conversationData.conv.wsPath) {
      vscode.postMessage({ command: 'openWorkspace', wsPath: conversationData.conv.wsPath });
    }
  });

  // Search Logic
  viewerSearch.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    clearViewerSearch.style.display = q ? 'block' : 'none';
    filterMessages(q);
  });

  clearViewerSearch.addEventListener('click', () => {
    viewerSearch.value = '';
    clearViewerSearch.style.display = 'none';
    filterMessages('');
    viewerSearch.focus();
  });

  function filterMessages(query) {
    if (!query) {
      allMessageElements.forEach(el => {
        el.style.display = '';
      });
      searchMatchCount.textContent = '';
      return;
    }

    let matchCount = 0;
    allMessageElements.forEach(el => {
      const text = el.textContent.toLowerCase();
      if (text.includes(query)) {
        el.style.display = '';
        matchCount++;
      } else {
        el.style.display = 'none';
      }
    });

    searchMatchCount.textContent = `${matchCount} matching turns`;
  }

  function renderAll(data) {
    const conv = data.conv || {};
    const artifacts = data.artifacts || [];
    const messages = data.messages || [];

    // Header info
    convTitle.textContent = conv.title || 'Untitled Session';
    convTitle.title = conv.title || '';
    convIdSub.textContent = `ID: ${conv.cid || 'Unknown'}`;

    wsBadge.textContent = conv.wsName || 'Global';
    wsBadge.title = conv.wsPath || 'Global (No Workspace)';

    dateBadge.textContent = conv.dateStr || 'Recently';
    stepCountBadge.textContent = `${messages.length} steps`;

    if (!conv.wsPath) {
      btnOpenWs.style.display = 'none';
    } else {
      btnOpenWs.style.display = 'inline-flex';
    }

    // Artifacts Shelf
    if (artifacts.length > 0) {
      artifactsShelf.style.display = 'block';
      artifactsCount.textContent = `${artifacts.length} file${artifacts.length > 1 ? 's' : ''}`;
      artifactsGrid.innerHTML = '';
      artifacts.forEach(art => {
        const chip = document.createElement('div');
        chip.className = 'artifact-chip';
        chip.title = `Click to open in editor:\n${art.path}`;
        chip.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
          <span>${escapeHtml(art.name)}</span>
        `;
        chip.addEventListener('click', () => {
          vscode.postMessage({ command: 'openArtifact', path: art.path });
        });
        artifactsGrid.appendChild(chip);
      });
    } else {
      artifactsShelf.style.display = 'none';
    }

    // Messages
    messagesContainer.innerHTML = '';
    allMessageElements = [];

    if (messages.length === 0) {
      messagesContainer.innerHTML = `
        <div class="loading-state">
          <p>No recorded messages found in transcript for this session.</p>
        </div>
      `;
      return;
    }

    messages.forEach((msg, idx) => {
      const row = document.createElement('div');
      row.className = `msg-row ${msg.role === 'user' ? 'user-msg' : 'assistant-msg'}`;
      row.dataset.stepIndex = msg.stepIndex;

      const timeFormatted = msg.time ? new Date(msg.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

      if (msg.role === 'user') {
        row.innerHTML = `
          <div class="user-bubble">
            <div class="msg-header">
              <span class="user-badge">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                You
              </span>
              <span class="msg-time">${escapeHtml(timeFormatted)}</span>
            </div>
            <div class="user-text">${escapeHtml(msg.text)}</div>
          </div>
        `;
      } else if (msg.role === 'assistant') {
        const bubble = document.createElement('div');
        bubble.className = 'assistant-bubble';

        // Header
        const header = document.createElement('div');
        header.className = 'msg-header';
        header.innerHTML = `
          <span class="assistant-badge">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>
            Antigravity Agent
          </span>
          <span class="msg-time">${escapeHtml(timeFormatted)}</span>
        `;
        bubble.appendChild(header);

        // Thinking accordion
        if (msg.thinking && msg.thinking.trim().length > 0) {
          const thinkingDetails = document.createElement('details');
          thinkingDetails.className = 'thinking-accordion';
          thinkingDetails.innerHTML = `
            <summary>Thinking Process</summary>
            <div class="thinking-content">${escapeHtml(msg.thinking.trim())}</div>
          `;
          bubble.appendChild(thinkingDetails);
        }

        // Assistant Text Content
        if (msg.text && msg.text.trim().length > 0) {
          const contentDiv = document.createElement('div');
          contentDiv.className = 'md-content';
          contentDiv.innerHTML = renderMarkdown(msg.text);
          bubble.appendChild(contentDiv);
        }

        // Tool Calls
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          msg.toolCalls.forEach(tc => {
            const toolCard = document.createElement('div');
            toolCard.className = 'tool-call-card';
            const toolName = tc.name || 'tool';
            const toolSummary = (tc.args && (tc.args.toolSummary || tc.args.toolAction)) || '';

            toolCard.innerHTML = `
              <details>
                <summary class="tool-call-summary">
                  <span class="tool-pill">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
                    ${escapeHtml(toolName)}
                  </span>
                  <span class="tool-desc">${escapeHtml(toolSummary)}</span>
                </summary>
                <div class="tool-details">${escapeHtml(JSON.stringify(tc.args, null, 2))}</div>
              </details>
            `;
            bubble.appendChild(toolCard);
          });
        }

        row.appendChild(bubble);
      } else if (msg.role === 'tool_result') {
        const bubble = document.createElement('div');
        bubble.className = 'tool-call-card';
        bubble.innerHTML = `
          <details>
            <summary class="tool-call-summary">
              <span class="tool-pill" style="color: var(--accent-orange)">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                Result: ${escapeHtml(msg.type || 'Output')}
              </span>
              <span class="tool-desc">${escapeHtml(timeFormatted)}</span>
            </summary>
            <div class="tool-details">${escapeHtml(msg.output || '[No Output]')}</div>
          </details>
        `;
        row.appendChild(bubble);
      }

      messagesContainer.appendChild(row);
      allMessageElements.push(row);
    });

    // Wire up copy buttons for all code blocks
    attachCodeCopyButtons();
  }

  function attachCodeCopyButtons() {
    document.querySelectorAll('.copy-code-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const codeWrapper = btn.closest('.code-block-wrapper');
        if (codeWrapper) {
          const pre = codeWrapper.querySelector('pre');
          if (pre) {
            vscode.postMessage({ command: 'copyText', text: pre.textContent });
            const origText = btn.textContent;
            btn.textContent = 'Copied!';
            setTimeout(() => { btn.textContent = origText; }, 1500);
          }
        }
      });
    });
  }

  // Fast client-side markdown renderer
  function renderMarkdown(md) {
    if (!md) return '';

    // 1. Code blocks ```lang ... ```
    const codeBlocks = [];
    let processed = md.replace(/```([a-zA-Z0-9_\-\s]*)\n([\s\S]*?)```/g, (match, lang, code) => {
      const id = codeBlocks.length;
      const cleanLang = (lang || '').trim() || 'code';
      codeBlocks.push(`
        <div class="code-block-wrapper">
          <div class="code-block-header">
            <span>${escapeHtml(cleanLang)}</span>
            <button class="copy-code-btn">Copy</button>
          </div>
          <pre><code>${escapeHtml(code.trimEnd())}</code></pre>
        </div>
      `);
      return `%%CODEBLOCK_${id}%%`;
    });

    // 2. Inline code
    processed = processed.replace(/`([^`]+)`/g, (m, c) => `<code class="inline-code">${escapeHtml(c)}</code>`);

    // 3. Headings
    processed = processed.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    processed = processed.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    processed = processed.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // 4. Bold & Italic
    processed = processed.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    processed = processed.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // 5. Blockquotes
    processed = processed.replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>');

    // 6. Bullet lists
    processed = processed.replace(/^\s*[-*]\s+(.*$)/gim, '<li>$1</li>');
    processed = processed.replace(/(<li>.*<\/li>(\n|.)*?)(?!<li>)/gim, '<ul>$1</ul>');

    // 7. Paragraphs
    const paras = processed.split(/\n\s*\n/);
    processed = paras.map(p => {
      p = p.trim();
      if (!p) return '';
      if (p.startsWith('<h') || p.startsWith('<ul') || p.startsWith('<blockquote') || p.startsWith('%%CODEBLOCK_')) {
        return p;
      }
      return `<p>${p.replace(/\n/g, '<br>')}</p>`;
    }).join('\n');

    // Restore Code Blocks
    codeBlocks.forEach((block, id) => {
      processed = processed.replace(`%%CODEBLOCK_${id}%%`, block);
    });

    return processed;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
})();
