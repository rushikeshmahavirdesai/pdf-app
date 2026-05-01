(function () {
  "use strict";

  function apiRoot() {
    const { protocol, host } = window.location;
    return `${protocol}//${host}/`;
  }

  async function okServer() {
    try {
      const r = await fetch(`${apiRoot()}health`, { cache: "no-store" });
      return r.ok && (await r.text()).trim() === "ok";
    } catch {
      return false;
    }
  }

  function normalizeInput(raw) {
    let s = raw.trim();
    if (!s) return "";
    if (!/^https?:\/\//i.test(s)) {
      if (/^\/\//.test(s)) s = "https:" + s;
      else s = "https://" + s.replace(/^\/+/, "");
    }
    return s;
  }

  function filenameFromHeader(cd) {
    if (!cd) return "page.pdf";
    let name = "page.pdf";
    const utf = /filename\*=UTF-8''([^;\n]+)/i.exec(cd);
    if (utf && utf[1]) {
      try {
        name = decodeURIComponent(utf[1].trim());
      } catch {
        name = utf[1].trim();
      }
    } else {
      const m = /filename="([^"]+)"/i.exec(cd) || /filename=([^;\n]+)/i.exec(cd);
      if (m) name = m[1].trim().replace(/^"+|"+$/g, "");
    }
    return safeFileName(name);
  }

  function safeFileName(name) {
    const base = (name || "page.pdf").split(/[/\\]/).pop() || "page.pdf";
    const cleaned = base.replace(/[<>:"|?*\u0000-\u001f]/g, "-").replace(/\s+/g, " ").trim();
    const withExt = /\.pdf$/i.test(cleaned) ? cleaned : `${cleaned}.pdf`;
    return withExt.slice(0, 200);
  }

  let lastBlobUrl = null;

  function revokeLastBlob() {
    if (lastBlobUrl) {
      URL.revokeObjectURL(lastBlobUrl);
      lastBlobUrl = null;
    }
  }

  /** Try programmatic save; Edge legacy + visible fallback link */
  function savePdf(blob, fileName, manualWrap, manualA) {
    revokeLastBlob();
    lastBlobUrl = URL.createObjectURL(blob);

    manualWrap.classList.remove("visible");
    manualA.removeAttribute("href");

    try {
      const nav = navigator;
      const msBlob = blob;
      if (typeof nav.msSaveOrOpenBlob === "function") {
        nav.msSaveOrOpenBlob(msBlob, fileName);
        manualA.href = lastBlobUrl;
        manualA.download = fileName;
        manualWrap.classList.add("visible");
        return;
      }
    } catch {
      /* continue */
    }

    const a = document.createElement("a");
    a.href = lastBlobUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();

    manualA.href = lastBlobUrl;
    manualA.download = fileName;
    manualWrap.classList.add("visible");
  }

  async function blobLooksPdf(blob) {
    const s = await blob.slice(0, 5).arrayBuffer();
    const b = new Uint8Array(s);
    return b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
  }

  function bind() {
    const input = document.getElementById("u");
    const go = document.getElementById("go");
    const openTab = document.getElementById("open-tab");
    const msg = document.getElementById("msg");
    const err = document.getElementById("err");
    const backend = document.getElementById("backend");
    const manualWrap = document.getElementById("manual-save");
    const manualA = document.getElementById("manual-a");

    if (!input || !go || !manualA || !manualWrap) return;

    function setBackend(ok) {
      backend.textContent = ok ? "Server OK — ready." : `No API here. Run npm start → open ${apiRoot()} from that machine.`;
      backend.className = "backend " + (ok ? "ok" : "bad");
    }

    async function boot() {
      let live = await okServer();
      if (!live) {
        for (let i = 0; i < 12 && !live; i++) {
          await new Promise((r) => setTimeout(r, 1500));
          live = await okServer();
        }
      }
      setBackend(live);
      go.disabled = !live;
    }

    openTab.addEventListener("click", () => {
      if (lastBlobUrl) window.open(lastBlobUrl, "_blank", "noopener,noreferrer");
    });

    async function runDownload() {
      err.hidden = true;
      err.textContent = "";
      manualWrap.classList.remove("visible");
      revokeLastBlob();
      openTab.disabled = true;

      const url = normalizeInput(input.value);
      if (!url || !/^https?:\/\//i.test(url)) {
        err.textContent = "Paste a full link (we add https:// if you omit it).";
        err.hidden = false;
        return;
      }
      input.value = url;

      let live = await okServer();
      setBackend(live);
      if (!live) {
        err.textContent = `Start the backend (npm start or npm run start:headed), then reload this tab. Trying: ${apiRoot()}`;
        err.hidden = false;
        go.disabled = true;
        return;
      }

      go.disabled = true;
      msg.textContent = "Building PDF… (wait 30s–2 min)";
      try {
        const qs = new URLSearchParams({ url });
        const r = await fetch(`${apiRoot()}api/pdf?${qs}`, { cache: "no-store" });
        const name = filenameFromHeader(r.headers.get("Content-Disposition"));

        if (!r.ok) {
          const t = await r.text();
          let m = t;
          try {
            const j = JSON.parse(t);
            m = j.error || t;
          } catch {
            /* keep */
          }
          throw new Error(`HTTP ${r.status}: ${String(m).slice(0, 600)}`);
        }

        const blob = await r.blob();
        if (!(await blobLooksPdf(blob))) {
          const head = (await blob.slice(0, 400).text()).trim();
          throw new Error("Not a PDF from server:\n" + head.slice(0, 320));
        }

        savePdf(blob, name, manualWrap, manualA);
        openTab.disabled = false;
        msg.textContent = "If the download didn’t start, use the green link below or Open in new tab.";
      } catch (x) {
        msg.textContent = "";
        err.textContent = String(x.message || x);
        err.hidden = false;
      } finally {
        live = await okServer();
        go.disabled = !live;
        setBackend(live);
      }
    }

    go.addEventListener("click", runDownload);
    boot();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
