import { Observable, Subject } from "rxjs";
import { intersect, setsAreEqual } from "../commands/common";
import { unreachable } from "../devex/errors";
import { Path } from "../io";
import log from "../logs";
import { now } from "./dates";
import { generateHash } from "./hash";
import { Hash, MarkdownString, Tag, Task, TaskId, TaskTitle } from "./model";

type Tasks = Map<TaskId, Task>;
type TasksIndexedByTag = Map<Tag, Set<TaskId>>;

interface TaskManagerProps {
  tasks?: Map<TaskId, Task>;
}
export class TaskManager {
  public tasks: Tasks;
  public changes$: Observable<TaskChange>;
  private tasksPerTag: TasksIndexedByTag;
  private changesSubject: Subject<TaskChange>;

  constructor({ tasks }: TaskManagerProps) {
    this.tasks = tasks || new Map<TaskId, Task>();

    this.tasksPerTag = new Map<Tag, Set<TaskId>>();
    this.tasks.forEach(task => this.addTaskToTagIndexes(task.id, task.tags))

    this.changesSubject = new Subject<TaskChange>();
    this.changes$ = this.changesSubject.asObservable();

    // For logging purposes
    this.changes$.subscribe(change => log.debug(`TaskManager.changes$:`, change))
  }

  public addTask({ title, completed, tags }: { title: TaskTitle, completed?: boolean, tags?: Set<Tag> }): Task {
    log.debug(`TaskManager.addTask::title='${title}'`);

    const id: Hash = generateHash();
    log.debug(`TaskManager.addTask::id='${id}'`);
    // TODO: make sure that if the ID already exists, you create a new one
    // probably best to have: function generateUniqueTaskId(hashGenerator: Function, existingId: Set<TaskId>): TaskId { }

    const task: Task = {
      id,
      title,
      content: "",
      created: now(),
      updated: now(),
      tags: tags || new Set<Tag>(),
      blockedBy: new Set<TaskId>(),
      blocks: new Set<TaskId>(),
      completed: completed === undefined ? false : completed,
    };

    this.tasks.set(id, task);

    this.addTaskToTagIndexes(task.id, task.tags);

    this.changesSubject.next(new TaskAdded(task.id));

    return task;
  }

  public updateTask(task: Task): void {
    log.debug(`TaskManager.updateTask::task`, task);

    const oldTask = this.getTask(task.id);
    if (oldTask === undefined) {
      throw unreachable(`BUG - attempted to update a Task ${task.id} that is not in TaskManager`);
    }

    const diff = diffTasks({ before: oldTask, after: task });
    log.debug(`TaskManager.updateTask::diff:`, diff);
    if (diff.hasChanges === false) {
      log.info(`TaskManager.updateTask: nothing has changed, no changes will be emitted`)
      return;
    }

    const tagsChanged = diff.updatedTags !== undefined;
    if (tagsChanged) {
      const newTags = diff.updatedTags;
      log.debug(`TaskManager.updateTask: tags changed from `, oldTask.tags, ` to `, newTags);
      this.removeTaskFromTagIndex(oldTask.id, oldTask.tags);
      this.addTaskToTagIndexes(task.id, newTags)
    }

    this.tasks.set(task.id, task);

    /**
     * TODO: reconsider what to do in this case. A way to reach this scenario: save 
     * a task file without changing anything. The only thing that will change is the
     * updated timestamp.
     * 
     * Also, consider how to indicate all the possible changes downstream in an
     * scalable manner. Currently you only consider that two things can change:
     * title and tags. That gives 2^2 = 4 possible combinations. But as you add more
     * things that can change, the possible combinations explode exponentially and
     * the current `switch` statement is not an optimal solution anymore.
     */

    const update = new TaskUpdated({
      id: task.id,
      title: diff.updatedTitle,
      tags: diff.updatedTags,
      completed: diff.updatedCompleted,
    });

    this.changesSubject.next(update);
  }

