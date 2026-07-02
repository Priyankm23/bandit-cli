import * as clack from "@clack/prompts";
import chalk from "chalk";
import { exec } from "node:child_process";
import { startStudioServer } from "../studio/server.js";

export async function runStudioCommand(projectPath: string = ".") {
  clack.intro(chalk.bold.bgBlue.white(" Bandit Studio "));

  const s = clack.spinner();
  s.start("Starting Bandit Studio local server...");

  try {
    const { server, port } = await startStudioServer(projectPath, 4000);
    const url = `http://localhost:${port}`;
    s.stop(`Bandit Studio server running at ${chalk.bold.cyan(url)}`);

    clack.log.info("Press Ctrl+C to stop the studio server.");

    let isShuttingDown = false;
    const shutdown = () => {
      if (isShuttingDown) return;
      isShuttingDown = true;
      console.log(chalk.bold.yellow("\nStopping Bandit Studio server... Goodbye!"));
      try {
        server.close();
      } catch {}
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    // Windows PowerShell / Terminal raw input listener for Ctrl+C (\u0003)
    if (process.stdin.isTTY) {
      try {
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on("data", (chunk) => {
          const str = chunk.toString();
          if (str === "\u0003" || str === "\u001b" || str.includes("\u0003")) {
            shutdown();
          }
        });
      } catch {}
    }

    // Attempt auto-opening browser
    const startCmd = process.platform === "win32" ? `start ${url}` : process.platform === "darwin" ? `open ${url}` : `xdg-open ${url}`;
    exec(startCmd, (err) => {
      if (err) {
        clack.log.warn(`Could not open browser automatically. Please open ${url} in your browser.`);
      }
    });
  } catch (err: any) {
    s.stop("Failed to start Bandit Studio server.");
    clack.log.error(`Server startup error: ${err.message}`);
  }
}
