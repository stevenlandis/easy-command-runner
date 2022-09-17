let { cmd } = require("../build");
let readline = require("readline");
let fs = require("fs");

async function main() {
  let packageJsonObj = JSON.parse(
    await fs.promises.readFile("package.json", { encoding: "utf8" })
  );
  let currentVersion = packageJsonObj.version;

  let nextVersion = await new Promise((resolve) => {
    let interface = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    interface.question(
      `Current version: ${currentVersion}.\nNew version: `,
      (answer) => {
        resolve(answer);
        interface.close();
      }
    );
  });

  await fs.promises.writeFile(
    "package.json",
    JSON.stringify({ ...packageJsonObj, version: nextVersion }, null, 2) + "\n"
  );

  await cmd("yarn", "build-release").runDebug();
  await cmd("npm", "publish").run();

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
