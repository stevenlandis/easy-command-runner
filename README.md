# Easy Command Runner

This is the way you've always wanted to run shell commands in nodejs.

```ts
import { cmd } from "easy-command-runner";

const fileNames = await cmd("ls").pipe("grep", "src").get();

await cmd.file("data.txt").pipe("grep", "fruit").toFile("output.txt");

await cmd({ cmd: ["yarn", "build"], cwd: "src" });

await cmd
  .text("hi")
  .pipe("sed", "p;p;p")
  .pipe("sed", "s/$/ there/")
  .toFile("four-greetings.txt");
```

## Overview

This library is a lightweight wrapper around the [`child_process`](https://nodejs.org/api/child_process.html) library that makes it easy to run commands.

With default support for promises and many different input-output types, this library can support the most demanding process workloads while being efforless to use.

## Documentation

There are two parts to a command: the executable and arguments. Each argument in this library is passed in as a separate string. While this makes commands a little harder to type, it makes development much easier because you don't need to worry about string escaping or special characters.

```ts
// Even though the second argument has a bunch of special
// characters, it will be interpreted as a string literal.

// This prevents a whole class of security vulnerabilities.
await cmd("echo", "$ENV_VAR && ls > some.txt").run();
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
  .text(await images)
  .pipe("grep", "fruit.*\\.png")
  .toFile("fruit_image_urls.txt");
```

By combining these primitives in different ways alongside built-in concurrency helpers like `Promise.all()`, `easy-command-runner` makes it easy to run commands.

## Error Handling

All command errors are wrapped in the `CmdError` class which captures relevant details in a single object.

```ts
import { cmd, CmdError } from "easy-command-runner";

try {
  await cmd("command-that-fails").run();
} catch (err: unknown) {
  if (err instanceof CmdError) {
    console.log(`Failed with code=${err.code} and stderr=${err.stderr}`);
  }
}
```

# Contributing

This library is still in early development so if you find an error, please submit an issue on github. Existing code is pretty well tested and new tests can be easily added when bugs are found.
