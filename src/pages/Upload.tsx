import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  UploadCloud,
  FileArchive,
  FolderOpen,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import AppLayout, { PageHeader } from "@/components/layout/AppLayout";
import { Button, Card } from "@/components/ui";
import { usePipeline } from "@/store/PipelineContext";
import { cn } from "@/lib/utils";

const SUPPORTED = [
  "force-app.zip bundles",
  ".object / .field / .recordType XML",
  ".flow metadata",
  "Apex .cls classes",
  ".permissionset & .profile XML",
];

export default function UploadPage() {
  const navigate = useNavigate();
  const { status, error, parseFromFiles, metadata } = usePipeline();
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (files: File[]) => {
      await parseFromFiles(files);
    },
    [parseFromFiles]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length) void handleFiles(files);
    },
    [handleFiles]
  );

  const parsing = status === "parsing";

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Salesforce Metadata Pipeline"
        title="Upload Metadata"
        description="Upload a Salesforce source-format bundle (force-app.zip) or a folder of metadata files. Stage 1 parses the raw XML and Apex into structured artifact records."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              "flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-16 text-center transition-colors",
              dragging
                ? "border-brand-500 bg-brand-50"
                : "border-gray-300 bg-white"
            )}
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
              {parsing ? (
                <Loader2 size={26} className="animate-spin" />
              ) : (
                <UploadCloud size={26} />
              )}
            </div>
            <h3 className="mt-5 text-base font-semibold text-gray-900">
              {parsing
                ? "Parsing metadata…"
                : "Drag & drop your metadata bundle"}
            </h3>
            <p className="mt-1 max-w-sm text-sm text-gray-500">
              {parsing
                ? "Reading XML and Apex files and extracting structured records."
                : "Drop a .zip bundle here, or browse to select a file or folder."}
            </p>

            {!parsing && (
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <Button
                  icon={FileArchive}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Select .zip bundle
                </Button>
                <Button
                  variant="secondary"
                  icon={FolderOpen}
                  onClick={() => folderInputRef.current?.click()}
                >
                  Select folder
                </Button>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              onChange={(e) => {
                const files = e.target.files ? Array.from(e.target.files) : [];
                if (files.length) void handleFiles(files);
              }}
            />
            <input
              ref={folderInputRef}
              type="file"
              // @ts-expect-error - non-standard but widely supported folder picker
              webkitdirectory=""
              directory=""
              multiple
              className="hidden"
              onChange={(e) => {
                const files = e.target.files ? Array.from(e.target.files) : [];
                if (files.length) void handleFiles(files);
              }}
            />
          </div>

          {error && (
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Could not parse the upload</p>
                <p className="mt-0.5 text-error-600">{error}</p>
              </div>
            </div>
          )}

          {status === "ready" && metadata && (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm">
              <div className="flex items-center gap-3 text-success-700">
                <CheckCircle2 size={18} className="shrink-0" />
                <span className="font-medium">
                  Parsed {metadata.stats.filesParsed} files in{" "}
                  {metadata.stats.durationMs} ms — {metadata.objects.length}{" "}
                  objects, {metadata.fields.length} fields.
                </span>
              </div>
              <Button onClick={() => navigate("/parser")}>View results</Button>
            </div>
          )}
        </div>

        <Card className="p-5">
          <h3 className="text-sm font-semibold text-gray-900">
            Supported inputs
          </h3>
          <ul className="mt-3 space-y-2">
            {SUPPORTED.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2 text-sm text-gray-600"
              >
                <CheckCircle2
                  size={16}
                  className="mt-0.5 shrink-0 text-brand-500"
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <div className="mt-5 rounded-xl bg-gray-50 p-4 text-xs leading-relaxed text-gray-500">
            All parsing happens locally in your browser. No metadata is uploaded
            to any server.
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
