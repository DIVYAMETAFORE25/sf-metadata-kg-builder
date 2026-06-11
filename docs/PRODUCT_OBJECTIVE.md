# Product Objective Document
## Metafore — Salesforce Metadata to Knowledge Graph Builder

**Version:** 1.0  
**Date:** June 2026  
**Status:** Active Development  
**Classification:** Internal / Confidential

---

## 1. Executive Summary

Metafore is a browser-based intelligence platform that transforms raw Salesforce
org metadata into a structured knowledge graph and business requirements document
(BRD). The core insight driving the product is that Salesforce metadata — spread
across XML files, Apex classes, flows, and permission configurations — already
encodes a complete picture of an organisation's business architecture. That
picture is hidden inside file structures, naming conventions, and implicit
relationships. Metafore surfaces it.

The product is built around a seven-stage transformation pipeline. Each stage has
a single, well-scoped responsibility: the output of one stage is the exact input
contract for the next. Stage 1 — the Metadata Parser — is fully implemented and
is the subject of this document. Stages 2–7 are scaffolded in the application and
are part of the active development roadmap.

---

## 2. Problem Statement

### 2.1 The challenge with raw Salesforce metadata

Salesforce orgs accumulate metadata over years of configuration, development, and
customisation. When an organisation needs to audit its architecture, migrate to a
new platform, generate documentation, or plan a re-implementation, the only
reliable source of truth is the org's own metadata. But that metadata is not
ready to be used directly:

- It is spread across hundreds of XML files and Apex source files in multiple
  folder hierarchies.
- Relationships between objects, flows, Apex classes, and permission sets are
  often implicit — encoded in field names, class names, SOQL references, and
  naming conventions — rather than declared explicitly.
- Salesforce-specific concepts (sharing models, deployment status, record types,
  permission sets) must be translated into business-architecture concepts before
  they carry meaning to architects, product managers, or business analysts.
- There is no standard tool that produces a navigable, queryable model of a
  Salesforce org's business architecture from its metadata alone.

### 2.2 The consequence for teams

Without a structured model, teams resort to manual inventory: reading XML files,
reverse-engineering Apex, and maintaining spreadsheets. This process is:

- **Time-consuming** — a mid-sized org with 50+ objects, hundreds of fields, and
  dozens of flows can take weeks to document manually.
- **Error-prone** — relationships and dependencies are frequently missed.
- **Not reusable** — the output is a one-time snapshot that goes stale immediately.
- **Not machine-readable** — it cannot feed downstream automation, BRD generation,
  or AI-assisted application planning.

---

## 3. Product Vision

> **Metafore makes Salesforce metadata human-readable and machine-actionable by
> transforming it into a queryable knowledge graph and BRD in minutes, not weeks.**

The knowledge graph represents the organisation's Salesforce org as a set of
typed nodes (business entities, processes, logic components, governance policies,
integrations) and typed edges (relationships, dependencies, access grants). Every
node and edge carries provenance — a traceable link back to the source metadata
file that produced it.

From this graph, Metafore generates:
- A structured inventory of every artifact in the org
- A canonical, platform-neutral JSON contract that survives Salesforce API version changes
- A validated, complete relationship map including inferred relationships with confidence scores
- A Metafore architecture classification (Data, Process, Governance, Integration, Experience, Intelligence)
- A business requirements document (BRD) draft structured around the graph's domain clusters

---

## 4. Target Users

| Role | Primary need | How Metafore serves them |
|---|---|---|
| Solutions Architect | Understand org structure before a migration or re-implementation | Complete artifact inventory, relationship map, architecture classification |
| Business Analyst | Generate BRD without reading XML files | BRD view generated from graph queries, structured by domain |
| Product Manager | Understand what the current Salesforce org supports | Plain-language summaries of objects, processes, and integrations |
| Engineering Lead | Audit dependencies before a refactor | Validated dependency graph with confidence scores and provenance |
| Implementation Partner | Accelerate discovery phase of a Salesforce project | Minutes to parse, minutes to classify — replaces days of manual inventory |

---

## 5. Pipeline Stages and Objectives

The Metafore pipeline is designed so that each stage has a single responsibility
and produces a stable, well-typed output that acts as the input contract for the
next stage. This design means the pipeline can be extended, replaced, or
re-run at any individual stage without touching the others.

### Stage 1 — Metadata Parser ✅ Implemented

