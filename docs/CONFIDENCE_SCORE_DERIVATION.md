# Confidence Score Derivation

This document explains exactly how the `confidence` value on every edge in the Knowledge Graph is derived — from the first base score assigned by the rule engine, through the LLM enrichment step, to the final hybrid blend.

---

## Overview

Every edge carries a single `confidence` value in the range **[0, 1]** that represents the certainty of the relationship. This value is produced in **three sequential layers**:

```
┌─────────────────────┐
│  Layer 1            │  Rule Engine (builder.ts + ontology.ts)
│  Base Score         │  deterministic, metadata-derived
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Layer 2            │  LLM Enrichment (server/llm.js or server/claude.js)
│  LLM Score          │  probabilistic, language-model-derived
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Layer 3            │  Hybrid Merge (hybrid.ts)
│  Final Score        │  noisy-OR blend of Layer 1 + Layer 2
└─────────────────────┘
```

The four possible `derivation` values that describe how an edge reached its final score:

| `derivation` | Meaning |
|---|---|
| `explicit` | Directly declared in Salesforce metadata — score locked at **1.0** |
| `structural` | Inferred from schema structure — score locked (no LLM boost) |
| `inferred` | Name/keyword token-overlap heuristic — score boosted by LLM |
| `llm` | Proposed entirely by the LLM — no rule-engine counterpart |
| `hybrid` | Rule-engine edge confirmed and re-scored by LLM via noisy-OR |

---

## Layer 1 — Rule Engine Base Score

### 1a. Ontology Base Confidence

Every edge type has a static `baseConfidence` defined in `ontology.ts`. This is the floor score assigned when an edge is first created.

| Edge Type | `baseConfidence` | Rationale |
|---|---|---|
| `HAS_FIELD` | **1.0** | Schema fact — field always belongs to object |
| `REFERENCES` | **1.0** | Lookup/Master-Detail `referenceTo` is explicit |
| `RECORD_TYPE_OF` | **1.0** | Record type membership is structural |
| `GRANTS_ACCESS` | **1.0** | Profile/Permission Set assignments are explicit |
| `BUSINESS_RELATED` | **0.6** | Soft semantic link — LLM-only type |
| `AUTOMATES` | **0.5** | Flow → Object link may need inference |
| `OPERATES_ON` | **0.4** | Apex → Object link frequently needs inference |

### 1b. Explicit Links (confidence = 1.0)

When the metadata directly declares the relationship, the confidence is set to **1.0** regardless of base score, and the `derivation` is marked `"explicit"`:

**Flows** — when `flow.triggerObject` is present and maps to a known object:
```
confidence = 1.0   derivation = "explicit"
evidence  = "flow trigger object = <objectApiName>"
```

**Apex classes** — when `apex.referencedObjects` contains a known object API name:
```
confidence = 1.0   derivation = "explicit"
evidence  = "referenced object <objectApiName>"
```

### 1c. Inferred Links — Token Overlap Formula

When no explicit metadata link exists, the builder tokenises the component name and its business keywords, then counts how many tokens are shared with a candidate object's name/label tokens.

**Formula:**
```
confidence = min(0.85, baseConfidence + (overlap − 1) × 0.15)
```

| Variable | Description |
|---|---|
| `baseConfidence` | `0.5` for flows (`AUTOMATES`), `0.4` for Apex (`OPERATES_ON`) |
| `overlap` | Count of shared tokens between component and object |
| `0.15` | Confidence increment per additional matching token |
| `0.85` | Hard ceiling — inference never reaches certainty |

**Examples:**

| overlap | Flow baseConf = 0.5 | Apex baseConf = 0.4 |
|---|---|---|
| 1 | `min(0.85, 0.50 + 0×0.15)` = **0.50** | **0.40** |
| 2 | `min(0.85, 0.50 + 1×0.15)` = **0.65** | **0.55** |
| 3 | `min(0.85, 0.50 + 2×0.15)` = **0.80** | **0.70** |
| 4 | `min(0.85, 0.50 + 3×0.15)` = **0.85** (capped) | **0.85** (capped) |

The result is rounded to 2 decimal places and stored as `confidence` with `derivation = "inferred"`.

---

## Layer 2 — LLM Enrichment Score

### 2a. What is sent to the LLM

Only edges of type `AUTOMATES`, `OPERATES_ON`, and `BUSINESS_RELATED` are considered candidates. The payload includes:

- All object metadata (API name, label, fields, record types)
- All flow metadata (name, trigger object, business keywords)
- All Apex class metadata (name, referenced objects, logic category)
- The **current candidate edges** from Layer 1, including their `confidence`

### 2b. LLM Scoring Instructions

The LLM receives this instruction in its system prompt:

> *"confidence reflects your genuine certainty. Be conservative; reserve > 0.85 for strong evidence."*

The model must respond with structured JSON:
```json
{
  "relationships": [
    {
      "from": "<nodeId>",
      "to": "<nodeId>",
      "type": "AUTOMATES | OPERATES_ON | BUSINESS_RELATED",
      "confidence": 0.0,
      "rationale": "short explanation grounded in names/keywords"
    }
  ]
}
```

`temperature: 0.2` is used for OpenAI calls to keep outputs deterministic and conservative.

### 2c. LLM Output Sanitization

Before the LLM score enters any merge logic, it is sanitized:

