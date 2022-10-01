import { Observable, Subject } from 'rxjs';
import { Path } from '../../io';
import log from '../../logs';
import { METADATA_DELIMITER, VIEWS_DIR_NAME } from './../config';
import { Task, TaskId, View, ViewContentLine, ViewId } from './../model';
import { TaskAdded, TaskDeleted, TaskManager, TaskUpdated, inferTaskPathFromTaskId } from './../tasks';
import { TaskAddedToView, TaskRemovedFromView, TaskUpdatedInlineInView, ViewAdded, ViewManager, ViewTagsUpdated } from './../views';
import { readTaskFile, serializeTask } from './taskFiles';
import { parseViewContentLine, readViewFile, readViewFileMetadata, serializeView, serializeViewContentLine, writeViewFile } from './viewFiles';

const EMPTY_LINE = "";
const VIEW_FILE_EXTENSION = "view";
export const BACKLOG_FILENAME = `backlog.${VIEW_FILE_EXTENSION}`;

interface WipmanDirectory {
  views: Path[];
  tasks: Path[];
}

function scanTasksDirectory(dir: Path): Path[] {
  let result: Path[] = [];

  for (const task of dir.walk()) {
    result.push(task);
  }

  return result;
}

export function scanRootDirectory(path: Path): WipmanDirectory {
  if (path.exists() === false) {
    new Error(`Aborting directory scan, the provided root path does not exist: ${path}`)
  }

  log.debug(`Scanning ${path}`)
  let viewFiles: Path[] = [];
  let taskFiles: Path[] = [];

  // TODO: surely this can be done with generators in a much more elegant way
  for (const child of path.walk()) {

    // Assumption: the root directory must only not contain files, only directories
    // TODO: the above is not true, there will be a buffer-file to queue file changes to
    //       push to the remote server. So you will need to exclude those files, perhaps
    //       you can save it in `.vscode/` folder to be less visible? it starts with a
    //       `.` anyway, so you can easily skip it as well - thing about it
    switch (child.name()) {

      case VIEWS_DIR_NAME:
        for (const view of child.walk()) {
          viewFiles.push(view);
          // log.debug(`View found: ${view}`)
        }
        break;

      default:
        for (const task of scanTasksDirectory(child)) {
          taskFiles.push(task);
          // log.debug(`Task found: ${task}`);
        }
    }

  }

  log.info(`${viewFiles.length} views found`)
  log.info(`${taskFiles.length} tasks found`)

  return { views: viewFiles, tasks: taskFiles };
}

export enum IsWipmanDirectoryOutcome {
  doesNotExist = 'does-not-exist',
  isFile = 'file',
  isEmptyDirectory = 'empty-dir',
  isNotWipmanDir = 'is-not-wipman',
  isWipmanDir = 'is-wipman',
}

export function isWipmanDirectory({ path }: { path: Path }): IsWipmanDirectoryOutcome {
  log.debug(`isWipmanDirectory::path:`, path.toString());
  if (path.exists() === false) {
    return IsWipmanDirectoryOutcome.doesNotExist;
  }

  if (path.isFile()) {
    return IsWipmanDirectoryOutcome.isFile;
  }

  if (path.isEmpty()) {
    return IsWipmanDirectoryOutcome.isEmptyDirectory;
  }

  const backlog = path.join(`views/${BACKLOG_FILENAME}`);
  log.debug(`isWipmanDirectory::backlog:`, backlog.toString());
  if (backlog.exists() === false) {
    return IsWipmanDirectoryOutcome.isNotWipmanDir;
  }

  try {
    readViewFile(backlog);
  } catch (error) {
    return IsWipmanDirectoryOutcome.isNotWipmanDir;
  }

  return IsWipmanDirectoryOutcome.isWipmanDir;
}

