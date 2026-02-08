###############################################################################
# AI API /guide — curl test cookbook (curl-first)
#
# Endpoint: POST http://127.0.0.1:3000/guide
# Auth:     header "x-api-key: $AI_API_KEY"
# Input:    JSON body { "message": "...", optional "sessionId": "..." }
#
# Code paths in /srv/ai-api/src/guide/route.js:
#   1) RAW streaming mode (plain text):
#        route.js calls handleRawStream(...) early:
#          if (await handleRawStream({ req, res, sid, session, messages })) return;
#        Implemented in /srv/ai-api/src/guide/modes.js:
#          - triggers on ?raw=1 OR Accept: text/plain
#          - sets Content-Type: text/plain
#          - sets X-Session-Id header
#          - res.write(chunk) for each streamed chunk from streamLocalServerChat(...)
#          - saves assistant reply into session via pushMessage(session,"assistant",reply)
#
#   2) JSON (non-stream) mode:
#        if (!wantsSSE) { ... return res.json({ sessionId: sid, message: reply }) }
#        - triggers when Accept does NOT include text/event-stream
#        - buffers chunks into `reply` and returns one JSON response
#        - saves assistant reply into session via pushMessage(...)
#
#   3) SSE streaming mode (structured streaming):
#        wantsSSE = accept.includes("text/event-stream")
#        - startSSE(res) sets event-stream headers and disables buffering
#        - res.setHeader("X-Session-Id", sid) is set before startSSE
#        - sendEvent(res,"session",{sessionId:sid}) once
#        - sendEvent(res,"token",chunk) per chunk
#        - sendEvent(res,"done",{ok:true}) at end
#        - startHeartbeat(res,15000) emits keep-alive comments to prevent proxy timeouts
#
# Shared pieces (used by all modes):
#   - getOrCreateSession(sessionId) in /srv/ai-api/src/guide/sessions.js
#       returns { sessionId: sid, session }
#   - pushMessage(session,"user",message) stores user prompt in the session map
#   - `messages` array is built and passed upstream:
#       [{role:"system",...}, ...getMessages(session)]
#   - streamLocalServerChat({messages, signal}) in /srv/ai-api/src/guide/model_http.js
#       streams tokens from llama-server (127.0.0.1:8080) to Node
#   - Abort handling:
#       res.on("close", ...) / req.on("close", ...) aborts upstream fetch via AbortController
#
###############################################################################

# PREP: load API key (stored in /etc/ai-api/ai-api.env) and define base URL
# - This mirrors how ai-api is configured on your host
sudo bash -lc 'source /etc/ai-api/ai-api.env; echo "AI_API_KEY is set? -> ${AI_API_KEY:+yes}"'
BASE="http://127.0.0.1:3000/guide"

###############################################################################
# 0) Health check (verifies service is running + auth middleware works)
#
# What it tests:
# - ai-api systemd service is up and listening
# - x-api-key check is enforced
# Code path:
# - /health route (not shown above), but proves auth + routing + express are alive
###############################################################################
sudo bash -lc 'source /etc/ai-api/ai-api.env; curl -sS -H "x-api-key: $AI_API_KEY" http://127.0.0.1:3000/health; echo'


###############################################################################
# 1) RAW MODE (plain text streaming) — best for humans in terminal
#
# Trigger:
# - query param ?raw=1 OR header Accept: text/plain
#
# What it tests:
# - /srv/ai-api/src/guide/modes.js handleRawStream(...)
# - plain text streaming via res.write(chunk)
# - X-Session-Id header set in raw mode
# - abort on disconnect works (AbortController)
#
# How it works in code:
# - route.js builds session + messages
# - route.js calls handleRawStream(...) and RETURNS early if it handled response
# - modes.js sets Content-Type: text/plain; charset=utf-8
# - modes.js loops for await (...) over streamLocalServerChat(...) chunks
# - modes.js writes each chunk directly to client and accumulates into `reply`
# - at end, modes.js pushMessage(session,"assistant",reply) to preserve memory
###############################################################################
sudo bash -lc 'source /etc/ai-api/ai-api.env; curl -N -i \
  -H "x-api-key: $AI_API_KEY" \
  -H "content-type: application/json" \
  -H "accept: text/plain" \
  "'"$BASE"'?raw=1" \
  -d "{\"message\":\"Write a short poem.\"}"'

# Continue RAW session:
# - Grab the X-Session-Id from headers (because we used -i), then reuse it.
# Tip: do it manually first: copy the X-Session-Id value printed above.
# Replace SESSION_ID below:
SESSION_ID="PUT_SESSION_ID_HERE"
sudo bash -lc 'source /etc/ai-api/ai-api.env; curl -N -i \
  -H "x-api-key: $AI_API_KEY" \
  -H "content-type: application/json" \
  -H "accept: text/plain" \
  "'"$BASE"'?raw=1" \
  -d "{\"sessionId\":\"'"$SESSION_ID"'\",\"message\":\"What is my name?\"}"'


