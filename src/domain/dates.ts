import { ISODatetimeString } from "./model";

export function now(): Date {
  return new Date();
}

export function nowIsoString(): ISODatetimeString {
  return now().toISOString();
}