interface Props {
  root: Path;
  taskManager: TaskManager;
  viewManager: ViewManager;
}
export function indexFilesInWIpmanDirectory({ root, taskManager, viewManager }: Props): void {
  // TODO: read backend credentials from dotfiles and initialize DynamoDB client
  // TODO: fetch tasks from backend
  // TODO: run this function on startup, to index everything automatically
  //       needs a way of identifying if the current project is a wip-like task project
  //       probably best done using the workspace config and boolean toggle "isWipmanRepo"
  //       or similar
  try {  // TODO: use Result instead of try catching everywhere :(
    log.debug(`initialize::indexFilesInWIpmanDirectory: scanning ${root.toString()}`)
    const wipDirectory = scanRootDirectory(root);
    log.debug(`initialize::indexFilesInWIpmanDirectory: scan completed`)

    const tasks = wipDirectory.tasks.map(readTaskFile);
    // log.debug(`initialize::indexFilesInWIpmanDirectory 3`)
    // TODO: there is a bug here, investigate what is going on
    const views = wipDirectory.views.map(path => {
      const [view, _] = readViewFile(path);
      return view;
    });
    log.debug('tasks:', tasks)
    log.debug('views:', views)

    log.debug(`initialize::indexFilesInWIpmanDirectory: loading tasks into TaskManager`)
    taskManager.bulkLoad({ tasks, publish: false })
    log.debug(`initialize::indexFilesInWIpmanDirectory: tasks loaded into TaskManager`)
    log.debug(`initialize::indexFilesInWIpmanDirectory: loading views into ViewManager`)
    viewManager.bulkLoad({ views, publish: false })
    log.debug(`initialize::indexFilesInWIpmanDirectory: view loaded into ViewManager`)
  } catch (error) {
    log.error(error);
    return
  }

  log.info('load_new_extension___TODO_RENAME did run to completion')
}

export enum FileType {
  task = 'task',
  view = 'view',
}

export class FileAdded {
  constructor(
    public readonly type: FileType,
    public readonly path: Path,
  ) { }
}

export class FileUpdated {
  constructor(
    public readonly type: FileType,
    public readonly path: Path,
  ) { }
}

export class FileDeleted { // TODO: how is this generated?
  constructor(
    public readonly type: FileType,
    public readonly path: Path,
  ) { }
}

export type FileChange = FileAdded | FileUpdated | FileDeleted;

interface FileManagerProps {
  taskManager: TaskManager;
  viewManager: ViewManager;
  root: Path;
}

export class FileManager {
  public root: Path;
  public changes$: Observable<FileChange>;
  public taskPaths: Map<TaskId, Path>;
  public viewPaths: Map<ViewId, Path>;

  private taskManager: TaskManager;
  private viewManager: ViewManager;
  private changesSubject: Subject<FileChange>;

  constructor({ root, taskManager, viewManager }: FileManagerProps) {
    this.root = root;
    this.taskPaths = new Map<TaskId, Path>();
    this.viewPaths = new Map<ViewId, Path>();
    this.taskManager = taskManager;
    this.viewManager = viewManager;

    this.changesSubject = new Subject<FileChange>();
    this.changes$ = this.changesSubject.asObservable();

    // For logging purposes
    this.changes$.subscribe(change => log.debug(`FileManager.changes$`, change))

    // TODO: perhaps callback in subscription can be moved into a separate method for readability?
    this.taskManager.changes$.subscribe(change => {
      log.debug(`FileManager.taskManager.changes$:`, change);
      if (change === null) {
        return
      } else if (change instanceof TaskAdded) {
        return this.handleTaskAdded(change);
      } else if (change instanceof TaskUpdated) {
        return this.handleTaskUpdated(change);
      } else if (change instanceof TaskDeleted) {
        return this.handleTaskDeleted(change);
      } else {
        throw new Error(`Unsupported change: ${JSON.stringify(change)}`)
      }
    });

    this.viewManager.changes$.subscribe(change => {
      log.debug(`FileManager.viewManager.changes$:`, change);
      if (change === null) {
        return
      } else if (change instanceof ViewAdded) {
        return this.handleViewAdded(change);
      } else if (change instanceof TaskUpdatedInlineInView) {
        return this.handleTaskUpdatedInlineInView(change);
      } else if (change instanceof TaskAddedToView) {
        return this.handleTaskAddedToView(change);
      } else if (change instanceof TaskRemovedFromView) {
        return this.handleTaskRemovedFromView(change);
      } else if (change instanceof ViewTagsUpdated) {
        return this.handleViewTagsUpdated(change);
      } else {
        throw new Error(`Unsupported change: ${JSON.stringify(change)}`)
      }
    });
  }

