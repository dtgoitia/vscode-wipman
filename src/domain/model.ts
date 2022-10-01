export type ISODatetimeString = string; // "2022-07-19T07:11:00+01:00"
export type Hash = string;
export type TaskId = Hash;
export type TaskTitle = string;
export type TaskCompletionStatus = boolean;
export type MarkdownString = string;

export interface Task {
  id: TaskId;
  title: TaskTitle;
  content: MarkdownString;
  created: Date;
  updated: Date;
  tags: Set<Tag>;
  blockedBy: Set<TaskId>; // tasks must be done before the current task
  blocks: Set<TaskId>; // tasks that are blocked until the current task is done
  completed: TaskCompletionStatus;
}

export type Tag = string;

export type ViewId = Hash;
export type ViewTitle = string;
export interface ViewContentLine {
  completed: TaskCompletionStatus,
  title: TaskTitle,
  id?: TaskId,
}
export interface View {
  id: ViewId;
  title: ViewTitle;
  tags: Set<Tag>; // contains all tags in set, later you can add the possibility of more complex queries but don't prematurely optimize
  created: Date;
  updated: Date;
  content: ViewContentLine[];
  // TODO: if you need to index tasks by ID because it becomes slow,
  // then maybe you should create a class is an IndexedQueue: to both
  // have order, but be able to see if a view contains a Task by TaskId
}
