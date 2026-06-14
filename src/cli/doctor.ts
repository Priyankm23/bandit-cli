import * as clack from "@clack/prompts";
import chalk from "chalk";

interface DoctorResult {
  title: string;
  status: "pass" | "fail" | "warn";
  details?: string;
  suggestion?: string;
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 4000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

function findSensitiveKeys(obj: any): string[] {
  const sensitiveKeywords = [
    "password", "hashed_password", "salt", "secret", "ssn", 
    "credit_card", "creditcard", "passwd", "token", "auth_token"
  ];
  const found: string[] = [];

  function search(current: any) {
    if (!current || typeof current !== "object") return;
    for (const key of Object.keys(current)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeywords.includes(lowerKey)) {
        found.push(key);
      }
      search(current[key]);
    }
  }

  search(obj);
  return found;
}

export async function runDoctorCommand(targetUrl: string = "http://localhost:3000") {
  clack.intro(chalk.bold.bgBlue.white(" Bandit Live Server Doctor "));
  clack.log.info(`Target URL: ${chalk.bold.cyan(targetUrl)}`);

  const s = clack.spinner();
  s.start("Connecting to target server...");

  let rootResponse: Response;
  try {
    rootResponse = await fetchWithTimeout(targetUrl);
    s.stop("Connection established.");
  } catch (err: any) {
    s.stop("Connection failed.");
    clack.log.error(`Could not connect to ${targetUrl}: ${err.message}`);
    clack.log.info("Make sure your backend server is running locally and listening on the specified port.");
    clack.outro(chalk.red("Execution stopped."));
    return;
  }

  const reports: DoctorResult[] = [];

  // 1. Audit Security Headers
  s.start("Auditing response headers...");
  const headers = rootResponse.headers;

  // X-Powered-By
  const xPoweredBy = headers.get("x-powered-by");
  if (xPoweredBy) {
    reports.push({
      title: "Information Disclosure (X-Powered-By)",
      status: "warn",
      details: `Leaks software stack info: ${xPoweredBy}`,
      suggestion: "Disable X-Powered-By header (e.g. `app.disable('x-powered-by')` in Express or use Helmet).",
    });
  } else {
    reports.push({
      title: "Information Disclosure (X-Powered-By)",
      status: "pass",
      details: "X-Powered-By header is hidden.",
    });
  }

  // X-Frame-Options
  const xFrameOptions = headers.get("x-frame-options");
  if (!xFrameOptions || (!xFrameOptions.toLowerCase().includes("deny") && !xFrameOptions.toLowerCase().includes("sameorigin"))) {
    reports.push({
      title: "Clickjacking Protection (X-Frame-Options)",
      status: "warn",
      details: xFrameOptions ? `Weak policy: ${xFrameOptions}` : "Header missing",
      suggestion: "Set X-Frame-Options to DENY or SAMEORIGIN.",
    });
  } else {
    reports.push({
      title: "Clickjacking Protection (X-Frame-Options)",
      status: "pass",
      details: `Configured: ${xFrameOptions}`,
    });
  }

  // X-Content-Type-Options
  const xContentTypeOptions = headers.get("x-content-type-options");
  if (!xContentTypeOptions || xContentTypeOptions.toLowerCase() !== "nosniff") {
    reports.push({
      title: "MIME-Sniffing Protection (X-Content-Type-Options)",
      status: "warn",
      details: xContentTypeOptions ? `Weak policy: ${xContentTypeOptions}` : "Header missing",
      suggestion: "Set X-Content-Type-Options to 'nosniff'.",
    });
  } else {
    reports.push({
      title: "MIME-Sniffing Protection (X-Content-Type-Options)",
      status: "pass",
      details: "Configured: nosniff",
    });
  }

  // CORS Access-Control-Allow-Origin
  const corsOrigin = headers.get("access-control-allow-origin");
  if (corsOrigin === "*") {
    reports.push({
      title: "CORS Wildcard Check",
      status: "warn",
      details: "Access-Control-Allow-Origin is set to wildcard '*'",
      suggestion: "For APIs processing cookies or credentials, restrict origin to specific domains.",
    });
  } else {
    reports.push({
      title: "CORS Wildcard Check",
      status: "pass",
      details: corsOrigin ? `Restricted to: ${corsOrigin}` : "CORS header not present on root (standard behavior for non-CORS requests).",
    });
  }
  s.stop("Response headers audited.");

  // 2. Audit Error Stack Leakage
  s.start("Checking for error stack trace leakage...");
  const dummyUrl = `${targetUrl.replace(/\/$/, "")}/non-existent-bandit-route-${Math.floor(Math.random() * 100000)}`;
  try {
    const errorResponse = await fetchWithTimeout(dummyUrl);
    const bodyText = await errorResponse.text();

    const stackTraceIndicators = [
      "at ",
      "node_modules",
      "Stack Trace",
      "TypeError",
      "ReferenceError",
      "SyntaxError",
      "InternalServerError",
      "sqlite3",
      "mongodb",
      "postgresql",
      "sequelize",
      "prisma",
    ];

    const foundIndicators = stackTraceIndicators.filter((indicator) => bodyText.includes(indicator));

    if (foundIndicators.length > 0) {
      reports.push({
        title: "Stack Trace Leakage Check",
        status: "fail",
        details: `Server leaked stack trace/debug indicators: [${foundIndicators.join(", ")}]`,
        suggestion: "Ensure env is set to production or capture errors globally and hide stack traces from clients.",
      });
    } else {
      reports.push({
        title: "Stack Trace Leakage Check",
        status: "pass",
        details: "No stack traces or internal details leaked in error response.",
      });
    }
  } catch (err: any) {
    reports.push({
      title: "Stack Trace Leakage Check",
      status: "warn",
      details: `Failed to probe error response: ${err.message}`,
    });
  }
  s.stop("Error leakage probe complete.");

  // 3. Oversized Payload Handling
  s.start("Probing oversized payload response...");
  try {
    // 5MB payload
    const largePayload = "A".repeat(5 * 1024 * 1024);
    const postOptions: RequestInit = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ data: largePayload }),
    };

    const payloadResponse = await fetchWithTimeout(targetUrl, postOptions, 5000);

    if (payloadResponse.status === 413) {
      reports.push({
        title: "Oversized Payload Protection",
        status: "pass",
        details: "Server rejected oversized payload with 413 Payload Too Large.",
      });
    } else if (payloadResponse.status >= 200 && payloadResponse.status < 300) {
      reports.push({
        title: "Oversized Payload Protection",
        status: "warn",
        details: `Server accepted a 5MB JSON payload (Status: ${payloadResponse.status})`,
        suggestion: "Set a body limit on your parser (e.g. limit json parser to '1mb' or '100kb').",
      });
    } else {
      reports.push({
        title: "Oversized Payload Protection",
        status: "pass",
        details: `Server responded with ${payloadResponse.status} ${payloadResponse.statusText}`,
      });
    }
  } catch (err: any) {
    if (err.name === "AbortError") {
      reports.push({
        title: "Oversized Payload Protection",
        status: "fail",
        details: "Server timed out (>5s) or hung when processing a 5MB payload.",
        suggestion: "Add payload size limits to parser middleware (e.g., body-parser) to prevent DoS.",
      });
    } else {
      reports.push({
        title: "Oversized Payload Protection",
        status: "warn",
        details: `Connection closed / error during payload transfer: ${err.message}`,
      });
    }
  }
  s.stop("Oversized payload probe complete.");

  // 4. Sensitive Data Leak Scanner
  s.start("Scanning response for sensitive data leakage...");
  try {
    const rootText = await rootResponse.text();
    let rootJson: any = null;
    try {
      rootJson = JSON.parse(rootText);
    } catch {}

    if (rootJson) {
      const leaked = findSensitiveKeys(rootJson);
      if (leaked.length > 0) {
        reports.push({
          title: "Sensitive Data Leak Check",
          status: "fail",
          details: `Root JSON response exposed sensitive field(s): [${leaked.join(", ")}]`,
          suggestion: "Remove database columns like password/salt/secret from response serializers/DTOs.",
        });
      } else {
        reports.push({
          title: "Sensitive Data Leak Check",
          status: "pass",
          details: "No sensitive fields leaked in root JSON response.",
        });
      }
    } else {
      reports.push({
        title: "Sensitive Data Leak Check",
        status: "pass",
        details: "Root response did not return JSON (no leaks scanned).",
      });
    }
  } catch (err: any) {
    reports.push({
      title: "Sensitive Data Leak Check",
      status: "warn",
      details: `Failed to audit sensitive data leaks: ${err.message}`,
    });
  }
  s.stop("Sensitive data scan complete.");

  // 5. Active Security Penetration Probes (SQLi, NoSQLi, XSS)
  s.start("Executing active security penetration probes...");

  // SQLi Probe
  try {
    const sqliUrl = `${targetUrl.replace(/\/$/, "")}/?id=%27%20OR%20%271%27%3D%271`;
    const sqliRes = await fetchWithTimeout(sqliUrl, {}, 3000);
    const sqliText = await sqliRes.text();

    const sqlErrors = [
      "SQLITE_ERROR",
      "syntax error near",
      "PostgreSQL query failed",
      "mysql server version",
      "MariaDB server version",
      "You have an error in your SQL syntax",
      "pg_query",
    ];

    const leakedSqlError = sqlErrors.find(err => sqliText.toLowerCase().includes(err.toLowerCase()));

    if (leakedSqlError) {
      reports.push({
        title: "SQL Injection (SQLi) Vulnerability Probe",
        status: "fail",
        details: `Server exposed SQL error token [${leakedSqlError}] when queried with SQL injection payload.`,
        suggestion: "Use parameterized queries or ORMs (Prisma/Drizzle) and never concatenate raw inputs into SQL.",
      });
    } else {
      reports.push({
        title: "SQL Injection (SQLi) Vulnerability Probe",
        status: "pass",
        details: "No raw SQL exceptions leaked in response to injection payload.",
      });
    }
  } catch (err: any) {
    reports.push({
      title: "SQL Injection (SQLi) Vulnerability Probe",
      status: "warn",
      details: `Failed to execute SQLi probe: ${err.message}`,
    });
  }

  // XSS Probe
  try {
    const xssPayload = "<script>alert(1)</script>";
    const xssUrl = `${targetUrl.replace(/\/$/, "")}/?search=${encodeURIComponent(xssPayload)}`;
    const xssRes = await fetchWithTimeout(xssUrl, {}, 3000);
    const xssText = await xssRes.text();

    if (xssRes.ok && xssText.includes(xssPayload)) {
      reports.push({
        title: "Cross-Site Scripting (XSS) Vulnerability Probe",
        status: "fail",
        details: "Server reflected unescaped HTML script tags in the response body.",
        suggestion: "Sanitize user inputs and HTML-encode reflected outputs to prevent script execution.",
      });
    } else {
      reports.push({
        title: "Cross-Site Scripting (XSS) Vulnerability Probe",
        status: "pass",
        details: "Input reflected HTML script tags are properly escaped or omitted by the server.",
      });
    }
  } catch (err: any) {
    reports.push({
      title: "Cross-Site Scripting (XSS) Vulnerability Probe",
      status: "warn",
      details: `Failed to execute XSS probe: ${err.message}`,
    });
  }

  // NoSQLi Probe
  try {
    const nosqliUrl = `${targetUrl.replace(/\/$/, "")}/?username[%24ne]=admin`;
    const nosqliRes = await fetchWithTimeout(nosqliUrl, {}, 3000);
    const nosqliText = await nosqliRes.text();

    const nosqlErrors = [
      "MongoError",
      "MongoServerError",
      "CastError",
      "ObjectParameterError",
      "MongooseError",
    ];

    const leakedNoSqlError = nosqlErrors.find(err => nosqliText.toLowerCase().includes(err.toLowerCase()));

    if (leakedNoSqlError) {
      reports.push({
        title: "NoSQL Injection Vulnerability Probe",
        status: "fail",
        details: `Server exposed NoSQL error token [${leakedNoSqlError}] in response to query parameters.`,
        suggestion: "Sanitize input parameters and sanitize mongo operator prefixes ($) using tools like 'mongo-sanitize'.",
      });
    } else {
      reports.push({
        title: "NoSQL Injection Vulnerability Probe",
        status: "pass",
        details: "No NoSQL database exceptions leaked in response to query payload.",
      });
    }
  } catch (err: any) {
    reports.push({
      title: "NoSQL Injection Vulnerability Probe",
      status: "warn",
      details: `Failed to execute NoSQLi probe: ${err.message}`,
    });
  }
  s.stop("Active penetration probes complete.");

  // Print results
  console.log("\n" + chalk.bold("Diagnostic Results:"));
  for (const report of reports) {
    let statusPrefix = "";
    if (report.status === "pass") {
      statusPrefix = chalk.green("✔ [PASS]");
    } else if (report.status === "warn") {
      statusPrefix = chalk.yellow("⚠ [WARN]");
    } else {
      statusPrefix = chalk.red("✖ [FAIL]");
    }

    console.log(`${statusPrefix} ${chalk.bold(report.title)}`);
    if (report.details) {
      console.log(chalk.gray(`   ↳ ${report.details}`));
    }
    if (report.status !== "pass" && report.suggestion) {
      console.log(chalk.cyan(`   ↳ Suggestion: ${report.suggestion}`));
    }
    console.log("");
  }

  clack.outro(chalk.bold.green("Doctor diagnostic scan completed."));
}
