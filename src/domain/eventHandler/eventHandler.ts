import { Path } from "../../io";
import log from "../../logs";
import { Context } from "../extension-api";
import handleTaskFileUpdated from "./handleTaskUpdated";
import handleViewFileUpdated from "./handleViewUpdated";

export enum EventType {
  taskAdded = "task.added",
  taskUpdated = "task.updated",
  taskDeleted = "task.deleted",
  viewUpdated = "view.updated",
  viewDeleted = "view.deleted",
  // TODO: add more
}

export interface Event {
  // id: string;  // TODO: is this needed?
  type: EventType;
  payload?: {
    path: Path;
  };
}

function handleTaskFileAdded(event: Event): void {
  log.debug(`WIP: handleTaskAdded`)
}

function handleTaskFileDeleted(event: Event): void {
  log.debug(`WIP: handleTaskDeleted`)
}

export default function handleEvent(event: Event, context: Context): void {
  log.debug('eventHandler.ts::handleEvent::event:', event)

  switch (event.type) {
    case EventType.taskAdded:
      return handleTaskFileAdded(event);
    case EventType.taskUpdated:
      return handleTaskFileUpdated(event, context);
    case EventType.taskDeleted:
      return handleTaskFileDeleted(event);

    case EventType.viewUpdated:
      return handleViewFileUpdated(event, context);

    default:
      throw new Error(`Event type '${event.type}' not recognized`);
  }
}
