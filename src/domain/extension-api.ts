import { CommandSpec, CommandSpecBuilder, logExceptionsInChannel, reportConflictingCommandNames } from "../commands/common";
import { initializeCreateTaskFileCommand } from "../commands/createTaskFile";
import { initializeCreateViewFileCommand } from "../commands/createViewFile";
import { initializeSyncCommand } from "../commands/sync";
import { Config } from "./config";
import { FileManager, indexFilesInWIpmanDirectory } from "./files/files";
import { BatchProcessArgs, IFirestoreClient } from "./firestore";
import { RemoteStorage } from "./remote-storage";
import { TaskManager } from "./tasks";
import { ViewManager } from "./views";

export interface Context {
  taskManager: TaskManager;
  viewManager: ViewManager;
  fileManager: FileManager;
  remoteStorage: RemoteStorage;
  config: Config;
  commands: CommandSpec[];
}

interface initializeProps {
  config: Config;
}
export function initialize({ config }: initializeProps): Context {
  const taskManager = new TaskManager({});
  const viewManager = new ViewManager({ taskManager });
  const fileManager = new FileManager({ root: config.wipmanDir, taskManager, viewManager });
  // const firestoreClient = new FirestoreClient({ fireBaseConfig: {} }) // TODO: get config from VSCode config
  const firestoreClient = new FakeFirestoreClient();
  const remoteStorage = new RemoteStorage({ fileManager, firestoreClient });

  const context: Context = { config, taskManager, viewManager, fileManager, remoteStorage, commands: [] };

  // TODO: the two functions below are scanning twice the root dir (once each function),
  // think about how to/ do it at once - it's just about finding the right order of =
  // actions at the orchestration level
  indexFilesInWIpmanDirectory({ root: config.wipmanDir, taskManager, viewManager });
  fileManager.index();
  // TODO: read above ------------------------------------------------------------------

  const productionCommands: CommandSpecBuilder[] = [
    initializeCreateTaskFileCommand,
    initializeCreateViewFileCommand,
    initializeSyncCommand,
  ];

  const developmentCommands: CommandSpecBuilder[] = [];

  const commands: CommandSpec[] = [
    ...productionCommands,
    ...(
      context.config.debug
        ? developmentCommands
        : []
    )
  ]
    .map(initializeCommandSpec => initializeCommandSpec(context))
    .map(logExceptionsInChannel);  // TODO: is this needed?

  reportConflictingCommandNames(commands);

  commands.forEach(command => {
    context.commands.push(command);
  })

  return context;
}

// TODO: delete this - it's temporary dirty patch until you fully implement the
// FirestoreClient, else you need to import test code which breaks after publishing
class FakeFirestoreClient implements IFirestoreClient {
  public calls: unknown[] = [];
  public async batchProcess(args: BatchProcessArgs): Promise<void> {
    this.calls.push(args);
  }
}