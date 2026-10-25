const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const os = require('node:os');
const client = fs.readFileSync(path.join(__dirname, '../src/app.bundle.js'), 'utf8');
const backend = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
function extract(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `Missing source boundaries: ${start}`);
  return source.slice(from, to);
}
function personalityContext() {
  const ctx = vm.createContext({
    sectionMeta: { backstory: { label: 'Personality', max: 2300 } },
    buildProfile: () => ({}), buildPersonalityFramework: () => 'Big Five O3/C3/E3/A3/S3.',
  });
  vm.runInContext(extract(client, 'function compact(', 'function lowerFirst('), ctx);
  vm.runInContext(extract(client, 'function ensureBackstoryPersonalityFramework(', 'function currentUserName('), ctx);
  vm.runInContext(extract(client, 'function stripSectionLabel(', 'function fillMissingSections('), ctx);
  return ctx;
}

test('Personality preserves prose, short text, inferred traits and empty values', () => {
  const ctx = personalityContext();
  const prose = 'Mara checks contracts twice and teaches apprentices patiently. She visits her sister every Sunday.';
  assert.ok(ctx.ensureBackstoryPersonalityFramework(prose).startsWith(prose));
  assert.equal(ctx.ensureBackstoryPersonalityFramework(''), '');
  const framework = 'Personality Framework: Enneagram 5w4; Secure attachment; Neutral Good.';
  assert.equal(ctx.ensureBackstoryPersonalityFramework(`${prose}\n${framework}`), `${prose}\n${framework}`);
  const long = ctx.ensureBackstoryPersonalityFramework(`${prose.repeat(40)}\n${framework}`);
  assert.ok(long.length <= 2300);
  assert.ok(long.includes(framework));
});

test('Personality header removal leaves subsection names intact', () => {
  const ctx = personalityContext();
  assert.equal(ctx.stripSectionLabel('**Personality**\nMara owns a shop.', 'backstory'), 'Mara owns a shop.');
  assert.equal(ctx.stripSectionLabel('Personality: Patient and direct.', 'backstory'), 'Personality: Patient and direct.');
  assert.equal(ctx.stripSectionLabel('Personality Framework: Enneagram 5w4', 'backstory'), 'Personality Framework: Enneagram 5w4');
});

test('Reading output for exports never modifies saved text', () => {
  const field = { value: '  Short, edited personality.\n' };
  const ctx = vm.createContext({ outputSections: { backstory: 'output' }, $: () => field });
  vm.runInContext(extract(client, 'function outputSectionText(', 'function getSectionValues('), ctx);
  assert.equal(ctx.outputSectionText('backstory'), field.value);
  assert.equal(field.value, '  Short, edited personality.\n');
});

test('Generation clears unlocked outputs, preserves locks and restores after failure', async () => {
  const fields = new Map();
  const $ = id => {
    if (!fields.has(id)) fields.set(id, { value: '', textContent: '', classList: { add() {}, remove() {} }, addEventListener() {} });
    return fields.get(id);
  };
  $('personality').value = 'User-approved personality';
  $('scene').value = 'Previous scene';
  $('variant').value = 'Previous variant';
  const oldImage = { image: 'test-image' };
  const state = { imageStudioImage: oldImage };
  let submit;
  let sent;
  const ctx = vm.createContext({
    $, state, console: { warn() {} }, outputSections: { backstory: 'personality', opening: 'scene' },
    variantOutputs: { quiet: 'variant' }, journalParentByKeyphrases: {},
    isSectionLocked: key => key === 'backstory', value: id => $(id).value,
    setValue: (id, value) => { $(id).value = value; },
    getSectionValues: () => ({ backstory: $('personality').value, opening: $('scene').value }),
    getLockedSections: () => ({ backstory: true }), buildGeneratorPayload: () => ({ kindroidName: 'Mara' }),
    generateKindroidWithAi: async payload => {
      sent = payload;
      assert.equal($('personality').value, 'User-approved personality');
      assert.equal($('scene').value, '');
      throw new Error('incomplete_response');
    },
  });
  for (const name of ['clearApiError', 'showApiError', 'renderImagePreview', 'updateCounters', 'saveDraft', 'setOutputCollapsed', 'setWorkspaceTab', 'startGenerationProgress', 'failGenerationProgress']) ctx[name] = () => {};
  $('generatorForm').addEventListener = (_, handler) => { submit = handler; };
  vm.runInContext(extract(client, 'function clearGeneratedOutput(', 'function setGenerationProgress('), ctx);
  vm.runInContext(extract(client, '$("generatorForm").addEventListener("submit"', '$("randomSeedButton").addEventListener('), ctx);
  await submit({ preventDefault() {} });
  assert.equal(sent.existingSections.backstory, 'User-approved personality');
  assert.equal(sent.existingSections.opening, undefined);
  assert.equal($('scene').value, 'Previous scene');
  assert.equal($('variant').value, 'Previous variant');
  assert.equal(state.imageStudioImage, oldImage);
  assert.equal(state.generationBusy, false);
  ctx.generateKindroidWithAi = async () => ({ output: 'complete output', model: 'test-model' });
  ctx.parseOutputSections = () => ({ backstory: 'AI replacement', opening: 'New scene' });
  ctx.fillMissingSections = value => value;
  ctx.normalizeSectionValue = (_, value) => value;
  ctx.importGeneratedJournals = () => 0;
  ctx.inferName = () => 'Mara';
  for (const name of ['setGenerationProgress', 'applyGeneratedValuesToForm', 'finishGenerationProgress', 'setControlsCollapsed']) ctx[name] = () => {};
  vm.runInContext(extract(client, 'function setOutputSections(', 'function normalizeImportedSectionValue('), ctx);
  await submit({ preventDefault() {} });
  assert.equal($('personality').value, 'User-approved personality');
  assert.equal($('scene').value, 'New scene');
  assert.equal(state.generationBusy, false);
});

