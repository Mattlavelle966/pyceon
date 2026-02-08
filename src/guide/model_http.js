/**
 * Stream tokens from local llama-server (OpenAI-compatible) and yield text chunks.
 *
 * llama-server is running at:
 *   http://127.0.0.1:8080
 */

const BASE = "http://127.0.0.1:8080";

export async function* streamLocalServerChat({ messages, signal }) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("messages[] is required");
  }

  const url = `${BASE}/v1/chat/completions`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: "local-model",
      messages,
      stream: true,
      temperature: 0.7,
    }),
    signal,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`llama-server error ${resp.status}: ${text}`);
  }
  if (!resp.body) throw new Error("llama-server response has no body");

  // OpenAI streaming is SSE: lines like `data: {...}\n\n`
  const reader = resp.body.getReader();
  const dec = new TextDecoder();

  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buf += dec.decode(value, { stream: true });

    // Process complete SSE events separated by blank lines
    while (true) {
      const idx = buf.indexOf("\n\n");
      if (idx === -1) break;

      const event = buf.slice(0, idx);
      buf = buf.slice(idx + 2);

      // Find data lines
      const dataLines = event
        .split("\n")
        .filter((l) => l.startsWith("data: "))
        .map((l) => l.slice(6));

      for (const data of dataLines) {
        if (data === "[DONE]") return;

        let obj;
        try {
          obj = JSON.parse(data);
        } catch {
          continue;
        }

        const delta = obj?.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta.length > 0) {
          yield delta;
        }
      }
    }
  }
}

