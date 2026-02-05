import crypto from "crypto";

// In-memory session store (sessionId -> { createdAt, messages: [] })
const sessions = new Map();

// Default sliding window size (last N messages kept per session)
const DEFAULT_MAX_MESSAGES = 20;

/**
 * Create a random session id.
 * Using crypto so IDs are hard to guess.
 */
export function newSessionId() {
  return crypto.randomBytes(16).toString("hex"); // 32 chars
}

/**
 * Get an existing session or create a new one.
 * Returns: { sessionId, session }
 */
export function getOrCreateSession(sessionId) {
  if (sessionId && sessions.has(sessionId)) {
    return { sessionId, session: sessions.get(sessionId) };
  }

  const id = sessionId || newSessionId();
  const session = {
    createdAt: Date.now(),
    messages: [], // array of { role: "user"|"assistant"|"system", content: string, at: number }
  };

  sessions.set(id, session);
  return { sessionId: id, session };
}

/**
 * Append a message and enforce a sliding window.
 */
export function pushMessage(session, role, content, maxMessages = DEFAULT_MAX_MESSAGES) {
  session.messages.push({ role, content, at: Date.now() });

  // Keep only the last N messages
  if (session.messages.length > maxMessages) {
    session.messages.splice(0, session.messages.length - maxMessages);
  }
}

/**
 * Read messages for prompt construction (copy to avoid accidental mutation).
 */
export function getMessages(session) {
  return session.messages.slice();
}

/**
 * Optional: used for debugging / health checks later.
 */
export function getSessionCount() {
  return sessions.size;
}

