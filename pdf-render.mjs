import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

export const printCss = `
@media print {
  @page {
    size: A4;
    margin: 16mm 14mm 18mm 14mm;
  }

  html, body {
    background: #fff !important;
    color: #000 !important;
  }

  /* Remove only clear non-article utility UI. */
  footer,
  [role="contentinfo"],
  .share,
  .share-bar,
  .sharebar,
  .sticky-share,
  .floating-share,
  .social-share,
  .article-share,
  .share-tools,
  .addthis_toolbox,
  .addthis-smartlayers,
  .article-actions,
  .article-buttons,
  .button-group,
  .article-bottom-buttons,
  .article-cta,
  .site-footer,
  .global-footer,
  .newsletter-signup,
  .join-our-community,
  [aria-label*="share" i],
  [aria-label*="social" i],
  [aria-label*="footer" i],
  [class*="share" i][class*="bar" i],
  [class*="share" i][class*="sticky" i],
  [class*="share" i][class*="float" i],
  [class*="article" i][class*="button" i],
  [class*="article" i][class*="action" i],
  [class*="footer" i],
  [class*="share-bar" i],
  [class*="social-share" i],

  /* Comments (Disqus etc.) — also stripped in DOM before PDF */
  #disqus_thread,
  [id*="disqus" i],
  iframe[src*="disqus"],
  iframe[src*="disquscdn"] {
    display: none !important;
  }

  /* Hide sticky utility controls that can overlay content in print. */
  [style*="position: fixed"],
  [style*="position:fixed"] {
    display: none !important;
  }

  h1, h2, h3, h4, h5, h6 {
    break-after: avoid-page;
    page-break-after: avoid;
  }

  img, figure, blockquote, pre, table {
    break-inside: avoid-page;
    page-break-inside: avoid;
    max-width: 100% !important;
  }

  p, li {
    orphans: 3;
    widows: 3;
  }
}
`;

/** @typedef {'cli-headless' | 'cli-headed' | 'server'} PdfMode */

/**
 * @param {import('playwright').Page} page
 * @param {string} url
 * @param {{ mode?: PdfMode }} [opts]
 * @returns {Promise<Buffer>}
 */
