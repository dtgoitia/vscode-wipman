import log from "../../logs";
import { Context } from "../extension-api";
import { readTaskFile } from "../files/taskFiles";
import { Event } from "./eventHandler";


export default function handleTaskFileUpdated(event: Event, context: Context): void {
  log.debug(`handleTaskFileUpdated::event:`, event);
  if (event.payload === undefined) {
    log.error(`Expected some payload, but it's undefined`);
    throw new Error(`Expected some payload, but it's undefined`)
  }

  const path = event.payload.path;

  const { taskManager } = context;

  const current = readTaskFile(path);
  const updated = { ...current };
  const previous = taskManager.getTask(current.id);

  // Update the 'update' metadata
  const lastUpdated = path.lastUpdated();
  if (current.updated !== lastUpdated) {
    updated.updated = lastUpdated;
  }

  if (updated === previous) {
    return;
  }

  taskManager.updateTask(updated);
}