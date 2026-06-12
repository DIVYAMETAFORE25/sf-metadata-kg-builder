/**
 * OpenAI enrichment logic for the hybrid knowledge graph builder.
 *
 * Given a compact summary of parsed Salesforce metadata plus the rule-engine's
 * candidate business-logic edges, this asks the model to (a) score/confirm those
 * candidate edges and (b) propose additional business-logic relationships. The
 * model is constrained to a strict JSON contract and a fixed set of edge types
 * and node ids so the result can be merged deterministically into the graph.
 */

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

export const ALLOWED_TYPES = ["AUTOMATES", "OPERATES_ON", "BUSINESS_RELATED"];

export const SYSTEM_PROMPT = `You are a Salesforce solution architect that reverse-engineers business architecture from org metadata.

You will receive:
- objects: business entities (id like "object:Account")
- flows: automation (id like "flow:Order_to_Cash")
- apexClasses: code logic (id like "class:ChurnRiskScorer")
- candidateEdges: business-logic relationships the rule engine already inferred, each with a current confidence

Your job:
1. For each candidate edge, decide whether it is correct and assign a calibrated confidence (0.0-1.0) with a short rationale grounded in the names/keywords/metadata.
2. Propose additional high-value business-logic relationships that the rules missed.
3. You MAY add object-to-object business relationships (type BUSINESS_RELATED) when two entities clearly participate in the same business process (e.g. Quote and Opportunity, Subscription and Account).

Rules:
- "from" and "to" MUST be ids that appear in the provided objects/flows/apexClasses lists. Never invent ids.
- AUTOMATES: from a flow id -> to an object id.
- OPERATES_ON: from a class id -> to an object id.
- BUSINESS_RELATED: from an object id -> to an object id (different objects).
- confidence reflects your genuine certainty. Be conservative; reserve >0.85 for strong evidence.
- rationale: one concise sentence citing the evidence (a name, keyword, or trigger).

Respond ONLY with strict JSON of the shape:
{"relationships":[{"from":"...","to":"...","type":"AUTOMATES|OPERATES_ON|BUSINESS_RELATED","confidence":0.0,"rationale":"..."}]}`;

/** Build the user message: a compact, token-efficient view of the metadata. */
export function buildUserPayload(body) {
  const objects = (body.objects ?? []).map((o) => ({
    id: o.id,
    apiName: o.apiName,
    label: o.label,
    custom: o.custom,
  }));
  const flows = (body.flows ?? []).map((f) => ({
    id: f.id,
    apiName: f.apiName,
    label: f.label,
    triggerObject: f.triggerObject,
    processType: f.processType,
  }));
  const apexClasses = (body.apexClasses ?? []).map((c) => ({
    id: c.id,
    apiName: c.apiName,
    logicCategory: c.logicCategory,
    referencedObjects: c.referencedObjects,
    businessKeywords: c.businessKeywords,
    integrationKeywords: c.integrationKeywords,
  }));
  const candidateEdges = (body.candidateEdges ?? []).map((e) => ({
    from: e.source,
    to: e.target,
    type: e.type,
    currentConfidence: e.confidence,
  }));

  return { objects, flows, apexClasses, candidateEdges };
}

/** Validate a single relationship object returned by the model. */
export function sanitizeRelationships(raw, validIds) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const from = String(r.from ?? "");
    const to = String(r.to ?? "");
    const type = String(r.type ?? "");
    if (!ALLOWED_TYPES.includes(type)) continue;
    if (!validIds.has(from) || !validIds.has(to)) continue;
    if (from === to) continue;
    let confidence = Number(r.confidence);
    if (Number.isNaN(confidence)) confidence = 0.5;
    confidence = Math.max(0, Math.min(1, confidence));
    out.push({
      from,
      to,
      type,
      confidence: Number(confidence.toFixed(2)),
      rationale: typeof r.rationale === "string" ? r.rationale.slice(0, 300) : "",
    });
  }
  return out;
}

export async function enrichWithLlm(body, { apiKey, model }) {
  const payload = buildUserPayload(body);

  const validIds = new Set([
    ...payload.objects.map((o) => o.id),
    ...payload.flows.map((f) => f.id),
    ...payload.apexClasses.map((c) => c.id),
  ]);

  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(payload) },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    const err = new Error(
      `OpenAI request failed (${response.status}): ${text.slice(0, 500)}`
    );
    err.status = response.status;
    throw err;
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content ?? "{}";

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
