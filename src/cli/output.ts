import chalk from "chalk";
import { AuditReport, AuditItem, Severity, Status } from "../core/types.js";

function icon(status: Status) {
  if (status === "pass") return chalk.green("✔");
  if (status === "fail") return chalk.red("✖");
  return chalk.gray("-");
}

function printSeparator() {
  console.log(chalk.gray("  " + "─".repeat(70)));
}

function printItem(item: AuditItem) {
  const statusIcon = icon(item.status);
  let titleText = chalk.bold(item.title);
  
  if (item.status === "fail") {
    if (item.severity === "error") titleText += chalk.red.bold(" (ERROR)");
    else if (item.severity === "warn") titleText += chalk.yellow.bold(" (WARN)");
    else titleText += chalk.blue.bold(" (INFO)");
  }

  console.log(`  ${statusIcon}  ${titleText}`);

  // Show details
  if (item.details) {
    console.log(chalk.gray(`     ↳ ${item.details}`));
  }

  // Show suggestion only for failures
  if (item.status === "fail" && item.suggestion) {
    console.log(chalk.cyan(`     ↳ Suggestion: ${item.suggestion}`));
  }
}

export function printHuman(report: AuditReport) {
  // Header Box
  console.log("");
  console.log(chalk.cyan(`  ┌${"─".repeat(70)}┐`));
  console.log(chalk.cyan(`  │`) + chalk.bold.white("                    BACKEND PROJECT AUDIT SUMMARY                     ") + chalk.cyan(`│`));
  console.log(chalk.cyan(`  └${"─".repeat(70)}┘`));
  
  console.log(`    ${chalk.gray("Project:")} ${chalk.bold(report.projectPath)}`);
  console.log(
    `    ${chalk.gray("Results:")} ${chalk.green(`${report.summary.pass} Passed`)}, ` +
    `${chalk.red(`${report.summary.fail} Failed`)}, ` +
    `${chalk.gray(`${report.summary.skip} Skipped`)}`
  );
  
  // Severity Legend
  console.log("");
  console.log(
    `    ${chalk.bold.gray("Severity Legend:")}  ` +
    `${chalk.red("● ERROR")} (Critical)   ` +
    `${chalk.yellow("● WARN")} (Important)   ` +
    `${chalk.blue("● INFO")} (Best Practice)`
  );

  // Group items
  const passedItems = report.items.filter((item) => item.status === "pass");
  const failedItems = report.items.filter((item) => item.status === "fail");
  const skippedItems = report.items.filter((item) => item.status === "skip");

  // Print PASSED section
  if (passedItems.length > 0) {
    console.log("");
    console.log(chalk.bold.green(`  ✔ PASSED CHECKS (${passedItems.length})`));
    printSeparator();
    for (const item of passedItems) {
      printItem(item);
    }
  }

  // Print FAILED sections grouped by severity
  if (failedItems.length > 0) {
    console.log("");
    console.log(chalk.bold.red(`  ✖ FAILED CHECKS (${failedItems.length})`));
    printSeparator();

    const failedErrors = failedItems.filter((item) => item.severity === "error");
    const failedWarns = failedItems.filter((item) => item.severity === "warn");
    const failedInfos = failedItems.filter((item) => item.severity === "info");

    // Print failed ERRORS
    if (failedErrors.length > 0) {
      console.log("");
      console.log(chalk.red(chalk.bold(`    ● ERRORS (${failedErrors.length})`)));
      for (const item of failedErrors) {
        console.log("");
        printItem(item);
      }
    }

    // Print failed WARNINGS
    if (failedWarns.length > 0) {
      console.log("");
      console.log(chalk.yellow(chalk.bold(`    ● WARNINGS (${failedWarns.length})`)));
      for (const item of failedWarns) {
        console.log("");
        printItem(item);
      }
    }

    // Print failed INFO
    if (failedInfos.length > 0) {
      console.log("");
      console.log(chalk.blue(chalk.bold(`    ● INFO (${failedInfos.length})`)));
      for (const item of failedInfos) {
        console.log("");
        printItem(item);
      }
    }
  }

  // Print SKIPPED section (if any)
  if (skippedItems.length > 0) {
    console.log("");
    console.log(chalk.bold.gray(`  - SKIPPED CHECKS (${skippedItems.length})`));
    printSeparator();
    for (const item of skippedItems) {
      printItem(item);
    }
  }

  // Footer Box
  const failCount = report.summary.fail;
  console.log("");
  if (failCount === 0) {
    console.log(chalk.green(`  ┌${"─".repeat(70)}┐`));
    console.log(chalk.green(`  │`) + chalk.bold.green("  ✔ All audits passed successfully!                                   ") + chalk.green(`│`));
    console.log(chalk.green(`  └${"─".repeat(70)}┘`));
  } else {
    console.log(chalk.yellow(`  ┌${"─".repeat(70)}┐`));
    console.log(chalk.yellow(`  │`) + chalk.bold.yellow("  ⚠ Audit completed with warnings/errors. Check issues above.         ") + chalk.yellow(`│`));
    console.log(chalk.yellow(`  └${"─".repeat(70)}┘`));
  }
  console.log("");
}
