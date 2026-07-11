import fs from "node:fs";
import path from "node:path";
import { scanForRoutes, DiscoveredRoute } from "../cli/api.js";
import { StudioDB } from "./db.js";

export interface BlueprintNode {
  id: string;
  label: string;
  type: "route" | "controller" | "service" | "database" | "cache";
  details?: string;
  authStatus?: "Protected" | "Public";
  metrics?: {
    rps: number;
    p99: number;
    avg: number;
  };
}

export interface BlueprintEdge {
  from: string;
  to: string;
  label?: string;
}

export interface BlueprintGraph {
  nodes: BlueprintNode[];
  edges: BlueprintEdge[];
}

export async function generateApiBlueprint(projectPath: string): Promise<BlueprintGraph> {
  const rawRoutes: DiscoveredRoute[] = await scanForRoutes(projectPath);
  const db = new StudioDB(projectPath);
  const benchmarks = db.getBenchmarks();

  // Filter out non-route scans (like test files or CLI internal strings)
  const routes = rawRoutes.filter(r => 
    !r.sourceFile.includes("cli/") && 
    !r.sourceFile.includes("doctor.") && 
    !r.sourceFile.includes("api.") &&
    r.routePath.startsWith("/") &&
    !r.routePath.includes("-") // exclude header test strings like /access-control-allow-origin
  );

  const nodes: BlueprintNode[] = [];
  const edges: BlueprintEdge[] = [];

  // Infrastructure Nodes
  nodes.push({ id: "db:pg", label: "PostgreSQL Database", type: "database", details: "Primary Data Store & Connection Pool" });
  nodes.push({ id: "cache:redis", label: "Redis Cache Layer", type: "cache", details: "In-Memory Response & Session Cache" });

  const addedControllers = new Set<string>();
  const addedServices = new Set<string>();

  routes.forEach((r, idx) => {
    const routeId = `route:${idx}`;
    const routeLabel = `[${r.method}] ${r.routePath}`;
    
    // Find matching telemetry if benchmarked
    const matchBench = benchmarks.find(b => b.targetUrl.endsWith(r.routePath));
    const metrics = matchBench ? { rps: matchBench.rps, p99: matchBench.latency.p99, avg: matchBench.latency.avg } : undefined;

    // Static Auth Status Detection
    let authStatus: "Protected" | "Public" = "Public";
    try {
      const fullPath = path.resolve(projectPath, r.sourceFile);
      if (fs.existsSync(fullPath)) {
        const fileContent = fs.readFileSync(fullPath, "utf-8");
        const lines = fileContent.split("\n");
        // Check if any line defining this path contains auth keywords
        const matchingLine = lines.find(line => 
          line.includes(r.routePath) || 
          (line.includes(r.method.toLowerCase()) && line.includes(r.routePath.split("/").pop() || "___"))
        );
        if (matchingLine) {
          const authKeywords = ["auth", "protect", "require", "jwt", "session", "admin", "vendor", "guard", "cookie"];
          const hasAuth = authKeywords.some(kw => matchingLine.toLowerCase().includes(kw));
          if (hasAuth) authStatus = "Protected";
        }
      }
    } catch {}

    nodes.push({
      id: routeId,
      label: routeLabel,
      type: "route",
      details: r.sourceFile,
      authStatus,
      metrics,
    });

    const controllerName = r.sourceFile.split(/[/\\]/).pop() || "Controller";
    const controllerId = `controller:${controllerName}`;

    if (!addedControllers.has(controllerId)) {
      addedControllers.add(controllerId);
      nodes.push({
        id: controllerId,
        label: controllerName,
        type: "controller",
        details: r.sourceFile,
      });

      // Map controller to corresponding service layer
      const serviceName = controllerName.replace(".controller.", ".service.").replace("controller", "service");
      const serviceId = `service:${serviceName}`;

      if (!addedServices.has(serviceId)) {
        addedServices.add(serviceId);
        nodes.push({
          id: serviceId,
          label: serviceName,
          type: "service",
          details: `Business logic & DB ORM mapping`,
        });

        // Link Service to Infrastructure
        edges.push({ from: serviceId, to: "db:pg", label: "queries" });
        if (serviceName.toLowerCase().includes("product") || serviceName.toLowerCase().includes("catalog") || serviceName.toLowerCase().includes("cache")) {
          edges.push({ from: serviceId, to: "cache:redis", label: "hits cache" });
        }
      }

      edges.push({ from: controllerId, to: serviceId, label: "delegates" });
    }

    edges.push({ from: routeId, to: controllerId, label: "handles" });
  });

  return { nodes, edges };
}
