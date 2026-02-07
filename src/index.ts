#!/usr/bin/env node

import { Command } from "commander";
import { runAudit } from "./core/auditor.js";
import { printHuman } from "./cli/output.js";

const program = new Command();

program
  .name("backend-audit")
  .description("Audit a backend project for basic best-practices")
  .argument("[path]", "Path to the project", ".")
  .option("--json", "Print results as JSON")
  .option("--fail-on-warn", "Exit with code 1 if warnings exist")
  .action(async (projectPath: string, opts: any) => {
    const results = await runAudit(projectPath);

    if (opts.json) {
      process.stdout.write(JSON.stringify(results, null, 2) + "\n");
    } else {
      printHuman(results);
    }

    const hasErrors = results.items.some(
      (r) => r.status === "fail" && r.severity === "error",
    );
    const hasWarnings = results.items.some(
      (r) => r.status === "fail" && r.severity === "warn",
    );

    if (hasErrors) process.exit(1);
    if (opts.failOnWarn && hasWarnings) process.exit(1);
  });

program.parse(process.argv);
