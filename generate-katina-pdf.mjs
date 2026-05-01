import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { renderUrlToPdfBuffer } from "./pdf-render.mjs";

const rawArgs = process.argv.slice(2);
const headed = rawArgs.includes("--headed");

let urlsFilePath = null;
const positionalArgs = [];
for (let i = 0; i < rawArgs.length; i++) {
  const a = rawArgs[i];
  if (a === "--headed") continue;
  if (a === "--file") {
    urlsFilePath = rawArgs[++i];
    if (!urlsFilePath) {
      console.error("Usage: ... --file <path/to/urls.txt> (paths are UTF-8, one URL per line)");
      process.exit(1);
    }
    continue;
  }
  if (!a.startsWith("--")) positionalArgs.push(a);
}

function isHttpUrl(s) {
  return /^https?:\/\//i.test(String(s).trim());
}

/** Strip inline # comments and trim each line */
function urlsFromUtf8Text(content) {
  return content
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/u, "").trim())
    .filter(Boolean)
    .filter((line) => isHttpUrl(line));
}

async function urlsFromUrlsFile(relOrAbs) {
  const full = path.isAbsolute(relOrAbs) ? relOrAbs : path.resolve(process.cwd(), relOrAbs);
  try {
    const text = await fs.readFile(full, "utf8");
    return urlsFromUtf8Text(text);
  } catch (e) {
    console.error(`Cannot read URLs file: ${full}\n`, e.message || e);
    process.exit(1);
  }
}

function pathnameToPdfName(urlString) {
  try {
    const pathname = new URL(urlString.trim()).pathname.replace(/\/+$/, "");
    const segments = pathname.split("/").filter(Boolean);
    const slug = segments.length ? segments.join("-").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "") : "index";
    return `${slug}.pdf`;
  } catch {
    return "page.pdf";
  }
}

let jobs;
const fromFile = urlsFilePath ? await urlsFromUrlsFile(urlsFilePath) : [];
const cliHttpUrls = positionalArgs.filter(isHttpUrl).map((u) => u.trim());
const urlQueue = [...cliHttpUrls, ...fromFile];
const seen = new Set();
const uniqueUrls = [];
for (const u of urlQueue) {
  if (seen.has(u)) continue;
  seen.add(u);
  uniqueUrls.push(u);
}

if (!urlsFilePath && positionalArgs.length === 0 && uniqueUrls.length === 0) {
  const rl = readline.createInterface({ input, output });
  try {
    const line = (await rl.question("Paste page URL and press Enter:\n> ")).trim();
    if (!line) {
      console.error("No URL pasted. Exiting.");
      process.exit(1);
    }
    if (!isHttpUrl(line)) {
      console.error("That does not look like an http(s) URL. Example: https://example.com/article");
      process.exit(1);
    }
    jobs = [{ url: line, outputPath: pathnameToPdfName(line) }];
  } finally {
    rl.close();
  }
} else if (urlsFilePath) {
  if (uniqueUrls.length === 0) {
    console.error(
      `No https URLs found in "${urlsFilePath}" (or CLI). Put one URL per line; prefix comments with #.`
    );
    process.exit(1);
  }
  jobs = uniqueUrls.map((u) => ({
    url: u,
    outputPath: pathnameToPdfName(u)
  }));
} else if (
  positionalArgs.length >= 2 &&
  isHttpUrl(positionalArgs[0]) &&
  !isHttpUrl(positionalArgs[1])
) {
  jobs = [{ url: positionalArgs[0].trim(), outputPath: positionalArgs[1].trim() }];
} else if (positionalArgs.length === 1 && isHttpUrl(positionalArgs[0])) {
  jobs = [{ url: positionalArgs[0].trim(), outputPath: "katina-article.pdf" }];
} else if (positionalArgs.every(isHttpUrl) && positionalArgs.length >= 1) {
  jobs = positionalArgs.map((u) => ({
    url: u.trim(),
    outputPath: pathnameToPdfName(u)
  }));
} else {
  console.error(
    "Usage: npm run pdf                              (prompt for one URL)\n" +
      "       npm run pdf -- <url> [output.pdf] [--headed]\n" +
      "       npm run pdf -- <url> <url> ... [--headed]\n" +
      '       npm run pdf -- --file urls.txt [--headed]   one https URL per line, # starts comment'
  );
  process.exit(1);
}

const pdfMode = headed ? "cli-headed" : "cli-headless";

const browser = await chromium.launch({ headless: !headed });

try {
  const page = await browser.newPage();

  for (const { url, outputPath } of jobs) {
    console.log(`→ ${url}`);
    const buf = await renderUrlToPdfBuffer(page, url, { mode: pdfMode });
    const absPath = path.resolve(process.cwd(), outputPath);
    await fs.writeFile(absPath, buf);
    console.log(`PDF saved: ${absPath}`);
  }
} finally {
  await browser.close();
}