###############################################################################
# 2) SSE MODE (structured streaming) — best for tools, bots, browsers
#
# Trigger:
# - header Accept: text/event-stream
#
# What it tests:
# - route.js SSE path: wantsSSE = accept.includes("text/event-stream")
# - startSSE(res) sends proper SSE headers + disables buffering
# - sendEvent(res,"session",...) then sendEvent(res,"token",chunk) per chunk
# - heartbeat every 15s (startHeartbeat) keeps proxy connections alive
# - X-Session-Id header is set BEFORE startSSE(res)
#
# How it works in code:
# - route.js uses startSSE + sendEvent + startHeartbeat from /srv/ai-api/src/guide/sse.js
# - tokens from streamLocalServerChat(...) are forwarded as SSE "token" events
# - full reply is accumulated and stored in session at end
###############################################################################
sudo bash -lc 'source /etc/ai-api/ai-api.env; curl -N -i \
  -H "x-api-key: $AI_API_KEY" \
  -H "content-type: application/json" \
  -H "accept: text/event-stream" \
  "'"$BASE"'" \
  -d "{\"message\":\"Say hello in one sentence.\"}"'

# Continue SSE session:
# - Again, you can copy X-Session-Id from the response headers (since we used -i).
SESSION_ID="PUT_SESSION_ID_HERE"
sudo bash -lc 'source /etc/ai-api/ai-api.env; curl -N \
  -H "x-api-key: $AI_API_KEY" \
  -H "content-type: application/json" \
  -H "accept: text/event-stream" \
  "'"$BASE"'" \
  -d "{\"sessionId\":\"'"$SESSION_ID"'\",\"message\":\"What is my name?\"}"'

# Optional: make SSE output "human readable" without raw mode
# (prints only data payload lines; still streams live)
sudo bash -lc 'source /etc/ai-api/ai-api.env; curl -N \
  -H "x-api-key: $AI_API_KEY" \
  -H "content-type: application/json" \
  -H "accept: text/event-stream" \
  "'"$BASE"'" \
  -d "{\"message\":\"Write a short poem.\"}" \
  | sed -n "s/^data: //p"'


###############################################################################
# 3) JSON MODE (non-stream) — best for scripts that want one response
#
# Trigger:
# - anything that is NOT Accept: text/event-stream
#   (common: Accept: application/json or no Accept header at all)
#
# What it tests:
# - route.js non-stream path: if (!wantsSSE) { ... }
# - server buffers streamed chunks into a single string reply
# - server returns { sessionId: sid, message: reply } as JSON
# - session memory is preserved (assistant reply is pushed into session)
#
# How it works in code:
# - route.js creates AbortController; req.on("close",...) aborts upstream if client drops
# - loops for await (chunk of streamLocalServerChat(...)) and concatenates
# - pushes assistant reply into session and returns JSON
###############################################################################
sudo bash -lc 'source /etc/ai-api/ai-api.env; curl -sS \
  -H "x-api-key: $AI_API_KEY" \
  -H "content-type: application/json" \
  -H "accept: application/json" \
  "'"$BASE"'" \
  -d "{\"message\":\"Say hello in one sentence.\"}" | jq'

# Continue JSON session:
SESSION_ID="PUT_SESSION_ID_HERE"
sudo bash -lc 'source /etc/ai-api/ai-api.env; curl -sS \
  -H "x-api-key: $AI_API_KEY" \
  -H "content-type: application/json" \
  -H "accept: application/json" \
  "'"$BASE"'" \
  -d "{\"sessionId\":\"'"$SESSION_ID"'\",\"message\":\"What is my name?\"}" | jq'


###############################################################################
# 4) AUTH FAILURE (should return 401)
#
# What it tests:
# - your auth middleware / x-api-key check triggers unauthorized
###############################################################################
curl -sS -i \
  -H "x-api-key: WRONG" \
  -H "content-type: application/json" \
  "'"$BASE"'" \
  -d '{"message":"hi"}' | head -n 30


###############################################################################
# 5) ABORT TEST (disconnect stops upstream llama-server request)
#
# What it tests:
# - res.on("close") / req.on("close") triggers AbortController.abort()
# - upstream fetch in model_http.js stops
# - server does not keep generating tokens after client disconnects
#
# How to run:
# - start a long response, then press Ctrl+C while it's streaming.
# - then check logs for AbortError (expected).
###############################################################################
sudo bash -lc 'source /etc/ai-api/ai-api.env; curl -N \
  -H "x-api-key: $AI_API_KEY" \
  -H "content-type: application/json" \
  -H "accept: text/event-stream" \
  "'"$BASE"'" \
  -d "{\"message\":\"Write a very long story (at least 2000 words).\"}"'

# After Ctrl+C, check logs:
journalctl -u ai-api -n 50 --no-pager
###############################################################################

