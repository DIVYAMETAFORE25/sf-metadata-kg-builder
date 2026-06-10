import { XMLParser } from "fast-xml-parser";
import type {
  ApexLogicCategory,
  FieldPermission,
  MetadataFile,
  ObjectPermission,
  ParsedApexClass,
  ParsedField,
  ParsedFlow,
  ParsedMetadata,
  ParsedObject,
  ParsedPermissionSet,
  ParsedProfile,
  ParsedRecordType,
  ParseWarning,
} from "./types";

export const PARSER_VERSION = "1.0.0";

const xml = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: true,
  trimValues: true,
  // Treat empty tags as empty string rather than dropping them.
  parseAttributeValue: false,
});

/** A curated list of common standard Salesforce objects for Apex reference detection. */
const STANDARD_OBJECTS = [
  "Account",
  "Contact",
  "Lead",
  "Opportunity",
  "OpportunityLineItem",
  "Case",
  "Contract",
  "Order",
  "Quote",
  "Product2",
  "Pricebook2",
  "Campaign",
  "Asset",
  "User",
  "Task",
  "Event",
  "Entitlement",
];

const INTEGRATION_KEYWORDS = [
  "NetSuite",
  "HttpRequest",
  "HttpResponse",
  "Http",
  "Callout",
  "RestResource",
  "WebService",
  "Connector",
  "Endpoint",
  "NamedCredential",
  "API",
  "Webhook",
  "OAuth",
  "Integration",
];

const BUSINESS_KEYWORDS = [
  "Churn",
  "Risk",
  "Score",
  "Commission",
  "Health",
  "Renewal",
  "Subscription",
  "Incident",
  "License",
  "NPS",
  "Opportunity",
  "Provision",
  "Escalation",
  "Quote",
  "Billing",
  "Revenue",
  "Forecast",
];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function str(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "boolean") return String(value);
  const s = String(value).trim();
  return s.length ? s : undefined;
}

function bool(value: unknown): boolean {
  return value === true || value === "true" || value === "1";
}

function num(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isNaN(n) ? undefined : n;
}

function baseName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
}

function stripSuffix(fileName: string, suffixes: string[]): string {
  for (const s of suffixes) {
    if (fileName.endsWith(s)) return fileName.slice(0, -s.length);
  }
  return fileName;
}

