const assert = require('node:assert/strict');
const vscode = require('vscode');

async function ensureCommandExists(commandId) {
  const commands = await vscode.commands.getCommands(true);
  assert.equal(commands.includes(commandId), true, `Missing command at runtime: ${commandId}`);
}

async function executeNoThrow(commandId) {
  try {
    await vscode.commands.executeCommand(commandId);
  } catch (error) {
    throw new Error(`Command failed at runtime: ${commandId}\n${error instanceof Error ? error.message : String(error)}`);
  }
}

async function runRuntimeSmoke() {
  const critical = [
    'android-toolkit.openRunPanel',
    'android-toolkit.cancelActiveOperation',
    'android-toolkit.collectDiagnosticsSnapshot',
    'android-toolkit.firstRunHealthWizard',
    'android-toolkit.runSelectedAlias',
    'android-toolkit.stopSelectedAlias',
    'android-toolkit.logcatThisApp',
    'android-toolkit.openXmlLivePreview',
    'android-toolkit.toggleXmlLivePreview',
    'android-toolkit.generateConstraintSetSnippet',
    'android-toolkit.showGradleOutput',
    'android-toolkit.openLogcat',
  ];

  for (const commandId of critical) {
    await ensureCommandExists(commandId);
  }

  // Non-destructive runtime checks.
  await executeNoThrow('android-toolkit.openRunPanel');
  await executeNoThrow('android-toolkit.cancelActiveOperation');
  await executeNoThrow('android-toolkit.showGradleOutput');
}

module.exports = {
  runRuntimeSmoke,
};
