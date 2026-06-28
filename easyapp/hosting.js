const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PROJECTS_ROOT = 'C:\\Projects';
const MAX_LOG_LINES = 200;

const runningProcesses = new Map();

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function detectProjectCommands(projectPath) {
  const commands = [];

  if (fs.existsSync(path.join(projectPath, 'index.html'))) {
    commands.push({ id: 'static', label: 'host static', type: 'static', cmd: null, args: null });
  }

  const pkgPath = path.join(projectPath, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = readJsonSafe(pkgPath);
    if (pkg && pkg.scripts) {
      const scriptOrder = ['dev', 'start', 'preview', 'serve', 'build'];
      scriptOrder.forEach(script => {
        if (pkg.scripts[script]) {
          commands.push({
            id: `npm-${script}`,
            label: `npm run ${script}`,
            type: 'node',
            cmd: process.platform === 'win32' ? 'cmd.exe' : 'npm',
            args: process.platform === 'win32' ? ['/c', 'npm', 'run', script] : ['run', script],
          });
        }
      });
    }
  }

  const pyFiles = ['app.py', 'main.py', 'server.py', 'manage.py'];
  pyFiles.forEach(file => {
    if (fs.existsSync(path.join(projectPath, file))) {
      commands.push({
        id: `py-${file}`,
        label: file === 'manage.py' ? `python ${file} runserver` : `python ${file}`,
        type: 'python',
        cmd: process.platform === 'win32' ? 'python' : 'python3',
        args: file === 'manage.py' ? [file, 'runserver'] : [file],
      });
    }
  });

  return commands;
}

function detectProjectType(projectPath) {
  if (fs.existsSync(path.join(projectPath, 'package.json'))) {
    const pkg = readJsonSafe(path.join(projectPath, 'package.json'));
    if (pkg && pkg.scripts) {
      if (pkg.scripts.dev) return 'node-dev';
      if (pkg.scripts.start) return 'node-start';
      if (pkg.scripts.build) return 'node-build';
    }
    return 'node';
  }
  if (fs.existsSync(path.join(projectPath, 'index.html'))) return 'static';
  if (['app.py', 'main.py', 'server.py', 'manage.py', 'requirements.txt'].some(f => fs.existsSync(path.join(projectPath, f)))) {
    return 'python';
  }
  return 'folder';
}

