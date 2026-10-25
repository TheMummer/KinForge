const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../src/app.bundle.js'), 'utf8');

function harness() {
  const nodes = new Map();
  function element(id = '') {
    const classes = new Set();
    const attrs = {};
    return { id, dataset: {}, value: '', maxLength: 10, type: 'text', hidden: false,
      matches: () => true, closest: () => null,
      classList: { contains: key => classes.has(key), toggle: (key, on) => on ? classes.add(key) : classes.delete(key) },
      set className(value) { value.split(' ').forEach(key => classes.add(key)); },
      getAttribute: key => attrs[key], setAttribute: (key, value) => { attrs[key] = value; },
      insertAdjacentElement: (_, node) => nodes.set(node.id, node) };
  }
  const context = vm.createContext({ document: { getElementById: id => nodes.get(id), createElement: () => element() } });
  vm.runInContext(source.slice(source.indexOf('function updateFieldCharacterCount('), source.indexOf('function updateAllFieldCharacterCounts(')), context);
  return { element, nodes, update: context.updateFieldCharacterCount };
}

test('New field gets one accessible live counter with limit and overflow states', () => {
  const { element, nodes, update } = harness();
  const field = element('occupation');
  field.value = 'Chef';
  update(field);
  const counter = nodes.get('occupation-character-count');
  assert.equal(counter.textContent, '4 / 10 characters');
  assert.equal(field.getAttribute('aria-describedby'), counter.id);
  field.value = '1234567890';
  update(field);
  assert.ok(counter.classList.contains('at-limit'));
  field.value += 'x';
  update(field);
  assert.ok(counter.classList.contains('over'));
  assert.equal(nodes.size, 1);
  field.hidden = true;
  update(field);
  assert.equal(counter.hidden, true);
});

test('Existing counters are reused and unlimited or secret fields are skipped', () => {
  const { element, nodes, update } = harness();
  nodes.set('coreIdeaCount', element('coreIdeaCount'));
  const core = element('coreIdea');
  update(core);
  assert.equal(core.dataset.characterCounter, 'coreIdeaCount');
  assert.equal(nodes.size, 1);
  const unlimited = element('freeText');
  unlimited.maxLength = -1;
  update(unlimited);
  const secret = element('apiKey');
  secret.type = 'password';
  update(secret);
  assert.equal(nodes.size, 1);
});
