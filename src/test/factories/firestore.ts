import { BatchProcessArgs, IFirestoreClient } from "../../domain/firestore";

export class FakeFirestoreClient implements IFirestoreClient {
  public calls: unknown[] = [];
  public async batchProcess(args: BatchProcessArgs): Promise<void> {
    this.calls.push(args);
  }
}