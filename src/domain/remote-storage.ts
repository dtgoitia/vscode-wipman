import { todo, unreachable } from "../devex/errors";
import { Path } from "../io";
import log from "../logs";
import { FileAdded, FileChange, FileDeleted, FileManager, FileType, FileUpdated } from "./files/files";
import { readTaskFile } from "./files/taskFiles";
import { readViewFile } from "./files/viewFiles";
import { IFirestoreClient } from "./firestore";
import { Tag, Task, View } from "./model";

// TODO: expose this path in config
export const BUFFER_FILE = new Path(".changes_to_sync");

interface RemoteStorageProps {
  fileManager: FileManager;
  firestoreClient: IFirestoreClient;
}

export class RemoteStorage {
  private fileManager: FileManager;
  private bufferPath: Path;
  private firestoreClient: IFirestoreClient;

  constructor({ fileManager, firestoreClient }: RemoteStorageProps) {
    this.fileManager = fileManager;
    this.firestoreClient = firestoreClient;

    // this.fileManager.changes$.subscribe(async change => this.handleFileChange(change));
    this.bufferPath = this.fileManager.root.join(BUFFER_FILE);
  }

  public async sync(): Promise<void> {
    throw todo();
    log.debug(`RemoteStorage.sync started`)
    if (await this.bufferPath.exists() === false) {
      log.info(`Nothing to sync`);
      return;
    }

    const content = await this.bufferPath.readText();
    const lines = content.trimEnd().split("\n")

    // Keep only latest operations on file
    type RawPath = string
    type Index = number
    const stateTracker: Map<RawPath, Index> = new Map<RawPath, Index>();

    // Array to validate the different operations each file suffers, and to squash the
    // operations of each file (optimization)
    const recordSequence: (ChangeRecord | undefined)[] = [];


    const invalid = (message: string, path: Path): string =>
      `INVALID OPERATION SEQUENCE: ${message}, path: ${path.toString()}`;

    lines.forEach((line, index) => {
      // log.debug(`RemoteStorage.sync::start iteration ${index} ${line}`);
      const change = ChangeRecord.deserialize(line)

      const changeKey: RawPath = change.path.toString();
      // log.debug(`RemoteStorage.sync::looking for the index of the last record for ${mapKey}`);
      const previousIndex = stateTracker.get(changeKey);
      // log.debug(`RemoteStorage.sync::previousIndex=${previousIndex}`);

      if (previousIndex === undefined) {
        // log.debug(`RemoteStorage.sync::track file for first time`);
        stateTracker.set(changeKey, index);
        recordSequence[index] = change;
        // log.debug(`RemoteStorage.sync::end iteration ${index}`);
        return;
      }

      // Validate that the squence of operations each file receives is valid
      const previousRecord = recordSequence[previousIndex];
      if (previousRecord === undefined) {
        throw unreachable("'previousRecord' should have never beeen undefined - bug");
      }

      const previous = previousRecord.operation;
      const current = change.operation;

      switch (true) {
        case previous === OperationType.delete && current === OperationType.update:
          throw new Error(invalid(`file previously deleted, cannot be updated`, change.path));

        case previous === OperationType.add && current === OperationType.add:
          throw new Error(invalid(`file previously added, cannot be added again`, change.path));

        case previous === OperationType.update && current === OperationType.add:
          throw new Error(invalid(`file previously updated, cannot be added again`, change.path));
      }

      // Drop last related record from sequence
      recordSequence[previousIndex] = undefined;

      // Add new index
      stateTracker.set(changeKey, index);
      recordSequence[index] = change;
      // log.debug(`RemoteStorage.sync::end iteration ${index}`);
    });

    const squashedRecords = recordSequence.filter(x => x) as ChangeRecord[];

    // Collect from files only changed tasks and views
    const setTasks: Task[] = [];
    const setViews: View[] = [];
    const deleteTasks: Task[] = [];
    const deleteViews: View[] = [];
    for (const change of squashedRecords) {
      const item: Task | View = await this.readChangedFile(change);

      if (change.operation === OperationType.add || change.operation === OperationType.update) {
        switch (change.type) {
          case FileType.task: setTasks.push(item as Task); continue;
          case FileType.view: setViews.push(item as View); continue;
        }
      }

      if (change.operation === OperationType.delete) {
        switch (change.type) {
          case FileType.task: deleteTasks.push(item as Task); continue;
          case FileType.view: deleteViews.push(item as View); continue;
        }
      }
    }

    this.firestoreClient.batchProcess({ setTasks, setViews, deleteTasks, deleteViews });
    log.debug(`RemoteStorage.sync ended`)
  }

  private async handleFileChange(change: FileChange): Promise<void> {
    log.debug(`RemoteStorage.handleFileChange::change=${change}`);

    let record: ChangeRecord | undefined = undefined;

    if (change === null) {
      return
    } else if (change instanceof FileAdded) {
      record = new ChangeRecord(change.type, OperationType.add, change.path);
    } else if (change instanceof FileUpdated) {
      record = new ChangeRecord(change.type, OperationType.update, change.path);
    } else if (change instanceof FileDeleted) {
      record = new ChangeRecord(change.type, OperationType.delete, change.path);
    } else {
      throw new Error(`Unsupported change: ${JSON.stringify(change)}`)
    }

    if (record === undefined) return;

    await this.addChangeRecord(record);
  }

  private async addChangeRecord(change: ChangeRecord): Promise<void> {
    /*
    TODO: perhaps for phase 2: read buffer file and remove any duplicated operations
      - DON'T DO THIS YET, check first how many records do you get with normal usage.
        maybe it's worth squashing just before syncing to avoid re-reading the buffer
        file unnecessarily, you can read it once and process everything in one go just
        before sync
     */
    await this.bufferPath.append(`${change.serialize()}\n`);
  }

  private async readChangedFile(change: ChangeRecord): Promise<Task | View> {
    log.debug(change)
    switch (change.type) {
      case FileType.task:
        const task: Task = await readTaskFile(change.path);
        return task;

      case FileType.view:
        const [view]: [View, Set<Tag>] = await readViewFile(change.path);
        return view;

      default:
        throw unreachable(`'${change.type}' is an unsupported value for ChangeRecord.type`);
    }
  }
}

enum OperationType {
  add = "add",
  update = "upd",
  delete = "del",
  // TODO: do you need `rename`?
}

class ChangeRecord {
  public id: string;

  constructor(
    public readonly type: FileType,
    public readonly operation: OperationType,
    public readonly path: Path,
  ) {
    this.id = this.serialize();
  }

  public serialize(): string {
    return [this.type, this.operation, this.path.toString()].join("::");
  }

  public static deserialize(raw: string): ChangeRecord {
    const [rawType, rawOperation, rawPath] = raw.split("::");

    const operation = {
      [OperationType.add]: OperationType.add,
      [OperationType.update]: OperationType.update,
      [OperationType.delete]: OperationType.delete,
    }[rawOperation] as OperationType;

    const type = FileType[rawType as keyof typeof FileType];

    const path = new Path(rawPath);
    return new ChangeRecord(type, operation, path);
  }
}

