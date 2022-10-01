import * as vscode from "vscode";
import { makeSnapshot } from "../devex/snapshot";
import { Config } from "../domain/config";
import handleEvent, { EventType } from "../domain/eventHandler/eventHandler";
import { Context } from "../domain/extension-api";
import { Path } from "../io";
import log from "../logs";

const EXTENSIONS_OF_FILES_TO_IGNORE = new Set<string>([".json"])

function isInWipmanDir(path: Path, config: Config): boolean {
  return path.parent().parent().equals(config.wipmanDir);
}

function isTaskFile(path: Path, config: Config): boolean {
  if (isInWipmanDir(path, config) === false) return false;
  return isViewFile(path, config) === false;
}

function isViewFile(path: Path, config: Config): boolean {
  if (isInWipmanDir(path, config) === false) return false;
  // TODO: assert it has `.view` extension

  const dir = path.parent();
  return dir.equals(config.viewsDir);
}

function shouldIgnore(path: Path, config: Config): boolean {
  if (isInWipmanDir(path, config) === false) {
    return true;
  }

  if (path.parent().name() === '.vscode') {
    // This file belongs to VSCode configuration files - ignore it
    return true;
  }

  const extension = path.extension();
  if (extension && EXTENSIONS_OF_FILES_TO_IGNORE.has(extension)) {
    // This file is between the ignored extensions
    return true;
  }

  return false;  // This file is not recorgnized - do not ignore it
}

export function handleOnSave(path: Path, context: Context): void {
  log.debug(`onSave.ts::handleOnSave::path=${path.toString()}`);

  switch (true) {

    case isViewFile(path, context.config):
      log.debug(`onSave.ts::handleOnSave::isViewFile=true`);
      handleEvent({ type: EventType.viewUpdated, payload: { path } }, context);
      break;

    case isTaskFile(path, context.config):
      log.debug(`onSave.ts::handleOnSave::isTaskFile=True`);
      handleEvent({ type: EventType.taskUpdated, payload: { path } }, context);
      break;

    case shouldIgnore(path, context.config):
      return; // do nothing an return early to avoid snpahosts, etc.

    default:
      throw new Error(`File is not Task or View: ${path}`);
  }

  const shouldSnapshot = context.config.debug === true;
  if (shouldSnapshot) {
    makeSnapshot({ context });
  }
}

export default function getVSCodeOnSaveHandler(context: Context): (document: vscode.TextDocument) => Promise<void> {
  async function handleVSCodeOnSave(document: vscode.TextDocument): Promise<void> {
    try {
      log.debug(`handleOnSave=${document.fileName}`)
      if (document.uri.scheme !== "file") return;

      const path = new Path(document.uri.path);

      handleOnSave(path, context);

    } catch (error) {
      log.error(error);
    }
  }
  return handleVSCodeOnSave;
}