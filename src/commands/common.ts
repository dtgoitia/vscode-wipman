import * as vscode from "vscode";
import { Context } from "../domain/extension-api";
import { Path } from "../io";
import log from "../logs";

type CommandName = string;
type Command = () => {} | (() => Promise<void>);
export interface CommandSpec {
  name: CommandName;
  callback: Command;
}
export type CommandSpecBuilder = (context: Context) => CommandSpec;

export function logExceptionsInChannel({ name, callback }: CommandSpec): CommandSpec {

  const wrappedCallback = () => {
    try {
      return callback()
    } catch (error) {
      log.error(error);

      return new Promise((resolve, reject) => {
        reject(error);
      });
    }
  }

  return { name: name, callback: wrappedCallback }
}

export function reportConflictingCommandNames(commands: CommandSpec[]) {
  log.debug("Looking for conflicting command names...")
  const originalAmount = commands.length;

  const allNames = commands.map(({ name }) => name);

  const uniqueNames = new Set<CommandName>(allNames);
  if (uniqueNames.size == originalAmount) {
    return 'all ok';
  }

  const counter = new Map<CommandName, number>();
  for (const { name } of commands) {
    const current = counter.get(name) || 0;
    counter.set(name, current + 1);
  }

  const duplicates = new Map<CommandName, number>();
  for (const [name, amount] of counter.entries()) {
    if (amount > 1) {
      duplicates.set(name, amount);
    }
  }

  const errorMessageLines: string[] = [
    `Command names must be unique:`
  ];
  for (const [name, amount] of counter.entries()) {
    errorMessageLines.push(`  '${name}' used ${amount} times`);
  }

  throw new Error(errorMessageLines.join("\n"));
}

// TODO: consider if this needs to live elsewhere - is it worth wrapping the vscode function?
export async function openFileInEditor(path: Path): Promise<void> {
  const textDocument = await vscode.workspace.openTextDocument(path.toString());
  vscode.window.showTextDocument(textDocument)
}


export function setsAreEqual<T>(a: Set<T> | undefined, b: Set<T> | undefined): boolean {
  if (a === undefined && b === undefined) return true;
  if (a === undefined || b === undefined) return false;

  if (a.size !== b.size) return false;

  for (const element_a of a) {
    if (b.has(element_a) === false) {
      return false;
    }
  }

  return true;
}

export function intersect<T>(a: Set<T> | undefined, b: Set<T> | undefined): Set<T> {
  const common = new Set<T>();
  if (a === undefined || b === undefined) return common;

  for (const element_a of a) {
    if (b.has(element_a)) {
      common.add(element_a)
    }
  }

  return common;
}