1. **NaN guard** — if `confidence` is not a number → default to **0.5**
2. **Clamp** — `confidence = max(0, min(1, confidence))`
3. **Round** — `confidence = confidence.toFixed(2)`
4. **Type allowlist** — only `AUTOMATES`, `OPERATES_ON`, `BUSINESS_RELATED` accepted
5. **Node ID check** — `from` and `to` must exist in the current graph
6. **Self-loop guard** — `from !== to`

---

## Layer 3 — Hybrid Merge (Final Score)

This layer runs in `hybrid.ts` and produces the final `confidence` stored on the edge. The merge has three distinct paths:

### Path A — Explicit / Structural edge confirmed by LLM

The rule engine already has certainty-level evidence. LLM agreement does not add information.

```
finalConfidence = ruleConfidence   (unchanged — no boost)
derivation      = "hybrid"
```

### Path B — Inferred edge confirmed by LLM (noisy-OR)

Both the rule engine and the LLM independently agree on the relationship. Two independent signals agreeing reduces the probability that both are wrong.

**Noisy-OR formula:**
```
noisyOr(a, b) = 1 − (1 − a) × (1 − b)

finalConfidence = min(0.99, noisyOr(ruleConfidence, llmConfidence))
derivation      = "hybrid"
```

The cap of **0.99** ensures no inferred+LLM edge can reach absolute certainty.

**Worked examples:**

| ruleConf (a) | llmConf (b) | noisyOr result | capped at 0.99 |
|---|---|---|---|
| 0.50 | 0.70 | 1 − 0.50 × 0.30 = **0.85** | 0.85 |
| 0.65 | 0.80 | 1 − 0.35 × 0.20 = **0.93** | 0.93 |
| 0.80 | 0.85 | 1 − 0.20 × 0.15 = **0.97** | 0.97 |
| 0.85 | 0.90 | 1 − 0.15 × 0.10 = **0.985** | 0.985 |
| 0.90 | 0.95 | 1 − 0.10 × 0.05 = **0.995** | **0.99** (capped) |

The edge also stores both component scores for traceability:
- `ruleConfidence` — what the rule engine assigned
- `llmConfidence` — what the LLM assigned
- `confidence` — the final blended value

### Path C — New edge proposed only by LLM

The rule engine found no evidence for this edge. The LLM-only score is accepted but capped lower than a confirmed hybrid edge:

```
finalConfidence = min(0.90, llmConfidence)
derivation      = "llm"
```

The cap of **0.90** ensures purely LLM-proposed edges can never outrank a hybrid edge that both signals agreed on.

### Path D — Rule edge not mentioned by LLM

The LLM did not address this edge at all (graceful fallback — LLM output is always partial):

```
finalConfidence = ruleConfidence   (unchanged)
derivation      = original derivation ("explicit" / "inferred")
```

---

## Score Ceiling Summary

| Scenario | Max possible `confidence` |
|---|---|
| Explicit metadata declaration | **1.0** (exact, locked) |
| Structural schema fact | **1.0** (exact, locked) |
| LLM-only (no rule evidence) | **0.90** |
| Inferred rule + LLM hybrid | **0.99** |
| Inferred rule, no LLM | **0.85** |

---

## Confidence Tiers (UI)

The final `confidence` value maps to a display tier used for edge styling:

| Tier | Threshold | Edge appearance |
|---|---|---|
| `high` | `>= 0.8` | Thicker, more opaque line |
| `medium` | `>= 0.5` | Standard weight |
| `low` | `< 0.5` | Thin, faded line |

Visual properties in `GraphCanvas.tsx`:
```
lineWidth = 0.9 + confidence × 2.4   (+ 0.8 if highlighted)
opacity   = 0.35 + confidence × 0.55
```

---

## End-to-End Flow Diagram

```
Salesforce Metadata
        │
        ▼
┌─────────────────────────────────────────────┐
│  Rule Engine (builder.ts)                   │
│                                             │
│  explicit link found?                       │
│    YES → confidence = 1.0, derivation=explicit
│    NO  → token overlap formula              │
│           confidence = min(0.85,            │
│             base + (overlap−1)×0.15)        │
│           derivation = inferred             │
└───────────────────┬─────────────────────────┘
                    │  base graph
                    ▼
┌─────────────────────────────────────────────┐
│  LLM Enrichment (server/llm.js)             │
│                                             │
│  Candidate edges (AUTOMATES/OPERATES_ON)    │
│  + full metadata → OpenAI / Claude          │
│                                             │
│  LLM output sanitized:                      │
│    NaN → 0.5, clamped [0,1], rounded ×2dp   │
└───────────────────┬─────────────────────────┘
                    │  LlmRelationship[]
                    ▼
┌─────────────────────────────────────────────┐
│  Hybrid Merge (hybrid.ts)                   │
│                                             │
│  Edge already exists in base graph?         │
│    explicit/structural → unchanged (1.0)    │
│    inferred → noisy-OR blend, cap 0.99      │
│  New LLM-only edge → min(0.9, llmConf)      │
│  Rule edge LLM ignored → unchanged          │
└───────────────────┬─────────────────────────┘
                    │  final KnowledgeGraph
                    ▼
          confidence stored per edge
          ruleConfidence + llmConfidence
          available for inspector UI
```

---

## Aggregate Statistics

After merge, `computeStats()` calculates the graph-level average:

```
avgConfidence = Σ(edge.confidence) / edgeCount
```

This is displayed in the graph inspector alongside per-derivation edge counts (`inferredEdgeCount`, `llmEdgeCount`, `hybridEdgeCount`).