**Objective:** Extract structured artifact records from raw Salesforce source
files without losing any information that is needed by later stages.

**What it does:**
- Accepts a `.zip` Salesforce source bundle or a folder of loose metadata files
- Detects the type of each file (object, field, flow, Apex class, etc.) from its
  file extension and path structure — not from content heuristics
- Extracts typed, structured records for each artifact category:
  - Objects: API name, label, plural label, sharing model, deployment status
  - Fields: type, required, unique, formula, picklist values, reference targets, relationship type
  - Record types: API name, label, active flag, owning object
  - Flows: status, process type, trigger object, decisions, assignments, record operations
  - Apex classes: referenced objects, business keywords, integration keywords, logic category
  - Permission sets and profiles: object permissions, field permissions, user permissions
- Surfaces parse warnings (missing labels, unresolved reference targets, parse
  errors) as structured records — not silent failures
- Runs entirely in the browser — no metadata leaves the machine
- Produces a `ParsedMetadata` JSON structure that is the input to Stage 2

**Key design decisions:**
- The parser stays close to Salesforce shapes; it does not normalise or
  classify — that is Stage 2's and Stage 4's job respectively
- A file classification step (`classify()`) runs before parsing so each file is
  handled by the correct parser, not a generic XML reader
- Warnings are typed and severity-graded so downstream stages can decide how to
  treat ambiguous metadata

**Primary output:** `parsed_metadata.json` (exportable from the UI)

---

### Stage 2 — Canonical JSON Builder 🔲 Planned

**Objective:** Convert the parser's Salesforce-shaped records into a stable,
platform-neutral metadata contract that does not change when Salesforce API
versions or file formats change.

**Why this matters:** The knowledge graph generator (Stage 5) must stay
independent of Salesforce-specific file structures. The canonical JSON is the
decoupling layer. It is the single source of truth that graph generation reads.

**Primary output:** `canonical_metadata.json`

---

### Stage 3 — Relationship Inference 🔲 Planned

**Objective:** Identify all relationships between artifacts — both those declared
explicitly in metadata and those that must be inferred from naming conventions,
field names, class references, and flow trigger objects.

**Confidence model:** Every relationship carries a confidence score (0.0–1.0)
and an inference reason. Direct metadata relationships (e.g. a Lookup field
with an explicit `referenceTo`) receive confidence 1.0. Inferred relationships
(e.g. a field named `IncidentId__c` that has no explicit reference target) receive
lower confidence and a typed warning.

**Primary output:** `relationships[]` array with confidence scores and provenance

---

### Stage 4 — Metafore Classifier 🔲 Planned

**Objective:** Map every Salesforce artifact to a Metafore architecture layer so
the knowledge graph carries business-architecture semantics, not just Salesforce
platform semantics.

| Metafore layer | Salesforce artifacts |
|---|---|
| Data | Objects, fields, record types, picklists |
| Process | Flows, workflow rules, triggers, approval processes |
| Governance | Profiles, permission sets, sharing rules, field permissions |
| Integration | Connector classes, named credentials, external services, platform events |
| Experience | Apps, tabs, layouts, reports, dashboards |
| Intelligence | Scoring classes, risk detection flows, recommendation logic |

**Primary output:** Classified artifact set with `layer` property on each record

---

### Stage 5 — Knowledge Graph Generator 🔲 Planned

**Objective:** Create typed nodes and edges from the normalised, classified
metadata model.

Every node carries: `id`, `type`, `label`, `layer`, `sourcePath`, `parserVersion`, `confidence`  
Every edge carries: `from`, `to`, `type`, `source`, `confidence`

**Node types:** BusinessEntity, Attribute, Process, LogicComponent,
GovernancePolicy, Role, IntegrationEndpoint, Metric, RecordType, PicklistValue,
SourceArtifact, RiskWarning

**Edge types:** HAS_FIELD, HAS_RECORD_TYPE, LOOKUP_TO, OPERATES_ON,
READS_FIELD, WRITES_FIELD, GRANTS_ACCESS_TO, CLASSIFIED_AS,
INTEGRATES_WITH, HAS_PICKLIST_VALUE, DERIVED_FROM, SUPPORTS_BRD_REQUIREMENT

**Primary output:** `graph_nodes.json` + `graph_edges.json`

---

### Stage 6 — Graph Validator 🔲 Planned

