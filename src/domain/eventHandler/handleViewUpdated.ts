import log from "../../logs";
import { Context } from "../extension-api";
import { readViewFile } from "../files/viewFiles";
import { Event } from "./eventHandler";


export default function handleViewFileUpdated(event: Event, context: Context): void {
  log.debug("handleViewUpdated.ts::handleViewFileUpdated::event", event)
  if (event.payload === undefined) {
    throw new Error(`Expected some payload, but it's undefined`)
  }

  const path = event.payload.path;

  const { viewManager } = context;

  const [current] = readViewFile(path);

  viewManager.updateView(current);

  log.info(`handleViewFileUpdated: completed`);
}
