import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

export interface BenchmarkRecord {
  id: string;
  timestamp: string;
  gitCommit?: string;
  gitBranch?: string;
  gitAuthor?: string;
  targetUrl: string;
  connections: number;
  requests: number;
  rps: number;
  latency: {
    min: number;
    avg: number;
    max: number;
    p50: number;
    p90: number;
    p95: number;
    p99: number;
  };
}

export interface AuditRecord {
  id: string;
  timestamp: string;
  gitCommit?: string;
  items: Array<{
    title: string;
    status: "pass" | "fail" | "warn";
    details?: string;
    suggestion?: string;
  }>;
}

export interface StudioConfig {
  dismissedRules: string[];
}

export class StudioDB {
  private baseDir: string;

  constructor(projectPath: string = ".") {
    this.baseDir = path.join(path.resolve(projectPath), ".bandit");
    this.ensureDir();
  }

  private ensureDir() {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  private getFilePath(filename: string): string {
    return path.join(this.baseDir, filename);
  }

  private readJson<T>(filename: string, defaultValue: T): T {
    const file = this.getFilePath(filename);
    if (!fs.existsSync(file)) return defaultValue;
    try {
      const content = fs.readFileSync(file, "utf-8");
      return JSON.parse(content) as T;
    } catch {
      return defaultValue;
    }
  }

  private writeJson<T>(filename: string, data: T): void {
    const file = this.getFilePath(filename);
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
  }

  public getGitMetadata(): { commit?: string; branch?: string; author?: string } {
    try {
      const commit = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
        .toString()
        .trim();
      const branch = execSync("git branch --show-current", { stdio: ["ignore", "pipe", "ignore"] })
        .toString()
        .trim();
      const author = execSync('git log -1 --pretty=format:"%an"', { stdio: ["ignore", "pipe", "ignore"] })
        .toString()
        .trim();
      return { commit, branch, author };
    } catch {
      return {};
    }
  }

  public saveBenchmark(data: Omit<BenchmarkRecord, "id" | "timestamp">): BenchmarkRecord {
    const records = this.readJson<BenchmarkRecord[]>("benchmarks.json", []);
    const git = this.getGitMetadata();
    const newRecord: BenchmarkRecord = {
      id: Math.random().toString(36).substring(2, 10),
      timestamp: new Date().toISOString(),
      gitCommit: git.commit,
      gitBranch: git.branch,
      gitAuthor: git.author,
      ...data,
    };
    records.unshift(newRecord);
    this.writeJson("benchmarks.json", records.slice(0, 200));
    return newRecord;
  }

  public getBenchmarks(): BenchmarkRecord[] {
    return this.readJson<BenchmarkRecord[]>("benchmarks.json", []);
  }

  public saveAudit(items: AuditRecord["items"]): AuditRecord {
    const records = this.readJson<AuditRecord[]>("audits.json", []);
    const git = this.getGitMetadata();
    const newRecord: AuditRecord = {
      id: Math.random().toString(36).substring(2, 10),
      timestamp: new Date().toISOString(),
      gitCommit: git.commit,
      items,
    };
    records.unshift(newRecord);
    this.writeJson("audits.json", records.slice(0, 50));
    return newRecord;
  }

  public getAudits(): AuditRecord[] {
    return this.readJson<AuditRecord[]>("audits.json", []);
  }

  public getConfig(): StudioConfig {
    return this.readJson<StudioConfig>("config.json", { dismissedRules: [] });
  }

  public dismissRule(ruleTitle: string): StudioConfig {
    const config = this.getConfig();
    if (!config.dismissedRules.includes(ruleTitle)) {
      config.dismissedRules.push(ruleTitle);
      this.writeJson("config.json", config);
    }
    return config;
  }
}
