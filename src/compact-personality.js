(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CompactPersonality = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const tags = ["ID", "P", "Beh", "Social", "Decide", "Rel", "Int", "Voice", "Qrk", "Skill", "Trigger", "Likes", "NOW", "Framework"];
  const priorities = { ID: 0, P: 1, Decide: 3, Beh: 4, Trigger: 4, Social: 5, Rel: 5, Int: 5, Qrk: 7, Voice: 8, NOW: 9, Skill: 10, Likes: 11, Framework: 12 };
  const clean = value => String(value ?? "").replace(/[\r\n]+/g, " ").replace(/\|/g, "/").replace(/\[/g, "(").replace(/\]/g, ")").trim();

  function parse(text) {
    return [...String(text || "").matchAll(/\{([A-Za-z]+)\[([^\[\]]*)\]\}/g)].filter(match => tags.includes(match[1])).map(match => ({
      tag: match[1],
      properties: match[2].split("|").filter(Boolean).map(part => {
        const colon = part.indexOf(":");
        return colon < 0 ? { key: "", value: part.trim() } : { key: part.slice(0, colon).trim(), value: part.slice(colon + 1).trim() };
      }),
    }));
  }

  function render(units) {
    return units.filter(unit => unit.properties.length).map(unit => `{${unit.tag}[${unit.properties.map(p => p.key ? `${p.key}:${p.value}` : p.value).join("|")}]}`).join("\n");
  }

  function serialize(input, max = 2300) {
    if (!Array.isArray(input)) throw new Error("Compact Personality requires semantic units.");
    const units = tags.map(tag => ({ tag, properties: [] }));
    const seen = new Set();
    for (const unit of input) {
      const target = units.find(item => item.tag === unit.tag);
      if (!target) throw new Error(`Unknown Personality tag: ${unit.tag}`);
      for (const property of unit.properties || []) {
        const key = clean(property.key).replace(/:/g, "");
        const value = clean(property.value);
        if (!value || /^(?:Infer|AI|Random|Unknown|N\/A)$/i.test(value)) continue;
        if (!key && target.tag !== "Framework") throw new Error(`${target.tag} requires named properties.`);
        const signature = `${unit.tag}|${key}|${value}`.toLowerCase();
        if (!seen.has(signature)) target.properties.push({ key, value });
        seen.add(signature);
      }
    }
    const selected = units.map(unit => ({ tag: unit.tag, properties: [] }));
    const candidates = units.flatMap(unit => unit.properties.map(property => ({ tag: unit.tag, property })));
    candidates.sort((a, b) => priority(a) - priority(b));
    function priority(item) {
      if (item.tag === "P" && /drive|motivation/i.test(item.property.key)) return 2;
      if (item.tag === "P" && /pressure|stress|conflict/i.test(item.property.key)) return 4;
      if (item.tag === "P" && /flaw|contradiction/i.test(item.property.key)) return 6;
      return priorities[item.tag];
    }
    const omitted = [];
    for (const item of candidates) {
      const target = selected.find(unit => unit.tag === item.tag);
      target.properties.push(item.property);
      if (render(selected).length > max) {
        target.properties.pop();
        if (item.tag === "ID") throw new Error("Identity cannot fit the Personality character limit without losing facts.");
        omitted.push(item);
      }
    }
    const text = render(selected);
    if (!text) throw new Error("Compact Personality contained no usable information.");
    return { text, units: selected.filter(unit => unit.properties.length), omitted };
  }

  function fields(text) {
    const result = {};
    for (const unit of parse(text)) {
      result[unit.tag] ||= {};
      for (const property of unit.properties) result[unit.tag][property.key || property.value] = property.value;
    }
    return result;
  }
  return { tags, parse, serialize, fields };
});
