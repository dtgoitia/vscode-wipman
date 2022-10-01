import { now } from "../domain/dates";
import { Context } from "../domain/extension-api";
import { TaskId, ViewId } from "../domain/model";
import { TaskManager } from "../domain/tasks";
import { ViewManager } from "../domain/views";
import { Path } from "../io";

interface SnapshotArgs {
  context: Context;
};
export function makeSnapshot({ context }: SnapshotArgs): void {
  const timestamp = now().getTime().toString();
  const { taskManager, viewManager, config } = context;
  snapshotTaskManager({ dir: config.wipmanDir, timestamp, taskManager });
  snapshotViewManager({ dir: config.wipmanDir, timestamp, viewManager });
}

interface SnapshotTaskManagerArgs {
  dir: Path;
  timestamp: string;
  taskManager: TaskManager;
};

function snapshotTaskManager({ dir, timestamp, taskManager }: SnapshotTaskManagerArgs): void {
  const path = dir.join(`snapshot_${timestamp}_${TaskManager.name}.yml`);
  const internalData = taskManager._snapshot();

  const { tasksPerTag } = internalData;

  const tagsInIndex = [...(tasksPerTag.keys())].sort();

  let snapshot: string[] = [`${TaskManager.name}:`];

  for (const tag of tagsInIndex) {
    snapshot.push(`  - tag: ${tag}`);

    const taskIds = tasksPerTag.get(tag) as Set<TaskId>;
    if (taskIds.size === 0) {
      snapshot.push(`    task_ids: []`);
    } else {
      const sortedTaskIds = [...taskIds.values()].sort();
      snapshot.push(`    task_ids:`);
      for (const taskId of sortedTaskIds) {
        snapshot.push(`      - ${taskId}`);
      }
    }
  }

  snapshot.push(``);

  path.writeText(snapshot.join("\n"));
}

interface SnapshotViewManagerArgs {
  dir: Path;
  timestamp: string;
  viewManager: ViewManager;
}

function snapshotViewManager({ dir, timestamp, viewManager }: SnapshotViewManagerArgs): void {
  const path = dir.join(`snapshot_${timestamp}_${ViewManager.name}.yml`);
  const internalData = viewManager._snapshot();

  const { viewsByTask, tasksPerView } = internalData;

  const tasksInIndex = [...(viewsByTask.keys())].sort();

  let snapshot: string[] = [`${ViewManager.name}:`];

  for (const taskId of tasksInIndex) {
    snapshot.push(`  - taskId: ${taskId}`);

    const viewIds = viewsByTask.get(taskId) as Set<ViewId>;
    if (viewIds.size === 0) {
      snapshot.push(`    view_ids: []`);
    } else {
      const sortedViewIds = [...viewIds.values()].sort();
      snapshot.push(`    view_ids:`);
      for (const viewId of sortedViewIds) {
        snapshot.push(`      - ${viewId}`);
      }
    }
  }

  const viewIds = [...(tasksPerView.keys())].sort();

  for (const viewId of viewIds) {
    snapshot.push(`  - viewId: ${viewId}`);

    const taskIds = tasksPerView.get(viewId) as TaskId[];
    if (taskIds.length === 0) {
      snapshot.push(`    task_ids: []`);
    } else {
      const sortedTaskIds = taskIds.sort();
      snapshot.push(`    task_ids:`);
      for (const taskId of sortedTaskIds) {
        snapshot.push(`      - ${taskId}`);
      }
    }
  }

  snapshot.push(``);

  path.writeText(snapshot.join("\n"));
}