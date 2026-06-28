document.addEventListener('DOMContentLoaded', () => {
  const projectsList = document.getElementById('projects-list');
  const searchInput = document.getElementById('search');
  const refreshBtn = document.getElementById('refresh-btn');
  const modeBadge = document.getElementById('mode-badge');

  const isElectron = typeof window.electronAPI !== 'undefined';
  modeBadge.textContent = isElectron ? 'desktop' : 'web';

  let allProjects = [];
  const logIndices = {};
  const statusIntervals = {};

  async function apiGetProjects() {
    if (isElectron) return window.electronAPI.getProjects();
    const res = await fetch('/api/projects');
    return res.json();
  }

  async function apiStart(projectPath, commandId) {
    if (isElectron) return window.electronAPI.startProcess(projectPath, commandId);
    const res = await fetch('/api/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: projectPath, commandId }),
    });
    return res.json();
  }

  async function apiStop(projectPath) {
    if (isElectron) return window.electronAPI.stopProcess(projectPath);
    const res = await fetch('/api/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: projectPath }),
    });
    return res.json();
  }

  async function apiGetStatus(projectPath) {
    if (isElectron) return window.electronAPI.getStatus(projectPath);
    const res = await fetch(`/api/status?path=${encodeURIComponent(projectPath)}`);
    return (await res.json()).status;
  }

  async function apiGetLogs(projectPath, since) {
    if (isElectron) return window.electronAPI.getLogs(projectPath, since);
    const res = await fetch(`/api/logs?path=${encodeURIComponent(projectPath)}&since=${since}`);
    return (await res.json()).logs;
  }

  function openBrowser(url) {
    if (isElectron) window.electronAPI.openBrowser(url);
    else window.open(url, '_blank');
  }

  function openFolder(folderPath) {
    if (isElectron) window.electronAPI.openFolder(folderPath);
    else alert('Open folder is only available in desktop mode.');
  }

  function getTypeLabel(type) {
    const labels = {
      static: 'static',
      node: 'node',
      'node-dev': 'node',
      'node-start': 'node',
      'node-build': 'node',
      python: 'python',
      folder: 'folder',
    };
    return labels[type] || type;
  }

  function getStatusBadge(status) {
    if (!status) return '<span class="status-badge idle">idle</span>';
    let html = `<span class="status-badge ${status.status}">${status.status}</span>`;
    if (status.url) {
      html += ` <a href="${status.url}" target="_blank" class="url-link">${status.url}</a>`;
    }
    return html;
  }

  function renderProjects(projects) {
    allProjects = projects;
    const filter = searchInput.value.trim().toLowerCase();
    const filtered = projects.filter(p => p.name.toLowerCase().includes(filter));

    if (filtered.length === 0) {
      projectsList.innerHTML = '<p class="empty">no projects found.</p>';
      return;
    }

    const existing = {};
    document.querySelectorAll('.project-card').forEach(card => {
      existing[card.dataset.path] = card.querySelector('.log-output')?.innerHTML;
    });

    projectsList.innerHTML = '';
    filtered.forEach(project => {
      const status = project.status || {};
      const isRunning = ['starting', 'running'].includes(status.status);
      const hasCommands = project.commands && project.commands.length > 0;

      const card = document.createElement('div');
      card.className = 'project-card';
      card.dataset.path = project.path;

      let commandsHtml = '';
      if (hasCommands && !isRunning) {
        commandsHtml = `<div class="command-row">
          ${project.commands.map(cmd =>
            `<button class="btn small command-btn" data-cmd="${cmd.id}">${escapeHtml(cmd.label)}</button>`
          ).join('')}
        </div>`;
      }

      card.innerHTML = `
        <div class="project-info">
          <div class="project-header">
            <h3>${escapeHtml(project.name)}</h3>
            <span class="type-tag ${project.type}">${getTypeLabel(project.type)}</span>
          </div>
          <p class="path">${escapeHtml(project.path)}</p>
          <div class="status-row">${getStatusBadge(status)}</div>
          ${commandsHtml}
          <div class="log-output" id="logs-${escapeHtml(project.name)}">${existing[project.path] || ''}</div>
        </div>
        <div class="project-actions">
          ${isRunning
            ? `<button class="btn small danger stop-btn" data-path="${escapeHtml(project.path)}">stop</button>
               ${status.url ? `<button class="btn small primary open-btn" data-url="${status.url}">open</button>` : ''}`
            : `<button class="btn small secondary folder-btn" data-path="${escapeHtml(project.path)}">folder</button>`}
        </div>
      `;

      projectsList.appendChild(card);
    });

    attachHandlers();
    startPolling();
  }

  function attachHandlers() {
    document.querySelectorAll('.command-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const card = btn.closest('.project-card');
        const projectPath = card.dataset.path;
        const commandId = btn.dataset.cmd;

        disableButtons(card, true);
        clearLogs(projectPath);

        try {
          const result = await apiStart(projectPath, commandId);
          if (result.success) {
            startPollingProject(projectPath);
          } else {
            alert('Failed to start: ' + (result.error || 'Unknown error'));
            disableButtons(card, false);
          }
        } catch (err) {
          alert('Error starting: ' + err.message);
          disableButtons(card, false);
        }
      });
    });

    document.querySelectorAll('.stop-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const projectPath = btn.dataset.path;
        btn.disabled = true;
        btn.textContent = 'stopping...';
        try {
          await apiStop(projectPath);
          stopPollingProject(projectPath);
          await loadProjects();
        } catch (err) {
          alert('Error stopping: ' + err.message);
        }
      });
    });

    document.querySelectorAll('.open-btn').forEach(btn => {
      btn.addEventListener('click', () => openBrowser(btn.dataset.url));
    });

    document.querySelectorAll('.folder-btn').forEach(btn => {
      btn.addEventListener('click', () => openFolder(btn.dataset.path));
    });
  }

  function disableButtons(card, disabled) {
    card.querySelectorAll('button').forEach(btn => {
      btn.disabled = disabled;
    });
  }

  function clearLogs(projectPath) {
    logIndices[projectPath] = 0;
    const name = projectNameFromPath(projectPath);
    const el = document.getElementById(`logs-${name}`);
    if (el) el.innerHTML = '';
  }

  function projectNameFromPath(projectPath) {
    const project = allProjects.find(p => p.path === projectPath);
    return project ? project.name : pathFromPath(projectPath);
  }

  function pathFromPath(projectPath) {
    return projectPath.split(/[\\/]/).pop();
  }

  function appendLogs(projectPath, logs) {
    if (!logs || logs.length === 0) return;
    const name = projectNameFromPath(projectPath);
    const el = document.getElementById(`logs-${name}`);
    if (!el) return;

    logs.forEach(log => {
      const line = document.createElement('div');
      line.className = `log-line ${log.type}`;
      const time = new Date(log.time).toLocaleTimeString();
      line.textContent = `[${time}] ${log.message}`;
      el.appendChild(line);
      el.scrollTop = el.scrollHeight;
    });
    logIndices[projectPath] = (logIndices[projectPath] || 0) + logs.length;
  }

  function startPolling() {
    allProjects.forEach(p => {
      if (p.status && ['starting', 'running'].includes(p.status.status)) {
        startPollingProject(p.path);
      }
    });
  }

  function startPollingProject(projectPath) {
    if (statusIntervals[projectPath]) return;
    logIndices[projectPath] = logIndices[projectPath] || 0;

    statusIntervals[projectPath] = setInterval(async () => {
      try {
        const status = await apiGetStatus(projectPath);
        const logs = await apiGetLogs(projectPath, logIndices[projectPath] || 0);

        appendLogs(projectPath, logs);

        const project = allProjects.find(p => p.path === projectPath);
        if (project && JSON.stringify(project.status) !== JSON.stringify(status)) {
          project.status = status;
          renderProjects(allProjects);
        }

        if (!status || !['starting', 'running'].includes(status.status)) {
          stopPollingProject(projectPath);
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 1000);
  }

  function stopPollingProject(projectPath) {
    if (statusIntervals[projectPath]) {
      clearInterval(statusIntervals[projectPath]);
      delete statusIntervals[projectPath];
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  async function loadProjects() {
    projectsList.innerHTML = '<p class="loading">loading projects...</p>';
    try {
      const projects = await apiGetProjects();
      renderProjects(projects);
    } catch (err) {
      projectsList.innerHTML = `<p class="error">failed to load projects: ${escapeHtml(err.message)}</p>`;
    }
  }

  searchInput.addEventListener('input', () => renderProjects(allProjects));
  refreshBtn.addEventListener('click', loadProjects);

  loadProjects();
});
