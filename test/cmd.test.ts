import { cmd, CmdError } from "../src";
import * as fs from "fs";
import * as path from "path";
import * as child_process from "child_process";

const testFolder = "temp-test-folder";
beforeAll(async () => {
  await fs.promises.mkdir(testFolder);
});

afterAll(async () => {
  await fs.promises.rm(testFolder, { recursive: true, force: true });
});

const getUniqueName = (() => {
  let count = 0;
  return () => `file${count++}`;
})();

let oldEnvVars = { ...process.env };
afterEach(() => {
  process.env = oldEnvVars;
});

describe("cmd", () => {
  it("run basic command", async () => {
    let out = await cmd("echo", "hey").get();
    expect(out).toBe("hey\n");
  });

  it("basic pipe", async () => {
    let out = await cmd("echo", "hi").pipe("cat").pipe("cat").get();
    expect(out).toBe("hi\n");
  });

  it("pipe from file", async () => {
    let filePath = path.join(testFolder, getUniqueName());
    await fs.promises.writeFile(filePath, "some text\nsome more text", {
      encoding: "utf8",
    });
    let out = await cmd.file(filePath).pipe("cat").get();
    expect(out).toBe("some text\nsome more text");
  });

  it("error on pipe from unknown file", async () => {
    let filePath = path.join(testFolder, "unknownFile");
    await expect(cmd.file(filePath).pipe("cat").get()).rejects.toThrow(
      "ENOENT: no such file or directory"
    );
  });

  it("error while running command", async () => {
    await expect(cmd("node", "test/fail.js").get()).rejects.toThrow("code 3");
  });

  it("error while running piped command", async () => {
    let out = await cmd("node", "test/fail.js").pipe("cat").get();
    expect(out).toBe("");
  });

  it("pipe file to file", async () => {
    let inputPath = path.join(testFolder, getUniqueName());
    let outputPath = path.join(testFolder, getUniqueName());
    await fs.promises.writeFile(inputPath, "things and stuff", {
      encoding: "utf8",
    });

    await cmd.file(inputPath).toFile(outputPath);

    expect(await fs.promises.readFile(inputPath, { encoding: "utf8" })).toBe(
      "things and stuff"
    );
    expect(await fs.promises.readFile(outputPath, { encoding: "utf8" })).toBe(
      "things and stuff"
    );
  });

  it("pipe command to file", async () => {
    let filePath = path.join(testFolder, getUniqueName());
    await cmd("echo", "fruit").pipe("cat").toFile(filePath);

    expect(await fs.promises.readFile(filePath, { encoding: "utf8" })).toBe(
      "fruit\n"
    );
  });

  it("catch CmdError directly", async () => {
    let err!: CmdError;
    try {
      await cmd("node", "test/fail.js").get();
    } catch (_err: any) {
      err = _err;
    }

    expect(err).toBeInstanceOf(CmdError);
    expect(err.code).toBe(3);
    expect(err.command).toStrictEqual(["node", "test/fail.js"]);
  });

  it("text to file", async () => {
    let filePath = path.join(testFolder, getUniqueName());
    await cmd.text("hi there").toFile(filePath);

    expect(await fs.promises.readFile(filePath, { encoding: "utf8" })).toBe(
      "hi there"
    );
  });

  it("text to command", async () => {
    let resp = await cmd.text("bananas").pipe("cat").get();
    expect(resp).toBe("bananas");
  });

  it("text to command to command", async () => {
    expect(await cmd.text("apples").pipe("cat").pipe("cat").get()).toBe(
      "apples"
    );
  });

  it("run invalid command", async () => {
    expect(cmd("fhsjakfhsadkjl").get()).rejects.toThrow(
      "spawn fhsjakfhsadkjl ENOEN"
    );
  });

  it("get invalid command", async () => {
    expect(cmd("fdsafsadfsdfsa").get()).rejects.toThrow(
      "spawn fdsafsadfsdfsa ENOEN"
    );
  });

  it("use environment variable", async () => {
    let program = `
      console.log(process.env.OUTER_ENV_VAR);
      console.log(process.env.INNER_ENV_VAR);
    `;

    process.env.OUTER_ENV_VAR = "outer";

    expect(await cmd.text(program).pipe("node", "-").get()).toBe(
      "outer\nundefined\n"
    );

    expect(
      await cmd
        .text(program)
        .pipe({
          cmd: ["node", "-"],
          env: { INNER_ENV_VAR: "inner" },
        })
        .get()
    ).toBe("outer\ninner\n");
  });

  it("getAll", async () => {
    let program = `
      console.log('hey from stdout');
      console.error('hey from stderr');
    `;

    expect(await cmd.text(program).pipe("node", "-").getAll()).toStrictEqual({
      stdout: "hey from stdout\n",
      stderr: "hey from stderr\n",
    });
  });
});

