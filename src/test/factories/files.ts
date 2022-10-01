import { VIEWS_DIR_NAME } from "../../domain/config";
import { BACKLOG_ID } from "../../domain/views";
import { Path } from "../../io";


export function buildFakeWipmanDictectory({ root }: { root: Path }): void {
  const viewsDir = root.join(VIEWS_DIR_NAME);

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
        '- [ ] Task bar  [bbbbbbbbbb](../bb/bbbbbbbb)\n' +
        '- [ ] Task barrrr  [cccccccccc](../cc/cccccccc)\n' +
        '- [x] Task bazzzz  [dddddddddd](../dd/dddddddd)\n' +
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
        '- [ ] Task foo  [aaaaaaaaaa](../aa/aaaaaaaa)\n' +
        '- [ ] Task bar  [bbbbbbbbbb](../bb/bbbbbbbb)\n' +
        ''
    },
    {
      path: viewsDir.join('unused_view.md'),
      content:
        'id=2222222222\n' +
        'title=Unused view\n' +
        'created=2022-10-01T18:00:00.000Z\n' +
        'updated=2022-10-04T16:41:23.858Z\n' +
        'tags=some_unused_tag\n' +
        '---\n' +
        ''
    },
    {
      path: root.join('aa').join("aaaaaaaa"),
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
        'This is the content of the foo task\n' +
        ''
    },
    {
      path: root.join('bb').join("bbbbbbbb"),
      content:
        'id=bbbbbbbbbb\n' +
        'title=Task bar\n' +
        'created=2022-10-01T18:00:00.000Z\n' +
        'updated=2022-10-04T16:41:23.858Z\n' +
        'tags=hiru\n' +
        'blockedBy=\n' +
        'blocks=\n' +
        'completed=false\n' +
        '---\n' +
        'This is the content of the bar task\n' +
        ''
    },
    {
      path: root.join('cc').join("cccccccc"),
      content:
        'id=cccccccccc\n' +
        'title=Task barrrr\n' +
        'created=2022-10-11T18:00:00.000Z\n' +
        'updated=2022-10-14T16:41:23.858Z\n' +
        'tags=\n' +
        'blockedBy=\n' +
        'blocks=\n' +
        'completed=false\n' +
        '---\n' +
        'This is the content of the barrrr task\n' +
        ''
    },
    {
      path: root.join('dd').join("dddddddd"),
      content:
        'id=dddddddddd\n' +
        'title=Task bazzzz\n' +
        'created=2022-10-11T18:00:00.000Z\n' +
        'updated=2022-10-14T16:41:23.858Z\n' +
        'tags=\n' +
        'blockedBy=\n' +
        'blocks=\n' +
        'completed=true\n' +
        '---\n' +
        ''
    },
  ]

  for (const { path, content } of files) {
    path.writeText(content);
  }

}