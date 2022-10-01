# Client-server vs peer-to-peer

client-server with DynamoDB as storage
  - 🔴 price: free with a limit of usage
  - 🔴 vendor: AWS can remove the free tier anytime
  - 🔴 vendor: DynamoDB is unique, if I need to migrate to another storage, I might need to refactor quite a lot
  - ✅ data redundancy: if clients die, backend keeps a data backup
  - ✅ testability: DynamoDB can run locally in a container
  - ✅ know-how: you know how to use it

peer-to-peer:
  - ✅ price: free
  - ✅ vendor: technology is standard
  - ✅ data redundancy: once 2 clients are online at the same time, data is backed up
  - ? testability?
  - ?🔴 vscode: it seems that vscode does not support WebRTC
  - ? PWA: each P2P node must run a server, in a PWA must be run in a Service Worker, PWA kill
  - 🔴 know-how: you need to learn how to use this new paradigm

My use case:
  - My phone is up most of the time.
  - My laptop is up frequently.
  - My phone and my laptop are in the same LAN most of the time.
  - Due to the above, the data will be backed up frequently, so in case of data loss, the loss will be minimal.


I'm starting to loose motivation with this project, and I want to leave it in an MVP stage.
I'll go with DynamoDB, whose cons are not massive for the time being. I'll probably explore the P2P approach in the future, to remove AWS from the equation.
