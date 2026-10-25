const MAX_CHARACTERS = 900;

function normalize(text) {
  return String(text || '').replace(/^\s*\*{0,2}Key Memories\*{0,2}:?\s*\r?\n/i, '').split(/\r?\n/).map(line => line.trim().replace(/^[-*]\s+/, '')).filter(Boolean).join('\n');
}

function isComplete(text) {
  const lines = text.split('\n');
  return text.length <= MAX_CHARACTERS && lines.length === 5 && lines.every(line =>
    /^[^:]+:\s*\S/.test(line) && /[.!?]["'\u201d\u2019)]*$/.test(line) && !/(?:\.\.\.|\u2026)["'\u201d\u2019)]*$/.test(line));
}

async function fitKeyMemories(text, rewrite) {
  const original = normalize(text);
  let candidate = original;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (isComplete(candidate)) return candidate;
    candidate = normalize(await rewrite({ original, candidate, characterCount: candidate.length, maxCharacters: MAX_CHARACTERS, targetCharacters: 820, attempt: attempt + 1 }));
  }
  if (isComplete(candidate)) return candidate;
  const error = new Error('Key Memories could not fit five complete entries within 900 characters. Previous output was preserved; retry generation.');
  error.status = 502;
  error.details = { code: 'key_memories_length', characters: candidate.length, maxCharacters: MAX_CHARACTERS };
  throw error;
}

module.exports = { normalize, isComplete, fitKeyMemories, MAX_CHARACTERS };
