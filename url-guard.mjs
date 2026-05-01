function hostnameWithoutIpv6Bracket(hostname) {
  if (hostname.startsWith("[") && hostname.includes("]")) {
    return hostname.slice(1, hostname.indexOf("]"));
  }
  return hostname.split(":")[0];
}

/** True if ipv4 dotted quad is RFC1918 / loopback / link-local etc. */
function ipv4Blocked(a, b) {
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 0) return true;
  return false;
}

function isBlockedHostname(hostnameRaw) {
  const host = hostnameRaw.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "0.0.0.0"
  ) {
    return true;
  }

  if (/^169\.254\.169\.254$/.test(host) || /^metadata(\.|$)/i.test(host)) {
    return true;
  }

  if (/^kubernetes\.|^.*\.svc\.cluster\.local$/i.test(host)) {
    return true;
  }

  const core = hostnameWithoutIpv6Bracket(host);

  // IPv6 loopback / ULA-ish (light check)
  if (
    /^::1$|^::$/i.test(core) ||
    /^fe80:/i.test(core) ||
    /^fec0:|^fc00:|^fd[0-9a-f]/i.test(core)
  ) {
    return true;
  }

  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(core);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a > 255 || b > 255 || Number(m[3]) > 255 || Number(m[4]) > 255) return true;
    return ipv4Blocked(a, b);
  }

  if (/^(127\.|10\.|192\.168\.|169\.254\.)/i.test(core)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./i.test(core)) return true;

  if (/\.(internal|corp|lan)$/i.test(host)) return true;

  return false;
}

/**
 * @param {string} raw
 * @returns {string} normalized URL string Playwright may fetch
 */
export function assertAllowedFetchUrl(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) throw new Error("Missing url");

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Invalid URL");
  }

  if (!/^https?:$/i.test(parsed.protocol)) {
    throw new Error("Only http and https URLs are allowed");
  }

  if (isBlockedHostname(parsed.hostname)) {
    throw new Error("Hostname or address not allowed");
  }

  return trimmed;
}

export function pathnameToPdfNameSafe(urlString) {
  try {
    const pathname = new URL(urlString.trim()).pathname.replace(/\/+$/, "");
    const segments = pathname.split("/").filter(Boolean);
    const slug = segments.length
      ? segments.join("-").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "")
      : "index";
    return `${slug || "page"}.pdf`;
  } catch {
    return "page.pdf";
  }
}
