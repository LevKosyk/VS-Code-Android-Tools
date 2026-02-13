const test = require('node:test');
const assert = require('node:assert/strict');
const { OperationManager } = require('../out/core/operations.js');

test('OperationManager start/cancel/isCancelled flow', () => {
  const mgr = new OperationManager();
  const scope = 'run';
  const id1 = mgr.start(scope);
  assert.equal(id1, 1);
  assert.equal(mgr.isCancelled(scope, id1), false);
  mgr.cancel(scope);
  assert.equal(mgr.isCancelled(scope, id1), true);
  mgr.finish(scope, id1);
  assert.equal(mgr.isCancelled(scope, id1), false);
});

test('OperationManager increments per scope', () => {
  const mgr = new OperationManager();
  assert.equal(mgr.start('a'), 1);
  assert.equal(mgr.start('a'), 2);
  assert.equal(mgr.start('b'), 1);
});
