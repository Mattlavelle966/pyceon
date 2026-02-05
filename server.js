

import express from "express";
import { requireApiKey } from "./src/middleware/auth.js";
import { guideRouter } from "./src/guide/route.js";

const app = express();

// Parse incoming JSON bodies
app.use(express.json({ limit: "1mb" }));

const API_KEY = process.env.AI_API_KEY;
if (!API_KEY) {
  console.error("AI_API_KEY not set");
  process.exit(1);
}

// Protect everything behind the API key
app.use(requireApiKey(API_KEY));

// Main endpoint (curl-first)
app.use("/guide", guideRouter);

app.listen(3000, "127.0.0.1", () => {
  console.log("ai-api listening on 127.0.0.1:3000");
});

