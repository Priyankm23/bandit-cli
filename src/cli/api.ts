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

function normalizePath(filePath: string): string {
  let normalized = filePath.replace(/\\/g, "/");
  const winDriveRegex = /^([A-Z]):\//;
  const match = normalized.match(winDriveRegex);
  if (match) {
    normalized = normalized.replace(winDriveRegex, `${match[1].toLowerCase()}:/`);
  }
  return normalized;
}

function resolveImport(sourceFile: string, importPath: string, projectPath: string): string | null {
  let absolutePath = "";
  if (importPath.startsWith("@/") || importPath.startsWith("~/")) {
    const relativePart = importPath.slice(2);
    absolutePath = path.resolve(projectPath, "src", relativePart);
  } else if (importPath.startsWith("src/")) {
    absolutePath = path.resolve(projectPath, importPath);
  } else if (importPath.startsWith(".")) {
    const sourceDir = path.dirname(sourceFile);
    absolutePath = path.resolve(sourceDir, importPath);
  } else {
    return null;
  }

  const extensions = [".ts", ".js", ".tsx", ".jsx"];
  for (const ext of extensions) {
    const fileWithExt = absolutePath + ext;
    if (fs.existsSync(fileWithExt)) {
      return normalizePath(fileWithExt);
    }
  }

  if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).isDirectory()) {
    for (const ext of extensions) {
      const indexFile = path.join(absolutePath, "index" + ext);
      if (fs.existsSync(indexFile)) {
        return normalizePath(indexFile);
      }
      const routerFile = path.join(absolutePath, "router" + ext);
      if (fs.existsSync(routerFile)) {
        return normalizePath(routerFile);
      }
    }
  }

  return null;
}

function parseImportNames(importClause: string): { localName: string }[] {
  const names: { localName: string }[] = [];
  importClause = importClause.trim();

  const nsMatch = importClause.match(/\*\s+as\s+([a-zA-Z0-9_$]+)/);
  if (nsMatch) {
    names.push({ localName: nsMatch[1] });
    return names;
  }

  const destructureMatch = importClause.match(/\{([\s\S]*?)\}/);
  if (destructureMatch) {
    const content = destructureMatch[1];
    const parts = content.split(",");
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const aliasMatch = trimmed.match(/([a-zA-Z0-9_$]+)\s+as\s+([a-zA-Z0-9_$]+)/);
      if (aliasMatch) {
        names.push({ localName: aliasMatch[2] });
      } else {
        const nameMatch = trimmed.match(/^([a-zA-Z0-9_$]+)$/);
        if (nameMatch) {
          names.push({ localName: nameMatch[1] });
        }
      }
    }
    const beforeDestruct = importClause.split("{")[0].trim().replace(/,$/, "").trim();
    if (beforeDestruct && !beforeDestruct.startsWith("import")) {
      names.push({ localName: beforeDestruct });
    }
    return names;
  }

  if (importClause && !importClause.includes("{") && !importClause.includes("*")) {
    names.push({ localName: importClause });
  }
  return names;
}

function resolvePaths(pref: string, p: string): string {
  let combined = `${pref}/${p}`.replace(/\/+/g, "/");
  if (!combined.startsWith("/")) combined = "/" + combined;
  if (combined.length > 1 && combined.endsWith("/")) {
    combined = combined.slice(0, -1);
  }
  return combined;
}

interface GraphNode {
  id: string; // "file:F" or "var:F:V"
  type: "file" | "var";
  filePath: string;
  varName?: string;
  prefixes: Set<string>;
}

interface GraphEdge {
  from: string;
  to: string;
  path: string;
}

