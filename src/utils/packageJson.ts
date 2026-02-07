// File: src/utils/packageJson.ts
import { readText } from "./fs.js";
import { Framework } from "../core/types.js";

type Pkg = {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

export function readPackageJson(packageJsonPath: string): Pkg | null {
  const txt = readText(packageJsonPath);
  if (!txt) return null;

  try {
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

export function hasScript(pkg: Pkg, name: string): boolean {
  return Boolean(pkg?.scripts?.[name]);
}

export function hasDependency(
  pkg: Pkg,
  name: string,
  checkDev = false,
): boolean {
  const inDeps = Boolean(pkg?.dependencies?.[name]);
  const inDevDeps = checkDev ? Boolean(pkg?.devDependencies?.[name]) : false;
  return inDeps || inDevDeps;
}

export function detectFramework(pkg: Pkg): Framework {
  if (hasDependency(pkg, "express")) return "express";
  if (hasDependency(pkg, "fastify")) return "fastify";
  if (hasDependency(pkg, "@nestjs/core")) return "nest";
  if (hasDependency(pkg, "hono")) return "hono";
  return "unknown";
}

export function hasAnyDependency(
  pkg: Pkg,
  names: string[],
  checkDev = false,
): boolean {
  return names.some((name) => hasDependency(pkg, name, checkDev));
}

export function getDependenciesInWrongScope(
  pkg: Pkg,
  devToolPatterns: string[],
): string[] {
  const prodDeps = pkg?.dependencies || {};
  const wrongDeps: string[] = [];

  for (const dep of Object.keys(prodDeps)) {
    // Check if this dependency matches any dev tool pattern
    const isDevTool = devToolPatterns.some((pattern) => {
      if (pattern.endsWith("/")) {
        // Pattern like "@types/" - check if dep starts with it
        return dep.startsWith(pattern);
      }
      // Exact match
      return dep === pattern;
    });

    if (isDevTool) {
      wrongDeps.push(dep);
    }
  }

  return wrongDeps;
}
