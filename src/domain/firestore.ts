import { FirebaseApp, FirebaseOptions, initializeApp } from "firebase/app";
import {
  collection,
  connectFirestoreEmulator,
  doc,
  DocumentData,
  DocumentReference,
  Firestore,
  getDocs,
  getFirestore, query, QuerySnapshot, Timestamp, where, writeBatch
} from "firebase/firestore";
import { todo } from "../devex/errors";
import log from "../logs";
import { FileType } from "./files/files";
import { Task, TaskId, View, ViewId } from "./model";

interface FirestoreTask extends Task {
  // Should this be a separate Enum? "File"Type sounds out of context here :S - think about it
  type: FileType;
}

interface FirestoreView extends View {
  // Should this be a separate Enum? "File"Type sounds out of context here :S - think about it
  type: FileType;
}

export interface BatchProcessArgs {
  setTasks?: Task[];
  deleteTasks?: Task[];
  setViews?: View[];
  deleteViews?: View[];
}

export interface IFirestoreClient {
  batchProcess({ setTasks, deleteTasks, setViews, deleteViews }: BatchProcessArgs): Promise<void>;
}

export class FirestoreClient implements IFirestoreClient {
  private readonly tasksCollection: string = "tasks";
  private readonly viewsCollection: string = "views";
  private app: FirebaseApp;
  private db: Firestore;

  constructor({ fireBaseConfig }: { fireBaseConfig: FirebaseOptions }) {
    this.app = initializeApp(fireBaseConfig);
    this.db = getFirestore(this.app);
    connectFirestoreEmulator(this.db, 'localhost', 8723);
  }

  public async batchProcess({ setTasks, deleteTasks, setViews, deleteViews }: BatchProcessArgs): Promise<void> {
    const castedSetTasks: FirestoreTask[] = setTasks?.map(task => ({ ...task, type: FileType.task })) || [];
    const castedSetViews: FirestoreView[] = setViews?.map(view => ({ ...view, type: FileType.view })) || [];
    const castedDeleteTasks: FirestoreTask[] = deleteTasks?.map(task => ({ ...task, type: FileType.task })) || [];
    const castedDeleteViews: FirestoreView[] = deleteViews?.map(view => ({ ...view, type: FileType.view })) || [];

    castedSetTasks.forEach(task => log.debug(task));
    castedSetViews.forEach(view => log.debug(view));
    castedDeleteTasks.forEach(task => log.debug(task));
    castedDeleteViews.forEach(view => log.debug(view));

    /**
     * TODO: what does the webapp needs to only fetch changed items since last fetch
     * - all items
     * - changes collection, with changes by date::
     * - 
     */
    todo();
  }

  public async setTasks(tasks: Task[]): Promise<void> {
    log.debug(`FirestoreClient.setTasks::ids=`, tasks);
    const batch = writeBatch(this.db);
    tasks.forEach((task) => {
      const ref = this.getTaskDocRef(task.id);
      batch.set(ref, serializeTask(task));
    });
    await batch.commit();
    log.debug(`FirestoreClient.setTasks:: completed without error`);
  }

  public async deleteTasks(ids: TaskId[]): Promise<void> {
    // TODO: perhaps I don't want to delete, but instead just mark as deleted and garbage collect each day?
    log.debug(`FirestoreClient.deleteTasks::ids=`, ids);
    const batch = writeBatch(this.db);
    ids.forEach((id) => {
      const ref = this.getTaskDocRef(id);
      batch.delete(ref);
    });
    await batch.commit();
    log.debug(`FirestoreClient.deleteTasks:: completed without error`);
  }

  public async setViews(views: View[]): Promise<void> {
    log.debug(`FirestoreClient.setViews::ids=`, views);
    const batch = writeBatch(this.db);
    views.forEach((view) => {
      const ref = this.getViewDocRef(view.id);
      batch.set(ref, serializeView(view));
    });
    await batch.commit();
    log.debug(`FirestoreClient.setViews:: completed without error`);
  }

  public async deleteViews(ids: ViewId[]): Promise<void> {
    // TODO: perhaps I don't want to delete, but instead just mark as deleted and garbage collect each day?
    log.debug(`FirestoreClient.deleteViews::ids=`, ids);
    const batch = writeBatch(this.db);
    ids.forEach((id) => {
      const ref = this.getViewDocRef(id);
      batch.delete(ref);
    });
    await batch.commit();
    log.debug(`FirestoreClient.deleteViews:: completed without error`);
  }

  public async getAllTasks(): Promise<Task[]> {
    const everyDocument = where("id", "!=", "");

    const snapshots: QuerySnapshot<DocumentData>[] = await Promise.all(
      [this.tasksCollection, this.viewsCollection]
        .map(name => collection(this.db, name))
        .map(collection => query(collection, everyDocument))
        .map(query => getDocs(query))
    );

    return snapshots
      .flatMap(snapshot => snapshot.docs)
      .map(doc => doc.data())
      .map(storableTask => deserializeTask(storableTask as unknown as StorableTask));
  }

  private getTaskDocRef(taskId: TaskId): DocumentReference<DocumentData> {
    return doc(this.db, this.tasksCollection, taskId);
  }

  private getViewDocRef(viewId: ViewId): DocumentReference<DocumentData> {
    return doc(this.db, this.viewsCollection, viewId);
  }
}


type ConvertSetToArray<T> = T extends Set<string> ? Array<string> : T;
type ConvertDatesToTimestamp<T> = T extends Date ? Timestamp : T;

type ConvertSetsToArrays<T> = {
  [PropertyKey in keyof T]: ConvertSetToArray<T[PropertyKey]>;
}

type ConvertDatesToTimestamps<T> = {
  [PropertyKey in keyof T]: ConvertDatesToTimestamp<T[PropertyKey]>;
}

// https://kamranicus.com/typescript-overriding-specific-property-types-mapped-conditional/
type StorableTask = ConvertDatesToTimestamps<ConvertSetsToArrays<Task>>;
type StorableView = ConvertDatesToTimestamps<ConvertSetsToArrays<View>>;

function serializeTask(task: Task): StorableTask {
  return {
    ...task,
    created: Timestamp.fromDate(task.created),
    updated: Timestamp.fromDate(task.updated),
    tags: setToArray(task.tags),
    blockedBy: setToArray(task.blockedBy),
    blocks: setToArray(task.blocks),
  };
}

function deserializeTask(task: StorableTask): Task {
  return {
    ...task,
    created: task.created.toDate(),
    updated: task.updated.toDate(),
    tags: arrayToSet(task.tags),
    blockedBy: arrayToSet(task.blockedBy),
    blocks: arrayToSet(task.blocks),
  }
}

function serializeView(view: View): StorableView {
  return {
    ...view,
    created: Timestamp.fromDate(view.created),
    updated: Timestamp.fromDate(view.updated),
    tags: setToArray(view.tags),
  };
}

function setToArray<T>(set: Set<T>): T[] {
  const array: T[] = [];
  for (const item of set) {
    array.push(item);
  }
  return array;
}

function arrayToSet<T>(array: T[]): Set<T> {
  return new Set(array);
}