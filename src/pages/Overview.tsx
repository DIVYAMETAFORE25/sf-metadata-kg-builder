import { useNavigate } from "react-router-dom";
import {
  Boxes,
  Columns3,
  Workflow,
  Database,
  CheckCircle2,
  UploadCloud,
  ArrowRight,
  AlertTriangle,
  Clock,
  Lock,
} from "lucide-react";
import AppLayout, { PageHeader } from "@/components/layout/AppLayout";
import { Badge, Button, Card, ProgressBar, StatTile } from "@/components/ui";
import { usePipeline } from "@/store/PipelineContext";
import { PIPELINE_STAGES } from "@/lib/pipeline";
import { cn, formatNumber } from "@/lib/utils";

export default function Overview() {
  const navigate = useNavigate();
  const { metadata, status } = usePipeline();

  const hasData = status === "ready" && metadata;

  const objects = metadata?.objects.length ?? 0;
  const fields = metadata?.fields.length ?? 0;
  const flows = metadata?.flows.length ?? 0;
  const apex = metadata?.apexClasses.length ?? 0;
  const recordTypes = metadata?.recordTypes.length ?? 0;
  const permSets = metadata?.permissionSets.length ?? 0;
  const profiles = metadata?.profiles.length ?? 0;
  const total =
    objects + fields + flows + apex + recordTypes + permSets + profiles;

  const dash = (v: number) => (hasData ? formatNumber(v) : "—");

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Salesforce Metadata Pipeline"
        title="Pipeline Overview"
        description="Metadata-to-knowledge-graph tracking for the Salesforce ingestion engine — source parsing, canonical modeling, relationship inference, and graph generation."
        actions={
          <Button icon={UploadCloud} onClick={() => navigate("/upload")}>
            {hasData ? "New upload" : "Upload metadata"}
          </Button>
        }
      />

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <StatTile
          code="STAGE 01"
          value={dash(objects)}
          label="Objects"
          caption="Business entities"
          icon={Boxes}
        />
        <StatTile
          code="STAGE 01"
          value={dash(fields)}
          label="Fields"
          caption="Attributes parsed"
          icon={Columns3}
        />
        <StatTile
          code="STAGE 01"
          value={dash(flows + apex)}
          label="Process & Logic"
          caption={`${dash(flows)} flows · ${dash(apex)} classes`}
          icon={Workflow}
        />
        <StatTile
          code="TOTAL OUTPUT"
          value={dash(total)}
          label="Parsed Artifacts"
          caption="Across all metadata types"
          icon={Database}
        />
        <StatTile
          code="STAGE 01"
          value={hasData ? formatNumber(metadata.stats.filesParsed) : "—"}
          label="Files Parsed"
          caption={hasData ? `${metadata.stats.durationMs} ms` : "Awaiting input"}
          icon={CheckCircle2}
          highlight
        />
      </div>

      {/* Stage progress cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {PIPELINE_STAGES.slice(0, 3).map((stage) => {
          const isParser = stage.id === "parser";
          const active = isParser && hasData;
          return (
            <Card key={stage.id} className="p-5">
              <div className="flex items-center justify-between">
                <span className="eyebrow text-[10px] font-semibold text-gray-400">
                  {stage.code} · {stage.short.toUpperCase()}
                </span>
                {stage.implemented ? (
                  <stage.icon size={16} className="text-brand-500" />
                ) : (
                  <Lock size={14} className="text-gray-300" />
                )}
              </div>

              {active ? (
                <>
                  <div className="mt-3 flex items-end justify-between">
                    <span className="text-3xl font-bold text-gray-900">
                      {formatNumber(metadata.stats.filesParsed)}
                    </span>
                    <Badge tone="success">100% parsed</Badge>
                  </div>
                  <div className="mt-3">
                    <ProgressBar value={100} />
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
                    <CheckCircle2 size={13} className="text-success-500" />
                    {formatNumber(total)} artifact records extracted
                  </div>
                </>
              ) : (
                <>
                  <div className="mt-3 text-3xl font-bold text-gray-300">—</div>
                  <p className="mt-3 text-xs leading-relaxed text-gray-400">
                    {isParser
                      ? "No output yet — upload a metadata bundle to populate this stage."
                      : "Awaiting upstream output — this stage is part of the pipeline outline."}
                  </p>
                </>
              )}
            </Card>
          );
        })}
      </div>

      {/* Parser health */}
      <Card className="mt-6 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Parser Health</h2>
          {hasData && (
            <span className="flex items-center gap-1.5 text-xs text-gray-400">
              <Clock size={13} />
              Parsed {new Date(metadata.org.parsedAt).toLocaleTimeString()}
            </span>
          )}
        </div>

        {hasData ? (
          <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              <HealthRow
                label="Files scanned"
                value={formatNumber(metadata.stats.filesScanned)}
              />
              <HealthRow
                label="Files parsed"
                value={formatNumber(metadata.stats.filesParsed)}
                tone="success"
              />
              <HealthRow
                label="Files skipped"
                value={formatNumber(metadata.stats.filesSkipped)}
              />
              <HealthRow
                label="Warnings"
                value={formatNumber(metadata.warnings.length)}
                tone={metadata.warnings.length ? "warning" : "default"}
              />
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <h3 className="text-xs font-semibold text-gray-500">
                Artifact breakdown
              </h3>
              <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <BreakdownRow label="Objects" value={objects} />
                <BreakdownRow label="Fields" value={fields} />
                <BreakdownRow label="Record Types" value={recordTypes} />
                <BreakdownRow label="Flows" value={flows} />
                <BreakdownRow label="Apex Classes" value={apex} />
                <BreakdownRow label="Permission Sets" value={permSets} />
                <BreakdownRow label="Profiles" value={profiles} />
              </div>
              <div className="mt-4">
                <Button
                  variant="secondary"
                  className="w-full"
                  icon={ArrowRight}
                  onClick={() => navigate("/parser")}
                >
                  Open Stage 1 results
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-5 flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-brand-600 shadow-xs ring-1 ring-gray-200">
              <UploadCloud size={22} />
            </div>
            <h3 className="mt-4 text-base font-semibold text-gray-900">
              No metadata parsed yet
            </h3>
            <p className="mt-1 max-w-md text-sm text-gray-500">
              Upload a Salesforce metadata bundle to run Stage 1 and populate the
              pipeline overview.
            </p>
            <Button
              className="mt-5"
              icon={UploadCloud}
              onClick={() => navigate("/upload")}
            >
              Upload metadata
            </Button>
          </div>
        )}
      </Card>
    </AppLayout>
  );
}

function HealthRow({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning";
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3">
      <div className="flex items-center gap-2 text-sm text-gray-600">
        {tone === "warning" && (
          <AlertTriangle size={15} className="text-warning-500" />
        )}
        {tone === "success" && (
          <CheckCircle2 size={15} className="text-success-500" />
        )}
        {label}
      </div>
      <span
        className={cn(
          "text-sm font-semibold",
          tone === "warning"
            ? "text-warning-600"
            : tone === "success"
            ? "text-success-600"
            : "text-gray-900"
        )}
      >
        {value}
      </span>
    </div>
  );
}

function BreakdownRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="font-semibold text-gray-900">{formatNumber(value)}</span>
    </div>
  );
}
