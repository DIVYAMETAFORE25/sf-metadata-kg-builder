# Technical Architecture Document
## Metafore — Salesforce Metadata to Knowledge Graph Builder

**Version:** 1.0  
**Date:** June 2026  
**Status:** Active Development  
**Audience:** Engineering team, technical reviewers

---

## 1. System Overview

Metafore is a client-side single-page application (SPA) built with React 18,
TypeScript, Vite 6, and Tailwind CSS v4. It is deployed as a static site served
by nginx inside a Docker container.

The entire transformation pipeline — from zip extraction through XML parsing to
artifact record production — runs inside the user's browser using standard Web
APIs. No backend service exists in the current architecture. All state is held
in React context for the duration of the browser session.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Browser                                                                │
│                                                                         │
│  ┌──────────┐    ┌────────────────────────────────────────────────┐    │
│  │  User's  │    │   React SPA (Vite + TypeScript + Tailwind v4)  │    │
│  │  local   │───▶│                                                │    │
│  │  .zip /  │    │  ┌──────────────────────────────────────────┐  │    │
│  │  folder  │    │  │           PipelineContext (state)        │  │    │
│  └──────────┘    │  │  status · metadata · error · bundleName  │  │    │
│                  │  └──────────────────┬───────────────────────┘  │    │
│                  │                     │                           │    │
│                  │  ┌──────────────────▼───────────────────────┐  │    │
│                  │  │           Stage 1: Parser lib             │  │    │
│                  │  │  load.ts → parser.ts → types.ts           │  │    │
│                  │  │  (jszip · fast-xml-parser)                │  │    │
│                  │  └──────────────────────────────────────────┘  │    │
│                  │                                                │    │
│                  │  Pages: Overview · Upload · Parser · Stubs     │    │
│                  └────────────────────────────────────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────▼──────────┐
                    │  nginx container   │
                    │  (Docker)          │
                    │  port 8080 → :80   │
                    └────────────────────┘
```

---

## 2. Repository Structure

```
sf-metadata-kg-builder/
│
├── src/
│   ├── main.tsx                  # React entry point; mounts providers + router
│   ├── App.tsx                   # Route definitions
│   ├── index.css                 # Tailwind v4 base, theme import, font import
│   ├── theme.css                 # Metafore design token set (CSS custom properties)
│   ├── vite-env.d.ts             # Vite/TS environment types
│   │
│   ├── lib/
│   │   ├── utils.ts              # Shared utilities (cn, formatNumber, downloadJson)
│   │   ├── pipeline.ts           # Stage definitions + PIPELINE_STAGES registry
│   │   └── parser/
│   │       ├── index.ts          # Barrel export
│   │       ├── types.ts          # All TypeScript interfaces for parsed artifacts
│   │       ├── parser.ts         # Core parsing logic (per-type parsers + orchestrator)
│   │       └── load.ts           # File loading (zip extraction + folder reading)
│   │
│   ├── store/
│   │   └── PipelineContext.tsx   # Global pipeline state (React context + useCallback)
│   │
│   ├── components/
│   │   ├── ui.tsx                # Shared UI primitives (Badge, Card, Button, etc.)
│   │   └── layout/
│   │       ├── AppLayout.tsx     # Two-column shell (sidebar + scrollable main)
│   │       ├── Sidebar.tsx       # Left nav with pipeline stage links
│   │       └── PageHeader.tsx    # Eyebrow / title / description / action slot
│   │
│   └── pages/
│       ├── Overview.tsx          # Pipeline dashboard (KPI tiles, health summary)
│       ├── Upload.tsx            # Drag-and-drop metadata upload
│       ├── MetadataParser.tsx    # Stage 1 results (tabbed artifact tables)
│       ├── StagePlaceholder.tsx  # Planned-stage pages (Stages 2–7)
│       └── InfoPage.tsx          # Documentation + Settings pages
│
├── docs/
│   ├── PRODUCT_OBJECTIVE.md      # This document's companion
│   └── TECHNICAL_ARCHITECTURE.md # This document
│
├── public/
│   └── favicon.svg
│
├── Dockerfile                    # Multi-stage build (node:22-alpine → nginx:1.27-alpine)
├── docker-compose.yml            # Production (web) + dev profile (dev)
├── nginx.conf                    # SPA-friendly nginx config with asset caching
├── .dockerignore
├── .gitignore
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## 3. Frontend Architecture

