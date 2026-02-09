import express from "express";
import crypto from "crypto";
import { logSessionEvent, sanitizeHeaders } from "../logger/logger.js";

export const detailsRouter = express.Router();

/**
 * GET /details 
 * Returns static XML -> school
 * 
 */ 

detailsRouter.get("/", (req,res) => {

  const requestId = `details-${crypto-randomBytes(8).toString("hex")}`;


  logSessionEvent(rid, "connect", {
    ip:req.ip,
    path:req.originalUrl,
    headers: sanitizeHeaders(req.headers),
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
          <details>
            <service>PYCEON</service>
            <endpoint>/details</endpoint>

            <model>
              <name>Qwen2.5-7B-Instruct</name>
              <format>GGUF</format>
              <quantization>Q4_K_M</quantization>
              <servedBy>llama-server (llama.cpp)</servedBy>
            </model>

            <backend>
              <baseUrl>http://127.0.0.1:8080</baseUrl>
              <openAICompatible>true</openAICompatible>
              <chatCompletionsPath>/v1/chat/completions</chatCompletionsPath>
            </backend>

            <auth>
              <header>x-api-key</header>
              <required>true</required>
            </auth>
          </details>
          `;
  res.status(200);
  res.setHeader("Content-Type","application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.send(xml);

});
