# Easy Command Runner

This is the way you've always wanted to run shell commands in nodejs.

This library is currently under active development so there may be breaking changes in the API, especially around how stdin, stdout and stderr are handled.

```ts
import { cmd } from "easy-command-runner";

const fileNames = await cmd("ls").pipe("grep", "src").get();

await cmd.file("data.txt").pipe("grep", "fruit").toFile("output.txt");

await cmd({ cmd: ["yarn", "build"], cwd: "src" }).runSilent();

await cmd
  .text("hi")
  .pipe("sed", "p;p;p")
  .pipe("sed", "s/$/ there/")
  .toFile("four-greetings.txt");
```

## Overview

This library is a lightweight wrapper around the [`child_process`](https://nodejs.org/api/child_process.html) library that makes it easy to run commands.

With default support for promises and many different input-output types, this library can support the most demanding process workloads while being efforless to use.

### Documentation

There are two parts to a command: the executable and arguments. Each argument in this library is passed in as a separate string. While this makes commands a little harder to type, it makes development much easier because you don't need to worry about string escaping or special characters.

```ts
// Even though the second argument has a bunch of special
// characters, it will be interpreted as a string literal.
// This prevents a whole class of security vulnerabilities.
await cmd("echo", "$ENV_VAR && ls > some.txt").run();

// prints out "$ENV_VAR && ls > some.txt"
```

To make up for the lack of special operators like the pipe operator, there are first-class primitives for combining commands and files together.

```ts
// Use the .pipe() method to call a command on the output
// of the previous command
let specialLines = await cmd("node", "generate_data.js")
  .pipe("grep", "special.*txt")
  .get();
```

There is first-class support for reading and writing files.

```ts
await cmd.file("food.txt").pipe("grep", "fruit").toFile("fruits.txt");
```

You can pipe on string literals to easily get data into processes.

```ts
let images = await fetch_text("https://example.com/images_urls.txt");
await cmd
  .text(images)
  .pipe("grep", "fruit.*\\.png")
  .toFile("fruit_image_urls.txt");
```

All `cmd()` and `.pipe()` calls can be called with two syntaxes:

```ts
// The basic syntax
await cmd("yarn", "build").run();

// The advanced syntax
await cmd({
  cmd: ["yarn", "build"],

  // Set additional environment variables on top of process.env
  env: { DEBUG: "true" },

  // set the current working directory
  cwd: "src",
}).run();

// Commands in the same pipeline can run with different directories and environment variables

await cmd({
  cmd: ["node", "find-source-files.js"],
  cwd: "src",
  env: { LOWERCASE: "yes" },
})
  .pipe({
    cmd: ["yarn", "build-release"],
    cwd: "dist",
    env: { DEBUG_LEVEL: "prod" },
  })
  .run();
```

### Pipeline Sources

There are many sources for data to stream into pipelines.

```ts
// By default, all commands don't have an input:
await cmd("ls").run();

// get input from process.stdin
await cmd.stdin().pipe("grep", "fruit").run();

// or from a file
await cmd.file("foods.txt").pipe("grep", "fruit").run();

// or from a string literal
await cmd.text("lorem ipsum").pipe("wc", "-c").get();
```

### Pipeline Runners

Each pipeline object is an immutable object describing a command. Pipelines only run when the final function at the end is run. This final function is called a runner.

```ts
// define the immutable pipeline object
let pipeline = cmd.file("foods.txt").pipe("grep", "fruit");

// Run the command and forward stdout and stderr
await pipeline.run();

// Run the command silently (no stdout and stderr forwarding)
await pipeline.runSilent();

// Get stdout as a utf8-encoded string
let outputString = await pipeline.get();

// Get stdout and stderr as utf8-encoded strings
let { stdout, stderr } = await pipeline.getAll();

// Stream output to a file
await pipeline.toFile("fruits.txt");
```

### Error Handling

If the final command in a pipeline throws a nonzero error code, the pipeline will raise a `CmdError` class which captures relevant details in a single object.

```ts
import { cmd, CmdError } from "easy-command-runner";

try {
  await cmd("command-that-fails").run();
} catch (err: unknown) {
  if (err instanceof CmdError) {
    console.log(`Failed with code=${err.code}`);
  }
}
```

# Contributing

This library is still in early development so if you find an error, please submit an issue on github. Existing code is pretty well tested and new tests can be easily added when bugs are found.
