## VSCode extension vs standalone daemon

I like the idea of [using a standalone systemd daemon](./2022-10-17-sync-laptop-data.md). But the truth is that:
  - I have already built most of the stuff I need in TypeScript
  - I am struggling to ship a working MVP and motivation fades

Having a separated daemon means that:
  - I need to rewrite a lot of stuff - which is far from ideal in terms of time consumption
  - I loose the ability to distribute it as a VSCode extension (full cross-platform)

So, perhaps in the future I'll write a super fancy Rust daemon agnostic to VSCode, but not yet.

## Storage

Using a MongoDB database sounds cool but:
  - I cannot talk to MongoDB directly from the browser, as it needs a specific and unsupported protocol.
  - The above means I need a backend (more code to maintain/run --> costly)
  - Exposing a local MongoDB in my LAN is not as straight forward as it sounds, because I need to learn still a lot about networking --> not fast.

## Next step

Build support to sync data with Firestore in the VSCode extension.
