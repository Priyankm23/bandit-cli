// File: src/core/types.ts
export type Severity = "error" | "warn" | "info";
export type Status = "pass" | "fail" | "skip";

export type AuditItem = {
  id: string;
  title: string;
  severity: Severity;
  status: Status;
  details?: string;
  suggestion?: string;
};

export type AuditReport = {
  projectPath: string;
  summary: {
    pass: number;
    fail: number;
    skip: number;
  };
  items: AuditItem[];
};

export type Framework = "express" | "fastify" | "nest" | "hono" | "unknown";

export type AuditContext = {
  projectPath: string;
  packageJsonPath: string;
  framework?: Framework;
};

export type Rule = {
  id: string;
  title: string;
  severity: Severity;
  run: (ctx: AuditContext) => Promise<AuditItem>;
};
