import * as child_process from "child_process";
import * as fs from "fs";
import { Stream, Writable } from "stream";

export function cmd(...input: CmdInput): Cmd {
  let cmdInput = parseCommandInput(input);
  return new Cmd({
    command: cmdInput.command,
    cwd: cmdInput.cwd,
    source: undefined,
    env: cmdInput.env,
  });
}

cmd.file = (path: string) => new CmdFile(path);
cmd.text = (text: string) => new CmdString(text);
cmd.stdin = () => new CmdStdin();

type CmdInput =
  | string[]
  | [{ cmd: string[]; cwd?: string; env?: Record<string, string> }];
function parseCommandInput(input: CmdInput): {
  command: string[];
  cwd?: string;
  env?: Record<string, string>;
} {
  if (input.length === 1 && typeof input[0] !== "string") {
    return { command: input[0].cmd, cwd: input[0].cwd, env: input[0].env };
  }
  return {
    command: input as string[],
  };
}

abstract class CmdSource {
  abstract getStreams(opts: GetStreamsInput): Promise<GetStreamsOutput>;

  pipe(...input: CmdInput) {
    let cmdInput = parseCommandInput(input);
    return new Cmd({
      command: cmdInput.command,
      cwd: cmdInput.cwd,
      source: this,
      env: cmdInput.env,
    });
  }

  async toFile(path: string) {
    let writeStream = fs.createWriteStream(path);

    let streams = await this.getStreams({
      stdin: "ignore",
      stdout: "pipe",
      stderr: "ignore",
    });
    streams.stdout.pipe(writeStream);
    return new Promise<void>((resolve, reject) => {
      writeStream.on("error", (err) => {
        reject(err);
      });
      writeStream.on("close", () => {
        resolve();
      });
    });
  }
}

interface GetStreamsInput {
  stdin: Stream | "ignore";
  stdout: Stream | "pipe" | "ignore";
  stderr: Stream | "pipe" | "ignore";
}
interface GetStreamsOutput {
  stdout: Stream | SyntheticReadStream;
  stderr?: Stream | undefined;
}

class CmdFile extends CmdSource {
  constructor(public path: string) {
    super();
  }

  async getStreams(opts: GetStreamsInput): Promise<GetStreamsOutput> {
    let readStream = fs.createReadStream(this.path);
    await new Promise<void>((resolve, reject) => {
      readStream.on("open", () => {
        resolve();
      });
      readStream.on("error", (err) => {
        reject(err);
      });
    });
    return {
      stdout: readStream,
    };
  }
}

class CmdStdin extends CmdSource {
  async getStreams(opts: GetStreamsInput): Promise<GetStreamsOutput> {
    return {
      stdout: process.stdin,
    };
  }
}

abstract class SyntheticReadStream {
  abstract pipe(outStream: Writable): void;
}

class CmdStringStream extends SyntheticReadStream {
  constructor(public text: string) {
    super();
  }

  pipe(outStream: Writable) {
    outStream.end(this.text);
  }
}

class CmdString extends CmdSource {
  constructor(public text: string) {
    super();
  }

  async getStreams(opts: GetStreamsInput): Promise<GetStreamsOutput> {
    return {
      stdout: new CmdStringStream(this.text),
    };
  }
}

class Cmd extends CmdSource {
  command: string[];
  cwd?: string;
  source?: CmdSource;
  env?: Record<string, string>;

  constructor({
    command,
    cwd,
    source,
    env,
  }: {
    command: string[];
    cwd: string | undefined;
    source: CmdSource | undefined;
    env: Record<string, string> | undefined;
  }) {
    super();
    this.command = command;
    this.cwd = cwd;
    this.source = source;
    this.env = env;
  }

  async getStreams(input: GetStreamsInput): Promise<GetStreamsOutput> {
    let proc = (await this.baseRun(input)).proc;

    return {
      stdout: proc.stdout!,
    };
  }

