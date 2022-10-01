import { generateHash } from "./domain/hash";
import { Path } from "./io";
import { tmp } from "./test/helpers/testPath";

describe('io', () => {
  let testDir: Path; // make sure you use a different directory per test

  beforeEach(() => {
    testDir = tmp.join(generateHash(2));
  });

  afterEach(() => testDir.delete())
  afterAll(() => tmp.delete())

  describe(`${Path.name}`, () => {
    describe(`when the user asks for the extension of a directory`, () => {
      it('returns undefined', () => {
        const path = testDir.join("foo");
        path.makeDirectory();
        expect(path.extension()).toEqual(undefined);
      });
    });

    describe(`when the user asks for the extension of a directory whose name seems to have an extension`, () => {
      it('returns undefined', () => {
        const path = testDir.join("foo.bar");
        path.makeDirectory();
        expect(path.extension()).toEqual(undefined);
      });
    });

    describe(`when the user asks for the extension of a file without extension`, () => {
      it('returns undefined', () => {
        const path = testDir.join("foo");
        path.touch();
        expect(path.extension()).toEqual(undefined);
      });
    });

    describe(`when the user asks for the extension of a file with extension`, () => {
      it('returns the extension', () => {
        const path = testDir.join("foo.bar");
        path.touch();
        expect(path.extension()).toEqual(".bar");
      });
    });
  });
});