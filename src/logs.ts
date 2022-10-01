import * as fs from 'fs';
import * as util from 'util';
import * as vscode from 'vscode';
import { todo } from './devex/errors';
import { Path } from './io';
import path = require('path');

interface ILogger {
  error(...items: unknown[]): void;
  warning(...items: unknown[]): void;
  info(...items: unknown[]): void;
  debug(...items: unknown[]): void;
}

interface LoggerProps {
  channelName: string;
  outputFile?: Path;
}

class BaseLogger implements ILogger {
  public error(...items: unknown[]): void {
    const formattedItems = items.map(item => {
      return item instanceof Error
        ? `${item}\n\nStack trace:\n\n${item.stack}`
        : item;
    });

    return this.add(LogLevel.error, formattedItems);
  }

  public warning(...items: unknown[]): void {
    this.add(LogLevel.warning, ...items);
  }

  public info(...items: unknown[]): void {
    this.add(LogLevel.info, ...items);
  }

  public debug(...items: unknown[]): void {
    this.add(LogLevel.debug, ...items);
  }

  private add(level: LogLevel, ...items: unknown[]): void {
    // Find calling function name
    const [file, functionName] = getCaller();

    const message = items
      .map(item => {
        return typeof item === 'string'
          ? item
          : util.inspect(item, { depth: null });
      })
      .join(" ");
    const line = `[${level}] ${file}::${functionName}::${message}`;

    console.log(line)
    // this.channel.appendLine(line);
    this.push(line);
  }

  protected push(line: string): void {
    todo();
  }
}

class VSCodeLogger extends BaseLogger {
  private channel: vscode.OutputChannel;
  private logPath: Path | undefined;

  constructor({ channelName, outputFile }: LoggerProps) {
    super();

    this.logPath = outputFile || undefined;
    if (this.logPath) {
      // Print absolute path to stdout
      console.log('Logs will be appended to:', path.resolve(this.logPath.toString()))
    }

    /**
     * To see content pushed to this channel, open the Output, and in the dropdown pick the
     * entry matching the name above.
     */
    this.channel = vscode.window.createOutputChannel(channelName);
  }
  protected push(line: string): void {
    this.channel.appendLine(line);
    this.logPath && fs.appendFileSync(this.logPath.toString(), `${line}\n`);
  }
}


class TestLogger extends BaseLogger {
  private logPath: Path;

  constructor({ logPath }: { logPath: Path }) {
    super();

    this.logPath = logPath;
  }

  public reportOutputFile(): void {
    console.log('Logs will be appended to:', path.resolve(this.logPath.toString()));
  }

  protected push(line: string): void {
    fs.appendFileSync(this.logPath.toString(), `${line}\n`);
  }
}


function getCaller(): [string, string] {
  const rawStack = new Error().stack as string;
  const frame = rawStack.split("\n").slice(4, 5)[0];
  const [functionName, dirtyFileName] = frame.replace("  at ", "").trim().split(" (");
  const fileName = dirtyFileName === undefined
    ? "undefined"
    : dirtyFileName.slice(0, -1)
  return [fileName, functionName];
}

enum LogLevel {
  error = "ERROR",
  warning = "WARNING",
  info = "INFO",
  debug = "DEBUG",
}

const testLogger = new TestLogger({ logPath: new Path("test.log") });
const vscodeLogger = new VSCodeLogger({ channelName: "wipman" })

function isCodeExecutedInJestTest(): boolean {
  return process.env.JEST_WORKER_ID !== undefined;
}

const log: ILogger = isCodeExecutedInJestTest()
  ? (() => {
    testLogger.reportOutputFile();
    return testLogger;
  })()
  : vscodeLogger;

export default log;