import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import * as clack from "@clack/prompts";
import chalk from "chalk";

interface DiscoveredRoute {
  method: string;
  routePath: string;
  sourceFile: string;
}

// Scans files for common route definitions and mounts
async function scanForRoutes(projectPath: string): Promise<DiscoveredRoute[]> {
  const routes: DiscoveredRoute[] = [];
  const files = await fg(["src/**/*.{ts,js}", "*.{ts,js}", "routes/**/*.{ts,js}", "controllers/**/*.{ts,js}"], {
    cwd: projectPath,
    absolute: true,
    ignore: ["**/node_modules/**", "**/dist/**", "**/*.test.{ts,js}", "**/*.spec.{ts,js}"],
  });

  const prefixMap = new Map<string, string>();

  // Regex to detect router mounts, e.g. app.use('/api/v1/auth', authRouter) or router.use('/auth', authRouter)
  // Group 3 matches the path prefix, Group 4 matches the router variable name
  const mountPattern = /\b([a-zA-Z0-9_]+)\.(use|route|group)\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*([a-zA-Z0-9_]+)/gi;

  // Read files first to construct prefixMap
  for (const file of files) {
    try {
      const content = fs.readFileSync(file, "utf-8");
      let match;
      mountPattern.lastIndex = 0;
      while ((match = mountPattern.exec(content)) !== null) {
        const prefix = match[3];
        const routerName = match[4];
        if (prefix && routerName && routerName !== "express" && routerName !== "cors" && routerName !== "helmet") {
          prefixMap.set(routerName, prefix);
        }
      }
    } catch {}
  }

  // Regex patterns
  // 1. Generic Router paths: authRouter.post('/login', ...)
  // Group 1 matches the router variable, Group 2 matches method, Group 3 matches endpoint path
  const expressPattern = /\b([a-zA-Z0-9_]+)\.(get|post|put|delete|patch|options|head)\s*\(\s*['"`]([^'"`\s]+)['"`]/gi;
  // 2. NestJS decorators: @Get('/path')
  const nestPattern = /@(Get|Post|Put|Delete|Patch)\s*\(\s*['"`]([^'"`\s]+)['"`]/gi;
  // 3. NestJS controllers: @Controller('/prefix')
  const controllerPattern = /@Controller\s*\(\s*['"`]([^'"`\s]+)['"`]/gi;

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, "utf-8");
      const relativePath = path.relative(projectPath, file);

      // NestJS controller prefix
      let controllerPrefix = "";
      const cMatch = [...content.matchAll(controllerPattern)];
      if (cMatch.length > 0) {
        controllerPrefix = cMatch[0][1];
        if (controllerPrefix === "/") controllerPrefix = "";
      }

      // 1. Express-style
      let match;
      expressPattern.lastIndex = 0;
      while ((match = expressPattern.exec(content)) !== null) {
        const instanceName = match[1];
        const method = match[2].toUpperCase();
        const subPath = match[3];

        let rPath = subPath;
        // If the instanceName has a registered mount prefix, prepend it!
        if (prefixMap.has(instanceName)) {
          const prefix = prefixMap.get(instanceName)!.replace(/\/$/, "");
          rPath = `${prefix}/${subPath.replace(/^\//, "")}`;
        }

        // Clean up double slashes
        rPath = rPath.replace(/\/+/g, "/");
        if (!rPath.startsWith("/")) rPath = `/${rPath}`;

        routes.push({
          method,
          routePath: rPath,
          sourceFile: relativePath,
        });
      }

      // 2. NestJS
      nestPattern.lastIndex = 0;
      while ((match = nestPattern.exec(content)) !== null) {
        const method = match[1].toUpperCase();
        let subPath = match[2];
        if (subPath === "/") subPath = "";

        const fullPath = `${controllerPrefix.replace(/\/$/, "")}/${subPath.replace(/^\//, "")}`;
        let rPath = fullPath.startsWith("/") ? fullPath : `/${fullPath}`;
        rPath = rPath.replace(/\/+/g, "/");

        routes.push({
          method: method === "DELETE" ? "DELETE" : method,
          routePath: rPath,
          sourceFile: relativePath,
        });
      }
    } catch {}
  }

  // Deduplicate routes by method + routePath
  const seen = new Set<string>();
  const uniqueRoutes: DiscoveredRoute[] = [];
  for (const r of routes) {
    const key = `${r.method}-${r.routePath}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueRoutes.push(r);
    }
  }

  return uniqueRoutes.sort((a, b) => a.routePath.localeCompare(b.routePath));
}

// Detect potential local server port from project files
function detectLocalPort(projectPath: string): number {
  try {
    const envPath = path.join(projectPath, ".env");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      const portMatch = content.match(/^PORT\s*=\s*(\d+)/m);
      if (portMatch) {
        return parseInt(portMatch[1], 10);
      }
    }
  } catch {}
  return 3000;
}

export async function runApiCommand(
  methodOrPath: string = ".",
  routePath?: string,
  opts: any = {}
) {
  const httpMethods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"];
  const isDirectMode = routePath !== undefined && httpMethods.includes(methodOrPath.toUpperCase());

  if (isDirectMode) {
    const finalMethod = methodOrPath.toUpperCase();
    const finalPath = routePath!;

    // Resolve base URL
    const absoluteProjectPath = path.resolve(".");
    const port = detectLocalPort(absoluteProjectPath);
    let baseUrl = opts.url || `http://localhost:${port}`;
    baseUrl = baseUrl.replace(/\/$/, "");

    // Resolve Headers
    const headers: Record<string, string> = {
      Accept: "application/json, text/plain, */*",
    };

    if (opts.token) {
      headers["Authorization"] = `Bearer ${opts.token}`;
    }

    if (opts.body) {
      headers["Content-Type"] = "application/json";
    }

    // Parse custom headers -H "Key: Val"
    if (opts.header) {
      const hList = Array.isArray(opts.header) ? opts.header : [opts.header];
      for (const h of hList) {
        const colonIdx = h.indexOf(":");
        if (colonIdx !== -1) {
          const key = h.slice(0, colonIdx).trim();
          const val = h.slice(colonIdx + 1).trim();
          headers[key] = val;
        }
      }
    }

    const finalUrl = `${baseUrl}${finalPath}`;
    clack.intro(chalk.bold.bgBlue.white(" Bandit Direct API Request "));
    clack.log.info(`Sending ${chalk.bold.green(finalMethod)} request to ${chalk.cyan(finalUrl)}...`);

    const s = clack.spinner();
    s.start("Executing request...");
    try {
      const start = performance.now();
      const res = await fetch(finalUrl, {
        method: finalMethod,
        headers,
        ...(opts.body ? { body: opts.body } : {}),
      });
      const end = performance.now();
      const duration = end - start;

      s.stop(`Request completed in ${duration.toFixed(1)}ms.`);

      const contentType = res.headers.get("content-type") || "";
      const resText = await res.text();

      console.log("\n" + chalk.bold.cyan("📬 RESPONSE"));
      console.log(chalk.gray("──────────────────────────────────────────────────"));
      console.log(`Status:  ${res.status >= 200 && res.status < 300 ? chalk.bold.green(res.status) : chalk.bold.red(res.status)} ${res.statusText}`);
      console.log(`Time:    ${duration.toFixed(1)} ms`);
      console.log(chalk.gray("──────────────────────────────────────────────────"));
      console.log(chalk.bold.cyan("Headers:"));
      res.headers.forEach((val, key) => {
        console.log(`  ${chalk.gray(key)}: ${val}`);
      });
      console.log(chalk.gray("──────────────────────────────────────────────────"));
      console.log(chalk.bold.cyan("Body:"));

      if (contentType.includes("application/json")) {
        try {
          const parsed = JSON.parse(resText);
          console.log(chalk.green(JSON.stringify(parsed, null, 2)));
        } catch {
          console.log(resText);
        }
      } else {
        console.log(resText || chalk.italic.gray("<empty body>"));
      }
      console.log(chalk.gray("──────────────────────────────────────────────────"));
    } catch (err: any) {
      s.stop("Request failed.");
      clack.log.error(`Fetch execution error: ${err.message}`);
    }
    clack.outro(chalk.bold.green("Direct API call complete."));
    return;
  }

  clack.intro(chalk.bold.bgBlue.white(" Bandit Interactive API Client "));

  const absoluteProjectPath = path.resolve(methodOrPath);
  const s = clack.spinner();
  s.start("Scanning codebase for API endpoints...");
  const discoveredRoutes = await scanForRoutes(absoluteProjectPath);
  s.stop(`Scan complete. Discovered ${chalk.bold.cyan(discoveredRoutes.length)} unique route(s).`);

  const detectedPort = detectLocalPort(absoluteProjectPath);
  const detectedUrl = `http://localhost:${detectedPort}`;

  // Common ports to offer
  const defaultPorts = [3000, 8080, 5000, 5500, 8000];
  const urlOptions = [{ value: detectedUrl, label: `${detectedUrl} (Detected)` }];

  for (const p of defaultPorts) {
    const url = `http://localhost:${p}`;
    if (p !== detectedPort) {
      urlOptions.push({ value: url, label: url });
    }
  }

  const serverUrlSelection = await clack.select({
    message: "Select your server's base URL:",
    options: [
      ...urlOptions,
      { value: "custom", label: "+ Enter a custom base URL manually" },
    ] as any,
  });

  if (clack.isCancel(serverUrlSelection)) {
    clack.outro("Execution stopped.");
    return;
  }

  let baseUrl = "";
  if (serverUrlSelection === "custom") {
    const customUrlInput = await clack.text({
      message: "Enter custom base URL:",
      placeholder: "http://localhost:3000",
      validate: (v) => {
        if (!v || !v.trim()) return "Base URL cannot be empty";
        if (!v.startsWith("http://") && !v.startsWith("https://")) {
          return "URL must start with http:// or https://";
        }
        return undefined;
      },
    });

    if (clack.isCancel(customUrlInput)) {
      clack.outro("Execution stopped.");
      return;
    }
    baseUrl = (customUrlInput as string).trim();
  } else {
    baseUrl = serverUrlSelection as string;
  }

  baseUrl = baseUrl.replace(/\/$/, "");

  // Compile options
  const routeOptions = discoveredRoutes.map((r) => ({
    value: r,
    label: `[${chalk.bold.green(r.method)}] ${r.routePath} ${chalk.gray(`(${r.sourceFile})`)}`,
  }));

  const selectedRoute = (await clack.select({
    message: "Choose an endpoint to request:",
    options: [
      ...routeOptions,
      { value: "custom", label: chalk.yellow("+ Enter a custom route path manually") },
    ] as any,
  })) as DiscoveredRoute | "custom" | symbol;

  if (clack.isCancel(selectedRoute)) {
    clack.outro("Execution stopped.");
    return;
  }

  let finalMethod = "GET";
  let finalPath = "";

  if (selectedRoute === "custom") {
    const customMethod = (await clack.select({
      message: "Select HTTP Method:",
      options: [
        { value: "GET", label: "GET" },
        { value: "POST", label: "POST" },
        { value: "PUT", label: "PUT" },
        { value: "PATCH", label: "PATCH" },
        { value: "DELETE", label: "DELETE" },
      ],
    })) as string | symbol;

    if (clack.isCancel(customMethod)) {
      clack.outro("Execution stopped.");
      return;
    }
    finalMethod = customMethod as string;

    const customPath = await clack.text({
      message: "Enter route path:",
      placeholder: "/api/v1/users",
      validate: (v) => (!v || !v.startsWith("/") ? "Route path must start with a slash '/'" : undefined),
    });

    if (clack.isCancel(customPath)) {
      clack.outro("Execution stopped.");
      return;
    }
    finalPath = customPath as string;
  } else {
    finalMethod = selectedRoute.method;

    // Let the developer confirm and edit the path (highly convenient for prefix additions!)
    const editPath = await clack.text({
      message: "Confirm or edit the route path:",
      defaultValue: selectedRoute.routePath,
      placeholder: selectedRoute.routePath,
      validate: (v) => (!v || !v.startsWith("/") ? "Route path must start with a slash '/'" : undefined),
    });

    if (clack.isCancel(editPath)) {
      clack.outro("Execution stopped.");
      return;
    }
    finalPath = editPath as string;
  }

  // 1. Process Path Parameters if any (e.g. /users/:id or /users/{id})
  const pathParamPattern = /:([a-zA-Z0-9_]+)|\{([a-zA-Z0-9_]+)\}/g;
  let matches;
  const pathParams: string[] = [];
  while ((matches = pathParamPattern.exec(finalPath)) !== null) {
    const paramName = matches[1] || matches[2];
    if (paramName && !pathParams.includes(paramName)) {
      pathParams.push(paramName);
    }
  }

  let resolvedPath = finalPath;
  for (const param of pathParams) {
    const val = await clack.text({
      message: `Enter value for path parameter [${chalk.bold.yellow(param)}]:`,
      validate: (v) => (!v || !v.trim() ? "Parameter value cannot be empty" : undefined),
    });

    if (clack.isCancel(val)) {
      clack.outro("Execution stopped.");
      return;
    }

    resolvedPath = resolvedPath
      .replace(`:${param}`, val as string)
      .replace(`{${param}}`, val as string);
  }

  // 2. Process Query Params if needed
  const addQueryParams = await clack.confirm({
    message: "Do you want to add query parameters?",
    initialValue: false,
  });

  if (clack.isCancel(addQueryParams)) {
    clack.outro("Execution stopped.");
    return;
  }

  let queryStr = "";
  if (addQueryParams) {
    const qParams = await clack.text({
      message: "Enter query string:",
      placeholder: "limit=10&page=1",
    });

    if (clack.isCancel(qParams)) {
      clack.outro("Execution stopped.");
      return;
    }

    const trimmed = (qParams as string).trim();
    if (trimmed) {
      queryStr = trimmed.startsWith("?") ? trimmed : `?${trimmed}`;
    }
  }

  // 3. Process Request Body if POST/PUT/PATCH (Interactive Key-Value Editor!)
  let requestBody: string | undefined;
  if (["POST", "PUT", "PATCH"].includes(finalMethod)) {
    const enterBody = await clack.confirm({
      message: "Do you want to send a JSON request body?",
      initialValue: true,
    });

    if (clack.isCancel(enterBody)) {
      clack.outro("Execution stopped.");
      return;
    }

    if (enterBody) {
      const bodyInputType = await clack.select({
        message: "How would you like to enter the JSON body?",
        options: [
          { value: "kv", label: "Interactive Key-Value builder (Easy/Convenient)" },
          { value: "raw", label: "Paste raw JSON string" },
        ],
      });

      if (clack.isCancel(bodyInputType)) {
        clack.outro("Execution stopped.");
        return;
      }

      if (bodyInputType === "kv") {
        const bodyObj: Record<string, any> = {};
        let addingFields = true;

        while (addingFields) {
          const fieldKey = await clack.text({
            message: "Enter field key:",
            placeholder: "e.g. email",
          });

          if (clack.isCancel(fieldKey) || !fieldKey || !fieldKey.trim()) break;

          const fieldVal = await clack.text({
            message: `Enter value for '${fieldKey.trim()}':`,
            placeholder: "e.g. raj@example.com",
          });

          if (clack.isCancel(fieldVal)) break;

          const trimmedVal = (fieldVal as string).trim();
          let parsedVal: any = trimmedVal;

          // Smart casting
          if (trimmedVal.toLowerCase() === "true") parsedVal = true;
          else if (trimmedVal.toLowerCase() === "false") parsedVal = false;
          else if (trimmedVal.toLowerCase() === "null") parsedVal = null;
          else if (!isNaN(Number(trimmedVal)) && trimmedVal !== "") parsedVal = Number(trimmedVal);

          bodyObj[fieldKey.trim()] = parsedVal;

          const addMore = await clack.confirm({
            message: "Add another field to the request body?",
            initialValue: false,
          });

          if (clack.isCancel(addMore) || !addMore) {
            addingFields = false;
          }
        }
        requestBody = JSON.stringify(bodyObj);
      } else {
        // Raw JSON input
        const bodyInput = await clack.text({
          message: "Enter JSON payload:",
          placeholder: '{"name": "Alice", "email": "alice@gmail.com"}',
          validate: (v) => {
            if (!v || !v.trim()) return undefined;
            try {
              JSON.parse(v);
              return undefined;
            } catch {
              return "Invalid JSON syntax. Please enter valid JSON.";
            }
          },
        });

        if (clack.isCancel(bodyInput)) {
          clack.outro("Execution stopped.");
          return;
        }

        const val = (bodyInput as string).trim();
        if (val) {
          requestBody = val;
        }
      }
    }
  }

  // 4. Custom Headers Editor
  const customHeaders: Record<string, string> = {};
  const addHeaders = await clack.confirm({
    message: "Do you want to add custom request headers?",
    initialValue: false,
  });

  if (clack.isCancel(addHeaders)) {
    clack.outro("Execution stopped.");
    return;
  }

  if (addHeaders) {
    let addingHeaders = true;
    while (addingHeaders) {
      const headerKey = await clack.text({
        message: "Enter Header Name:",
        placeholder: "e.g. X-Custom-Key",
      });

      if (clack.isCancel(headerKey) || !headerKey || !headerKey.trim()) break;

      const headerVal = await clack.text({
        message: `Enter value for '${headerKey.trim()}':`,
        placeholder: "e.g. test-value",
      });

      if (clack.isCancel(headerVal)) break;

      customHeaders[headerKey.trim()] = (headerVal as string).trim();

      const addMoreHeaders = await clack.confirm({
        message: "Add another custom header?",
        initialValue: false,
      });

      if (clack.isCancel(addMoreHeaders) || !addMoreHeaders) {
        addingHeaders = false;
      }
    }
  }

  // 5. Prompt for Authorization Header (Bearer token)
  const addAuth = await clack.confirm({
    message: "Do you want to add an Authorization Bearer token?",
    initialValue: false,
  });

  if (clack.isCancel(addAuth)) {
    clack.outro("Execution stopped.");
    return;
  }

  let bearerToken: string | undefined;
  if (addAuth) {
    const tokenInput = await clack.text({
      message: "Enter Bearer Token:",
      placeholder: "eyJhbGciOi...",
      validate: (v) => (!v || !v.trim() ? "Token cannot be empty" : undefined),
    });

    if (clack.isCancel(tokenInput)) {
      clack.outro("Execution stopped.");
      return;
    }
    bearerToken = (tokenInput as string).trim();
  }

  // Confirm and Execute Request
  const finalUrl = `${baseUrl}${resolvedPath}${queryStr}`;
  clack.log.info(`Ready to request: ${chalk.bold.green(finalMethod)} ${chalk.cyan(finalUrl)}`);
  
  if (Object.keys(customHeaders).length > 0) {
    clack.log.info(`Headers:\n${chalk.gray(JSON.stringify(customHeaders, null, 2))}`);
  }
  if (bearerToken) {
    const preview = bearerToken.length > 12 ? `${bearerToken.slice(0, 8)}...` : bearerToken;
    clack.log.info(`Auth: Bearer ${preview} (masked)`);
  }
  if (requestBody) {
    clack.log.info(`Body:\n${chalk.gray(JSON.stringify(JSON.parse(requestBody), null, 2))}`);
  }

  const proceed = await clack.confirm({
    message: "Execute request?",
    initialValue: true,
  });

  if (clack.isCancel(proceed) || !proceed) {
    clack.outro("Aborted.");
    return;
  }

  s.start(`Sending ${finalMethod} request to ${finalUrl}...`);
  try {
    const start = performance.now();
    const headers: Record<string, string> = {
      Accept: "application/json, text/plain, */*",
      ...(requestBody ? { "Content-Type": "application/json" } : {}),
      ...customHeaders,
    };

    if (bearerToken) {
      headers["Authorization"] = `Bearer ${bearerToken}`;
    }

    const fetchOptions: RequestInit = {
      method: finalMethod,
      headers,
      ...(requestBody ? { body: requestBody } : {}),
    };

    const res = await fetch(finalUrl, fetchOptions);
    const end = performance.now();
    const duration = end - start;

    s.stop(`Request completed in ${chalk.bold.yellow(duration.toFixed(1))}ms.`);

    // Read response text or json
    const contentType = res.headers.get("content-type") || "";
    const resText = await res.text();

    console.log("\n" + chalk.bold.cyan("📬 RESPONSE"));
    console.log(chalk.gray("──────────────────────────────────────────────────"));
    console.log(`Status:  ${res.status >= 200 && res.status < 300 ? chalk.bold.green(res.status) : chalk.bold.red(res.status)} ${res.statusText}`);
    console.log(`Time:    ${duration.toFixed(1)} ms`);
    console.log(chalk.gray("──────────────────────────────────────────────────"));
    console.log(chalk.bold.cyan("Headers:"));
    res.headers.forEach((val, key) => {
      console.log(`  ${chalk.gray(key)}: ${val}`);
    });
    console.log(chalk.gray("──────────────────────────────────────────────────"));
    console.log(chalk.bold.cyan("Body:"));

    if (contentType.includes("application/json")) {
      try {
        const parsed = JSON.parse(resText);
        console.log(chalk.green(JSON.stringify(parsed, null, 2)));
      } catch {
        console.log(resText);
      }
    } else {
      console.log(resText || chalk.italic.gray("<empty body>"));
    }
    console.log(chalk.gray("──────────────────────────────────────────────────"));
  } catch (err: any) {
    s.stop("Request failed.");
    clack.log.error(`Fetch execution error: ${err.message}`);
  }

  clack.outro(chalk.bold.green("API Playfield session complete."));
}
