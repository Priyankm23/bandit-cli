import chalk from "chalk";
import { AuditReport, AuditItem, Severity, Status } from "../core/types.js";

function icon(status: Status) {
  if (status === "pass") return chalk.green("✔");
  if (status === "fail") return chalk.red("✖");
  return chalk.gray("-");
}

function sevColor(sev: Severity, text: string) {
  if (sev === "error") return chalk.red(text);
  if (sev === "warn") return chalk.yellow(text);
  return chalk.blue(text);
}

function sevLabel(sev: Severity) {
  if (sev === "error") return "ERROR";
  if (sev === "warn") return "WARN";
  return "INFO";
}

function printSeparator() {
  console.log(chalk.gray("─".repeat(80)));
}

function printItem(item: AuditItem) {
  const statusIcon = icon(item.status);
  const line = `${statusIcon} ${chalk.bold(item.title)}`;

  console.log(line);

  // Show details for pass/fail/skip
  if (item.details) {
    console.log(chalk.gray(`  ↳ ${item.details}`));
  }

  // Show suggestion only for failures
  if (item.status === "fail" && item.suggestion) {
    console.log(chalk.gray(`  ↳ Suggestion: ${item.suggestion}`));
  }
}

function printSection(title: string, items: AuditItem[], color: Function) {
  if (items.length === 0) return;

  console.log("");
  console.log(color(chalk.bold(`● ${title}`)));
  printSeparator();

  for (const item of items) {
    printItem(item);
  }
}

export function printHuman(report: AuditReport) {
  // Header
  console.log("");
  console.log(
    chalk.bold.blue(
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ),
  );
  console.log(
    chalk.bold.white(`                           Backend Audit Report`),
  );
  console.log(
    chalk.bold.blue(
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ),
  );
  console.log(chalk.gray(`Project: ${report.projectPath}`));
  console.log(
    chalk.gray(
      `Summary: ${chalk.green(`pass=${report.summary.pass}`)} ${chalk.red(`fail=${report.summary.fail}`)} ${chalk.gray(`skip=${report.summary.skip}`)}`,
    ),
  );

  // Severity Legend
  console.log("");
  console.log(chalk.bold("Severity Legend:"));
  console.log(
    chalk.red("  ● ERROR  ") +
      chalk.gray("- Critical issues that must be fixed"),
  );
  console.log(
    chalk.yellow("  ● WARN   ") +
      chalk.gray("- Important issues that should be addressed"),
  );
  console.log(
    chalk.blue("  ● INFO   ") +
      chalk.gray("- Informational items or best practices"),
  );

  // Group items by status first
  const passedItems = report.items.filter((item) => item.status === "pass");
  const failedItems = report.items.filter((item) => item.status === "fail");
  const skippedItems = report.items.filter((item) => item.status === "skip");

  // Print PASSED section
  if (passedItems.length > 0) {
    console.log("");
    console.log(chalk.bold.green(`✓ PASSED CHECKS (${passedItems.length})`));
    printSeparator();
    for (const item of passedItems) {
      printItem(item);
    }
  }

  // Print FAILED sections grouped by severity
  if (failedItems.length > 0) {
    console.log("");
    console.log(chalk.bold.red(`✖ FAILED CHECKS (${failedItems.length})`));
    printSeparator();

    // Group failed items by severity
    const failedErrors = failedItems.filter(
      (item) => item.severity === "error",
    );
    const failedWarns = failedItems.filter((item) => item.severity === "warn");
    const failedInfos = failedItems.filter((item) => item.severity === "info");

    // Print failed ERRORS
    if (failedErrors.length > 0) {
      console.log("");
      console.log(chalk.red(chalk.bold(`  ● ERRORS (${failedErrors.length})`)));
      for (const item of failedErrors) {
        console.log("");
        printItem(item);
      }
    }

    // Print failed WARNINGS
    if (failedWarns.length > 0) {
      console.log("");
      console.log(
        chalk.yellow(chalk.bold(`  ● WARNINGS (${failedWarns.length})`)),
      );
      for (const item of failedWarns) {
        console.log("");
        printItem(item);
      }
    }

    // Print failed INFO
    if (failedInfos.length > 0) {
      console.log("");
      console.log(chalk.blue(chalk.bold(`  ● INFO (${failedInfos.length})`)));
      for (const item of failedInfos) {
        console.log("");
        printItem(item);
      }
    }
  }

  // Print SKIPPED section (if any)
  if (skippedItems.length > 0) {
    console.log("");
    console.log(chalk.bold.gray(`- SKIPPED CHECKS (${skippedItems.length})`));
    printSeparator();
    for (const item of skippedItems) {
      printItem(item);
    }
  }

  // Footer
  console.log("");
  console.log(
    chalk.bold.blue(
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ),
  );

  // Summary message
  const failCount = report.summary.fail;
  if (failCount === 0) {
    console.log(chalk.green.bold(`✓ All checks passed!`));
  } else {
    console.log(
      chalk.yellow(
        `                         ⚠ ${failCount} check${failCount > 1 ? "s" : ""} need${failCount === 1 ? "s" : ""} attention.`,
      ),
    );
  }

  console.log(
    chalk.bold.blue(
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ),
  );
  console.log("");
}
