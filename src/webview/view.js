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
        const promptMatch = (item.firstPrompt || '').toLowerCase().includes(searchQuery);
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
    // Group conversations by directory
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

    // Sort directory groups: active workspace first, then by count / latest
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

      // Directory Header Click: Expand / Collapse
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

      // Populate chats inside directory
      group.items.forEach(conv => {
        const card = createConversationCard(conv, false);
        contentEl.appendChild(card);
      });

      fragment.appendChild(groupEl);
    });

    convContainer.appendChild(fragment);
  }

  function createConversationCard(conv, showDirectory) {
    const isCurrent = isSameWorkspace(conv.wsPath, currentWsUri);
    const card = document.createElement('div');
    card.className = `conv-card ${isCurrent ? 'active-workspace' : ''}`;
    card.dataset.cid = conv.cid;

    card.innerHTML = `
      <div class="card-top">
        <div class="card-title-group">
          <div class="card-title" title="${escapeHtml(conv.title)}">
            <span>${escapeHtml(conv.title)}</span>
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
      if (e.target.closest('[data-action]')) return;
      vscode.postMessage({
        command: 'openConversation',
        cid: conv.cid,
        wsPath: conv.wsPath,
        title: conv.title
      });
    });

    // Right click context menu
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openContextMenu(e.clientX, e.clientY, conv.cid);
    });

    // Actions inside card
    const delBtn = card.querySelector('[data-action="delete"]');
    if (delBtn) {
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        vscode.postMessage({
          command: 'deleteConversation',
          cid: conv.cid,
          title: conv.title
        });
      });
    }

    const menuBtn = card.querySelector('[data-action="menu"]');
    if (menuBtn) {
      menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const rect = menuBtn.getBoundingClientRect();
        openContextMenu(rect.left - 120, rect.bottom + 4, conv.cid);
      });
    }

    return card;
  }

  function openContextMenu(x, y, cid) {
    activeContextMenuCid = cid;
    contextMenu.style.display = 'flex';
    const menuWidth = 190;
    const menuHeight = 170;
    const maxX = window.innerWidth - menuWidth - 8;
    const maxY = window.innerHeight - menuHeight - 8;
    contextMenu.style.left = `${Math.min(x, maxX)}px`;
    contextMenu.style.top = `${Math.min(y, maxY)}px`;
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
