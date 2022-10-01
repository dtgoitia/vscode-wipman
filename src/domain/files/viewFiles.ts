import { Path } from "../../io";
import log from "../../logs";
import { joinRegExp } from "../../regexp";
import { METADATA_DELIMITER } from "../config";
import { TaskId, View, ViewContentLine } from "../model";
import { deserializeDate, deserializeSet, Metadata, MetadataValidationOutcome, parseMetadata, serializeDate, serializeSet, splitMetadataAndContent } from "./common";

function isValidViewMetadata(metadata: Metadata): MetadataValidationOutcome {
  const MANDATORY_VIEW_METADATA = ['id', 'created', 'updated', 'title', 'tags'];

  let reasons: string[] = [];
  for (const key of MANDATORY_VIEW_METADATA) {
    if (key in metadata === false) {
      reasons.push(`View file must contain '${key}' in metadata`);
    }
  }

  if (reasons.length > 0) {
    return [false, reasons];
  }

  return [true, undefined];  // all good
}

export function deserializeViewOnlyMetadata({ raw }: { raw: string }): View {
  const [rawMetadata, rawContent] = splitMetadataAndContent(raw);

  const metadata = parseMetadata(rawMetadata);
  const [metadataIsValid, reasons] = isValidViewMetadata(metadata);
  if (metadataIsValid === false) {
    const formattedReasons = (reasons as string[]).map(reason => `  - ${reason}`).join("\n");
    throw new Error(`Invalid view file format:\n${formattedReasons}`);
  }

  const view: View = {
    id: metadata.id,
    title: metadata.title,
    created: deserializeDate(metadata.created),
    updated: deserializeDate(metadata.updated),
    tags: deserializeSet(metadata.tags),
    content: [],
  }

  return view;
}

function deserializeView({ raw }: { raw: string }): [View, Set<TaskId>] {
  if (raw === "") {
    throw new Error("Cannot deserialize an empty string into a View");
  }

  const [rawMetadata, rawContent] = splitMetadataAndContent(raw);

  const metadata = parseMetadata(rawMetadata);
  const [metadataIsValid, reasons] = isValidViewMetadata(metadata);
  if (metadataIsValid === false) {
    const formattedReasons = (reasons as string[]).map(reason => `  - ${reason}`).join("\n");
    throw new Error(`Invalid view file format:\n${formattedReasons}`);
  }

  const taskIds = new Set<TaskId>();
  const content: ViewContentLine[] = [];
  for (const line of rawContent.split('\n')) {
    if (line === "") continue;
    const contentLine = parseViewContentLine(line);
    content.push(contentLine);

    const taskId = contentLine.id;
    if (taskId === undefined) {
      log.debug(`Skipping view content line because it has no Task ID: ${line}`);
      continue
    }

    taskIds.add(taskId);
  }

  const view: View = {
    id: metadata.id,
    title: metadata.title,
    created: deserializeDate(metadata.created),
    updated: deserializeDate(metadata.updated),
    tags: deserializeSet(metadata.tags),
    content,
  }

  return [view, taskIds];
}

export function readViewFile(path: Path): [View, Set<TaskId>] {
  log.debug(`viewFiles.ts::readViewFile::path=${path}`)
  const raw = path.readText();
  log.debug(`viewFiles.ts::readViewFile::raw:`, raw);
  const [view, taskIds] = deserializeView({ raw });
  return [view, taskIds];
}
export function readViewFileMetadata(path: Path): View {
  const raw = path.readText();
  const view = deserializeViewOnlyMetadata({ raw });
  return view;
}

function serializeViewContent(lines: ViewContentLine[]): string {
  return lines
    .map(serializeViewContentLine)
    .join("\n");
}

export function serializeView(view: View): string {
  return [
    `id=${view.id}`,
    `title=${view.title}`,
    `created=${serializeDate(view.created)}`,
    `updated=${serializeDate(view.created)}`,
    `tags=${serializeSet(view.tags)}`,
    METADATA_DELIMITER,
    serializeViewContent(view.content),
    ``,
  ].join("\n")
}



interface WriteViewFileProps {
  path: Path;
  view: View;
}
export function writeViewFile({ path, view }: WriteViewFileProps): void {
  const content = serializeView(view);
  path.writeText(content);
}

const compelted = /^- \[(?<completed>[\sx])\]\s/
const title = /(?<title>.*)/;
const link = /(?<link>\s\[(?<id>[a-z]{10})\]\(\.\.\/(?<dir>[a-z]{2})\/(?<path>[a-z]{8})\))/;
const end = /$/;

const withIdPattern = joinRegExp([compelted, title, link, end]);
const withoutIdPattern = joinRegExp([compelted, title, end]);


export function serializeViewContentLine(task: ViewContentLine): string {
  let prefix = task.completed
    ? "- [x] "
    : "- [ ] ";

  let link = task.id
    ? `  [${task.id}](../${task.id.slice(0, 2)}/${task.id.slice(2)})`
    : "";

  return [prefix, task.title, link].join("")
}


export function parseViewContentLine(line: string): ViewContentLine {
  /**
   * Anatomy of the link:
   *   link:  [abcde](../ab/cde)
   *   id:     abcde
   *   dir:              ab
   *   path:                cde 
   * */

  let match = line.match(withIdPattern);

  if (match === null) {
    match = line.match(withoutIdPattern);
  }

  if (!match?.groups) {
    const hasExpectedStart = line.startsWith("- [ ] ") || line.startsWith("- [x] ");
    if (hasExpectedStart === false) {
      throw new Error(`Cannot understand line, make sure that it starts with either` +
        ` "- [ ] " or "- [x] ". Line: ${line}`);
    }

    throw new Error(`Cannot understand line, no RegEx groups found: ${line}`);
  }

  const groups = match.groups;
  const { completed: rawCompleted, id } = groups;

  let taskId: TaskId | undefined = undefined;
  if ('link' in groups) {
    if ("completed" in groups === false) throw new Error("'completed' not found in RegExp group");
    if ("id" in groups === false) throw new Error("'id' not found in RegExp group");
    if ("dir" in groups === false) throw new Error("'dir' not found in RegExp group");
    if ("path" in groups === false) throw new Error("'path' not found in RegExp group");

    const { dir, path } = groups;

    const pathId = `${dir}${path}`;
    if (id !== pathId) {
      throw new Error(
        `IDs in the link description and path do not match:\n` +
        `  link: ${groups.link.trim()}\n` +
        `  id  : ${id}\n` +
        `  path: ${dir}${path}\n` +
        ``
      )
    }

    taskId = id;
  }

  let completed: boolean;
  switch (rawCompleted) {
    case " ":
      completed = false;
      break;
    case "x":
      completed = true;
      break;
    default:
      throw new Error(`Unsupported symbol in task completion-prefix: ${line}`);
  }

  const dirtyTitle = match.groups.title;
  const title = dirtyTitle.trimEnd();

  return { completed, title, id: taskId };
}