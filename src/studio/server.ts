import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { StudioDB } from "./db.js";
import { generateApiBlueprint } from "./scanner.js";

export async function startStudioServer(projectPath: string, port: number = 4000): Promise<{ server: http.Server; port: number }> {
  const db = new StudioDB(projectPath);

  const getClientHtml = () => {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bandit Studio - Backend Developer Platform</title>
  <style>
    :root {
      --bg: #09090b;
      --card-bg: #141417;
      --card-hover: #1c1c21;
      --border: #27272a;
      --border-bright: #3f3f46;
      --text: #f4f4f5;
      --text-dim: #a1a1aa;
      --primary: #eab308;
      --primary-hover: #facc15;
      --primary-dim: rgba(234, 179, 8, 0.1);
      --success: #22c55e;
      --warning: #f59e0b;
      --danger: #ef4444;
      --accent-blue: #38bdf8;
      --accent-purple: #c084fc;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', -apple-system, sans-serif; }
    body { background-color: var(--bg); color: var(--text); display: flex; flex-direction: column; min-height: 100vh; }
    header { background: #000000; border-bottom: 1px solid var(--border); padding: 1rem 2rem; display: flex; justify-content: space-between; align-items: center; }
    .logo { font-size: 1.25rem; font-weight: 800; color: var(--primary); display: flex; align-items: center; gap: 0.6rem; letter-spacing: -0.02em; }
    .logo-badge { background: var(--primary); color: #000; font-size: 0.7rem; font-weight: 900; padding: 0.15rem 0.4rem; border-radius: 0.2rem; text-transform: uppercase; }
    nav { display: flex; gap: 0.5rem; background: #141417; padding: 0.3rem; border-radius: 0.5rem; border: 1px solid var(--border); }
    nav button { background: none; border: none; color: var(--text-dim); font-size: 0.875rem; font-weight: 600; padding: 0.5rem 1rem; cursor: pointer; border-radius: 0.375rem; transition: all 0.15s ease; }
    nav button.active { color: #000; background: var(--primary); font-weight: 700; }
    nav button:hover:not(.active) { color: var(--text); background: var(--card-hover); }
    main { flex: 1; padding: 2rem; max-width: 1280px; margin: 0 auto; width: 100%; }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
    .section-header { margin-bottom: 1.5rem; }
    .section-header h2 { font-size: 1.5rem; font-weight: 700; color: var(--text); letter-spacing: -0.02em; }
    .section-header p { color: var(--text-dim); font-size: 0.9rem; margin-top: 0.25rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.5rem; }
    .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 0.75rem; padding: 1.5rem; position: relative; overflow: hidden; }
    .card h3 { font-size: 1.05rem; font-weight: 700; margin-bottom: 1rem; color: var(--primary); display: flex; align-items: center; justify-content: space-between; }
    table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; text-align: left; }
    th, td { padding: 0.85rem 1rem; border-bottom: 1px solid var(--border); font-size: 0.875rem; }
    th { color: var(--text-dim); font-weight: 600; background: #09090b; }
    tr:hover td { background: var(--card-hover); }
    .badge { padding: 0.25rem 0.5rem; border-radius: 0.25rem; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; display: inline-block; }
    .badge-success { background: rgba(34, 197, 94, 0.15); color: var(--success); border: 1px solid rgba(34, 197, 94, 0.3); }
    .badge-warning { background: rgba(245, 158, 11, 0.15); color: var(--warning); border: 1px solid rgba(245, 158, 11, 0.3); }
    .badge-danger { background: rgba(239, 68, 68, 0.15); color: var(--danger); border: 1px solid rgba(239, 68, 68, 0.3); }
    .badge-yellow { background: var(--primary-dim); color: var(--primary); border: 1px solid rgba(234, 179, 8, 0.3); }
    
    /* Architecture Blueprint Flow Layout */
    .flow-container { display: flex; flex-direction: column; gap: 1.5rem; margin-top: 1rem; }
    .flow-row { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; background: #09090b; padding: 1.25rem; border-radius: 0.75rem; border: 1px solid var(--border); }
    .flow-step { background: var(--card-bg); border: 1px solid var(--border); padding: 0.85rem 1.1rem; border-radius: 0.5rem; font-size: 0.875rem; display: flex; flex-direction: column; gap: 0.25rem; min-width: 200px; }
    .flow-step.route { border-color: var(--primary); }
    .flow-step.controller { border-color: var(--accent-blue); }
    .flow-step.service { border-color: var(--accent-purple); }
    .flow-step.infra { border-color: var(--success); }
    .flow-arrow { color: var(--primary); font-weight: bold; font-size: 1.2rem; }
    .metric-tag { font-size: 0.75rem; background: var(--primary-dim); color: var(--primary); padding: 0.15rem 0.4rem; border-radius: 0.2rem; font-weight: 700; width: fit-content; margin-top: 0.2rem; }
    code { font-family: monospace; background: #000; padding: 0.15rem 0.35rem; border-radius: 0.2rem; font-size: 0.8rem; color: var(--primary); }
  </style>
</head>
<body>
  <header>
    <div class="logo">⚡ BANDIT <span class="logo-badge">STUDIO</span></div>
    <nav>
      <button class="active" onclick="showTab('performance', this)">📈 Performance Regressions</button>
      <button onclick="showTab('blueprint', this)">🗺️ Architecture Blueprint</button>
      <button onclick="showTab('audits', this)">🛡️ Security Inspector</button>
    </nav>
  </header>
  <main>
    <div id="performance" class="tab-content active">
      <div class="section-header">
        <h2>Performance & Regression History</h2>
        <p>Tracks benchmark latency and throughput linked with Git commits.</p>
      </div>
      <div class="card">
        <h3>Recorded Load Test Runs</h3>
        <div id="benchmarks-table-container">Loading metrics...</div>
      </div>
    </div>

    <div id="blueprint" class="tab-content">
      <div class="section-header">
        <h2>Backend Architecture Blueprint</h2>
        <p>Visual component dependency map tracing HTTP requests down to Controllers, Services, and Database layers.</p>
      </div>
      <div class="card">
        <h3>Request Execution Flow</h3>
        <div id="blueprint-container" class="flow-container">Loading architecture graph...</div>
      </div>
    </div>

    <div id="audits" class="tab-content">
      <div class="section-header">
        <h2>Security & Codebase Inspector</h2>
        <p>Active penetration test findings (SQLi, XSS, Header Security) and framework diagnostic reports.</p>
      </div>
      <div class="card">
        <h3>Active Penetration Test Results</h3>
        <div id="audits-container">Loading diagnostic findings...</div>
      </div>
    </div>
  </main>

  <script>
    function showTab(tabId, btn) {
      document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('nav button').forEach(el => el.classList.remove('active'));
      document.getElementById(tabId).classList.add('active');
      btn.classList.add('active');
    }

    async function loadData() {
      // Load Benchmarks
      try {
        const res = await fetch('/api/benchmarks');
        const data = await res.json();
        const container = document.getElementById('benchmarks-table-container');
        if (!data || data.length === 0) {
          container.innerHTML = '<p style="color: var(--text-dim); padding: 1rem 0;">No benchmark history recorded yet. Run <code>bandit bench &lt;url&gt;</code> in your terminal to log performance metrics.</p>';
        } else {
          let html = '<table><thead><tr><th>Timestamp</th><th>Commit</th><th>Target URL</th><th>Reqs / Conn</th><th>Throughput (RPS)</th><th>Avg Latency</th><th>p99 Tail Latency</th></tr></thead><tbody>';
          data.forEach(b => {
            html += \`<tr>
              <td>\${new Date(b.timestamp).toLocaleString()}</td>
              <td><code>\${b.gitCommit || 'HEAD'}</code></td>
              <td><strong>\${b.targetUrl}</strong></td>
              <td>\${b.requests} / \${b.connections}</td>
              <td style="color: var(--primary); font-weight: 700;">\${b.rps.toFixed(1)} req/s</td>
              <td>\${b.latency.avg.toFixed(1)} ms</td>
              <td style="color: \${b.latency.p99 > 200 ? 'var(--warning)' : 'var(--success)'}; font-weight: 600;">\${b.latency.p99.toFixed(1)} ms</td>
            </tr>\`;
          });
          html += '</tbody></table>';
          container.innerHTML = html;
        }
      } catch (err) { console.error(err); }

      // Load Blueprint Graph
      try {
        const res = await fetch('/api/blueprint');
        const graph = await res.json();
        const container = document.getElementById('blueprint-container');
        if (!graph.nodes || graph.nodes.length === 0) {
          container.innerHTML = '<p style="color: var(--text-dim); padding: 1rem 0;">No routes discovered in project.</p>';
        } else {
          const routeNodes = graph.nodes.filter(n => n.type === 'route');
          let html = '';
          
          if (routeNodes.length === 0) {
            html = '<p style="color: var(--text-dim);">No API endpoints found in source directory.</p>';
          } else {
            routeNodes.forEach(r => {
              const controllerEdge = graph.edges.find(e => e.from === r.id);
              const controllerNode = controllerEdge ? graph.nodes.find(n => n.id === controllerEdge.to) : null;
              const serviceEdge = controllerNode ? graph.edges.find(e => e.from === controllerNode.id) : null;
              const serviceNode = serviceEdge ? graph.nodes.find(n => n.id === serviceEdge.to) : null;

              html += \`<div class="flow-row">
                <div class="flow-step route">
                  <span class="badge badge-yellow">HTTP ENDPOINT</span>
                  <strong>\${r.label}</strong>
                  <span style="font-size:0.75rem; color:var(--text-dim)">\${r.details || ''}</span>
                  \${r.metrics ? \`<div class="metric-tag">\${r.metrics.rps.toFixed(0)} RPS | p99: \${r.metrics.p99.toFixed(0)}ms</div>\` : ''}
                </div>
                <div class="flow-arrow">➔</div>
                <div class="flow-step controller">
                  <span class="badge badge-yellow" style="color:var(--accent-blue); background:rgba(56,189,248,0.1); border-color:rgba(56,189,248,0.3)">CONTROLLER LAYER</span>
                  <strong>\${controllerNode ? controllerNode.label : 'Route Handler'}</strong>
                  <span style="font-size:0.75rem; color:var(--text-dim)">Delegates request validation</span>
                </div>
                <div class="flow-arrow">➔</div>
                <div class="flow-step service">
                  <span class="badge badge-yellow" style="color:var(--accent-purple); background:rgba(192,132,252,0.1); border-color:rgba(192,132,252,0.3)">SERVICE LAYER</span>
                  <strong>\${serviceNode ? serviceNode.label : 'Business Service'}</strong>
                  <span style="font-size:0.75rem; color:var(--text-dim)">ORM & Business logic</span>
                </div>
                <div class="flow-arrow">➔</div>
                <div class="flow-step infra">
                  <span class="badge badge-success">PERSISTENCE</span>
                  <strong>PostgreSQL / Redis</strong>
                  <span style="font-size:0.75rem; color:var(--text-dim)">Connection Pool</span>
                </div>
              </div>\`;
            });
          }
          container.innerHTML = html;
        }
      } catch (err) { console.error(err); }

      // Load Audits
      try {
        const res = await fetch('/api/audits');
        const audits = await res.json();
        const container = document.getElementById('audits-container');
        if (!audits || audits.length === 0 || !audits[0].items) {
          container.innerHTML = '<p style="color: var(--text-dim); padding: 1rem 0;">No active audits logged yet. Run <code>bandit doctor</code> in terminal to execute security probes.</p>';
        } else {
          let html = '<table><thead><tr><th>Status</th><th>Probe Title</th><th>Diagnostic Details</th><th>Remediation Suggestion</th></tr></thead><tbody>';
          audits[0].items.forEach(item => {
            const badgeClass = item.status === 'pass' ? 'badge-success' : item.status === 'warn' ? 'badge-warning' : 'badge-danger';
            html += \`<tr>
              <td><span class="badge \${badgeClass}">\${item.status}</span></td>
              <td><strong>\${item.title}</strong></td>
              <td>\${item.details || '-'}</td>
              <td style="color: var(--primary);">\${item.suggestion || 'No action needed'}</td>
            </tr>\`;
          });
          html += '</tbody></table>';
          container.innerHTML = html;
        }
      } catch (err) { console.error(err); }
    }

    loadData();
  </script>
</body>
</html>`;
  };

  const server = http.createServer(async (req, res) => {
    const url = req.url || "/";

    if (url === "/api/benchmarks" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(db.getBenchmarks()));
      return;
    }

    if (url === "/api/audits" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(db.getAudits()));
      return;
    }

    if (url === "/api/blueprint" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      const blueprint = await generateApiBlueprint(projectPath);
      res.end(JSON.stringify(blueprint));
      return;
    }

    if (url === "/api/config/dismiss" && req.method === "POST") {
      let body = "";
      req.on("data", chunk => { body += chunk; });
      req.on("end", () => {
        try {
          const { ruleTitle } = JSON.parse(body);
          const updated = db.dismissRule(ruleTitle);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(updated));
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid payload" }));
        }
      });
      return;
    }

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(getClientHtml());
  });

  return new Promise((resolve, reject) => {
    server.listen(port, () => {
      resolve({ server, port });
    });
    server.on("error", (err: any) => {
      if (err.code === "EADDRINUSE") {
        server.listen(port + 1, () => {
          resolve({ server, port: port + 1 });
        });
      } else {
        reject(err);
      }
    });
  });
}