**Objective:** Verify graph completeness, consistency, relationship integrity,
and provenance before the graph is used for BRD generation or downstream
application planning.

**Validation checks:**
- Every Salesforce object produces exactly one BusinessEntity node
- Every field connects to exactly one object via HAS_FIELD
- Every Lookup/MasterDetail field produces a LOOKUP_TO edge
- Every flow is classified in the Process layer
- Every permission set and profile is classified in the Governance layer
- Every node and edge has source provenance
- Every inferred relationship has a confidence score and inference reason
- Missing or ambiguous metadata is represented as a RiskWarning node, not
  silently dropped

**Primary output:** `graph_validation_report.json`

---

### Stage 7 — BRD View Generator 🔲 Planned

**Objective:** Use graph queries to produce a structured, business-readable BRD
draft without any manual authoring.

| BRD section | Graph source |
|---|---|
| Business domain overview | BusinessEntity nodes and domain clusters |
| Data model | Objects, fields, record types, picklists, LOOKUP_TO edges |
| Business processes | Flow, Apex, trigger, and process nodes |
| User roles and permissions | Permission set, profile, role, and governance nodes |
| Integrations | Connector classes, external system nodes, endpoint references |
| Metrics and KPIs | ARR, NPS, health score, risk score, SLA, usage metric fields |
| Risks and assumptions | RiskWarning nodes and confidence scores |
| Application requirements | Process-to-entity and role-to-process graph paths |

**Primary output:** `metafore_brd_draft.md`

---

## 6. Non-Goals (Current Version)

The following are explicitly out of scope for the current build:

- **Real-time Salesforce org connection** — Metafore works with exported metadata
  bundles, not live org APIs. Live connection is a future capability.
- **Multi-org comparison** — comparing two orgs' graphs is a future feature.
- **Collaborative editing** — the current version is single-user and local.
- **Graph visualisation** — interactive graph rendering is planned but not in
  the current scope. The graph is exported as JSON.
- **AI-generated BRD content** — the BRD generator uses graph queries and
  templates, not a large language model, in the first version.
- **Deployment/push to org** — Metafore is a read/analysis tool, not a
  deployment tool.

---

## 7. Success Metrics

| Metric | Target |
|---|---|
| Time to parse a standard Salesforce org bundle (50 objects, 200 fields, 10 flows, 8 classes) | < 2 seconds in-browser |
| Parser coverage of artifact types | Objects, fields, record types, flows, Apex classes, permission sets, profiles |
| Warning capture rate | All unresolved reference targets surfaced as typed warnings |
| Exported `parsed_metadata.json` usability | Readable by a developer with no additional documentation |
| Zero data exfiltration | All processing in-browser; no metadata sent to any server |

---

## 8. Roadmap

| Phase | Deliverable | Status |
|---|---|---|
| Phase 1 | Stage 1: Metadata Parser + full application shell | ✅ Complete |
| Phase 2 | Stage 2: Canonical JSON Builder | 🔲 Next |
| Phase 3 | Stage 3: Relationship Inference with confidence scoring | 🔲 Planned |
| Phase 4 | Stage 4: Metafore Classifier | 🔲 Planned |
| Phase 5 | Stage 5: Knowledge Graph Generator | 🔲 Planned |
| Phase 6 | Stage 6: Graph Validator | 🔲 Planned |
| Phase 7 | Stage 7: BRD View Generator | 🔲 Planned |
| Phase 8 | Graph visualisation (interactive node/edge explorer) | 🔲 Future |
| Phase 9 | Live Salesforce org connection via Metadata API | 🔲 Future |
| Phase 10 | Multi-org comparison and delta analysis | 🔲 Future |

---

## 9. Constraints and Assumptions

- **Input format:** Salesforce source-format bundles (sfdx project structure). The
  parser also handles older metadata-API format XML where the object definition
  and its fields are in a single file.
- **Browser compatibility:** Modern Chromium-based browsers and Firefox. The app
  uses the File API, JSZip, and WebAssembly-free XML parsing — no special browser
  capabilities required beyond ES2021.
- **Bundle size:** In-browser XML parsing is practical for bundles up to several
  hundred megabytes. Very large enterprise orgs may require server-side parsing
  in a future version.
- **Data privacy:** Because all parsing runs in the browser, Metafore can be used
  with production org metadata without any data leaving the local machine.

---

*Document maintained by the Metafore product team. Last updated: June 2026.*
