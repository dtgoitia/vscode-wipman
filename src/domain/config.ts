import { Path } from "../io";

export const VIEWS_DIR_NAME = 'views';
export const METADATA_DELIMITER = '---';

interface ConfigProps {
  wipmanDir: Path;
  debug?: boolean;
}

export class Config {
  public wipmanDir: Path;
  public viewsDir: Path;
  public debug: boolean;

  constructor({ wipmanDir, debug }: ConfigProps) {
    this.wipmanDir = wipmanDir;
    this.viewsDir = wipmanDir.join(VIEWS_DIR_NAME);
    this.debug = debug !== undefined ? debug : false;
  }

}
