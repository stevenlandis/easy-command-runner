let { cmd } = require("../../build");

// duplicate input lines x 4 and append " there" to end
cmd.stdin().pipe("sed", "p;p;p").pipe("sed", "s/$/ there/").run();
