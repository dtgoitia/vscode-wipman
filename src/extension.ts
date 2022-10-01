import * as vscode from "vscode";
import getVSCodeOnSaveHandler from "./commands/onSave";
import { todo, unreachable } from "./devex/errors";
import { Config } from "./domain/config";
import { initialize } from "./domain/extension-api";
import { isWipmanDirectory, IsWipmanDirectoryOutcome } from "./domain/files/files";
import { verify } from "./domain/verify";
import { Path } from "./io";
import log from "./logs";

interface WorkspaceConfiguration {
  wipmanDir: Path;
  debug: boolean | undefined;
}
function parseVSCodeConfig({ raw }: { raw: vscode.WorkspaceConfiguration }): WorkspaceConfiguration {
  log.debug(raw)

  const workspaces = (vscode.workspace.workspaceFolders as vscode.WorkspaceFolder[])
  const cwd = new Path(workspaces[0].uri.fsPath);

  // TODO: make this more versatile to consider more contributes - if any comes along

  let wipmanDir: Path = cwd;
  if (raw.relativePath === null) {
    // No workspace config found for wipman extension - keep wipman dir as workspace dir
  } else if (raw.relativePath !== undefined) {
    wipmanDir = wipmanDir.join(raw.relativePath);
  }

  let debug: boolean | undefined = undefined;
  if (raw.debug === null) {
    // No workspace config found
  } else if (raw.debug !== undefined) {
    debug = raw.debug;
  }

  return { wipmanDir, debug };
}

function informUserThatExtensionCouldntStart({ reason: raw }: { reason: string }): void {
  // Remove last period (.) if any
  const reason = raw.slice(-1) === '.' ? raw.slice(0, -1) : raw;

  const message = `Extension could not start. Reason: ${reason}.` +
    ` Make sure that either (1) you open the workspace in a wipman directory,` +
    ` or (2) your workspace contains a wipman directory somewhere` +
    ` inside and the workspace configuration specifies the wipman directory` +
    ` relative path, or (3) you open the workspace in an empty directory.` +
    ` Remember to reload the window to pick up the new wipman configuration.`;
  log.info(message);
  vscode.window.showInformationMessage(message);
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext): void {

  try {

    const workspaces = vscode.workspace.workspaceFolders;
    if (workspaces === undefined) {
      const reason = "Extension must have a workspace where to work. Extension will not load";
      informUserThatExtensionCouldntStart({ reason });
      return;
    }

    if (workspaces.length > 1) {
      // TODO: add support for multiple workspaces - if one is detected, just act on
      // that workspace
      const reason = `wipman extension can only know how to handle a single` +
        ` workspace and there are ${workspaces.length} workspaces open`;
      informUserThatExtensionCouldntStart({ reason });
      return;
    }

    const workspaceConfig = parseVSCodeConfig({ raw: vscode.workspace.getConfiguration('wipman') });

    // Generate wipman config from workspace config
    const config = new Config({ wipmanDir: workspaceConfig.wipmanDir, debug: workspaceConfig.debug });

    const outcome = isWipmanDirectory({ path: config.wipmanDir });

    switch (outcome) {

      case IsWipmanDirectoryOutcome.doesNotExist: {
        informUserThatExtensionCouldntStart({
          reason: `expected a wipman directory at ${config.wipmanDir.toString()},` +
            ` but this path does not exist.`,
        })
        return;
      }

      case IsWipmanDirectoryOutcome.isEmptyDirectory: {
        // prompt suggestion pop up - dear user, do you want to initialize a wipman directory in this workspace?
        // const message = "This folder is empty. Do you want me to initialize a wipman directory for you in this directory?";
        // log.info(message);
        // vscode.window.showInformationMessage(message);
        todo("Implement the logic to initialize directory");
        break;
      }

      case IsWipmanDirectoryOutcome.isFile: {
        informUserThatExtensionCouldntStart({
          reason: `expected a wipman directory at ${config.wipmanDir.toString()},` +
            ` but this path is a file.`,
        })
        return;
      }

      case IsWipmanDirectoryOutcome.isNotWipmanDir: {
        informUserThatExtensionCouldntStart({
          reason: `expected a wipman directory at ${config.wipmanDir.toString()},` +
            ` but this directory is not a wipman directory.`,
        })
        break;
      }

      case IsWipmanDirectoryOutcome.isWipmanDir:
        // Initialize wipman before hooking it up to VSCode API
        const wipmanContext = initialize({ config })
        const wipmanDirHealthReport = verify(wipmanContext);
        if (wipmanDirHealthReport.problemsFound) {
          log.warning(`Found unhealthy wipman directory:`, wipmanDirHealthReport);
          informUserThatExtensionCouldntStart({
            reason: `one or more files in your wipman directory are corrupted - see` +
              ` wipman logs (in the Output tab > "wipman" channel) for more detail`,
          })
          return;
        }
        log.debug(`wipmanContext.commands:`, wipmanContext.commands);

        // Hook wipman extension up to VSCode API
        wipmanContext
          .commands
          .forEach(
            ({ name, callback }) => {
              log.info(`Registering command: ${name}`)
              const registration = vscode.commands.registerCommand(name, callback);
              context.subscriptions.push(registration);
            }
          );

        vscode.workspace.onDidSaveTextDocument(getVSCodeOnSaveHandler(wipmanContext))
        break;

      default:
        throw unreachable(
          "something went wrong when determining if the workspace directory was a" +
          " wipman directory"
        );

    }
  } catch (error) {
    log.error(error);
    vscode.window.showErrorMessage(`Failed to initialize wipman extension, reason: ${error}`)
  }
}

// this method is called when your extension is deactivated
export function deactivate() { }
