import path from "node:path";
import { AuditContext } from "./types.js";

export function makeContext(projectPath: string): AuditContext {
  return {
    projectPath,
    packageJsonPath: path.join(projectPath, "package.json"),
  };
}
