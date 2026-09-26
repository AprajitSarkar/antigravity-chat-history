(function() {
  const vscode = acquireVsCodeApi();

  // Load persisted state or defaults
  const savedState = vscode.getState() || {};
  let allConversations = [];
  let currentWsUri = '';
  let currentViewMode = savedState.currentViewMode || 'all'; // 'all' | 'by-dir'
  let sortOrder = savedState.sortOrder || 'newest'; // 'newest' | 'oldest'
  let currentDateFilter = savedState.currentDateFilter || 'all'; // 'all' | 'today' | '7d' | '30d'
  let searchQuery = '';
  let expandedDirs = new Set(savedState.expandedDirs || []);
  let activeContextMenuCid = null;
  let editingCid = null;
  let hoverTimer = null;

  // DOM Elements
  const convContainer = document.getElementById('convContainer');
  const totalBadge = document.getElementById('totalBadge');
  const dirCountPill = document.getElementById('dirCountPill');
  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  const refreshBtn = document.getElementById('refreshBtn');
  const syncBtn = document.getElementById('syncBtn');
  const showingCountText = document.getElementById('showingCountText');
  const contextMenu = document.getElementById('contextMenu');

  // Hover Tooltip Elements
  const hoverTooltip = document.getElementById('hoverTooltip');
  const tooltipTitle = document.getElementById('tooltipTitle');
  const tooltipLastPrompt = document.getElementById('tooltipLastPrompt');
  const tooltipWs = document.getElementById('tooltipWs');
  const tooltipDate = document.getElementById('tooltipDate');

  // View Mode Tabs
  const tabAll = document.getElementById('tabAll');
  const tabByDir = document.getElementById('tabByDir');

  // Sort & Filter Elements
  const sortToggleBtn = document.getElementById('sortToggleBtn');
  const sortLabel = document.getElementById('sortLabel');
  const dateChips = document.querySelectorAll('.date-chip');

  // Initialize UI state from saved preferences
  applyViewModeUI();
  applySortUI();
  applyDateFilterUI();

  function saveState() {
    vscode.setState({
      currentViewMode,
      sortOrder,
      currentDateFilter,
      expandedDirs: Array.from(expandedDirs)
    });
  }

  function applyViewModeUI() {
    if (currentViewMode === 'all') {
      tabAll.classList.add('active');
      tabByDir.classList.remove('active');
    } else {
      tabAll.classList.remove('active');
      tabByDir.classList.add('active');
    }
  }

  function applySortUI() {
    if (sortOrder === 'newest') {
      sortLabel.textContent = 'Newest First';
      sortToggleBtn.classList.remove('asc');
    } else {
      sortLabel.textContent = 'Oldest First';
      sortToggleBtn.classList.add('asc');
    }
  }

  function applyDateFilterUI() {
    dateChips.forEach(chip => {
      if (chip.dataset.date === currentDateFilter) {
        chip.classList.add('active');
      } else {
        chip.classList.remove('active');
      }
    });
  }

  // Handle messages from Extension Host
  window.addEventListener('message', event => {
    const message = event.data;
    switch (message.type) {
      case 'updateConversations':
        allConversations = message.list || [];
        currentWsUri = message.currentWsUri || '';
        render();
        break;
      case 'syncFinished':
        if (message.success) {
          totalBadge.style.background = 'rgba(56, 193, 114, 0.2)';
          setTimeout(() => {
            totalBadge.style.background = '';
          }, 1500);
        }
        break;
    }
  });

  // Request initial data
  vscode.postMessage({ command: 'ready' });

  // Tab switching
  tabAll.addEventListener('click', () => {
    if (currentViewMode !== 'all') {
      currentViewMode = 'all';
      applyViewModeUI();
      saveState();
      render();
    }
  });

  tabByDir.addEventListener('click', () => {
    if (currentViewMode !== 'by-dir') {
      currentViewMode = 'by-dir';
      applyViewModeUI();
      saveState();
      render();
    }
  });

  // Sort Toggle
  sortToggleBtn.addEventListener('click', () => {
    sortOrder = sortOrder === 'newest' ? 'oldest' : 'newest';
    applySortUI();
    saveState();
    render();
  });

  // Date Filter Chips
  dateChips.forEach(chip => {
    chip.addEventListener('click', () => {
      dateChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentDateFilter = chip.dataset.date;
      saveState();
      render();
    });
  });

  // Refresh & Sync Buttons
  refreshBtn.addEventListener('click', () => {
    refreshBtn.style.transform = 'rotate(180deg)';
    setTimeout(() => { refreshBtn.style.transform = ''; }, 300);
    vscode.postMessage({ command: 'refresh' });
  });

  syncBtn.addEventListener('click', () => {
    vscode.postMessage({ command: 'syncState' });
  });

  // Search logic
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim().toLowerCase();
    clearSearchBtn.style.display = searchQuery ? 'block' : 'none';
    render();
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    clearSearchBtn.style.display = 'none';
    searchInput.focus();
    render();
  });

  // Close context menu on window click
  window.addEventListener('click', () => {
    contextMenu.style.display = 'none';
  });

  // Context Menu actions
  document.getElementById('menuOpenCurrent').addEventListener('click', (e) => {
    e.stopPropagation();
    contextMenu.style.display = 'none';
    if (activeContextMenuCid) {
      vscode.postMessage({ command: 'openConversationCurrentWindow', cid: activeContextMenuCid });
    }
  });

  document.getElementById('menuOpenTarget').addEventListener('click', (e) => {
    e.stopPropagation();
    contextMenu.style.display = 'none';
    if (activeContextMenuCid) {
      const conv = allConversations.find(c => c.cid === activeContextMenuCid);
      vscode.postMessage({ command: 'openConversationWorkspace', cid: activeContextMenuCid, wsPath: conv?.wsPath });
    }
  });

  document.getElementById('menuRename').addEventListener('click', (e) => {
    e.stopPropagation();
    contextMenu.style.display = 'none';
    if (activeContextMenuCid) {
      vscode.postMessage({ command: 'renameConversationPrompt', cid: activeContextMenuCid });
    }
  });

  document.getElementById('menuOpenLogs').addEventListener('click', (e) => {
    e.stopPropagation();
    contextMenu.style.display = 'none';
    if (activeContextMenuCid) {
      vscode.postMessage({ command: 'openLogs', cid: activeContextMenuCid });
    }
  });

  document.getElementById('menuCopyId').addEventListener('click', (e) => {
    e.stopPropagation();
    contextMenu.style.display = 'none';
    if (activeContextMenuCid) {
      vscode.postMessage({ command: 'copyId', cid: activeContextMenuCid });
    }
  });

  document.getElementById('menuDelete').addEventListener('click', (e) => {
    e.stopPropagation();
    contextMenu.style.display = 'none';
    if (activeContextMenuCid) {
      const conv = allConversations.find(c => c.cid === activeContextMenuCid);
      vscode.postMessage({ command: 'deleteConversation', cid: activeContextMenuCid, title: conv?.title || '' });
    }
  });

  // Tooltip functions
  function showHoverTooltip(conv, rect) {
    if (editingCid === conv.cid) return;
    if (!hoverTooltip) return;

    tooltipTitle.textContent = conv.title || 'Untitled Chat';
    tooltipLastPrompt.textContent = conv.lastPrompt || conv.firstPrompt || '[No prompt recorded]';
    tooltipWs.textContent = conv.wsName || 'Global';
    tooltipDate.textContent = conv.dateStr || '';

    hoverTooltip.classList.add('visible');

    const ttWidth = hoverTooltip.offsetWidth || 300;
    const ttHeight = hoverTooltip.offsetHeight || 140;

    let left = rect.right + 12;
    let top = rect.top;

    if (left + ttWidth > window.innerWidth - 10) {
      left = Math.max(10, rect.left - ttWidth - 12);
      if (left < 10) {
        left = Math.max(10, Math.min(rect.left, window.innerWidth - ttWidth - 10));
        top = rect.bottom + 8;
      }
    }

    if (top + ttHeight > window.innerHeight - 10) {
      top = Math.max(10, window.innerHeight - ttHeight - 10);
    }

    hoverTooltip.style.left = `${left}px`;
    hoverTooltip.style.top = `${top}px`;
  }

  function hideHoverTooltip() {
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
    if (hoverTooltip) {
      hoverTooltip.classList.remove('visible');
    }
  }

  convContainer.addEventListener('scroll', () => {
    hideHoverTooltip();
  });

  function isSameWorkspace(convWs, currentWs) {
    if (!convWs || !currentWs) return false;
    const norm = (s) => s.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
    return norm(convWs) === norm(currentWs);
  }

  function filterAndSortItems() {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const sevenDays = 7 * oneDay;
    const thirtyDays = 30 * oneDay;

    let items = allConversations.filter(item => {
      // 1. Text Search Filter
      if (searchQuery) {
        const titleMatch = (item.title || '').toLowerCase().includes(searchQuery);
        const promptMatch = (item.lastPrompt || '').toLowerCase().includes(searchQuery) ||
                            (item.firstPrompt || '').toLowerCase().includes(searchQuery);
        const folderMatch = (item.wsName || '').toLowerCase().includes(searchQuery) || (item.wsPath || '').toLowerCase().includes(searchQuery);
        const idMatch = (item.cid || '').toLowerCase().includes(searchQuery);
        if (!titleMatch && !promptMatch && !folderMatch && !idMatch) {
          return false;
        }
      }

      // 2. Date Filter
      if (currentDateFilter === 'today') {
        if ((now - item.timestampMs) >= oneDay) return false;
      } else if (currentDateFilter === '7d') {
        if ((now - item.timestampMs) >= sevenDays) return false;
      } else if (currentDateFilter === '30d') {
        if ((now - item.timestampMs) >= thirtyDays) return false;
      }

      return true;
    });

    // 3. Sorting
    items.sort((a, b) => {
      if (sortOrder === 'newest') {
        return b.mtime - a.mtime;
      } else {
        return a.mtime - b.mtime;
      }
    });

    return items;
  }

  function getUniqueDirectoryCount() {
    const set = new Set();
    allConversations.forEach(c => {
      set.add(c.wsPath || 'global');
    });
    return set.size;
  }

  function render() {
    hideHoverTooltip();
    totalBadge.textContent = allConversations.length;
    dirCountPill.textContent = getUniqueDirectoryCount();

    const filtered = filterAndSortItems();
    showingCountText.textContent = `Showing ${filtered.length} of ${allConversations.length}`;

    if (filtered.length === 0) {
      convContainer.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
          <h3>No Conversations Found</h3>
          <p>${searchQuery ? 'Try clearing or changing your search terms.' : 'No conversations recorded for this filter.'}</p>
        </div>
      `;
      return;
    }

    convContainer.innerHTML = '';

    if (currentViewMode === 'all') {
      renderAllChats(filtered);
    } else {
      renderByDirectory(filtered);
    }
  }

  function renderAllChats(conversations) {
    const fragment = document.createDocumentFragment();
    conversations.forEach(conv => {
      const card = createConversationCard(conv, true);
      fragment.appendChild(card);
    });
    convContainer.appendChild(fragment);
  }

  function renderByDirectory(conversations) {
    const groups = new Map();
    conversations.forEach(conv => {
      const dirKey = conv.wsPath || 'global';
      if (!groups.has(dirKey)) {
        groups.set(dirKey, {
          key: dirKey,
          name: conv.wsName || 'Global (No Folder)',
          path: conv.wsPath || '',
          isCurrent: isSameWorkspace(conv.wsPath, currentWsUri),
          items: []
        });
      }
      groups.get(dirKey).items.push(conv);
    });

    const groupList = Array.from(groups.values());
    groupList.sort((a, b) => {
      if (a.isCurrent && !b.isCurrent) return -1;
      if (!a.isCurrent && b.isCurrent) return 1;
      return b.items.length - a.items.length;
    });

    const fragment = document.createDocumentFragment();

    groupList.forEach(group => {
      const groupEl = document.createElement('div');
      const isExpanded = expandedDirs.has(group.key);
      groupEl.className = `dir-group ${isExpanded ? 'expanded' : ''} ${group.isCurrent ? 'is-active-ws' : ''}`;
      groupEl.dataset.dirKey = group.key;

      groupEl.innerHTML = `
        <div class="dir-header" title="${escapeHtml(group.path || group.name)} (Click to toggle)">
          <div class="dir-title-area">
            <svg class="dir-folder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
            <div class="dir-info">
              <div class="dir-name-row">
                <span class="dir-name">${escapeHtml(group.name)}</span>
                ${group.isCurrent ? '<span class="dir-active-pill">Active</span>' : ''}
              </div>
              ${group.path ? `<span class="dir-path">${escapeHtml(cleanDisplayPath(group.path))}</span>` : ''}
            </div>
          </div>
          <div class="dir-meta-right">
            <span class="dir-badge" title="${group.items.length} conversation(s) in this directory">${group.items.length}</span>
            <svg class="dir-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </div>
        </div>
        <div class="dir-content"></div>
      `;

      const headerEl = groupEl.querySelector('.dir-header');
      const contentEl = groupEl.querySelector('.dir-content');

      headerEl.addEventListener('click', () => {
        const currentlyExpanded = groupEl.classList.contains('expanded');
        if (currentlyExpanded) {
          groupEl.classList.remove('expanded');
          expandedDirs.delete(group.key);
        } else {
          groupEl.classList.add('expanded');
          expandedDirs.add(group.key);
        }
        saveState();
      });

      group.items.forEach(conv => {
        const card = createConversationCard(conv, false);
        contentEl.appendChild(card);
      });

      fragment.appendChild(groupEl);
    });

    convContainer.appendChild(fragment);
  }

  function startInlineEdit(card, conv) {
    hideHoverTooltip();
    editingCid = conv.cid;
    const titleGroup = card.querySelector('.card-title-group');
    if (!titleGroup) return;

    titleGroup.innerHTML = `
      <div class="title-edit-container">
        <input type="text" class="title-edit-input" value="${escapeHtml(conv.title)}" placeholder="Enter custom title..." />
        <button class="title-edit-btn save" title="Save Title (Enter)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </button>
        <button class="title-edit-btn cancel" title="Cancel (Esc)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
    `;

    const input = titleGroup.querySelector('.title-edit-input');
    const saveBtn = titleGroup.querySelector('.title-edit-btn.save');
    const cancelBtn = titleGroup.querySelector('.title-edit-btn.cancel');

    input.focus();
    input.select();

    const doSave = () => {
      const newTitle = input.value.trim();
      editingCid = null;
      vscode.postMessage({
        command: 'renameConversation',
        cid: conv.cid,
        newTitle: newTitle
      });
      conv.title = newTitle || conv.autoTitle || conv.title;
      conv.isCustomTitle = !!newTitle;
      render();
    };

    const doCancel = () => {
      editingCid = null;
      render();
    };

    saveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      doSave();
    });

    cancelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      doCancel();
    });

    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        doSave();
      } else if (e.key === 'Escape') {
        doCancel();
      }
    });

    input.addEventListener('click', (e) => e.stopPropagation());
  }

  function createConversationCard(conv, showDirectory) {
    const isCurrent = isSameWorkspace(conv.wsPath, currentWsUri);
    const card = document.createElement('div');
    card.className = `conv-card ${isCurrent ? 'active-workspace' : ''}`;
    card.dataset.cid = conv.cid;

    // Build accessible title attribute for fallback
    const tooltipText = `Title: ${conv.title}\nLast Prompt: ${conv.lastPrompt || conv.firstPrompt || '[None]'}\nDirectory: ${conv.wsName}\nTime: ${conv.dateStr}`;
    card.title = tooltipText;

    card.innerHTML = `
      <div class="card-top">
        <div class="card-title-group">
          <div class="card-title">
            <span class="title-text">${escapeHtml(conv.title)}</span>
            ${conv.isCustomTitle ? '<span class="custom-title-badge" title="Manually edited title">Edited</span>' : ''}
            ${isCurrent ? '<span class="current-ws-badge" title="Created in current open workspace">Current</span>' : ''}
          </div>
        </div>
      </div>

      <div class="card-meta-line">
        ${showDirectory ? `
          <div class="card-ws" title="${escapeHtml(conv.wsPath || 'Global (No Workspace)')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
            <span>${escapeHtml(conv.wsName)}</span>
          </div>
        ` : `<div></div>`}
        <div class="card-time" title="${escapeHtml(conv.dateStr)}">
          ${escapeHtml(conv.relativeTime)}
        </div>
      </div>

      <div class="card-stats-line">
        <div class="steps-badge" title="${conv.stepCount} total steps executed">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
          </svg>
          <span>${conv.stepCount} steps</span>
        </div>

        <div class="card-actions">
          <button class="card-btn" title="Rename Title (Double click title also works)" data-action="rename">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button class="card-btn delete-btn" title="Delete Conversation" data-action="delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
          <button class="card-btn" title="More Options" data-action="menu">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="1"></circle>
              <circle cx="19" cy="12" r="1"></circle>
              <circle cx="5" cy="12" r="1"></circle>
            </svg>
          </button>
        </div>
      </div>
    `;

    // Click card to open conversation
    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-action]') || e.target.closest('.title-edit-container')) return;
      vscode.postMessage({
        command: 'openConversation',
        cid: conv.cid,
        wsPath: conv.wsPath,
        title: conv.title
      });
    });

    // Double-click title to inline edit
    const titleEl = card.querySelector('.card-title');
    if (titleEl) {
      titleEl.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        startInlineEdit(card, conv);
      });
    }

    // Hover tooltip events
    card.addEventListener('mouseenter', () => {
      if (hoverTimer) clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => {
        const rect = card.getBoundingClientRect();
        showHoverTooltip(conv, rect);
      }, 200);
    });

    card.addEventListener('mouseleave', () => {
      hideHoverTooltip();
    });

    // Right click context menu
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      hideHoverTooltip();
      openContextMenu(e.clientX, e.clientY, conv.cid);
    });

    // Rename button action
    const renameBtn = card.querySelector('[data-action="rename"]');
    if (renameBtn) {
      renameBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        startInlineEdit(card, conv);
      });
    }

    // Delete button action
    const delBtn = card.querySelector('[data-action="delete"]');
    if (delBtn) {
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        hideHoverTooltip();
        vscode.postMessage({
          command: 'deleteConversation',
          cid: conv.cid,
          title: conv.title
        });
      });
    }

    // More menu button action
    const menuBtn = card.querySelector('[data-action="menu"]');
    if (menuBtn) {
      menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        hideHoverTooltip();
        const rect = menuBtn.getBoundingClientRect();
        openContextMenu(rect.right - 175, rect.bottom + 4, conv.cid);
      });
    }

    return card;
  }

  function openContextMenu(x, y, cid) {
    activeContextMenuCid = cid;
    contextMenu.style.display = 'flex';
    const menuWidth = 175;
    const menuHeight = 220;
    const maxX = Math.max(8, window.innerWidth - menuWidth - 8);
    const maxY = Math.max(8, window.innerHeight - menuHeight - 8);
    const safeLeft = Math.max(8, Math.min(x, maxX));
    const safeTop = Math.max(8, Math.min(y, maxY));
    contextMenu.style.left = `${safeLeft}px`;
    contextMenu.style.top = `${safeTop}px`;
  }

  function cleanDisplayPath(p) {
    if (!p) return '';
    try {
      let clean = p.replace(/file:\/\/\//i, '').replace(/file:\/\//i, '');
      return decodeURIComponent(clean).replace(/\//g, '\\');
    } catch {
      return p;
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
})();
