import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Boxes,
  Download,
  Search,
  UploadCloud,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Link2,
} from "lucide-react";
import AppLayout, { PageHeader } from "@/components/layout/AppLayout";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import { usePipeline } from "@/store/PipelineContext";
import { downloadJson, formatNumber } from "@/lib/utils";
import type { ParsedMetadata } from "@/lib/parser";

type TabId =
  | "objects"
  | "fields"
  | "recordTypes"
  | "flows"
  | "apexClasses"
  | "permissionSets"
  | "profiles"
  | "warnings";

const yes = <CheckCircle2 size={15} className="text-success-500" />;
const no = <XCircle size={15} className="text-gray-300" />;

export default function MetadataParser() {
  const navigate = useNavigate();
  const { metadata, status, bundleName } = usePipeline();
  const [tab, setTab] = useState<TabId>("objects");
  const [query, setQuery] = useState("");

  if (status !== "ready" || !metadata) {
    return (
      <AppLayout>
        <PageHeader
          eyebrow="Stage 01"
          title="Metadata Parser"
          description="Reads Salesforce XML and Apex files and extracts structured artifact records."
        />
        <EmptyState
          icon={Boxes}
          title="No parsed metadata"
          description="Upload a Salesforce metadata bundle to run the Stage 1 parser and inspect the extracted artifacts."
          action={
            <Button icon={UploadCloud} onClick={() => navigate("/upload")}>
              Upload metadata
            </Button>
          }
        />
      </AppLayout>
    );
  }

  const tabs: { id: TabId; label: string; count: number }[] = [
    { id: "objects", label: "Objects", count: metadata.objects.length },
    { id: "fields", label: "Fields", count: metadata.fields.length },
    { id: "recordTypes", label: "Record Types", count: metadata.recordTypes.length },
    { id: "flows", label: "Flows", count: metadata.flows.length },
    { id: "apexClasses", label: "Apex Classes", count: metadata.apexClasses.length },
    {
      id: "permissionSets",
      label: "Permission Sets",
      count: metadata.permissionSets.length,
    },
    { id: "profiles", label: "Profiles", count: metadata.profiles.length },
    { id: "warnings", label: "Warnings", count: metadata.warnings.length },
  ];

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Stage 01 · Metadata Parser"
        title="Parsed Artifacts"
        description={`Structured records extracted from ${
          bundleName ?? "the uploaded bundle"
        }. This is the input contract for downstream canonical modeling.`}
        actions={
          <>
            <Button
              variant="secondary"
              icon={Download}
              onClick={() =>
                downloadJson(metadata, "parsed_metadata.json")
              }
            >
              Export JSON
            </Button>
            <Button icon={UploadCloud} onClick={() => navigate("/upload")}>
              New upload
            </Button>
          </>
        }
      />

      {/* Tabs */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTab(t.id);
              setQuery("");
            }}
            className={
              "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors " +
              (tab === t.id
                ? "bg-brand-600 text-white"
                : "bg-white text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50")
            }
          >
            {t.label}
            <span
              className={
                "rounded-full px-1.5 text-xs " +
                (tab === t.id
                  ? "bg-white/20 text-white"
                  : "bg-gray-100 text-gray-500")
              }
            >
              {formatNumber(t.count)}
            </span>
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3">
          <Search size={16} className="text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name…"
            className="w-full bg-transparent text-sm text-gray-700 outline-none placeholder:text-gray-400"
          />
        </div>
        <div className="overflow-x-auto">
          <TabTable tab={tab} query={query} metadata={metadata} />
        </div>
      </Card>
    </AppLayout>
  );
}

function filterRows<T>(rows: T[], query: string, fields: (r: T) => string[]): T[] {
  if (!query.trim()) return rows;
  const q = query.toLowerCase();
  return rows.filter((r) =>
    fields(r).some((f) => f?.toLowerCase().includes(q))
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
      {children}
    </td>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[13px] text-gray-800">{children}</span>
  );
}

function TableShell({
  head,
  children,
  empty,
}: {
  head: React.ReactNode;
  children: React.ReactNode;
  empty: boolean;
}) {
  return (
    <table className="min-w-full divide-y divide-gray-200">
      <thead className="bg-gray-50">
        <tr>{head}</tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {empty ? (
          <tr>
            <td className="px-4 py-10 text-center text-sm text-gray-400" colSpan={8}>
              No matching records.
            </td>
          </tr>
        ) : (
          children
        )}
      </tbody>
    </table>
  );
}

