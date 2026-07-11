// File: src/rules/mvp.rules.ts
import path from "node:path";
import { Rule } from "../core/types.js";
import { exists, readText } from "../utils/fs.js";
import { readPackageJson, hasScript } from "../utils/packageJson.js";

export const rulePackageJsonExists: Rule = {
  id: "pkg-json-exists",
  title: "package.json exists",
  severity: "error",
  async run(ctx) {
    const ok = exists(ctx.packageJsonPath);

    return {
      id: this.id,
      title: this.title,
      severity: this.severity,
      status: ok ? "pass" : "fail",
      details: ok ? undefined : "package.json not found.",
      suggestion: ok ? undefined : "Run `npm init -y` in the project root.",
    };
  },
};

export const ruleEnvExists: Rule = {
  id: "env-exists",
  title: ".env exists",
  severity: "warn",
  async run(ctx) {
    const envPath = path.join(ctx.projectPath, ".env");
    const ok = exists(envPath);

    return {
      id: this.id,
      title: this.title,
      severity: this.severity,
      status: ok ? "pass" : "fail",
      details: ok ? undefined : ".env not found.",
      suggestion: ok ? undefined : "Create a local .env file for development.",
    };
  },
};

export const ruleEnvExampleExists: Rule = {
  id: "env-example-exists",
  title: ".env.example exists",
  severity: "info",
  async run(ctx) {
    const envExamplePath = path.join(ctx.projectPath, ".env.example");
    const ok = exists(envExamplePath);

    return {
      id: this.id,
      title: this.title,
      severity: this.severity,
      status: ok ? "pass" : "fail",
      details: ok ? undefined : ".env.example not found.",
      suggestion: ok
        ? undefined
        : "Create .env.example listing all required env keys (without real secrets).",
    };
  },
};

export const ruleEnvInGitignore: Rule = {
  id: "env-in-gitignore",
  title: ".env is ignored in .gitignore",
  severity: "error",
  async run(ctx) {
    const gitignorePath = path.join(ctx.projectPath, ".gitignore");
    const gitignore = readText(gitignorePath);

    if (!gitignore) {
      return {
        id: this.id,
        title: this.title,
        severity: this.severity,
        status: "fail",
        details: ".gitignore not found.",
        suggestion: "Create a .gitignore and add `.env` to it.",
      };
    }
    const lines = gitignore
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));

    const ok = lines.includes(".env") || lines.includes(".env*");

    return {
      id: this.id,
      title: this.title,
      severity: this.severity,
      status: ok ? "pass" : "fail",
      details: ok ? undefined : "`.env` is not ignored.",
      suggestion: ok
        ? undefined
        : "Add `.env` to .gitignore to avoid leaking secrets.",
    };
  },
};

export const ruleDockerfileExists: Rule = {
  id: "dockerfile-exists",
  title: "Dockerfile exists",
  severity: "info",
  async run(ctx) {
    const dockerfilePath = path.join(ctx.projectPath, "Dockerfile");
    const ok = exists(dockerfilePath);

    return {
      id: this.id,
      title: this.title,
      severity: this.severity,
      status: ok ? "pass" : "fail",
      details: ok ? undefined : "Dockerfile not found.",
      suggestion: ok
        ? undefined
        : "If you plan to containerize this backend, add a Dockerfile.",
    };
  },
};

export const ruleHasTestScript: Rule = {
  id: "test-script-exists",
  title: "package.json contains a test script",
  severity: "warn",
  async run(ctx) {
    const pkg = readPackageJson(ctx.packageJsonPath);

    if (!pkg) {
      return {
        id: this.id,
        title: this.title,
        severity: this.severity,
        status: "skip",
        details: "Could not read/parse package.json.",
        suggestion: "Fix package.json JSON syntax.",
      };
    }

    const ok = hasScript(pkg, "test");

    return {
      id: this.id,
      title: this.title,
      severity: this.severity,
      status: ok ? "pass" : "fail",
      details: ok ? undefined : "No `test` script found.",
      suggestion: ok
        ? undefined
        : "Add a test runner (jest/vitest) and a `test` script.",
    };
  },
};

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

export const ruleEnvKeysMatch: Rule = {
  id: "env-keys-match",
  title: ".env aligns with .env.example",
  severity: "warn",
  async run(ctx) {
    const envPath = path.join(ctx.projectPath, ".env");
    const envExamplePath = path.join(ctx.projectPath, ".env.example");

    if (!exists(envPath) || !exists(envExamplePath)) {
      return {
        id: this.id,
        title: this.title,
        severity: this.severity,
        status: "skip",
        details: "Requires both .env and .env.example files to run comparison.",
      };
    }

    try {
      const envContent = readText(envPath) || "";
      const exampleContent = readText(envExamplePath) || "";

      const envKeys = parseEnvContent(envContent);
      const exampleKeys = parseEnvContent(exampleContent);

      const missing: string[] = [];
      const extra: string[] = [];
      const placeholders: string[] = [];

      for (const key of exampleKeys.keys()) {
        if (!envKeys.has(key)) {
          missing.push(key);
        } else {
          const val = envKeys.get(key)!;
          if (
            val === "" ||
            val === "your_key_here" ||
            val === "placeholder" ||
            val.includes("TODO")
          ) {
            placeholders.push(key);
          }
        }
      }

      for (const key of envKeys.keys()) {
        if (!exampleKeys.has(key)) {
          extra.push(key);
        }
      }

      if (missing.length === 0 && extra.length === 0 && placeholders.length === 0) {
        return {
          id: this.id,
          title: this.title,
          severity: this.severity,
          status: "pass",
          details: ".env has all keys defined in .env.example with active values.",
        };
      }

      const issues: string[] = [];
      if (missing.length > 0) {
        issues.push(`Missing keys: ${missing.join(", ")}`);
      }
      if (placeholders.length > 0) {
        issues.push(`Placeholder/Empty values: ${placeholders.join(", ")}`);
      }
      if (extra.length > 0) {
        issues.push(`Extra keys: ${extra.join(", ")}`);
      }

      return {
        id: this.id,
        title: this.title,
        severity: this.severity,
        status: "fail",
        details: issues.join(" | "),
        suggestion: "Update your .env or .env.example to keep them in sync and replace any placeholders.",
      };
    } catch (err: any) {
      return {
        id: this.id,
        title: this.title,
        severity: this.severity,
        status: "fail",
        details: `Failed to compare env files: ${err.message}`,
        suggestion: "Ensure env files are valid text files.",
      };
    }
  },
};
