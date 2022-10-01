I think I was too focused in building a VSCode extension that would do everything that needed to be done in the laptop.
The truth is that VSCode is a great backend, but I think I prefer to have a systemd process

Wrong focus:
  - vscode must do everything, as in full-stack-app (wrong)
  - I must sync over the internet (wrong) - I'll be in my home LAN most of the time, leave the cross-internet thing for later on

**Conclusion**:
  - Run local MongoDB to push changes from both phone app and vscode, and see how it goes.
    - ✅ free
    - ✅ no quota limits
    - ✅ open source - DynamoDB is proprietary
    - you can measure usage, and decide if you want to go with online DynamoDB or find an alternative
  - Use a local backend to take care of sync - as opposed to using VSCode:
    - ✅ you can use any language (Rust!)
    - ✅ you can use this system with any other IDE - do I really care about supporting other IDEs? I would move all the file fiddling outside the extension then... but then you have the distribution
    - 🔴 no cross-platform distribution - a VSCode extension is cross-platform out of the box --> am I going to ever need go to outside Linux? doubt it

  [See why the above does not make sense right now](./2022-11-04-sync-laptop-data.md)