  public getTask(id: TaskId): Task | undefined {
    // TODO: you probably want to use Result --> https://github.com/badrap/result
    if (this.tasks.has(id) === false) return undefined;

    return this.tasks.get(id);
  }

  public removeTask(id: TaskId): void {
    // TODO: you probably want to use Result --> https://github.com/badrap/result
    const task = this.getTask(id);
    if (task === undefined) return;

    this.removeTaskFromTagIndex(task.id, task.tags);
    this.tasks.delete(task.id);

    this.changesSubject.next(new TaskDeleted(task.id));
  }

  public getTasksByTag(tag: Tag): Set<Task> {
    // TODO: you probably want to use Result --> https://github.com/badrap/result
    const taskIds = this.tasksPerTag.get(tag);
    if (taskIds === undefined) return new Set();

    const tasks: Task[] = [...taskIds]
      .map(id => this.getTask(id))
      .filter(task => task) as Task[];

    return new Set(tasks);
  }

  /**
   * Return all Tasks that contain every Tag passed in
   */
  public getTasksByTags(tags: Set<Tag>): Set<Task> {
    log.debug(`TaskManager.getTasksByTags::tags`, tags)
    // TODO: you probably want to use Result --> https://github.com/badrap/result

    const subsetsToIntersect: Set<TaskId>[] = []

    for (const tag of tags) {
      const taskIds = this.tasksPerTag.get(tag);
      if (taskIds === undefined) continue;
      subsetsToIntersect.push(taskIds);
    }

    // Find the intersection between each subset
    let taskIds = new Set<TaskId>();
    log.debug(`TaskManager.getTasksByTags::subsetsToIntersect`, subsetsToIntersect)
    if (subsetsToIntersect.length > 0) {
      taskIds = subsetsToIntersect.reduce((previous, current) => {
        return intersect(previous, current);
      });
    }

    const tasks = new Set<Task>();
    for (const id of taskIds) {
      const task = this.getTask(id) as Task;
      tasks.add(task);
    }

    return tasks;
  }

  /**
   * Load multiple existing tasks that already contain a task ID. This method overwrites
   * any existing tasks if the task ID matches.
   */
  public bulkLoad(p: { tasks: Task[]; publish: boolean }): void {
    const { tasks, publish = false } = p;

    tasks.forEach((task) => {
      this.tasks.set(task.id, task);
      this.addTaskToTagIndexes(task.id, task.tags);
      if (publish) {
        this.changesSubject.next(new TaskAdded(task.id));
      }
    });
  }

  public _snapshot(): { tasksPerTag: TasksIndexedByTag } {
    /**
     * This method is only for debugging purposes, do not use it in production.
     */
    return { tasksPerTag: this.tasksPerTag };
  }

  private addTaskToTagIndexes(id: TaskId, tags: Set<Tag>): void {
    for (const tag of tags) {
      const tasks = this.tasksPerTag.get(tag) || new Set();
      tasks.add(id);
      this.tasksPerTag.set(tag, tasks);
    }
  }

  private removeTaskFromTagIndex(id: TaskId, tags: Set<Tag>): void {
    for (const tag of tags) {
      const tasks = this.tasksPerTag.get(tag);
      if (tasks === undefined) return;

      tasks.delete(id);

      if (tasks.size === 0) {
        // Clean up empty set
        this.tasksPerTag.delete(tag);
      } else {
        // TODO: is this needed? or is the reference maintained?
        this.tasksPerTag.set(tag, tasks);
      }
    }
  }

  private taskChanged(updated: Task): boolean {
    const existing = this.getTask(updated.id);

    if (existing === undefined) return false;

    const changed =
      existing.title !== updated.title ||
      existing.content !== updated.content ||
      existing.created !== updated.created ||
      existing.updated !== updated.updated ||
      existing.tags !== updated.tags ||
      existing.blockedBy !== updated.blockedBy ||
      existing.blocks !== updated.blocks;

    return changed;
  }

}

export class TaskAdded {
  constructor(public readonly id: TaskId) { }
}

export class TaskDeleted {
  constructor(
    public readonly id: TaskId,
  ) { }
}

