#!/usr/bin/env node

import { Command } from "commander";
import { runAudit } from "./core/auditor.js";
import { printHuman } from "./cli/output.js";

const program = new Command();

program
  .name("bandit")
  .description("The Swiss Army Knife for Backend Developers");

// Subcommand: audit (original behavior)
program
  .command("audit")
  .description("Audit a backend project directory for basic best-practices")
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

// Subcommand: ports
program
  .command("ports")
  .description("Scan active listening ports and interactively terminate locked processes")
  .action(async () => {
    const { runPortsCommand } = await import("./cli/ports.js");
    await runPortsCommand();
  });

// Subcommand: env
program
  .command("env")
  .description("Audit local .env configurations against .env.example")
  .argument("[path]", "Path to the project", ".")
  .action(async (projectPath: string) => {
    const { runEnvCommand } = await import("./cli/env.js");
    await runEnvCommand(projectPath);
  });

// Subcommand: doctor
program
  .command("doctor")
  .description("Actively audit a running local server for header security, error leakage, and payload crashes")
  .argument("[url]", "URL of the running server", "http://localhost:3000")
  .action(async (url: string) => {
    const { runDoctorCommand } = await import("./cli/doctor.js");
    await runDoctorCommand(url);
  });

// Subcommand: api
program
  .command("api")
  .description("Interactive API playfield: scan codebase routes and send test requests")
  .argument("[path]", "Path to the project", ".")
  .action(async (projectPath: string) => {
    const { runApiCommand } = await import("./cli/api.js");
    await runApiCommand(projectPath);
  });

// Subcommand: bench
program
  .command("bench")
  .description("Benchmark an HTTP endpoint with concurrent connections load testing")
  .argument("<url>", "Target URL to load test")
  .option("-c, --connections <number>", "Number of concurrent connections", "10")
  .option("-r, --requests <number>", "Total number of requests to execute", "200")
  .action(async (url: string, opts: any) => {
    const connections = parseInt(opts.connections, 10);
    const requests = parseInt(opts.requests, 10);

    if (isNaN(connections) || connections <= 0) {
      console.error("Error: connections must be a positive integer.");
      process.exit(1);
    }
    if (isNaN(requests) || requests <= 0) {
      console.error("Error: requests must be a positive integer.");
      process.exit(1);
    }

    const { runBenchCommand } = await import("./cli/bench.js");
    await runBenchCommand(url, { connections, requests });
  });

// Default to help if no command specified
if (!process.argv.slice(2).length) {
  program.outputHelp();
  process.exit(0);
}

program.parse(process.argv);

