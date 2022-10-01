import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { DocumentSelector } from "vscode";
import { TextDecoder } from "util";
import log from "./logs";

const HOME_PATH = `${os.homedir()}`;

type Group = string; // e.g.: "foo" --> will be "#g:foo"

class GroupTagCompletionProvider implements vscode.CompletionItemProvider {
  constructor(private readonly group: Group) {}

  public provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.CompletionItem[]> {
    const kind = vscode.CompletionItemKind.Text;
    const label = this.group; // label shown in the completion pop up
    const itemA = new vscode.CompletionItem(label, kind);
    itemA.filterText = this.group; // user input is matched against this
    itemA.insertText = `g:${this.group}`; // string inserted after the triggerCharacters
    return [itemA];
  }
}

function getGroupTagCompletionProvider(group: Group): GroupTagCompletionProvider {
  const provider = new GroupTagCompletionProvider(group);
  return provider;
}

function buildCompletionsForGroupTags(
  groups: Group[],
  language: DocumentSelector,
  triggerCharacters: string[],
): vscode.Disposable[] {
  const autocompletionPerGroupTag = groups
    .map(getGroupTagCompletionProvider)
    .map((provider: GroupTagCompletionProvider) => {
      const groupTagCompletion = vscode.languages.registerCompletionItemProvider(
        language,
        provider,
        ...triggerCharacters,
      );
      return groupTagCompletion;
    });

  return autocompletionPerGroupTag;
}

async function fileExists(path: string): Promise<boolean> {
  return new Promise(resolve => {
    fs.access(path, fs.constants.F_OK, err => {
      if (err) {
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

function throwError(message: string): void {
  log.error(message);
  throw new Error(message);
}

async function readFile(path: string): Promise<string> {
  return new Promise(resolve => {
    fs.readFile(path, (_, raw: ArrayBuffer) => {
      const decoder = new TextDecoder();
      const text = decoder.decode(raw);
      resolve(text);
    });
  });
}

export function removeTrailingCommas(withCommas: string): string {
  return withCommas
    .replace(/(\s\s)+"/g, `"`)
    .replace(/(\n)*/g, "")
    .replace(/,\s*]/g, "]")
    .replace(/,\s*}/g, "}");
}

async function loadJsonWithTrailingCommas(path: string): Promise<RawConfig> {
  const jsonWithTrailingCommas = await readFile(path);
  const jsonString = removeTrailingCommas(jsonWithTrailingCommas);

  try {
    return JSON.parse(jsonString);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throwError(`Failed to parse WIP config: ${error.message}`);
    }

    throw error;
  }
}

interface RawConfig {
  tags: Group[];
}

class Config {
  constructor(public readonly tags: Group[]) {}

  public static parse(rawConfig: RawConfig): Config {
    Config.assertPropertyExists(rawConfig, "tags");
    return new Config(rawConfig["tags"]);
  }

  private static assertPropertyExists(rawConfig: RawConfig, propertyName: string): void {
    if (!rawConfig.hasOwnProperty(propertyName)) {
      throwError(`Failed to parse config: property "${propertyName}" must be present`);
    }
  }
}

async function readGroupsFromWipConfig(): Promise<Group[]> {
  // TODO: allow configuring this path via contributes
  const configFilePath = path.resolve(HOME_PATH, ".config", "wip-manager", "config.json");
  log.info(`Reading groups from ${configFilePath}`)
  const configFileExists = await fileExists(configFilePath);

  if (!configFileExists) {
    throwError(`wipman config file expected at ${configFilePath}, but not found`);
  }

  const raw = await loadJsonWithTrailingCommas(configFilePath);
  const config = Config.parse(raw);
  const groupNames = config.tags;

  return groupNames;
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  const language: DocumentSelector = { language: "markdown" };
  const triggerCharacters = ["#"];

  readGroupsFromWipConfig().then(
    (groupNames: Group[]) => {
      // TODO: refactor this function into chained functions
      log.info('Person autocompletion loaded');
      const completions = buildCompletionsForGroupTags(
        groupNames,
        language,
        triggerCharacters,
      );
      context.subscriptions.push(...completions);
    },
    (reason: Error) => {
      vscode.window.showErrorMessage(reason.message);
    },
  );
}

// this method is called when your extension is deactivated
export function deactivate() {}
