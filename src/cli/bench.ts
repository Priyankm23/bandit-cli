import { performance } from "node:perf_hooks";
import * as clack from "@clack/prompts";
import chalk from "chalk";

interface BenchOptions {
  connections: number;
  requests: number;
}

export async function runBenchCommand(targetUrl: string, opts: BenchOptions) {
  clack.intro(chalk.bold.bgBlue.white(" Bandit Load Benchmarker "));
  clack.log.info(`Target URL: ${chalk.bold.cyan(targetUrl)}`);
  clack.log.info(`Config: ${chalk.bold(opts.requests)} requests total, ${chalk.bold(opts.connections)} concurrent connections`);

  const s = clack.spinner();
  s.start("Pre-flight ping to check endpoint availability...");
  try {
    const res = await fetch(targetUrl);
    s.stop(`Ping successful (Status ${res.status}). Starting load test...`);
  } catch (err: any) {
    s.stop("Pre-flight ping failed.");
    clack.log.error(`Cannot contact target: ${err.message}`);
    clack.outro(chalk.red("Benchmark aborted."));
    return;
  }

  const latencies: number[] = [];
  let successCount = 0;
  let failCount = 0;
  let completedCount = 0;

  const requestTimes: { start: number; end: number; success: boolean }[] = [];

  const startBenchmark = performance.now();

  // Create a queue of requests
  const runWorker = async () => {
    while (completedCount < opts.requests) {
      const currentReqIndex = completedCount++;
      if (currentReqIndex >= opts.requests) break;

      const reqStart = performance.now();
      try {
        const res = await fetch(targetUrl);
        const reqEnd = performance.now();
        const duration = reqEnd - reqStart;
        latencies.push(duration);

        if (res.ok) {
          successCount++;
          requestTimes.push({ start: reqStart, end: reqEnd, success: true });
        } else {
          failCount++;
          requestTimes.push({ start: reqStart, end: reqEnd, success: false });
        }
      } catch (err) {
        const reqEnd = performance.now();
        const duration = reqEnd - reqStart;
        latencies.push(duration);
        failCount++;
        requestTimes.push({ start: reqStart, end: reqEnd, success: false });
      }
    }
  };

  // Run workers concurrently
  const workers: Promise<void>[] = [];
  for (let i = 0; i < opts.connections; i++) {
    workers.push(runWorker());
  }

  s.start(`Firing requests... (Completed: 0/${opts.requests})`);
  
  // Periodically update progress
  const progressInterval = setInterval(() => {
    s.message(`Firing requests... (Completed: ${Math.min(completedCount, opts.requests)}/${opts.requests})`);
  }, 100);

  await Promise.all(workers);
  clearInterval(progressInterval);

  const endBenchmark = performance.now();
  s.stop(`Load test completed!`);

  const totalTimeSec = (endBenchmark - startBenchmark) / 1000;
  const rps = opts.requests / totalTimeSec;

  if (latencies.length === 0) {
    clack.outro(chalk.red("No requests completed successfully."));
    return;
  }

  // Calculate statistics
  latencies.sort((a, b) => a - b);
  const min = latencies[0];
  const max = latencies[latencies.length - 1];
  const sum = latencies.reduce((a, b) => a + b, 0);
  const avg = sum / latencies.length;

  const getPercentile = (p: number) => {
    const idx = Math.floor((p / 100) * (latencies.length - 1));
    return latencies[idx];
  };

  const p50 = getPercentile(50);
  const p90 = getPercentile(90);
  const p95 = getPercentile(95);
  const p99 = getPercentile(99);

  // Render Stats
  console.log("");
  console.log(chalk.bold.cyan("📊 BENCHMARK SUMMARY"));
  console.log(chalk.gray("──────────────────────────────────────────────────"));
  console.log(`  Total Time Taken:  ${chalk.bold(totalTimeSec.toFixed(3))} seconds`);
  console.log(`  Throughput:        ${chalk.bold.green(rps.toFixed(2))} req/sec`);
  console.log(`  Successful Reqs:   ${chalk.green(successCount)}`);
  console.log(`  Failed Reqs:       ${failCount > 0 ? chalk.red(failCount) : chalk.gray(failCount)}`);
  console.log(chalk.gray("──────────────────────────────────────────────────"));
  console.log(chalk.bold.cyan("⏱  LATENCY STATS"));
  console.log(chalk.gray("──────────────────────────────────────────────────"));
  console.log(`  Min Latency:       ${min.toFixed(2)} ms`);
  console.log(`  Avg Latency:       ${avg.toFixed(2)} ms`);
  console.log(`  Max Latency:       ${max.toFixed(2)} ms`);
  console.log(`  p50 (Median):      ${chalk.yellow(p50.toFixed(2))} ms`);
  console.log(`  p90:               ${p90.toFixed(2)} ms`);
  console.log(`  p95:               ${p95.toFixed(2)} ms`);
  console.log(`  p99 (Tail):        ${chalk.red(p99.toFixed(2))} ms`);
  console.log(chalk.gray("──────────────────────────────────────────────────"));

  // Draw ASCII Latency Distribution Histogram
  console.log(chalk.bold.cyan("📈 LATENCY DISTRIBUTION"));
  console.log(chalk.gray("──────────────────────────────────────────────────"));

  const bucketCount = 8;
  const bucketSize = (max - min) / bucketCount || 1;
  const buckets = new Array(bucketCount).fill(0);

  for (const lat of latencies) {
    let bIdx = Math.floor((lat - min) / bucketSize);
    if (bIdx >= bucketCount) bIdx = bucketCount - 1;
    buckets[bIdx]++;
  }

  const maxBucketVal = Math.max(...buckets) || 1;
  const maxBarWidth = 35;

  for (let i = 0; i < bucketCount; i++) {
    const rangeStart = min + i * bucketSize;
    const rangeEnd = rangeStart + bucketSize;
    const count = buckets[i];
    const percentage = (count / latencies.length) * 100;

    const barWidth = Math.round((count / maxBucketVal) * maxBarWidth);
    const bar = "█".repeat(barWidth) + "░".repeat(Math.max(0, maxBarWidth - barWidth));

    const label = `${rangeStart.toFixed(1).padStart(6)}ms - ${rangeEnd.toFixed(1).padStart(6)}ms`;
    console.log(
      `  ${chalk.gray(label)} : [${chalk.green(bar)}] ${count.toString().padStart(4)} (${percentage.toFixed(1)}%)`
    );
  }
  console.log(chalk.gray("──────────────────────────────────────────────────"));
  
  try {
    const { StudioDB } = await import("../studio/db.js");
    const db = new StudioDB();
    db.saveBenchmark({
      targetUrl,
      connections: opts.connections,
      requests: opts.requests,
      rps,
      latency: { min, avg, max, p50, p90, p95, p99 },
    });
  } catch {}

  clack.outro(chalk.bold.green("Benchmark complete!"));
}
