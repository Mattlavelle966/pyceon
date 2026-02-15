// src/guide/scrape.js
import { parse } from "node-html-parser";
import { URL } from "url";
import dns from "dns/promises";
import net from "net";

const DEFAULTS = {
  timeoutMs: 8000,
  maxBytes: 750_000,
  maxChars: 18_000,
  mode: "text", // "text" | "html" | "links"
};

// --- SSRF guard helpers ---

function isPrivateIp(ip) {
  // IPv4 only for simplicity (good enough to start)
  if (!net.isIP(ip)) return true;
  if (net.isIP(ip) === 6) return true; // block IPv6 for now

  const parts = ip.split(".").map(Number);
  const [a, b] = parts;

  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;

  return false;
}

async function assertSafeUrl(raw) {
  const url = new URL(raw);

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("scrape URL must be http/https");
  }

  const host = url.hostname.toLowerCase();
  if (host === "localhost") throw new Error("blocked host");

  // Resolve DNS and block private IPs
  const { address } = await dns.lookup(host);
  if (isPrivateIp(address)) throw new Error("blocked IP range");

  return url;
}

// --- Extraction ---

function htmlToTextTokenEfficient(html) {
  const root = parse(html);

  // remove noise
  root.querySelectorAll("script, style, noscript, svg, canvas").forEach(n => n.remove());

  // text from headings + paragraphs (signal-rich)
  const chunks = [];

  const title = root.querySelector("title")?.text?.trim();
  if (title) chunks.push(`TITLE: ${title}`);

  root.querySelectorAll("h1,h2,h3,p,li").forEach((n) => {
    const t = n.text.trim().replace(/\s+/g, " ");
    if (t.length >= 40) chunks.push(t);
  });

  return chunks.join("\n");
}

function htmlToLinksSummary(html) {
  const root = parse(html);
  root.querySelectorAll("script, style, noscript").forEach(n => n.remove());

  const out = [];
  const title = root.querySelector("title")?.text?.trim();
  if (title) out.push(`TITLE: ${title}`);

  root.querySelectorAll("h1,h2").forEach(h => {
    const t = h.text.trim().replace(/\s+/g, " ");
    if (t) out.push(`HEADING: ${t}`);
  });

  root.querySelectorAll("a").slice(0, 80).forEach(a => {
    const t = a.text.trim().replace(/\s+/g, " ");
    const href = a.getAttribute("href");
    if (t && href) out.push(`LINK: ${t} -> ${href}`);
  });

  return out.join("\n");
}

function clampChars(s, maxChars) {
  if (s.length <= maxChars) return s;
  return s.slice(0, maxChars) + "\n[TRUNCATED]";
}

// --- Main entry ---

export async function scrapeForPrompt(rawUrl, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const URL = await assertSafeUrl(rawUrl);

  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), cfg.timeoutMs);

  try {
    const resp = await fetch(URL.toString(), {
      signal: ac.signal,
      headers: {
        "user-agent": "ai-api-scraper/1.0",
        "accept": "text/html,text/plain;q=0.9,*/*;q=0.1",
      },
      redirect: "follow",
    });

    const ctype = resp.headers.get("content-type") || "";
    if (!ctype.includes("text/html") && !ctype.includes("text/plain")) {
      throw new Error(`unsupported content-type: ${ctype}`);
    }

    // hard byte cap
    const buf = await resp.arrayBuffer();
    if (buf.byteLength > cfg.maxBytes) {
      throw new Error(`document too large: ${buf.byteLength} bytes`);
    }

    const html = new TextDecoder("utf-8").decode(buf);

    if (cfg.mode === "html") return clampChars(html, cfg.maxChars);
    if (cfg.mode === "links") return clampChars(htmlToLinksSummary(html), cfg.maxChars);

    // default: token-efficient text
    const text = htmlToTextTokenEfficient(html);
    return clampChars(text, cfg.maxChars);
  } finally {
    clearTimeout(timeout);
  }
}