describe("subprocess tests", () => {
  // These tests run node scripts against a compiled version of
  // the library. These are mainly used to test commands that require
  // stdin since that's hard to do in a normal test.

  beforeAll(async () => {
    await cmd("yarn", "build-js").runSilent();
  });

  it("cmd.stdin()....run() correctly uses stdin", async () => {
    let scriptPath = "test/test-scripts/cmd-runcorrectly-uses-stdin.js";
    expect(
      await cmd.text("apple\nbanana\n").pipe("node", scriptPath).getAll()
    ).toStrictEqual({
      stdout: [
        "apple",
        "apple",
        "apple",
        "apple",
        "banana",
        "banana",
        "banana",
        "banana",
      ]
        .map((name) => `${name} there\n`)
        .join(""),
      stderr: "",
    });
  });

  it("cmd.run() correctly forwards stdout and stderr", async () => {
    let scriptPath = "test/test-scripts/cmd-runDebug.js";
    expect(await cmd("node", scriptPath).getAll()).toStrictEqual({
      stdout: "this is from stdout\n",
      stderr: "this is from stderr\n",
    });
  });

  it("use cmd.stdin() and cmd.get() together", async () => {
    let scriptPath = "test/test-scripts/stdin-and-get-together.js";
    expect(
      await cmd.text("one\ntwo\n").pipe("node", scriptPath).getAll()
    ).toStrictEqual({
      stdout: "",
      stderr: "result: one there\ntwo there\n\n",
    });
  });
});

