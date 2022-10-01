import { Observable, Subject } from "rxjs";
import { setsAreEqual } from "../commands/common";
import { unreachable } from "../devex/errors";
import { Path } from "../io";
import log from "../logs";
import { now } from "./dates";
import { generateHash } from "./hash";
import { Hash, Tag, TaskCompletionStatus, TaskId, TaskTitle, View, ViewContentLine, ViewId } from "./model";
import { TaskAdded, TaskDeleted, TaskManager, TaskUpdated } from "./tasks";

export const BACKLOG_ID: ViewId = "0000000000";

interface ViewManagerProps {
  taskManager: TaskManager;
  views?: Map<ViewId, View>;
}
export class ViewManager {
  public views: Map<ViewId, View>;
  public changes$: Observable<ViewChanges>;

  private viewsByTask: Map<TaskId, Set<ViewId>>;
  private taskManager: TaskManager;
  private changesSubject: Subject<ViewChanges>;

  constructor({ taskManager, views }: ViewManagerProps) {
    this.taskManager = taskManager;
    this.views = views || new Map<ViewId, View>();

    this.taskManager.changes$.subscribe((change): void => {
      log.debug(`ViewManager.taskManager.changes$:`, change)
      if (change === null) {
        return
      } else if (change instanceof TaskAdded) {
        return this.handleTaskAdded(change);
      } else if (change instanceof TaskUpdated) {
        return this.handleTaskUpdated(change);
      } else if (change instanceof TaskDeleted) {
        return this.handleTaskDeleted(change);
      } else {
        log.error(`Unsupported change: ${change}`);
        throw new Error(`Unsupported change: ${change}`)
      }
    });

    this.viewsByTask = new Map<TaskId, Set<ViewId>>();
    this.changesSubject = new Subject<ViewChanges>();
    this.changes$ = this.changesSubject.asObservable();

    // For logging purposes
    this.changes$.subscribe(change => log.debug(`ViewManager.changes$:`, change))
  }

  public addView({ title }: { title: string }): View {
    const id: Hash = generateHash();
    // TODO: make sure that if the ID already exists, you create a new one
    // probably best to have: function generateUniqueTaskId(hashGenerator: Function, existingId: Set<TaskId>): TaskId { }

    const view: View = {
      id,
      title: title === "untitled" ? `undefined-${id}` : title,
      created: now(),
      updated: now(),
      tags: new Set<Tag>(),
      content: [],
    };

    this.views.set(id, view);

    this.addViewToIndex({ view });

    const addition = new ViewAdded(view.id);
    this.changesSubject.next(addition);

    return view;
  }

  private handleTaskAdded(change: TaskAdded): void {
    log.debug(`ViewManager.handleTaskAdded::change`, change);
    const taskId = change.id;
    const task = this.taskManager.getTask(taskId);
    if (task === undefined) {
      throw unreachable(`expected to find Task ${taskId} in TaskManager but didn't`)
    }

    // If the task has no tags, it has been added inline in the backlog, or via command

    for (const [viewId, view] of this.views) {
      const viewShouldIncludeTask = shouldViewIncludeTask({ view, taskTags: task.tags });
      if (viewShouldIncludeTask) {
        log.debug(`ViewManager.handleTaskAdded: Task '${taskId}' must appear in '${viewId}' View`);
        this.updateIndexToAddTaskToView({ viewId, taskId });

        const updated: View = {
          ...view,
          content: [
            ...view.content,
            {
              id: taskId,
              title: task.title,
              completed: task.completed,
            }
          ],
        };
        this.views.set(view.id, updated);
        log.debug(`ViewManager.handleTaskAdded: Task '${taskId}' appended to View '${viewId}' content`);

        this.changesSubject.next(new TaskAddedToView(viewId, taskId));
      } else {
        log.debug(`ViewManager.handleTaskAdded: Task '${taskId}' must not appear in '${viewId}' View`);
      }
    }
  }

