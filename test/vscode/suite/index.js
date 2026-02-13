const path = require('node:path');

async function run() {
  const smoke = require(path.resolve(__dirname, './runtime.smoke.js'));
  await smoke.runRuntimeSmoke();
}

module.exports = {
  run,
};