describe("child_process tests", () => {
  it("basic test for ls", async () => {
    let resp = await new Promise<any>((resolve, reject) => {
      let proc = child_process.spawn("echo", ["heyo"]);
      let text = "";

      proc.stdout.on("data", (chunk) => {
        text += chunk;
      });

      proc.on("close", (code) => {
        resolve({ code, text });
      });
    });

    expect(resp).toStrictEqual({
      code: 0,
      text: "heyo\n",
    });
  });

  it("simple pipe test", async () => {
    let resp = await new Promise<any>((resolve, reject) => {
      let proc0 = child_process.spawn("echo", ["stuff\nhey\nstuff\n"]);
      let proc1 = child_process.spawn("grep", ["stuff"], {
        stdio: [proc0.stdout, "pipe", "pipe"],
      });
      let text = "";

      proc1.stdout.on("data", (chunk) => {
        text += chunk;
      });

      proc1.on("close", (code) => {
        resolve({ code, text });
      });
    });

    expect(resp).toStrictEqual({
      code: 0,
      text: "stuff\nstuff\n",
    });
  });

  it("pipe from a file to a command", async () => {
    let testFilePath = path.join(testFolder, getUniqueName());
    await fs.promises.writeFile(testFilePath, "stuff\nthings\nstuff and\n", {
      encoding: "utf-8",
    });

    let readStream = await new Promise<fs.ReadStream>((resolve) => {
      let stream = fs.createReadStream(testFilePath);
      stream.on("open", () => {
        resolve(stream);
      });
    });

    let resp = await new Promise<any>((resolve, reject) => {
      let proc = child_process.spawn("grep", ["stuff"], {
        stdio: [readStream, "pipe", "pipe"],
      });
      let text = "";

      proc.stdout.on("data", (chunk) => {
        text += chunk;
      });

      proc.on("close", (code) => {
        resolve({ code, text });
      });
    });

    expect(resp).toStrictEqual({
      code: 0,
      text: "stuff\nstuff and\n",
    });
  });

  it("pipe from a command to a file", async () => {
    let testFilePath = path.join(testFolder, getUniqueName());

    let writeStream = await new Promise<fs.WriteStream>((resolve) => {
      let stream = fs.createWriteStream(testFilePath);
      stream.on("open", () => {
        resolve(stream);
      });
    });

    let resp = await new Promise<any>((resolve) => {
      let proc = child_process.spawn("echo", ["hi there"], {
        stdio: ["pipe", writeStream, "pipe"],
      });

      proc.on("close", (code) => {
        resolve({ code });
      });
    });

    expect(resp).toStrictEqual({
      code: 0,
    });

    expect(
      await fs.promises.readFile(testFilePath, { encoding: "utf-8" })
    ).toBe("hi there\n");
  });

  it("change cwd", async () => {
    let testFileName = getUniqueName();
    let testFilePath = path.join(testFolder, testFileName);

    await fs.promises.writeFile(testFilePath, "pears", { encoding: "utf8" });

    let resp = await new Promise<any>((resolve) => {
      let proc = child_process.spawn("cat", [testFileName], {
        cwd: testFolder,
      });

      let text = "";
      proc.stdout.on("data", (chunk) => {
        text += chunk;
      });

      proc.on("close", (code) => {
        resolve({ code, text });
      });
    });

    expect(resp).toStrictEqual({
      code: 0,
      text: "pears",
    });
  });

  it("feed string to stdin", async () => {
    let resp = await new Promise<any>((resolve) => {
      let proc = child_process.spawn("cat", {
        cwd: testFolder,
      });

      proc.stdin.write("strawberry");
      proc.stdin.end();

      let text = "";
      proc.stdout.on("data", (chunk) => {
        text += chunk;
      });

      proc.on("close", (code) => {
        resolve({ code, text });
      });
    });

    expect(resp).toStrictEqual({
      code: 0,
      text: "strawberry",
    });
  });

  it("read and write file", async () => {
    let inputPath = path.join(testFolder, getUniqueName());
    let outputPath = path.join(testFolder, getUniqueName());
    await fs.promises.writeFile(inputPath, "things and stuff", {
      encoding: "utf8",
    });

    let readStream = fs.createReadStream(inputPath);
    let writeStream = fs.createWriteStream(outputPath);

    readStream.pipe(writeStream);

    await new Promise<void>((resolve) => {
      writeStream.on("close", () => {
        resolve();
      });
    });

    expect(await fs.promises.readFile(inputPath, { encoding: "utf8" })).toBe(
      "things and stuff"
    );
    expect(await fs.promises.readFile(outputPath, { encoding: "utf8" })).toBe(
      "things and stuff"
    );
  });

  it("combine stdout and stderr", async () => {
    let proc = child_process.spawn("node", ["-"]);
    proc.stdin.end(`
      console.log('hey from stdout');
      console.log('hey from stderr');
    `);

    let out = "";
    proc.stdout.on("data", (chunk) => {
      out += chunk;
    });
    proc.stderr.on("data", (chunk) => {
      out += chunk;
    });

    let code = await new Promise((resolve) => {
      proc.on("exit", (code) => {
        resolve(code);
      });
    });
    expect(code).toBe(0);

    expect(out).toBe("hey from stdout\nhey from stderr\n");
  });
});
