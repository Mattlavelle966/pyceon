# ai-api (curl-first AI backend)

A minimal, **curl-first** AI backend that proxies a local **llama-server** (llama.cpp)
and exposes a single chat endpoint designed to be driven entirely via `curl`.

This repository contains **no mock models**, **no spawned binaries**, and **no frontend**.
It is a backend meant to be composed into other systems.

---

## Overview

The `/guide` endpoint supports:

- Streaming token output
- Structured Server-Sent Events (SSE)
- Human-friendly raw text streaming
- One-shot JSON responses
- Conversation state via session IDs
- Abort-safe streaming (disconnect stops generation)

Everything runs reproducibly under systemd.

---

## Architecture

### ai-api (Node / Express)

- Runs as a systemd service
- Listens on `127.0.0.1:3000`
- Enforces API key authentication via `x-api-key`
- Maintains in-memory conversation sessions
- Proxies model output without buffering

### llama-server (llama.cpp)

- Runs as a systemd service
- Loads a GGUF model once and keeps it warm
- GPU / CUDA supported
- Exposes an OpenAI-compatible HTTP API on `127.0.0.1:8080`

**Important:**  
Node does **not** spawn llama.cpp binaries.  
Node only proxies HTTP streaming from `llama-server`.

---

## Repository layout

- `server.js`  
  Express bootstrap and app setup

- `src/guide/route.js`  
  Implements `POST /guide`, handles mode selection, sessions, streaming, aborts

- `src/guide/modes.js`  
  Raw text streaming mode (`handleRawStream`)

- `src/guide/model_http.js`  
  HTTP client for llama-server, streams tokens upstream

- `src/guide/sse.js`  
  Server-Sent Events helpers

- `src/guide/sessions.js`  
  In-memory session store with sliding window history

---

## Environment configuration

The service expects an API key via environment variables.

Typical location:

```
/etc/ai-api/ai-api.env
```

Example:

```
AI_API_KEY=sk-your-key-here
```

Clients must include:

```
x-api-key: sk-your-key-here
```

---

## Running the service

Restart backend:

```
sudo systemctl restart ai-api
```

Check status:

```
systemctl status ai-api --no-pager
```

View logs:

```
journalctl -u ai-api -n 50 --no-pager
```

Ensure the model server is running:

```
systemctl status llama-server --no-pager
```

---

## API

### Endpoint

```
POST /guide
```

### Request body

```json
{
  "message": "Hello",
  "sessionId": "optional"
}
```

---

## Output modes

### Raw text streaming (terminal-friendly)

Trigger:

- Query parameter `?raw=1`
- OR `Accept: text/plain`

Behavior:

- Plain text streamed live
- `X-Session-Id` returned as HTTP header
- Session memory preserved

Example:

```bash
curl -N -i \
  -H "x-api-key: $AI_API_KEY" \
  -H "content-type: application/json" \
  -H "accept: text/plain" \
  "http://127.0.0.1:3000/guide?raw=1" \
  -d '{"message":"Write a short poem."}'
```

---

### SSE streaming (structured)

Trigger:

- `Accept: text/event-stream`

Behavior:

- `event: session`
- `event: token`
- `event: done`
- Heartbeat every 15s
- `X-Session-Id` always present

Example:

```bash
curl -N -i \
  -H "x-api-key: $AI_API_KEY" \
  -H "content-type: application/json" \
  -H "accept: text/event-stream" \
  "http://127.0.0.1:3000/guide" \
  -d '{"message":"Say hello in one sentence."}'
```

---

### JSON (non-stream)

Trigger:

- Any request without `Accept: text/event-stream`

Behavior:

- Full response buffered
- Returns `{ sessionId, message }`

Example:

```bash
curl -sS \
  -H "x-api-key: $AI_API_KEY" \
  -H "content-type: application/json" \
  -H "accept: application/json" \
  "http://127.0.0.1:3000/guide" \
  -d '{"message":"Say hello in one sentence."}'
```

---

## Session behavior

- Sessions are stored in memory
- Identified by `sessionId`
- Sliding window message history
- Cleared on service restart
- This is conversation state, not long-term memory

---

## Abort handling

If the client disconnects:

- Node aborts the upstream llama-server request
- Prevents wasted compute
- No dangling streams

---