### 3.1 Technology choices

| Concern | Choice | Reason |
|---|---|---|
| UI framework | React 18 | Component model well-suited to tabbed data tables and context-driven state |
| Language | TypeScript 5.6 (strict) | Parser type contracts are non-trivial; strict mode catches shape mismatches at compile time |
| Build tool | Vite 6 | Sub-second HMR; native ESM; Rollup-based production build with code splitting |
| CSS | Tailwind CSS v4 (Vite plugin) | Utility-first; the v4 Vite plugin eliminates a separate PostCSS config; the supplied `theme.css` maps directly to CSS custom properties |
| Routing | React Router v6 | Declarative route tree; supports the SPA fallback pattern needed for nginx deployment |
| XML parsing | fast-xml-parser v4 | Zero-dependency, tree-shaking friendly; handles Salesforce XML namespace patterns reliably |
| Zip extraction | JSZip v3 | Mature, well-tested; async API fits cleanly into the async parser pipeline |
| Icons | lucide-react | Consistent stroke-based icon set; tree-shakeable; used for stage icons, nav, and UI affordances |

### 3.2 State management

State is intentionally minimal. The application has a single cross-cutting concern:
the parsed metadata output from Stage 1. Everything else is local component state.

```
PipelineContext
  ├── status: "idle" | "parsing" | "ready" | "error"
  ├── metadata: ParsedMetadata | null
  ├── error: string | null
  ├── bundleName: string | null
  ├── parseFromFiles(files: File[]): Promise<void>
  └── reset(): void
```

`PipelineProvider` wraps the router tree so any page can read the parsed metadata
via `usePipeline()`. No external state library (Redux, Zustand, etc.) is used.
The context is sufficient because:
- There is only one "session" of data at a time
- The data is immutable after parsing completes
- No cross-route mutations occur after the initial parse

### 3.3 Routing

| Route | Component | Purpose |
|---|---|---|
| `/` | `Overview` | Pipeline dashboard: KPI tiles, stage cards, parse health |
| `/upload` | `Upload` | Drag-and-drop metadata ingestion |
| `/parser` | `MetadataParser` | Stage 1 results: tabbed artifact tables + JSON export |
| `/canonical` | `StagePlaceholder` | Stage 2 — planned |
| `/relationships` | `StagePlaceholder` | Stage 3 — planned |
| `/classification` | `StagePlaceholder` | Stage 4 — planned |
| `/graph` | `StagePlaceholder` | Stage 5 — planned |
| `/validation` | `StagePlaceholder` | Stage 6 — planned |
| `/brd` | `StagePlaceholder` | Stage 7 — planned |
| `/docs` | `InfoPage` | Pipeline documentation |
| `/settings` | `InfoPage` | Application settings |
| `*` | redirect | → `/` |

All routes are rendered client-side. The nginx config includes a
`try_files $uri /index.html` fallback so deep-linking and page refresh work
correctly in production.

---

## 4. Stage 1 — Parser Library Design

The parser library (`src/lib/parser/`) is the core engineered component of the
current release. It is designed as a pure TypeScript module with no React
dependencies so it can be extracted and run in a Node.js context, a Web Worker,
or a server-side pipeline in a future version.

### 4.1 Module responsibilities

```
load.ts          File loading layer
  ├── filesFromZip(file: File)           Extracts relevant files from a .zip
  ├── filesFromFileList(files: File[])   Reads relevant files from a multi-file pick
  └── isZipFile(file: File)              Detects zip by extension and MIME type

parser.ts        Parsing and orchestration layer
  ├── classify(path)                     Assigns a FileKind to each path by extension
  ├── parseObjectFile()                  Handles .object-meta.xml and inline fields/RT
  ├── parseFieldFile()                   Handles standalone .field-meta.xml
  ├── parseRecordTypeFile()              Handles .recordtype-meta.xml
  ├── parseFlowFile()                    Handles .flow-meta.xml
  ├── parseApexClass()                   Handles .cls via regex extraction
  ├── parsePermissionSetFile()           Handles .permissionset-meta.xml
  ├── parseProfileFile()                 Handles .profile-meta.xml
  └── parseMetadataFiles(files, opts)    Orchestrator — iterates files, dispatches

types.ts         Contract layer
  └── All TypeScript interfaces for ParsedMetadata and its nested types
```

### 4.2 File classification

