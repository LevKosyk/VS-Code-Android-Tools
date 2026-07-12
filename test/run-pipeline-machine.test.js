const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { RunPipelineMachine } = require(path.join(__dirname, '..', 'out', 'run', 'runPipelineMachine.js'));

test('Run Pipeline state machine supports full and skipped-stage flows', () => {
  const full = new RunPipelineMachine();
  for (const state of ['preflight', 'build', 'install', 'launch', 'verify', 'succeeded']) full.transition(state);
  assert.equal(full.state, 'succeeded');
  assert.equal(full.transitions.length, 6);

  const installOnly = new RunPipelineMachine();
  installOnly.transition('preflight');
  installOnly.transition('install');
  installOnly.transition('succeeded');
  assert.equal(installOnly.state, 'succeeded');
});

test('Run Pipeline rejects backwards and post-terminal transitions', () => {
  const machine = new RunPipelineMachine();
  machine.transition('preflight');
  machine.transition('launch');
  assert.throws(() => machine.transition('build'), /Invalid Run Pipeline transition/);
  machine.fail();
  assert.throws(() => machine.transition('verify'), /terminal/);
});
