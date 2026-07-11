import fs from "node:fs";
import path from "node:path";
import * as clack from "@clack/prompts";
import chalk from "chalk";

function parseEnvContent(content: string): Map<string, string> {
  const map = new Map<string, string>();
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const firstEqual = trimmed.indexOf("=");
    if (firstEqual === -1) continue;

    const key = trimmed.slice(0, firstEqual).trim();
    let val = trimmed.slice(firstEqual + 1).trim();

    // Strip quotes if any
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    map.set(key, val);
  }
  return map;
}

export async function runEnvCommand(projectPath: string = ".") {
  clack.intro(chalk.bold.bgBlue.white(" Bandit Environment Auditor "));

  const absoluteProjectPath = path.resolve(projectPath);
  const examplePath = path.join(absoluteProjectPath, ".env.example");

  if (!fs.existsSync(examplePath)) {
    clack.log.warn(
      `No ${chalk.cyan(".env.example")} file found in the root of the project.`,
    );
    clack.log.info(
      "Create a .env.example containing your environment variable keys as placeholders.",
    );
    clack.outro(chalk.red("Failed to audit environment variables."));
    return;
  }

  let exampleKeysMap: Map<string, string>;
  try {
    const exampleContent = fs.readFileSync(examplePath, "utf-8");
    exampleKeysMap = parseEnvContent(exampleContent);
  } catch (err: any) {
    clack.log.error(`Failed to read .env.example: ${err.message}`);
    clack.outro(chalk.red("Failed to audit environment variables."));
    return;
  }

  const exampleKeys = Array.from(exampleKeysMap.keys());
  clack.log.info(
    `Found ${chalk.bold.cyan(exampleKeys.length)} keys in .env.example`,
  );

  // Scan for active .env files
  const files = fs.readdirSync(absoluteProjectPath);
  const envFiles = files.filter(
    (f) => f === ".env" || (f.startsWith(".env.") && !f.endsWith(".example")),
  );

  if (envFiles.length === 0) {
    clack.log.warn(
      "No active environment configuration files (like `.env`, `.env.local`, etc.) detected.",
    );
    clack.outro(chalk.yellow("Done."));
    return;
  }

  for (const envFile of envFiles) {
    const envFilePath = path.join(absoluteProjectPath, envFile);
    clack.log.step(`Auditing ${chalk.bold.magenta(envFile)}...`);

    try {
      const content = fs.readFileSync(envFilePath, "utf-8");
      const currentKeysMap = parseEnvContent(content);

      const missingKeys: string[] = [];
      const emptyKeys: string[] = [];
      const extraKeys: string[] = [];

      // Check for missing or empty keys
      for (const expectedKey of exampleKeys) {
        if (!currentKeysMap.has(expectedKey)) {
          missingKeys.push(expectedKey);
        } else {
          const val = currentKeysMap.get(expectedKey)!;
          if (
            val === "" ||
            val === "your_key_here" ||
            val === "placeholder" ||
            val.includes("TODO")
          ) {
            emptyKeys.push(expectedKey);
          }
        }
      }

      // Check for extra keys (not defined in .env.example)
      for (const currentKey of currentKeysMap.keys()) {
        if (!exampleKeysMap.has(currentKey)) {
          extraKeys.push(currentKey);
        }
      }

      // Output report for this file
      if (
        missingKeys.length === 0 &&
        emptyKeys.length === 0 &&
        extraKeys.length === 0
      ) {
        clack.log.success(
          chalk.green(`  ✔ ${envFile} is perfectly in sync with .env.example!`),
        );
      } else {
        if (missingKeys.length > 0) {
          clack.log.error(
            `  ❌ Missing keys (required by .env.example):\n` +
              missingKeys.map((k) => `     - ${chalk.red(k)}`).join("\n"),
          );
        }
        if (emptyKeys.length > 0) {
          clack.log.warn(
            `  ⚠ Placeholder/Empty values detected:\n` +
              emptyKeys.map((k) => `     - ${chalk.yellow(k)}`).join("\n"),
          );
        }
        if (extraKeys.length > 0) {
          clack.log.info(
            `  ℹ Extra keys (not declared in .env.example):\n` +
              extraKeys.map((k) => `     - ${chalk.cyan(k)}`).join("\n"),
          );
        }
      }
    } catch (err: any) {
      clack.log.error(`  ❌ Failed to read ${envFile}: ${err.message}`);
    }
    console.log("");
  }

  clack.outro(chalk.bold.green("Environment audit finished."));
}
