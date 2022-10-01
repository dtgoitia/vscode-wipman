import { filter } from "rxjs";
import { setsAreEqual } from "../commands/common";
import { createTaskFile } from "../commands/createTaskFile";
import { createViewFile } from "../commands/createViewFile";
import { handleOnSave } from "../commands/onSave";
import { Path } from "../io";
import { buildFakeWipmanDictectory } from "../test/factories/files";
import { tmp } from "../test/helpers/testPath";
import { Config } from "./config";
import { EventType } from "./eventHandler/eventHandler";
import { Context, initialize } from "./extension-api";
import { BACKLOG_FILENAME, FileDeleted, FileManager } from "./files/files";
import { readTaskFile } from "./files/taskFiles";
import { parseViewContentLine, readViewFile } from "./files/viewFiles";
import { generateHash } from "./hash";
import { Task, TaskId, View, ViewId } from "./model";
import { TaskDeleted, TaskManager } from "./tasks";
import { BACKLOG_ID, taskIsCompletedInView, viewHasTaskId, viewHasTaskTitle, ViewManager } from "./views";

describe("Acceptance test", () => {

  xdescribe('when the root directory is empty', () => {

    describe(`on '${EventType.taskAdded}' event`, () => {
      it(`creates a task file, a backlog, and adds it to the backlog`, () => {
        // const result = handleEvent({id, type: EventType.taskAdded});
        // expect(result).toBeUndefined();

        // TODO: scan the whole root dir -- you need an easy class to create/destroy/scan
        //       these test root directories
        // TODO: assert a task file was created
        // TODO: assert a backlog file was created
        // TODO: assert the task was added to the backlog
      });

    });

    describe(`on '${EventType.taskDeleted}' event`, () => {
      it(`does not touch the file system and logs a meaningful error`, () => { });
    });
    describe(`on '${EventType.taskUpdated}' event`, () => {
      it(`does not touch the file system and logs a meaningful error`, () => { });
    });
    describe(`on '${EventType.viewUpdated}' event`, () => {
      it(`does not touch the file system and logs a meaningful error`, () => { });
    });
  });

  describe('under normal circumstances', () => {
    // Normal circumstances, the root directory:
    //   - has a 'view' directory
    //   - has a valid view called 'backlog' inside the 'view' directory
    //   - might have more views inside the 'view' directory
    //   - has one or more valid tasks

    let context: Context;
    let taskManager: TaskManager;
    let viewManager: ViewManager;
    let fileManager: FileManager;

    let config: Config;

    let backlogPath: Path;

    const initialTaskAmount = 4;
    const initialViewAmount = 3;

    let testDir: Path; // make sure you use a different directory per test

    beforeEach(() => {
      testDir = tmp.join(generateHash(2));

      config = new Config({ wipmanDir: testDir, debug: false });

      backlogPath = config.viewsDir.join(BACKLOG_FILENAME);

      buildFakeWipmanDictectory({ root: config.wipmanDir });

      context = initialize({ config });
      ({ taskManager, viewManager, fileManager } = context)
    });
    afterEach(() => testDir.delete())
    afterAll(() => tmp.delete())

    it(`the task manager has 3 tasks`, () => {
      expect(taskManager.tasks.size).toBe(initialTaskAmount);
      expect(taskManager.tasks.has('aaaaaaaaaa'))
      expect(taskManager.tasks.has('bbbbbbbbbb'))
      expect(taskManager.tasks.has('cccccccccc'))
    });

    it(`the view manager has 2 views: a 'backlog' view and another view`, () => {
      expect(viewManager.views.size).toBe(initialViewAmount);
      expect(viewManager.views.has(BACKLOG_ID))  // backlog
      expect(viewManager.views.has('1111111111'))  // another view
    });

    it(`the file manager has 3 task files and 2 view files`, () => {
      expect(fileManager.taskPaths.size).toEqual(initialTaskAmount);
      expect(fileManager.viewPaths.size).toEqual(initialViewAmount);
    })

    describe(`when the user adds a new task using a command`, () => {

      it("the task manager has one task more", () => {
        createTaskFile(context);
        expect(taskManager.tasks.size).toBe(initialTaskAmount + 1);
      });

      it("there is one task file more", () => {
        createTaskFile(context);
        expect(fileManager.taskPaths.size).toEqual(initialTaskAmount + 1)
      });

      it("the task shows up in the backlog view", () => {
        // Set up: get Tasks in backlog View before acting
        const before = viewManager.getView(BACKLOG_ID) as View;

        // Act
        createTaskFile(context);

        // Set up: get Tasks in backlog View after acting
        const after = viewManager.getView(BACKLOG_ID) as View;
        expect(before.content.length + 1).toEqual(after.content.length);
      });

      it("the task shows up in the backlog view file", () => {
        // Set up: get Task IDs in backlog View file before acting
        const [, before] = readViewFile(backlogPath);

        // Act
        createTaskFile(context);

        // Assert: get Task IDs in backlog View file after acting
        const [, after] = readViewFile(backlogPath);
        expect(before.size + 1).toEqual(after.size);
      });

    });

    describe(`when the user adds a new view using a command`, () => {

      it("the view manager has one view more", () => {
        createViewFile(context);
        expect(viewManager.views.size).toBe(initialViewAmount + 1);
      });

      it("there is one view file more", () => {
        createViewFile(context);
        expect(fileManager.viewPaths.size).toEqual(initialViewAmount + 1);
      });

    });

    describe(`when the user edits the 'backlog' view to add one new task`, () => {
      const taskTitle = 'This is task baz';
      function userAddsTaskInBacklog() {
        // Act: user adds Task by editing Backlog
        const content = backlogPath.readText()
        const updatedContent = content + `- [ ] ${taskTitle}\n`;
        backlogPath.writeText(updatedContent);

        // Act: user saves
        handleOnSave(backlogPath, context);
      }

      it("the task manager has one task more", () => {
        // Assert: amount of tasks before
        const before = taskManager.tasks.size;

        // Act
        userAddsTaskInBacklog();

        // Assert: amount of tasks after
        const after = taskManager.tasks.size;
        expect(before + 1).toEqual(after);
      });

      it("only the backlog view contains the new task in the ViewManager", () => {
        /**
         *  Rationale: the task has been added to the backlog, hence it should not have
         *  any tag, hence the task should not appear in any other view but the backlog.
         *  Had the used added the task in any view other than the backlog (X), then the
         *  task would have the tags of the view X and therefore the task would need to
         *  appear in the corresponding views depending on the task tags - but that is a
         *  separate test (TODO).
         */
        // Set up: assert task title does not exist in any view
        for (const [_, view] of viewManager.views) {
          expect(viewHasTaskTitle({ view, title: taskTitle })).toBe(false);
        }

        // Act
        userAddsTaskInBacklog();

        // Assert: task title only appears in backlog
        for (const [viewId, view] of viewManager.views) {
          if (viewId === BACKLOG_ID) {
            expect(viewHasTaskTitle({ view, title: taskTitle })).toBe(true);
          } else {
            expect(viewHasTaskTitle({ view, title: taskTitle })).toBe(false);
          }
        }
      });

      it("there is one task file more", () => {
        // Assert: amount of task files before
        const before = fileManager.taskPaths.size;

        // Act
        userAddsTaskInBacklog();

        // Assert: amount of task files after
        const after = fileManager.taskPaths.size;
        expect(before + 1).toEqual(after)
      });

      it("the task in the backlog shows an ID", () => {
        // Act
        userAddsTaskInBacklog();

        // Assert: added task has been assigned an ID
        const taskLine = backlogPath
          .readText()
          .split("\n")
          .filter(line => line.includes(taskTitle))
          .map(parseViewContentLine)
        [0];

        const taskIdIsInViewFile = taskLine.id !== undefined;
        expect(taskIdIsInViewFile).toBe(true);

        // Assert: no other unexpected stuff appears in the backlog
        const taskId = taskLine.id as TaskId;
        const taskDir = taskId.slice(0, 2);
        const taskFile = taskId.slice(2);
        expect(backlogPath.readText()).toEqual(
          `id=${BACKLOG_ID}\n` +
          'title=Backlog\n' +
          'created=2022-10-01T18:00:00.000Z\n' +
          'updated=2022-10-04T16:41:23.858Z\n' +
          'tags=\n' +
          '---\n' +
          '- [ ] Task foo  [aaaaaaaaaa](../aa/aaaaaaaa)\n' +
          '- [ ] Task bar  [bbbbbbbbbb](../bb/bbbbbbbb)\n' +
          '- [ ] Task barrrr  [cccccccccc](../cc/cccccccc)\n' +
          '- [x] Task bazzzz  [dddddddddd](../dd/dddddddd)\n' +
          `- [ ] ${taskTitle}  [${taskId}](../${taskDir}/${taskFile})\n` +
          ''
        )
      });
    });

    describe(`when the user edits any non-backlog view to add one new task`, () => {
      const taskTitle = 'This is a task added inline in a non-backlog view';
      const editedViewId = "1111111111";
      let editedViewPath: Path;

      beforeEach(() => {
        editedViewPath = fileManager.getViewPath({ id: editedViewId }) as Path;
      })

      function userAddsTaskInNonBacklogView() {
        // Act: user adds Task by editing Backlog
        const content = editedViewPath.readText()
        const updatedContent = content + `- [ ] ${taskTitle}\n`;
        editedViewPath.writeText(updatedContent);

        // Act: user saves
        handleOnSave(editedViewPath, context);
      }

      it("the task manager has one task more", () => {
        // Assert: amount of tasks before
        const before = taskManager.tasks.size;

        // Act
        userAddsTaskInNonBacklogView();

        // Assert: amount of tasks after
        const after = taskManager.tasks.size;
        expect(before + 1).toEqual(after);
      });

      it("the edited view and the backlog contain the task in the ViewManager", () => {
        // Set up: assert task title does not exist in any view
        for (const [_, view] of viewManager.views) {
          expect(viewHasTaskTitle({ view, title: taskTitle })).toBe(false);
        }

        // Act
        userAddsTaskInNonBacklogView();

        // Assert: task title only appears in edited view and backlog
        for (const [viewId, view] of viewManager.views) {
          if (viewId === editedViewId || viewId === BACKLOG_ID) {
            expect(viewHasTaskTitle({ view, title: taskTitle })).toBe(true);
          } else {
            expect(viewHasTaskTitle({ view, title: taskTitle })).toBe(false);
          }
        }

      });

      it("there is one task file more", () => {
        // Assert: amount of task files before
        const before = fileManager.taskPaths.size;

        // Act
        userAddsTaskInNonBacklogView();

        // Assert: amount of task files after
        const after = fileManager.taskPaths.size;
        expect(before + 1).toEqual(after)
      });

      it("the edited view file and the backlog file contain the task in the ViewManager", () => {
        /**
         *  Rationale: the task has been added to the backlog, hence it should not have
         *  any tag, hence the task should not appear in any other view but the backlog.
         *  Had the used added the task in any view other than the backlog (X), then the
         *  task would have the tags of the view X and therefore the task would need to
         *  appear in the corresponding views depending on the task tags - but that is a
         *  separate test (TODO).
         */
        // Set up: assert task title does not exist in any view
        for (const [_, view] of viewManager.views) {
          expect(viewHasTaskTitle({ view, title: taskTitle })).toBe(false);
        }

        // Act
        userAddsTaskInNonBacklogView();

        // Assert: task title only appears in backlog
        for (const [viewId, view] of viewManager.views) {
          if (viewId === editedViewId || viewId === BACKLOG_ID) {
            expect(viewHasTaskTitle({ view, title: taskTitle })).toBe(true);
          } else {
            expect(viewHasTaskTitle({ view, title: taskTitle })).toBe(false);
          }
        }
      });

      it("the task in the edited view file shows an ID", () => {
        // Act
        userAddsTaskInNonBacklogView();

        // Assert: added task has been assigned an ID
        const taskLine = editedViewPath
          .readText()
          .split("\n")
          .filter(line => line.includes(taskTitle))
          .map(parseViewContentLine)
        [0];

        const taskIdIsInViewFile = taskLine.id !== undefined;
        expect(taskIdIsInViewFile).toBe(true);

        // Assert: no other unexpected stuff appears in the backlog
        const taskId = taskLine.id as TaskId;
        const taskDir = taskId.slice(0, 2);
        const taskFile = taskId.slice(2);
        expect(editedViewPath.readText()).toEqual(
          `id=1111111111\n` +
          'title=HIRU\n' +
          'created=2022-10-01T18:00:00.000Z\n' +
          'updated=2022-10-04T16:41:23.858Z\n' +
          'tags=hiru\n' +
          '---\n' +
          '- [ ] Task foo  [aaaaaaaaaa](../aa/aaaaaaaa)\n' +
          '- [ ] Task bar  [bbbbbbbbbb](../bb/bbbbbbbb)\n' +
          `- [ ] ${taskTitle}  [${taskId}](../${taskDir}/${taskFile})\n` +
          ''
        )
      });

      it("the task in the backlog view file shows an ID", () => {
        // Act
        userAddsTaskInNonBacklogView();

        // Assert: added task has been assigned an ID
        const taskLine = backlogPath
          .readText()
          .split("\n")
          .filter(line => line.includes(taskTitle))
          .map(parseViewContentLine)
        [0];

        const taskIdIsInViewFile = taskLine.id !== undefined;
        expect(taskIdIsInViewFile).toBe(true);

        // Assert: no other unexpected stuff appears in the backlog
        const taskId = taskLine.id as TaskId;
        const taskDir = taskId.slice(0, 2);
        const taskFile = taskId.slice(2);
        expect(backlogPath.readText()).toEqual(
          `id=${BACKLOG_ID}\n` +
          'title=Backlog\n' +
          'created=2022-10-01T18:00:00.000Z\n' +
          'updated=2022-10-04T16:41:23.858Z\n' +
          'tags=\n' +
          '---\n' +
          '- [ ] Task foo  [aaaaaaaaaa](../aa/aaaaaaaa)\n' +
          '- [ ] Task bar  [bbbbbbbbbb](../bb/bbbbbbbb)\n' +
          '- [ ] Task barrrr  [cccccccccc](../cc/cccccccc)\n' +
          '- [x] Task bazzzz  [dddddddddd](../dd/dddddddd)\n' +
          `- [ ] ${taskTitle}  [${taskId}](../${taskDir}/${taskFile})\n` +
          ''
        )
      });
    });

    describe(`when the user edits any non-backlog view to add a completed task`, () => {
      const taskTitle = 'This is a completed task added inline in a non-backlog view';
      const editedViewId = "1111111111";
      let editedViewPath: Path;

      beforeEach(() => {
        editedViewPath = fileManager.getViewPath({ id: editedViewId }) as Path;
      })

      function userAddsCompletedTaskInNonBacklogView() {
        // Act: user adds Task by editing Backlog
        const content = editedViewPath.readText()
        const updatedContent = content + `- [x] ${taskTitle}\n`;
        editedViewPath.writeText(updatedContent);

        // Act: user saves
        handleOnSave(editedViewPath, context);
      }

      it("the task in the edited view file shows the task as completed", () => {
        // Act
        userAddsCompletedTaskInNonBacklogView();

        // Assert: added task has been assigned an ID
        const taskLine = editedViewPath
          .readText()
          .split("\n")
          .filter(line => line.includes(taskTitle))
          .map(parseViewContentLine)
        [0];

        const taskIdIsInViewFile = taskLine.id !== undefined;
        expect(taskIdIsInViewFile).toBe(true);

        // Assert: no other unexpected stuff appears in the backlog
        const taskId = taskLine.id as TaskId;
        const taskDir = taskId.slice(0, 2);
        const taskFile = taskId.slice(2);
        expect(editedViewPath.readText()).toEqual(
          `id=1111111111\n` +
          'title=HIRU\n' +
          'created=2022-10-01T18:00:00.000Z\n' +
          'updated=2022-10-04T16:41:23.858Z\n' +
          'tags=hiru\n' +
          '---\n' +
          '- [ ] Task foo  [aaaaaaaaaa](../aa/aaaaaaaa)\n' +
          '- [ ] Task bar  [bbbbbbbbbb](../bb/bbbbbbbb)\n' +
          `- [x] ${taskTitle}  [${taskId}](../${taskDir}/${taskFile})\n` +
          ''
        )
      });
    });

    describe(`when the user edits the task title in the task file metadata`, () => {
      const taskId = "aaaaaaaaaa";
      let taskPath: Path;

      beforeEach(() => {
        taskPath = config.wipmanDir.join('aa').join('aaaaaaaa');
      });

      it("views that contain the task are also updated to show the latest task title", () => {
        const updatedTaskTitle = "Task foaaaa";
        // Act: user edits title in Task file metadata section
        const content = taskPath.readText()
        const updatedContent = content
          .split("\n")
          .map(line => line.startsWith("title=") ? `title=${updatedTaskTitle}` : line)
          .join("\n");

        taskPath.writeText(updatedContent);

        // User saves
        handleOnSave(taskPath, context);

        // Assert: get Task line in backlog View after acting
        const updatedView = (viewManager.getView("1111111111") as View)
        const updatedLines = updatedView.content.filter(line => line.id === taskId);
        expect(updatedLines.length).toEqual(1);
        expect(updatedLines[0].title).toEqual(updatedTaskTitle);
      });
    });

    describe(`when the user edits an existing task title from a view`, () => {
      const taskId = "aaaaaaaaaa";
      const taskLink = "[aaaaaaaaaa](../aa/aaaaaaaa)"
      let taskPath: Path;

      function userEditsTaskTitleInBacklog() {
        taskPath = fileManager.getTaskPath({ taskId });

        const content = backlogPath.readText()
        const updatedContent = content
          .split('\n')
          .map(line => (
            line.endsWith(taskLink)
              ? line.replace("foo", "foooa")
              : line
          ))
          .join("\n");
        backlogPath.writeText(updatedContent);

        // User saves
        handleOnSave(backlogPath, context);
      }

      it("the task title is updated in the task manager", () => {
        // Act
        userEditsTaskTitleInBacklog();

        // Assert
        const updatedTask = taskManager.getTask("aaaaaaaaaa") as Task;
        expect(updatedTask.title).toEqual("Task foooa");
      });

      it("the task manager has the same amount of tasks", () => {
        // Act
        userEditsTaskTitleInBacklog();

        // Assert
        expect(taskManager.tasks.size).toEqual(initialTaskAmount);
      });

      it("the title is updated in the task file metadata", () => {
        // Act
        userEditsTaskTitleInBacklog();

        // Assert
        const task = readTaskFile(taskPath);
        expect(task.title).toContain("Task foooa")
      });

      it("views that contain the task are also updated to show the latest task title", () => {
        // Act
        userEditsTaskTitleInBacklog();

        // Assert: get Task line in backlog View after acting
        const updatedView = (viewManager.getView("1111111111") as View)
        const updatedLines = updatedView.content.filter(line => line.id === taskId);
        expect(updatedLines.length).toEqual(1);
        expect(updatedLines[0].title).toEqual("Task foooa");
      });

      it("view files that contain the task are also updated to show the latest task title", () => {
        // Act
        userEditsTaskTitleInBacklog();

        // Assert: get Task line in backlog View after acting
        const viewPath = fileManager.getViewPath({ id: "1111111111" });
        const [view] = readViewFile(viewPath)
        const updatedLines = view.content.filter(line => line.id === taskId);
        expect(updatedLines.length).toEqual(1);
        expect(updatedLines[0].title).toEqual("Task foooa");
      });
    });

    xdescribe(`when a task has no tags`, () => {
      it("the task appears in the backlog", () => { });
    });

    describe(`when the user adds a tag to a task without tags`, () => {
      const taskId = "cccccccccc";

      let taskPath: Path;
      let viewPath: Path; // the view where the task is expected to appear

      beforeEach(() => {
        taskPath = fileManager.getTaskPath({ taskId });
        const view = viewManager.getView('1111111111') as View;
        viewPath = fileManager.getViewPath({ id: view.id });
      });

      it("the task appears in the corresponding views", () => {
        // Assert: task only appears in backlog
        const backlogBefore = viewManager.getView(BACKLOG_ID) as View;
        expect(viewHasTaskId({ view: backlogBefore, taskId })).toBe(true);
        const viewBefore = viewManager.getView("1111111111") as View;
        expect(viewHasTaskId({ view: viewBefore, taskId })).toBe(false);

        // Act: add tag to file
        const content = taskPath.readText()
        const updatedContent = content
          .split("\n")
          .map(line => line.startsWith("tags=") ? "tags=hiru" : line)
          .join("\n");

        taskPath.writeText(updatedContent);

        // Act: user saves
        handleOnSave(taskPath, context);

        // Assert: task appears in the views it should
        const backlogAfter = viewManager.getView(BACKLOG_ID) as View;
        expect(viewHasTaskId({ view: backlogAfter, taskId })).toBe(true);
        const viewAfter = viewManager.getView("1111111111") as View;
        expect(viewHasTaskId({ view: viewAfter, taskId })).toBe(true);
      });

      xit("the task should not disappear from the backlog", async () => { });
    });

    describe("when the user edits the tags of a completed task", () => {
      function userChangesTagsInTaskFile(taskPath: Path): void {
        const content = taskPath.readText();
        const updatedContent = content
          .split("\n")
          .map(line => line.startsWith("tags=") ? "tags=hiru" : line)
          .join("\n");

        taskPath.writeText(updatedContent);

        // user saves view file
        handleOnSave(taskPath, context)
      }

      const taskId = "dddddddddd";
      const updatedViewId = "1111111111";  // because `tags=hiru`
      let taskPath: Path;

      beforeEach(() => {
        taskPath = fileManager.getTaskPath({ taskId });
        userChangesTagsInTaskFile(taskPath);
      });

      it("the task appears as completed in View in the ViewManager", () => {
        const updatedView = (viewManager.getView(updatedViewId) as View)
        const updatedLines = updatedView.content.filter(line => line.id === taskId);
        expect(updatedLines.length).toEqual(1);
        expect(updatedLines[0].completed).toEqual(true);
      });

      it("the task appears as completed in view file", () => {
        const updatedViewPath = fileManager.getViewPath({ id: updatedViewId });
        const [viewInFile] = readViewFile(updatedViewPath);
        const updatedLineInFile = viewInFile.content.filter(line => line.id === taskId)[0];
        expect(updatedLineInFile.completed).toEqual(true);
      });
    });

    xdescribe(`when the user removes a task using a command`, () => {
      it("the task file is removed", () => { });
      it("the task does not show up in the views", () => { });
    });

    describe(`when the user removes a task by editing the backlog`, () => {
      const taskId: TaskId = "aaaaaaaaaa";

      function deleteTaskFromBacklog(backlog: Path, taskId: TaskId): void {
        const content = backlog.readText()
        const updatedContent = content
          .split("\n")
          .filter(line => line.includes(taskId) === false)
          .join("\n");
        backlog.writeText(updatedContent);
      }

      it("the task is removed from the TaskManager", (done) => {
        // Assert: prepare to execute after Act
        taskManager
          .changes$
          .pipe(
            filter(change => change.id === taskId),
            filter(change => change instanceof TaskDeleted),
          ).subscribe(taskDeleted => {
            expect(taskDeleted.id).toBe(taskId);
            expect(taskManager.getTask(taskId)).toBeUndefined();
            done();
          });

        // Act: user deletes task from backlog and saves
        deleteTaskFromBacklog(backlogPath, taskId);
        handleOnSave(backlogPath, context);
      });

      it("the task is removed from every view in the ViewManager", () => {
        // Assert: the expected views have the task on start
        for (const [viewId, view] of viewManager.views) {
          if (viewId === BACKLOG_ID || viewId === "1111111111") {
            expect(viewHasTaskId({ view, taskId })).toBe(true);
          } else {
            expect(viewHasTaskId({ view, taskId })).toBe(false);
          }
        }

        // Act: user deletes task from backlog and saves
        deleteTaskFromBacklog(backlogPath, taskId);
        handleOnSave(backlogPath, context);

        // Assert: view is not present in any view
        for (const [_, view] of viewManager.views) {
          expect(viewHasTaskId({ view, taskId })).toBe(false);
        }
      });

      it("the task file is removed", (done) => {
        // Assert: prepare to execute after Act
        fileManager
          .changes$
          .pipe(
            filter(change => change instanceof FileDeleted),
          ).subscribe(fileDeleted => {
            const expected = config.wipmanDir.join("aa/aaaaaaaa");
            expect(fileDeleted.path.equals(expected)).toEqual(true);
            done()
          });

        // Act: user deletes task from backlog and saves
        deleteTaskFromBacklog(backlogPath, taskId);
        handleOnSave(backlogPath, context);
      })

      xit("the task does not show up in any views", () => { });
    });

    xdescribe(`when the user removes a task by editing a view other than the backlog`, () => {
      /**
       * Feature decision: expected behaviour here is odd - if a task is in two views
       * and you remove it from one view... are you expected to remove it from
       * everywhere? I think that would be a very weird behaviour. Once the user saves
       * the view where it has deleted one or more tasks, just recompute tasks in view
       * and reappend the deleted tasks at the end of the view file.
       * 
       * If the view = backlog, then delete Task (and remove it from every view)
       * If the view != backlog, then it's fine to delete the task from every other view
       *    and the task itself and then recompute the list of task in the view.
       * Bear in mind that if you use git under the hood, you can always recover any
       * task deleted by mistake (and in the UI you could set up some sort of undo
       * mechanism). The alternative is to force the user to leave the view to delete
       * one task and then come back
       */
      it("the task file is not removed", () => { });
      it("the task still shows up in the views where it was before", () => { });
      it("the task still is now at the end of the view", () => {
        /**
         * Ideally the task would appear in the same place where it was before being
         * deleted, but I don't know how to achieve that, as the order of the tasks in
         * the view is determined by the view file itself, and the user has just delete
         * that information by removing the task from the view file and saving.
         */
      });
    });

    describe(`when the user edits the tags in a view`, () => {
      let viewPath: Path;

      function userChangesTagsInViewFile(viewPath: Path): void {
        const content = viewPath.readText()
        const updatedContent = content
          .split("\n")
          .map(line => line.startsWith("tags=") ? "tags=non-existing-tag" : line)
          .join("\n");

        viewPath.writeText(updatedContent);

        // user saves view file
        handleOnSave(viewPath, context)
      }

      beforeEach(() => {
        const view = viewManager.getView('1111111111') as View;
        viewPath = fileManager.getViewPath({ id: view.id });
      });

      it(`the tasks in the view are updated`, () => {
        // Assert initial state
        const [initialView, initialTaskIds] = readViewFile(viewPath);
        expect(initialView.tags).toEqual(new Set(['hiru']));
        expect(initialTaskIds).toEqual(new Set(['aaaaaaaaaa', 'bbbbbbbbbb']));

        // Act
        userChangesTagsInViewFile(viewPath);

        // Assert: no tasks are shown in the view file
        const [view, taskIds] = readViewFile(viewPath);
        expect(view.tags).toEqual(new Set(["non-existing-tag"]));
        expect(taskIds).toEqual(new Set([]));

      });

      xit(`the view files are updated`, () => { });
    });

    describe(`when the user completes a task by editing the task metadata`, () => {
      const taskId = "bbbbbbbbbb";

      function userCompletesTaskInTaskMetadata(): void {
        // Act: user marks task as completed in Task file metadata
        const editedFilePath = fileManager.getTaskPath({ taskId });
        const updatedContent = editedFilePath
          .readText()
          .split("\n")
          .map(line => {
            return line.startsWith("completed=")
              ? "completed=true"
              : line
          })
          .join("\n")
        editedFilePath.writeText(updatedContent);

        // Act: user saves
        handleOnSave(editedFilePath, context);
      }

      it(`the task appears as completed in TaskManager`, () => {
        // Assert: task is not completed before acting
        const before = taskManager.getTask(taskId) as Task;
        expect(before.completed).toBe(false)

        userCompletesTaskInTaskMetadata();

        // Assert: task is completed after acting
        const after = taskManager.getTask(taskId) as Task;
        expect(after.completed).toBe(true)
      });

      it(`the task appears as completed in all views in ViewManager`, () => {
        // Assert: task is not completed before acting
        const backlogBefore = viewManager.getView(BACKLOG_ID) as View;
        expect(taskIsCompletedInView({ view: backlogBefore, taskId })).toBe(false);
        const viewBefore = viewManager.getView("1111111111") as View;
        expect(taskIsCompletedInView({ view: viewBefore, taskId })).toBe(false);

        // Act
        userCompletesTaskInTaskMetadata();

        // Assert: task appears as completed in all views
        const backlogAfter = viewManager.getView(BACKLOG_ID) as View;
        expect(taskIsCompletedInView({ view: backlogAfter, taskId })).toBe(true);
        const viewAfter = viewManager.getView("1111111111") as View;
        expect(taskIsCompletedInView({ view: viewAfter, taskId })).toBe(true);
      });

      it(`the task appears as completed in all view files`, () => {
        // Assert: task appears as not completed in all views
        expect(backlogPath.readText()).toEqual(
          `id=${BACKLOG_ID}\n` +
          'title=Backlog\n' +
          'created=2022-10-01T18:00:00.000Z\n' +
          'updated=2022-10-04T16:41:23.858Z\n' +
          'tags=\n' +
          '---\n' +
          '- [ ] Task foo  [aaaaaaaaaa](../aa/aaaaaaaa)\n' +
          '- [ ] Task bar  [bbbbbbbbbb](../bb/bbbbbbbb)\n' +
          '- [ ] Task barrrr  [cccccccccc](../cc/cccccccc)\n' +
          '- [x] Task bazzzz  [dddddddddd](../dd/dddddddd)\n' +
          ''
        );
        expect(fileManager.getViewPath({ id: "1111111111" }).readText()).toEqual(
          `id=1111111111\n` +
          'title=HIRU\n' +
          'created=2022-10-01T18:00:00.000Z\n' +
          'updated=2022-10-04T16:41:23.858Z\n' +
          'tags=hiru\n' +
          '---\n' +
          '- [ ] Task foo  [aaaaaaaaaa](../aa/aaaaaaaa)\n' +
          '- [ ] Task bar  [bbbbbbbbbb](../bb/bbbbbbbb)\n' +
          ''
        );

        // Act
        userCompletesTaskInTaskMetadata();

        // Assert: task appears as completed in all views
        expect(backlogPath.readText()).toEqual(
          `id=${BACKLOG_ID}\n` +
          'title=Backlog\n' +
          'created=2022-10-01T18:00:00.000Z\n' +
          'updated=2022-10-04T16:41:23.858Z\n' +
          'tags=\n' +
          '---\n' +
          '- [ ] Task foo  [aaaaaaaaaa](../aa/aaaaaaaa)\n' +
          '- [x] Task bar  [bbbbbbbbbb](../bb/bbbbbbbb)\n' +
          '- [ ] Task barrrr  [cccccccccc](../cc/cccccccc)\n' +
          '- [x] Task bazzzz  [dddddddddd](../dd/dddddddd)\n' +
          ''
        );
        expect(fileManager.getViewPath({ id: "1111111111" }).readText()).toEqual(
          `id=1111111111\n` +
          'title=HIRU\n' +
          'created=2022-10-01T18:00:00.000Z\n' +
          'updated=2022-10-04T16:41:23.858Z\n' +
          'tags=hiru\n' +
          '---\n' +
          '- [ ] Task foo  [aaaaaaaaaa](../aa/aaaaaaaa)\n' +
          '- [x] Task bar  [bbbbbbbbbb](../bb/bbbbbbbb)\n' +
          ''
        );
      });
    });

    describe(`when the user completes a task by editing any view`, () => {
      const taskId = "bbbbbbbbbb";

      function userCompletesTaskInlineInBacklog(): void {
        // Act: user marks task as completed in Task file metadata
        const editedFilePath = fileManager.getViewPath({ id: "1111111111" });
        const updatedContent = editedFilePath
          .readText()
          .split("\n")
          .map(line => {
            return line.includes(taskId)
              ? line.replace("- [ ] ", "- [x] ")
              : line
          })
          .join("\n")
        editedFilePath.writeText(updatedContent);

        // Act: user saves
        handleOnSave(editedFilePath, context);
      }

      it(`the task appears as completed in TaskManager`, () => {
        // Assert: task is not completed before acting
        const before = taskManager.getTask(taskId) as Task;
        expect(before.completed).toBe(false);

        userCompletesTaskInlineInBacklog();

        // Assert: task is completed after acting
        const after = taskManager.getTask(taskId) as Task;
        expect(after.completed).toBe(true);
      });

      it(`the task appears as completed in task file`, () => {
        // Assert: task is not completed before acting
        const taskPath = fileManager.getTaskPath({ taskId });
        const before = readTaskFile(taskPath);
        expect(before.completed).toBe(false);

        userCompletesTaskInlineInBacklog();

        // Assert: task is completed after acting
        const after = readTaskFile(taskPath);
        expect(after.completed).toBe(true);
      });

      it(`the task appears as completed in all views in ViewManager`, () => {
        // Assert: task is not completed before acting
        const backlogBefore = viewManager.getView(BACKLOG_ID) as View;
        expect(taskIsCompletedInView({ view: backlogBefore, taskId })).toBe(false);
        const viewBefore = viewManager.getView("1111111111") as View;
        expect(taskIsCompletedInView({ view: viewBefore, taskId })).toBe(false);

        // Act
        userCompletesTaskInlineInBacklog();

        // Assert: task appears as completed in all views
        const backlogAfter = viewManager.getView(BACKLOG_ID) as View;
        expect(taskIsCompletedInView({ view: backlogAfter, taskId })).toBe(true);
        const viewAfter = viewManager.getView("1111111111") as View;
        expect(taskIsCompletedInView({ view: viewAfter, taskId })).toBe(true);
      });

      it(`the task appears as completed in all view files`, () => {
        // Assert: task appears as not completed in all views
        expect(backlogPath.readText()).toEqual(
          `id=${BACKLOG_ID}\n` +
          'title=Backlog\n' +
          'created=2022-10-01T18:00:00.000Z\n' +
          'updated=2022-10-04T16:41:23.858Z\n' +
          'tags=\n' +
          '---\n' +
          '- [ ] Task foo  [aaaaaaaaaa](../aa/aaaaaaaa)\n' +
          '- [ ] Task bar  [bbbbbbbbbb](../bb/bbbbbbbb)\n' +
          '- [ ] Task barrrr  [cccccccccc](../cc/cccccccc)\n' +
          '- [x] Task bazzzz  [dddddddddd](../dd/dddddddd)\n' +
          ''
        );
        expect(fileManager.getViewPath({ id: "1111111111" }).readText()).toEqual(
          `id=1111111111\n` +
          'title=HIRU\n' +
          'created=2022-10-01T18:00:00.000Z\n' +
          'updated=2022-10-04T16:41:23.858Z\n' +
          'tags=hiru\n' +
          '---\n' +
          '- [ ] Task foo  [aaaaaaaaaa](../aa/aaaaaaaa)\n' +
          '- [ ] Task bar  [bbbbbbbbbb](../bb/bbbbbbbb)\n' +
          ''
        );

        // Act
        userCompletesTaskInlineInBacklog();

        // Assert: task appears as completed in all views
        expect(backlogPath.readText()).toEqual(
          `id=${BACKLOG_ID}\n` +
          'title=Backlog\n' +
          'created=2022-10-01T18:00:00.000Z\n' +
          'updated=2022-10-04T16:41:23.858Z\n' +
          'tags=\n' +
          '---\n' +
          '- [ ] Task foo  [aaaaaaaaaa](../aa/aaaaaaaa)\n' +
          '- [x] Task bar  [bbbbbbbbbb](../bb/bbbbbbbb)\n' +
          '- [ ] Task barrrr  [cccccccccc](../cc/cccccccc)\n' +
          '- [x] Task bazzzz  [dddddddddd](../dd/dddddddd)\n' +
          ''
        );
        expect(fileManager.getViewPath({ id: "1111111111" }).readText()).toEqual(
          `id=1111111111\n` +
          'title=HIRU\n' +
          'created=2022-10-01T18:00:00.000Z\n' +
          'updated=2022-10-04T16:41:23.858Z\n' +
          'tags=hiru\n' +
          '---\n' +
          '- [ ] Task foo  [aaaaaaaaaa](../aa/aaaaaaaa)\n' +
          '- [x] Task bar  [bbbbbbbbbb](../bb/bbbbbbbb)\n' +
          ''
        );
      });
    });

    describe("complex scenarios that caused bugs in the past", () => {
      describe("user marks task as completed, saves, marks task as in complete and saves", () => {
        const editedTaskId = "bbbbbbbbbb";
        const editedViewId = "1111111111";

        function setToTaskInlineInBacklogTo({ completed }: { completed: boolean }): void {
          // Act: user marks task as completed in Task file metadata
          const editedFilePath = fileManager.getViewPath({ id: editedViewId });
          const updatedContent = editedFilePath
            .readText()
            .split("\n")
            .map(line => {
              return line.includes(editedTaskId)
                ? line
                  .replace("- [ ] ", "- [] ")
                  .replace("- [x] ", "- [] ")
                  .replace("- [] ", `- [${completed ? "x" : " "}] `)
                : line
            })
            .join("\n");
          editedFilePath.writeText(updatedContent);

          // Act: user saves
          handleOnSave(editedFilePath, context);
        }

        type Snapshot = string;
        function snapshotFiles({ root }: { root: Path }): Snapshot {
          // DFS traversal of root directory to collect all files
          const files: Path[] = [];
          const pathsToInspect = root.walk();
          while (pathsToInspect.length > 0) {
            const path = pathsToInspect.pop();
            if (path === undefined) break;

            if (path.isFile()) {
              files.push(path);
              continue;
            }

            pathsToInspect.push(...path.walk());
          }

          const snapshot = files
            .sort((a: Path, b: Path) => a.toString() < b.toString() ? -1 : 1)
            .map(file => `file name: ${file.toString()}\n${file.readText()}\n`)
            .join("------------ <<<<<<< ---- >>>>>>> ------------\n")

          return snapshot
        }

        it("the files should look identical to how they were at the beginning", () => {
          const filesBefore = snapshotFiles({ root: config.wipmanDir });

          // Assert: task is not completed before acting
          const taskPath = fileManager.getTaskPath({ taskId: editedTaskId });
          const before = readTaskFile(taskPath);
          expect(before.completed).toBe(false);

          // Act
          setToTaskInlineInBacklogTo({ completed: true });

          // Assert: task is completed after acting
          const after = readTaskFile(taskPath);
          expect(after.completed).toBe(true);

          // Act
          setToTaskInlineInBacklogTo({ completed: false });

          const filesAfter = snapshotFiles({ root: config.wipmanDir });
          expect(filesBefore).toEqual(filesAfter);

          // // Assert: task is completed after acting
          const afterSecond = readTaskFile(taskPath);
          expect(afterSecond.completed).toBe(false);
        });
      });

      describe("user creates view, changes tags, and saves view one (or many) times", () => {
        it("the task files should look identical to how they were at the beginning", () => {
          const taskFilesBefore = new Set<Path>(
            [...fileManager.taskPaths]
              .map(([_, taskPath]) => taskPath)
          );

          // 1. I created a new view (ledger) via command
          const viewsBefore: ViewId[] = [...viewManager.views].map(([viewId]) => viewId);
          createViewFile(context);
          const newViews: ViewId[] = [...viewManager.views]
            .map(([viewId]) => viewId)
            .filter(id => viewsBefore.includes(id) === false);
          expect(newViews.length).toEqual(1);
          const viewId: ViewId = newViews[0];
          const viewPath: Path = fileManager.getViewPath({ id: viewId });

          // 2. I changed the view tags from '' to 'ledger'
          const content = viewPath.readText()
          const updatedContent = content
            .split("\n")
            .map(line => line.startsWith("tags=") ? "tags=foo" : line)
            .join("\n");

          viewPath.writeText(updatedContent);

          // 2. and saved
          handleOnSave(viewPath, context);

          let taskFiles = new Set<Path>(
            [...fileManager.taskPaths]
              .map(([_, taskPath]) => taskPath)
          );
          expect(setsAreEqual(taskFilesBefore, taskFiles)).toBe(true);

          // 3. Save for second time
          handleOnSave(viewPath, context);

          // 4. All tasks should be now deleted from, and all views emptied.
          // Yup, bug reproduced here -- now fixed

          taskFiles = new Set<Path>(
            [...fileManager.taskPaths]
              .map(([_, taskPath]) => taskPath)
          );
          expect(setsAreEqual(taskFilesBefore, taskFiles)).toBe(true);
        });
      });

    });
  });
});
