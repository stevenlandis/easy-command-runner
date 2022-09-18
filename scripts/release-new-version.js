let { cmd } = require("../build");
let readline = require("readline");
let fs = require("fs");

async function main() {
  let packageJsonObj = JSON.parse(
    await fs.promises.readFile("package.json", { encoding: "utf8" })
  );
  let currentVersion = packageJsonObj.version;

  let lineReader = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  async function input(prompt) {
    return new Promise((resolve) => {
      lineReader.question(prompt, (answer) => resolve(answer));
    });
  }

  let updatedChangelog = await input("Have you updated CHANGELOG.md? [y/n] ");
  if (updatedChangelog.trim().toLowerCase() !== "y") {
    process.exit(1);
  }

  let nextVersion = await input(
    `Current version: ${currentVersion}.\nNew version: `
  );
  lineReader.close();

  await fs.promises.writeFile(
    "package.json",
    JSON.stringify({ ...packageJsonObj, version: nextVersion }, null, 2) + "\n"
  );

  await cmd("yarn", "test").run();
  await cmd("yarn", "build-release").run();
  await cmd.stdin().pipe("npm", "publish").run();

  await cmd(
    "git",
    "commit",
    "-am",
    `release version ${nextVersion}`
  ).runDebug();
  let tagName = `v${nextVersion}`;
  await cmd("git", "tag", tagName).runDebug();
  await cmd("git", "push").runDebug();
  await cmd("git", "push", "origin", tagName);
}

main();
