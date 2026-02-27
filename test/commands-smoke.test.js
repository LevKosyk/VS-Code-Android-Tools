const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const extensionSource = fs.readFileSync(path.join(root, 'src', 'extension.ts'), 'utf8');

test('key commands are contributed and registered', () => {
  const keyCommands = [
    'android-toolkit.openRunPanel',
    'android-toolkit.releaseFlow',
    'android-toolkit.setJdk21Path',
    'android-toolkit.undoLastProjectAction',
    'android-toolkit.cancelActiveOperation',
    'android-toolkit.collectDiagnosticsSnapshot',
    'android-toolkit.openRunFailureReport',
    'android-toolkit.openFailureInsights',
    'android-toolkit.openSloDashboard',
    'android-toolkit.openErrorKnowledgeBase',
    'android-toolkit.firstRunHealthWizard',
    'android-toolkit.runSelectedAlias',
    'android-toolkit.stopSelectedAlias',
    'android-toolkit.logcatThisApp',
    'android-toolkit.openXmlLivePreview',
    'android-toolkit.toggleXmlLivePreview',
    'android-toolkit.generateConstraintSetSnippet',
    'android-toolkit.openLogcat',
    'android-toolkit.releaseGateWizardPlus',
    'android-toolkit.openCrashSymbolicator',
    'android-toolkit.manifestDiffAssistant',
    'android-toolkit.openDeepLinkStudio',
    'android-toolkit.openAdbMacroRecorder',
    'android-toolkit.openSnapshotScenarioRunner',
    'android-toolkit.projectBlueprintTemplates',
    'android-toolkit.resourceRefactorTools',
    'android-toolkit.scanApiCompatibility',
    'android-toolkit.runDeviceFarmPreset',
    'android-toolkit.configureDeviceFarmPresets',
    'android-toolkit.openLastFailedStep',
    'android-toolkit.exportDiagnosticsBundle',
  ];
  const contributed = new Set((packageJson.contributes.commands || []).map(c => c.command));
  for (const cmd of keyCommands) {
    assert.equal(contributed.has(cmd), true, `command not contributed: ${cmd}`);
    assert.equal(extensionSource.includes(`registerCommand('${cmd}'`), true, `command not registered: ${cmd}`);
  }
});