  private handleTaskUpdated(change: TaskUpdated): void {
    /**
     * Reasons why this method can be triggered:
     *   - User changed Task title in Task file
     *   - User changed Task title in one View file - other views might need to update
     * 
     *   - User changed Task tags in Task file
     */
    log.debug(`ViewManager.handleTaskUpdated::change:`, change);
    const { id: taskId, title: updatedTitle, tags, completed } = change;

    const titleChanged = updatedTitle !== undefined;
    log.debug(`ViewManager.handleTaskUpdated::titleChanged:`, titleChanged);
    const statusChanged = completed !== undefined;
    log.debug(`ViewManager.handleTaskUpdated::statusChanged:`, statusChanged);
    const tagsChanged = tags !== undefined;
    log.debug(`ViewManager.handleTaskUpdated::tagsChanged:`, tagsChanged);

    const task = this.taskManager.getTask(taskId);
    if (task === undefined) throw unreachable();

    const reviewedViews = new Set<ViewId>();

    log.debug(`ViewManager.handleTaskUpdated: retrieveing views that already showed Task ${taskId}`);
    this.getViewsByTask(taskId)  // views that had the task before the change
      .forEach(view => {
        log.debug(`ViewManager.handleTaskUpdated: View ${view.id} already showed Task ${taskId}`);
        reviewedViews.add(view.id);

        const inlineTask = getContentLineFromViewByTaskId({ view, taskId });
        log.debug(`ViewManager.handleTaskUpdated:inlineTask`, inlineTask);
        if (inlineTask === undefined) {
          throw unreachable(`view ${view.id} was expected to have task ${taskId} in its content, but it doesn't`)
        }

        // per each view, find out which changes must be applied to each view (they
        // might be different, e.g.: user edits Task title inline in one view, but the
        // others still have the old title)
        const titleNeedsUpdating = titleChanged && inlineTask.title !== updatedTitle;
        log.debug(`ViewManager.handleTaskUpdated::titleNeedsUpdating:`, titleNeedsUpdating);
        const statusNeedsUpdating = statusChanged && inlineTask.completed !== completed;
        log.debug(`ViewManager.handleTaskUpdated::statusNeedsUpdating:`, statusNeedsUpdating);

        if (tagsChanged) {
          const newTaskTags = tags; // you could also take them from `task.tags` -- either way is fine
          const viewShouldIncludeTask = shouldViewIncludeTask({ view, taskTags: newTaskTags });
          if (viewShouldIncludeTask) {
            // Scenario: View showed this Task, Task tags changed, and Task should still show in View
            // Action: this logic aims to remove Tasks that should not longer be shown in the View - the title and status change will be handled at a later step - so nothing else to do here
          } else {
            // Scenario: View showed this Task, Task tags changed, and Task must not appear anymore in View
            // Action: remove Task from View
            this.updateIndexToRemoveTaskFromView({ viewId: view.id, taskId });

            const updated: View = {
              ...view,
              content: view.content.filter(line => line.id !== taskId),
            };
            this.views.set(view.id, updated);
            log.debug(`ViewManager.handleTaskUpdated: Task '${taskId}' removed from View '${view.id}' content`);

            this.changesSubject.next(new TaskRemovedFromView(view.id, taskId));
            return; // It's okay to abort update here - the Task will no longer show up in the View, so there is no point in checking if the Task title or status changed
          }

          // Scenario: View showed this Task, and must keep showing it. Now, are Task title and status up to date?
        }
        // Scenario: View showed this Task, and must keep showing it. Now, are Task title and status up to date?
        if (titleNeedsUpdating) this.updateTaskTitleInView({ viewId: view.id, taskId: taskId, title: updatedTitle });
        if (statusNeedsUpdating) this.updateTaskStatusInView({ viewId: view.id, taskId: taskId, status: completed });

        this.changesSubject.next(
          new TaskUpdatedInlineInView({ viewId: view.id, taskId, taskTitle: updatedTitle, taskStatus: completed })
        );

        return;
      });

    // At this point, you've already updated the views that had the task in them. Now
    // the only thing left to do is to check if the rest of the views (the ones that did
    // not have the task) should now have the task

    const allViews = [...this.views.keys()];
    const notUpdatedViews = allViews.filter(viewId => reviewedViews.has(viewId) === false)
    log.debug('ViewManager.handleTaskUpdated: starting to update the rest of the views...')

    for (const viewId of notUpdatedViews) {
      log.debug(`ViewManager.handleTaskUpdated: view=${viewId}`)
      const view = this.getView(viewId);
      if (view === undefined) {
        throw new Error("You should have never reached this point in code -- bug");
      }

      const viewShouldIncludeTask = shouldViewIncludeTask({ view, taskTags: task.tags });
      log.debug(`ViewManager.handleTaskUpdated: viewShouldIncludeTask=${viewShouldIncludeTask}`)
      if (viewShouldIncludeTask === false) {
        // View must not show task, and it does not show it -- move on
        continue;
      }

      this.updateIndexToAddTaskToView({ viewId, taskId });

      const updated: View = {
        ...view,
        content: [
          ...view.content,
          { id: taskId, title: task.title, completed: task.completed },
        ],
      };
      this.views.set(view.id, updated);
      log.debug(`ViewManager.handleTaskUpdated: Task '${taskId}' appended to View '${view.id}' content`);

      this.changesSubject.next(new TaskAddedToView(viewId, taskId));
    }

  }

