import { todo } from "../../devex/errors";
import { Path } from "../../io";
import { buildFakeWipmanDictectory } from "../../test/factories/files";
import task from "../../test/factories/task";
import { tmp } from "../../test/helpers/testPath";
import { Tag, Task, View, ViewContentLine } from "../model";
import { TaskManager } from "../tasks";
import { buildTaskLink, ViewManager } from "../views";
import { isWipmanDirectory, IsWipmanDirectoryOutcome } from "./files";
import { deserializeTask } from "./taskFiles";
import { deserializeViewOnlyMetadata, parseViewContentLine, serializeViewContentLine } from "./viewFiles";

describe(`parse task file`, () => {
  const path = new Path("aa/bbbbbbbb");
  const fileContent = `` +
    `id=aabbbbbbbb\n` +
    `title=test task\n` +
    `created=2022-10-12T17:37:00Z\n` +
    `updated=2022-10-12T17:38:00Z\n` +
    `tags=\n` +
    `blockedBy=\n` +
    `blocks=\n` +
    `completed=false\n` +
    `---\n` +
    ``;

  let task: Task;

  beforeEach(() => {
    task = deserializeTask({ path, raw: fileContent });
  })

  it(`parses metadata correctly`, () => {
    const expected: Task = {
      id: "aabbbbbbbb",
      title: "test task",
      created: new Date("2022-10-12T17:37:00Z"),
      updated: new Date("2022-10-12T17:38:00Z"),
      tags: new Set<Tag>(),
      blockedBy: new Set<Tag>(),
      blocks: new Set<Tag>(),
      content: "",
      completed: false,
    };
    expect(task).toEqual(expected);
  });
});

describe(`parse view file`, () => {
  const fileContent = `` +
    `id=1111111111\n` +
    `title=test view\n` +
    `created=2022-10-12T17:37:00Z\n` +
    `updated=2022-10-12T17:38:00Z\n` +
    `tags=foo\n` +
    `---\n` +
    `- [ ] Task foo 1  [aaaaaaaaaa](../aa/aaaaaaaa)\n` +
    `- [ ] Task foo 2  [bbbbbbbbbb](../bb/bbbbbbbb)\n` +
    ``;

  let view: View;

  beforeEach(() => {
    view = deserializeViewOnlyMetadata({ raw: fileContent });
  })

  it(`parses metadata correctly`, () => {
    expect(view).toEqual({
      id: "1111111111",
      title: "test view",
      tags: new Set<Tag>(['foo']),
      created: new Date("2022-10-12T17:37:00Z"),
      updated: new Date("2022-10-12T17:38:00Z"),
      content: [],
    });
  });
});

describe("parse line in View content", () => {

  it("line without Task ID", () => {
    const line = "- [ ] Task without ID";
    expect(parseViewContentLine(line)).toEqual({
      completed: false,
      title: "Task without ID",
      id: undefined,
    });
  });

  it("line with Task ID", () => {
    const line = "- [ ] Task foo  #g:hiru [aaaaaaaaaa](../aa/aaaaaaaa)"
    expect(parseViewContentLine(line)).toEqual({
      completed: false,
      title: "Task foo  #g:hiru",
      id: "aaaaaaaaaa",
    });
  })

  it("line with many spaces before the Task ID", () => {
    const line = "- [ ] Task foo  #g:hiru     [aaaaaaaaaa](../aa/aaaaaaaa)"
    expect(parseViewContentLine(line)).toEqual({
      completed: false,
      title: "Task foo  #g:hiru",
      id: "aaaaaaaaaa",
    });
  })

  it("line with invalid link", () => {
    const line = "- [ ] Task foo  [aaaaaaaaaa](../bb/cccccccc)"
    expect(() => parseViewContentLine(line)).toThrow(
      new Error(
        `IDs in the link description and path do not match:\n` +
        `  link: [aaaaaaaaaa](../bb/cccccccc)\n` +
        `  id  : aaaaaaaaaa\n` +
        `  path: bbcccccccc\n`
      ));
  })

  it("line with completed Task", () => {
    const line = "- [x] Task foo  [aaaaaaaaaa](../aa/aaaaaaaa)"
    expect(parseViewContentLine(line)).toEqual({
      completed: true,
      title: "Task foo",
      id: "aaaaaaaaaa",
    });
  })
});

describe("serialize ViewContentLine", () => {
  it("with ID", () => {
    const line: ViewContentLine = { completed: false, title: "Title", id: "abcde" }
    expect(serializeViewContentLine(line)).toEqual("- [ ] Title  [abcde](../ab/cde)");
  });
  it("without ID", () => {
    const line: ViewContentLine = { completed: false, title: "Title", id: undefined }
    expect(serializeViewContentLine(line)).toEqual("- [ ] Title")
  });
  it("completed", () => {
    const line: ViewContentLine = { completed: true, title: "Title", id: undefined }
    expect(serializeViewContentLine(line)).toEqual("- [x] Title")
  });
  it("not completed", () => {
    const line: ViewContentLine = { completed: false, title: "Title", id: undefined }
    expect(serializeViewContentLine(line)).toEqual("- [ ] Title")
  });
});

describe("build Task markdown link from Task relative path", () => {
  it('happy path', () => {
    const path = new Path("ab/cdefghij");
    expect(buildTaskLink(path)).toEqual("[abcdefghij](../ab/cdefghij)");
  })
});


xdescribe("taskManager --> vieManager interaction", () => {
  it("when a task title is updated, the view manager knows it    RENAME THIS", () => {
    todo();
  })
});


xdescribe("find all views that should show a given task", () => {
  let taskManager: TaskManager;
  let viewManager: ViewManager;

  beforeEach(() => {
    taskManager = new TaskManager({})
    taskManager.bulkLoad({
      tasks: [
        task({ title: "task a", tags: new Set(["tag1"]) }),
        task({ title: "task b", tags: new Set(["tag1"]) }),
      ],
      publish: false
    })
  })

  it('task only appears in the views that include all the task tags', () => {
    todo();
  })
  xit('task always appears in the backlog view', () => { })
})

describe("is wipman directory", () => {
  afterEach(() => tmp.delete());

  it("path does not exist", () => {
    const path = tmp.join('i-dont-exist');

    const outcome = isWipmanDirectory({ path });
    expect(outcome).toEqual(IsWipmanDirectoryOutcome.doesNotExist);
  });

  it("path is file", () => {
    const path = tmp.join('foo');
    path.touch();

    const outcome = isWipmanDirectory({ path });
    expect(outcome).toEqual(IsWipmanDirectoryOutcome.isFile);
  });

  it("path is empty directory", () => {
    const path = tmp.join('foo');
    path.makeDirectory();

    const outcome = isWipmanDirectory({ path });
    expect(outcome).toEqual(IsWipmanDirectoryOutcome.isEmptyDirectory);
  });

  it("path is not wipman directory", () => {
    const path = tmp.join('foo');
    path.join("foo/bar.md").writeText("I'm not a wipman dir :(");

    const outcome = isWipmanDirectory({ path });
    expect(outcome).toEqual(IsWipmanDirectoryOutcome.isNotWipmanDir);
  });

  it("path is wipman directory", () => {
    const path = tmp.join('wipman');
    buildFakeWipmanDictectory({ root: path });

    const outcome = isWipmanDirectory({ path });
    expect(outcome).toEqual(IsWipmanDirectoryOutcome.isWipmanDir);
  });
})