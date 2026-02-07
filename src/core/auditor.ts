// File: src/core/auditor.ts
import { makeContext } from "./context.js";
import { AuditReport, AuditItem, Status } from "./types.js";
import { rules } from "../rules/index.js";

export async function runAudit(projectPath: string): Promise<AuditReport> {
  const ctx = makeContext(projectPath);

  const items: AuditItem[] = [];
  for (const rule of rules) {
    try {
      const result = await rule.run(ctx);
      items.push(result);
    } catch (err: any) {
      items.push({
        id: rule.id,
        title: rule.title,
        severity: rule.severity,
        status: "fail" as Status,
        details: `Rule crashed: ${err?.message ?? String(err)}`,
        suggestion: "Fix the rule implementation.",
      });
    }
  }

  const summary = items.reduce(
    (acc, item) => {
      acc[item.status] += 1;
      return acc;
    },
    { pass: 0, fail: 0, skip: 0 } as Record<Status, number>,
  );

  return {
    projectPath,
    summary,
    items,
  };
}
