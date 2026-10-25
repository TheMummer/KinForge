const test = require('node:test');
const assert = require('node:assert/strict');
const { fitKeyMemories, isComplete } = require('../lib/key-memories');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const valid = ['First Job: She repaired clocks.', 'The Move: She moved to Portland.', 'The Promise: She agreed to teach Ada.', 'The Gift: Ada gave her a toolbox.', 'The Return: She reopened the shop.'].join('\n');

test('Valid memories require no extra AI request', async () => {
  assert.equal(await fitKeyMemories(valid, () => { throw Error('Unexpected paid call'); }), valid);
});

test('Overlong memories are rewritten as a complete set, never sliced', async () => {
  const overlong = valid.replace('She repaired clocks.', 'She repaired clocks and '.repeat(60) + 'restored the old workshop.');
  let calls = 0;
  const result = await fitKeyMemories(overlong, async details => {
    calls++;
    assert.equal(details.original, overlong);
    assert.equal(details.maxCharacters, 900);
    return valid;
  });
  assert.equal(calls, 1);
  assert.equal(result, valid);
  assert.equal(result.split('\n').length, 5);
  assert.ok(result.endsWith('reopened the shop.'));
});

test('Exactly 900 characters are accepted; 901 triggers repair', async () => {
  const atLimit = valid.replace('She repaired clocks.', 'x'.repeat(900 - valid.length + 'She repaired clocks.'.length - 1) + '.');
  assert.equal(atLimit.length, 900);
  assert.equal(await fitKeyMemories(atLimit, () => { throw Error('Unexpected rewrite'); }), atLimit);
  let calls = 0;
  await fitKeyMemories(atLimit.replace('First Job:', 'First  Job:'), async () => { calls++; return valid; });
  assert.equal(calls, 1);
});

test('Incomplete endings and missing memories are repaired', async () => {
  for (const bad of [valid.slice(0, -1), valid.replace('shop.', 'shop...'), valid.split('\n').slice(0, 4).join('\n')]) {
    assert.equal(isComplete(bad), false);
    assert.equal(await fitKeyMemories(bad, async () => valid), valid);
  }
});

test('Repair is bounded and keeps the original as source of truth', async () => {
  const original = valid + 'x'.repeat(1000);
  let calls = 0;
  await assert.rejects(fitKeyMemories(original, async details => {
    assert.equal(details.original, original);
    calls++;
    return 'Still incomplete';
  }), error => error.details.code === 'key_memories_length');
  assert.equal(calls, 2);
});

test('Browser normalization preserves overlong imported memories for review', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/app.bundle.js'), 'utf8');
  const ctx = vm.createContext({ sectionMeta: { kms: { max: 900 } }, stripSectionLabel: text => text });
  for (const [start, end] of [['function normalizeSectionValue(', 'function ensureBackstoryPersonalityFramework('], ['function normalizeImportedSectionValue(', 'function setImportedOutputSections(']]) {
    vm.runInContext(source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start))), ctx);
  }
  const text = valid.replace('She repaired clocks.', 'She restored an old clock. '.repeat(50));
  assert.equal(ctx.normalizeSectionValue('kms', text), text);
  assert.equal(ctx.normalizeImportedSectionValue('kms', text), text);
});