function TabTable({
  tab,
  query,
  metadata,
}: {
  tab: TabId;
  query: string;
  metadata: ParsedMetadata;
}) {
  if (tab === "objects") {
    const rows = filterRows(metadata.objects, query, (o) => [o.apiName, o.label ?? ""]);
    return (
      <TableShell
        empty={rows.length === 0}
        head={
          <>
            <Th>API Name</Th>
            <Th>Label</Th>
            <Th>Type</Th>
            <Th>Sharing</Th>
            <Th>Status</Th>
          </>
        }
      >
        {rows.map((o) => (
          <tr key={o.id} className="hover:bg-gray-50">
            <Td><Mono>{o.apiName}</Mono></Td>
            <Td>{o.label ?? "—"}</Td>
            <Td>
              <Badge tone={o.custom ? "brand" : "gray"}>
                {o.custom ? "Custom" : "Standard"}
              </Badge>
            </Td>
            <Td>{o.sharingModel ?? "—"}</Td>
            <Td>{o.deploymentStatus ?? "—"}</Td>
          </tr>
        ))}
      </TableShell>
    );
  }

  if (tab === "fields") {
    const rows = filterRows(metadata.fields, query, (f) => [
      f.apiName,
      f.objectApiName,
      f.label ?? "",
    ]);
    return (
      <TableShell
        empty={rows.length === 0}
        head={
          <>
            <Th>Object</Th>
            <Th>Field</Th>
            <Th>Type</Th>
            <Th>Required</Th>
            <Th>References</Th>
            <Th>Picklist</Th>
          </>
        }
      >
        {rows.map((f) => (
          <tr key={f.id} className="hover:bg-gray-50">
            <Td><Mono>{f.objectApiName}</Mono></Td>
            <Td>
              <Mono>{f.apiName}</Mono>
              {f.label && (
                <span className="ml-2 text-xs text-gray-400">{f.label}</span>
              )}
            </Td>
            <Td>{f.type ?? "—"}</Td>
            <Td>{f.required ? yes : no}</Td>
            <Td>
              {f.references.length ? (
                <span className="inline-flex items-center gap-1 text-brand-700">
                  <Link2 size={14} />
                  {f.references.map((r) => r.referenceTo).join(", ")}
                </span>
              ) : (
                "—"
              )}
            </Td>
            <Td>
              {f.picklistValues.length ? (
                <Badge tone="gray">{f.picklistValues.length} values</Badge>
              ) : (
                "—"
              )}
            </Td>
          </tr>
        ))}
      </TableShell>
    );
  }

  if (tab === "recordTypes") {
    const rows = filterRows(metadata.recordTypes, query, (r) => [
      r.apiName,
      r.objectApiName,
      r.label ?? "",
    ]);
    return (
      <TableShell
        empty={rows.length === 0}
        head={
          <>
            <Th>Object</Th>
            <Th>Record Type</Th>
            <Th>Label</Th>
            <Th>Active</Th>
          </>
        }
      >
        {rows.map((r) => (
          <tr key={r.id} className="hover:bg-gray-50">
            <Td><Mono>{r.objectApiName}</Mono></Td>
            <Td><Mono>{r.apiName}</Mono></Td>
            <Td>{r.label ?? "—"}</Td>
            <Td>{r.active ? yes : no}</Td>
          </tr>
        ))}
      </TableShell>
    );
  }

  if (tab === "flows") {
    const rows = filterRows(metadata.flows, query, (f) => [
      f.apiName,
      f.label ?? "",
      f.triggerObject ?? "",
    ]);
    return (
      <TableShell
        empty={rows.length === 0}
        head={
          <>
            <Th>Flow</Th>
            <Th>Status</Th>
            <Th>Process Type</Th>
            <Th>Trigger Object</Th>
            <Th>Steps</Th>
          </>
        }
      >
        {rows.map((f) => (
          <tr key={f.id} className="hover:bg-gray-50">
            <Td>
              <Mono>{f.apiName}</Mono>
              {f.label && (
                <span className="ml-2 text-xs text-gray-400">{f.label}</span>
              )}
            </Td>
            <Td>
              <Badge tone={f.status === "Active" ? "success" : "gray"}>
                {f.status ?? "—"}
              </Badge>
            </Td>
            <Td>{f.processType ?? "—"}</Td>
            <Td>{f.triggerObject ? <Mono>{f.triggerObject}</Mono> : "—"}</Td>
            <Td>
              <span className="text-xs text-gray-500">
                {f.decisions.length} decisions · {f.assignments.length} assignments
                · {f.recordOperations.length} record ops
              </span>
            </Td>
          </tr>
        ))}
      </TableShell>
    );
  }

  if (tab === "apexClasses") {
    const rows = filterRows(metadata.apexClasses, query, (c) => [
      c.apiName,
      c.logicCategory,
    ]);
    return (
      <TableShell
        empty={rows.length === 0}
        head={
          <>
            <Th>Class</Th>
            <Th>Category</Th>
            <Th>Referenced Objects</Th>
            <Th>Integration</Th>
            <Th>Test</Th>
          </>
        }
      >
        {rows.map((c) => (
          <tr key={c.id} className="hover:bg-gray-50">
            <Td><Mono>{c.apiName}</Mono></Td>
            <Td>
              <Badge tone="brand">{c.logicCategory}</Badge>
            </Td>
            <Td>
              <span className="text-xs text-gray-600">
                {c.referencedObjects.length
                  ? c.referencedObjects.slice(0, 4).join(", ") +
                    (c.referencedObjects.length > 4
                      ? ` +${c.referencedObjects.length - 4}`
                      : "")
                  : "—"}
              </span>
            </Td>
            <Td>
              {c.integrationKeywords.length ? (
                <Badge tone="warning">{c.integrationKeywords[0]}</Badge>
              ) : (
                "—"
              )}
            </Td>
            <Td>{c.isTest ? yes : no}</Td>
          </tr>
        ))}
      </TableShell>
    );
  }

  if (tab === "permissionSets") {
    const rows = filterRows(metadata.permissionSets, query, (p) => [
      p.apiName,
      p.label ?? "",
    ]);
    return (
      <TableShell
        empty={rows.length === 0}
        head={
          <>
            <Th>Permission Set</Th>
            <Th>Label</Th>
            <Th>Object Perms</Th>
            <Th>Field Perms</Th>
            <Th>User Perms</Th>
          </>
        }
      >
        {rows.map((p) => (
          <tr key={p.id} className="hover:bg-gray-50">
            <Td><Mono>{p.apiName}</Mono></Td>
            <Td>{p.label ?? "—"}</Td>
            <Td>{formatNumber(p.objectPermissions.length)}</Td>
            <Td>{formatNumber(p.fieldPermissions.length)}</Td>
            <Td>{formatNumber(p.userPermissions.length)}</Td>
          </tr>
        ))}
      </TableShell>
    );
  }

  if (tab === "profiles") {
    const rows = filterRows(metadata.profiles, query, (p) => [p.apiName]);
    return (
      <TableShell
        empty={rows.length === 0}
        head={
          <>
            <Th>Profile</Th>
            <Th>Custom</Th>
            <Th>Object Perms</Th>
            <Th>Field Perms</Th>
            <Th>User Perms</Th>
          </>
        }
      >
        {rows.map((p) => (
          <tr key={p.id} className="hover:bg-gray-50">
            <Td><Mono>{p.apiName}</Mono></Td>
            <Td>{p.custom ? yes : no}</Td>
            <Td>{formatNumber(p.objectPermissions.length)}</Td>
            <Td>{formatNumber(p.fieldPermissions.length)}</Td>
            <Td>{formatNumber(p.userPermissions.length)}</Td>
          </tr>
        ))}
      </TableShell>
    );
  }

  // warnings
  const rows = filterRows(metadata.warnings, query, (w) => [
    w.artifact,
    w.message,
    w.type,
  ]);
  return (
    <TableShell
      empty={rows.length === 0}
      head={
        <>
          <Th>Severity</Th>
          <Th>Type</Th>
          <Th>Artifact</Th>
          <Th>Message</Th>
        </>
      }
    >
      {rows.map((w, i) => (
        <tr key={i} className="hover:bg-gray-50">
          <Td>
            <Badge
              tone={
                w.severity === "high"
                  ? "error"
                  : w.severity === "medium"
                  ? "warning"
                  : "gray"
              }
            >
              <AlertTriangle size={12} />
              {w.severity}
            </Badge>
          </Td>
          <Td><Mono>{w.type}</Mono></Td>
          <Td><Mono>{w.artifact}</Mono></Td>
          <Td>
            <span className="whitespace-normal text-gray-600">{w.message}</span>
          </Td>
        </tr>
      ))}
    </TableShell>
  );
}
