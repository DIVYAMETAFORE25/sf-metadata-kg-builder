import JSZip from "jszip";
import type { MetadataFile } from "./types";

/** File extensions we care about when reading a bundle. Everything else is ignored. */
const RELEVANT = [
  ".object-meta.xml",
  ".object",
  ".field-meta.xml",
  ".recordtype-meta.xml",
  ".flow-meta.xml",
  ".flow",
  ".cls",
  ".cls-meta.xml",
  ".permissionset-meta.xml",
  ".permissionset",
  ".profile-meta.xml",
  ".profile",
];

function isRelevant(path: string): boolean {
  const p = path.toLowerCase();
  return RELEVANT.some((suffix) => p.endsWith(suffix));
}

function normalize(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

/** Extract relevant metadata files from a .zip bundle. */
export async function filesFromZip(file: File): Promise<MetadataFile[]> {
  const zip = await JSZip.loadAsync(file);
  const out: MetadataFile[] = [];

  const entries = Object.values(zip.files).filter(
    (entry) => !entry.dir && isRelevant(entry.name)
  );

  await Promise.all(
    entries.map(async (entry) => {
      const content = await entry.async("string");
      out.push({ path: normalize(entry.name), content });
    })
  );

  return out;
}

/** Read relevant metadata files from a list (drag-drop folder or multi-file pick). */
export async function filesFromFileList(fileList: File[]): Promise<MetadataFile[]> {
  const relevant = fileList.filter((f) => {
    const path = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    return isRelevant(path);
  });

  return Promise.all(
    relevant.map(async (f) => {
      const path =
        (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
      const content = await f.text();
      return { path: normalize(path), content };
    })
  );
}

/** True when the dropped/selected payload is a single archive. */
export function isZipFile(file: File): boolean {
  return (
    file.name.toLowerCase().endsWith(".zip") ||
    file.type === "application/zip" ||
    file.type === "application/x-zip-compressed"
  );
}