export async function renderUrlToPdfBuffer(page, url, opts = {}) {
  const mode = opts.mode ?? "server";

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForTimeout(3000);

  const blockedByChallenge = await page.evaluate(() => {
    const title = (document.title || "").toLowerCase();
    const bodyText = (document.body?.innerText || "").toLowerCase();
    return (
      title.includes("just a moment") ||
      bodyText.includes("enable javascript and cookies to continue")
    );
  });

  if (blockedByChallenge && mode === "cli-headless") {
    throw new Error(
      "Cloudflare challenge detected. Re-run with --headed and complete the challenge once."
    );
  }

  if (blockedByChallenge && mode === "server") {
    throw new Error(
      "SITE_BLOCKED This page showed a bot check (often Cloudflare). It cannot be completed on a hosted server."
    );
  }

  if (blockedByChallenge && mode === "cli-headed") {
    const rl = readline.createInterface({ input, output });
    try {
      await rl.question("Complete Cloudflare check in the browser, then press Enter...");
    } finally {
      rl.close();
    }
  }

  await page.evaluate(async () => {
    const images = Array.from(document.querySelectorAll("img"));
    for (const img of images) {
      const dataSrc =
        img.getAttribute("data-src") ||
        img.getAttribute("data-original") ||
        img.getAttribute("data-lazy-src");
      const dataSrcSet =
        img.getAttribute("data-srcset") || img.getAttribute("data-lazy-srcset");

      if (!img.getAttribute("src") && dataSrc) {
        img.setAttribute("src", dataSrc);
      }
      if (!img.getAttribute("srcset") && dataSrcSet) {
        img.setAttribute("srcset", dataSrcSet);
      }
      img.setAttribute("loading", "eager");
      img.setAttribute("decoding", "sync");
    }
  });

  await page.evaluate(async () => {
    const totalHeight = document.body.scrollHeight;
    const step = Math.max(400, Math.floor(window.innerHeight * 0.75));
    for (let y = 0; y < totalHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    window.scrollTo(0, 0);
  });

  await page.waitForLoadState("networkidle", { timeout: 120000 });
  await page.evaluate(async () => {
    const images = Array.from(document.images);
    await Promise.all(
      images.map(async (img) => {
        if (!img.complete) {
          await new Promise((resolve) => {
            img.addEventListener("load", resolve, { once: true });
            img.addEventListener("error", resolve, { once: true });
          });
        }
        if (typeof img.decode === "function") {
          try {
            await img.decode();
          } catch {
            // Ignore decode failures; image may still render.
          }
        }
      })
    );
  });
  await page.waitForTimeout(1000);

  await page.evaluate(() => {
    const removeSelectors = [
      "#disqus_thread",
      '[id*="disqus" i]',
      'iframe[src*="disqus"]',
      'iframe[src*="disquscdn"]',
      "#comments",
      ".comments-area",
      ".comment-section",
      '[class*="disqus-thread" i]',
      '[class*="comment-thread" i]'
    ];

    removeSelectors.forEach((sel) => {
      document.querySelectorAll(sel).forEach((n) => n.remove());
    });

    document.querySelectorAll("h1, h2, h3, h4").forEach((h) => {
      if (
        !/you may also like|you might also like|recommended for you|more from\b/i.test(
          (h.textContent || "").trim()
        )
      ) {
        return;
      }
      const kill =
        h.closest("aside") ||
        h.closest('[class*="sidebar" i]') ||
        h.closest('[class*="related" i]') ||
        h.closest('[role="complementary"]') ||
        h.closest("section");
      kill?.remove();
    });

    const articleRoot = document.querySelector("article");
    document.querySelectorAll("aside").forEach((aside) => {
      if (articleRoot && !articleRoot.contains(aside)) aside.remove();
    });

    document.querySelectorAll("h2, h3, h4").forEach((h) => {
      const t = (h.textContent || "").replace(/\s+/g, " ").trim();
      if (!/join our community|weekly newsletter|newsletter signup|subscribe to the katina/i.test(t)) return;
      let el = h;
      let removed = false;
      for (let d = 0; d < 15 && el; d++, el = el.parentElement) {
        const cl = typeof el.className === "string" ? el.className : "";
        if (/newsletter|community|signup|subscribe|signup-form/i.test(cl)) {
          el.remove();
          removed = true;
          break;
        }
      }
      if (!removed) {
        (
          h.closest("section") ||
          h.closest("aside") ||
          h.closest("form")?.closest("div[class]") ||
          h.parentElement
        )?.remove();
      }
    });

    const root =
      document.querySelector("article") ||
      document.querySelector('[role="main"]') ||
      document.querySelector("main");
    if (!root) return;

    const candidates = [];
    for (const el of root.querySelectorAll("p, small")) {
      const txt = el.textContent.replace(/\s+/g, " ").trim();
      if (txt.length < 12 || txt.length > 900) continue;
      if (/©|\bcopyright\b|all rights reserved/i.test(txt)) candidates.push(el);
    }
    if (!candidates.length) return;

    let copyrightEl = candidates[0];
    for (let i = 1; i < candidates.length; i++) {
      const other = candidates[i];
      const pos = copyrightEl.compareDocumentPosition(other);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) copyrightEl = other;
    }

    let cur = copyrightEl;
    while (cur && root.contains(cur)) {
      while (cur.nextSibling) cur.nextSibling.remove();
      if (cur === root) break;
      cur = cur.parentElement;
    }
  });

  await page.addStyleTag({ content: printCss });
  await page.emulateMedia({ media: "print" });

  const pdfOpts = {
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: `<div></div>`,
    footerTemplate: `
      <div style="width:100%; font-size:9px; color:#444; padding:0 12mm; text-align:right;">
        <span class="pageNumber"></span> / <span class="totalPages"></span>
      </div>
    `,
    margin: { top: "16mm", right: "14mm", bottom: "18mm", left: "14mm" }
  };

  /** @type {Buffer} */
  const buf = await page.pdf(pdfOpts);
  return buf;
}
