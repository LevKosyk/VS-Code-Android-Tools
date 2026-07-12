const assert = require('node:assert/strict');
const vscode = require('vscode');

async function ensureExtensionActivated() {
  const ext = vscode.extensions.getExtension('levkosyk.vscode-android-tools');
  assert.ok(ext, 'Extension not found: levkosyk.vscode-android-tools');
  if (!ext.isActive) {
    await ext.activate();
  }
}

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
  await ensureExtensionActivated();
  const critical = [
    'android-toolkit.openRunPanel',
    'android-toolkit.selectDevice',
    'android-toolkit.ciSmoke',
    'android-toolkit.cancelActiveOperation',
    'android-toolkit.collectDiagnosticsSnapshot',
    'android-toolkit.firstRunHealthWizard',
    'android-toolkit.runSelectedAlias',
    'android-toolkit.stopSelectedAlias',
    'android-toolkit.logcatThisApp',
    'android-toolkit.showGradleOutput',
    'android-toolkit.openLogcat',
    'android-toolkit.openCrashSymbolicator',
    'android-toolkit.openDeepLinkStudio',
    'android-toolkit.openDeviceCenter',
    'android-toolkit.pairWirelessDevice',
    'android-toolkit.connectWirelessDevice',
    'android-toolkit.disconnectWirelessDevice',
    'android-toolkit.mirrorDeviceScrcpy',
    'android-toolkit.clearAppData',
    'android-toolkit.projectHealth',
    'android-toolkit.gradleDoctor',
    'android-toolkit.installApk',
    'android-toolkit.analyzeApk',
    'android-toolkit.openLastFailedStep',
    'android-toolkit.exportDiagnosticsBundle',
  ];

  for (const commandId of critical) {
    await ensureCommandExists(commandId);
  }

  // Non-destructive runtime checks.
  await executeNoThrow('android-toolkit.openRunPanel');
  await executeNoThrow('android-toolkit.cancelActiveOperation');
  await executeNoThrow('android-toolkit.showGradleOutput');
  await executeNoThrow('android-toolkit.openCrashSymbolicator');
  await executeNoThrow('android-toolkit.openDeepLinkStudio');
  await executeNoThrow('android-toolkit.ciSmoke');
}

module.exports = {
  runRuntimeSmoke,
};
