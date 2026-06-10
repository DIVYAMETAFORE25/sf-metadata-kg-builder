import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  filesFromFileList,
  filesFromZip,
  isZipFile,
  parseMetadataFiles,
  type ParsedMetadata,
} from "@/lib/parser";

export type ParseStatus = "idle" | "parsing" | "ready" | "error";

interface PipelineState {
  status: ParseStatus;
  metadata: ParsedMetadata | null;
  error: string | null;
  bundleName: string | null;
  parseFromFiles: (files: File[]) => Promise<void>;
  reset: () => void;
}

const PipelineContext = createContext<PipelineState | undefined>(undefined);

export function PipelineProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ParseStatus>("idle");
  const [metadata, setMetadata] = useState<ParsedMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bundleName, setBundleName] = useState<string | null>(null);

  const parseFromFiles = useCallback(async (files: File[]) => {
    if (!files.length) return;
    setStatus("parsing");
    setError(null);

    try {
      const single = files.length === 1 ? files[0] : null;
      const isZip = single ? isZipFile(single) : false;

      const metadataFiles = isZip
        ? await filesFromZip(single as File)
        : await filesFromFileList(files);

      if (!metadataFiles.length) {
        throw new Error(
          "No recognizable Salesforce metadata files were found in the upload."
        );
      }

      const name = isZip
        ? (single as File).name
        : `${files.length} files`;

      const result = parseMetadataFiles(metadataFiles, {
        bundleName: name,
        extractionMode: isZip ? "metadataBundle" : "looseFiles",
      });

      setMetadata(result);
      setBundleName(name);
      setStatus("ready");
    } catch (err) {
      setError((err as Error).message);
      setStatus("error");
    }
  }, []);

  const reset = useCallback(() => {
    setStatus("idle");
    setMetadata(null);
    setError(null);
    setBundleName(null);
  }, []);

  const value = useMemo<PipelineState>(
    () => ({ status, metadata, error, bundleName, parseFromFiles, reset }),
    [status, metadata, error, bundleName, parseFromFiles, reset]
  );

  return (
    <PipelineContext.Provider value={value}>{children}</PipelineContext.Provider>
  );
}

export function usePipeline(): PipelineState {
  const ctx = useContext(PipelineContext);
  if (!ctx) throw new Error("usePipeline must be used within a PipelineProvider");
  return ctx;
}
