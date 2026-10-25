const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const zip = require('../src/fflate');
const bundle = require('../src/kin-bundle');
const client = fs.readFileSync(require.resolve('../src/app.bundle.js'), 'utf8');
const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWZkAAAAASUVORK5CYII=', 'base64'));
function fixture() {
  return { packageType: 'KinForge .kin Bundle', packageVersion: 2,
    bundle: { format: 'KinForge .kin', bundleVersion: 1 },
    settings: { fields: { kindroidName: { value: 'Mara', locked: true } } },
    generatedSections: { backstory: 'Exact personality', kms: 'Exact memories' },
    journalManager: { journals: [{ title: 'Cafe', body: 'Mara works here.', keywords: ['coffee'] }] },
    imageManifest: Object.fromEntries(['currentPreview', 'faceReference', 'fullBodyReference'].map(slot => [slot, { path: `images/${slot}.png`, prompt: slot }])) };
}
function files(data = fixture()) {
  return { 'kinforge-package.json': zip.strToU8(JSON.stringify(data)),
    'images/currentPreview.png': png, 'images/faceReference.png': png, 'images/fullBodyReference.png': png };
}
test('Current export writer round-trips settings, exact output, journals and each image slot', async () => {
  const context = vm.createContext({ TextEncoder, Uint8Array, Uint32Array, Blob });
  vm.runInContext(client.slice(client.indexOf('function textBytes('), client.indexOf('function kinBundleFilename(')), context);
  const archive = context.createZipBlob(Object.entries(files()).map(([name, data]) => ({ name, data })));
  const result = bundle.read(new Uint8Array(await archive.arrayBuffer()));
  assert.deepEqual(result.settings.fields, fixture().settings.fields);
  assert.deepEqual(result.generatedSections, fixture().generatedSections);
  assert.deepEqual(result.journalManager, fixture().journalManager);
  assert.equal(result.imageStudio.referenceImages.face.prompt, 'faceReference');
  assert.equal(result.imageStudio.referenceImages.fullBody.prompt, 'fullBodyReference');
  assert.equal(result.imageStudio.generatedImage.prompt, 'currentPreview');
  assert.equal(result.imageStudio.generatedImage.image, `data:image/png;base64,${Buffer.from(png).toString('base64')}`);
});
test('Deflated bundles and bundles without images work', () => {
  assert.equal(bundle.read(zip.zipSync(files())).generatedSections.kms, 'Exact memories');
  const data = fixture();
  data.imageManifest = {};
  assert.equal(bundle.read(zip.zipSync(files(data))).imageStudio.generatedImage, null);
});
test('Rejects invalid ZIP, missing JSON, unsupported version, missing image and unsafe paths', () => {
  assert.throws(() => bundle.read(new Uint8Array([1, 2, 3])));
  assert.throws(() => bundle.read(zip.zipSync({})), /missing kinforge-package/);
  const data = fixture();
  data.bundle.bundleVersion = 99;
  assert.throws(() => bundle.read(zip.zipSync(files(data))), /Unsupported/);
  const entries = files();
  delete entries['images/faceReference.png'];
  assert.throws(() => bundle.read(zip.zipSync(entries)), /Missing bundled image/);
  assert.throws(() => bundle.read(zip.zipSync({ ...files(), '../bad': png })), /Unsafe/);
});
test('Load validates before reset and does not generate', async () => {
  const calls = [];
  const pill = {};
  const context = vm.createContext({ state: {}, KinBundle: bundle, Uint8Array,
    $: () => pill, resetKinImportCanvas: () => calls.push('reset'),
    loadSettingsData: () => calls.push('load'), setOutputCollapsed: () => {},
    showApiError: () => calls.push('error') });
  vm.runInContext(client.slice(client.indexOf('async function loadKinBundle('), client.indexOf('function loadTextFile(')), context);
  await context.loadKinBundle({ name: 'bad.kin', size: 3, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer });
  assert.deepEqual(calls, ['error']);
  calls.length = 0;
  const bytes = zip.zipSync(files());
  await context.loadKinBundle({ name: 'Mara.kin', size: bytes.length, arrayBuffer: async () => bytes.buffer });
  assert.deepEqual(calls, ['reset', 'load']);
});
