// File: src/rules/phase3.rules.ts
import path from "node:path";
import { Rule } from "../core/types.js";
import { exists, readText } from "../utils/fs.js";
import {
  readPackageJson,
  hasDependency,
  hasAnyDependency,
  getDependenciesInWrongScope,
} from "../utils/packageJson.js";
import { scanForLoggingUsage } from "../utils/codeScanner.js";

// Rule 11: Logging setup detection
export const ruleLoggingSetup: Rule = {
  id: "logging-setup",
  title: "Logging setup detected",
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

    // Check for professional logging libraries
    const loggingLibs = ["pino", "winston", "bunyan", "log4js"];
    const detected = loggingLibs.filter((lib) => hasDependency(pkg, lib, true));

    if (detected.length === 0) {
      return {
        id: this.id,
        title: this.title,
        severity: this.severity,
        status: "fail",
        details: "No professional logging library detected.",
        suggestion:
          "Install a production-grade logger: `npm install pino` or `npm install winston`",
      };
    }

    // Optional: Check if logging is actually used in code
    const srcPath = path.join(ctx.projectPath, "src");
    if (exists(srcPath)) {
      const isUsed = await scanForLoggingUsage(srcPath, detected);
      if (!isUsed) {
        return {
          id: this.id,
          title: this.title,
          severity: this.severity,
          status: "fail",
          details: `Logging library installed (${detected.join(", ")}) but not imported/used in code.`,
          suggestion: `Import and use ${detected[0]} in your application code.`,
        };
      }
    }

    return {
      id: this.id,
      title: this.title,
      severity: this.severity,
      status: "pass",
      details: `Detected logging: ${detected.join(", ")}`,
    };
  },
};

// Rule 12: Environment variable validation
export const ruleEnvValidation: Rule = {
  id: "env-validation",
  title: "Environment variable validation",
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

    // Check for env validation libraries
    const envValidationLibs = ["zod", "joi", "envsafe", "dotenv-safe", "yup"];
    const detected = envValidationLibs.filter((lib) =>
      hasDependency(pkg, lib, true),
    );

    if (detected.length === 0) {
      return {
        id: this.id,
        title: this.title,
        severity: this.severity,
        status: "fail",
        details: "No environment variable validation library detected.",
        suggestion:
          "Add env validation to prevent runtime crashes:\n\t\t`npm install zod` and validate process.env at startup",
      };
    }

    return {
      id: this.id,
      title: this.title,
      severity: this.severity,
      status: "pass",
      details: `Detected env validation: ${detected.join(", ")}`,
    };
  },
};

// Rule 13: Database setup detection
export const ruleDatabaseSetup: Rule = {
  id: "database-setup",
  title: "Database setup detected",
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
      };
    }

    // Check for ORMs and database clients
    const databases = [
      { name: "Prisma", pkg: "@prisma/client" },
      { name: "TypeORM", pkg: "typeorm" },
      { name: "Drizzle", pkg: "drizzle-orm" },
      { name: "Mongoose", pkg: "mongoose" },
      { name: "Sequelize", pkg: "sequelize" },
      { name: "Knex", pkg: "knex" },
      { name: "PostgreSQL (pg)", pkg: "pg" },
      { name: "MySQL", pkg: "mysql2" },
    ];

    const detected = databases.filter((db) => hasDependency(pkg, db.pkg, true));

    if (detected.length === 0) {
      return {
        id: this.id,
        title: this.title,
        severity: this.severity,
        status: "fail",
        details: "No database ORM or client detected.",
        suggestion:
          "Most backends need a database. Consider Prisma, TypeORM, or a database client.",
      };
    }

    // Check for migration setup (Prisma specific)
    const hasMigrations =
      detected.some((db) => db.name === "Prisma") &&
      exists(path.join(ctx.projectPath, "prisma", "migrations"));

    const migrationInfo = hasMigrations ? " (with migrations)" : "";

    return {
      id: this.id,
      title: this.title,
      severity: this.severity,
      status: "pass",
      details: `Detected database: ${detected.map((db) => db.name).join(", ")}${migrationInfo}`,
    };
  },
};

// Rule 14: TypeScript strict mode check
export const ruleTypeScriptStrict: Rule = {
  id: "typescript-strict",
  title: "TypeScript strict mode enabled",
  severity: "warn",
  async run(ctx) {
    const tsconfigPath = path.join(ctx.projectPath, "tsconfig.json");

    if (!exists(tsconfigPath)) {
      return {
        id: this.id,
        title: this.title,
        severity: this.severity,
        status: "skip",
        details: "tsconfig.json not found (not a TypeScript project).",
      };
    }

    const content = readText(tsconfigPath);
    if (!content) {
      return {
        id: this.id,
        title: this.title,
        severity: this.severity,
        status: "skip",
        details: "Could not read tsconfig.json.",
      };
    }

    let tsconfig: any;
    try {
      // Remove comments for JSON parsing (basic approach)
      const jsonContent = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
      tsconfig = JSON.parse(jsonContent);
    } catch {
      return {
        id: this.id,
        title: this.title,
        severity: this.severity,
        status: "skip",
        details: "Could not parse tsconfig.json.",
      };
    }

    const compilerOptions = tsconfig.compilerOptions || {};
    const isStrict = compilerOptions.strict === true;

    if (!isStrict) {
      return {
        id: this.id,
        title: this.title,
        severity: this.severity,
        status: "fail",
        details: "TypeScript strict mode is not enabled.",
        suggestion:
          'Enable strict mode in tsconfig.json: set "strict": true in compilerOptions',
      };
    }

    return {
      id: this.id,
      title: this.title,
      severity: this.severity,
      status: "pass",
      details: "TypeScript strict mode is enabled.",
    };
  },
};

// Rule 15: Production dependencies audit
export const ruleProductionDeps: Rule = {
  id: "production-deps-audit",
  title: "Production dependencies audit",
  severity: "error",
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

    // Dev tools that should NOT be in production dependencies
    const devToolPatterns = [
      "nodemon",
      "ts-node",
      "tsx",
      "@types/",
      "eslint",
      "prettier",
      "jest",
      "vitest",
      "mocha",
      "chai",
      "@testing-library",
      "webpack-dev-server",
      "vite",
    ];

    const wrongDeps = getDependenciesInWrongScope(pkg, devToolPatterns);

    if (wrongDeps.length === 0) {
      return {
        id: this.id,
        title: this.title,
        severity: this.severity,
        status: "pass",
        details: "No dev tools found in production dependencies.",
      };
    }

    return {
      id: this.id,
      title: this.title,
      severity: this.severity,
      status: "fail",
      details: `Dev tools found in dependencies (should be in devDependencies): ${wrongDeps.join(", ")}`,
      suggestion: `Move to devDependencies: ${wrongDeps.map((dep) => `npm install -D ${dep}`).join(" && ")}`,
    };
  },
};
