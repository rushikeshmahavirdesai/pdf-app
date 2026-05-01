import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

/**
 * Primary control for printable PDF layout: magazine chrome, rails, CTAs → display:none @media print.
 * JS below only trims comments/sidebars/copy-right tail where CSS cannot reach cleanly.
 */
export const printCss = `
@media print {
  @page {
    size: A4;
    margin: 14mm 12mm 24mm 12mm;
  }

  html, body {
    background: #fff !important;
    color: #000 !important;
  }

  /* ---- Site chrome ---- */
  .masthead,
  .site-header,
  .site-nav,
  .global-header,
  .navigation,
  #site-navigation,
  .mega-menu,
  .mobile-nav,
  .burger,
  .menu-toggle,

  /* Sitewide footers & legal ribbons */
  footer,
  body > footer,
  .site-footer,
  .site-footer-simple,
  [role="contentinfo"],
  .footer-nav,
  .global-footer,
  .breadcrumb,
  nav[aria-label*="breadcrumb" i],
  nav[aria-label*="Breadcrumb" i],
  .post-meta-nav,
  .post-navigation-prev-next,

  /* ---- Share strips (top, inline, sticky) ---- */
  .share,
  .sharing,
  .share-bar,
  .sharebar,
  .share-buttons,
  .share-icons,
  .sharing-buttons,
  .social-share-buttons,
  .article-share-bar,
  .article-share-tools,
  .article-share-top,
  .article-share-inline,
  .sticky-share,
  .floating-share,
  .floating-social,
  .post-share-bar,
  .entry-share,
  .print-button,
  [class*="share-bar" i],
  [class*="share-btn" i],
  [class*="ShareButton" i],
  [class*="SharingToolbar" i],
  [class*="sharing-toolbar" i],
  [class*="social-toolbar" i],
  [data-module*="sharing" i],
  [data-module*="breadcrumb" i],
  [data-component*="Share" i],
  [data-component*="share" i],
  [aria-label*="share" i],
  [aria-label*="Share article" i],
  [aria-label*="social media" i],
  iframe[src*="facebook.com/plugins/share"],
  iframe[src*="platform.twitter"],

  .addthis_toolbox,
  .addthis-smartlayers,

  /* ---- Article bottom actions / pagination ---- */
  .article-actions,
  .article-buttons,
  .bottom-share,
  .entry-footer-buttons,
  .article-bottom-buttons,
  .post-footer-buttons,
  .below-article,
  .after-post,
  .article-cta,
  .pagination,
  .pager,
  .article-post-navigation,

  /* ---- Newsletter / community / signup blocks ---- */
  .newsletter,
  .newsletter-signup,
  .newsletter-widget,
  .join-our-community,
  .signup-section,
  [class*="signup-form" i],
  [class*="elementor-form" i],
  [class*="wpforms" i],
  [class*="gform_" i],
  iframe[src*="hsforms"],
  iframe[src*="hubspot"],
  [class*="signup-box" i],

  /* ---- Comments ---- */
  #disqus_thread,
  [id*="disqus" i],
  #comments,
  #respond,
  #commentform,
  .comment-form,
  .comment-form-wrap,
  .comments-area,
  .comments-section,
  .comment-section,
  .comment-list,
  .comment-respond,
  .discussion-section,
  .comments-wrapper,
  [class*="disqus-thread" i],
  [class*="comments-area" i],
  iframe[src*="disqus"],
  iframe[src*="disquscdn"],

  /* ---- “You may also like” rails & widgets (outside nested article internals) ---- */
  #secondary,
  #sidebar,
  aside[class*="rail" i],
  aside[class*="Rail" i],
  aside[role="complementary"]:not(article aside),
  aside[class*="sidebar" i]:not(article aside),
  aside[class*="related" i]:not(article aside),
  aside[class*="Related" i]:not(article aside),
  [class*="recommended-rail" i],
  [class*="article-recommendations" i],
  [class*="you-might-like" i],
  [class*="you-may-like" i],
  [class*="read-next" i],
  [class*="more-stories" i],
  [class*="related-posts" i],
  [data-zone*="recommended" i],

  /* Sticky overlays that fight print layout */
  [style*="position: fixed"],
  [style*="position:fixed"] {
    display: none !important;
    visibility: hidden !important;
  }

  /* Let article use full printable width once columns are stripped */
  main,
  article,
  article * {
    max-width: none !important;
    box-sizing: border-box;
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
      "SITE_BLOCKED This site protects its articles with automated bot detection (Katina Magazine and many news sites use this). Servers on Render cannot complete that verification—nothing is broken on your app. Options: open the URL in Chrome/Edge → Print → Save as PDF; or clone the repo on your PC and run npm run pdf:headed, pass the browser check once, then generate the PDF."
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

  try {
    await page.waitForLoadState("networkidle", { timeout: 45000 });
  } catch {
    await page.waitForLoadState("load").catch(() => {});
  }
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
    const RELATED_BLOCK_RE =
      /^\s*(you may also like|you might also like|recommended for you|more from\b|recommended reading|read next|related articles|more stories|recommended stories|popular on katina)/i;

    /** Remove sibling sidebars (#secondary, complementary asides outside article column). */
    const articleProbe = document.querySelector("article");
    const removeOutsideArticleRails = () => {
      document.querySelectorAll("#secondary, #sidebar").forEach((node) => {
        node.remove();
      });

      document
        .querySelectorAll(
          'aside[role="complementary"], aside.sidebar, aside[class*="related" i]'
        )
        .forEach((aside) => {
          if (!articleProbe) {
            aside.remove();
            return;
          }
          if (aside.contains(articleProbe)) return;
          aside.remove();
        });

      const parent = articleProbe?.parentElement;
      if (parent) {
        for (const child of [...parent.children]) {
          if (child.tagName === "ASIDE" && articleProbe && !child.contains(articleProbe)) child.remove();
        }
      }
    };

    removeOutsideArticleRails();

    const removeSelectors = [
      "#disqus_thread",
      '[id*="disqus" i]',
      'iframe[src*="disqus"]',
      'iframe[src*="disquscdn"]',
      "#comments",
      "#respond",
      "#commentform",
      ".comment-form",
      ".comments-area",
      ".comment-section",
      ".comment-form-wrap",
      ".comment-respond",
      ".comments-wrapper",
      '[class*="discussion" i][class*="thread" i]',
      '[data-module*="comments" i]'
    ];

    removeSelectors.forEach((sel) => {
      document.querySelectorAll(sel).forEach((n) => n.remove());
    });

    /** “You may also like” / recommendation blocks by heading — left rail & in-flow modules. */
    document.querySelectorAll("h2, h3, h4, h5").forEach((h) => {
      const trimmed = (h.textContent || "").replace(/\s+/g, " ").trim();
      if (!RELATED_BLOCK_RE.test(trimmed)) return;
      const kill =
        h.closest("aside") ||
        h.closest('[class*="rail" i]') ||
        h.closest('[class*="sidebar" i]') ||
        h.closest('[class*="related-post" i]') ||
        h.closest('[class*="recommendations" i]') ||
        h.closest('[role="complementary"]') ||
        h.closest('[class*="grid" i]') ||
        h.closest("section");
      kill?.remove();
    });

    document.querySelectorAll("aside").forEach((aside) => {
      if (articleProbe && !articleProbe.contains(aside)) aside.remove();
    });

    document.querySelectorAll("h2, h3, h4").forEach((h) => {
      const t = (h.textContent || "").replace(/\s+/g, " ").trim();
      if (
        !/join our community|weekly newsletter|newsletter signup|subscribe to\s*the\s*katina|subscribe to\s*katina|get our newsletter|stay connected|email updates|keep up with katina/i.test(
          t
        )
      )
        return;
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

    /** End article at last copyright paragraph (keep © line; strip everything after in flow). */
    const root =
      document.querySelector("article") ||
      document.querySelector('[role="main"]') ||
      document.querySelector("main");
    if (!root) return;

    const COPYRIGHT_RE =
      /\u00a9|\(\s*c\s*\)|\bcopyright\b|all\s+rights\s+reserved|first\s+published|permissions\s+contact/i;

    const candidates = [];
    for (const el of root.querySelectorAll("p, small, footer")) {
      if (!root.contains(el)) continue;
      const txt = el.textContent.replace(/\s+/g, " ").trim();
      if (txt.length < 12 || txt.length > 1200) continue;
      if (!COPYRIGHT_RE.test(txt)) continue;
      if (/you may also|newsletter|subscribe|share this|cookie policy/i.test(txt)) continue;
      candidates.push(el);
    }
    if (!candidates.length) return;

    let copyrightEl = candidates[0];
    for (let i = 1; i < candidates.length; i++) {
      const other = candidates[i];
      const pos = copyrightEl.compareDocumentPosition(other);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) copyrightEl = other;
    }

    /** Walk up from deepest copyright-containing block to remove trailing siblings. */
    let block = copyrightEl;
    while (block && root.contains(block) && block.nodeType === Node.ELEMENT_NODE) {
      while (block.nextSibling) block.nextSibling.remove();
      if (block === root) break;
      block = block.parentElement ?? null;
      if (!(block && root.contains(block))) break;
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
      <div style="width:100%; font-size:10px; font-family:system-ui,sans-serif; color:#222; padding:0 16mm 2mm 16mm; text-align:center;">
        <span style="margin-right:1em">Page</span><span class="pageNumber"></span><span style="margin:0 0.35em">/</span><span class="totalPages"></span>
      </div>
    `,
    margin: { top: "14mm", right: "12mm", bottom: "22mm", left: "12mm" }
  };

  /** @type {Buffer} */
  const buf = await page.pdf(pdfOpts);
  return buf;
}
