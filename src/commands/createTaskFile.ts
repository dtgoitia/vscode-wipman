import { filter, firstValueFrom, map } from "rxjs";
import { makeSnapshot } from "../devex/snapshot";
import { Context } from "../domain/extension-api";
import { FileAdded, FileType } from "../domain/files/files";
import { CommandSpec, openFileInEditor } from "./common";

export function createTaskFile({ taskManager }: Context): void {
  taskManager.addTask({ title: "untitled" });
}

async function createTaskFileAndFocus(context: Context): Promise<void> {
  const addedTaskFiles$ = context
    .fileManager
    .changes$
    .pipe(
      filter(change => change instanceof FileAdded && change.type === FileType.task),
      map(fileAdded => fileAdded.path),
    );

  createTaskFile(context);

  const shouldSnapshot = context.config.debug === true;
  if (shouldSnapshot) {
    makeSnapshot({ context });
  }

  const taskPath = await firstValueFrom(addedTaskFiles$);
  await openFileInEditor(taskPath);
}

export function initializeCreateTaskFileCommand(context: Context): CommandSpec {
  return {
    name: 'wipman.createTaskFile',
    callback: async () => {
      await createTaskFileAndFocus(context)
    },
  };
}