interface TaskUpdatedArgs {
  id: TaskId;
  title?: TaskTitle;
  tags?: Set<Tag>;
  completed?: boolean;
}
export class TaskUpdated {
  public readonly id: TaskId;
  public readonly title?: TaskTitle;
  public readonly tags?: Set<Tag>;
  public readonly completed?: boolean;
  constructor({ id, title, tags, completed }: TaskUpdatedArgs) {
    this.id = id;
    this.title = title;
    this.tags = tags;
    this.completed = completed;
  }
}

export type TaskChange = TaskAdded | TaskUpdated | TaskDeleted;

export function inferTaskPathFromTaskId(id: TaskId): Path {
  const dir = id.slice(0, 2);
  const filename = id.slice(2);

  return (new Path(dir)).join(filename);
}

interface TaskDiffArgs {
  updatedTitle?: TaskTitle;
  updatedTags?: Set<Tag>;
  updatedBlockedBy?: Set<TaskId>;
  updatedBlocks?: Set<TaskId>;
  updatedCompleted?: boolean;
  updatedContent?: MarkdownString;
}
class TaskDiff {
  public readonly updatedTitle?: TaskTitle;
  public readonly updatedTags?: Set<Tag>;
  public readonly updatedBlockedBy?: Set<TaskId>;
  public readonly updatedBlocks?: Set<TaskId>;
  public readonly updatedCompleted?: boolean;
  public readonly updatedContent?: MarkdownString;
  public readonly hasChanges: boolean;
  constructor({
    updatedTitle,
    updatedTags,
    updatedBlockedBy,
    updatedBlocks,
    updatedCompleted,
    updatedContent,
  }: TaskDiffArgs) {

    this.updatedTitle = updatedTitle;
    this.updatedTags = updatedTags;
    this.updatedBlockedBy = updatedBlockedBy;
    this.updatedBlocks = updatedBlocks;
    this.updatedCompleted = updatedCompleted;
    this.updatedContent = updatedContent;

    this.hasChanges = (
      this.updatedTitle !== undefined
      || this.updatedTags !== undefined
      || this.updatedBlockedBy !== undefined
      || this.updatedBlocks !== undefined
      || this.updatedCompleted !== undefined
      || this.updatedContent !== undefined
    )
  }
}

/**
 * Returns the Task properties that got updated
 */
export function diffTasks({ before, after }: { before: Task, after: Task }): TaskDiff {
  log.debug(`before:`, before);
  log.debug(`after:`, after);

  if (before.id !== after.id) {
    throw unreachable(`tasks with different IDs cannot be compared: ${before.id} & ${after.id}`);
  }

  if (before.created.getTime() !== after.created.getTime()) {
    throw unreachable(
      `Task ${before.id} creation must never change, but changed from` +
      ` ${before.created} to ${after.created}`
    );
  }

  let updatedTitle: TaskTitle | undefined = undefined;
  let updatedTags: Set<Tag> | undefined = undefined;
  let updatedBlockedBy: Set<TaskId> | undefined = undefined;
  let updatedBlocks: Set<TaskId> | undefined = undefined;
  let updatedCompleted: boolean | undefined = undefined;
  let updatedContent: MarkdownString | undefined = undefined;

  if (before.title !== after.title) {
    updatedTitle = after.title;
  }

  if (setsAreEqual(before.tags, after.tags) === false) {
    updatedTags = after.tags;
  }

  if (setsAreEqual(before.blockedBy, after.blockedBy) === false) {
    updatedBlockedBy = after.blockedBy;
  }

  if (setsAreEqual(before.blocks, after.blocks) === false) {
    updatedBlocks = after.blocks;
  }

  if (before.completed !== after.completed) {
    updatedCompleted = after.completed;
  }

  if (before.content !== after.content) {
    updatedContent = after.content;
  }

  return new TaskDiff({
    updatedTitle,
    updatedTags,
    updatedBlockedBy,
    updatedBlocks,
    updatedCompleted,
    updatedContent,
  });
}