test('Complete responses missing required profile sections are rejected', async () => {
  const ctx = vm.createContext({ personalitySerialization: require('../lib/personality-serialization'), serializePersonality: async () => ({ text: '{ID[Name:Mara]}\n{Beh[Work:Checks-contracts]}', journals: [] }), OPENAI_API_KEY: 'test-only', KINFORGE_INSTRUCTIONS: '', postOpenAiResponse: async () => ({ response: { ok: true }, data: { output_text: 'Personality\nMara owns a shop.' }, model: 'test' }) });
  vm.runInContext(extract(backend, 'function getOutputText(', 'function getImageResult('), ctx);
  vm.runInContext(extract(backend, 'async function generateKindroid(', 'async function rerollSection('), ctx);
  await assert.rejects(ctx.generateKindroid({}, 'test'), error => error.details.code === 'missing_sections');
  ctx.postOpenAiResponse = async () => ({ response: { ok: true }, data: { output_text: ['Personality', 'Response Directive', 'Key Memories', 'Example Message', 'Scene Setting', 'Relationship Context', 'Avatar Description'].map(label => `*${label}*\nExample body`).join('\n\n') }, model: 'test' });
  ctx.fitGeneratedMemories = async text => text;
  assert.ok((await ctx.generateKindroid({}, 'test')).includes('Example body'));
});

test('Clearing explicitly still clears locked sections', () => {
  const field = { value: 'locked', textContent: '', classList: { add() {} } };
  const ctx = vm.createContext({ outputSections: { backstory: 'output' }, variantOutputs: {}, state: {}, $: () => field, setValue: (_, v) => { field.value = v; }, isSectionLocked: () => true });
  for (const name of ['renderImagePreview', 'updateCounters', 'saveDraft']) ctx[name] = () => {};
  vm.runInContext(extract(client, 'function clearGeneratedOutput(', 'function setGenerationProgress('), ctx);
  ctx.clearGeneratedOutput();
  assert.equal(field.value, '');
});

test('Incomplete responses are rejected even when they contain text', async () => {
  const ctx = vm.createContext({ MODEL: 'mock', OPENAI_API_KEY: 'test-only', logEvent() {}, console, fetch: async () => ({ ok: true, status: 200, json: async () => ({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output_text: 'Partial text' }) }) });
  vm.runInContext(extract(backend, 'function cleanModelId(', 'async function generateKindroid('), ctx);
  await assert.rejects(ctx.postOpenAiResponse({}, 'mock'), error => error.details.code === 'incomplete_response');
});

test('Static serving permits assets but blocks metadata, logs and traversal', async () => {
  let reads = 0;
  const ctx = vm.createContext({ URL, path, ROOT: path.resolve(__dirname, '..'), mimeTypes: {}, fs: { readFile: async () => { reads++; return 'asset'; } } });
  vm.runInContext(extract(backend, 'async function serveStatic(', 'function getOutputText('), ctx);
  for (const [url, expected] of [['/', 200], ['/src/app.bundle.js', 200], ['/.git/config', 403], ['/logs/kinforge.log', 403], ['/..%5cKinForge-other%5cprivate.txt', 403], ['/%zz', 400]]) {
    let status;
    await ctx.serveStatic({ url, headers: { host: 'localhost:4173' } }, { writeHead: s => { status = s; }, end() {} });
    assert.equal(status, expected, url);
  }
  assert.equal(reads, 2);
});

test('Server rejects foreign origins, rebinding hosts and non-JSON POSTs', async () => {
  let handler;
  const ctx = vm.createContext({ PORT: 4173, http: { createServer: fn => { handler = fn; } }, sendJson: (res, status) => { res.status = status; } });
  vm.runInContext(extract(backend, 'const server = http.createServer(', 'server.on("error"'), ctx);
  for (const headers of [{ host: 'attacker.example:4173' }, { host: 'localhost:4173', origin: 'https://attacker.example' }, { host: 'localhost:4173', 'content-type': 'text/plain' }]) {
    const res = {};
    await handler({ method: 'POST', headers }, res);
    assert.ok([403, 415].includes(res.status));
  }
});

test('Windows protects keys, rejects tampering and reads legacy keys for migration', { skip: process.platform !== 'win32' }, async () => {
  const { encryptLocalSecret, decryptLocalSecret } = require('../lib/local-secrets');
  const secret = 'disposable-test-value';
  const purpose = 'test-only';
  const blob = await encryptLocalSecret(secret, purpose);
  assert.equal(blob.alg, 'windows-dpapi');
  assert.ok(!JSON.stringify(blob).includes(secret));
  assert.equal(await decryptLocalSecret(blob, purpose), secret);
  await assert.rejects(decryptLocalSecret(blob, 'wrong-purpose'));
  const bytes = Buffer.from(blob.data, 'base64'); bytes[bytes.length - 1] ^= 1;
  await assert.rejects(decryptLocalSecret({ ...blob, data: bytes.toString('base64') }, purpose));
  const material = ['KinForge local API secret v1', os.hostname(), os.userInfo().username, process.env.USERPROFILE || process.env.HOME || ''].join('|');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', crypto.createHash('sha256').update(material).digest(), iv);
  cipher.setAAD(Buffer.from(purpose));
  const data = Buffer.concat([cipher.update(secret), cipher.final()]);
  const legacy = { v: 1, alg: 'aes-256-gcm', purpose, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
  const recovered = await decryptLocalSecret(legacy, purpose);
  assert.equal(await decryptLocalSecret(await encryptLocalSecret(recovered, purpose), purpose), secret);
});
