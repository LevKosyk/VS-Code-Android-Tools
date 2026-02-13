const path = require('node:path');

async function main() {
  let runTests;
  try {
    ({ runTests } = require('@vscode/test-electron'));
  } catch {
    console.error('Missing @vscode/test-electron. Run: npm i -D @vscode/test-electron');
    process.exit(1);
  }

  try {
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');
    const extensionTestsPath = path.resolve(__dirname, './suite/index.js');
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: ['--disable-extensions'],
    });
  } catch (error) {
    console.error('VS Code runtime smoke failed');
    console.error(error);
    process.exit(1);
  }
}

main();
