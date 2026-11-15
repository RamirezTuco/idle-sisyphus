import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve, relative, sep, extname } from "node:path";

const publicRoot = fileURLToPath(new URL("../public/", import.meta.url));
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

export function createPreviewServer() {
  return createServer(async (request, response) => {
    if (!["GET", "HEAD"].includes(request.method)) {
      response.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    } catch (error) {
      if (!(error instanceof URIError || error instanceof TypeError)) throw error;
      response.writeHead(400).end("Invalid request URL");
      return;
    }
    const path = resolve(publicRoot, `.${pathname === "/" ? "/index.html" : pathname}`);
    const child = relative(publicRoot, path);
    if (child === ".." || child.startsWith(`..${sep}`) || child.includes("\0")) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    try {
      const body = await readFile(path);
      response.writeHead(200, {
        "Content-Type": types[extname(path)] ?? "application/octet-stream",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch (error) {
      if (["ENOENT", "EISDIR", "ENOTDIR"].includes(error.code)) {
        const body = await readFile(resolve(publicRoot, "404.html"));
        response.writeHead(404, { "Content-Type": types[".html"] });
        response.end(request.method === "HEAD" ? undefined : body);
      } else {
        console.error("Preview request failed.", error);
        response.writeHead(500).end("Could not serve this file");
      }
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT ?? 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }
  const server = createPreviewServer();
  server.on("error", (error) => {
    console.error("Preview server failed to start.", error);
    process.exitCode = 1;
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`Sisyphus preview: http://127.0.0.1:${port}`);
  });
}
