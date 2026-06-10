/**
 * Stage 1 - Metadata Parser type contracts.
 *
 * These describe the structured artifact records produced by parsing a raw
 * Salesforce source-format metadata bundle. They intentionally stay close to
 * the Salesforce shapes; normalization into the canonical contract happens in
 * a later pipeline stage.
 */

export type MetadataKind =
  | "object"
  | "field"
  | "recordType"
  | "flow"
  | "apexClass"
  | "permissionSet"
  | "profile";

export interface ParsedObject {
  id: string; // object:Account
  apiName: string;
  label?: string;
  pluralLabel?: string;
  custom: boolean;
  deploymentStatus?: string;
  sharingModel?: string;
  description?: string;
  sourcePath: string;
}

export interface FieldReference {
  referenceTo: string;
  relationshipName?: string;
}

export interface ParsedField {
  id: string; // field:Account.ARR__c
  objectApiName: string;
  apiName: string;
  label?: string;
  type?: string;
  required: boolean;
  unique?: boolean;
  externalId?: boolean;
  length?: number;
  precision?: number;
  scale?: number;
  formula?: string;
  picklistValues: string[];
  references: FieldReference[];
  relationshipType?: "Lookup" | "MasterDetail";
  description?: string;
  sourcePath: string;
}

export interface ParsedRecordType {
  id: string; // recordType:Account.Enterprise
  objectApiName: string;
  apiName: string;
  label?: string;
  active: boolean;
  description?: string;
  sourcePath: string;
}

export interface ParsedFlow {
  id: string; // flow:Renewal_Risk_Detection
  apiName: string;
  label?: string;
  status?: string;
  processType?: string;
  triggerType?: string;
  triggerObject?: string;
  decisions: string[];
  assignments: string[];
  recordOperations: string[];
  sourcePath: string;
}

export type ApexLogicCategory =
  | "Trigger Handler"
  | "Integration"
  | "Scoring / Intelligence"
  | "Calculation"
  | "Provisioning"
  | "Service / Other";

export interface ParsedApexClass {
  id: string; // class:ChurnRiskScorer
  apiName: string;
  referencedObjects: string[];
  businessKeywords: string[];
  integrationKeywords: string[];
  logicCategory: ApexLogicCategory;
  isTest: boolean;
  lineCount: number;
  sourcePath: string;
}

export interface ObjectPermission {
  object: string;
  allowRead?: boolean;
  allowCreate?: boolean;
  allowEdit?: boolean;
  allowDelete?: boolean;
  viewAllRecords?: boolean;
  modifyAllRecords?: boolean;
}

export interface FieldPermission {
  field: string;
  readable?: boolean;
  editable?: boolean;
}

export interface ParsedPermissionSet {
  id: string; // permissionset:PS_CSM
  apiName: string;
  label?: string;
  description?: string;
  objectPermissions: ObjectPermission[];
  fieldPermissions: FieldPermission[];
  userPermissions: string[];
  sourcePath: string;
}

export interface ParsedProfile {
  id: string; // profile:System Administrator
  apiName: string;
  custom?: boolean;
  objectPermissions: ObjectPermission[];
  fieldPermissions: FieldPermission[];
  userPermissions: string[];
  sourcePath: string;
}

export interface ParseWarning {
  type: string;
  artifact: string;
  message: string;
  severity: "low" | "medium" | "high";
}

export interface ParseStats {
  filesScanned: number;
  filesParsed: number;
  filesSkipped: number;
  durationMs: number;
  extractionMode: "metadataBundle" | "looseFiles";
}

export interface ParsedMetadata {
  org: {
    source: "salesforce";
    extractionMode: "metadataBundle" | "looseFiles";
    apiVersion: string;
    bundleName?: string;
    parsedAt: string;
    parserVersion: string;
  };
  objects: ParsedObject[];
  fields: ParsedField[];
  recordTypes: ParsedRecordType[];
  flows: ParsedFlow[];
  apexClasses: ParsedApexClass[];
  permissionSets: ParsedPermissionSet[];
  profiles: ParsedProfile[];
  warnings: ParseWarning[];
  stats: ParseStats;
}

/** Lightweight in-memory representation of an extracted metadata file. */
export interface MetadataFile {
  path: string;
  content: string;
}
