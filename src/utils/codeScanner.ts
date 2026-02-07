// File: src/utils/codeScanner.ts
import { readText } from "./fs.js";
import fg from "fast-glob";

/**
 * Scans source files for Express global error handler pattern:
 * app.use((err, req, res, next) => ...)
 */
export async function scanForErrorHandler(srcPath: string): Promise<boolean> {
  // Search for .ts and .js files in src/
  const files = await fg(["**/*.ts", "**/*.js"], {
    cwd: srcPath,
    absolute: true,
    ignore: ["node_modules", "dist", "build"],
  });

  // Pattern to detect error handler middleware (4 params with err as first)
  // Look for variations:
  // - app.use((err, req, res, next) =>
  // - app.use(function(err, req, res, next)
  // - (err, req, res, next) => with error handling inside
  const errorHandlerPatterns = [
    /app\.use\s*\(\s*\(\s*err\s*,\s*req\s*,\s*res\s*,\s*next\s*\)/i,
    /app\.use\s*\(\s*function\s*\(\s*err\s*,\s*req\s*,\s*res\s*,\s*next\s*\)/i,
    /app\.use\s*\(\s*async\s*\(\s*err\s*,\s*req\s*,\s*res\s*,\s*next\s*\)/i,
  ];

  for (const file of files) {
    const content = readText(file);
    if (!content) continue;

    // Check if any error handler pattern is found
    for (const pattern of errorHandlerPatterns) {
      if (pattern.test(content)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Scans source files to check if any of the logging libraries are imported/used
 */
export async function scanForLoggingUsage(
  srcPath: string,
  loggingLibs: string[],
): Promise<boolean> {
  // Search for .ts and .js files in src/
  const files = await fg(["**/*.ts", "**/*.js"], {
    cwd: srcPath,
    absolute: true,
    ignore: ["node_modules", "dist", "build"],
  });

  // Create import patterns for each logging library
  // e.g., import pino from 'pino', require('winston'), etc.
  const importPatterns = loggingLibs.flatMap((lib) => [
    new RegExp(`import\\s+.*from\\s+['"]${lib}['"]`, "i"),
    new RegExp(`require\\s*\\(\\s*['"]${lib}['"]\\s*\\)`, "i"),
  ]);

  for (const file of files) {
    const content = readText(file);
    if (!content) continue;

    // Check if any import pattern is found
    for (const pattern of importPatterns) {
      if (pattern.test(content)) {
        return true;
      }
    }
  }

  return false;
}
