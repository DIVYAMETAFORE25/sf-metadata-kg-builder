import { useNavigate } from "react-router-dom";
import { ArrowRight, Construction, CheckCircle2, Circle } from "lucide-react";
import AppLayout, { PageHeader } from "@/components/layout/AppLayout";
import { Badge, Button, Card } from "@/components/ui";
import { PIPELINE_STAGES, stageById } from "@/lib/pipeline";
import { usePipeline } from "@/store/PipelineContext";

export default function StagePlaceholder({ stageId }: { stageId: string }) {
  const navigate = useNavigate();
  const { status } = usePipeline();
  const stage = stageById(stageId);
  if (!stage) return null;

  const upstreamReady = status === "ready";

  return (
    <AppLayout>
      <PageHeader
        eyebrow={`${stage.code} · ${stage.name}`}
        title={stage.name}
        description={stage.description}
        actions={<Badge tone="warning">Planned</Badge>}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-8 lg:col-span-2">
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-warning-50 text-warning-600 ring-1 ring-warning-100">
              <Construction size={26} />
            </div>
            <h3 className="mt-5 text-lg font-semibold text-gray-900">
              Stage {stage.number} is part of the pipeline outline
            </h3>
            <p className="mt-2 max-w-md text-sm text-gray-500">
              This stage is scaffolded as part of the end-to-end design. Stage 1
              (Metadata Parser) is fully implemented and produces the input for
              this step.
            </p>
            <div className="mt-5 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
              <span className="font-semibold text-gray-700">Primary output:</span>{" "}
              <span className="font-mono text-[13px]">{stage.primaryOutput}</span>
            </div>
            {!upstreamReady && (
              <Button
                className="mt-6"
                variant="secondary"
                icon={ArrowRight}
                onClick={() => navigate("/upload")}
              >
                Start with Stage 1
              </Button>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold text-gray-900">Pipeline position</h3>
          <ol className="mt-4 space-y-2.5">
            {PIPELINE_STAGES.map((s) => {
              const isCurrent = s.id === stage.id;
              const done = s.implemented;
              return (
                <li
                  key={s.id}
                  className={
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm " +
                    (isCurrent ? "bg-brand-50 ring-1 ring-brand-100" : "")
                  }
                >
                  {done ? (
                    <CheckCircle2 size={16} className="text-success-500" />
                  ) : (
                    <Circle
                      size={16}
                      className={isCurrent ? "text-brand-500" : "text-gray-300"}
                    />
                  )}
                  <span
                    className={
                      isCurrent
                        ? "font-semibold text-brand-800"
                        : done
                        ? "text-gray-700"
                        : "text-gray-400"
                    }
                  >
                    {s.number}. {s.short}
                  </span>
                </li>
              );
            })}
          </ol>
        </Card>
      </div>
    </AppLayout>
  );
}
