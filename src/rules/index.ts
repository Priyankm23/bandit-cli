// File: src/rules/index.ts
import { Rule } from "../core/types.js";
import { rulePackageJsonExists } from "./mvp.rules.js";
import { ruleEnvExists } from "./mvp.rules.js";
import { ruleEnvExampleExists } from "./mvp.rules.js";
import { ruleEnvInGitignore } from "./mvp.rules.js";
import { ruleDockerfileExists } from "./mvp.rules.js";
import { ruleHasTestScript } from "./mvp.rules.js";
import {
  ruleSrcFolderExists,
  ruleDetectFramework,
  ruleSecurityDeps,
  ruleGlobalErrorHandler,
} from "./phase2.rules.js";
import {
  ruleLoggingSetup,
  ruleEnvValidation,
  ruleDatabaseSetup,
  ruleTypeScriptStrict,
  ruleProductionDeps,
} from "./phase3.rules.js";

export const rules: Rule[] = [
  // Phase 1 - MVP checks
  rulePackageJsonExists,
  ruleEnvExists,
  ruleEnvExampleExists,
  ruleEnvInGitignore,
  ruleDockerfileExists,
  ruleHasTestScript,

  // Phase 2 - Structure + detection + security
  ruleSrcFolderExists,
  ruleDetectFramework,
  ruleSecurityDeps,
  ruleGlobalErrorHandler,

  // Phase 3 - Production readiness
  ruleLoggingSetup,
  ruleEnvValidation,
  ruleDatabaseSetup,
  ruleTypeScriptStrict,
  ruleProductionDeps,
];
