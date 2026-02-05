import { spawn } from "child_process";

/**
 * Spawn llama.cpp locally and stream stdout chunks as they arrive.
 *
 * Required env:
 *  - LLAMA_BIN   = absolute path to llama.cpp binary (e.g. .../build/bin/llama-cli)
 *  - MODEL_PATH  = absolute path to your Qwen gguf
 *
 * Optional env:
 *  - N_PREDICT (default 512)
 *  - TEMP (default 0.7)
 */
export async function* streamLocalModel({ prompt, signal }) {
  const bin = process.env.LLAMA_BIN;
  const model = process.env.MODEL_PATH;

  if (!bin) throw new Error("LLAMA_BIN env var not set");
  if (!model) throw new Error("MODEL_PATH env var not set");
  if (!prompt || typeof prompt !== "string") throw new Error("prompt is required");

  const nPredict = process.env.N_PREDICT || "512";
  const temp = process.env.TEMP || "0.7";

  // Keep args conservative/portable across llama.cpp versions
  const args = [
    "-m", model,
    "-p", prompt,
    "-n", String(nPredict),
    "--temp", String(temp),
    "--color", "0",
  ];

  const child = spawn(bin, args, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  // If client disconnects, kill the model process
  const onAbort = () => {
    try { child.kill("SIGTERM"); } catch {}
  };
  if (signal) {
    if (signal.aborted) onAbort();
    signal.addEventListener("abort", onAbort, { once: true });
  }

  let stderrBuf = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (d) => {
    // keep last bit of stderr for debugging if it crashes
    stderrBuf = (stderrBuf + d).slice(-4000);
  });

  child.stdout.setEncoding("utf8");

  // Stream stdout as chunks
  for await (const chunk of child.stdout) {
    if (signal?.aborted) break;
    yield chunk;
  }

  // Wait for exit and report non-zero status
  const code = await new Promise((resolve) => child.on("close", resolve));

  if (signal) {
    try { signal.removeEventListener("abort", onAbort); } catch {}
  }

  if (signal?.aborted) return;

  if (code !== 0) {
    throw new Error(`model process exited ${code}. stderr: ${stderrBuf}`);
  }
}

