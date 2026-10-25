const compact = require('../src/compact-personality');
const headings = ['Tagline', 'Keywords', 'Story Premise', 'Behavioral Tendencies', 'Daily Routine', 'Contradictions', 'Decision-Making Style', 'Distinctive Habits', 'Local Knowledge', 'Personality', 'Backstory', 'Response Directive', 'Key Memories', 'Example Message', 'Scene Setting', 'Relationship Context', 'Avatar Description', 'Portrait Prompt', 'Physical Description', 'Face Detail', 'User Persona', 'Gallery Prompt - Dinner', 'Gallery Prompt - Outdoor', 'Gallery Prompt - Intimate', 'Gallery Prompt - Public', 'Gallery Prompt - Casual'];
const headingPattern = new RegExp(`^[ \\t]*\\*{0,2}(${headings.join('|')})(?: Keyphrases)?(?: \\(AD\\))?\\*{0,2}:?[ \\t]*\\r?$`, 'gm');

function sectionRange(text, label) {
  const found = [...String(text).matchAll(headingPattern)];
  const index = found.findIndex(match => match[1] === label);
  if (index < 0) return null;
  return { start: found[index].index, bodyStart: found[index].index + found[index][0].length, end: found[index + 1]?.index ?? text.length };
}
function sectionBody(text, label) {
  const range = sectionRange(text, label);
  return range ? text.slice(range.bodyStart, range.end).trim() : '';
}
function replaceSection(text, label, body) {
  const range = sectionRange(text, label);
  if (!range) throw new Error(`Missing ${label} section during serialization.`);
  return `${text.slice(0, range.start)}${label}\n${body}\n\n${text.slice(range.end)}`.trim();
}

const instructions = `Serialize a finished rich character model into a compact Kindroid V2 Personality. This is semantic serialization, not a character summary. The rich construction already exists; preserve its causal and behavioral detail. Do not invent a new character or simplify its psychology.
First classify each significant concept by canonical owner and make a compact concept ledger: Personality owns stable identity/behavior; Key Memories own concrete established events; Journal owns specialized knowledge, geography, procedures, NPC facts and lore; Scene Setting owns the immediate moment; User Persona owns player biography; Response Directive owns response mechanics; Example Message demonstrates voice; Learned Context owns future learning and must remain unpopulated. Reduce redundant explanations before compressing.
Return only JSON with this shape:
{"units":[{"tag":"ID","properties":[{"key":"Name","value":"exact name"}]}],"conceptLedger":[{"concept":"short concept","owner":"Personality","representation":"short behavioral consequence or existing destination"}],"keyMemories":null,"journals":[]}
units are semantic properties, not prose paragraphs copied into containers. Use only ID,P,Beh,Social,Decide,Rel,Int,Voice,Qrk,Skill,Trigger,Likes,NOW,Framework. Choose useful tags; omit empty or redundant sections. Preserve concrete observable behavior: Pressure:Withdraws-briefly>organizes>returns-practical, not Stress:Anxious. Trust:Earned-through-consistency, not Trust:Issues. Describe what happens under disagreement, embarrassment, comfort and stress when supported by the rich model. Do not invent traits to fill the schema.
ID: Name,Age,Gender,Species,Ethn,Origin,Home,Role,SideWork,Edu when supplied/useful. Preserve names, ages, occupations, secondary roles, schooling, and identity facts faithfully. Hyphenate phrases for compactness but keep proper names readable.
P: Pub,Prv,Core,Drive,Flaw,Pressure as useful. Keep real public/private differences; do not invent them. Decide: Method,Uncertain,Conflict,HardLine or Accountability. Social: listening, candor, social energy, earning trust. Rel: starting relationship to the actual user name or {username}, boundaries and possible chemistry; never predetermine a future romance. Int: only relevant adult intimacy/orientation/leanings with observable preferences. Voice: short character-specific anchors and brief quoted cues; Example Message remains authoritative. Qrk: distinctive observable habits. Skill: demonstrated competencies, not every hobby. Trigger: circumstance plus behavioral consequence. Likes: tangible preferences. NOW: current chapter of life, not the exact opening action. Framework: last priority; properties have empty key and compact values such as O5/C4/E2/A4/S3,1w2,Secure,Flight,Chaotic-Good,INFJ-flavor,126. Never output Infer or unresolved placeholders.
Use comma for related values, > for sequence, / for obvious alternatives, and clear hyphenated phrases. Do not put raw | or square brackets inside values. Avoid opaque abbreviations. A short natural sentence is allowed within a value when needed to preserve causality; do not squeeze nuance into vague labels.
Preservation priority: identity; core psychology; motivations; decision-making; stress/conflict behavior; relationship behavior; flaws/contradictions; quirks; voice; current life state; skills; preferences; framework labels. Aim for substantially less text than the source, usually 1400-1900 characters, never pad to a target; final limit 2300 including braces/separators. Favor more distinct behavior over adjective lists.
For World/NPC mode, preserve narrator/world behavior and player agency, not one person's invented psychology. For Multi-Character mode, name the relevant member in property keys to keep motives, voices, boundaries and knowledge distinct; never merge separate people into a single typology.
For any source event not already captured by existing Key Memories, keyMemories may contain a complete revised set of exactly five specifically titled lines under 900 characters, preserving existing canon and integrating the event. Otherwise return null. Do not change locked Key Memories. Specialized factual details removed from Personality must already exist in supplied journals/local knowledge, or be returned as journals: {title,category,keywords:[6-8 independent common single words],body:third-person concise facts under 450 characters}. Do not manufacture future Learned Context. For section rerolls (allowRouting=false), leave keyMemories null and journals empty; derive behavior from existing canon without inventing new history that needs routing.
Before returning check human readability, observable behavior, distinct member identity, no duplicated concepts, correct ownership, and character budget. Do not return the compact rendered string; return the units for deterministic serialization.`;

function finalize(model, identity = {}, max = 2300) {
  if (!Array.isArray(model.units) || !model.units.length) throw new Error('Personality serialization returned no semantic units.');
  if (!Array.isArray(model.conceptLedger)) throw new Error('Personality serialization omitted its ownership ledger.');
  const owners = new Set(['Personality', 'Key Memories', 'Journal', 'Scene Setting', 'User Persona', 'Response Directive', 'Example Message', 'Learned Context']);
  if (!model.conceptLedger.length || model.conceptLedger.some(entry => !entry.concept || !owners.has(entry.owner) || !entry.representation)) throw new Error('Personality ownership ledger is incomplete.');
  let id = model.units.find(unit => unit.tag === 'ID');
  if (!id) { id = { tag: 'ID', properties: [] }; model.units.unshift(id); }
  id.properties ||= [];
  for (const [key, value] of Object.entries(identity)) {
    if (value === undefined || value === null || !String(value).trim() || /^(Infer|AI|Random)$/i.test(String(value))) continue;
    id.properties = id.properties.filter(property => String(property.key || '').toLowerCase() !== key.toLowerCase());
    id.properties.push({ key, value: String(value) });
  }
  if (!model.units.some(unit => ['P', 'Beh', 'Decide', 'Social'].includes(unit.tag) && unit.properties?.length)) throw new Error('Personality serialization omitted behavioral information.');
  const result = compact.serialize(model.units, max);
  if (!result.units.some(unit => ['P', 'Beh', 'Decide', 'Social'].includes(unit.tag))) throw new Error('Personality budget left no room for behavior.');
  return result;
}
module.exports = { instructions, finalize, sectionBody, replaceSection };
