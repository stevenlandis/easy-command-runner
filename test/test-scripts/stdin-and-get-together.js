let { cmd } = require("../../build");

(async () => {
  let result = await cmd.stdin().pipe("sed", "s/$/ there/").get();
  console.error("result:", result);
})();
