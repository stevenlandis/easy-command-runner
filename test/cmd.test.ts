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

  // it("error in upstream command", async () => {
  //   let proc0 = child_process.spawn("node", ["test/fail.js"]);
  //   let proc1 = child_process.spawn("cat", {
  //     stdio: [proc0.stdout, "pipe", "pipe"],
  //   });

  //   proc0.stderr.on("data", (chunk) => {
  //     console.log("" + chunk);
  //   });
  //   proc0.on("close", (code) => {
  //     console.log("finished with code", code);
  //   });

  //   let resp = await new Promise<any>((resolve) => {
  //     proc1.on("close", (code) => {
  //       resolve({ code });
  //     });
  //   });

  //   proc0.stdout.destroy();

  //   expect(resp).toStrictEqual({ code: 0 });
  // });
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
    await expect(cmd("node", "test/fail.js").get()).rejects.toThrow(
      "This is an error"
    );
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
    expect(err.stderr).toBe("This is an error\n");
  });
});
