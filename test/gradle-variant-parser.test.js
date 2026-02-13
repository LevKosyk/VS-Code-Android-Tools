const test = require('node:test');
const assert = require('node:assert/strict');
const { listVariantsFromTasks, parseVariants } = require('../out/gradle/gradleService.js');

test('listVariantsFromTasks extracts variants for module', () => {
  const tasks = [
    { fullName: ':app:assembleDebug' },
    { fullName: ':app:assembleRelease' },
    { fullName: ':app:assembleProdRelease' },
    { fullName: ':other:assembleDebug' },
  ];
  const variants = listVariantsFromTasks(tasks, 'app');
  assert.deepEqual(variants, ['Debug', 'ProdRelease', 'Release']);
});

test('parseVariants splits flavors and buildTypes', () => {
  const tasks = [
    { fullName: ':app:assembleDemoDebug' },
    { fullName: ':app:assembleProdRelease' },
  ];
  const parsed = parseVariants(tasks, 'app');
  assert.deepEqual(parsed.buildTypes.sort(), ['Debug', 'Release']);
  assert.deepEqual(parsed.flavors.sort(), ['Demo', 'Prod']);
  assert.equal(parsed.variants.includes('DemoDebug'), true);
  assert.equal(parsed.variants.includes('ProdRelease'), true);
});
