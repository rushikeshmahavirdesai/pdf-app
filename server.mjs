import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { renderUrlToPdfBuffer } from "./pdf-render.mjs";
import { pathnameToPdfNameSafe, assertAllowedFetchUrl } from "./url-guard.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const IDLE_CLOSE_MS = 15 * 60 * 1000;

let browserInstance = null;
let idleTimer = null;

function scheduleIdleClose() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    idleTimer = null;
    if (browserInstance) {
      try {
        await browserInstance.close();
      } catch {
        // ignore
      }
      browserInstance = null;
    }
  }, IDLE_CLOSE_MS);
}

async function getBrowser() {
  if (!browserInstance) {
    browserInstance = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
    });
  }
  scheduleIdleClose();
  return browserInstance;
}

function json(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(body));
}

async function serveStatic(res, relativePath, contentType) {
  try {
    const full = path.join(__dirname, relativePath);
    const buf = await readFile(full);
    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600"
    });
    res.end(buf);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

/** Collapse slashes, trim trailing slash, keep "/" for root. */
function normalizedPath(pathnameRaw) {
  const collapse = pathnameRaw.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  const trimmed = collapse.replace(/\/$/, "") || "/";
  return trimmed;
}

const server = http.createServer(async (req, res) => {
  const host = req.headers.host ?? `localhost:${PORT}`;
  const base = `http://${host}`;
  let u;
  try {
    u = new URL(req.url ?? "/", base);
  } catch {
    res.writeHead(400);
    res.end("Bad URL");
    return;
  }

  const pathname = normalizedPath(u.pathname || "/");

  if (req.method === "GET" && pathname === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }

  if (req.method === "GET" && pathname === "/") {
    await serveStatic(res, "public/index.html", "text/html; charset=utf-8");
    return;
  }

  if (req.method === "GET" && pathname === "/api/pdf") {
    const rawUrl = u.searchParams.get("url")?.trim() ?? "";
    let safe;
    try {
      safe = assertAllowedFetchUrl(rawUrl);
    } catch (e) {
      json(res, 400, { error: String(e.message || e) });
      return;
    }

    const filename = pathnameToPdfNameSafe(rawUrl);

    let context = null;
    try {
      const browser = await getBrowser();
      context = await browser.newContext({ ignoreHTTPSErrors: true });
      const page = await context.newPage();
      const buf = await renderUrlToPdfBuffer(page, safe, { mode: "server" });
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store"
      });
      res.end(buf);
    } catch (e) {
      const msg = String(e?.message ?? e);
      const status =
        msg.startsWith("SITE_BLOCKED") ||
        msg.includes("net::ERR_") ||
        msg.includes("Timeout")
          ? 502
          : 500;
      json(res, status, {
        error: msg.startsWith("SITE_BLOCKED") ? msg.replace(/^SITE_BLOCKED\s*/, "") : msg
      });
    } finally {
      if (context) await context.close().catch(() => {});
    }
    return;
  }

  if (req.method === "POST" && pathname === "/api/pdf") {
    const chunks = [];
    for await (const ch of req) chunks.push(ch);
    let body = {};
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    } catch {
      json(res, 400, { error: "Invalid JSON body" });
      return;
    }
    const rawUrl = String(body.url ?? "").trim();
    let safe;
    try {
      safe = assertAllowedFetchUrl(rawUrl);
    } catch (e) {
      json(res, 400, { error: String(e.message || e) });
      return;
    }
    const filename = pathnameToPdfNameSafe(rawUrl);

    let context = null;
    try {
      const browser = await getBrowser();
      context = await browser.newContext({ ignoreHTTPSErrors: true });
      const page = await context.newPage();
      const buf = await renderUrlToPdfBuffer(page, safe, { mode: "server" });
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store"
      });
      res.end(buf);
    } catch (e) {
      const msg = String(e?.message ?? e);
      const status =
        msg.startsWith("SITE_BLOCKED") ||
        msg.includes("net::ERR_") ||
        msg.includes("Timeout")
          ? 502
          : 500;
      json(res, status, {
        error: msg.startsWith("SITE_BLOCKED") ? msg.replace(/^SITE_BLOCKED\s*/, "") : msg
      });
    } finally {
      if (context) await context.close().catch(() => {});
    }
    return;
  }

  if (pathname.startsWith("/api")) {
    json(res, 404, {
      error: "Not Found",
      path: pathname,
      hint:
        "This response is from the Node server. Path must be exactly GET /api/pdf?url=… or POST /api/pdf." +
        " If you deployed a Static Site instead of Docker Web Service, /api/* will never reach Node — recreate the service."
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`PDF server listening on http://localhost:${PORT}`);
});
