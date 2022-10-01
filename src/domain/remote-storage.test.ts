import { Path } from "../io";
import { FakeFirestoreClient } from "../test/factories/firestore";
import task from "../test/factories/task";
import { Config } from "./config";
import { FileManager } from "./files/files";
import { writeTaskFile } from "./files/taskFiles";
import { IFirestoreClient } from "./firestore";
import { Task } from "./model";
import { BUFFER_FILE, RemoteStorage } from "./remote-storage";
import { inferTaskPathFromTaskId, TaskManager } from "./tasks";
import { ViewManager } from "./views";

function createTaskAndFile(wipmanDir: Path): [Task, Path] {
  const newTask = task({});
  const taskPath = inferTaskPathFromTaskId(newTask.id);
  const absoluteTaskPath = wipmanDir.join(taskPath);
  writeTaskFile({ task: newTask, path: absoluteTaskPath });
  return [newTask, absoluteTaskPath];
}

describe("Remote storage", () => {
  // TODO; this problably needs to go to a separate module
  const tmp = new Path("test-tmp-folder");
  const config = new Config({ wipmanDir: tmp });

  let bufferPath: Path;
  let mockFirestore: IFirestoreClient;
  let remoteStorage: RemoteStorage;

  beforeEach(async () => {
    const taskManager = new TaskManager({});
    const viewManager = new ViewManager({ taskManager });
    const fileManager = new FileManager({ root: config.wipmanDir, taskManager, viewManager });

    mockFirestore = new FakeFirestoreClient();
    remoteStorage = new RemoteStorage({ fileManager, firestoreClient: mockFirestore });

    bufferPath = config.wipmanDir.join(BUFFER_FILE);
  });

  afterEach(async () => tmp.delete())

  xit("squashes recorded changes and sends them to the remote storage", async () => {
    const [task_a, path_a] = await createTaskAndFile(config.wipmanDir);
    const [task_b, path_b] = await createTaskAndFile(config.wipmanDir);

    const content = `` +
      `task::upd::${path_a.toString()}\n` +
      `task::add::${path_b.toString()}\n` +
      `task::upd::${path_a.toString()}\n` +
      `task::upd::${path_b.toString()}\n` +
      `task::upd::${path_b.toString()}\n` +
      ``;
    await bufferPath.writeText(content);
    await remoteStorage.sync();

    expect((mockFirestore as FakeFirestoreClient).calls).toEqual([
      {
        // the order of these arrays does not really matter - if tests bother you, consider
        // making them sets
        setTasks: [task_a, task_b],
        setViews: [],
        deleteTasks: [],
        deleteViews: [],
      }
    ])
  });
});