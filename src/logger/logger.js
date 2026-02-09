
import fs from "fs";
import path from "path";

const LOG_DIR = process.env.AI_API_LOG_DIR || path.join(process.cwd(), "logs");

const SESS_DIR = path.join(LOG_DIR, "sessions");

function isoNow() {
  return new Date().toISOString();
}

function ensureDirs() {
  fs.mkdirSync(SESS_DIR, { recursive: true });
}


export function logSessionEvent(sessionId, event, data = {}) {
  ensureDirs();

  const line = JSON.stringify({
    ts: isoNow(),
    sessionId,
    event,
    ...data,
  });

  const file = path.join(SESS_DIR, `${sessionId}.jsonl`);
  fs.appendFileSync(file, line + "\n", "utf8");
}

// Helper to reduce noise / avoid huge dumps accidentally
export function sanitizeHeaders(headers) {
  const h = { ...headers };
  // don't log API key
  delete h["x-api-key"];
  delete h["X-Api-Key"];
  return h;
}

