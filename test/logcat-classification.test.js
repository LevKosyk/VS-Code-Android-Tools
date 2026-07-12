const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { parseLogLine } = require(path.join(__dirname, '..', 'out', 'logcat', 'types.js'));

function entry(message, tag = 'AndroidRuntime', level = 'E') {
  return parseLogLine(`07-12 14:00:01.123  4217  4217 ${level} ${tag}: ${message}`, 1);
}

test('Logcat classifies fatal crashes, ANRs, and stack frames', () => {
  assert.equal(entry('FATAL EXCEPTION: main').kind, 'crash');
  assert.equal(entry('ANR in com.example.app', 'ActivityManager').kind, 'anr');
  assert.equal(entry('at com.example.MainActivity.onCreate(MainActivity.kt:42)').kind, 'stacktrace');
});

test('Logcat keeps ordinary messages unclassified', () => {
  assert.equal(entry('Activity resumed', 'MainActivity', 'I').kind, 'normal');
});
