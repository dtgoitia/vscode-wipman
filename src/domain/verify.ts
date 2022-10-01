import { Path } from "../io";
import { Context } from "./extension-api";
import { TaskId, View, ViewContentLine } from "./model";
import { shouldViewIncludeTask } from "./views";

export enum DisconnectedTaskViewPairProblem {
  expectedTaskInViewButNotFound = "expected task in view but not found",
  didNotExpectedTaskInViewButFound = "did not expect task in view but found",
  taskCompletionStatusMissmatch = "task completion status missmatch",
  taskTitleMismatch = "task title mismatch",
}

interface DisconnectedTaskViewPair {
  // Represents the situation where a Task has a tag, and should appear in a view
  // but it does not appear
  task: Path;
  view: Path;
  problems: DisconnectedTaskViewPairProblem[];
}


interface WipmanDirHealthReportArgs {
  filesWithInvalidFormat?: Set<Path>,
  disconnectedTaskViewPair?: DisconnectedTaskViewPair[]
}

export class WipmanDirHealthReport {
  public readonly filesWithInvalidFormat: Set<Path>;

  // If a Task is missing from multiple Views, you should have one item per missed View
  // in this list
  public readonly disconnectedTaskViewPair: DisconnectedTaskViewPair[]; // one per task-view pair
  public readonly problemsFound: boolean;

  constructor({ filesWithInvalidFormat, disconnectedTaskViewPair }: WipmanDirHealthReportArgs) {
    this.filesWithInvalidFormat = filesWithInvalidFormat !== undefined ? filesWithInvalidFormat : new Set<Path>();
    this.disconnectedTaskViewPair = disconnectedTaskViewPair !== undefined ? disconnectedTaskViewPair : [];

    this.problemsFound = this.filesWithInvalidFormat.size > 0 || this.disconnectedTaskViewPair.length > 0;
  }

}

function getTaskFromView({ view, taskId }: { view: View, taskId: TaskId }): ViewContentLine | undefined {
  for (const line of view.content) {
    if (line.id && line.id === taskId) {
      return line;
    }
  }

  return undefined;
}

export function verify({ taskManager, viewManager, fileManager }: Context): WipmanDirHealthReport {
  // Build logic to assert that all task files are in backlog
  /**
   * Index wipman dir
   * for every task in task manager (presumably, the indexing will already do the heavy
   *     lifting of crawling the wipman dir and finding every Task and putting it into
   *     the TaskManager):
   *  make sure that each Task is present in the backlog with the right title, and completion status
   */

  // Do not reuse the global indexes and managers you use in the extension, build a disposable and local one instead
  // why new? -- to make sure you get a fresh scan
  // why dispose? -- because you don't need it anymore, and I don't want to bother now replacing existing index - perhaps I could reindex the global one :S thought for later... xD

  const disconnectedTaskViewPair: DisconnectedTaskViewPair[] = [];
  for (const task of taskManager.tasks.values()) {
    const taskPath = fileManager.getTaskPath({ taskId: task.id });
    for (const view of viewManager.views.values()) {
      const viewPath = fileManager.getViewPath({ id: view.id });
      const shouldAppear = shouldViewIncludeTask({ view, taskTags: task.tags });

      const problems: DisconnectedTaskViewPairProblem[] = [];
      const taskInView = getTaskFromView({ view, taskId: task.id });

      if (taskInView === undefined) {
        if (shouldAppear) {
          problems.push(DisconnectedTaskViewPairProblem.expectedTaskInViewButNotFound);
        } else {
          // TODO: task does not appear, and it should not appear according to tags - all good
        }
      } else {
        if (shouldAppear) {
          if (task.title !== taskInView.title) {
            problems.push(DisconnectedTaskViewPairProblem.taskTitleMismatch);
          }
          if (task.completed !== taskInView.completed) {
            problems.push(DisconnectedTaskViewPairProblem.taskCompletionStatusMissmatch);
          }
        } else {
          problems.push(DisconnectedTaskViewPairProblem.didNotExpectedTaskInViewButFound);
        }
      }

      if (problems.length > 0) {
        disconnectedTaskViewPair.push({ task: taskPath, view: viewPath, problems });
      }
    }
  }

  return new WipmanDirHealthReport({ disconnectedTaskViewPair });

}