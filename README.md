# wipman extension for VSCode

## Extension development

* Install project dependencies:

  ```bash
  npm install  # do not use `npm ci`
  ```

* Debug the extension in VSCode:

  1. Run TypeScript compiler: `npm run watch`.
  1. Open `src/extension.ts` in your editor.
  1. Press `F5`.
  1. Once the new VSCode instance is launched, select the Markdown language.

* Publish extension:

  1. Manually bump version:

      ```bash
      npm version patch  # major/minor/patch/...
                         # see `npm version --help` for more options
      ```
    
      Check [published versions](https://marketplace.visualstudio.com/items?itemName=dtgoitia.wpiman) if you are unsure about whether you need to bump the version or not.
  
  1. Push latest changes: `git push`

  1. Go to [CI](https://app.circleci.com/pipelines/github/dtgoitia/vscode-wpiman) and **manually approve** to publish.

* (**AVOID WHEN POSSIBLE**, use CI instead)
  Manually publish the extension:

  1. Set up credentials as environment variables:

      - `VSCODE_PUBLISHER_ID`: publisher ID, see [here][1] for more context.
      - `VSCE_PAT`: personal access token, follow [these instructions][1] to get one.

  1. Publish the extension bumping the version:

      ```bash
      npm run publish minor  # major/minor/patch/...
                             # see `npm version --help` for more options
      ```

  This will bundle the extension with `webpack` (same as `npm run vscode:prepublish`) and upload it to the extension marketplace.

## Known Issues

...

## Release Notes

### 0.0.1

* First working POC.
