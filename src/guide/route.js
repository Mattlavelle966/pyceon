import express from "express";
import { startSSE, sendEvent, startHeartbeat } from "./sse.js";
import { getOrCreateSession, pushMessage, getMessages } from "./sessions.js";
import { streamLocalServerChat } from "./model_http.js";
import { handleRawStream } from "./modes.js";

export const guideRouter = express.Router();

/**
 * POST /guide
 * Body: { message: string, sessionId?: string }
 *
 * If Accept: text/event-stream -> SSE stream
 * Else -> JSON response
 */
guideRouter.post("/", async (req, res) => {
  const accept = req.header("accept") || "";
  const wantsSSE = accept.includes("text/event-stream");


  const { message, sessionId } = req.body ?? {};


  if (typeof message !== "string" || message.trim().length === 0) {
    return res.status(400).json({ error: "message is required" });
  }
  if (sessionId != null && typeof sessionId !== "string") {
    return res.status(400).json({ error: "sessionId must be a string" });
  }
  //Load or create a session
  const {sessionId: sid, session } = getOrCreateSession(sessionId);
  
  //save the user message into session 
  pushMessage(session, "user", message);
  
  const messages = [
  { role: "system", content: "You are a helpful assistant. Be concise." },
  ...getMessages(session).map((m) => ({ role: m.role, content: m.content })),
  ];

  // Raw streaming mode (plain text, terminal-friendly)
  if (await handleRawStream({ req, res, sid, session, messages })) {
    return;
  }


  // Non-stream mode (simple + script-friendly)
  if (!wantsSSE) {
    
    const ac = new AbortController();

    req.on("close", () => ac.abort());
    
    let reply = "";

    for await (const chunk of streamLocalServerChat({ messages, signal: ac.signal })) {
      reply += chunk;
    }

    pushMessage(session, "assistant", reply);

    return res.json({
      sessionId: sid,
      message: reply,
    });
  }


  res.setHeader("X-Session-Id", sid);
  // Stream mode (curl -N friendly)
  startSSE(res);

  // If client disconnects, stop doing work immediately
  let closed = false;

  const ac = new AbortController();
  res.on("close", () => {
    closed = true;
    ac.abort();
  });

  // Keep-alive heartbeat (prevents proxy timeouts)
  const stopHeartbeat = startHeartbeat(res, 15000);

  try {
    sendEvent(res, "session", { sessionId: sid });
    
    let reply = "";

    for await (const chunk of streamLocalServerChat({ messages, signal: ac.signal })) {
      if (closed) break;
      reply += chunk;
      sendEvent(res,"token",chunk);
    }

    if (!closed) {
      pushMessage(session, "assistant", reply);
      sendEvent(res, "done", { ok: true });
    }
    
  } catch (err) {
    console.error("guide error:", err);
    if (!closed) {
      sendEvent(res, "done", { ok: false, error: String(err?.message || err) });
    }
  } finally {
    stopHeartbeat();
    res.end();
  }
});