// Scans files for common route definitions and mounts
export async function scanForRoutes(projectPath: string): Promise<DiscoveredRoute[]> {
  projectPath = normalizePath(projectPath);
  const routes: DiscoveredRoute[] = [];
  const files = (await fg(["src/**/*.{ts,js}", "*.{ts,js}", "routes/**/*.{ts,js}", "controllers/**/*.{ts,js}"], {
    cwd: projectPath,
    absolute: true,
    ignore: ["**/node_modules/**", "**/dist/**", "**/*.test.{ts,js}", "**/*.spec.{ts,js}"],
  })).map(normalizePath);


  const importsByFile = new Map<string, Map<string, string>>();

  // Step 1: Scan imports & requires for all files
  for (const file of files) {
    const localToTarget = new Map<string, string>();
    try {
      const content = fs.readFileSync(file, "utf-8");
      
      const esImportRegex = /import\s+([\s\S]*?)\s+from\s+['"`]([^'"`]+)['"`]/g;
      let match;
      while ((match = esImportRegex.exec(content)) !== null) {
        const importClause = match[1];
        const importPath = match[2];
        const targetFile = resolveImport(file, importPath, projectPath);
        if (targetFile) {
          const names = parseImportNames(importClause);
          for (const name of names) {
            localToTarget.set(name.localName, targetFile);
          }
        }
      }

      const requireRegex = /(?:const|let|var)\s+([\s\S]*?)\s*=\s*require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
      while ((match = requireRegex.exec(content)) !== null) {
        const varClause = match[1];
        const importPath = match[2];
        const targetFile = resolveImport(file, importPath, projectPath);
        if (targetFile) {
          const names = parseImportNames(varClause);
          for (const name of names) {
            localToTarget.set(name.localName, targetFile);
          }
        }
      }
    } catch {}
    importsByFile.set(file, localToTarget);
  }

  // Step 2: Build Dependency Graph Nodes and Edges
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  const ensureNode = (id: string, type: "file" | "var", filePath: string, varName?: string) => {
    if (!nodes.has(id)) {
      nodes.set(id, { id, type, filePath, varName, prefixes: new Set<string>() });
    }
  };

  // Create file nodes
  for (const file of files) {
    ensureNode(`file:${file}`, "file", file);
  }

  // Pre-populate route variable nodes from route declarations
  const routeVarPattern = /\b([a-zA-Z0-9_]+)\.(get|post|put|delete|patch|options|head)\s*\(/gi;
  for (const file of files) {
    try {
      const content = fs.readFileSync(file, "utf-8");
      let match;
      routeVarPattern.lastIndex = 0;
      while ((match = routeVarPattern.exec(content)) !== null) {
        const instanceName = match[1];
        ensureNode(`var:${file}:${instanceName}`, "var", file, instanceName);
      }
    } catch {}
  }

  const mountPattern = /\b([a-zA-Z0-9_]+)\.(use|route|group)\s*\(\s*(?:['"`]([^'"`]+)['"`]\s*,\s*)?(?:require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)|([a-zA-Z0-9_]+))/gi;

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, "utf-8");
      let match;
      mountPattern.lastIndex = 0;
      while ((match = mountPattern.exec(content)) !== null) {
        const parentVar = match[1];
        const mountPath = match[3] || "/";
        const inlineRequire = match[4];
        const childVar = match[5];

        const parentId = `var:${file}:${parentVar}`;
        ensureNode(parentId, "var", file, parentVar);

        if (inlineRequire) {
          const targetFile = resolveImport(file, inlineRequire, projectPath);
          if (targetFile) {
            const targetFileId = `file:${targetFile}`;
            ensureNode(targetFileId, "file", targetFile);
            edges.push({ from: parentId, to: targetFileId, path: mountPath });
          }
        } else if (childVar) {
          const childId = `var:${file}:${childVar}`;
          ensureNode(childId, "var", file, childVar);
          edges.push({ from: parentId, to: childId, path: mountPath });

          // Check if childVar is imported
          const targetFile = importsByFile.get(file)?.get(childVar);
          if (targetFile) {
            const targetFileId = `file:${targetFile}`;
            ensureNode(targetFileId, "file", targetFile);
            edges.push({ from: childId, to: targetFileId, path: "/" });
          }
        }
      }
    } catch {}
  }

  // Step 3: Link file nodes to their root variables within that file
  for (const file of files) {
    const fileId = `file:${file}`;
    // Find all variable nodes in this file
    const varNodesInFile = Array.from(nodes.values()).filter(
      (n) => n.type === "var" && n.filePath === file
    );

    for (const vNode of varNodesInFile) {
      // Is there an incoming edge to this variable from another variable/file in the same file?
      const hasIncomingLocal = edges.some(
        (e) => e.to === vNode.id && e.from.startsWith(`var:${file}:`)
      );

      if (!hasIncomingLocal) {
        // It is a root variable in this file, link the file node to it
        edges.push({ from: fileId, to: vNode.id, path: "/" });
      }
    }
  }

  // Step 4: Identify entry points and initialize their prefixes
  // Entry points are file nodes that have no incoming edges from OTHER files
  const fileIncomingFromOthers = new Set<string>();
  for (const edge of edges) {
    if (edge.to.startsWith("file:")) {
      const fromFile = nodes.get(edge.from)?.filePath;
      const toFile = nodes.get(edge.to)?.filePath;
      if (fromFile && toFile && fromFile !== toFile) {
        fileIncomingFromOthers.add(edge.to);
      }
    }
  }

  for (const file of files) {
    const fileId = `file:${file}`;
    if (!fileIncomingFromOthers.has(fileId)) {
      const fNode = nodes.get(fileId);
      if (fNode) {
        fNode.prefixes.add("/");
      }
    }
  }

  // Step 5: Propagate prefixes using BFS
  const queue: string[] = [];
  for (const node of nodes.values()) {
    if (node.prefixes.size > 0) {
      queue.push(node.id);
    }
  }

  const inQueue = new Set<string>(queue);

  while (queue.length > 0) {
    const currId = queue.shift()!;
    inQueue.delete(currId);
    const currNode = nodes.get(currId);
    if (!currNode) continue;

    // Find outgoing edges
    const outgoing = edges.filter((e) => e.from === currId);
    for (const edge of outgoing) {
      const targetNode = nodes.get(edge.to);
      if (!targetNode) continue;

      let changed = false;
      for (const pref of currNode.prefixes) {
        const combined = resolvePaths(pref, edge.path);
        if (!targetNode.prefixes.has(combined)) {
          targetNode.prefixes.add(combined);
          changed = true;
        }
      }

      if (changed && !inQueue.has(edge.to)) {
        queue.push(edge.to);
        inQueue.add(edge.to);
      }
    }
  }

  // Step 6: Scan files for actual routes and use propagated prefixes
  const expressPattern = /\b([a-zA-Z0-9_]+)\.(get|post|put|delete|patch|options|head)\s*\(\s*['"`]([^'"`\s]+)['"`]/gi;
  const nestPattern = /@(Get|Post|Put|Delete|Patch)\s*\(\s*['"`]([^'"`\s]+)['"`]/gi;
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

        const varNodeId = `var:${file}:${instanceName}`;
        const varNode = nodes.get(varNodeId);

        const targetPrefixes = (varNode && varNode.prefixes.size > 0)
          ? Array.from(varNode.prefixes)
          : ["/"];

        for (const prefix of targetPrefixes) {
          const rPath = resolvePaths(prefix, subPath);
          routes.push({
            method,
            routePath: rPath,
            sourceFile: relativePath,
          });
        }
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