  public index(): void {
    const wipDirectory = scanRootDirectory(this.root);

    const tasks = wipDirectory.tasks.map(path => {
      const task = readTaskFile(path);
      return { task, path };
    });

    const views = wipDirectory.views.map(path => {
      const view = readViewFileMetadata(path);
      return { view, path };
    });

    // Wait for everything above to be scanned without errors, and then update index to
    // avoid having errors half-way through the indexing

    const newTaskPaths = new Map<TaskId, Path>();
    tasks.forEach(({ task, path }) => newTaskPaths.set(task.id, path));

    const newViewPaths = new Map<ViewId, Path>();
    views.forEach(({ view, path }) => newViewPaths.set(view.id, path));

    this.taskPaths = newTaskPaths;
    this.viewPaths = newViewPaths;
  }

  public getTaskPath({ taskId }: { taskId: TaskId }): Path {
    const path = this.taskPaths.get(taskId)
    if (path === undefined) {
      throw new Error(`Expected to find task ${taskId} in FileManager, but none found`);
    }
    return path;
  }

  public getViewPath({ id }: { id: ViewId }): Path {
    const path = this.viewPaths.get(id);
    if (path === undefined) {
      throw new Error(`Expected to find view ${id} in FileManager, but none found`);
    }
    return path;
  }

  private handleTaskAdded({ id }: TaskAdded): void {
    const maybeTask = this.taskManager.getTask(id);
    if (maybeTask === undefined) {
      throw new Error(`Expected to find task ${id} in TaskManager, but none found`);
    }
    const task = maybeTask;

    const content = serializeTask(task);

    const relativePath = inferTaskPathFromTaskId(id);
    const path = this.root.join(relativePath);
    path.writeText(content);

    this.taskPaths.set(id, path);

    this.changesSubject.next(new FileAdded(FileType.task, path));
  }

  private handleTaskUpdated({ id }: TaskUpdated): void {
    const task = this.taskManager.getTask(id);
    if (task === undefined) {
      throw new Error(`Expected to find task ${id} in TaskManager, but none found`);
    }
    const content = serializeTask(task);

    const path = this.getTaskPath({ taskId: id });
    path.writeText(content);

    this.changesSubject.next(new FileUpdated(FileType.task, path));
  }

  private handleTaskDeleted({ id }: TaskDeleted): void {
    log.debug(`FileManager.handleTaskDeleted::id`, id);
    const path = this.getTaskPath({ taskId: id });

    path.delete();

    if (path.parent().isEmpty()) {
      path.parent().delete();
    }

    this.changesSubject.next(new FileDeleted(FileType.task, path));
  }

  private handleViewAdded({ id }: ViewAdded): void {
    log.info(`FileManager.addView::viewId`, id)
    const view = this.viewManager.getView(id);
    if (view === undefined) {
      throw new Error(`Expected to find view ${id} in ViewManager, but none found`);
    }

    log.info(`FileManager.addView::view`, view)

    // No tags means all tasks will appear here - like the backlog
    let lines: ViewContentLine[] = [...this.taskManager.tasks.values()]
      .map(task => ({ completed: task.completed, title: task.title, id: task.id }));

    view.content = lines

    // TODO: is there already elsewhere any logic to generate the view file path?
    const path = this.root.join(`${VIEWS_DIR_NAME}`).join(`${view.title}.view`);
    writeViewFile({ path, view });

    this.viewPaths.set(id, path);

    this.changesSubject.next(new FileAdded(FileType.view, path));
  }

