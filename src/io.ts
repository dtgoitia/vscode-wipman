import * as fs from "fs";

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
