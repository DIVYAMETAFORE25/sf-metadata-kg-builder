import AppLayout, { PageHeader } from "@/components/layout/AppLayout";
import { Card } from "@/components/ui";
import { PIPELINE_STAGES } from "@/lib/pipeline";

export default function InfoPage({ variant }: { variant: "docs" | "settings" }) {
  if (variant === "settings") {
    return (
      <AppLayout>
        <PageHeader
          eyebrow="Configuration"
          title="Settings"
          description="Application preferences. All parsing runs locally in the browser; there is nothing to configure for Stage 1 yet."
        />
        <Card className="p-6">
          <dl className="divide-y divide-gray-100 text-sm">
            <Row label="Parser version" value="1.0.0" />
            <Row label="Execution" value="Client-side (browser)" />
            <Row label="Data retention" value="In-memory only — cleared on refresh" />
            <Row label="Graph storage target" value="Property graph (recommended)" />
          </dl>
        </Card>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Documentation"
        title="How the pipeline works"
        description="From raw Salesforce source metadata to a Metafore-ready knowledge graph. The key design decision is to build the graph from a normalized metadata contract, not directly from Salesforce file structures."
      />

      <Card className="mb-6 p-6">
        <h2 className="text-base font-semibold text-gray-900">Stage 1 — Metadata Parser (implemented)</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          The parser is metadata-type aware. It reads each Salesforce artifact
          according to its structural meaning rather than treating files as plain
          text:
        </p>
        <ul className="mt-3 space-y-1.5 text-sm text-gray-600">
          <li>• <b>Objects</b> — API name, label, sharing model, deployment status.</li>
          <li>• <b>Fields</b> — type, required, picklist values, formulas, reference targets.</li>
          <li>• <b>Record Types</b> — name, label, active flag, owning object.</li>
          <li>• <b>Flows</b> — status, process type, trigger object, decisions, assignments, record ops.</li>
          <li>• <b>Apex</b> — referenced objects, business/integration keywords, logic category.</li>
          <li>• <b>Permission Sets &amp; Profiles</b> — object, field, and user permissions.</li>
        </ul>
      </Card>

      <Card className="p-6">
        <h2 className="text-base font-semibold text-gray-900">End-to-end stages</h2>
        <ol className="mt-4 space-y-3">
          {PIPELINE_STAGES.map((s) => (
            <li key={s.id} className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">
                {s.number}
              </span>
              <div>
                <div className="text-sm font-semibold text-gray-900">
                  {s.name}
                  {s.implemented && (
                    <span className="ml-2 text-xs font-medium text-success-600">
                      implemented
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500">{s.description}</p>
                <p className="mt-0.5 font-mono text-xs text-gray-400">
                  → {s.primaryOutput}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </AppLayout>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-3">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium text-gray-900">{value}</dd>
    </div>
  );
}
