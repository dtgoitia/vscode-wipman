import log from "../logs";
import task from "../test/factories/task";
import view from "../test/factories/view";
import { FirestoreClient } from "./firestore";
import { Task, View } from "./model";

describe("Firestore", () => {
  xit('works :)', async () => {

    // Spin up the local firestore instance with docker-compose
    const firestore = new FirestoreClient({
      fireBaseConfig: {
        projectId: "dummy-project-id",
      }
    });

    const tasks: Task[] = [task({})];
    const views: View[] = [view({})];
    log.debug(tasks)
    log.debug(views)

    // await firestore.setTasks(tasks);
    const tasksInDb = await firestore.getAllTasks();
    log.debug(tasksInDb)
    await firestore.deleteTasks(tasksInDb.map(task => task.id));
    // const views: View[] = [];
  });
});
