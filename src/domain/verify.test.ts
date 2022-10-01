import { Path } from "../io";
import { tmp } from "../test/helpers/testPath";
import { Config, VIEWS_DIR_NAME } from "./config";
import { Context, initialize } from "./extension-api";
import { FileManager } from "./files/files";
import { generateHash } from "./hash";
import { DisconnectedTaskViewPairProblem, verify, WipmanDirHealthReport } from "./verify";
import { BACKLOG_ID } from "./views";

describe("when the data is corrupted", () => {
  let context: Context;
  let fileManager: FileManager;

  let config: Config;

  let testDir: Path;
  let viewsDir: Path;

  beforeEach(() => {
    testDir = tmp.join(generateHash(2));
    config = new Config({ wipmanDir: testDir });
    viewsDir = config.wipmanDir.join(VIEWS_DIR_NAME);
  });

  afterEach(() => testDir.delete())
  afterAll(() => tmp.delete())

  describe("because task does not appear in the view it should", () => {
    beforeEach(() => {
      const files: { path: Path, content: string }[] = [
        {
          path: viewsDir.join('backlog.md'),
          content:
            `id=${BACKLOG_ID}\n` +
            'title=Backlog\n' +
            'created=2022-10-01T18:00:00.000Z\n' +
            'updated=2022-10-04T16:41:23.858Z\n' +
            'tags=\n' +
            '---\n' +
            '- [ ] Task foo  [aaaaaaaaaa](../aa/aaaaaaaa)\n' +
            ''
        },
        {
          path: viewsDir.join('hiru.md'),
          content:
            'id=1111111111\n' +
            'title=HIRU\n' +
            'created=2022-10-01T18:00:00.000Z\n' +
            'updated=2022-10-04T16:41:23.858Z\n' +
            'tags=hiru\n' +
            '---\n' +
            // <-- task `aaaaaaaaaa` should appear here, but it doesn't
            ''
        },
        {
          path: config.wipmanDir.join('aa').join("aaaaaaaa"),
          content:
            'id=aaaaaaaaaa\n' +
            'title=Task foo\n' +
            'created=2022-10-01T18:00:00.000Z\n' +
            'updated=2022-10-04T16:41:23.858Z\n' +
            'tags=hiru\n' +
            'blockedBy=\n' +
            'blocks=\n' +
            'completed=false\n' +
            '---\n' +
            ''
        },
      ]

      for (const { path, content } of files) {
        path.writeText(content);
      }

      context = initialize({ config });
      ({ fileManager } = context)
    });

    it("the problem is reported", () => {
      /**
       * Not sure how to report this yet, perhaps a Rust-like Outcome enum?
       * There will probably be multiple type of errors and you want to print them all at once
       *    - be careful in case you end up building something unnecessarily sophisticated
       */
      const taskPath = fileManager.getTaskPath({ taskId: "aaaaaaaaaa" })
      const viewPath = fileManager.getViewPath({ id: "1111111111" })

      const report = verify(context);
      expect(report).toEqual(new WipmanDirHealthReport({
        disconnectedTaskViewPair: [
          {
            task: taskPath,
            view: viewPath,
            problems: [
              DisconnectedTaskViewPairProblem.expectedTaskInViewButNotFound,
            ],
          }
        ],
      }))
    });
  });
});
