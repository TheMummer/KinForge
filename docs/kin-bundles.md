# Kin Bundle Import

Use **Load** to select a `.kin` file made by **Export .kin**. Loading restores
settings, output sections, journals, image prompts, the current preview, and
separate face and full-body reference images. It does not run AI generation or
push changes to Kindroid. Existing text and JSON imports remain available.

Bundles use a ZIP container with `kinforge-package.json` and an image manifest.
Both stored and deflated entries are supported. The importer checks the bundle
version, required package data, image references, archive paths, and a 100 MB
size limit before replacing the current character. PNG, JPEG, and WebP images
are supported. Files are decoded in the browser, not extracted to disk.

The ZIP reader is vendored fflate 0.8.2 (`src/fflate.js`), MIT licensed; its
license is in `src/fflate.LICENSE`. It requires no runtime CDN connection.

Run `node --test tests/kin-bundle.test.js` for bundle round-trip and error tests.
Keep the `.kin` file as the portable image backup; this change does not add
image persistence to browser draft storage.
