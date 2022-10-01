import { Path } from "../../io";
import log from "../../logs";
import { METADATA_DELIMITER } from "../config";
import { Task, TaskId } from "../model";
import { deserializeBoolean, deserializeDate, deserializeSet, Metadata, MetadataValidationOutcome, parseMetadata, serializeBoolean, serializeSet, splitMetadataAndContent } from "./common";

function isValidTaskMetadata(metadata: Metadata): MetadataValidationOutcome {
  const MANDATORY_TASK_METADATA = [
    'created', 'updated', 'title', 'tags', "blockedBy", "blocks",
  ];

  for (const key of MANDATORY_TASK_METADATA) {
    if (key in metadata === false) {
      return [false, [`View file must contain '${key}' in metadata`]];
    }
  }

  return [true, undefined];  // all good
}

function getTaskIdFromPath(path: Path): TaskId {
  return [
    path.parent().name(),
    path.name(),
  ].join("")
}

export function deserializeTask({ path, raw }: { path: Path, raw: string }): Task {
  const [rawMetadata, rawContent] = splitMetadataAndContent(raw);

  const metadata = parseMetadata(rawMetadata);
  const [metadataIsValid, reason] = isValidTaskMetadata(metadata);
  if (metadataIsValid === false) {
    throw new Error(`${reason}\n\nmetadata:\n${metadata}`);
  }

  return {
    id: getTaskIdFromPath(path),
    title: metadata.title,
    created: deserializeDate(metadata.created),
    updated: deserializeDate(metadata.updated),
    tags: deserializeSet(metadata.tags),
    content: rawContent,
    blockedBy: deserializeSet(metadata.blockedBy),
    blocks: deserializeSet(metadata.blocks),
    completed: deserializeBoolean(metadata.completed),
  }
}

export function readTaskFile(path: Path): Task {
  log.debug(`taskFiles.ts::readTaskFile:Reading Task file ${path.toString()}`)
  const raw = path.readText();
  const task = deserializeTask({ path, raw });
  return task;
}

export function serializeTask(task: Task): string {
  const rawMetadata = [
    `id=${task.id}`,
    `title=${task.title}`,
    `created=${task.created.toISOString()}`,
    `updated=${task.updated.toISOString()}`,
    `tags=${serializeSet(task.tags)}`,
    `blockedBy=${serializeSet(task.blockedBy)}`,
    `blocks=${serializeSet(task.blocks)}`,
    `completed=${serializeBoolean(task.completed)}`,
  ].join("\n");

  const raw = [
    rawMetadata,
    METADATA_DELIMITER,
    task.content,
  ].join("\n");

  return raw;
}

interface WriteTaskFileProps {
  path: Path;
  task: Task;
}

export function writeTaskFile({ path, task }: WriteTaskFileProps): void {
  const content = serializeTask(task);
  path.writeText(content);
}