  async baseRun(input: GetStreamsInput): Promise<{
    proc: child_process.ChildProcess;
  }> {
    let source = await this.source?.getStreams({
      stdin: input.stdin,
      stdout: "pipe",
      stderr: input.stderr,
    });
    let stdin: "pipe" | "ignore" | Stream =
      source === undefined
        ? input.stdin
        : source.stdout instanceof SyntheticReadStream
        ? "pipe"
        : source.stdout;

    let stdout = input.stdout;
    let stderr = input.stderr;

    let proc = child_process.spawn(this.command[0], this.command.slice(1), {
      cwd: this.cwd,
      stdio: [stdin, stdout, stderr],
      env:
        this.env === undefined ? process.env : { ...process.env, ...this.env },
    });

    if (source !== undefined && source.stdout instanceof CmdStringStream) {
      source.stdout.pipe(proc.stdin!);
    }

    return { proc };
  }

  /**
   * Runs a command using streams from the current process:
   * - stdin -> ignore by default
   * - stdout -> `process.stdout`
   * - stderr -> `process.stderr`
   *
   * ```ts
   * // Examples
   * await cmd.stdin().('vim').run();
   * await cmd('yarn', 'build').run();
   * ```
   */
  async run() {
    let proc = (
      await this.baseRun({
        stdin: "ignore",
        stdout: process.stdout,
        stderr: process.stderr,
      })
    ).proc;

    await new Promise<void>((resolve, reject) => {
      proc.on("error", (err) => {
        reject(err);
      });
      proc.on("close", async (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new CmdError(code, this.command));
        }
      });
    });
  }

  /**
   * Runs a command that ignores stdin, stdout and stderr.
   * This is useful for running build commands that should always succeed.
   *
   * ```ts
   * // Example
   * await cmd('yarn', 'build').runSilent();
   * ```
   */
  async runSilent() {
    let proc = (
      await this.baseRun({
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore",
      })
    ).proc;

    await new Promise<void>((resolve, reject) => {
      proc.on("error", (err) => {
        reject(err);
      });
      proc.on("close", async (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new CmdError(code, this.command));
        }
      });
    });
  }

  /**
   * Runs the command and returns stdout as a utf8-encoded string.
   *
   * ```ts
   * // Example
   * let files = await cmd('ls').get();
   * ```
   */
  async get() {
    let proc = (
      await this.baseRun({
        stdin: "ignore",
        stdout: "pipe",
        stderr: "ignore",
      })
    ).proc;

    let stdoutTxt = "";
    proc.stdout!.on("data", (chunk) => {
      stdoutTxt += chunk;
    });

    await new Promise<void>((resolve, reject) => {
      proc.on("error", (err) => {
        reject(err);
      });
      proc.on("close", async (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new CmdError(code, this.command));
        }
      });
    });

    return stdoutTxt;
  }

  /**
   * Runs the command and returns stdout and stderr as utf8-encoded strings.
   *
   * ```ts
   * // Example
   * let { stdout, stderr } = await cmd('docker', 'build').getAll();
   * ```
   */
  async getAll(): Promise<{ stdout: string; stderr: string }> {
    let proc = (
      await this.baseRun({
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      })
    ).proc;

    let stdoutTxt = "";
    proc.stdout!.on("data", (chunk) => {
      stdoutTxt += chunk;
    });

    let stderrTxt = "";
    proc.stderr!.on("data", (chunk) => {
      stderrTxt += chunk;
    });

    await new Promise<void>((resolve, reject) => {
      proc.on("error", (err) => {
        reject(err);
      });
      proc.on("close", async (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new CmdError(code, this.command));
        }
      });
    });

    return { stdout: stdoutTxt, stderr: stderrTxt };
  }
}

export class CmdError extends Error {
  constructor(public code: number | null, public command: string[]) {
    super(`Command ${JSON.stringify(command)} failed with code ${code}`);
    Object.setPrototypeOf(this, CmdError.prototype);
  }
}
