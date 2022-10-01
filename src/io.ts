import * as fs from "fs";
import * as path from "path";

export async function fileExists(path: string): Promise<boolean> {
  return new Promise(resolve => {
    fs.access(path, fs.constants.F_OK, err => {
      if (err) {
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

export class Path {
  /**
   * Equivalent to Python's pathlib.Path
   */
  constructor(private readonly path: string) {}

  public toString(): string {
    return this.path;
  }

  public name(): string {
    return path.parse(this.path).name;
  }

  public parent(): Path {
    // TODO: remove if this is not used
    return new Path(path.parse(this.path).dir);
  }

  public async exists(): Promise<boolean> {
    return fileExists(this.path);
  }

  public join(child: string): Path {
    return new Path(path.join(this.path, child));
  }

  public async walk(): Promise<Path[]> {
    if (await this.isFile()) {
      return [];
    }

    const children = await fs.promises.readdir(this.path);
    return children.map(file => this.join(file));
  }

  public async isFile(): Promise<boolean> {
    const stats = await fs.promises.lstat(this.path);
    return stats.isFile();
  }
  public async isDirectory(): Promise<boolean> {
    const stats = await fs.promises.lstat(this.path);
    return stats.isDirectory();
  }

  public async readText(): Promise<string> {
    // Note: EISDIR = "Error, Is Directory"
    return fs.promises.readFile(this.path, {encoding: "utf-8"});
  }
}