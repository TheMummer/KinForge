const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const compact = require('../src/compact-personality');
const pipeline = require('../lib/personality-serialization');
const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
const client = fs.readFileSync(path.join(__dirname, '../src/app.bundle.js'), 'utf8');
const unit = (tag, properties) => ({ tag, properties: Object.entries(properties).map(([key, value]) => ({ key, value })) });
const example = () => ({
  units: [unit('ID', { Name: "Maeve O'Connell", Age: '27', Role: 'Hotel-event-manager' }), unit('P', { Pub: 'Composed,prepared', Pressure: 'Withdraws-briefly>organizes>returns-practical', Flaw: 'Certainty-hardens-judgment' }), unit('Decide', { Accountability: 'Corrects-self-openly-when-proven-wrong' }), unit('Rel', { '{username}': 'Stranger-at-start' }), { tag: 'Framework', properties: [{ key: '', value: '1w2' }] }],
  conceptLedger: [{ concept: 'Public correction', owner: 'Key Memories', representation: 'Florist delivery error' }],
  keyMemories: null, journals: [],
});
function extract(source, start, end) { const i = source.indexOf(start); const j = source.indexOf(end, i + start.length); assert.ok(i >= 0 && j > i); return source.slice(i, j); }

test('Compact syntax preserves names, username placeholders, sequences and framework', () => {
  const result = pipeline.finalize(example());
  assert.ok(result.text.includes('Withdraws-briefly>organizes>returns-practical'));
  assert.ok(result.text.includes('{Rel[{username}:Stranger-at-start]}'));
  assert.equal(compact.fields(result.text).ID.Name, "Maeve O'Connell");
  assert.equal(compact.serialize(compact.parse(result.text)).text, result.text);
  assert.ok(!result.text.includes('Personality Framework:'));
});

test('Budget removes whole low-priority properties, keeps behavior before frameworks', () => {
  const model = example();
  model.units.push(unit('Likes', { Food: 'Very-long-food-preference-'.repeat(30) }));
  const result = pipeline.finalize(model, {}, 320);
  assert.ok(result.text.length <= 320);
  assert.ok(result.text.includes('Pressure:Withdraws-briefly>organizes>returns-practical'));
  assert.ok(result.text.includes('Accountability:Corrects-self-openly-when-proven-wrong'));
  assert.ok(result.omitted.length > 0);
  assert.equal(compact.serialize(compact.parse(result.text)).text, result.text);
  assert.throws(() => pipeline.finalize(example(), { Name: 'x'.repeat(2400) }), /Identity cannot fit/);
});

test('Identity overrides are exact, optional tags stay absent and delimiters are safe', () => {
  const model = example();
  model.units.push(unit('Skill', { Tools: '', Other: 'Infer' }));
  const result = pipeline.finalize(model, { Name: 'Mara', Role: 'Locksmith', Age: 31 });
  assert.equal(compact.fields(result.text).ID.Name, 'Mara');
  assert.equal(compact.fields(result.text).ID.Role, 'Locksmith');
  assert.ok(!result.text.includes('{Skill['));
  assert.ok(!result.text.includes('{Int['));
  assert.throws(() => compact.serialize([unit('Mystery', { A: 'B' })]), /Unknown/);
  const escaped = compact.serialize([unit('Voice', { Cue: 'Hello [friend]|goodbye' })]).text;
  assert.equal(compact.fields(escaped).Voice.Cue, 'Hello (friend)/goodbye');
});

test('Section replacement leaves the other rich outputs byte-for-byte intact', () => {
  const text = 'Personality\nCore Identity: Maeve\nPersonality: Patient\n\nResponse Directive\nShort replies.\n\nKey Memories\nFlorist: Corrected the record.';
  assert.ok(pipeline.sectionBody(text, 'Personality').includes('Personality: Patient'));
  const output = pipeline.replaceSection(text, 'Personality', pipeline.finalize(example()).text);
  assert.equal(output.slice(output.indexOf('Response Directive')), text.slice(text.indexOf('Response Directive')));
});

test('Rich construction is serialized in a separate call and retains its ledger', async () => {
  const rich = ['Personality', 'Response Directive', 'Key Memories', 'Example Message', 'Scene Setting', 'Relationship Context', 'Avatar Description'].map(label => `${label}\n${label === 'Personality' ? 'Maeve pauses to organize her thoughts before returning with a practical answer.' : 'Existing canon and text.'}`).join('\n\n');
  const calls = [];
  const ctx = vm.createContext({
    personalitySerialization: pipeline, OPENAI_API_KEY: 'test-only', KINFORGE_INSTRUCTIONS: 'rich instructions',
    parseJsonObject: JSON.parse, postOpenAiResponse: async request => { calls.push(request); return { response: { ok: true }, data: { output_text: calls.length === 1 ? rich : JSON.stringify(example()) }, model: 'test' }; },
  });
  vm.runInContext(extract(server, 'function getOutputText(', 'function getImageResult('), ctx);
  vm.runInContext(extract(server, 'async function serializePersonality(', 'async function rerollSection('), ctx);
  const payload = { kindroidName: "Maeve O'Connell", age: 27 };
  ctx.fitGeneratedMemories = async text => text;
  const output = await ctx.generateKindroid(payload, 'test');
  assert.equal(calls.length, 2);
  assert.ok(JSON.parse(calls[1].input).richPersonality.includes('pauses to organize'));
  assert.ok(payload.__personalityConstruction.richPersonality.includes('pauses to organize'));
  assert.equal(payload.__personalityConstruction.conceptLedger[0].owner, 'Key Memories');
  assert.ok(output.includes('{ID['));
  assert.equal(pipeline.sectionBody(output, 'Scene Setting'), 'Existing canon and text.');
  calls.length = 0;
  await ctx.generateKindroid({ lockedSections: { backstory: true }, existingSections: { backstory: 'Untouched saved prose' } }, 'test');
  assert.equal(calls.length, 1);
});

