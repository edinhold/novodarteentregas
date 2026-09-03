import type { Plugin } from "vite";
import { handleEdgeFunction } from "./functionsRouter";
import type { IncomingMessage, ServerResponse } from "http";

export function viteEdgePlugin(): Plugin {
  return {
    name: "vite-edge-functions-plugin",
    configureServer(server) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const url = req.url || "";
        if (!url.startsWith("/functions/v1/")) {
          return next();
        }

        // Set CORS headers
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type");
        res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");

        if (req.method === "OPTIONS") {
          res.statusCode = 200;
          res.end("ok");
          return;
        }

        const pathWithoutPrefix = url.replace("/functions/v1/", "");
        const [functionName] = pathWithoutPrefix.split("?");

        // Read body
        let body = {};
        if (req.method === "POST" || req.method === "PUT") {
          try {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
              chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
            }
            const bodyStr = Buffer.concat(chunks).toString("utf-8");
            if (bodyStr.trim()) {
              body = JSON.parse(bodyStr);
            }
          } catch {
            body = {};
          }
        }

        const authHeader = req.headers["authorization"] as string | undefined;

        try {
          const result = await handleEdgeFunction(functionName, body, authHeader);
          res.statusCode = result.status;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify(result.body));
        } catch (err: any) {
          res.statusCode = 200; // Return 200 with structured JSON error to avoid raw network crashes
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(
            JSON.stringify({
              success: false,
              code: "ERRO_EXECUCAO",
              message: err?.message || "Erro interno ao executar função.",
            })
          );
        }
      });
    },
  };
}
