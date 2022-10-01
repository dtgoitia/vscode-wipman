import { Context } from "../domain/extension-api";
import { CommandSpec } from "./common";

async function sync({ remoteStorage }: Context): Promise<void> {
  await remoteStorage.sync();
}

export function initializeSyncCommand(context: Context): CommandSpec {
  return {
    name: 'wipman.sync',
    callback: async () => {
      await sync(context)
    },
  };
}