test('Routing rejects changes to locked memories and non-single-word journal triggers', async () => {
  let model = example();
  const ctx = vm.createContext({ personalitySerialization: pipeline, parseJsonObject: JSON.parse, postOpenAiResponse: async () => ({ response: { ok: true }, data: { output_text: JSON.stringify(model) }, model: 'test' }) });
  vm.runInContext(extract(server, 'function getOutputText(', 'function getImageResult('), ctx);
  vm.runInContext(extract(server, 'async function serializePersonality(', 'async function generateKindroid('), ctx);
  model.keyMemories = 'A: Event\nB: Event\nC: Event\nD: Event\nE: Event';
  await assert.rejects(ctx.serializePersonality('rich', { generator: { lockedSections: { kms: true } } }, 'test'), /locked memories/);
  await assert.rejects(ctx.serializePersonality('rich', {}, 'test', { allowRouting: false }), /cannot modify/);
  model = example();
  model.journals = [{ title: 'Ship layout', category: 'World', body: 'Maeve knows the quiet deck.', keywords: ['quiet deck', 'ship', 'deck', 'solarium', 'stairs', 'schedule'] }];
  await assert.rejects(ctx.serializePersonality('rich', {}, 'test'), /invalid journal/);
  model.journals[0].keywords[0] = 'quiet';
  const result = await ctx.serializePersonality('rich', {}, 'test');
  assert.equal(result.journals[0].title, 'Ship layout');
});

test('Compact text survives normalization without adding a prose framework', () => {
  const ctx = vm.createContext({ CompactPersonality: compact, sectionMeta: { backstory: { max: 2300 } } });
  vm.runInContext(extract(client, 'function normalizeSectionValue(', 'function ensureBackstoryPersonalityFramework('), ctx);
  const text = pipeline.finalize(example()).text;
  assert.equal(ctx.normalizeSectionValue('backstory', text), text);
});

test('Form extraction reads full names, chronological age and roles from compact identity', () => {
  const ctx = vm.createContext({ CompactPersonality: compact });
  vm.runInContext(extract(client, 'function backstoryPart(', 'function generatedFieldBackfill('), ctx);
  const text = pipeline.finalize(example(), { Age: 327 }).text;
  assert.equal(ctx.inferNameFromSections({ backstory: text }), "Maeve O'Connell");
  assert.equal(ctx.inferAgeFromSections({ backstory: text }), '327');
  assert.equal(ctx.backstoryPart(text, 'Occupation'), 'Hotel-event-manager');
});

test('Shared serializer loads in a browser without CommonJS', () => {
  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/compact-personality.js'), 'utf8'), ctx);
  assert.equal(ctx.CompactPersonality.fields('{ID[Name:Mara]}').ID.Name, 'Mara');
});

test('Offline serialization retains rich behavior and uses balanced compact tags', () => {
  const ctx = vm.createContext({
    CompactPersonality: compact, sectionMeta: { backstory: { max: 2300 } },
    isWorldKin: () => false, isMultiCharacterKin: () => false,
    buildBehavioralTendencies: () => 'Mara tests promises in small practical moments. Mara offers practical help before reassurance.',
    buildDecisionStyle: () => 'Mara checks who carries the consequences before deciding.',
    buildDistinctiveHabits: () => 'Mara folds receipts into quarters.',
    buildPersonalityFramework: () => 'Big Five O4/C4/E2/A3/S3; Enneagram 5w4; Secure attachment; MBTI INTJ as flavor.',
  });
  vm.runInContext(extract(client, 'function buildCompactFallbackPersonality(', 'function generateKindroid('), ctx);
  const p = { name: 'Mara', age: 27, userName: '{username}', personality: 'Private,asks-direct-questions', occupation: 'Locksmith', voice: 'Short questions; waits for an answer.' };
  const result = ctx.buildCompactFallbackPersonality(p, 'Conflict: Wants control but asks for help when work exceeds her skill.\nDynamic with {username}: Stranger-at-start\nLikes: Coffee\nDislikes: Loud restaurants');
  assert.ok(result.text.includes('checks who carries the consequences'));
  assert.ok(result.text.includes('folds receipts into quarters'));
  assert.ok(!result.text.includes('Personality Framework:'));
  assert.equal(compact.fields(result.text).ID.Role, 'Locksmith');
  assert.ok(result.text.length < 2300);
});
