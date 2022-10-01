import task from "../test/factories/task";
import { Tag } from "./model";
import { diffTasks, inferTaskPathFromTaskId, TaskManager } from "./tasks";

describe("infer Task path from its ID", () => {
  it("happy path", () => {
    const path = inferTaskPathFromTaskId("abcdefgh");
    expect(path.toString()).toEqual("ab/cdefgh");
  });
});

describe("TaskManager", () => {
  it("indexes Tasks by Tag on initialization", () => {
    const a = task({ title: "task a", tags: new Set(["tag1"]) });
    const b = task({ title: "task b", tags: new Set(["tag1", "tag2"]) });
    const c = task({ title: "task c", tags: new Set(["tag2"]) });

    const manager = new TaskManager({
      tasks: new Map([
        [a.id, a],
        [b.id, b],
        [c.id, c],
      ]),
    });

    expect(manager.getTasksByTag("missing-tag")).toEqual(new Set());
    expect(manager.getTasksByTag("tag1")).toEqual(new Set([a, b]))
    expect(manager.getTasksByTag("tag2")).toEqual(new Set([b, c]))
  })

  it("indexes Tasks by Tag on bulk load", () => {
    const a = task({ title: "task a", tags: new Set(["tag1"]) });
    const b = task({ title: "task b", tags: new Set(["tag1", "tag2"]) });
    const c = task({ title: "task c", tags: new Set(["tag2"]) });

    const manager = new TaskManager({});
    manager.bulkLoad({
      tasks: [a, b, c],
      publish: false,
    });

    expect(manager.getTasksByTag("tag1")).toEqual(new Set([a, b]))
    expect(manager.getTasksByTag("tag2")).toEqual(new Set([b, c]))
  })

  it("updates Task-by-Tag index on removeTag", () => {
    // Setup
    const a = task({ title: "task a", tags: new Set(["tag1"]) });
    const b = task({ title: "task b", tags: new Set(["tag1", "tag2"]) });
    const c = task({ title: "task c", tags: new Set(["tag2"]) });

    const manager = new TaskManager({
      tasks: new Map([
        [a.id, a],
        [b.id, b],
        [c.id, c],
      ]),
    });

    expect(manager.getTasksByTag("tag1")).toEqual(new Set([a, b]))
    expect(manager.getTasksByTag("tag2")).toEqual(new Set([b, c]))

    // Act
    manager.removeTask(c.id);

    // Assertion
    expect(manager.getTasksByTag("tag1")).toEqual(new Set([a, b]))
    expect(manager.getTasksByTag("tag2")).toEqual(new Set([b]))
  });

  it("updates Task-by-Tag index when a tag updates its tags", () => {
    // Setup
    const a = task({ title: "task a", tags: new Set(["tag1"]) });

    const manager = new TaskManager({
      tasks: new Map([
        [a.id, a],
      ]),
    });

    expect(manager.getTasksByTag("tag1")).toEqual(new Set([a]));
    expect(manager.getTasksByTag("tag2")).toEqual(new Set());

    // replace: tag1 --> tag2
    const updated = { ...a, tags: new Set(['tag2']) };
    manager.updateTask(updated);

    // Assertion
    expect(manager.getTasksByTag("tag1")).toEqual(new Set([]));
    expect(manager.getTasksByTag("tag2")).toEqual(new Set([updated]));
  });
});

describe("task diffs", () => {
  it("reports no tag changes if tags didn't change", () => {
    const before = task({
      title: "my title",
      tags: new Set<Tag>(['tag_a', 'tag_b']),
    });
    const after = {
      ...before,
      title: "updated title",
      tags: new Set<Tag>(['tag_a', 'tag_b']),  // identical tags
    };

    const diff = diffTasks({ before, after });

    expect(diff.updatedTags).toBeUndefined();
  });
});