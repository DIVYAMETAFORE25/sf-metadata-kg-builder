import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { enrichWithLlm } from "./llm.js";
import { enrichWithClaude } from "./claude.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load env from the project root (.env) first, then any local server/.env.
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, ".env") });

const PORT = process.env.PORT || 8787;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o";
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

function cleanKey(value) {
  return value && value.trim() ? value.trim() : null;
}

function getOpenAiKey() {
  return cleanKey(process.env.OPENAI_API_KEY);
}

function getAnthropicKey() {
  return cleanKey(process.env.ANTHROPIC_API_KEY);
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "8mb" }));

// Health check.
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Tells the frontend whether an API key is configured (without exposing it).
app.get("/api/config", (_req, res) => {
  const openaiKey = getOpenAiKey();
  const anthropicKey = getAnthropicKey();
  res.json({
    llmConfigured: Boolean(openaiKey || anthropicKey),
    model: openaiKey ? OPENAI_MODEL : ANTHROPIC_MODEL,
    providers: {
      openai: Boolean(openaiKey),
      anthropic: Boolean(anthropicKey),
    },
  });
});

// Hybrid enrichment endpoint. Tries OpenAI first; on any failure (and when no
// OpenAI key is set), falls back to Claude. The request succeeds as long as one
// provider returns a result.
app.post("/api/enrich", async (req, res) => {
  const openaiKey = getOpenAiKey();
  const anthropicKey = getAnthropicKey();

  if (!openaiKey && !anthropicKey) {
    return res.status(503).json({
      error: "LLM_NOT_CONFIGURED",
      message:
        "No OPENAI_API_KEY or ANTHROPIC_API_KEY configured on the server. Add one to .env and restart.",
    });
  }

  const body = req.body ?? {};
  const attempts = [];

  if (openaiKey) {
    try {
      const result = await enrichWithLlm(body, {
        apiKey: openaiKey,
        model: OPENAI_MODEL,
      });
      return res.json({ ...result, provider: "openai" });
    } catch (err) {
      console.warn(`[metafore-api] OpenAI enrichment failed: ${err.message}`);
      attempts.push(`OpenAI: ${err.message}`);
      // Fall through to Claude if a key is available.
    }
  }

  if (anthropicKey) {
    try {
      const result = await enrichWithClaude(body, {
        apiKey: anthropicKey,
        model: ANTHROPIC_MODEL,
      });
      return res.json({ ...result, provider: "anthropic" });
    } catch (err) {
      console.warn(`[metafore-api] Claude enrichment failed: ${err.message}`);
      attempts.push(`Claude: ${err.message}`);
    }
  }

  return res.status(502).json({
    error: "ENRICHMENT_FAILED",
    message:
      attempts.length > 0
        ? `All configured providers failed. ${attempts.join(" | ")}`
        : "No enrichment provider succeeded.",
  });
});

app.listen(PORT, () => {
  const providers = [
    getOpenAiKey() ? `openai(${OPENAI_MODEL})` : null,
    getAnthropicKey() ? `anthropic(${ANTHROPIC_MODEL})` : null,
  ].filter(Boolean);
  console.log(
    `[metafore-api] listening on :${PORT} · providers=${
      providers.length ? providers.join(", ") : "none configured"
    }`
  );
});
