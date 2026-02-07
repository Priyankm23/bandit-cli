// File: src/rules/phase2.rules.ts
import path from "node:path";
import { Rule } from "../core/types.js";
import { exists } from "../utils/fs.js";
import {
  readPackageJson,
  hasDependency,
  detectFramework,
} from "../utils/packageJson.js";
import { scanForErrorHandler } from "../utils/codeScanner.js";

// Rule 7: src/ folder exists
export const ruleSrcFolderExists: Rule = {
  id: "src-folder-exists",
  title: "src/ folder exists",
  severity: "warn",
  async run(ctx) {
    const srcPath = path.join(ctx.projectPath, "src");
    const ok = exists(srcPath);

    return {
      id: this.id,
      title: this.title,
      severity: this.severity,
      status: ok ? "pass" : "fail",
      details: ok ? undefined : "src/ folder not found.",
      suggestion: ok
        ? undefined
        : "Create a src/ folder to organize your backend code.",
    };
  },
};

// Rule 8: Detect backend framework
export const ruleDetectFramework: Rule = {
  id: "detect-framework",
  title: "Detect backend framework",
  severity: "info",
  async run(ctx) {
    const pkg = readPackageJson(ctx.packageJsonPath);

    if (!pkg) {
      return {
        id: this.id,
        title: this.title,
        severity: this.severity,
        status: "skip",
        details: "Could not read package.json.",
        suggestion: "Fix package.json JSON syntax.",
      };
    }

    const framework = detectFramework(pkg);

    // Update context with detected framework for subsequent rules
    ctx.framework = framework;

    if (framework === "unknown") {
      return {
        id: this.id,
        title: this.title,
        severity: this.severity,
        status: "fail",
        details: "No known backend framework detected.",
        suggestion:
          "Consider using a popular framework like Express, Fastify, NestJS, or Hono.",
      };
    }

    return {
      id: this.id,
      title: this.title,
      severity: this.severity,
      status: "pass",
      details: `Detected framework: ${framework}`,
    };
  },
};

// Rule 9: Security dependencies check (framework-dependent)
export const ruleSecurityDeps: Rule = {
  id: "security-deps",
  title: "Security dependencies check",
  severity: "warn",
  async run(ctx) {
    const pkg = readPackageJson(ctx.packageJsonPath);

    if (!pkg) {
      return {
        id: this.id,
        title: this.title,
        severity: this.severity,
        status: "skip",
        details: "Could not read package.json.",
      };
    }

    const framework = ctx.framework || detectFramework(pkg);

    // For Express, check helmet and cors
    if (framework === "express") {
      const hasHelmet = hasDependency(pkg, "helmet");
      const hasCors = hasDependency(pkg, "cors");

      if (!hasHelmet && !hasCors) {
        return {
          id: this.id,
          title: this.title,
          severity: this.severity,
          status: "fail",
          details: "Missing security dependencies: helmet and cors not found.",
          suggestion: "Install: `npm install helmet cors`",
        };
      }

      if (!hasHelmet) {
        return {
          id: this.id,
          title: this.title,
          severity: this.severity,
          status: "fail",
          details: "helmet is not installed.",
          suggestion: "Install: `npm install helmet`",
        };
      }

      if (!hasCors) {
        return {
          id: this.id,
          title: this.title,
          severity: this.severity,
          status: "fail",
          details: "cors is not installed.",
          suggestion: "Install: `npm install cors`",
        };
      }

      return {
        id: this.id,
        title: this.title,
        severity: this.severity,
        status: "pass",
        details: "helmet and cors are installed.",
      };
    }

    // For Fastify
    if (framework === "fastify") {
      const hasHelmet = hasDependency(pkg, "@fastify/helmet");
      const hasCors = hasDependency(pkg, "@fastify/cors");

      if (!hasHelmet && !hasCors) {
        return {
          id: this.id,
          title: this.title,
          severity: this.severity,
          status: "fail",
          details:
            "Missing security dependencies: @fastify/helmet and @fastify/cors not found.",
          suggestion: "Install: `npm install @fastify/helmet @fastify/cors`",
        };
      }

      if (!hasHelmet) {
        return {
          id: this.id,
          title: this.title,
          severity: this.severity,
          status: "fail",
          details: "@fastify/helmet is not installed.",
          suggestion: "Install: `npm install @fastify/helmet`",
        };
      }

      if (!hasCors) {
        return {
          id: this.id,
          title: this.title,
          severity: this.severity,
          status: "fail",
          details: "@fastify/cors is not installed.",
          suggestion: "Install: `npm install @fastify/cors`",
        };
      }

      return {
        id: this.id,
        title: this.title,
        severity: this.severity,
        status: "pass",
        details: "@fastify/helmet and @fastify/cors are installed.",
      };
    }

    // For NestJS, security is built-in but can check helmet
    if (framework === "nest") {
      return {
        id: this.id,
        title: this.title,
        severity: this.severity,
        status: "pass",
        details:
          "NestJS has built-in security features. Consider adding helmet.",
      };
    }

    // For other frameworks or unknown
    return {
      id: this.id,
      title: this.title,
      severity: this.severity,
      status: "skip",
      details: `Security checks not defined for framework: ${framework}`,
    };
  },
};

// Rule 10: Global error handler present
export const ruleGlobalErrorHandler: Rule = {
  id: "global-error-handler",
  title: "Global error handler present",
  severity: "warn",
  async run(ctx) {
    const srcPath = path.join(ctx.projectPath, "src");

    if (!exists(srcPath)) {
      return {
        id: this.id,
        title: this.title,
        severity: this.severity,
        status: "skip",
        details: "src/ folder not found, skipping code scan.",
      };
    }

    const framework = ctx.framework || "unknown";

    // For Express, look for error handler middleware pattern
    if (framework === "express") {
      const found = await scanForErrorHandler(srcPath);

      if (!found) {
        return {
          id: this.id,
          title: this.title,
          severity: this.severity,
          status: "fail",
          details: "No global error handler middleware found.",
          suggestion:
            "Add app.use((err, req, res, next) => {...}) after all routes.",
        };
      }

      return {
        id: this.id,
        title: this.title,
        severity: this.severity,
        status: "pass",
        details: "Global error handler detected.",
      };
    }

    // For other frameworks, skip for now
    return {
      id: this.id,
      title: this.title,
      severity: this.severity,
      status: "skip",
      details: `Error handler check not implemented for framework: ${framework}`,
    };
  },
};
