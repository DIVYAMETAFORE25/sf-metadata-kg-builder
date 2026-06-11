import type { ComponentType } from "react";
import {
  Boxes,
  FileJson,
  GitBranch,
  Layers,
  Network,
  ShieldCheck,
  FileText,
} from "lucide-react";

export interface PipelineStageDef {
  /** Stage number as shown in the PDF pipeline (1..7). */
  number: number;
  id: string;
  /** Short eyebrow label, e.g. "STAGE 01". */
  code: string;
  name: string;
  short: string;
  description: string;
  primaryOutput: string;
  route: string;
  icon: ComponentType<{ size?: number | string; className?: string }>;
  implemented: boolean;
}

export const PIPELINE_STAGES: PipelineStageDef[] = [
  {
    number: 1,
    id: "parser",
    code: "STAGE 01",
    name: "Metadata Parser",
    short: "Parser",
    description:
      "Reads Salesforce XML and Apex files and extracts structured artifact records.",
    primaryOutput: "Parsed artifact records",
    route: "/parser",
    icon: Boxes,
    implemented: true,
  },
  {
    number: 2,
    id: "canonical",
    code: "STAGE 02",
    name: "Canonical JSON Builder",
    short: "Canonical JSON",
    description:
      "Converts parsed metadata into a stable, platform-neutral contract.",
    primaryOutput: "canonical_metadata.json",
    route: "/canonical",
    icon: FileJson,
    implemented: false,
  },
  {
    number: 3,
    id: "relationships",
    code: "STAGE 03",
    name: "Relationship Inference",
    short: "Relationships",
    description:
      "Identifies direct and inferred links between artifacts with confidence scores.",
    primaryOutput: "relationships[] with confidence",
    route: "/relationships",
    icon: GitBranch,
    implemented: false,
  },
  {
    number: 4,
    id: "classification",
    code: "STAGE 04",
    name: "Metafore Classifier",
    short: "Classification",
    description: "Maps Salesforce artifacts to Metafore architecture layers.",
    primaryOutput: "classified artifact set",
    route: "/classification",
    icon: Layers,
    implemented: false,
  },
  {
    number: 5,
    id: "graph",
    code: "STAGE 05",
    name: "Knowledge Graph Generator",
    short: "Knowledge Graph",
    description: "Creates typed nodes and edges from the normalized model.",
    primaryOutput: "graph_nodes.json + graph_edges.json",
    route: "/graph",
    icon: Network,
    implemented: true,
  },
  {
    number: 6,
    id: "validation",
    code: "STAGE 06",
    name: "Graph Validator",
    short: "Validation",
    description:
      "Checks completeness, consistency, provenance, and uncertainty.",
    primaryOutput: "graph_validation_report.json",
    route: "/validation",
    icon: ShieldCheck,
    implemented: false,
  },
  {
    number: 7,
    id: "brd",
    code: "STAGE 07",
    name: "BRD View Generator",
    short: "BRD Output",
    description:
      "Uses graph queries to create business-readable BRD and Maker outputs.",
    primaryOutput: "metafore_brd_draft.md",
    route: "/brd",
    icon: FileText,
    implemented: false,
  },
];

export function stageById(id: string): PipelineStageDef | undefined {
  return PIPELINE_STAGES.find((s) => s.id === id);
}
