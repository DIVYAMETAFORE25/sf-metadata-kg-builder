/**
 * Anthropic (Claude) enrichment logic — fallback for when the OpenAI path is
 * unavailable (no key, invalid key, or any request failure).
 *
 * Mirrors server/llm.js: same compact payload, same system prompt, same strict
 * JSON contract and the same deterministic merge into the graph. The only thing
 * that differs is the provider wire format. We constrain Claude's output with a
 * JSON schema (structured outputs) so the response is guaranteed-valid JSON.
 */

import {
  ALLOWED_TYPES,
  SYSTEM_PROMPT,
  buildUserPayload,
  sanitizeRelationships,
} from "./llm.js";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/** Strict JSON schema the model is constrained to (structured outputs). */
const RELATIONSHIPS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    relationships: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          from: { type: "string" },
          to: { type: "string" },
          type: { type: "string", enum: ALLOWED_TYPES },
          confidence: { type: "number" },
          rationale: { type: "string" },
        },
        required: ["from", "to", "type", "confidence", "rationale"],
      },
    },
  },
  required: ["relationships"],
};

export async function enrichWithClaude(body, { apiKey, model }) {
  const payload = buildUserPayload(body);

  const validIds = new Set([
    ...payload.objects.map((o) => o.id),
    ...payload.flows.map((f) => f.id),
    ...payload.apexClasses.map((c) => c.id),
  ]);

  const response = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      output_config: {
        effort: "medium",
        format: {
          type: "json_schema",
          schema: RELATIONSHIPS_SCHEMA,
        },
      },
      messages: [{ role: "user", content: JSON.stringify(payload) }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    const err = new Error(
      `Anthropic request failed (${response.status}): ${text.slice(0, 500)}`
    );
    err.status = response.status;
    throw err;
  }

  const data = await response.json();
  const content = Array.isArray(data?.content)
    ? data.content.find((b) => b.type === "text")?.text ?? "{}"
    : "{}";

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Model returned non-JSON content.");
  }

  const relationships = sanitizeRelationships(parsed.relationships, validIds);

  return {
    relationships,
    model: data.model ?? model,
    usage: data.usage ?? null,
  };
}
