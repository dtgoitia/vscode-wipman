## Testing

Date: 2022-11-18 08:38:00 +00:00

### Context

When the user saves, a lot of events are propagated. From a testing perspective, you want to assert the final state of files and in-memory indexes to know the user interaction was processed as expected.

### Problem

How do you know when to invoke the `done` Jest function to finish the test?

### Potential solutions

Option A: manually anticipate how many interactions are going to happen in the test based on the number of Tasks and Views in the wipmanDir and on the operation being tested.
  - Pros/cons:
  - ✅ pro: does not require more production code
  - 🟥 con: you are testing implementation details << deal breaker
    - if in the future you opt to emit different events, you should still reach the same end state and the test should not need to be updated. However, if you need to be counting emissions of this or that... you will need to change the test as soon as the implementation changes a bit
  - 🟥 con: hard test maintenance
    - if you add/remove a Task from the initial wipmanDir fixture because a future tests needs it... you will need to update a tone of tests that require a lot of context and are not easy to reason about

Option B: create a TransactionManager to track any ongoing operations
  - Implementation details:
    - When a user interacts (onSave, etc.), the TransactionManager provides a unique Transaction ID.
    - When all the synchronous propagations finish, the top level orchestrator (onSave, etc.) notifies to the TransactionManager.
    - Then the TransactionManager.completedTransactions$ emits the ID of the completed Transaction
    - Then the test knows it can assert the current state, once all the changes are completed.
    - Optionally: each time a side effect is generated, this Transaction ID can be passed to include in the logs, in case Transactions ever overlap.

  **ASSUMPTION**: all the events are propagated synchronously.
    - if this is not the case, the orchestrator (onSave, etc.) will notify the TransactionManager that the Transaction is complete before the side effects finish 😱, because side effects will be enqueued in the event loop.

  - Pros/cons:
    - ✅ pro: you can know when the propagation effects of a user operation are over.
    - ✅ pro: easy test maintenance
    - ✅ pro: makes buffering much easier to push data to remote storages and making calls on every intermediate step
    - 🟥 con: requires some more production code

### Conclusion

I think option B is worth having, it will considerably simplify testing, and it will not add that much overhead to production.

### Conclusion 2

Because the events are sync, there is no need to have any TransactionManager at all.