The first decision the parser makes for each file is its `FileKind`. This is
determined purely by file extension and does not require reading the file content:

```typescript
type FileKind =
  | "object" | "field" | "recordType" | "flow"
  | "apexClass" | "apexMeta" | "permissionSet" | "profile" | "unknown"

function classify(path: string): FileKind
```

Files with `FileKind = "unknown"` are counted in `stats.filesSkipped` but do not
produce warnings. Files that fail parsing are counted as skipped and produce a
`PARSE_ERROR` warning with `severity: "high"`.

### 4.3 XML parsing strategy

`fast-xml-parser` is configured with:
- `ignoreAttributes: true` — Salesforce metadata attributes are rarely needed;
  the tag content carries the semantic value
- `parseTagValue: true` — so booleans (`true`/`false`) and numbers in tag text
  are typed correctly
- `trimValues: true` — removes leading/trailing whitespace from text content

A shared `xml` parser instance is created once at module load; it is used for
all XML parsing calls. Parsing is synchronous per file.

### 4.4 Apex parsing strategy

Apex `.cls` files are not XML. The parser uses targeted regular expressions
rather than an Apex grammar:

| Extraction target | Method |
|---|---|
| Objects referenced in SOQL | `/\bFROM\s+([A-Za-z0-9_]+)/gi` |
| Custom object references | `/\b([A-Za-z0-9_]+__c)\b/g` |
| Standard object references | Word-boundary match against a curated list of 18 standard objects |
| Integration keywords | Pattern match against a curated list of 19 integration indicators |
| Business keywords | Pattern match against a curated list of 17 business domain terms |
| Test class detection | `/@istest/i` or `/testmethod/i` |

The `logicCategory` is assigned using a priority cascade:
1. Trigger handler (references `Trigger.new` / `Trigger.old` or class name contains "trigger")
2. Integration (any integration keyword found)
3. Scoring / Intelligence (class name contains "score", "scorer", "risk", "ml", "predict")
4. Calculation (class name contains "calc", "commission", "compute")
5. Provisioning (class name contains "provision")
6. Service / Other (default)

### 4.5 Relationship target validation

After all files are parsed, the orchestrator runs a post-processing pass over all
fields. For each field that has a `references[]` entry, it checks whether the
`referenceTo` object name exists in the parsed object set. If it does not, a
`MISSING_RELATIONSHIP_TARGET` warning is emitted with `severity: "medium"`. This
is the primary cross-artifact consistency check in Stage 1.

```typescript
for (const field of fields) {
  for (const ref of field.references) {
    if (!objectNames.has(ref.referenceTo)) {
      warnings.push({
        type: "MISSING_RELATIONSHIP_TARGET",
        artifact: field.id,
        message: `Field references "${ref.referenceTo}" which was not found...`,
        severity: "medium",
      });
    }
  }
}
```

### 4.6 Output contract — ParsedMetadata

```typescript
interface ParsedMetadata {
  org: {
    source: "salesforce";
    extractionMode: "metadataBundle" | "looseFiles";
    apiVersion: string;
    bundleName?: string;
    parsedAt: string;         // ISO 8601
    parserVersion: string;    // semver, e.g. "1.0.0"
  };
  objects:        ParsedObject[];
  fields:         ParsedField[];
  recordTypes:    ParsedRecordType[];
  flows:          ParsedFlow[];
  apexClasses:    ParsedApexClass[];
  permissionSets: ParsedPermissionSet[];
  profiles:       ParsedProfile[];
  warnings:       ParseWarning[];
  stats: {
    filesScanned:    number;
    filesParsed:     number;
    filesSkipped:    number;
    durationMs:      number;
    extractionMode:  "metadataBundle" | "looseFiles";
  };
}
```

All top-level arrays are sorted alphabetically by `apiName` / `id` before
returning, so the JSON output is deterministic across runs on the same input.

### 4.7 Supported file types