  private handleTaskDeleted(change: TaskDeleted): void {
    log.info(`ViewManager.handleTaskDeleted::change:`, change)
    const taskId = change.id;

    this.getViewsByTask(taskId)  // views that had the task before the deletion
      .forEach(view => {
        this.updateIndexToRemoveTaskFromView({ viewId: view.id, taskId });

        // Remove task from View.content
        const updated = {
          ...view,
          content: view.content.filter(line => line.id !== taskId),
        };
        this.views.set(view.id, updated);

        // One of these views will not need to change - because the user has already
        // deleted the Task from the View - but the rest of the views will need to be
        // updated, hence it's necessary to propagate this event:
        this.changesSubject.next(new TaskRemovedFromView(view.id, taskId));
      })
  }

  /**
   * Load multiple existing views that already contain a view ID. This method overwrites
   * any existing views if the view ID matches.
   */
  public bulkLoad(p: { views: View[]; publish: boolean }): void {
    const { views, publish = false } = p;

    views.forEach((view) => {
      this.views.set(view.id, view);
    });

    this.indexAllViewsByTask();

    if (publish) {
      this.publishViews();
    }
  }

  public updateView(view: View): void {
    log.debug(`ViewManager.updateView:`, view)
    const previous = this.getView(view.id);
    if (previous === undefined) {
      throw new Error(`Expected to find a View with ID=${view.id} to update, but none found.`)
    }

    // Find out what changed
    const diff = diffViews({ before: previous, after: view });
    log.debug(`ViewManager.updateView::diff:`, diff);
    const { tasksToCreateWithoutId, tasksToUpdate, tasksToDelete } = diff;

    if (diff.hasChanges === false) {
      log.info(`ViewManager.updateView: nothing has changed, no changes will be emitted`)
      return;
    }

    // Apply first the changes that do not have side effects: aka changes in metadata
    const updated: View = {
      ...view,
      content: [...previous.content],
    };

    // Handle tag changes
    const tagsChanged = diff.newViewTags !== undefined;
    log.debug(`ViewManager.updateView::tagsChanged:`, tagsChanged);
    if (tagsChanged) {
      const isBacklog = this.isBacklog(view);
      log.debug(`ViewManager.updateView::isBacklog:`, isBacklog);
      if (isBacklog) {
        throw new Error("WRONG USAGE: backlog view must never have tags")
      } else {
        // rebuild index -- TODO: probably there is a more efficient way of doing this
        this.removeViewFromIndex({ id: view.id });
        this.addViewToIndex({ view });
      }

      // Persist updated View in memory before publishing changes
      this.views.set(updated.id, updated);

      this.changesSubject.next(new ViewTagsUpdated(view.id));
    }

    // Handle tasks that need to be created
    tasksToCreateWithoutId.forEach(line => {
      this.taskManager.addTask({ title: line.title, completed: line.completed, tags: view.tags });
    })

    // Handle tasks that need to be updated
    tasksToUpdate.forEach(line => {
      if (line.id === undefined) {
        throw unreachable("A Task must exist to get its title changed.");
      }

      const { title, id: taskId, completed } = line;
      const previousTask = this.taskManager.getTask(taskId);
      if (previousTask === undefined) {
        throw unreachable(`Expected to find Task ${taskId} in TaskManager, but did not`);
      }
      const updatedTask = { ...previousTask, title, completed };
      this.taskManager.updateTask(updatedTask);
    })

    // Handle tasks that need to be deleted
    tasksToDelete.forEach(line => {
      this.taskManager.removeTask(line.id as TaskId);
    });
  }

