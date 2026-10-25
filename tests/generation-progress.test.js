const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('Progress uses a 90-second estimate and only completes on an explicit finish', () => {
  const source = fs.readFileSync(require.resolve('../src/app.bundle.js'), 'utf8');
  let tick;
  let interval;
  let cleared = false;
  const steps = [];
  const context = vm.createContext({
    window: {
      setInterval(callback, ms) { tick = callback; interval = ms; return 1; },
      clearInterval() { cleared = true; },
    },
    setGenerationProgress(index, label) { steps.push({ index, label }); },
  });
  vm.runInContext(source.slice(source.indexOf('const generationSteps ='), source.indexOf('let lastApiErrorText')), context);
  vm.runInContext(source.slice(source.indexOf('function startGenerationProgress()'), source.indexOf('function getCombinedOutput()')), context);
  context.startGenerationProgress();
  assert.equal(interval, 15000);
  for (let i = 0; i < 12; i++) tick();
  assert.ok(steps.every(step => step.index < 6));
  context.finishGenerationProgress();
  assert.equal(steps.at(-1).index, 6);
  assert.equal(steps.at(-1).label, 'Generation complete');
  assert.equal(cleared, true);
});
