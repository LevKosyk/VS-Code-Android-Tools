const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');

test('SDK detection supports physical-device workflows without Emulator package', () => {
  const sdkRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'android-tools-sdk-'));
  const platformTools = path.join(sdkRoot, 'platform-tools');
  fs.mkdirSync(platformTools, { recursive: true });
  const adb = path.join(platformTools, process.platform === 'win32' ? 'adb.exe' : 'adb');
  fs.writeFileSync(adb, '');
  fs.chmodSync(adb, 0o755);

  const previousRoot = process.env.ANDROID_SDK_ROOT;
  const previousHome = process.env.ANDROID_HOME;
  process.env.ANDROID_SDK_ROOT = sdkRoot;
  delete process.env.ANDROID_HOME;
  const detector = require(path.join(root, 'out', 'core', 'sdkDetector.js'));

  try {
    detector.clearSdkCache();
    const detected = detector.detectSdk();
    assert.equal(detected.root, sdkRoot);
    assert.equal(detected.adb, adb);
    assert.equal(detected.emulator, '');
    assert.equal(detected.avdmanager, '');
  } finally {
    detector.clearSdkCache();
    if (previousRoot === undefined) delete process.env.ANDROID_SDK_ROOT;
    else process.env.ANDROID_SDK_ROOT = previousRoot;
    if (previousHome === undefined) delete process.env.ANDROID_HOME;
    else process.env.ANDROID_HOME = previousHome;
    fs.rmSync(sdkRoot, { recursive: true, force: true });
  }
});