/** Pull the owning object API name out of an sfdx-style path. */
function objectNameFromPath(path: string): string | undefined {
  const parts = path.split("/");
  const idx = parts.lastIndexOf("objects");
  if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
  return undefined;
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

// ---------------------------------------------------------------------------
// File classification
// ---------------------------------------------------------------------------

type FileKind =
  | "object"
  | "field"
  | "recordType"
  | "flow"
  | "apexClass"
  | "apexMeta"
  | "permissionSet"
  | "profile"
  | "unknown";

function classify(path: string): FileKind {
  const p = path.toLowerCase();
  if (p.endsWith(".cls")) return "apexClass";
  if (p.endsWith(".cls-meta.xml")) return "apexMeta";
  if (p.endsWith(".field-meta.xml")) return "field";
  if (p.endsWith(".recordtype-meta.xml")) return "recordType";
  if (p.endsWith(".object-meta.xml") || p.endsWith(".object")) return "object";
  if (p.endsWith(".flow-meta.xml") || p.endsWith(".flow")) return "flow";
  if (p.endsWith(".permissionset-meta.xml") || p.endsWith(".permissionset"))
    return "permissionSet";
  if (p.endsWith(".profile-meta.xml") || p.endsWith(".profile")) return "profile";
  return "unknown";
}

function parseXml(content: string): Record<string, unknown> | undefined {
  try {
    const parsed = xml.parse(content) as Record<string, unknown>;
    return parsed;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Individual artifact parsers
// ---------------------------------------------------------------------------

function parseObjectFile(
  file: MetadataFile,
  out: {
    objects: ParsedObject[];
    fields: ParsedField[];
    recordTypes: ParsedRecordType[];
  },
  warnings: ParseWarning[]
): void {
  const root = parseXml(file.content);
  const co = (root?.CustomObject ?? root) as Record<string, unknown> | undefined;

  const fileBase = stripSuffix(baseName(file.path), [
    ".object-meta.xml",
    ".object",
  ]);
  // Source format stores the API name in the folder; metadata format in fullName.
  const apiName =
    objectNameFromPath(file.path) ?? str(co?.fullName) ?? fileBase;

  const obj: ParsedObject = {
    id: `object:${apiName}`,
    apiName,
    label: str(co?.label),
    pluralLabel: str(co?.pluralLabel),
    custom: apiName.endsWith("__c") || apiName.endsWith("__b") || apiName.endsWith("__e"),
    deploymentStatus: str(co?.deploymentStatus),
    sharingModel: str(co?.sharingModel),
    description: str(co?.description),
    sourcePath: file.path,
  };
  out.objects.push(obj);

  // Metadata-API format embeds fields and record types inline.
  for (const f of toArray(co?.fields as unknown)) {
    const field = buildField(f as Record<string, unknown>, apiName, file.path);
    if (field) out.fields.push(field);
  }
  for (const rt of toArray(co?.recordTypes as unknown)) {
    const recordType = buildRecordType(
      rt as Record<string, unknown>,
      apiName,
      file.path
    );
    if (recordType) out.recordTypes.push(recordType);
  }

  if (!obj.label) {
    warnings.push({
      type: "MISSING_LABEL",
      artifact: obj.id,
      message: `Object ${apiName} has no <label>; using API name as display label.`,
      severity: "low",
    });
  }
}

function extractPicklistValues(cf: Record<string, unknown>): string[] {
  const values: string[] = [];

  // Modern global/value-set definition
  const valueSet = cf.valueSet as Record<string, unknown> | undefined;
  const def = valueSet?.valueSetDefinition as Record<string, unknown> | undefined;
  for (const v of toArray(def?.value as unknown)) {
    const name = str((v as Record<string, unknown>).fullName) ??
      str((v as Record<string, unknown>).label);
    if (name) values.push(name);
  }

  // Classic picklist
  const picklist = cf.picklist as Record<string, unknown> | undefined;
  for (const v of toArray(picklist?.picklistValues as unknown)) {
    const name = str((v as Record<string, unknown>).fullName);
    if (name) values.push(name);
  }

  return unique(values);
}

function buildField(
  cf: Record<string, unknown>,
  objectApiName: string,
  sourcePath: string
): ParsedField | undefined {
  const apiName = str(cf.fullName);
  if (!apiName) return undefined;

  const type = str(cf.type);
  const references = toArray(cf.referenceTo as unknown)
    .map((r) => str(r))
    .filter((r): r is string => Boolean(r))
    .map((referenceTo) => ({
      referenceTo,
      relationshipName: str(cf.relationshipName),
    }));

  let relationshipType: ParsedField["relationshipType"];
  if (type === "Lookup") relationshipType = "Lookup";
  else if (type === "MasterDetail") relationshipType = "MasterDetail";

  return {
    id: `field:${objectApiName}.${apiName}`,
    objectApiName,
    apiName,
    label: str(cf.label),
    type,
    required: bool(cf.required),
    unique: bool(cf.unique),
    externalId: bool(cf.externalId),
    length: num(cf.length),
    precision: num(cf.precision),
    scale: num(cf.scale),
    formula: str(cf.formula),
    picklistValues: extractPicklistValues(cf),
    references,
    relationshipType,
    description: str(cf.description),
    sourcePath,
  };
}

function parseFieldFile(file: MetadataFile): ParsedField | undefined {
  const root = parseXml(file.content);
  const cf = (root?.CustomField ?? root) as Record<string, unknown> | undefined;
  if (!cf) return undefined;

  const objectApiName = objectNameFromPath(file.path) ?? "Unknown";
  // sfdx field files do not always carry fullName; fall back to file name.
  if (!cf.fullName) {
    cf.fullName = stripSuffix(baseName(file.path), [".field-meta.xml"]);
  }
  return buildField(cf, objectApiName, file.path);
}

function buildRecordType(
  rt: Record<string, unknown>,
  objectApiName: string,
  sourcePath: string
): ParsedRecordType | undefined {
  const apiName = str(rt.fullName);
  if (!apiName) return undefined;
  return {
    id: `recordType:${objectApiName}.${apiName}`,
    objectApiName,
    apiName,
    label: str(rt.label),
    active: bool(rt.active),
    description: str(rt.description),
    sourcePath,
  };
}

function parseRecordTypeFile(file: MetadataFile): ParsedRecordType | undefined {
  const root = parseXml(file.content);
  const rt = (root?.RecordType ?? root) as Record<string, unknown> | undefined;
  if (!rt) return undefined;
  const objectApiName = objectNameFromPath(file.path) ?? "Unknown";
  if (!rt.fullName) {
    rt.fullName = stripSuffix(baseName(file.path), [".recordType-meta.xml"]);
  }
  return buildRecordType(rt, objectApiName, file.path);
}

function namesOf(collection: unknown): string[] {
  return toArray(collection)
    .map((d) => {
      const rec = d as Record<string, unknown>;
      return str(rec.label) ?? str(rec.name);
    })
    .filter((n): n is string => Boolean(n));
}

function parseFlowFile(file: MetadataFile): ParsedFlow | undefined {
  const root = parseXml(file.content);
  const flow = (root?.Flow ?? root) as Record<string, unknown> | undefined;
  if (!flow) return undefined;

  const apiName = stripSuffix(baseName(file.path), [".flow-meta.xml", ".flow"]);
  const start = flow.start as Record<string, unknown> | undefined;

  const recordOperations: string[] = [];
  recordOperations.push(...namesOf(flow.recordCreates).map((n) => `Create: ${n}`));
  recordOperations.push(...namesOf(flow.recordUpdates).map((n) => `Update: ${n}`));
  recordOperations.push(...namesOf(flow.recordLookups).map((n) => `Lookup: ${n}`));
  recordOperations.push(...namesOf(flow.recordDeletes).map((n) => `Delete: ${n}`));

  return {
    id: `flow:${apiName}`,
    apiName,
    label: str(flow.label),
    status: str(flow.status),
    processType: str(flow.processType),
    triggerType: str(start?.triggerType) ?? str(start?.recordTriggerType),
    triggerObject: str(start?.object),
    decisions: namesOf(flow.decisions),
    assignments: namesOf(flow.assignments),
    recordOperations,
    sourcePath: file.path,
  };
}

function detectLogicCategory(
  name: string,
  content: string,
  integration: string[]
): ApexLogicCategory {
  const lname = name.toLowerCase();
  const lcontent = content.toLowerCase();
  if (
    lname.includes("trigger") ||
    lcontent.includes("trigger.new") ||
    lcontent.includes("trigger.old")
  )
    return "Trigger Handler";
  if (integration.length > 0) return "Integration";
  if (
    lname.includes("score") ||
    lname.includes("scorer") ||
    lname.includes("risk") ||
    lname.includes("ml") ||
    lname.includes("predict")
  )
    return "Scoring / Intelligence";
  if (
    lname.includes("calc") ||
    lname.includes("commission") ||
    lname.includes("compute")
  )
    return "Calculation";
  if (lname.includes("provision")) return "Provisioning";
  return "Service / Other";
}

function parseApexClass(file: MetadataFile): ParsedApexClass {
  const content = file.content;
  const apiName = stripSuffix(baseName(file.path), [".cls"]);

  const referenced = new Set<string>();
  // SOQL FROM clauses
  for (const m of content.matchAll(/\bFROM\s+([A-Za-z0-9_]+)/gi)) {
    referenced.add(m[1]);
  }
  // Custom objects anywhere
  for (const m of content.matchAll(/\b([A-Za-z0-9_]+__c)\b/g)) {
    referenced.add(m[1]);
  }
  // Standard objects referenced as identifiers
  for (const so of STANDARD_OBJECTS) {
    const re = new RegExp(`\\b${so}\\b`);
    if (re.test(content)) referenced.add(so);
  }

  const integrationKeywords = INTEGRATION_KEYWORDS.filter((k) =>
    new RegExp(`\\b${k}\\b`, "i").test(content) ||
    new RegExp(k, "i").test(apiName)
  );
  const businessKeywords = BUSINESS_KEYWORDS.filter((k) =>
    new RegExp(k, "i").test(apiName) || new RegExp(`\\b${k}`, "i").test(content)
  );

  const isTest = /@istest/i.test(content) || /testmethod/i.test(content);

  return {
    id: `class:${apiName}`,
    apiName,
    referencedObjects: unique([...referenced]).sort(),
    businessKeywords: unique(businessKeywords),
    integrationKeywords: unique(integrationKeywords),
    logicCategory: detectLogicCategory(apiName, content, integrationKeywords),
    isTest,
    lineCount: content.split(/\r?\n/).length,
    sourcePath: file.path,
  };
}

function parseObjectPermissions(node: unknown): ObjectPermission[] {
  return toArray(node).map((p) => {
    const rec = p as Record<string, unknown>;
    return {
      object: str(rec.object) ?? "Unknown",
      allowRead: bool(rec.allowRead),
      allowCreate: bool(rec.allowCreate),
      allowEdit: bool(rec.allowEdit),
      allowDelete: bool(rec.allowDelete),
      viewAllRecords: bool(rec.viewAllRecords),
      modifyAllRecords: bool(rec.modifyAllRecords),
    };
  });
}

function parseFieldPermissions(node: unknown): FieldPermission[] {
  return toArray(node).map((p) => {
    const rec = p as Record<string, unknown>;
    return {
      field: str(rec.field) ?? "Unknown",
      readable: bool(rec.readable),
      editable: bool(rec.editable),
    };
  });
}

function parseUserPermissions(node: unknown): string[] {
  return toArray(node)
    .filter((p) => bool((p as Record<string, unknown>).enabled))
    .map((p) => str((p as Record<string, unknown>).name))
    .filter((n): n is string => Boolean(n));
}

function parsePermissionSetFile(file: MetadataFile): ParsedPermissionSet | undefined {
  const root = parseXml(file.content);
  const ps = (root?.PermissionSet ?? root) as Record<string, unknown> | undefined;
  if (!ps) return undefined;
  const apiName = stripSuffix(baseName(file.path), [
    ".permissionset-meta.xml",
    ".permissionset",
  ]);
  return {
    id: `permissionset:${apiName}`,
    apiName,
    label: str(ps.label),
    description: str(ps.description),
    objectPermissions: parseObjectPermissions(ps.objectPermissions),
    fieldPermissions: parseFieldPermissions(ps.fieldPermissions),
    userPermissions: parseUserPermissions(ps.userPermissions),
    sourcePath: file.path,
  };
}

function parseProfileFile(file: MetadataFile): ParsedProfile | undefined {
  const root = parseXml(file.content);
  const pr = (root?.Profile ?? root) as Record<string, unknown> | undefined;
  if (!pr) return undefined;
  const apiName = stripSuffix(baseName(file.path), [
    ".profile-meta.xml",
    ".profile",
  ]);
  return {
    id: `profile:${apiName}`,
    apiName,
    custom: bool(pr.custom),
    objectPermissions: parseObjectPermissions(pr.objectPermissions),
    fieldPermissions: parseFieldPermissions(pr.fieldPermissions),
    userPermissions: parseUserPermissions(pr.userPermissions),
    sourcePath: file.path,
  };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export function parseMetadataFiles(
  files: MetadataFile[],
  options: { bundleName?: string; extractionMode?: "metadataBundle" | "looseFiles" } = {}
): ParsedMetadata {
  const startedAt = performance.now();

  const objects: ParsedObject[] = [];
  const fields: ParsedField[] = [];
  const recordTypes: ParsedRecordType[] = [];
  const flows: ParsedFlow[] = [];
  const apexClasses: ParsedApexClass[] = [];
  const permissionSets: ParsedPermissionSet[] = [];
  const profiles: ParsedProfile[] = [];
  const warnings: ParseWarning[] = [];

  let filesScanned = 0;
  let filesParsed = 0;
  let filesSkipped = 0;
  let apiVersion = "unknown";

  for (const file of files) {
    filesScanned += 1;
    const kind = classify(file.path);

    try {
      switch (kind) {
        case "object":
          parseObjectFile(file, { objects, fields, recordTypes }, warnings);
          filesParsed += 1;
          break;
        case "field": {
          const f = parseFieldFile(file);
          if (f) {
            fields.push(f);
            filesParsed += 1;
          } else filesSkipped += 1;
          break;
        }
        case "recordType": {
          const rt = parseRecordTypeFile(file);
          if (rt) {
            recordTypes.push(rt);
            filesParsed += 1;
          } else filesSkipped += 1;
          break;
        }
        case "flow": {
          const fl = parseFlowFile(file);
          if (fl) {
            flows.push(fl);
            filesParsed += 1;
          } else filesSkipped += 1;
          break;
        }
        case "apexClass":
          apexClasses.push(parseApexClass(file));
          filesParsed += 1;
          break;
        case "apexMeta": {
          const m = parseXml(file.content);
          const v = str(
            (m?.ApexClass as Record<string, unknown> | undefined)?.apiVersion
          );
          if (v && apiVersion === "unknown") apiVersion = v;
          filesSkipped += 1;
          break;
        }
        case "permissionSet": {
          const ps = parsePermissionSetFile(file);
          if (ps) {
            permissionSets.push(ps);
            filesParsed += 1;
          } else filesSkipped += 1;
          break;
        }
        case "profile": {
          const pr = parseProfileFile(file);
          if (pr) {
            profiles.push(pr);
            filesParsed += 1;
          } else filesSkipped += 1;
          break;
        }
        default:
          filesSkipped += 1;
      }
    } catch (err) {
      filesSkipped += 1;
      warnings.push({
        type: "PARSE_ERROR",
        artifact: file.path,
        message: `Failed to parse file: ${(err as Error).message}`,
        severity: "high",
      });
    }
  }

  // Relationship-target sanity checks (surfaced as warnings, not failures).
  const objectNames = new Set(objects.map((o) => o.apiName));
  for (const field of fields) {
    for (const ref of field.references) {
      if (!objectNames.has(ref.referenceTo)) {
        warnings.push({
          type: "MISSING_RELATIONSHIP_TARGET",
          artifact: field.id,
          message: `Field references "${ref.referenceTo}" which was not found in the parsed object set.`,
          severity: "medium",
        });
      }
    }
  }

  const durationMs = Math.round(performance.now() - startedAt);

  return {
    org: {
      source: "salesforce",
      extractionMode: options.extractionMode ?? "metadataBundle",
      apiVersion,
      bundleName: options.bundleName,
      parsedAt: new Date().toISOString(),
      parserVersion: PARSER_VERSION,
    },
    objects: objects.sort((a, b) => a.apiName.localeCompare(b.apiName)),
    fields: fields.sort((a, b) => a.id.localeCompare(b.id)),
    recordTypes: recordTypes.sort((a, b) => a.id.localeCompare(b.id)),
    flows: flows.sort((a, b) => a.apiName.localeCompare(b.apiName)),
    apexClasses: apexClasses.sort((a, b) => a.apiName.localeCompare(b.apiName)),
    permissionSets: permissionSets.sort((a, b) => a.apiName.localeCompare(b.apiName)),
    profiles: profiles.sort((a, b) => a.apiName.localeCompare(b.apiName)),
    warnings,
    stats: {
      filesScanned,
      filesParsed,
      filesSkipped,
      durationMs,
      extractionMode: options.extractionMode ?? "metadataBundle",
    },
  };
}