  public getView(id: ViewId): View | undefined {
    return this.views.get(id)
  }

  public publishViews(): void {
    // this.viewsSubject.next(this.views);
  }

  public isBacklog(view: View): boolean {
    return view.id === BACKLOG_ID
  }

  public _snapshot(): {
    viewsByTask: Map<TaskId, Set<ViewId>>,
    tasksPerView: Map<ViewId, TaskId[]>,
  } {
    /**
     * This method is only for debugging purposes, do not use it in production.
     */
    const tasksIdsPerView = new Map<ViewId, TaskId[]>();
    for (const [viewId, view] of this.views) {
      const tasks = view.content.map(line => line.id).filter(id => id !== undefined) as TaskId[];
      tasksIdsPerView.set(viewId, tasks);
    }

    return {
      viewsByTask: this.viewsByTask,
      tasksPerView: tasksIdsPerView,
    };
  }

  private indexAllViewsByTask(): void {
    // Update taskId:view[] index  - which is connected by tag
    // TODO: this is a first implementation - it can definitely be optimized

    for (const view of this.views.values()) {
      // Special case: the backlog is a view that has no tags, and that means that it
      // should show every existing task.
      if (view.tags.size === 0) {
        for (const task of this.taskManager.tasks.values()) {
          this.updateIndexToAddTaskToView({ viewId: view.id, taskId: task.id });
        }
        continue
      }

      this.addViewToIndex({ view });
    }
  }

  private getViewsByTask(id: TaskId): View[] {
    const viewIds: ViewId[] = [...this.viewsByTask.get(id) || []];
    return viewIds
      .map(viewId => this.views.get(viewId))
      .filter(viewId => viewId !== undefined) as View[];
  }

  /**
   * Context: a View has been added.
   */
  private addViewToIndex({ view }: { view: View }): void {
    for (const tag of view.tags) {
      const tasks = this.taskManager.getTasksByTag(tag);
      for (const task of tasks) {
        this.updateIndexToAddTaskToView({ viewId: view.id, taskId: task.id });
      }
    }
  }

  private removeViewFromIndex({ id }: { id: ViewId }): void {
    for (const [taskId, viewIds] of this.viewsByTask.entries()) {
      if (viewIds.has(id) === false) continue;
      this.updateIndexToRemoveTaskFromView({ viewId: id, taskId });
    }
  }

  /**
   * Context: a Task must be added to a View - e.g.: task/view tags changed.
   */
  private updateIndexToAddTaskToView({ viewId, taskId }: { viewId: ViewId, taskId: TaskId }): void {
    const currentViews = this.viewsByTask.get(taskId) || new Set<ViewId>();
    this.viewsByTask.set(taskId, new Set<ViewId>([...currentViews, viewId]))
  }

  /**
   * Context: a Task must be removed from a View - e.g.: task/view tags changed.
   */
  private updateIndexToRemoveTaskFromView({ viewId, taskId }: { viewId: ViewId, taskId: TaskId }): void {
    const currentViews = this.viewsByTask.get(taskId);
    if (currentViews === undefined) {
      // There are no views that show this task.
      return;
    }

    currentViews.delete(viewId);

    this.viewsByTask.set(taskId, currentViews);
  }

