import { exec } from "node:child_process";
import { promisify } from "node:util";
import * as clack from "@clack/prompts";
import chalk from "chalk";

const execAsync = promisify(exec);

interface PortProcess {
  port: number;
  pid: number;
  name: string;
}

// Windows helper: map PIDs to process names
async function getWindowsProcessMap(): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  try {
    const { stdout } = await execAsync("tasklist /FO CSV /NH");
    const lines = stdout.split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      // CSV format: "Image Name","PID","Session Name","Session#","Mem Usage"
      // e.g. "node.exe","22064","Console","1","53,284 K"
      const parts = line.split(`","`).map((p) => p.replace(/"/g, "").trim());
      if (parts.length >= 2) {
        const name = parts[0];
        const pid = parseInt(parts[1], 10);
        if (!isNaN(pid)) {
          map.set(pid, name);
        }
      }
    }
  } catch (err) {
    // Ignore and return empty map
  }
  return map;
}

// Windows port scanner
async function scanWindowsPorts(): Promise<PortProcess[]> {
  const processMap = await getWindowsProcessMap();
  const list: PortProcess[] = [];
  const seenKeys = new Set<string>();

  try {
    // netstat -ano lists all connections and listening ports with PIDs
    const { stdout } = await execAsync("netstat -ano");
    const lines = stdout.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("TCP") && !trimmed.startsWith("UDP")) continue;

      // TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       12345
      // Split by whitespace
      const tokens = trimmed.split(/\s+/);
      if (tokens.length < 5) continue;

      const state = tokens[3];
      if (state !== "LISTENING") continue;

      const localAddress = tokens[1];
      const pidStr = tokens[4];
      const pid = parseInt(pidStr, 10);
      if (isNaN(pid)) continue;

      // Extract port from localAddress (e.g. 0.0.0.0:3000 or [::]:3000)
      const lastColon = localAddress.lastIndexOf(":");
      if (lastColon === -1) continue;

      const portStr = localAddress.slice(lastColon + 1);
      const port = parseInt(portStr, 10);
      if (isNaN(port)) continue;

      const key = `${port}-${pid}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      const name = processMap.get(pid) || "Unknown";
      list.push({ port, pid, name });
    }
  } catch (err: any) {
    throw new Error(`Failed to scan Windows ports: ${err.message}`);
  }

  return list.sort((a, b) => a.port - b.port);
}

// Unix port scanner (Linux / macOS)
async function scanUnixPorts(): Promise<PortProcess[]> {
  const list: PortProcess[] = [];
  const seenKeys = new Set<string>();

  try {
    // lsof -i -P -n -sTCP:LISTEN
    const { stdout } = await execAsync("lsof -i -P -n -sTCP:LISTEN");
    const lines = stdout.split("\n");

    // Command headers: COMMAND   PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME
    // e.g. node      22064  user   22u  IPv6 0x...      0t0  TCP *:3000 (LISTEN)
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const tokens = line.split(/\s+/);
      if (tokens.length < 9) continue;

      const name = tokens[0];
      const pid = parseInt(tokens[1], 10);
      const nameCol = tokens[8]; // e.g. *:3000 or 127.0.0.1:3000 or [::1]:3000

      const lastColon = nameCol.lastIndexOf(":");
      if (lastColon === -1) continue;

      const portStr = nameCol.slice(lastColon + 1);
      const port = parseInt(portStr, 10);

      if (isNaN(pid) || isNaN(port)) continue;

      const key = `${port}-${pid}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      list.push({ port, pid, name });
    }
  } catch (err: any) {
    throw new Error(`Failed to scan Unix ports (make sure lsof is installed): ${err.message}`);
  }

  return list.sort((a, b) => a.port - b.port);
}

export async function runPortsCommand() {
  clack.intro(chalk.bold.bgBlue.white(" Bandit Port Inspector "));

  const isWin = process.platform === "win32";
  const s = clack.spinner();

  s.start("Scanning for active listening ports...");
  let ports: PortProcess[] = [];
  try {
    ports = isWin ? await scanWindowsPorts() : await scanUnixPorts();
    s.stop(`Scan complete. Found ${ports.length} listening process(es).`);
  } catch (err: any) {
    s.stop("Scan failed.");
    clack.log.error(err.message);
    clack.outro(chalk.red("Execution stopped."));
    return;
  }

  if (ports.length === 0) {
    clack.log.info("No active local listening processes detected on common backend ports.");
    clack.outro(chalk.green("Done."));
    return;
  }

  const options = ports.map((p) => ({
    value: p,
    label: `Port ${chalk.bold.green(p.port)} ➜ PID ${p.pid} (${chalk.cyan(p.name)})`,
  }));

  const selected = (await clack.select({
    message: "Select a process to inspect or terminate:",
    options: [
      ...options,
      { value: "cancel", label: chalk.gray("Cancel / Exit") },
    ] as any,
  })) as PortProcess | "cancel" | symbol;

  if (clack.isCancel(selected) || selected === "cancel") {
    clack.outro("No action taken.");
    return;
  }

  const confirmKill = await clack.confirm({
    message: `Are you sure you want to terminate PID ${selected.pid} (${selected.name}) listening on Port ${selected.port}?`,
  });

  if (clack.isCancel(confirmKill) || !confirmKill) {
    clack.outro("Aborted.");
    return;
  }

  s.start(`Terminating process ${selected.name} (PID ${selected.pid})...`);
  try {
    if (isWin) {
      await execAsync(`taskkill /F /PID ${selected.pid}`);
    } else {
      await execAsync(`kill -9 ${selected.pid}`);
    }
    s.stop(`Process terminated successfully.`);
    clack.outro(chalk.bold.green(`✔ Port ${selected.port} has been freed!`));
  } catch (err: any) {
    s.stop(`Failed to terminate process.`);
    clack.log.error(`Error details: ${err.message}`);
    clack.outro(chalk.bold.red("❌ Process termination failed. You might need administrative/root privileges."));
  }
}
