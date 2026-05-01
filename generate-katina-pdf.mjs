import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { renderUrlToPdfBuffer } from "./pdf-render.mjs";

const args = process.argv.slice(2);
const headed = args.includes("--headed");
const positionalArgs = args.filter((arg) => !arg.startsWith("--"));

function isHttpUrl(s) {
  return /^https?:\/\//i.test(String(s).trim());
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
if (positionalArgs.length === 0) {
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
} else if (
  positionalArgs.length >= 2 &&
  isHttpUrl(positionalArgs[0]) &&
  !isHttpUrl(positionalArgs[1])
) {
  jobs = [{ url: positionalArgs[0].trim(), outputPath: positionalArgs[1].trim() }];
} else if (positionalArgs.every(isHttpUrl)) {
  jobs = positionalArgs.map((u) => ({
    url: u.trim(),
    outputPath: pathnameToPdfName(u)
  }));
} else if (positionalArgs.length === 1 && isHttpUrl(positionalArgs[0])) {
  jobs = [{ url: positionalArgs[0].trim(), outputPath: "katina-article.pdf" }];
} else {
  console.error(
    "Usage: npm run pdf                    (paste URL when prompted)\n" +
      "       npm run pdf -- <url> [output.pdf] [--headed]\n" +
      "       npm run pdf -- <url> <url> ... [--headed]"
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