  /**
   * Update the in-memory View content to show the right Task title, does not have any side effects or event emission.
   */
  private updateTaskTitleInView({ viewId, taskId, title }: { viewId: ViewId, taskId: TaskId, title: TaskTitle }): void {
    log.debug(`ViewManager.updateTaskTitleInView: viewId=${viewId}  taskId=${taskId}  title=${title}`);

    const previous: View = this.getView(viewId) as View;

    const updatedContent = previous
      .content
      .map(line => line.id === taskId
        ? { ...line, title }
        : line
      )

    const updatedView: View = { ...previous, content: updatedContent };

    this.views.set(viewId, updatedView);
  }

  private updateTaskStatusInView({ viewId, taskId, status }: { viewId: ViewId, taskId: TaskId, status: TaskCompletionStatus }): void {
    log.debug(`ViewManager.updateTaskTitleInView: viewId=${viewId}  taskId=${taskId}  status=${status}`);

    const previous: View = this.getView(viewId) as View;

    const updatedContent = previous
      .content
      .map(line => line.id === taskId
        ? { ...line, completed: status }
        : line
      )

    const updatedView: View = { ...previous, content: updatedContent };

    this.views.set(viewId, updatedView);
  }
}


export function shouldViewIncludeTask({ view, taskTags }: { view: View; taskTags: Set<Tag> }): boolean {
  // TODO: this is a first naive approach to filter tasks and create views. It needs
  // to be extended. It's a separate function to make it very testable in anticipation
  // to the fact that this function will probably grow and support abundant use cases.

  if (view.tags.size === 0) {
    // If the view has no tags, then all tasks should appear in it.
    return true;
  }

  return setsAreEqual(view.tags, taskTags);
}

export class ViewAdded {
  constructor(public readonly id: ViewId) { }
}

interface TaskUpdatedInlineInViewArgs {
  viewId: ViewId;
  taskId: TaskId;
  taskTitle?: TaskTitle;
  taskStatus?: TaskCompletionStatus;
}
/**
 * Represents an inline change to a Task that already existed (aka: showed an ID) in the
 * View.
 */
export class TaskUpdatedInlineInView {
  public readonly viewId: ViewId;
  public readonly taskId: TaskId;
  public readonly taskTitle?: TaskTitle;
  public readonly taskStatus?: TaskCompletionStatus;
  constructor({ viewId, taskId, taskTitle, taskStatus }: TaskUpdatedInlineInViewArgs) {
    this.viewId = viewId;
    this.taskId = taskId;
    this.taskTitle = taskTitle;
    this.taskStatus = taskStatus;
  }
}

/**
 * Represents that a user has created a Task inline in a View or via command.
 */
export class TaskAddedToView {
  constructor(
    public readonly viewId: ViewId,
    public readonly taskId: TaskId,
  ) { }
}

export class TaskRemovedFromView {
  constructor(
    public readonly viewId: ViewId,
    public readonly taskId: TaskId,
  ) { }
}

export class ViewTagsUpdated {
  constructor(
    public readonly viewId: ViewId,
  ) { }
}

type ViewChanges = ViewAdded | TaskUpdatedInlineInView | TaskAddedToView | TaskRemovedFromView | ViewTagsUpdated;


export function buildTaskLink(path: Path): string {
  const dir = path.parent();
  const filename = path.name();
  const id = `${dir}${filename}`;
  return `[${id}](../${dir}/${filename})`;
}

export function viewHasTaskId({ view, taskId }: { view: View, taskId: TaskId }): boolean {
  const tasksWithId = view.content.filter(line => line.id === taskId);
  const appearances = tasksWithId.length;
  log.debug(view)
  if (appearances > 1) {
    throw unreachable(
      `BUG - a Task ID should never appear more than once in a View, but ${taskId}` +
      ` appears ${appearances} times`
    );
  }

  return appearances === 1;
}

export function viewHasTaskTitle({ view, title }: { view: View, title: TaskTitle }): boolean {
  const timesTaskTitleAppersInView: number = view
    .content
    .filter(line => line.title === title)
    .length;

  if (timesTaskTitleAppersInView > 1) {
    throw unreachable(
      `the task title '${title}' must only appear once or never, but` +
      ` appeared ${timesTaskTitleAppersInView} times`
    );
  }

  return timesTaskTitleAppersInView === 1;
}

