import * as fs from "fs";
import * as path from "path";

export class Path {
  /**
   * Equivalent to Python's pathlib.Path
   */
  constructor(private readonly path: string) { }

  public toString(): string {
    return this.path;
  }

  public name(): string {
    return path.parse(this.path).base;
  }

  public stem(): string | undefined {
    if (this.isDirectory()) {
      return undefined;
    }

    return path.parse(this.path).name;
  }

  public extension(): string | undefined {
    if (this.isDirectory()) {
      return undefined;
    }
    const extension = path.parse(this.path).ext;
    if (extension === "") {
      return undefined;
    }

    return extension;
  }

  public parent(): Path {
    return new Path(path.parse(this.path).dir);
  }

  public exists(): boolean {
    return fs.existsSync(this.path);
  }

  public join(child: string | Path): Path {
    return new Path(path.join(this.path, child.toString()));
  }

  /**
   * Returns all directories and files inside the path.
   */
  public walk(): Path[] {
    if (this.exists() === false) {
      return [];
    }

    if (this.isFile()) {
      return [];
    }

    const children = fs.readdirSync(this.path);
    return children.map(file => this.join(file));
  }

  public isFile(): boolean {
    const stats = fs.lstatSync(this.path);
    return stats.isFile();
  }
  public isDirectory(): boolean {
    const stats = fs.lstatSync(this.path);
    return stats.isDirectory();
  }

  public readText(): string {
    // Note: EISDIR = "Error, Is Directory"
    return fs.readFileSync(this.path, { encoding: "utf-8" });
  }

  public writeText(text: string): void {
    if (this.exists() === false) {
      this.parent().makeDirectory();
    }

    return fs.writeFileSync(this.path, text);
  }

  public makeDirectory(): void {
    fs.mkdirSync(this.path, { recursive: true });
  }

  public equals(path: Path): boolean {
    return this.path === path.path;
  }

  public lastUpdated(): Date {
    const stats = fs.statSync(this.path);
    return stats.mtime
  }

  public delete(): void {
    return fs.rmSync(this.path, { recursive: true, force: true });
  }

  /**
   * NOTE: it's the callers responsibility to add any desired new-line characters
   */
  public append(characters: string): void {
    fs.appendFileSync(this.path, characters);
  }

  public isEmpty(): boolean {
    try {
      const openDir = fs.opendirSync(this.path);
      const isEmpty = openDir.readSync() === null;
      openDir.closeSync();
      return isEmpty;
    } catch (error) {
      return false;
    }
  }

  public touch(): void {
    const now = new Date();
    try {
      // If exists, update "update time"
      fs.utimesSync(this.path, now, now);
    } catch (error) {
      // else, just create it
      this.writeText("");
    }
  }
}