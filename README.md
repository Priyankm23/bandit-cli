# Bandit CLI

> **The Swiss Army Knife for Backend Developers**

`bandit` is an interactive, high-utility terminal workspace helper built for backend developers. Instead of relying on heavy GUI clients or complex shell scripts, `bandit` lets you test APIs, benchmark endpoints, terminate locked ports, validate environment setups, and audit server health directly from your command line.

---

## 🚀 Key Features

- **Interactive API Client**: Auto-scans your codebase (Express, Fastify, Hono, NestJS) to find route definitions, maps parameters, takes JSON payloads, prompts for Bearer Auth tokens, and displays pretty-printed HTTP responses.
- **High-Speed Load Benchmarker**: Benchmark any local or remote HTTP endpoint with configurable concurrency, calculating throughput (RPS), p50-p99 percentiles, and rendering a beautiful ASCII distribution chart.
- **Port Inspector & Process Killer**: Scans active ports, identifies the PID and process names (e.g. `node.exe`, `postgres.exe`, `ollama.exe`), and lets you terminate locked processes in one click.
- **Live Server Doctor**: Probes your running server for security headers, CORS wildcards, stack trace/error leakage, and payload crash handling.
- **Environment Variable Auditor**: Compares active `.env` files against `.env.example` to flag missing keys, empty values, and placeholder defaults before you boot.
- **Static Project Auditor**: Evaluates package setup, file organization, safety configs, and dependency scopes.

---

## 📦 Installation

Install globally via npm:

```bash
npm install -g bandit-cli
```

Or run instantly using `npx`:

```bash
npx bandit-cli <command>
```

---

## 🛠️ Usage & Commands

### 1. Interactive API Playfield

Find and test routes in your codebase:

```bash
bandit api
```

### 2. Endpoint Benchmarking

Run a concurrent load test on an endpoint:

```bash
bandit bench http://localhost:3000/api/users --connections 10 --requests 200
```

### 3. Ports Inspector

List processes listening on local ports and terminate them:

```bash
bandit ports
```

### 4. Active Server Diagnostics

Audit a running server's security headers and vulnerabilities:

```bash
bandit doctor http://localhost:3000
```

### 5. Environment variable check

Validate local environment configurations:

```bash
bandit env
```

### 6. Static Project Audit

Audit files, directory structure, and dependencies:

```bash
bandit audit
```

---

## 🎨 Under the Hood

Built with TypeScript, [Commander](https://github.com/tj/commander.js), and [@clack/prompts](https://github.com/natemoo-re/clack) for a modern, fluid interactive terminal interface.
