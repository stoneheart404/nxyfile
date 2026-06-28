const http = require('http');
const fs = require('fs');
const path = require('path');
const hosting = require('./hosting');

const DASHBOARD_PORT = 3000;

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

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function jsonResponse(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function serveStatic(filePath, res) {
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = String(path.extname(filePath)).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(content, 'utf-8');
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${DASHBOARD_PORT}`);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  if (url.pathname === '/api/projects') {
    const projects = hosting.scanProjects();
    const statuses = hosting.getAllStatuses();
    return jsonResponse(res, projects.map(p => ({ ...p, status: statuses[p.path] || null })));
  }

  if (url.pathname === '/api/start' && req.method === 'POST') {
    const data = await readBody(req);
    try {
      await hosting.startProcess(data.path, data.commandId);
      return jsonResponse(res, { success: true, status: hosting.getProcessStatus(data.path) });
    } catch (err) {
      return jsonResponse(res, { success: false, error: err.message }, 500);
    }
  }

  if (url.pathname === '/api/stop' && req.method === 'POST') {
    const data = await readBody(req);
    try {
      await hosting.stopProcess(data.path);
      return jsonResponse(res, { success: true });
    } catch (err) {
      return jsonResponse(res, { success: false, error: err.message }, 500);
    }
  }

  if (url.pathname === '/api/status' && req.method === 'GET') {
    const projectPath = url.searchParams.get('path');
    return jsonResponse(res, { status: hosting.getProcessStatus(projectPath) });
  }

  if (url.pathname === '/api/logs' && req.method === 'GET') {
    const projectPath = url.searchParams.get('path');
    const since = parseInt(url.searchParams.get('since') || '0', 10);
    return jsonResponse(res, { logs: hosting.getProcessLogs(projectPath, since) });
  }

  let filePath = path.join(__dirname, decodeURIComponent(url.pathname));
  if (url.pathname === '/') filePath = path.join(__dirname, 'index.html');

  serveStatic(filePath, res);
});

server.listen(DASHBOARD_PORT, () => {
  console.log(`EasyApp dashboard running at http://localhost:${DASHBOARD_PORT}`);
  console.log('Press Ctrl+C to stop.');
});

process.on('SIGINT', () => {
  hosting.stopAllProcesses();
  server.close(() => process.exit(0));
});
