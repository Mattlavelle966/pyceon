// /srv/ai-api/src/guide/modes.js
import { streamLocalServerChat } from "./model_http.js";
import { pushMessage } from "./sessions.js";

/**
 * Raw text stream mode (human terminal friendly)
 *
 * Triggers when:
 *   - ?raw=1
 *   - OR Accept: text/plain
 *
 * Writes plain text tokens directly to the response body.
 * Returns the session id as an HTTP header: X-Session-Id
 *
 * @returns {Promise<boolean>} true if handled, false if not requested
 */
export async function handleRawStream({ req, res, sid, session, messages }) {
  const accept = req.header("accept") || "";
  const wantsRaw = req.query?.raw === "1" || accept.includes("text/plain");

  if (!wantsRaw) return false;

  res.status(200);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Session-Id", sid);

  // Abort upstream if client disconnects
  let closed = false;
  const ac = new AbortController();
  res.on("close", () => {
    closed = true;
    ac.abort();
  });

  try {
    let reply = "";

    for await (const chunk of streamLocalServerChat({
      messages,
      signal: ac.signal,
    })) {
      if (closed) break;
      reply += chunk;
      res.write(chunk);
    }

    if (!closed) {
      pushMessage(session, "assistant", reply);
    }
  } catch (err) {
    // If the client disconnects, undici throws AbortError; that's fine.
    console.error("guide raw error:", err);
  } finally {
    res.end();
  }

  return true;
}

