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
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');

    :root {
      --bg: #050507;
      --card-bg: #0c0c0e;
      --card-hover: #121215;
      --border: #1f1f23;
      --border-bright: #2f2f37;
      --text: #f4f4f5;
      --text-dim: #71717a;
      --primary: #eab308;
      --primary-hover: #facc15;
      --primary-dim: rgba(234, 179, 8, 0.08);
      --success: #22c55e;
      --success-dim: rgba(34, 197, 94, 0.08);
      --warning: #f59e0b;
      --warning-dim: rgba(245, 158, 11, 0.08);
      --danger: #ef4444;
      --danger-dim: rgba(239, 68, 68, 0.08);
      --accent: #a855f7;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', -apple-system, sans-serif; }
    body { background-color: var(--bg); color: var(--text); display: flex; flex-direction: column; min-height: 100vh; }
    header { background: #000000; border-bottom: 1px solid var(--border); padding: 0.8rem 2rem; display: flex; justify-content: space-between; align-items: center; }
    
    .logo-container { display: flex; align-items: center; gap: 0.65rem; }
    .logo-container img { height: 32px; width: auto; object-fit: contain; }
    .logo-text { font-size: 1.45rem; font-weight: 800; color: #ffffff; letter-spacing: -0.03em; }
    .logo-beta { font-size: 0.65rem; font-weight: 700; background: #131316; border: 1px solid var(--border); color: var(--text-dim); padding: 0.15rem 0.5rem; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.05em; margin-left: 0.1rem; }
    
    nav { display: flex; gap: 0.5rem; background: #0c0c0e; padding: 0.3rem; border-radius: 0.5rem; border: 1px solid var(--border); }
    nav button { background: none; border: none; color: var(--text-dim); font-size: 0.875rem; font-weight: 600; padding: 0.5rem 1rem; cursor: pointer; border-radius: 0.375rem; transition: all 0.15s ease; }
    nav button.active { color: #000000; background: var(--primary); font-weight: 700; }
    nav button:hover:not(.active) { color: var(--text); background: var(--card-hover); }
    
    main { flex: 1; padding: 2rem; max-width: 1280px; margin: 0 auto; width: 100%; }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
    
    .section-header { margin-bottom: 2rem; }
    .section-header h2 { font-size: 1.6rem; font-weight: 800; color: var(--text); letter-spacing: -0.02em; }
    .section-header p { color: var(--text-dim); font-size: 0.9rem; margin-top: 0.25rem; }
    
    .analytics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; margin-bottom: 2rem; }
    .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 0.75rem; padding: 1.5rem; transition: border-color 0.2s; }
    .card:hover { border-color: var(--border-bright); }
    .card h3 { font-size: 0.95rem; font-weight: 700; margin-bottom: 1.25rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.05em; }
    
    /* Progress Rings style */
    .rings-row { display: flex; justify-content: space-around; align-items: center; height: 100px; }
    .ring-container { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; }
    .ring-svg { transform: rotate(-90deg); }
    .ring-bg { fill: none; stroke: var(--border); stroke-width: 8; }
    .ring-bar { fill: none; stroke: var(--primary); stroke-width: 8; stroke-dasharray: 220; stroke-dashoffset: 220; transition: stroke-dashoffset 1s ease-out; stroke-linecap: round; }
    .ring-text { font-size: 0.85rem; font-weight: 800; color: var(--text); font-family: 'JetBrains Mono', monospace; }
    
    /* Exposure Bar */
    .exposure-box { display: flex; flex-direction: column; gap: 0.75rem; margin-top: 0.5rem; }
    .progress-bar-bg { height: 10px; background: var(--border); border-radius: 999px; overflow: hidden; display: flex; }
    .progress-bar-val { height: 100%; background: var(--primary); transition: width 0.8s ease-out; }
    
    /* Latency Radar (Slowest Endpoints Chart) */
    .radar-list { display: flex; flex-direction: column; gap: 0.75rem; }
    .radar-item { display: flex; flex-direction: column; gap: 0.25rem; }
    .radar-labels { display: flex; justify-content: space-between; font-size: 0.8rem; }
    .radar-labels span { font-family: 'JetBrains Mono', monospace; }
    .radar-bar-bg { height: 8px; background: var(--border); border-radius: 999px; overflow: hidden; }
    .radar-bar-val { height: 100%; background: var(--danger); border-radius: 999px; transition: width 0.8s ease-out; }
    
    /* Search Bar & Matrix Layout */
    .controls-row { display: flex; gap: 1rem; align-items: center; margin-bottom: 1.25rem; }
    .search-input { flex: 1; background: #000; border: 1px solid var(--border); padding: 0.75rem 1rem; border-radius: 0.5rem; color: var(--text); font-size: 0.9rem; transition: border-color 0.15s; }
    .search-input:focus { outline: none; border-color: var(--primary); }
    
    .matrix-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 0.75rem; padding: 1.5rem; }
    
    table { width: 100%; border-collapse: collapse; text-align: left; }
    th, td { padding: 1rem; border-bottom: 1px solid var(--border); font-size: 0.875rem; }
    th { color: var(--text-dim); font-weight: 600; background: #000; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; }
    tr:hover td { background: var(--card-hover); }
    
    .badge { padding: 0.25rem 0.5rem; border-radius: 0.25rem; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; display: inline-block; border: 1px solid transparent; }
    .badge-success { background: var(--success-dim); color: var(--success); border-color: rgba(34, 197, 94, 0.2); }
    .badge-warning { background: var(--warning-dim); color: var(--warning); border-color: rgba(245, 158, 11, 0.2); }
    .badge-danger { background: var(--danger-dim); color: var(--danger); border-color: rgba(239, 68, 68, 0.2); }
    .badge-yellow { background: var(--primary-dim); color: var(--primary); border-color: rgba(234, 179, 8, 0.2); }
    
    .actions-cell { display: flex; gap: 0.5rem; }
    .btn-action { background: var(--border); border: 1px solid var(--border); color: var(--text-dim); padding: 0.4rem 0.75rem; border-radius: 0.375rem; cursor: pointer; font-size: 0.75rem; font-weight: 600; display: inline-flex; align-items: center; gap: 0.35rem; transition: all 0.15s; }
    .btn-action:hover { color: var(--text); background: var(--border-bright); }
    
    code, td strong, .radar-labels span, .ring-text, td code { font-family: 'JetBrains Mono', monospace; }
    code { background: #000; padding: 0.15rem 0.35rem; border-radius: 0.2rem; font-size: 0.8rem; color: var(--primary); }
  </style>
</head>
<body>
  <header>
    <div class="logo-container">
      <img src="https://res.cloudinary.com/dv7iah7yv/image/upload/v1783707247/Gemini_Generated_Image_6xf1oi6xf1oi6xf1-removebg-preview_znn27s.png" alt="Bandit Logo" />
      <span class="logo-text">Bandit CLI <span style="color: var(--primary);">Studio</span></span>
      <span class="logo-beta">BETA</span>
    </div>
    <nav>
      <button onclick="showTab('blueprint', this)" class="active" style="display: inline-flex; align-items: center; gap: 0.45rem;">
        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>
        API Health Matrix
      </button>
      <button onclick="showTab('performance', this)" style="display: inline-flex; align-items: center; gap: 0.45rem;">
        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
        Performance History
      </button>
      <button onclick="showTab('audits', this)" style="display: inline-flex; align-items: center; gap: 0.45rem;">
        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
        Security Inspector
      </button>
    </nav>
  </header>
  <main>
    <!-- API Health Matrix (Tab 1) -->
    <div id="blueprint" class="tab-content active">
      <div class="section-header">
        <h2>API Health & Performance Matrix</h2>
        <p>Real-time endpoint registry tracking authentication scopes, load test latencies, and active vulnerability states.</p>
      </div>

      <!-- Analytics Row -->
      <div class="analytics-grid">
        <div class="card">
          <h3>Testing Coverage</h3>
          <div class="rings-row">
            <div class="ring-container">
              <svg width="70" height="70" class="ring-svg">
                <circle cx="35" cy="35" r="30" class="ring-bg"></circle>
                <circle cx="35" cy="35" r="30" class="ring-bar" id="ring-bench"></circle>
              </svg>
              <span class="ring-text" id="ring-bench-text">0%</span>
              <span style="font-size: 0.75rem; color: var(--text-dim);">Load Tested</span>
            </div>
            <div class="ring-container">
              <svg width="70" height="70" class="ring-svg">
                <circle cx="35" cy="35" r="30" class="ring-bg"></circle>
                <circle cx="35" cy="35" r="30" class="ring-bar" id="ring-security" style="stroke: var(--success);"></circle>
              </svg>
              <span class="ring-text" id="ring-security-text">0%</span>
              <span style="font-size: 0.75rem; color: var(--text-dim);">Secured</span>
            </div>
          </div>
        </div>

        <div class="card">
          <h3>Public Route Exposure</h3>
          <div class="exposure-box">
            <div style="display: flex; justify-content: space-between; font-size: 0.85rem;">
              <span>🌐 Public: <strong id="exposure-public">0</strong></span>
              <span>🔑 Protected: <strong id="exposure-private">0</strong></span>
            </div>
            <div class="progress-bar-bg">
              <div class="progress-bar-val" id="exposure-bar-val" style="width: 0%;"></div>
            </div>
            <span style="font-size: 0.75rem; color: var(--text-dim);" id="exposure-ratio-desc">Analyzing exposure...</span>
          </div>
        </div>

        <div class="card">
          <h3>Latency Hotspots (Avg ms)</h3>
          <div class="radar-list" id="radar-list">
            <p style="color: var(--text-dim); font-size: 0.85rem; padding-top: 0.5rem;">No benchmark data available.</p>
          </div>
        </div>
      </div>

      <!-- Matrix Table -->
      <div class="controls-row">
        <input type="text" class="search-input" id="route-search" placeholder="Filter endpoints by path, method, or controller file..." oninput="filterRoutes()" />
      </div>

      <div class="matrix-card">
        <h3>API Endpoint Registry</h3>
        <div style="overflow-x: auto; margin-top: 1rem;">
          <table id="matrix-table">
            <thead>
              <tr>
                <th>Endpoint</th>
                <th>Auth Status</th>
                <th>Performance (RPS / Latency)</th>
                <th>Security Scan</th>
                <th>Quick Actions</th>
              </tr>
            </thead>
            <tbody id="matrix-table-body">
              <tr>
                <td colspan="5" style="color: var(--text-dim); text-align: center; padding: 2rem;">Loading API blueprint...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Performance History (Tab 2) -->
    <div id="performance" class="tab-content">
      <div class="section-header">
        <h2>Performance & Regression History</h2>
        <p>Tracks benchmark latency and throughput trends linked with Git commits.</p>
      </div>
      <div class="card">
        <h3>Recorded Load Test Runs</h3>
        <div id="benchmarks-table-container">Loading metrics...</div>
      </div>
    </div>

    <!-- Security Inspector (Tab 3) -->
    <div id="audits" class="tab-content">
      <div class="section-header">
        <h2>Security & Codebase Inspector</h2>
        <p>Active penetration test findings (SQLi, XSS, Header Security) and diagnostic logs.</p>
      </div>
      <div class="card">
        <h3>Active Penetration Test Results</h3>
        <div id="audits-container">Loading diagnostics...</div>
      </div>
    </div>
  </main>

  <script>
    let globalRoutes = [];
    let globalAudits = [];

    function showTab(tabId, btn) {
      document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('nav button').forEach(el => el.classList.remove('active'));
      document.getElementById(tabId).classList.add('active');
      btn.classList.add('active');
    }

    function copyToClipboard(text) {
      navigator.clipboard.writeText(text).then(() => {
        alert("Command copied to clipboard: " + text);
      }).catch(err => {
        console.error("Could not copy text: ", err);
      });
    }

    function filterRoutes() {
      const q = document.getElementById('route-search').value.toLowerCase();
      const filtered = globalRoutes.filter(r => 
        r.label.toLowerCase().includes(q) || 
        (r.details && r.details.toLowerCase().includes(q))
      );
      renderMatrixTable(filtered);
    }

    function renderMatrixTable(routes) {
      const tbody = document.getElementById('matrix-table-body');
      if (routes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="color: var(--text-dim); text-align: center; padding: 2rem;">No matching endpoints found.</td></tr>';
        return;
      }

      let html = '';
      routes.forEach(r => {
        const method = r.label.match(/\\[([A-Z]+)\\]/)[1];
        const path = r.label.replace(/\\[([A-Z]+)\\]\\s*/, '');
        
        // Performance
        let perfHtml = '<span style="color: var(--text-dim); display: inline-flex; align-items: center;"><svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2.5" fill="none" style="vertical-align: middle; margin-right: 3px;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>Untested</span>';
        if (r.metrics) {
          const speedIcon = r.metrics.avg > 200
            ? '<svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2.5" fill="none" style="vertical-align: middle; margin-right: 3.5px; color: var(--warning);"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>'
            : '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" style="vertical-align: middle; margin-right: 3.5px; color: var(--primary);"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>';
          perfHtml = \`<div style="font-weight: 600; color: var(--primary); display: inline-flex; align-items: center;">\${speedIcon}\${r.metrics.rps.toFixed(0)} req/s</div>
                      <div style="font-size: 0.75rem; color: var(--text-dim);">Avg: \${r.metrics.avg.toFixed(1)}ms | p99: \${r.metrics.p99.toFixed(1)}ms</div>\`;
        }

        // Security
        let secHtml = '<span class="badge badge-warning" style="display: inline-flex; align-items: center;"><svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2.5" fill="none" style="vertical-align: middle; margin-right: 3px;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>Unscanned</span>';
        if (globalAudits.length > 0 && globalAudits[0].items) {
          const failures = globalAudits[0].items.filter(item => item.status === 'fail');
          if (failures.length > 0) {
            secHtml = '<span class="badge badge-danger" style="display: inline-flex; align-items: center;"><svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2.5" fill="none" style="vertical-align: middle; margin-right: 3px;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>Vulnerable</span>';
          } else {
            secHtml = '<span class="badge badge-success" style="display: inline-flex; align-items: center;"><svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2.5" fill="none" style="vertical-align: middle; margin-right: 3px;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><polyline points="9 11 11 13 15 9"></polyline></svg>Secure</span>';
          }
        }

        // Auth
        const authBadgeClass = r.authStatus === 'Protected' ? 'badge-success' : 'badge-yellow';
        const authIcon = r.authStatus === 'Protected' 
          ? '<svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2.5" fill="none" style="vertical-align: middle; margin-right: 3.5px;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>'
          : '<svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2.5" fill="none" style="vertical-align: middle; margin-right: 3.5px;"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>';

        // Copy command helpers
        const host = window.location.origin;
        const benchCmd = \`bandit bench \${host}\${path} -c 50 -r 2000\`;
        const docCmd = \`bandit doctor \${host}\`;

        html += \`<tr>
          <td>
            <strong style="color: var(--text);">\${r.label}</strong>
            <div style="font-size: 0.75rem; color: var(--text-dim);">\${r.details || '-'}</div>
          </td>
          <td><span class="badge \${authBadgeClass}" style="display: inline-flex; align-items: center;">\${authIcon}\${r.authStatus || 'Public'}</span></td>
          <td>\${perfHtml}</td>
          <td>\${secHtml}</td>
          <td class="actions-cell">
            <button class="btn-action" onclick="copyToClipboard('\${benchCmd}')" title="Copy bench command">
              <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
              Bench
            </button>
            <button class="btn-action" onclick="copyToClipboard('\${docCmd}')" title="Copy doctor command">
              <svg viewBox="0 0 24 24" width="11" height="11" stroke="currentColor" stroke-width="2.5" fill="none"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
              Doctor
            </button>
          </td>
        </tr>\`;
      });
      tbody.innerHTML = html;
    }

    async function loadData() {
      // Load Audits
      try {
        const res = await fetch('/api/audits');
        globalAudits = await res.json();
        const container = document.getElementById('audits-container');
        if (!globalAudits || globalAudits.length === 0 || !globalAudits[0].items) {
          container.innerHTML = '<p style="color: var(--text-dim); padding: 1rem 0;">No active audits logged yet. Run <code>bandit doctor</code> in terminal to execute security probes.</p>';
        } else {
          let html = '<table><thead><tr><th>Status</th><th>Probe Title</th><th>Diagnostic Details</th><th>Remediation Suggestion</th></tr></thead><tbody>';
          globalAudits[0].items.forEach(item => {
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

      // Load Blueprint Graph
      try {
        const res = await fetch('/api/blueprint');
        const graph = await res.json();
        globalRoutes = graph.nodes.filter(n => n.type === 'route');
        
        // Renders Table
        renderMatrixTable(globalRoutes);

        // Process Analytics
        const total = globalRoutes.length;
        if (total > 0) {
          // 1. Bench Ring
          const benched = globalRoutes.filter(r => r.metrics).length;
          const benchPct = Math.round((benched / total) * 100);
          document.getElementById('ring-bench-text').innerText = benchPct + '%';
          const benchOffset = 220 - (220 * benchPct) / 100;
          document.getElementById('ring-bench').style.strokeDashoffset = benchOffset;

          // 2. Security Ring
          const securityPct = globalAudits.length > 0 ? 100 : 0;
          document.getElementById('ring-security-text').innerText = securityPct + '%';
          const secOffset = 220 - (220 * securityPct) / 100;
          document.getElementById('ring-security').style.strokeDashoffset = secOffset;

          // 3. Exposure Progress Bar
          const privCount = globalRoutes.filter(r => r.authStatus === 'Protected').length;
          const pubCount = total - privCount;
          document.getElementById('exposure-public').innerText = pubCount;
          document.getElementById('exposure-private').innerText = privCount;
          const privatePct = Math.round((privCount / total) * 100);
          document.getElementById('exposure-bar-val').style.width = privatePct + '%';
          document.getElementById('exposure-ratio-desc').innerText = \`\${privatePct}% of your API routes are protected by middleware.\`;

          // 4. Latency Hotspots (Slowest top 3)
          const benchedRoutes = globalRoutes.filter(r => r.metrics);
          const radarList = document.getElementById('radar-list');
          if (benchedRoutes.length === 0) {
            radarList.innerHTML = '<p style="color: var(--text-dim); font-size: 0.85rem; padding-top: 0.5rem;">No benchmark data available.</p>';
          } else {
            benchedRoutes.sort((a, b) => b.metrics.avg - a.metrics.avg);
            const maxAvg = benchedRoutes[0].metrics.avg || 1;
            let radarHtml = '';
            benchedRoutes.slice(0, 3).forEach(br => {
              const widthPct = Math.round((br.metrics.avg / maxAvg) * 100);
              radarHtml += \`<div class="radar-item">
                <div class="radar-labels">
                  <span style="font-weight: 500;">\${br.label}</span>
                  <span style="color: var(--danger); font-weight: 600;">\${br.metrics.avg.toFixed(0)} ms</span>
                </div>
                <div class="radar-bar-bg">
                  <div class="radar-bar-val" style="width: \${widthPct}%;"></div>
                </div>
              </div>\`;
            });
            radarList.innerHTML = radarHtml;
          }
        }
      } catch (err) { console.error(err); }

      // Load Benchmarks
      try {
        const res = await fetch('/api/benchmarks');
        const data = await res.json();
        const container = document.getElementById('benchmarks-table-container');
        if (!data || data.length === 0) {
          container.innerHTML = '<p style="color: var(--text-dim); padding: 1rem 0;">No benchmark history recorded yet. Run <code>bandit bench &lt;url&gt;</code> in your terminal.</p>';
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
    }

    loadData();
  </script>
</body>
</html>`;
  };

  const server = http.createServer(async (req, res) => {
    const url = req.url || "/";

    // Serve custom logo if saved in project root
    if (url === "/api/logo" && req.method === "GET") {
      const logoPath = path.join(projectPath, "logo.png");
      if (fs.existsSync(logoPath)) {
        res.writeHead(200, { "Content-Type": "image/png" });
        res.end(fs.readFileSync(logoPath));
      } else {
        res.writeHead(404);
        res.end();
      }
      return;
    }

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
