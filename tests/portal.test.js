import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import { request } from "node:http";
import { validateApps } from "../public/catalog.js";
import { createPreviewServer } from "../scripts/serve.js";

const apps = JSON.parse(await readFile(new URL("../public/apps.json", import.meta.url)));

test("the configured directory is valid and includes the three planned apps", () => {
  assert.equal(validateApps(apps), apps);
  for (const id of ["chat-csv", "btr", "agentic-learning"]) {
    assert.ok(apps.some((app) => app.id === id));
  }
});

test("a live app requires a safe HTTPS deployment URL", () => {
  const live = { ...apps[0], status: "live", url: "https://chat-csv.example.com" };
  assert.doesNotThrow(() => validateApps([live]));
  for (const url of [null, 123, "", "/chat", "javascript:alert(1)", "http://example.com", "https://user:pass@example.com"]) {
    assert.throws(() => validateApps([{ ...live, url }]));
  }
});

test("invalid catalog entries fail explicitly", () => {
  const unavailable = { ...apps[0], status: "coming-soon", url: null };
  for (const invalid of [null, [], [null], [apps[0], apps[0]], [{ ...apps[0], id: "../app" }],
    [{ ...apps[0], status: "unknown" }], [{ ...apps[0], name: "" }],
    [{ ...unavailable, url: "https://example.com" }]]) {
    assert.throws(() => validateApps(invalid));
  }
});

test("the static document references existing local assets and section anchors", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(html, /<html lang="en">/);
  assert.match(html, /name="viewport"/);
  assert.match(html, /class="skip-link" href="#main"/);
  assert.match(html, /<noscript>/);
  assert.doesNotMatch(html, /\s(?:onclick|onload|style)=/i);
  for (const [, path] of html.matchAll(/(?:href|src)="(\/[^"]+)"/g)) {
    await readFile(new URL(`../public/${path === "/" ? "index.html" : path.slice(1)}`, import.meta.url));
  }
  for (const [, id] of html.matchAll(/href="#([^"]+)"/g)) {
    assert.ok(html.includes(`id="${id}"`), `Missing anchor target ${id}`);
  }
});

test("hosting publishes only static assets, with restrictive headers and real 404s", async () => {
  const config = JSON.parse(await readFile(new URL("../firebase.json", import.meta.url), "utf8"));
  assert.equal(config.hosting.public, "public");
  assert.equal(config.hosting.rewrites, undefined);
  assert.equal(config.functions, undefined);
  const headers = Object.fromEntries(
    config.hosting.headers.find((rule) => rule.source === "**").headers.map(({ key, value }) => [key, value])
  );
  assert.equal(headers["Cache-Control"], "no-cache");
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.match(headers["Content-Security-Policy"], /script-src 'self'/);
  assert.match(headers["Content-Security-Policy"], /frame-ancestors 'none'/);
  assert.doesNotMatch(headers["Content-Security-Policy"], /unsafe-inline|unsafe-eval/);
  await readFile(new URL("../public/404.html", import.meta.url));
});

test("preview serves the portal and assets without exposing project files", async (t) => {
  const server = createPreviewServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const [path, contentType] of [["/", "text/html"], ["/app.js", "text/javascript"],
    ["/catalog.js", "text/javascript"], ["/styles.css", "text/css"],
    ["/apps.json", "application/json"], ["/favicon.svg", "image/svg+xml"]]) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 200);
    assert.ok(response.headers.get("content-type").startsWith(contentType));
    const body = await response.text();
    assert.ok(body.length > 0);
    if (path === "/") assert.match(body, /<title>Sisyphus/);
  }
  assert.equal((await fetch(`${base}/not-an-app`)).status, 404);
  assert.equal((await fetch(`${base}/package.json`)).status, 404);
  assert.equal((await fetch(`${base}/`, { method: "POST" })).status, 405);
  const head = await fetch(base, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  const traversalStatus = await new Promise((resolve, reject) => {
    const req = request(`${base}/`, { path: "/..%2fpackage.json" }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on("error", reject);
    req.end();
  });
  assert.equal(traversalStatus, 403);
});
