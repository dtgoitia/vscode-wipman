import * as vscode from 'vscode';

interface LoggerProps {
  channelName: string;
}
class Logger {
  private channel: vscode.OutputChannel;
  constructor({channelName}: LoggerProps) {
    /**
     * To see content pushed to this channel, open the Output, and in the dropdown pick the
     * entry matching the name above.
     */
    this.channel = vscode.window.createOutputChannel(channelName);
  }

  public error(message: string): void {
    this.add(LogLevel.error, message);
  }

  public warning(message: string): void {
    this.add(LogLevel.warning, message);
  }

  public info(message: string): void {
    this.add(LogLevel.info, message);
  }

  public debug(message: string): void {
    this.add(LogLevel.debug, message);
  }
  
  private add(level: LogLevel, message: string): void {
    const line = `[${level}] ${message}`;
    this.channel.appendLine(line);
  }
}

enum LogLevel {
  error = "ERROR",
  warning = "WARNING",
  info = "INFO",
  debug = "DEBUG",
}

const log = new Logger({channelName: "wipman"})

export default log;