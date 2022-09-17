let { cmd } = require("../build");

async function main() {
  await cmd("yarn", "build-release").runDebug();
  await cmd("npm", "publish").run();
}

main();
