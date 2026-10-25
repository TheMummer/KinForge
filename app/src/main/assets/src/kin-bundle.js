(function (root) {
  const zip = typeof module === "object" && module.exports ? require("./fflate") : root.fflate;
  const MAX_BYTES = 100 * 1024 * 1024;
  function read(bytes) {
    if (bytes.length > MAX_BYTES) throw new Error("Kin package exceeds the 100 MB limit.");
    let total = 0;
    let count = 0;
    const names = new Set();
    const files = zip.unzipSync(bytes, { filter(entry) {
      if (++count > 100 || names.has(entry.name)) throw new Error("Invalid or oversized Kin archive.");
      names.add(entry.name);
      if (entry.name.startsWith("/") || entry.name.includes("\\") || entry.name.split("/").includes("..")) throw new Error("Unsafe archive path.");
      total += entry.originalSize;
      if (total > MAX_BYTES) throw new Error("Unpacked Kin package exceeds the 100 MB limit.");
      return entry.name === "kinforge-package.json" || entry.name.startsWith("images/");
    } });
    if (!files["kinforge-package.json"]) throw new Error("This archive is missing kinforge-package.json.");
    const data = JSON.parse(zip.strFromU8(files["kinforge-package.json"]));
    if (!data || data.bundle?.format !== "KinForge .kin" || data.bundle?.bundleVersion !== 1 || !data.settings?.fields || !data.generatedSections) {
      throw new Error("Unsupported or invalid KinForge bundle.");
    }
    const manifest = data.imageManifest || data.bundle.images || {};
    function imageFor(slot) {
      const meta = manifest[slot];
      if (!meta) return null;
      const image = files[meta.path];
      if (!image) throw new Error(`Missing bundled image: ${meta.path}`);
      const mime = image[0] === 137 && image[1] === 80 && image[2] === 78 && image[3] === 71 ? "image/png"
        : image[0] === 255 && image[1] === 216 && image[2] === 255 ? "image/jpeg"
        : zip.strFromU8(image.subarray(0, 4)) === "RIFF" && zip.strFromU8(image.subarray(8, 12)) === "WEBP" ? "image/webp" : "";
      if (!mime) throw new Error(`Unsupported image in ${slot}. Use PNG, JPEG, or WebP.`);
      let binary = "";
      for (let i = 0; i < image.length; i += 8192) binary += String.fromCharCode(...image.subarray(i, i + 8192));
      return { ...meta, mimeType: mime, image: `data:${mime};base64,${btoa(binary)}` };
    }
    const preview = imageFor("currentPreview");
    const face = imageFor("faceReference");
    const body = imageFor("fullBodyReference");
    data.imageStudio = { ...(data.settings.imageStudio || {}), ...(data.imageStudio || {}),
      generatedImage: preview || face || body,
      referenceImages: { face, fullBody: body } };
    data.settings.imageStudio = data.imageStudio;
    return data;
  }
  const api = { read, MAX_BYTES };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.KinBundle = api;
})(typeof globalThis === "object" ? globalThis : this);