function scanProjects() {
  try {
    const entries = fs.readdirSync(PROJECTS_ROOT, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules')
      .map(entry => {
        const fullPath = path.join(PROJECTS_ROOT, entry.name);
        return {
          name: entry.name,
          path: fullPath,
          type: detectProjectType(fullPath),
          commands: detectProjectCommands(fullPath),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    console.error('Failed to scan projects:', err);
    return [];
  }
}

function extractPortFromOutput(output) {
  const patterns = [
    /Local:\s+(http:\/\/localhost:(\d+))/i,
    /(?:running|ready|listening)\s+(?:on\s+)?http:\/\/localhost:(\d+)/i,
    /(?:running|ready|listening)\s+(?:on\s+)?http:\/\/127\.0\.0\.1:(\d+)/i,
    /http:\/\/localhost:(\d+)/i,
    /http:\/\/127\.0\.0\.1:(\d+)/i,
    /(?:listening on|port[:\s]+)(\d{4,5})/i,
  ];

  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match) {
      const port = match[2] || match[1];
      if (/^\d+$/.test(port)) return parseInt(port, 10);
      const portMatch = port.match(/:(\d+)$/);
      if (portMatch) return parseInt(portMatch[1], 10);
    }
  }
  return null;
}

function addLog(projectPath, type, message) {
  const proc = runningProcesses.get(projectPath);
  if (!proc) return;
  proc.logs.push({ type, message: message.trimEnd(), time: new Date().toISOString() });
  if (proc.logs.length > MAX_LOG_LINES) proc.logs.shift();

  const port = extractPortFromOutput(proc.logs.map(l => l.message).join('\n'));
  if (port && proc.port !== port) {
    proc.port = port;
    proc.url = `http://localhost:${port}`;
  }
}

function startProcess(projectPath, commandId) {
  return new Promise((resolve, reject) => {
    if (runningProcesses.has(projectPath)) {
      return reject(new Error('Project is already running. Stop it first.'));
    }

    const project = scanProjects().find(p => p.path === projectPath);
    if (!project) return reject(new Error('Project not found'));

    const command = project.commands.find(c => c.id === commandId);
    if (!command) return reject(new Error('Command not found'));

    if (command.type === 'static') {
      startStaticServer(projectPath).then(resolve).catch(reject);
      return;
    }

    const env = { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' };
    const child = spawn(command.cmd, command.args, {
      cwd: projectPath,
      env,
      shell: false,
      detached: false,
    });

    const procInfo = {
      process: child,
      commandId,
      commandLabel: command.label,
      logs: [],
      port: null,
      url: null,
      status: 'starting',
      pid: child.pid,
    };
    runningProcesses.set(projectPath, procInfo);

    child.stdout.on('data', (data) => addLog(projectPath, 'stdout', data.toString()));
    child.stderr.on('data', (data) => addLog(projectPath, 'stderr', data.toString()));

    child.on('error', (err) => {
      addLog(projectPath, 'stderr', `Process error: ${err.message}`);
      procInfo.status = 'error';
    });

    child.on('exit', (code) => {
      addLog(projectPath, 'stderr', `Process exited with code ${code}`);
      const info = runningProcesses.get(projectPath);
      if (info) {
        info.status = code === 0 ? 'stopped' : 'crashed';
        setTimeout(() => runningProcesses.delete(projectPath), 3000);
      }
    });

    setTimeout(() => {
      const info = runningProcesses.get(projectPath);
      if (info && info.status === 'starting') {
        info.status = 'running';
      }
      resolve({ success: true, pid: child.pid, commandId });
    }, 500);
  });
}

function stopProcess(projectPath) {
  return new Promise((resolve) => {
    const proc = runningProcesses.get(projectPath);
    if (!proc) return resolve({ success: false, error: 'Not running' });

    proc.status = 'stopping';

    if (proc.server) {
      proc.server.close(() => {
        runningProcesses.delete(projectPath);
        resolve({ success: true });
      });
    } else if (proc.process) {
      const killed = proc.process.kill('SIGTERM');
      if (!killed) proc.process.kill('SIGKILL');
      runningProcesses.delete(projectPath);
      resolve({ success: true });
    } else {
      runningProcesses.delete(projectPath);
      resolve({ success: true });
    }
  });
}

function getProcessStatus(projectPath) {
  const proc = runningProcesses.get(projectPath);
  if (!proc) return null;
  return {
    status: proc.status,
    commandId: proc.commandId,
    commandLabel: proc.commandLabel,
    port: proc.port,
    url: proc.url,
    pid: proc.pid,
  };
}

function getProcessLogs(projectPath, since = 0) {
  const proc = runningProcesses.get(projectPath);
  if (!proc) return [];
  return proc.logs.slice(since);
}

function getAllStatuses() {
  const result = {};
  for (const [projectPath, proc] of runningProcesses) {
    result[projectPath] = {
      status: proc.status,
      commandId: proc.commandId,
      commandLabel: proc.commandLabel,
      port: proc.port,
      url: proc.url,
      pid: proc.pid,
    };
  }
  return result;
}

function stopAllProcesses() {
  for (const [projectPath] of runningProcesses) {
    stopProcess(projectPath);
  }
}

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

let nextStaticPort = 4000;

function startStaticServer(projectPath) {
  return new Promise((resolve, reject) => {
    const http = require('http');
    const port = nextStaticPort++;

    const server = http.createServer((req, res) => {
      let filePath = path.join(projectPath, decodeURIComponent(req.url));
      if (filePath.endsWith(path.sep)) filePath += 'index.html';

      if (!filePath.startsWith(projectPath)) {
        res.writeHead(403);
        return res.end('Forbidden');
      }

      fs.readFile(filePath, (err, content) => {
        if (err) {
          if (err.code === 'ENOENT') {
            const indexFile = path.join(projectPath, 'index.html');
            if (fs.existsSync(indexFile)) {
              fs.readFile(indexFile, (e, c) => {
                if (e) {
                  res.writeHead(404);
                  res.end('Not found');
                } else {
                  res.writeHead(200, { 'Content-Type': 'text/html' });
                  res.end(c, 'utf-8');
                }
              });
            } else {
              res.writeHead(404);
              res.end('Not found');
            }
          } else {
            res.writeHead(500);
            res.end('Server error');
          }
          return;
        }

        const ext = String(path.extname(filePath)).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
        res.end(content, 'utf-8');
      });
    });

    server.listen(port, () => {
      const url = `http://localhost:${port}`;
      runningProcesses.set(projectPath, {
        server,
        commandId: 'static',
        commandLabel: 'host static',
        logs: [{ type: 'stdout', message: `Static server running at ${url}`, time: new Date().toISOString() }],
        port,
        url,
        status: 'running',
        pid: process.pid,
      });
      resolve({ success: true, port, url, commandId: 'static' });
    });

    server.on('error', reject);
  });
}

module.exports = {
  scanProjects,
  detectProjectCommands,
  startProcess,
  stopProcess,
  getProcessStatus,
  getProcessLogs,
  getAllStatuses,
  stopAllProcesses,
};
