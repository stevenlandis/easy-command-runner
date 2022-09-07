import * as child_process from "child_process";
import * as fs from "fs";

export function cmd(...input: CmdInput): Cmd {
  let cmdInput = parseCommandInput(input);
  return new Cmd({
    command: cmdInput.command,
    cwd: cmdInput.cwd,
    source: undefined,
  });
}

cmd.file = (path: string) => new CmdFile(path);

type CmdInput = string[] | [{ cmd: string[]; cwd?: string }];
function parseCommandInput(input: CmdInput): {
  command: string[];
  cwd?: string;
} {
  if (input.length === 1 && typeof input[0] !== "string") {
    return { command: input[0].cmd, cwd: input[0].cwd };
  }
  return {
    command: input as string[],
  };
}

abstract class CmdSource {
  abstract getStream(): Promise<{ stream: any }>;

  pipe(...input: CmdInput) {
    let cmdInput = parseCommandInput(input);
    return new Cmd({
      command: cmdInput.command,
      cwd: cmdInput.cwd,
      source: this,
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

class Cmd extends CmdSource {
  command: string[];
  cwd?: string;
  source?: CmdSource;

  constructor({
    command,
    cwd,
    source,
  }: {
    command: string[];
    cwd: string | undefined;
    source: CmdSource | undefined;
  }) {
    super();
    this.command = command;
    this.cwd = cwd;
    this.source = source;
  }

  async getStream(): Promise<{ stream: any }> {
    let stdin = await this.source?.getStream();

    let proc = child_process.spawn(this.command[0], this.command.slice(1), {
      cwd: this.cwd,
      stdio: [stdin?.stream ?? "pipe", "pipe", "pipe"],
    });

    let stderrTxt = "";
    proc.stderr.on("data", (chunk) => {
      stderrTxt += chunk;
    });

    return {
      stream: proc.stdout,
    };
  }

  async get() {
    let stdin = await this.source?.getStream();

    let proc = child_process.spawn(this.command[0], this.command.slice(1), {
      cwd: this.cwd,
      stdio: [stdin?.stream ?? "pipe", "pipe", "pipe"],
    });

    let stdoutTxt = "";
    proc.stdout.on("data", (chunk) => {
      stdoutTxt += chunk;
    });

    let stderrTxt = "";
    proc.stderr.on("data", (chunk) => {
      stderrTxt += chunk;
    });

    await new Promise<void>((resolve, reject) => {
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

function baseRunCmd(
  command: string[],
  cwd: string | undefined,
  stdin: StdinType,
  stdout: StdoutType
) {
  let proc = child_process.spawn(command[0], command.slice(1), {
    cwd,
    // stdio: [finalStdin, finalStdout, finalStderr]
  });
}
