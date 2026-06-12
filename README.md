# Metafore — Salesforce Metadata → Knowledge Graph

A web application that ingests a Salesforce metadata bundle and runs it through a
multi-stage pipeline that turns raw org metadata into a Metafore-ready knowledge
graph and BRD draft.

This repository currently implements **Stage 1 — Metadata Parser** and scaffolds
the full pipeline outline (Stages 2–7).

## Pipeline

```
Raw Salesforce metadata
  -> Stage 1  Metadata Parser            (implemented)
  -> Stage 2  Canonical JSON Builder     (planned)
  -> Stage 3  Relationship Inference     (planned)
  -> Stage 4  Metafore Classifier        (planned)
  -> Stage 5  Knowledge Graph Generator  (planned)
  -> Stage 6  Graph Validator            (planned)
  -> Stage 7  BRD View Generator         (planned)
```

## Stage 1 — Metadata Parser

Upload a Salesforce source-format bundle (`force-app.zip`) or a folder of
metadata files. The parser is metadata-type aware and extracts structured
records for:

- **Objects** — API name, label, sharing model, deployment status
- **Fields** — type, required, picklist values, formulas, reference targets
- **Record Types** — name, label, active flag, owning object
- **Flows** — status, process type, trigger object, decisions, assignments
- **Apex classes** — referenced objects, business/integration keywords, logic category
- **Permission sets & profiles** — object, field, and user permissions

All parsing runs locally in the browser — no metadata leaves the machine.
Results can be exported as `parsed_metadata.json` for the next stage.

## Hybrid knowledge graph (rules + LLM)

The knowledge graph (Stage 5) is built in two layers:

1. **Ontology rule engine** (`src/lib/graph/builder.ts`) — deterministic. Creates
   typed nodes and explicit/structural edges (`HAS_FIELD`, `REFERENCES`,
   `RECORD_TYPE_OF`, `GRANTS_ACCESS`) at full confidence, plus rule-inferred
   business edges (`AUTOMATES`, `OPERATES_ON`) from names/keywords/triggers.
2. **LLM enrichment** (optional) — on demand, the graph is sent to a backend
   proxy that calls OpenAI to score the candidate business edges and propose new
   ones (`BUSINESS_RELATED`). Results are merged back:
   - edges both the rules and the LLM agree on become **hybrid** and their
     confidence is boosted via a noisy-OR combination;
   - LLM-only edges are added at the model's (capped) confidence;
   - rule edges the LLM didn't mention are kept (graceful fallback).

Every edge carries a **confidence score** and a **source** (explicit, structural,
rule-inferred, LLM, or hybrid), both visualised on the graph (line colour/weight)
and in the node inspector (confidence bar + rationale).

### Configuring the OpenAI key

The key is held **server-side** and is never exposed to the browser.

```bash
cp .env.example .env        # then edit .env
# .env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o
```

When no key is configured the app still works — it just shows the rules-only
graph and the "Enhance with AI" button is disabled. Check Settings in the app to
confirm the key was detected.

## Tech stack

- React 18 + TypeScript + Vite 6
- Tailwind CSS v4 (using the supplied design `theme.css`)
- `jszip` for in-browser bundle extraction
- `fast-xml-parser` for Salesforce XML
- `react-router-dom` for navigation
- `lucide-react` icons

## Local development

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

```bash
npm run build      # production build into dist/
npm run preview    # preview the production build
npm run typecheck  # TypeScript type checking
```

## Local development (with LLM)

The frontend and the enrichment API run as two processes. Vite proxies `/api`
to the API on port 8787.

```bash
# Terminal 1 — API (reads ../.env)
cd server && npm install && npm start

# Terminal 2 — frontend
npm install && npm run dev          # http://localhost:5173
```

## Docker

`docker compose` runs both the nginx-served frontend and the API. nginx proxies
`/api/*` to the `api` service, which reads `OPENAI_API_KEY` from the root `.env`.

```bash
cp .env.example .env                # add your OPENAI_API_KEY
docker compose up --build           # http://localhost:8080
```

Run the hot-reload dev server in a container instead:

```bash
docker compose --profile dev up dev   # http://localhost:5173
```

Services:

| Service | URL | Purpose |
|---|---|---|
| `web` | http://localhost:8080 | Static frontend (nginx) + `/api` proxy |
| `api` | http://localhost:8787 | OpenAI enrichment proxy |
