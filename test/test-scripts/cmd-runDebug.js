let { cmd } = require("../../build");

let program = `
  console.log('this is from stdout');
  console.error('this is from stderr');
`;

cmd.text(program).pipe("node", "-").run();
