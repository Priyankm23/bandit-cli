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
