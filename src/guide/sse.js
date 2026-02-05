/**
 * Set headers required for Server-Sent Events (SSE).
 * IMPORTANT: we flush headers so curl/browser starts receiving immediately.
 */
export function startSSE(res) {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");

  // If you're behind nginx later, this helps prevent buffering:
  res.setHeader("X-Accel-Buffering", "no");

  // Send headers now (don’t wait for first chunk)
  if (typeof res.flushHeaders === "function") res.flushHeaders();
}

/**
 * Send one SSE event.
 *
 * Example:
 *   event: token
 *   data: hello
 *
 * NOTE: SSE requires each event ends with a blank line.
 */
export function sendEvent(res, eventName, data) {
  if (eventName) res.write(`event: ${eventName}\n`);

  // Data can be a string (token chunks) or an object (session/done payloads)
  const payload = typeof data === "string" ? data : JSON.stringify(data);

  // SSE spec: split by newlines and prefix each line with "data: "
  for (const line of payload.split("\n")) {
    res.write(`data: ${line}\n`);
  }

  // Blank line marks the end of this SSE event
  res.write("\n");
}

/**
 * Send heartbeat comments periodically.
 * SSE comment lines start with ":" and are ignored by clients,
 * but keep proxies from killing idle connections.
 */
export function startHeartbeat(res, ms = 15000) {
  const id = setInterval(() => {
    res.write(":\n\n");
  }, ms);

  // Return a cleanup function
  return () => clearInterval(id);
}