export function taskIsCompletedInView({ view, taskId }: { view: View, taskId: TaskId }): boolean {
  for (const line of view.content) {
    if (line.id === taskId) {
      return line.completed;
    }
  }

  throw unreachable(`expected to find Task ${taskId} in View ${view.id}, but not found`);
}

function getContentLineFromViewByTaskId({ view, taskId }: { view: View, taskId: TaskId }): ViewContentLine | undefined {
  for (const line of view.content) {
    if (line.id === taskId) {
      return line;
    }
  }

  return undefined;
}

interface ViewDiffArgs {
  newViewTags?: Set<Tag>;
  tasksToCreateWithoutId?: ViewContentLine[];
  tasksToCreateWithId?: ViewContentLine[];
  tasksToUpdate?: ViewContentLine[];
  tasksToDelete?: ViewContentLine[];
}
class ViewDiff {
  // Do you want to show metadata here as well?
  public readonly newViewTags: Set<Tag> | undefined;
  public readonly tasksToCreateWithoutId: ViewContentLine[];
  public readonly tasksToCreateWithId: ViewContentLine[];
  public readonly tasksToUpdate: ViewContentLine[];
  public readonly tasksToDelete: ViewContentLine[];
  public readonly hasChanges: boolean;
  constructor({ newViewTags, tasksToCreateWithoutId, tasksToCreateWithId, tasksToUpdate, tasksToDelete }: ViewDiffArgs) {
    this.newViewTags = newViewTags;
    this.tasksToCreateWithId = tasksToCreateWithId || [];
    this.tasksToCreateWithoutId = tasksToCreateWithoutId || [];
    this.tasksToUpdate = tasksToUpdate || [];
    this.tasksToDelete = tasksToDelete || [];

    this.hasChanges = (
      this.newViewTags !== undefined
      || this.tasksToCreateWithId.length > 0
      || this.tasksToCreateWithoutId.length > 0
      || this.tasksToUpdate.length > 0
      || this.tasksToDelete.length > 0
    )
  }
}

function diffViews({ before, after }: { before: View, after: View }): ViewDiff {
  // To create/update/delete in `after` View
  const toCreateWithoutId: ViewContentLine[] = [];
  const toCreateWithId: ViewContentLine[] = [];
  const toUpdate: ViewContentLine[] = [];
  const toDelete: ViewContentLine[] = [];

  // Index previous Tasks by ID
  const previousIndex = new Map<TaskId, ViewContentLine>();
  for (const previousLine of before.content) {
    const id = previousLine.id as TaskId;
    previousIndex.set(id, previousLine);
  }

  // Track already reviewed Tasks
  const reviewed = new Set<TaskId>();

  // Find new tasks and tasks that changed
  for (const line of after.content) {
    if (line.id === undefined) {
      toCreateWithoutId.push(line);
      continue;
    }

    const taskId = line.id;

    reviewed.add(taskId);

    const previousLine = previousIndex.get(taskId);
    if (previousLine === undefined) {
      toCreateWithId.push(line);
      continue
    }

    const somethingChanged = (
      previousLine.title !== line.title
      || previousLine.completed !== line.completed
    );

    if (somethingChanged) {
      toUpdate.push(line);
    }
  }

  // Find tasks that were deleted
  for (const previousLine of before.content) {
    if (reviewed.has(previousLine.id as TaskId)) {
      continue;
    }

    toDelete.push(previousLine);
  }

  // Find if tags have changed
  const didTagsChange = setsAreEqual(before.tags, after.tags) === false;
  const newViewTags = didTagsChange
    ? after.tags
    : undefined;

  return new ViewDiff({
    newViewTags,
    tasksToCreateWithId: toCreateWithId,
    tasksToCreateWithoutId: toCreateWithoutId,
    tasksToUpdate: toUpdate,
    tasksToDelete: toDelete,
  });
}