  private handleTaskUpdatedInlineInView(change: TaskUpdatedInlineInView): void {
    log.debug(`FileManager.updateTaskTitleInView::change:`, change);
    const { viewId, taskId, taskTitle, taskStatus } = change;

    const path = this.viewPaths.get(viewId);
    if (path === undefined) {
      log.error(`No path found for view ${viewId} in index - try reindexing perhaps?`);
      throw new Error(`No path found for view ${viewId} in index - try reindexing perhaps?`)
    }

    log.debug(`FileManager.updateTaskTitleInView: view path=${path}`)

    // TODO: potential optimization: use a generator to avoid keeping so many copies of
    // the same data in memory
    const lines = (path.readText()).split('\n');
    const updatedLines: string[] = [];
    let delimiterFound = false;
    for (const line of lines) {
      if (delimiterFound === false) {
        if (line === METADATA_DELIMITER) {
          delimiterFound = true;
        }
        updatedLines.push(line);
        continue;
      }

      if (line === "") {
        updatedLines.push(line);
        continue
      }

      const current: ViewContentLine = parseViewContentLine(line);
      if (current.id !== taskId) {
        updatedLines.push(line);
        continue
      }

      const updated: ViewContentLine = { ...current };
      if (taskTitle !== undefined) updated.title = taskTitle;
      if (taskStatus !== undefined) updated.completed = taskStatus;

      const updatedLine = serializeViewContentLine(updated);
      updatedLines.push(updatedLine);
    }

    // TODO: updated date if the file content has changed -- it's done ine handleTaskAddedToView and handleTaskRemovedFromView and handleViewTagsUpdated --- create a method to reuse it in all three cases
    // // Update the 'update' metadata
    // const updatedTime = path.lastUpdated();
    // if (current.updated !== updatedTime) {
    //   updated.updated = updatedTime;
    // }

    const updatedContent = updatedLines.join('\n');
    log.info(`FileManager.handleTaskTitleUpdatedInView::updatedContent\n`, updatedContent)
    path.writeText(updatedContent);

    this.changesSubject.next(new FileUpdated(FileType.task, path));
  }

  private handleTaskAddedToView({ viewId, taskId }: TaskAddedToView): void {
    const viewPath = this.viewPaths.get(viewId);
    if (viewPath === undefined) {
      log.error(`No path found for view ${viewId} in index - try reindexing perhaps?`);
      throw new Error(`No path found for view ${viewId} in index - try reindexing perhaps?`)
    }

    log.debug(`FileManager.addTaskToView: view path=${viewPath}`);

    const task = this.taskManager.getTask(taskId);
    if (task === undefined) {
      throw new Error(`Expected to find task ${taskId} in TaskManager, but none found`);
    }

    // If the Task was added inline in the View, this new Task will need get an ID and a
    // link assigned in the View
    const updatedLine: ViewContentLine = { completed: task.completed, title: task.title, id: taskId };
    const existingRawLine = serializeViewContentLine({ ...updatedLine, id: undefined });
    const updatedRawLine = serializeViewContentLine(updatedLine);

    let taskAddedInlineToView = false;
    const updatedLines = viewPath
      .readText()
      .split("\n")
      .filter(line => line !== EMPTY_LINE)
      .map(line => {
        if (line.startsWith(existingRawLine)) {
          taskAddedInlineToView = true;
          return updatedRawLine;
        } else {
          return line;
        }
      });

    if (taskAddedInlineToView) {
      log.debug(`FileManager.handleTaskAddedToView: Task added inline in View`)
    } else {
      log.debug(`FileManager.handleTaskAddedToView: Task added either via command, or by editing task tags in Task file`)
      // If the Task was not added inline in the View, then append new Task to the end of
      // the view file
      const newLine: ViewContentLine = { completed: task.completed, title: task.title, id: taskId };
      updatedLines.push(serializeViewContentLine(newLine));
    }

    const updatedContent = [...updatedLines, EMPTY_LINE].join("\n");
    log.debug(`FileManager.handleTaskAddedToView::updatedContent`, updatedContent)
    viewPath.writeText(updatedContent);

    // OPTIMIZATION: you probably don't need to read the file again, because you have
    // the latest file content in-memory because you have just updated it yourself a few
    // lines above
    // const [updatedView] = readViewFile(viewPath);
    // this.viewManager.updateView(updatedView, { publish: false })
    this.changesSubject.next(new FileUpdated(FileType.view, viewPath));
  }

