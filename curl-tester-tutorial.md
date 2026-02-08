# AI API `/guide` — curl test cookbook (curl-first)

Endpoint: POST http://127.0.0.1:3000/guide  
Auth: header `x-api-key: $AI_API_KEY`  
Body: JSON `{ "message": "...", "sessionId": "..."? }`

---

## How `/guide` responds (3 modes)

The `/guide` route supports three output modes.  
All modes share the same upstream token stream; only the response format differs.

---

### 1) RAW streaming mode (plain text)

**Triggers**
- `?raw=1`
- OR header `Accept: text/plain`

**Behavior**
- `Content-Type: text/plain; charset=utf-8`
- `X-Session-Id: <sid>` header is returned
- Tokens are written directly with `res.write(chunk)`
- Full assistant reply is saved into the session at completion

**Code path**
- `/srv/ai-api/src/guide/route.js` → early call to `handleRawStream(...)`
- `/srv/ai-api/src/guide/modes.js` → `handleRawStream(...)`

---

### 2) SSE streaming mode (structured stream)

**Triggers**
- Header `Accept: text/event-stream`

**Behavior**
- `Content-Type: text/event-stream`
- Events emitted:
  - `session` (once, contains `sessionId`)
  - `token` (per chunk)
  - `done` (final)
- Heartbeat comments every ~15s prevent proxy timeouts
- `X-Session-Id` header is set **before** SSE begins

**Code path**
- `/srv/ai-api/src/guide/route.js` (SSE branch)
- `/srv/ai-api/src/guide/sse.js`
  - `startSSE`
  - `sendEvent`
  - `startHeartbeat`

---

### 3) JSON mode (non-stream)

**Triggers**
- Any request **not** using `Accept: text/event-stream`
  - e.g. `Accept: application/json`
  - or no `Accept` header

**Behavior**
- Server still streams tokens internally
- Tokens are buffered into a single string
- Response:
  ```json
  { "sessionId": "<sid>", "message": "<reply>" }
  ```
- Assistant reply is saved into session history

**Code path**
- `/srv/ai-api/src/guide/route.js` (non-SSE branch)

---

## Shared components (used by all modes)

- Sessions:
  - `/srv/ai-api/src/guide/sessions.js`
  - `getOrCreateSession(sessionId)`
  - `pushMessage(session, role, text)`

- Message assembly:
  - `messages = [{ role: "system", ... }, ...getMessages(session)]`

- Model streaming:
  - `/srv/ai-api/src/guide/model_http.js`
  - `streamLocalServerChat({ messages, signal })`
  - Streams tokens from llama-server (`127.0.0.1:8080`)

- Abort handling:
  - Client disconnect triggers `AbortController.abort()`
  - Upstream model request is cancelled immediately

---

# PREP

## Load API key

```bash
sudo bash -lc 'source /etc/ai-api/ai-api.env; echo "AI_API_KEY is set? -> ${AI_API_KEY:+yes}"'
```

## Define base URL

```bash
BASE="http://127.0.0.1:3000/guide"
```

---

## 0) Health check

**What it tests**
- ai-api service is running
- routing works
- auth middleware is enforced

```bash
sudo bash -lc 'source /etc/ai-api/ai-api.env; \
curl -sS -H "x-api-key: $AI_API_KEY" http://127.0.0.1:3000/health; echo'
```

---

## 1) RAW MODE — plain text streaming

```bash
sudo bash -lc 'source /etc/ai-api/ai-api.env; curl -N -i \
  -H "x-api-key: $AI_API_KEY" \
  -H "content-type: application/json" \
  -H "accept: text/plain" \
  "'"$BASE"'?raw=1" \
  -d "{\"message\":\"Write a short poem.\"}"'
```

### Continue RAW session

```bash
SESSION_ID="PUT_SESSION_ID_HERE"

sudo bash -lc 'source /etc/ai-api/ai-api.env; curl -N -i \
  -H "x-api-key: $AI_API_KEY" \
  -H "content-type: application/json" \
  -H "accept: text/plain" \
  "'"$BASE"'?raw=1" \
  -d "{\"sessionId\":\"'"$SESSION_ID"'\",\"message\":\"What is my name?\"}"'
```

---

## 2) SSE MODE — structured streaming

```bash
sudo bash -lc 'source /etc/ai-api/ai-api.env; curl -N -i \
  -H "x-api-key: $AI_API_KEY" \
  -H "content-type: application/json" \
  -H "accept: text/event-stream" \
  "'"$BASE"'" \
  -d "{\"message\":\"Say hello in one sentence.\"}"'
```

### Continue SSE session

```bash
SESSION_ID="PUT_SESSION_ID_HERE"

sudo bash -lc 'source /etc/ai-api/ai-api.env; curl -N \
  -H "x-api-key: $AI_API_KEY" \
  -H "content-type: application/json" \
  -H "accept: text/event-stream" \
  "'"$BASE"'" \
  -d "{\"sessionId\":\"'"$SESSION_ID"'\",\"message\":\"What is my name?\"}"'
```

### SSE (data-only view)

```bash
sudo bash -lc 'source /etc/ai-api/ai-api.env; curl -N \
  -H "x-api-key: $AI_API_KEY" \
  -H "content-type: application/json" \
  -H "accept: text/event-stream" \
  "'"$BASE"'" \
  -d "{\"message\":\"Write a short poem.\"}" \
  | sed -n "s/^data: //p"'
```

---

## 3) JSON MODE — one-shot response

```bash
sudo bash -lc 'source /etc/ai-api/ai-api.env; curl -sS \
  -H "x-api-key: $AI_API_KEY" \
  -H "content-type: application/json" \
  -H "accept: application/json" \
  "'"$BASE"'" \
  -d "{\"message\":\"Say hello in one sentence.\"}" | jq'
```

### Continue JSON session

```bash
SESSION_ID="PUT_SESSION_ID_HERE"

sudo bash -lc 'source /etc/ai-api/ai-api.env; curl -sS \
  -H "x-api-key: $AI_API_KEY" \
  -H "content-type: application/json" \
  -H "accept: application/json" \
  "'"$BASE"'" \
  -d "{\"sessionId\":\"'"$SESSION_ID"'\",\"message\":\"What is my name?\"}" | jq'
```

---

## 4) AUTH FAILURE (expect 401)

```bash
curl -sS -i \
  -H "x-api-key: WRONG" \
  -H "content-type: application/json" \
  "'"$BASE"'" \
  -d '{"message":"hi"}' | head -n 30
```

---

## 5) ABORT TEST (Ctrl+C)

```bash
sudo bash -lc 'source /etc/ai-api/ai-api.env; curl -N \
  -H "x-api-key: $AI_API_KEY" \
  -H "content-type: application/json" \
  -H "accept: text/event-stream" \
  "'"$BASE"'" \
  -d "{\"message\":\"Write a very long story (at least 2000 words).\"}"'
```

### Check logs after abort

```bash
journalctl -u ai-api -n 50 --no-pager
```
