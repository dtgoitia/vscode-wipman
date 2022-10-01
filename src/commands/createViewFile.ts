import { filter, firstValueFrom, map } from "rxjs";
import { makeSnapshot } from "../devex/snapshot";
import { Context } from "../domain/extension-api";
import { FileAdded, FileType } from "../domain/files/files";
import { CommandSpec, openFileInEditor } from "./common";

export function createViewFile({ viewManager }: Context): void {
  viewManager.addView({ title: "untitled" });
  // Use FileManager to track when the file was added
}


async function createViewFileAndFocus(context: Context): Promise<void> {
  const addedViewPath$ = context
    .fileManager
    .changes$
    .pipe(
      filter(change => change instanceof FileAdded && change.type === FileType.view),
      map(fileAdded => fileAdded.path),
    )

  createViewFile(context);

  const shouldSnapshot = context.config.debug === true;
  if (shouldSnapshot) {
    makeSnapshot({ context });
  }

  const viewPath = await firstValueFrom(addedViewPath$);
  await openFileInEditor(viewPath);
}


export function initializeCreateViewFileCommand(context: Context): CommandSpec {
  return {
    name: 'wipman.createViewFile',
    callback: async () => {
      await createViewFileAndFocus(context)
    },
  };
}