  private handleTaskRemovedFromView({ viewId, taskId }: TaskRemovedFromView): void {
    const viewPath = this.viewPaths.get(viewId);
    if (viewPath === undefined) {
      log.error(`No path found for view ${viewId} in index - try reindexing perhaps?`);
      throw new Error(`No path found for view ${viewId} in index - try reindexing perhaps?`)
    }

    log.debug(`FileManager.removeTaskFromView: view path=${viewPath}`)

    // Remove Task from View file
    const lines = viewPath.readText().split('\n');
    const updatedLines: string[] = [];
    let delimiterFound = false;
    for (const line of lines) {
      if (delimiterFound === false) {
        if (line === METADATA_DELIMITER) {
          delimiterFound = true;
        }
        updatedLines.push(line);
        continue;
      }

      if (line === "") {
        updatedLines.push(line);
        continue
      }

      const current: ViewContentLine = parseViewContentLine(line);
      if (current.id === taskId) {
        continue  // remove Task from View
      }

      updatedLines.push(line);
    }

    const updatedContent = updatedLines.join('\n');
    viewPath.writeText(updatedContent);

    // OPTIMIZATION: you probably don't need to read the file again, because you have
    // the latest file content in-memory because you have just updated it yourself a few
    // lines above
    // const [updatedView] = readViewFile(viewPath);
    // this.viewManager.updateView(updatedView, { publish: false })
    this.changesSubject.next(new FileUpdated(FileType.view, viewPath));
  }

  private handleViewTagsUpdated({ viewId }: ViewTagsUpdated): void {
    log.debug(`FileManager.handleViewTagsUpdated::viewId`, viewId)

    const view = this.viewManager.getView(viewId);
    if (view === undefined) {
      throw new Error(`No view found for view ${viewId} in ViewManager`)
    }

    const viewPath = this.viewPaths.get(viewId);
    if (viewPath === undefined) {
      throw new Error(`No path found for view ${viewId} in index - try reindexing perhaps?`)
    }

    // Gather all Tasks that must be shown in the View file
    let tasks: IterableIterator<Task>;
    if (this.viewManager.isBacklog(view)) {
      tasks = this.taskManager.tasks.values()
    } else {
      tasks = this.taskManager.getTasksByTags(view.tags).values()
    }

    const updatedContent = [...tasks]
      .map((task: Task): ViewContentLine => ({ completed: task.completed, title: task.title, id: task.id }));

    // TODO: think about how to keep the order in the file, specially if some tasks were already in the view
    const updated: View = { ...view, content: updatedContent };

    const fileContent = serializeView(updated)
    viewPath.writeText(fileContent);

    // OPTIMIZATION: you probably don't need to read the file again, because you have
    // the latest file content in-memory because you have just updated it yourself a few
    // lines above
    // const [updatedView] = readViewFile(viewPath);
    // this.viewManager.updateView(updatedView, { publish: false })
    this.changesSubject.next(new FileUpdated(FileType.view, viewPath));
  }
}
