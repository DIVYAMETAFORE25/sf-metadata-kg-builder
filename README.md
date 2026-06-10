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

## Docker

Build and run the production image (served by nginx):

```bash
docker compose up --build         # http://localhost:8080
```

Run the hot-reload dev server in a container instead:

```bash
docker compose --profile dev up dev   # http://localhost:5173
```

Or with plain Docker:

```bash
docker build -t sf-metadata-kg-builder .
docker run --rm -p 8080:80 sf-metadata-kg-builder
```
