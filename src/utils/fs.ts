// File: src/utils/fs.ts
import fs from "node:fs";

export function exists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

export function readText(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}
