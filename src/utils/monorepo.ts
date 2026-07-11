import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import * as clack from "@clack/prompts";
import chalk from "chalk";

interface Service {
  name: string;
  path: string;
  framework: string;
}

function detectFramework(pkg: any): string {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const frameworks: Record<string, string> = {
    express: "Express",
    "@nestjs/core": "NestJS",
    fastify: "Fastify",
    koa: "Koa",
    hapi: "Hapi",
  };

  for (const [dep, label] of Object.entries(frameworks)) {
    if (deps[dep]) {
      return label;
    }
  }
  return "gRPC / Library";
}

export async function resolveProjectPath(inputPath: string = "."): Promise<string> {
  const absoluteRoot = path.resolve(inputPath);
  
  // Find all package.json files, ignoring dependency and output directories
  const packageFiles = await fg(["**/package.json"], {
    cwd: absoluteRoot,
    absolute: true,
    ignore: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/coverage/**"],
  });

  if (packageFiles.length <= 1) {
    // If only one package.json (or none) is found, bypass selection
    return inputPath;
  }

  const services: Service[] = [];
  
  for (const file of packageFiles) {
    try {
      const content = fs.readFileSync(file, "utf-8");
      const pkg = JSON.parse(content);
      const dir = path.dirname(file);
      
      services.push({
        name: pkg.name || path.basename(dir),
        path: dir,
        framework: detectFramework(pkg),
      });
    } catch {}
  }

  // Sort services by name alphabetically
  services.sort((a, b) => a.name.localeCompare(b.name));

  clack.log.info(
    `${chalk.bold.yellow("Monorepo detected!")} Found ${chalk.bold.cyan(services.length)} nested packages.`
  );

  const options = services.map((s) => {
    const relPath = path.relative(absoluteRoot, s.path) || ".";
    const fwLabel = s.framework === "gRPC / Library"
      ? chalk.dim(s.framework)
      : chalk.cyan(s.framework);
    return {
      value: s.path,
      label: `${chalk.bold.green(s.name)} ${chalk.gray(`(${relPath})`)} - ${fwLabel}`,
    };
  });

  const selectedPath = await clack.select({
    message: "Select a microservice to target:",
    options: [
      ...options,
      { value: "cancel", label: chalk.gray("Cancel / Exit") },
    ] as any,
  });

  if (clack.isCancel(selectedPath) || selectedPath === "cancel") {
    clack.outro("Execution stopped.");
    process.exit(0);
  }

  const relSelected = path.relative(absoluteRoot, selectedPath as string) || ".";
  clack.log.step(`Target set to: ${chalk.bold.magenta(relSelected)}`);
  console.log(""); // Empty line for spacing

  return selectedPath as string;
}
