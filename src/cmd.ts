import * as child_process from "child_process";
import * as fs from "fs";
import { Stream } from "stream";

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
  abstract getStream(): Promise<{ stream: Stream }>;

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
    let input = await this.getStream();
    input.stream.pipe(writeStream);
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

class CmdFile extends CmdSource {
  constructor(public path: string) {
    super();
  }

  async getStream(): Promise<{ stream: any }> {
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
      stream: readStream,
    };
  }
}

class CmdStringStream {
  constructor(public text: string) {}

  pipe(outStream: any) {
    outStream.write(this.text);
    outStream.end();
  }
}

class CmdString extends CmdSource {
  constructor(public text: string) {
    super();
  }

  async getStream(): Promise<{ stream: any }> {
    return {
      stream: new CmdStringStream(this.text),
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

  async getStream(): Promise<{ stream: any }> {
    let proc = (await this.baseRun()).proc;

    return {
      stream: proc.stdout,
    };
  }

  async baseRun({
    stdout = "pipe",
    stderr = "pipe",
  }: { stdout?: "pipe" | Stream; stderr?: "pipe" | Stream } = {}): Promise<{
    proc: child_process.ChildProcess;
  }> {
    let sourceStream = await this.source?.getStream();
    let stdin: "pipe" | Stream =
      sourceStream === undefined
        ? "pipe"
        : sourceStream.stream instanceof CmdStringStream
        ? "pipe"
        : sourceStream.stream;

    let proc = child_process.spawn(this.command[0], this.command.slice(1), {
      cwd: this.cwd,
      stdio: [stdin, stdout, stderr],
      env:
        this.env === undefined ? process.env : { ...process.env, ...this.env },
    });

    if (
      sourceStream !== undefined &&
      sourceStream.stream instanceof CmdStringStream
    ) {
      sourceStream.stream.pipe(proc.stdin);
    }

    return { proc };
  }

  async run() {
    let proc = (
      await this.baseRun({ stdout: process.stdout, stderr: process.stderr })
    ).proc;

    await new Promise<void>((resolve, reject) => {
      proc.on("error", (err) => {
        reject(err);
      });
      proc.on("close", async (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new CmdError(code, ""));
        }
      });
    });
  }

  async get() {
    let proc = (await this.baseRun()).proc;

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
          reject(new CmdError(code, stderrTxt));
        }
      });
    });

    return stdoutTxt;
  }
}

export class CmdError extends Error {
  constructor(public code: number | null, public stderr: string) {
    super(`Command failed with code ${code}. Stderr:\n${stderr}`);
    Object.setPrototypeOf(this, CmdError.prototype);
  }
}

type StdinType =
  | { type: "string"; value: string }
  | { type: "stream"; stream: { fd: null | number } }
  | { type: "ignore" };

type StdoutType =
  | { type: "stream"; stream: any }
  | { type: "pipe"; pipe: any }
  | { type: "ignore" };
