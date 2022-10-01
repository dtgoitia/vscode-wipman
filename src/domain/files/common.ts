import { unreachable } from "../../devex/errors";
import { METADATA_DELIMITER } from "../config";
import { ISODatetimeString } from "../model";

export function serializeDate(date: Date): ISODatetimeString {
  return date.toISOString();
}

export function deserializeDate(raw: ISODatetimeString): Date {
  return new Date(raw);
}

export function serializeSet(set: Set<string>): string {
  return [...set.values()].sort().join(",");
}

export function serializeBoolean(bool: boolean): string {
  switch (bool) {
    case true: return "true";
    case false: return "false";
    default:
      throw unreachable(`'${bool}' must be a boolean`);
  }
}

export function deserializeSet(raw: string): Set<string> {
  // TODO: a test to make sure this stays; reason: when a metadata has no value, it
  // passes an empty string, e.g.: a task has no tags
  if (raw === "") return new Set<string>();

  return new Set(raw.split(','));
}

export function deserializeBoolean(raw: string): boolean {
  switch (raw) {
    case "true": return true;
    case "false": return false;
    default:
      throw unreachable(`'${raw}' string cannot be casted into a boolean`);
  }
}

export interface Metadata {
  [x: string]: string;
}

export function parseMetadata(raw: string): Metadata {
  const lines = raw.split('\n');

  const metadata: Metadata = {};
  for (const line of lines) {
    const [key, ...valueChunks] = line.split("=");
    const value = valueChunks.join("=");
    if (key in metadata) {
      throw new Error(`Invalid metadata: keys must be unique, but key ${key} is used multiple times`);
    }
    metadata[key] = value;
  }

  return metadata;
}

export type MetadataValidationOutcome = ValidMetadata | InvalidMetadata
type ValidMetadata = [true, undefined]
type Reason = string;
type InvalidMetadata = [false, Reason[]];

export function splitMetadataAndContent(raw: string): [string, string] {
  const delimiter = `\n${METADATA_DELIMITER}\n`;
  const [rawMetadata, rawContent] = raw.split(delimiter, 2);
  return [rawMetadata, rawContent];
}