| Extension | Salesforce artifact | Parser |
|---|---|---|
| `.object-meta.xml` | Custom/standard object (sfdx) | `parseObjectFile` |
| `.object` | Object (metadata API) | `parseObjectFile` |
| `.field-meta.xml` | Field (sfdx) | `parseFieldFile` |
| `.recordtype-meta.xml` | Record type (sfdx) | `parseRecordTypeFile` |
| `.flow-meta.xml` | Flow (sfdx) | `parseFlowFile` |
| `.flow` | Flow (metadata API) | `parseFlowFile` |
| `.cls` | Apex class source | `parseApexClass` |
| `.cls-meta.xml` | Apex class metadata | API version extraction only |
| `.permissionset-meta.xml` | Permission set (sfdx) | `parsePermissionSetFile` |
| `.permissionset` | Permission set (metadata API) | `parsePermissionSetFile` |
| `.profile-meta.xml` | Profile (sfdx) | `parseProfileFile` |
| `.profile` | Profile (metadata API) | `parseProfileFile` |

---

## 5. Design Token System

The visual design is driven by a CSS custom-property token system defined in
`src/theme.css`. Tailwind CSS v4 is configured to read these tokens through the
`@theme {}` block in the same file.

Key token categories:

| Category | CSS variable prefix | Example |
|---|---|---|
| Brand colours (teal/dark-teal) | `--color-brand-*` | `--color-brand-600: #1A6465` |
| Semantic text | `--color-text-*` | `--color-text-primary`, `--color-text-secondary` |
| Semantic background | `--color-bg-*` | `--color-bg-primary`, `--color-bg-brand-solid` |
| Semantic border | `--color-border-*` | `--color-border-primary`, `--color-border-brand` |
| Semantic foreground | `--color-fg-*` | `--color-fg-primary`, `--color-fg-brand-primary` |
| Shadows | `--shadow-*` | `--shadow-xs`, `--shadow-sm`, `--shadow-lg` |
| Radius | `--radius-*` | `--radius-md: 0.5rem`, `--radius-2xl: 1rem` |
| Typography | `--text-*` | `--text-sm`, `--text-lg`, `--text-display-md` |

Dark mode is supported via the `.dark-mode` class selector on a parent element
(the `@layer base` block in `theme.css` inverts all semantic tokens).

---

## 6. Component Architecture

### 6.1 Shared UI primitives (`src/components/ui.tsx`)

All layout-independent, reusable UI elements live in a single file to keep the
component surface small at this stage:

| Component | Purpose |
|---|---|
| `Badge` | Coloured pill label with tone variants: brand, gray, success, warning, error |
| `Card` | White rounded-2xl bordered container |
| `StatTile` | KPI summary card with code/value/label/caption and optional highlight variant |
| `SectionTitle` | h2 + description + optional action slot |
| `EmptyState` | Centred dashed-border empty placeholder with icon, title, description, action |
| `Button` | Variants: primary (brand), secondary (outlined), ghost; accepts icon prop |
| `ProgressBar` | Animated brand-coloured progress bar |

### 6.2 Layout system

```
AppLayout (flex row, full viewport height)
  ├── Sidebar (w-64, fixed, scrollable nav)
  │     ├── Logo + brand name
  │     ├── NavItem list (Overview, Upload, pipeline stages)
  │     ├── Footer nav (Docs, Settings)
  │     └── "New Pipeline" CTA button
  └── <main> (flex-1, overflow-y-auto)
        └── max-w-[1180px] padded container
              └── PageHeader + page content
```

`PageHeader` accepts `eyebrow`, `title`, `description`, and an `actions` slot
(rendered top-right). The eyebrow uses the `.eyebrow` utility class (uppercase,
`letter-spacing: 0.14em`).

---

## 7. Data Flow

```
User selects file(s)
        │
        ▼
Upload.tsx
  └── parseFromFiles(files)   [PipelineContext]
        │
        ├── isZipFile(files[0])?
        │     ├── YES → filesFromZip(file)       [load.ts — JSZip]
        │     └── NO  → filesFromFileList(files)  [load.ts — File API]
        │
        └── parseMetadataFiles(metadataFiles, opts)   [parser.ts]
              │
              ├── for each file:
              │     classify(file.path) → FileKind
              │     └── dispatch to per-type parser
              │
              ├── post-process: relationship target validation
              │
              └── return ParsedMetadata
                    │
                    ▼
              setMetadata(result)   [PipelineContext state]
                    │
                    ├── Overview.tsx     reads metadata.objects.length, etc.
                    ├── MetadataParser   renders tabbed artifact tables
                    └── Export button   calls downloadJson(metadata, filename)
```

---

## 8. Deployment Architecture

### 8.1 Docker multi-stage build

The `Dockerfile` uses two stages to keep the production image small:

```dockerfile
# Stage 1: Build
FROM node:22-alpine AS build
# Installs deps, copies source, runs "vite build"
# Output: /app/dist/ (static HTML/JS/CSS assets)

# Stage 2: Runtime
FROM nginx:1.27-alpine AS runtime
# Copies dist/ into nginx web root
# Copies nginx.conf for SPA routing
# Final image is ~25 MB
```

### 8.2 nginx configuration

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;

    # Cache-busted assets get 1-year immutable headers
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # SPA fallback — all routes served by index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;
}
```

### 8.3 Docker Compose services

| Service | Profile | Image | Port | Purpose |
|---|---|---|---|---|
| `web` | default | `sf-metadata-kg-builder:latest` | `8080:80` | Production static site |
| `dev` | `dev` | `node:22-alpine` | `5173:5173` | Hot-reload development server with volume mount |

### 8.4 Build outputs

| File | Size (gzip) | Contents |
|---|---|---|
| `dist/index.html` | ~0.32 kB | Entry HTML shell |
| `dist/assets/index-*.css` | ~9.25 kB | Tailwind + custom properties + font stacks |
| `dist/assets/index-*.js` | ~111 kB | React + router + parser + all page components |

---

## 9. TypeScript Configuration

```json
{
  "compilerOptions": {
    "target": "ES2021",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "jsx": "react-jsx",
    "paths": { "@/*": ["src/*"] }
  }
}
```

`strict: true` is intentional. The parser type contracts (`ParsedMetadata` and
all nested interfaces) must be exact — downstream pipeline stages will depend on
them as a stable API contract.

The `@/` path alias maps to `src/` and is resolved by both TypeScript (via
`paths`) and Vite (via `resolve.alias`).

---

## 10. Future Architecture Considerations

### 10.1 Web Worker offload

For very large bundles (enterprise orgs with 200+ objects and thousands of fields),
parsing can block the main thread long enough to cause jank. The parser library is
already written as a pure module with no React dependencies, making it straightforward
to move into a `Worker` using `new Worker(new URL('../lib/parser/worker.ts', import.meta.url))`.
The context's `parseFromFiles` would post a message and await the response.

### 10.2 Persistent storage

Currently all parsed state is lost on page refresh. Adding IndexedDB persistence
(via `idb` or a thin wrapper) would allow sessions to resume. The `ParsedMetadata`
interface is JSON-serialisable so no transformation is needed.

### 10.3 Server-side pipeline for large orgs

For orgs where in-browser parsing is impractical, the parser library can be
published as an npm package and run in a Node.js server. The same TypeScript
interfaces and `parseMetadataFiles()` function work unchanged in Node — `JSZip`
and `fast-xml-parser` are both platform-agnostic.

### 10.4 Backend service for Stages 5–7

The knowledge graph generator and BRD view generator (Stages 5–7) will likely
require a graph database (Neo4j, Memgraph, or an in-process property graph
library). These stages will be implemented as a lightweight backend service that
accepts `canonical_metadata.json` as input, stores the graph, and exposes query
endpoints to the React frontend.

### 10.5 Stage-to-stage contract versioning

Each stage's output contract will carry a `schemaVersion` field so that if the
canonical JSON shape changes, downstream stages can detect and handle the version
mismatch rather than silently producing incorrect output.

---

## 11. Dependency Inventory

| Package | Version | Role |
|---|---|---|
| `react` | 18.3.x | UI framework |
| `react-dom` | 18.3.x | DOM rendering |
| `react-router-dom` | 6.28.x | Client-side routing |
| `fast-xml-parser` | 4.5.x | Salesforce XML parsing |
| `jszip` | 3.10.x | In-browser zip extraction |
| `lucide-react` | 0.460.x | Icon set |
| `vite` | 6.0.x | Build tool + dev server |
| `@vitejs/plugin-react` | 4.3.x | React fast-refresh + JSX transform |
| `tailwindcss` | 4.0.x | Utility-first CSS |
| `@tailwindcss/vite` | 4.0.x | Tailwind v4 Vite integration |
| `typescript` | 5.6.x | Type checking |
| `@types/react` | 18.3.x | React type definitions |
| `@types/react-dom` | 18.3.x | ReactDOM type definitions |
| `@types/node` | 22.x | Node.js type definitions (for vite.config.ts) |

---

*Document maintained by the Metafore engineering team. Last updated: June 2026.*
