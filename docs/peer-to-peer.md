# Using peer-to-peer connection to sync devices

## Context

* Use cases:
  - A single user keeps a couple of devices in sync, no more.
  - No support for many devices.
  - A user wants to work both the laptop and the phone, but -like Anki- both must sync before working.

* Technology:
  - DynamoDB looks like a not-simple tech.
  - Peer to peer allows you to share as much data as you want - no traffic limit.

## POtential solutions

* Phase 1: you don't change stuff in both places at the same time. In other words, if node X changes, node Y will not change until it gets updated to latest state.
* Phase 2: both devices can update simultaneously and reconcile - hard problem - even git did not solve that, or Anki.

Given a node X that is offline
And a node Y that is online
And both nodes are in sync
When X makes a change
And X goes online
Then node Y gets the changes of X
And both nodes are in sync

Given a node X that is online
And a node Y that is online
And both nodes are in sync
When X makes a change
Then node Y gets the changes of X
And both nodes are in sync


## Node startup process

1. Scan current state
2. Ask for changes since last was awake and apply them
3. Start server - to react to peer
