const $ = (id) => document.getElementById(id);

const state = {
  mode: "interview",
  questionIndex: 0,
  answers: {},
  interviewQuestions: [],
  workspaceMode: "create",
  controlTab: "kin",
  outputTab: "main",
  controlsCollapsed: false,
  outputCollapsed: false,
  fieldMeta: {},
  journals: [],
  journalDrafts: [],
  autoInferJournals: false,
  generatedNames: [],
  favoriteNames: [],
  consistencyReport: null,
  greetingReview: { issues: [], decisions: {} },
  journalCategories: ["Overview", "People", "Places", "Objects", "Events", "Relationships", "World", "Behavior", "Temporary"],
  journalCategory: "Overview",
  activeJournalId: "",
  imageStudioImage: null,
  faceReferenceImage: null,
  fullBodyReferenceImage: null,
  imageStudioBusy: false,
  kindroidApi: { apiKey: "", targets: [], selectedTargetId: "", includeFields: {}, pushHistory: [], chatHistory: null },
  aiModelBudgetBaseChoices: null,
};

const kindroidApiKeyStorageKey = "kinforge-kindroid-api-key-v1";
const kindroidTargetLibraryStorageKey = "kinforge-kindroid-targets-v1";

const questions = [
  {
    key: "why",
    text: "What is the real reason this character is the way they are? For example, does perfectionism come from ambition, shame, duty, fear, or love?",
  },
  {
    key: "wound",
    text: "What hurt, failure, secret, or unresolved pressure still shapes their choices?",
  },
  {
    key: "dream",
    text: "What do they want badly enough to make questionable decisions?",
  },
  {
    key: "complication",
    text: "What makes the situation messier than it first appears?",
  },
  {
    key: "texture",
    text: "What physical details should the bot remember: city sounds, job tools, rooms, weather, clothes, food, hobbies, or sensory anchors?",
  },
  {
    key: "voice",
    text: "How should they sound when they speak? Think sentence length, humor, flirting style, pauses, bluntness, pet names, or restraint.",
  },
];

const interviewThemes = new Set([
  "why",
  "wound",
  "dream",
  "complication",
  "texture",
  "voice",
  "relationship",
  "occupation",
  "world",
  "intimacy",
  "personality",
  "appearance",
  "boundaries",
]);

function fallbackInterviewQuestions() {
  return questions.map((question) => ({
    ...question,
    theme: question.key,
    kind: "core",
    source: "static",
  }));
}

function normalizeInterviewKey(text, fallback) {
  const key = String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return key || fallback;
}

function normalizeInterviewQuestions(list = []) {
  const used = new Set();
  const normalized = (Array.isArray(list) ? list : [])
    .map((item, index) => {
      const text = compact(item?.text || item?.question || "", 280);
      if (!text) return null;
      const rawTheme = normalizeInterviewKey(item?.theme || item?.category || item?.key || "why", "why");
      const theme = interviewThemes.has(rawTheme) ? rawTheme : "why";
      const baseKey = normalizeInterviewKey(item?.key || `ai_${theme}_${index + 1}`, `ai_${theme}_${index + 1}`);
      let key = baseKey;
      let suffix = 2;
      while (used.has(key)) {
        key = `${baseKey}_${suffix}`;
        suffix += 1;
      }
      used.add(key);
      return {
        key,
        theme,
        text,
        kind: item?.kind === "followup" ? "followup" : "core",
        followUpOf: String(item?.followUpOf || item?.follow_up_of || "").trim(),
        source: item?.source || "ai",
      };
    })
    .filter(Boolean)
    .slice(0, 20);
  return normalized.length ? normalized : fallbackInterviewQuestions();
}

function activeInterviewQuestions() {
  return normalizeInterviewQuestions(state.interviewQuestions?.length ? state.interviewQuestions : fallbackInterviewQuestions());
}

function interviewThemeAnswer(theme) {
  const active = activeInterviewQuestions();
  const chunks = [];
  if (state.answers?.[theme]) chunks.push(String(state.answers[theme]).trim());
  active.forEach((question) => {
    const answer = String(state.answers?.[question.key] || "").trim();
    if (!answer || question.theme !== theme || question.key === theme) return;
    chunks.push(`${question.text} ${answer}`);
  });
  return chunks.filter(Boolean).join("\n").trim();
}

function buildInterviewAnswerSummary() {
  return activeInterviewQuestions()
    .map((question) => {
      const answer = String(state.answers?.[question.key] || "").trim();
      if (!answer) return "";
      return `${question.theme}: ${question.text} ${answer}`;
    })
    .filter(Boolean)
    .join("\n");
}

const outputSections = {
  tagline: "taglineOutput",
  keywords: "keywordsOutput",
  premise: "storyPremiseOutput",
  behavior: "behaviorOutput",
  behaviorKeyphrases: "behaviorKeyphrasesOutput",
  routine: "routineOutput",
  routineKeyphrases: "routineKeyphrasesOutput",
  contradictions: "contradictionsOutput",
  contradictionsKeyphrases: "contradictionsKeyphrasesOutput",
  decision: "decisionOutput",
  decisionKeyphrases: "decisionKeyphrasesOutput",
  habits: "habitsOutput",
  habitsKeyphrases: "habitsKeyphrasesOutput",
  localKnowledge: "localKnowledgeOutput",
  localKnowledgeKeyphrases: "localKnowledgeKeyphrasesOutput",
  backstory: "backstoryOutput",
  rd: "rdOutput",
  kms: "kmOutput",
  example: "exampleOutput",
  opening: "openingGreetingOutput",
  relationship: "playerRelationshipOutput",
  avatar: "avatarOutput",
  portrait: "portraitPromptOutput",
  physical: "physicalDescriptionOutput",
  face: "faceDetailOutput",
  galleryDinner: "galleryDinnerOutput",
  galleryOutdoor: "galleryOutdoorOutput",
  galleryIntimate: "galleryIntimateOutput",
  galleryPublic: "galleryPublicOutput",
  galleryCasual: "galleryCasualOutput",
  player: "playerProfileOutput",
};

const sectionMeta = {
  tagline: { label: "Tagline", max: 100 },
  keywords: { label: "Keywords", max: 220 },
  premise: { label: "Story Premise", max: 900 },
  behavior: { label: "Behavioral Tendencies", max: 450 },
  behaviorKeyphrases: { label: "Behavioral Tendencies Keyphrases", max: 220 },
  routine: { label: "Daily Routine", max: 450 },
  routineKeyphrases: { label: "Daily Routine Keyphrases", max: 220 },
  contradictions: { label: "Contradictions", max: 450 },
  contradictionsKeyphrases: { label: "Contradictions Keyphrases", max: 220 },
  decision: { label: "Decision-Making Style", max: 450 },
  decisionKeyphrases: { label: "Decision-Making Style Keyphrases", max: 220 },
  habits: { label: "Distinctive Habits", max: 450 },
  habitsKeyphrases: { label: "Distinctive Habits Keyphrases", max: 220 },
  localKnowledge: { label: "Local Knowledge", max: 450 },
  localKnowledgeKeyphrases: { label: "Local Knowledge Keyphrases", max: 220 },
  backstory: { label: "Personality", max: 2300 },
  rd: { label: "Response Directive", max: 250 },
  kms: { label: "Key Memories", max: 900 },
  example: { label: "Example Message", max: 700 },
  opening: { label: "Scene Setting", max: 850 },
  relationship: { label: "Relationship Context", max: 350 },
  avatar: { label: "Avatar Description", max: 600 },
  portrait: { label: "Portrait Prompt", max: 200 },
  physical: { label: "Physical Description", max: 520 },
  face: { label: "Face Detail", max: 200 },
  galleryDinner: { label: "Gallery Prompt - Dinner", max: 450 },
  galleryOutdoor: { label: "Gallery Prompt - Outdoor", max: 450 },
  galleryIntimate: { label: "Gallery Prompt - Intimate", max: 450 },
  galleryPublic: { label: "Gallery Prompt - Public", max: 450 },
  galleryCasual: { label: "Gallery Prompt - Casual", max: 450 },
  player: { label: "User Persona", max: 450 },
};

const journalPairs = {
  behavior: "behaviorKeyphrases",
  routine: "routineKeyphrases",
  contradictions: "contradictionsKeyphrases",
  decision: "decisionKeyphrases",
  habits: "habitsKeyphrases",
  localKnowledge: "localKnowledgeKeyphrases",
};

const journalParentByKeyphrases = Object.fromEntries(
  Object.entries(journalPairs).map(([entry, keyphrases]) => [keyphrases, entry]),
);

const journalKeyphraseSections = new Set(Object.values(journalPairs));

const variantOutputs = {
  quiet: "quietVariantOutput",
  conflict: "conflictVariantOutput",
  mystery: "mysteryVariantOutput",
};

const imageStudioSceneSources = {
  portrait: "portraitPromptOutput",
  dinner: "galleryDinnerOutput",
  outdoor: "galleryOutdoorOutput",
  intimate: "galleryIntimateOutput",
  public: "galleryPublicOutput",
  casual: "galleryCasualOutput",
};

const generationSteps = [
  "Reading current fields",
  "Building character logic",
  "Creating description",
  "Writing journals",
  "Writing scenes",
  "Writing greeting",
  "Polishing output",
];

let progressTimer = null;
const generationEstimatedMs = 90000;
const generationStepMs = generationEstimatedMs / (generationSteps.length - 1);
let lastApiErrorText = "";

const journalConfig = {
  maxEntries: 500,
  maxKeywords: 8,
  maxBodyCharacters: 500,
};

const aiModelOptions = {
  budget: "gpt-4.1-mini",
  fast: "gpt-5.6-luna",
  balanced: "gpt-5.6-terra",
  best: "gpt-5.6",
};

const aiTaskConfig = [
  { key: "fullGeneration", label: "Full Generation", defaultTier: "balanced" },
  { key: "surprise", label: "Surprise Me", defaultTier: "balanced" },
  { key: "reroll", label: "Section Rerolls", defaultTier: "balanced" },
  { key: "field", label: "Field Regeneration", defaultTier: "fast" },
  { key: "greeting", label: "Scene Studio", defaultTier: "best" },
  { key: "scene", label: "Scene Variants", defaultTier: "best" },
  { key: "journals", label: "Journals", defaultTier: "balanced" },
  { key: "names", label: "Names", defaultTier: "fast" },
  { key: "import", label: "Kin Text Import", defaultTier: "balanced" },
  { key: "continuity", label: "Consistency Check", defaultTier: "best" },
  { key: "image", label: "Image Generation", defaultTier: "balanced" },
];

const budgetModeTasks = new Set(["surprise", "reroll", "field", "journals", "names"]);

const appearanceFieldIds = [
  "portraitConsistency",
  "facialDistinctiveness",
  "appearanceEthnicity",
  "skinTone",
  "hairColor",
  "hairColorCustom",
  "hairstyle",
  "hairLength",
  "hairTexture",
  "eyeColor",
  "eyeShape",
  "faceShape",
  "noseShape",
  "lipShape",
  "browShape",
  "jawline",
  "distinctiveFeatures",
  "heightScale",
  "bodyShape",
  "bodyBuild",
  "muscleTone",
  "appearanceClothing",
  "appearanceExpression",
  "appearancePose",
  "appearanceLighting",
  "appearanceNotes",
];

const personalityFieldIds = [
  "bigFiveOpenness",
  "bigFiveConscientiousness",
  "bigFiveExtraversion",
  "bigFiveAgreeableness",
  "bigFiveEmotionalStability",
  "enneagramType",
  "enneagramWing",
  "attachmentStyle",
  "traumaResponse",
  "moralAlignment",
  "mbti",
  "tritype",
];

const nameFieldIds = [
  "nameCurrentYear",
  "nameEstimatedBirthYear",
  "nameBirthCountry",
  "nameHeritage",
  "nameRegion",
  "nameFamilyStyle",
  "nameFeel",
  "nameGenre",
  "nameOccupationBias",
  "nameLength",
  "nameRarity",
  "nameCommonnessFilter",
];

const worldFieldIds = [
  "worldType",
  "worldEra",
  "worldRules",
  "worldCreatures",
  "worldFactions",
  "worldPeople",
  "worldPlaces",
  "worldConflicts",
  "worldNotes",
];

const generatorFieldIds = [
  "creationType",
  "ensembleMembers",
  "worldNarrationNotes",
  "kindroidName",
  "gender",
  "species",
  "age",
  "apparentAge",
  "currentCity",
  "currentState",
  "currentCountry",
  "coreIdea",
  "occupation",
  "secondaryOccupation",
  "education",
  "genre",
  "tonePack",
  "storyIntensity",
  ...worldFieldIds,
  "personality",
  "dynamic",
  "relationshipPreset",
  "intimacy",
  "intimacyOrientation",
  "partnerStyle",
  "powerLeaning",
  "chemistry",
  "moralEdge",
  "dramaHeat",
  "boundaries",
  ...personalityFieldIds,
  ...nameFieldIds,
  ...appearanceFieldIds,
  "playerName",
  "playerAge",
  "playerGender",
  "playerEthnicity",
  "playerNotes",
].filter((id, index, ids) => ids.indexOf(id) === index);

const fieldLabels = {
  creationType: "Creation type",
  ensembleMembers: "Ensemble members",
  worldNarrationNotes: "World / narrator instructions",
  kindroidName: "Kindroid name",
  gender: "Kindroid gender",
  species: "Species",
  age: "Kindroid age",
  apparentAge: "Apparent age",
  currentCity: "Current city",
  currentState: "State / region",
  currentCountry: "Country",
  nameCurrentYear: "Name current year",
  nameEstimatedBirthYear: "Estimated birth year",
  nameBirthCountry: "Name birth country",
  nameHeritage: "Name heritage",
  nameRegion: "Name region",
  nameFamilyStyle: "Name family style",
  nameFeel: "Name feel",
  nameGenre: "Name genre",
  nameOccupationBias: "Name occupation bias",
  nameLength: "Name length",
  nameRarity: "Name rarity",
  nameCommonnessFilter: "AI commonness filter",
  coreIdea: "Core idea",
  occupation: "Primary occupation",
  secondaryOccupation: "Secondary / secret work",
  education: "Education / schooling",
  genre: "Genre, setting, or vibe",
  tonePack: "Tone pack",
  storyIntensity: "Story intensity",
  worldType: "World type",
  worldEra: "Time period / era",
  worldRules: "World rules",
  worldCreatures: "Creatures / species",
  worldFactions: "Factions / groups",
  worldPeople: "People of note",
  worldPlaces: "Places of note",
  worldConflicts: "World conflicts",
  worldNotes: "World notes",
  personality: "Personality notes",
  dynamic: "Dynamic with user",
  relationshipPreset: "Relationship preset",
  intimacy: "Romance and intimacy notes",
  intimacyOrientation: "Intimacy orientation",
  partnerStyle: "Partner style",
  powerLeaning: "Intimacy power leaning",
  chemistry: "Chemistry",
  moralEdge: "Moral edge",
  dramaHeat: "Drama heat",
  boundaries: "Boundaries",
  bigFiveOpenness: "Openness",
  bigFiveConscientiousness: "Conscientiousness",
  bigFiveExtraversion: "Extraversion",
  bigFiveAgreeableness: "Agreeableness",
  bigFiveEmotionalStability: "Emotional stability",
  enneagramType: "Enneagram type",
  enneagramWing: "Enneagram wing",
  attachmentStyle: "Attachment style",
  traumaResponse: "Trauma response",
  moralAlignment: "Moral alignment",
  mbti: "MBTI",
  tritype: "Tritype",
  playerName: "Player name",
  playerAge: "Player age",
  playerGender: "Player gender",
  playerEthnicity: "Player ethnicity",
  playerNotes: "Player notes",
};

const bigFiveGuidance = {
  openness: {
    title: "Openness",
    low: "Practical, grounded, and comfortable with familiar methods. Low openness characters often prefer proven routines, clear facts, and familiar places.",
    high: "Curious, imaginative, and drawn to novelty. High openness characters notice patterns, chase ideas, and enjoy unusual experiences.",
    examples: ["Low: orders the same breakfast, trusts experience, dislikes vague experiments.", "High: tries new routes, collects strange references, asks unusual questions."],
  },
  conscientiousness: {
    title: "Conscientiousness",
    low: "Flexible, spontaneous, and comfortable improvising. Low conscientiousness characters may resist schedules or leave room for chaos.",
    high: "Organized, reliable, and goal-driven. High conscientiousness characters plan ahead, track details, and feel responsible for outcomes.",
    examples: ["Low: starts before the plan is finished, loses receipts, adapts quickly.", "High: keeps lists, prepares backups, remembers deadlines."],
  },
  extraversion: {
    title: "Extraversion",
    low: "Private, inward, and selective with social energy. Low extraversion characters often think before speaking and prefer smaller circles.",
    high: "Expressive, socially energized, and quick to engage. High extraversion characters often process aloud and seek momentum through people.",
    examples: ["Low: watches the room first, answers briefly, recharges alone.", "High: starts conversations, gestures while talking, pulls others into plans."],
  },
  agreeableness: {
    title: "Agreeableness",
    low: "Blunt, skeptical, and comfortable with friction. Low agreeableness characters challenge motives and do not soften every truth.",
    high: "Warm, cooperative, and attentive to others. High agreeableness characters repair tension and notice emotional needs.",
    examples: ["Low: negotiates hard, questions apologies, spots manipulation.", "High: checks in, gives second chances, tries to reduce harm."],
  },
  emotionalStability: {
    title: "Emotional Stability",
    low: "Reactive, intense, and easily affected by pressure. Lower stability can create sharper feelings, vigilance, and visible stress responses.",
    high: "Steady, resilient, and slow to panic. High stability characters stay composed and recover quickly after conflict.",
    examples: ["Reactive: rereads messages, braces for bad news, snaps under strain.", "Stable: slows the room down, sleeps after a crisis, separates fear from facts."],
  },
};

const enneagramGuidance = {
  "1": { title: "Type One - The Reformer", motivation: "To be good, correct, and useful.", fear: "Being corrupt, wrong, or irresponsible.", strengths: ["Principled", "Disciplined", "Improves what others ignore"], struggles: ["Rigid", "Self-critical", "Resentful when standards are ignored"] },
  "2": { title: "Type Two - The Helper", motivation: "To be needed and loved.", fear: "Being unwanted or emotionally unnecessary.", strengths: ["Generous", "Emotionally perceptive", "Supportive"], struggles: ["Intrusive", "People-pleasing", "Hides needs behind care"] },
  "3": { title: "Type Three - The Achiever", motivation: "To succeed and be valued.", fear: "Being worthless or failing publicly.", strengths: ["Driven", "Adaptable", "Confident under pressure"], struggles: ["Image-conscious", "Workaholic", "Avoids vulnerability"] },
  "4": { title: "Type Four - The Individualist", motivation: "To be authentic and personally significant.", fear: "Being ordinary, unseen, or without identity.", strengths: ["Expressive", "Introspective", "Emotionally honest"], struggles: ["Envious", "Melancholic", "Can dramatize distance"] },
  "5": { title: "Type Five - The Investigator", motivation: "To understand the world and remain capable.", fear: "Being overwhelmed, invaded, or incompetent.", strengths: ["Thoughtful", "Independent", "Observant"], struggles: ["Detached", "Overthinks", "Withdraws under stress"] },
  "6": { title: "Type Six - The Loyalist", motivation: "To find security, trust, and reliable support.", fear: "Being abandoned, unsafe, or betrayed.", strengths: ["Prepared", "Loyal", "Good at spotting risks"], struggles: ["Suspicious", "Anxious", "Tests people repeatedly"] },
  "7": { title: "Type Seven - The Enthusiast", motivation: "To stay free, alive, and full of options.", fear: "Being trapped in pain or limitation.", strengths: ["Inventive", "Optimistic", "Fast-moving"], struggles: ["Avoidant", "Scattered", "Runs from grief or boredom"] },
  "8": { title: "Type Eight - The Challenger", motivation: "To stay strong and self-directed.", fear: "Being controlled, betrayed, or weak.", strengths: ["Protective", "Decisive", "Direct"], struggles: ["Dominating", "Guarded", "Escalates conflict"] },
  "9": { title: "Type Nine - The Peacemaker", motivation: "To maintain peace and inner steadiness.", fear: "Conflict, separation, or being forced into intensity.", strengths: ["Patient", "Grounding", "Accepting"], struggles: ["Avoidant", "Passive", "Numbs out instead of choosing"] },
};

const attachmentGuidance = {
  Secure: { title: "Secure", overview: "Comfortable with closeness and independence.", behaviors: ["Can ask for reassurance without spiraling", "Repairs conflict directly", "Lets trust grow through consistent actions"] },
  Anxious: { title: "Anxious", overview: "Wants closeness and may fear being left behind.", behaviors: ["Looks for signs of distance", "Needs clear reassurance", "Can push for answers before the other person is ready"] },
  Avoidant: { title: "Avoidant", overview: "Values independence and may struggle with vulnerability.", behaviors: ["Pulls back when emotions get intense", "Shows care through action more than confession", "Needs space before repair conversations"] },
  "Fearful-Avoidant": { title: "Fearful-Avoidant", overview: "Desires closeness but fears being hurt by it.", behaviors: ["Moves toward intimacy, then retreats", "Tests whether care is safe", "Can confuse protection with distance"] },
};

const alignmentGuidance = {
  "Lawful Good": "Follows rules because they believe rules should protect people.",
  "Neutral Good": "Helps people first and treats rules as tools, not masters.",
  "Chaotic Good": "Breaks rules to help people when the system fails them.",
  "Lawful Neutral": "Believes order, duty, or procedure matters more than personal feelings.",
  "True Neutral": "Balances competing interests and avoids moral extremes.",
  "Chaotic Neutral": "Protects freedom and personal choice, even when it disrupts others.",
  "Lawful Evil": "Uses rules, rank, or contracts to gain power without appearing lawless.",
  "Neutral Evil": "Looks after personal interests first and avoids unnecessary risk.",
  "Chaotic Evil": "Acts on appetite, revenge, or domination without respect for limits.",
};

const mbtiGuidance = {
  INTJ: { name: "The Architect", summary: "Strategic, independent planners who enjoy solving difficult problems.", strengths: ["Analytical", "Long-term thinker", "Self-directed"], weaknesses: ["Reserved", "Can overlook emotions", "May appear blunt"], communication: "Precise, compressed, and focused on the point.", conflict: "Steps back, builds a plan, then returns with a firm conclusion.", relationships: "Slow to trust but very loyal once respect is earned.", occupations: "Researcher, strategist, engineer, investigator, consultant." },
  INTP: { name: "The Thinker", summary: "Curious analysts who enjoy theories, systems, and unusual problems.", strengths: ["Inventive", "Independent", "Objective"], weaknesses: ["Detached", "Can procrastinate", "May ignore practical details"], communication: "Exploratory, caveated, and idea-heavy.", conflict: "Dissects the logic before addressing the emotion.", relationships: "Shows care by sharing thoughts, tools, and obscure solutions.", occupations: "Programmer, analyst, professor, designer, archivist." },
  ENTJ: { name: "The Commander", summary: "Decisive organizers who push people and systems toward results.", strengths: ["Confident", "Efficient", "Strategic"], weaknesses: ["Impatient", "Dominating", "Can undervalue softness"], communication: "Direct, structured, and outcome-focused.", conflict: "Moves quickly toward decisions and accountability.", relationships: "Protective and demanding, with high standards for honesty.", occupations: "Executive, commander, producer, attorney, founder." },
  ENTP: { name: "The Debater", summary: "Quick, inventive challengers who test ideas through argument and play.", strengths: ["Clever", "Adaptive", "Energetic"], weaknesses: ["Restless", "Provocative", "Can dodge follow-through"], communication: "Fast, teasing, and possibility-driven.", conflict: "Argues to learn where the weak points are.", relationships: "Flirts through wit, challenge, and shared mischief.", occupations: "Inventor, journalist, entrepreneur, performer, investigator." },
  INFJ: { name: "The Advocate", summary: "Insightful idealists who read patterns in people and situations.", strengths: ["Perceptive", "Purposeful", "Empathetic"], weaknesses: ["Private", "Intense", "Can overextend"], communication: "Gentle but pointed, often naming what others avoid.", conflict: "Seeks the deeper cause and may withdraw when overwhelmed.", relationships: "Forms few bonds deeply and wants emotional meaning.", occupations: "Counselor, writer, advocate, teacher, cultural worker." },
  INFP: { name: "The Mediator", summary: "Values-led dreamers who seek authenticity and personal meaning.", strengths: ["Imaginative", "Compassionate", "Principled"], weaknesses: ["Conflict-avoidant", "Sensitive", "Can drift"], communication: "Reflective, sincere, and emotionally specific.", conflict: "Needs time to identify what feels wrong.", relationships: "Loves through loyalty, symbolism, and emotional presence.", occupations: "Writer, artist, therapist, librarian, nonprofit worker." },
  ENFJ: { name: "The Protagonist", summary: "Warm organizers who build momentum through people and shared purpose.", strengths: ["Charismatic", "Supportive", "Socially aware"], weaknesses: ["Over-involved", "Approval-seeking", "Can manage others too much"], communication: "Encouraging, clear, and emotionally tuned.", conflict: "Names the relational stakes and tries to repair quickly.", relationships: "Invested, expressive, and attentive to growth.", occupations: "Teacher, organizer, coach, public relations, team lead." },
  ENFP: { name: "The Campaigner", summary: "Expressive explorers who chase possibility, connection, and meaning.", strengths: ["Enthusiastic", "Creative", "Warm"], weaknesses: ["Scattered", "Restless", "Can avoid routine"], communication: "Animated, associative, and emotionally open.", conflict: "Looks for the feeling underneath the argument.", relationships: "Playful, sincere, and hungry for shared discovery.", occupations: "Performer, counselor, creator, journalist, community builder." },
  ISTJ: { name: "The Logistician", summary: "Reliable realists who value duty, memory, and tested methods.", strengths: ["Dependable", "Detail-minded", "Practical"], weaknesses: ["Stubborn", "Reserved", "Can resist novelty"], communication: "Plain, factual, and responsibility-focused.", conflict: "Returns to promises, records, and what was agreed.", relationships: "Shows care through consistency and practical help.", occupations: "Inspector, accountant, archivist, administrator, technician." },
  ISFJ: { name: "The Defender", summary: "Protective caretakers who notice needs and preserve what matters.", strengths: ["Loyal", "Patient", "Observant"], weaknesses: ["Self-sacrificing", "Conflict-avoidant", "Can cling to routine"], communication: "Warm, careful, and concrete.", conflict: "Tries to reduce harm, sometimes at personal cost.", relationships: "Quietly devoted and attentive to small details.", occupations: "Nurse, teacher, librarian, caretaker, office manager." },
  ESTJ: { name: "The Executive", summary: "Practical leaders who organize people around standards and results.", strengths: ["Decisive", "Responsible", "Clear"], weaknesses: ["Controlling", "Blunt", "Can dismiss exceptions"], communication: "Direct, procedural, and expectation-driven.", conflict: "Clarifies roles, rules, and consequences.", relationships: "Protective, dependable, and sometimes bossy.", occupations: "Manager, officer, contractor, operations lead, supervisor." },
  ESFJ: { name: "The Consul", summary: "Community-minded helpers who maintain harmony and social structure.", strengths: ["Hospitable", "Loyal", "Organized"], weaknesses: ["Approval-sensitive", "Conventional", "Can meddle"], communication: "Friendly, practical, and socially aware.", conflict: "Wants repair, apologies, and visible effort.", relationships: "Expressive, attentive, and tradition-aware.", occupations: "Host, nurse, teacher, coordinator, event planner." },
  ISTP: { name: "The Virtuoso", summary: "Calm problem-solvers who understand tools, systems, and immediate realities.", strengths: ["Resourceful", "Observant", "Steady in crisis"], weaknesses: ["Detached", "Impulsive", "Avoids emotional talks"], communication: "Brief, dry, and action-oriented.", conflict: "Fixes the practical problem before naming feelings.", relationships: "Shows care through competence and quiet presence.", occupations: "Mechanic, medic, pilot, artisan, investigator." },
  ISFP: { name: "The Adventurer", summary: "Gentle realists who follow personal values, beauty, and lived experience.", strengths: ["Sensitive", "Adaptable", "Grounded"], weaknesses: ["Avoidant", "Private", "Can resist pressure"], communication: "Soft, honest, and sensory.", conflict: "Needs space and resists being forced into a script.", relationships: "Affectionate through small actions and shared moments.", occupations: "Artist, florist, chef, animal care worker, stylist." },
  ESTP: { name: "The Entrepreneur", summary: "Bold responders who read the room and act quickly under pressure.", strengths: ["Energetic", "Practical", "Persuasive"], weaknesses: ["Risk-taking", "Impatient", "Can miss consequences"], communication: "Fast, concrete, and provocative.", conflict: "Moves toward confrontation and tests boundaries.", relationships: "Physical, playful, and momentum-driven.", occupations: "Paramedic, broker, performer, detective, athlete." },
  ESFP: { name: "The Entertainer", summary: "Expressive improvisers who bring immediacy, warmth, and sensory life.", strengths: ["Charming", "Responsive", "Fun-loving"], weaknesses: ["Impulsive", "Avoids planning", "Can chase attention"], communication: "Lively, direct, and emotionally visible.", conflict: "Reacts in the moment and wants warmth restored.", relationships: "Affectionate, playful, and present-focused.", occupations: "Performer, host, stylist, guide, hospitality worker." },
};

const mbtiSuggestions = {
  INTJ: ["High Openness", "High Conscientiousness", "Low Extraversion", "Likely Enneagram 5 or 1", "Avoidant or Secure"],
  INTP: ["High Openness", "Lower Conscientiousness", "Low Extraversion", "Likely Enneagram 5 or 9", "Avoidant or Secure"],
  ENTJ: ["High Conscientiousness", "High Extraversion", "Lower Agreeableness", "Likely Enneagram 3 or 8", "Secure or Avoidant"],
  INFJ: ["High Openness", "High Agreeableness", "Low Extraversion", "Likely Enneagram 4, 1, or 2", "Secure or Anxious"],
  INFP: ["High Openness", "High Agreeableness", "Low Extraversion", "Likely Enneagram 4 or 9", "Anxious or Avoidant"],
  ENFJ: ["High Extraversion", "High Agreeableness", "High Conscientiousness", "Likely Enneagram 2 or 3", "Secure or Anxious"],
  ENTP: ["High Openness", "High Extraversion", "Lower Conscientiousness", "Likely Enneagram 7 or 5", "Secure or Avoidant"],
  ENFP: ["High Openness", "High Extraversion", "High Agreeableness", "Likely Enneagram 7 or 4", "Secure or Anxious"],
  ISTJ: ["High Conscientiousness", "Low Extraversion", "Lower Openness", "Likely Enneagram 1 or 6", "Secure"],
  ISTP: ["Low Extraversion", "Lower Agreeableness", "Moderate Openness", "Likely Enneagram 5 or 8", "Avoidant"],
  ISFJ: ["High Agreeableness", "High Conscientiousness", "Low Extraversion", "Likely Enneagram 2 or 6", "Secure or Anxious"],
  ESTJ: ["High Conscientiousness", "High Extraversion", "Lower Openness", "Likely Enneagram 1, 3, or 8", "Secure"],
  ESFJ: ["High Extraversion", "High Agreeableness", "High Conscientiousness", "Likely Enneagram 2 or 6", "Secure or Anxious"],
  ISFP: ["High Agreeableness", "Low Extraversion", "Moderate Openness", "Likely Enneagram 4 or 9", "Avoidant or Secure"],
  ESTP: ["High Extraversion", "Lower Conscientiousness", "Lower Agreeableness", "Likely Enneagram 7 or 8", "Secure or Avoidant"],
  ESFP: ["High Extraversion", "High Agreeableness", "Lower Conscientiousness", "Likely Enneagram 7 or 2", "Secure or Anxious"],
};

const fieldHelpGuidance = {
  creationType: {
    title: "Creation Type",
    body: "Chooses the basic structure KinForge should build: one person, a whole world that portrays NPCs, or a small cast inside one Kindroid.",
    affects: ["Personality", "Response Directive", "Example Message", "Scene Setting", "Relationship Context"],
  },
  ensembleMembers: {
    title: "Ensemble Members",
    body: "For Multi-Character Kin mode, describe up to three characters. Give each one a role, voice, relationship, and one visual or behavioral anchor.",
    affects: ["Core Identity", "Personality", "Example Message", "Scene Setting", "Response Directive"],
  },
  worldNarrationNotes: {
    title: "World / Narrator Instructions",
    body: "For World / NPC Ensemble mode, define how the Kin should narrate the setting, portray NPCs, manage scenes, and guide the player to make journals for important NPCs.",
    affects: ["Story Premise", "Response Directive", "Example Message", "Scene Setting", "Relationship Context", "Journals"],
  },
  kindroidName: {
    title: "Kindroid Name",
    body: "Sets the character's actual name. If left blank, KinForge will infer or generate a name from age, gender, heritage, region, and concept.",
    affects: ["Core Identity", "Personality", "Avatar", "Scene Setting", "saved filename"],
  },
  gender: {
    title: "Kindroid Gender",
    body: "Defines gender language and helps name generation choose appropriate names. It also guides avatar/body description and pronouns.",
    affects: ["Name generation", "Core Identity", "Avatar", "visual descriptions"],
  },
  species: {
    title: "Species",
    body: "Defines the Kin's species, ancestry, or non-human identity. Use this for cat girls, goliaths, vampires, androids, fae, aliens, hybrids, or fantasy lineages.",
    affects: ["Core Identity", "Personality", "Avatar", "Portrait Prompt", "World journals"],
  },
  age: {
    title: "Kindroid Age",
    body: "Sets chronological age. KinForge uses this for identity, naming era, life stage, schooling/work realism, and avatar description.",
    affects: ["Core Identity", "name birth year", "Personality", "Avatar"],
  },
  apparentAge: {
    title: "Apparent Age",
    body: "Optional visual or supernatural age cue. Use it when chronological age and visible age differ, such as vampires, androids, immortals, or magical characters.",
    affects: ["Avatar", "Portrait Prompt", "Physical Description"],
  },
  currentCity: {
    title: "Current City",
    body: "The main city, town, district, settlement, or fictional location where the Kin currently lives or works. If blank, KinForge may invent one.",
    affects: ["Story Premise", "Texture", "Local Knowledge", "Scene Setting", "Gallery prompts"],
  },
  currentState: {
    title: "State / Region",
    body: "Optional region, province, state, island, district, or broader local area. Use this to ground invented cities or real-world settings.",
    affects: ["Local Knowledge", "Daily Routine", "Avatar context", "Gallery prompts"],
  },
  currentCountry: {
    title: "Country",
    body: "Optional country or world region. This helps names, culture, institutions, weather, schooling, and local routines stay coherent.",
    affects: ["Personality", "Naming", "Local Knowledge", "Texture"],
  },
  coreIdea: {
    title: "Core Idea",
    body: "Raw concept material. KinForge should transform this into concrete identity, conflict, routine, and story logic instead of copying it directly.",
    affects: ["Everything, especially Personality, Premise, Current, and Scene Setting"],
  },
  occupation: {
    title: "Primary Occupation",
    body: "The character's main job, role, or daily work. This is a source-of-truth anchor, so KinForge should not replace it with a more generic job.",
    affects: ["Core Identity", "Daily Routine", "Local Knowledge", "Scene Setting"],
  },
  secondaryOccupation: {
    title: "Secondary / Secret Work",
    body: "A side job, hidden income source, volunteer duty, family obligation, or private work. It adds pressure without replacing the primary occupation.",
    affects: ["Conflict", "Contradictions", "Key Memories", "Current"],
  },
  education: {
    title: "Education / Schooling",
    body: "School, training, apprenticeship, degree program, or self-taught background. Schooling is separate from occupation.",
    affects: ["Personality", "Daily Routine", "competence", "life stage"],
  },
  genre: {
    title: "Genre, Setting, Or Vibe",
    body: "Sets atmosphere and context. Genre should modify the character, not override their job, personality, or original premise.",
    affects: ["Tone", "Texture", "Story Premise", "Greeting"],
  },
  tonePack: {
    title: "Tone Pack",
    body: "Controls prose texture: sentence feel, imagery density, humor, pacing, and genre flavor. It should not change who the character is.",
    affects: ["Personality wording", "Example Message", "Scene Setting", "Response Directive"],
  },
  storyIntensity: {
    title: "Story Intensity",
    body: "Controls how dramatic the character's world is. Mild is everyday pressure, Moderate adds unusual complications, High supports frequent danger or conflict.",
    affects: ["Occupation pressure", "Current", "Premise", "Scene Setting"],
  },
  worldType: {
    title: "World Type",
    body: "Defines the broad setting reality: real world, historical, fantasy, sci-fi, horror, post-apocalyptic, or custom.",
    affects: ["World journals", "Local Knowledge", "Texture", "Gallery prompts"],
  },
  worldEra: {
    title: "Time Period / Era",
    body: "Sets calendar feel, technology level, institutions, clothing assumptions, transport, slang, and what details would be normal.",
    affects: ["World journals", "Local Knowledge", "Personality context"],
  },
  worldRules: {
    title: "World Rules",
    body: "Core setting laws the AI should remember: magic limits, technology rules, supernatural restrictions, social laws, or survival constraints.",
    affects: ["World journals", "Local Knowledge", "Scene logic"],
  },
  worldCreatures: {
    title: "Creatures / Species",
    body: "Non-human beings, monsters, spirits, androids, mutants, or a note that the world is ordinary humans only.",
    affects: ["World journals", "Story hooks", "Local Knowledge"],
  },
  worldFactions: {
    title: "Factions / Groups",
    body: "Organizations, guilds, agencies, covens, crews, houses, gangs, councils, or institutions that shape the world around the Kin.",
    affects: ["World journals", "People", "Conflict"],
  },
  worldPeople: {
    title: "People Of Note",
    body: "Important names and roles the Kin might know: officials, patrons, rivals, neighbors, bosses, family powers, or dangerous regulars.",
    affects: ["People journals", "Relationship hooks", "Local Knowledge"],
  },
  worldPlaces: {
    title: "Places Of Note",
    body: "Recurring locations that should be remembered: shops, ports, ruins, towers, diners, districts, markets, buildings, or roads.",
    affects: ["Places journals", "Texture", "Local Knowledge"],
  },
  worldConflicts: {
    title: "World Conflicts",
    body: "Ongoing setting pressure such as shortages, laws, faction tension, seasonal danger, class conflict, borders, or supernatural friction.",
    affects: ["World journals", "Story Premise", "Scene hooks"],
  },
  worldNotes: {
    title: "World Notes",
    body: "Extra setting continuity. KinForge should mostly turn this into journals so the world stays consistent without taking over the Kin.",
    affects: ["World journals", "Local Knowledge", "Continuity"],
  },
  personality: {
    title: "Personality Notes",
    body: "Optional nuance that sliders and labels do not capture: contradictions, humor, pressure points, fears behind behavior, and specific flaws.",
    affects: ["Personality", "Behavioral Tendencies", "Speech Patterns"],
  },
  traumaResponse: {
    title: "Trauma Response",
    body: "How the Kin reacts under threat, shame, overwhelm, or emotional danger. Use it to shape stress behavior without turning the whole character into a trauma summary.",
    affects: ["Conflict behavior", "repair attempts", "contradictions", "vulnerable moments"],
  },
  dynamic: {
    title: "Dynamic With User",
    body: "Describes the relationship angle with the player. Use this for specific context that the preset alone cannot express.",
    affects: ["Relationship Context", "Scene Setting", "Example Message"],
  },
  relationshipPreset: {
    title: "Relationship Preset",
    body: "A behavioral constraint for what the Kin knows, assumes, and expresses toward the user at the start.",
    affects: ["Scene Setting", "Example Message", "trust level", "physical boundaries"],
  },
  intimacy: {
    title: "Romance And Intimacy Notes",
    body: "Optional adult relationship guidance: tone, boundaries, kinks, tenderness, tension, or specific romantic context.",
    affects: ["Intimacy", "Chemistry", "relationship progression"],
  },
  intimacyOrientation: {
    title: "Intimacy Orientation",
    body: "Broad attraction/orientation preference. Keep it general; KinForge uses it to keep intimacy coherent.",
    affects: ["Intimacy", "Partner Style", "romantic framing"],
  },
  partnerStyle: {
    title: "Partner Style",
    body: "Broad style as a partner: protective, teasing, service-oriented, blunt, affectionate, distant, etc.",
    affects: ["Intimacy", "dialogue", "relationship behavior"],
  },
  powerLeaning: {
    title: "Intimacy Power Leaning",
    body: "A general consensual posture from Dom to Sub. It influences initiative and responsiveness without becoming explicit instructions.",
    affects: ["Intimacy", "Chemistry", "flirting style"],
  },
  chemistry: {
    title: "Chemistry",
    body: "Sets romantic or interpersonal charge: slow burn, fast burn, volatile, competitive, domestic, guarded, and so on.",
    affects: ["Intimacy", "Greeting distance", "Example Message"],
  },
  moralEdge: {
    title: "Moral Edge",
    body: "Controls how flawed or morally tidy the character is. Use this for messy, gray, jealous, self-destructive, or villainous tendencies.",
    affects: ["Conflict", "Key Memories", "Decision-Making", "Story hooks"],
  },
  dramaHeat: {
    title: "Drama Heat",
    body: "Controls contradiction, urgency, secrets, stakes, and emotional volatility. It should raise pressure without breaking realism.",
    affects: ["Conflict", "Current", "Scene Setting", "Key Memories"],
  },
  boundaries: {
    title: "Boundaries",
    body: "Hard exclusions and do-not-include guidance. These override other settings when there is a conflict.",
    affects: ["All generated sections"],
  },
};

const controlTabConfig = [
  { key: "kin", label: "Kin" },
  { key: "names", label: "Names" },
  { key: "personality", label: "Personality" },
  { key: "dynamics", label: "Dynamics" },
  { key: "world", label: "World" },
  { key: "appearance", label: "Appearance" },
  { key: "player", label: "Player" },
  { key: "ai", label: "AI Control" },
  { key: "interview", label: "Interview" },
];

const creationModeUi = {
  single: {
    tabLabels: {
      kin: "Kin",
      names: "Names",
      personality: "Personality",
      dynamics: "Dynamics",
      world: "World",
      appearance: "Appearance",
      player: "Player",
      ai: "AI Control",
      interview: "Interview",
    },
    outputTabLabels: {
      main: "Main Kin",
      journals: "Journals",
      scenes: "Scenes",
      description: "Description",
      gallery: "Gallery",
      player: "Player",
    },
    visibleTabs: ["kin", "names", "personality", "dynamics", "world", "appearance", "player", "ai", "interview"],
    hiddenFields: ["ensembleMembers", "worldNarrationNotes"],
    labels: {
      kindroidName: "Kindroid name",
      gender: "Kindroid gender",
      species: "Species",
      age: "Kindroid age",
      apparentAge: "Apparent age",
      currentCity: "Current city",
      currentState: "State / region",
      currentCountry: "Country",
      coreIdea: "Core idea",
      occupation: "Primary occupation",
      secondaryOccupation: "Secondary / secret work",
      education: "Education / schooling",
      personality: "Personality notes",
      dynamic: "Dynamic with user",
      relationshipPreset: "Relationship preset",
      intimacy: "Romance and intimacy notes",
      intimacyOrientation: "Intimacy orientation",
      partnerStyle: "Partner style",
      chemistry: "Chemistry",
      moralEdge: "Moral edge",
      dramaHeat: "Drama heat",
    },
    placeholders: {
      kindroidName: "Infer or enter a name",
      gender: "Woman, man, nonbinary...",
      species: "Human, cat girl, goliath, vampire, android...",
      age: "25+",
      apparentAge: "Optional: appears 29, early 30s...",
      currentCity: "Infer, Calder City, Seattle, Paris...",
      currentState: "Washington, Île-de-France, Kansai...",
      currentCountry: "United States, France, Japan...",
      coreIdea: "A burned-out Parisian chef rebuilding her confidence after a public failure.",
      occupation: "Babysitter, mechanic, private investigator, college student...",
      secondaryOccupation: "Optional side job, hidden income, volunteer work, illegal work, family obligation...",
      education: "Optional: college student, trade school, nursing program, dropped out, self-taught...",
      ensembleMembers: "For multi-character Kins: up to three people. Name | role | voice | relationship | visual anchor...",
      worldNarrationNotes: "For world Kins: narrator role, NPC handling, player role, journal instructions, scene rules...",
      personality: "Optional nuance: dry humor, fear behind behavior, contradiction, coping style...",
      dynamic: "How the Kin and user know or affect each other.",
      intimacy: "Optional: orientation, pacing, flirtation, kinks, boundaries, or relationship heat.",
    },
  },
  world: {
    tabLabels: {
      kin: "World",
      personality: "World Tone",
      dynamics: "Player Role",
      world: "Worldbuilding",
      player: "Player",
      ai: "AI Control",
      interview: "Interview",
    },
    outputTabLabels: {
      main: "World Profile",
      journals: "World Journals",
      scenes: "Opening Scene",
      description: "Setting / Avatar",
      gallery: "Scene Images",
      player: "Player Role",
    },
    visibleTabs: ["kin", "personality", "dynamics", "world", "player", "ai", "interview"],
    hiddenFields: ["nameWizardBox"],
    labels: {
      kindroidName: "World / scenario name",
      gender: "Default NPC gender mix",
      species: "Dominant species / peoples",
      age: "Default adult age range",
      apparentAge: "Default visual age cue",
      currentCity: "Starting location",
      currentState: "Region / territory",
      currentCountry: "Country / realm",
      coreIdea: "World premise",
      occupation: "Recurring public role",
      secondaryOccupation: "Hidden world pressure",
      education: "Institutions / training systems",
      ensembleMembers: "Recurring NPC seeds",
      worldNarrationNotes: "Narrator / NPC instructions",
      personality: "World tone / behavior",
      dynamic: "Player role in the world",
      relationshipPreset: "Player starting status",
      intimacy: "Adult romance rules for NPCs",
      intimacyOrientation: "NPC attraction guidance",
      partnerStyle: "NPC relationship style",
      chemistry: "Scene chemistry",
      moralEdge: "World moral edge",
      dramaHeat: "World pressure",
    },
    placeholders: {
      kindroidName: "The Brass Coast, Calder City, The Hollow Road...",
      gender: "Mixed, infer by NPC, mostly women, mostly men...",
      species: "Humans, fae courts, android citizens, monster clans...",
      age: "Adults only; infer by NPC",
      apparentAge: "Infer by NPC or faction",
      coreIdea: "A coastal city where every ferry route hides a different political debt.",
      occupation: "Common contact role: innkeeper, guard, fixer, clerk, ranger...",
      secondaryOccupation: "Corruption, black market, prophecy pressure, faction secrecy...",
      education: "Guilds, academies, apprenticeships, temple schools, military training...",
      ensembleMembers: "Optional NPC seeds: Name | role | voice | motive | secret...",
      worldNarrationNotes: "Narrate scenes, label NPC speakers, track consequences, suggest journals for important NPCs.",
      personality: "How the world feels and reacts: fair, harsh, comic, suspicious, generous, strange...",
      dynamic: "Who is the player here: newcomer, investigator, exile, resident, heir, traveler...",
      intimacy: "Optional: how adult NPC romance should appear, limits, pacing, and consent tone.",
    },
  },
  multi: {
    tabLabels: {
      kin: "Cast",
      personality: "Group Psychology",
      dynamics: "Group Dynamics",
      world: "World",
      appearance: "Representative Image",
      player: "Player",
      ai: "AI Control",
      interview: "Interview",
    },
    outputTabLabels: {
      main: "Cast Profile",
      journals: "Cast Journals",
      scenes: "Group Scenes",
      description: "Representative Look",
      gallery: "Cast Images",
      player: "Player Dynamics",
    },
    visibleTabs: ["kin", "personality", "dynamics", "world", "appearance", "player", "ai", "interview"],
    hiddenFields: ["nameWizardBox"],
    labels: {
      kindroidName: "Group / Kin title",
      gender: "Group gender makeup",
      species: "Group species makeup",
      age: "Member age range",
      apparentAge: "Representative apparent age",
      currentCity: "Shared location",
      currentState: "Region",
      currentCountry: "Country / realm",
      coreIdea: "Group premise",
      occupation: "Primary group role",
      secondaryOccupation: "Hidden group pressure",
      education: "Training / schooling mix",
      ensembleMembers: "Cast members",
      worldNarrationNotes: "Group portrayal notes",
      personality: "Group personality notes",
      dynamic: "Player/group dynamics",
      relationshipPreset: "Starting relationship map",
      intimacy: "Group intimacy dynamics",
      intimacyOrientation: "Member orientation mix",
      partnerStyle: "Partner style by member",
      chemistry: "Group chemistry",
      moralEdge: "Group moral edge",
      dramaHeat: "Group drama heat",
    },
    placeholders: {
      kindroidName: "The Voss Sisters, Apartment 3B, The Iron Lantern Crew...",
      gender: "Two women and one man, all women, mixed nonbinary cast...",
      species: "All human, vampire/fae pair, mixed fantasy party...",
      age: "25-34, late 20s, all adults...",
      apparentAge: "Primary member appears 29, mixed apparent ages...",
      coreIdea: "Three adult roommates running a failing occult shop with very different ideas about loyalty.",
      occupation: "Shared business, adventuring party, criminal crew, family shop, agency...",
      secondaryOccupation: "Secret member work, hidden debt, forbidden patron, side hustle...",
      education: "Different training per member, shared academy, self-taught crew...",
      ensembleMembers: "Name | role | voice | relationship to user | visual/behavior anchor. Max three adults.",
      worldNarrationNotes: "Speaker label rules, who speaks first, who withholds, who interrupts, group scene pacing.",
      personality: "Group tone plus differences: who is cautious, impulsive, warm, suspicious, dominant, avoidant...",
      dynamic: "How the player relates to each member separately and how the group reacts.",
      intimacy: "Only if wanted: separate attraction, jealousy, consent, boundaries, and pacing by member.",
    },
  },
};

const outputTabConfig = [
  { key: "main", label: "Main Kin" },
  { key: "journals", label: "Journals" },
  { key: "scenes", label: "Scenes" },
  { key: "description", label: "Description" },
  { key: "gallery", label: "Gallery" },
  { key: "player", label: "Player" },
];

const outputSectionGroups = {
  main: ["tagline", "keywords", "premise", "backstory", "rd", "kms"],
  journals: ["behavior", "routine", "contradictions", "decision", "habits", "localKnowledge"],
  scenes: ["example", "opening", "relationship"],
  description: ["avatar", "portrait", "physical", "face"],
  gallery: ["galleryDinner", "galleryOutdoor", "galleryIntimate", "galleryPublic", "galleryCasual"],
  player: ["player"],
};

function modePolicy(mode = creationModeKey()) {
  const policies = {
    single: {
      title: "Single Character Mode",
      focus: "Build one adult Kin with one identity, voice, appearance, relationship arc, and personal history.",
      recommended: ["Kindroid name or Infer", "Gender", "Age", "Core idea", "Personality", "Dynamic", "Appearance"],
      ignoredFields: [],
      ignoredReason: "",
      generationHint: "Use all standard character, personality, dynamics, appearance, name, world, and player fields normally.",
    },
    world: {
      title: "World / NPC Ensemble Mode",
      focus: "Build a setting/narrator that portrays the world and NPCs while keeping the player as the active character.",
      recommended: ["World premise", "Starting location", "Worldbuilding", "Player role", "Narrator / NPC instructions", "Recurring NPC seeds"],
      ignoredFields: [...nameFieldIds, ...appearanceFieldIds],
      ignoredReason: "Name Forge and personal Appearance fields are ignored because this mode is not one visual person.",
      generationHint: "Treat personal name-generation and personal appearance fields as inactive. Use world, player-role, NPC, narration, journal, and setting fields as the source of truth.",
    },
    multi: {
      title: "Multi-Character Kin Mode",
      focus: "Build two or three adult people inside one Kin, with separate voices, motives, boundaries, and relationships.",
      recommended: ["Group title", "Cast members", "Group premise", "Player/group dynamics", "World context", "Representative image"],
      ignoredFields: [...nameFieldIds],
      ignoredReason: "Name Forge fields are ignored because member names should come from Cast members or generation context.",
      generationHint: "Treat single-person name-generation fields as inactive. Use the group title, Cast members, relationship map, group dynamics, and representative image fields.",
    },
  };
  return policies[mode] || policies.single;
}

function value(id) {
  return $(id).value.trim();
}

function defaultAiModelSettings() {
  return Object.fromEntries(aiTaskConfig.map((task) => [task.key, { tier: task.defaultTier, custom: "" }]));
}

function validAiTier(tier, fallback = "balanced") {
  return ["budget", "fast", "balanced", "best", "custom"].includes(tier) ? tier : fallback;
}

function resolveAiModelChoice(choice = {}) {
  const tier = choice.tier || "balanced";
  if (tier === "custom") return String(choice.custom || "").trim();
  return aiModelOptions[tier] || "";
}

function readDisplayedAiModelChoices() {
  return Object.fromEntries(aiTaskConfig.map((task) => {
    const tier = $(`aiModel-${task.key}`)?.value || task.defaultTier;
    const custom = $(`aiCustomModel-${task.key}`)?.value.trim() || "";
    return [task.key, { tier, custom, model: resolveAiModelChoice({ tier, custom }) }];
  }));
}

function setDisplayedAiModelChoices(choices = {}) {
  const defaults = defaultAiModelSettings();
  aiTaskConfig.forEach((task) => {
    const choice = choices[task.key] || defaults[task.key] || {};
    const tier = validAiTier(choice.tier || task.defaultTier, task.defaultTier);
    const select = $(`aiModel-${task.key}`);
    const custom = $(`aiCustomModel-${task.key}`);
    if (select) select.value = tier;
    if (custom) custom.value = choice.custom || "";
    updateAiModelCustomVisibility(task.key);
  });
}

function displayedAiChoiceForTask(taskKey) {
  const tier = $(`aiModel-${taskKey}`)?.value || aiTaskConfig.find((task) => task.key === taskKey)?.defaultTier || "balanced";
  const custom = $(`aiCustomModel-${taskKey}`)?.value.trim() || "";
  return { tier, custom, model: resolveAiModelChoice({ tier, custom }) };
}

function syncBudgetBaseChoiceForTask(taskKey) {
  if (!$("budgetModeToggle")?.checked || budgetModeTasks.has(taskKey)) return;
  state.aiModelBudgetBaseChoices ||= readDisplayedAiModelChoices();
  state.aiModelBudgetBaseChoices[taskKey] = displayedAiChoiceForTask(taskKey);
}

function buildAiModelSettings() {
  const budgetMode = Boolean($("budgetModeToggle")?.checked);
  const displayedChoices = readDisplayedAiModelChoices();
  const choices = budgetMode && state.aiModelBudgetBaseChoices ? state.aiModelBudgetBaseChoices : displayedChoices;
  return {
    budgetMode,
    choices,
  };
}

function applyAiModelSettings(settings = {}) {
  const defaults = defaultAiModelSettings();
  const choices = settings.choices || settings;
  if ($("budgetModeToggle")) $("budgetModeToggle").checked = Boolean(settings.budgetMode);
  state.aiModelBudgetBaseChoices = settings.budgetMode ? { ...defaults, ...choices } : null;
  setDisplayedAiModelChoices(choices);
  applyBudgetModeVisualState();
}

function modelSettingsForTask(taskKey) {
  const settings = buildAiModelSettings();
  const budgetApplied = settings.budgetMode && budgetModeTasks.has(taskKey);
  return {
    task: taskKey,
    budgetMode: settings.budgetMode,
    budgetApplied,
    choices: settings.choices,
    override: budgetApplied ? { tier: "budget", custom: "", model: aiModelOptions.budget, reason: "Budget Mode" } : null,
  };
}

function updateAiModelCustomVisibility(taskKey) {
  const select = $(`aiModel-${taskKey}`);
  const custom = $(`aiCustomModel-${taskKey}`);
  if (!select || !custom) return;
  const customMode = select.value === "custom";
  custom.hidden = !customMode;
  custom.toggleAttribute("required", customMode);
}

function renderAiBudgetStatus() {
  const status = $("aiBudgetStatus");
  if (!status) return;
  const enabled = Boolean($("budgetModeToggle")?.checked);
  const labels = aiTaskConfig.filter((task) => budgetModeTasks.has(task.key)).map((task) => task.label);
  status.textContent = enabled
    ? `Budget Mode is on: ${labels.join(", ")} use ${aiModelOptions.budget}.`
    : "Budget Mode is off.";
}

function applyBudgetModeVisualState() {
  const budgetMode = Boolean($("budgetModeToggle")?.checked);
  aiTaskConfig.forEach((task) => {
    const select = $(`aiModel-${task.key}`);
    const custom = $(`aiCustomModel-${task.key}`);
    const row = select?.closest(".ai-model-row");
    const affected = budgetMode && budgetModeTasks.has(task.key);
    if (affected && select) select.value = "budget";
    if (select) select.disabled = affected;
    if (custom) custom.disabled = affected;
    row?.classList.toggle("budget-applied", affected);
    row?.querySelector(".budget-route-note")?.remove();
    if (affected && row) row.insertAdjacentHTML("beforeend", `<small class="budget-route-note">Budget Mode active: using ${escapeHtml(aiModelOptions.budget)}</small>`);
    updateAiModelCustomVisibility(task.key);
  });
  renderAiBudgetStatus();
}

function syncImageStudioModelFromRouting() {
  const imageChoice = buildAiModelSettings().choices?.image || defaultAiModelSettings().image;
  const tier = imageChoice?.tier || "balanced";
  if ($("imageStudioModelTier")) $("imageStudioModelTier").value = validAiTier(tier, "balanced");
  if ($("imageStudioCustomModel")) {
    $("imageStudioCustomModel").value = imageChoice?.custom || "";
    $("imageStudioCustomModel").hidden = tier !== "custom";
  }
}

function applyImageStudioModelToRouting() {
  const tier = value("imageStudioModelTier") || "balanced";
  const routingSelect = $("aiModel-image");
  const routingCustom = $("aiCustomModel-image");
  if (routingSelect) routingSelect.value = tier;
  if (routingCustom) routingCustom.value = value("imageStudioCustomModel");
  syncBudgetBaseChoiceForTask("image");
  updateAiModelCustomVisibility("image");
  renderAiBudgetStatus();
}

function renderAiControlPanel() {
  const host = $("aiModelRows");
  if (!host) return;
  host.innerHTML = aiTaskConfig.map((task) => `
    <label class="ai-model-row">
      <span>${escapeHtml(task.label)}</span>
      <select id="aiModel-${escapeHtml(task.key)}" data-ai-model-task="${escapeHtml(task.key)}">
        <option value="budget">Budget - ${escapeHtml(aiModelOptions.budget)}</option>
        <option value="fast">Fast - ${escapeHtml(aiModelOptions.fast)}</option>
        <option value="balanced">Balanced - ${escapeHtml(aiModelOptions.balanced)}</option>
        <option value="best">Best - ${escapeHtml(aiModelOptions.best)}</option>
        <option value="custom">Custom</option>
      </select>
      <input id="aiCustomModel-${escapeHtml(task.key)}" data-ai-custom-model="${escapeHtml(task.key)}" maxlength="80" placeholder="Custom model id" hidden />
    </label>
  `).join("");
  applyAiModelSettings(defaultAiModelSettings());
  host.querySelectorAll("[data-ai-model-task]").forEach((select) => {
    select.addEventListener("change", () => {
      updateAiModelCustomVisibility(select.dataset.aiModelTask);
      syncBudgetBaseChoiceForTask(select.dataset.aiModelTask);
      if (select.dataset.aiModelTask === "image") syncImageStudioModelFromRouting();
      renderAiBudgetStatus();
      saveDraft();
    });
  });
  host.querySelectorAll("[data-ai-custom-model]").forEach((input) => {
    input.addEventListener("input", () => {
      syncBudgetBaseChoiceForTask(input.dataset.aiCustomModel);
      if (input.dataset.aiCustomModel === "image") syncImageStudioModelFromRouting();
      saveDraft();
    });
  });
  $("budgetModeToggle")?.addEventListener("change", () => {
    if ($("budgetModeToggle").checked) {
      state.aiModelBudgetBaseChoices = readDisplayedAiModelChoices();
    } else if (state.aiModelBudgetBaseChoices) {
      setDisplayedAiModelChoices(state.aiModelBudgetBaseChoices);
      state.aiModelBudgetBaseChoices = null;
    }
    applyBudgetModeVisualState();
    syncImageStudioModelFromRouting();
    saveDraft();
  });
  renderAiBudgetStatus();
}

function setupKindroidApiControls() {
  normalizeKindroidApiState();
  $("kindroidApiKey")?.addEventListener("input", () => {
    saveKindroidApiFromControls();
    updateKindroidSecretStatus(hasSavedKindroidApiKeyBlob() ? "API key changed for this session. Click Save Key Locally to update the encrypted copy." : "");
    renderKindroidTargetGuide();
    if (!$("kindroidSafetyPanel")?.classList.contains("hidden")) renderKindroidPushSafetyReview();
    saveDraft();
  });
  $("rememberKindroidApiKey")?.addEventListener("change", () => {
    if ($("rememberKindroidApiKey").checked) {
      updateKindroidSecretStatus("Click Save Key Locally to store the encrypted API key on this PC.");
    } else {
      forgetEncryptedKindroidApiKey({ clearField: false });
    }
  });
  $("saveKindroidApiKeyButton")?.addEventListener("click", saveEncryptedKindroidApiKey);
  $("forgetKindroidApiKeyButton")?.addEventListener("click", () => forgetEncryptedKindroidApiKey({ clearField: true }));
  $("kindroidTargetSelect")?.addEventListener("change", () => {
    state.kindroidApi.selectedTargetId = value("kindroidTargetSelect");
    renderKindroidTargetSelect();
    renderKindroidChatHistory();
    saveDraft();
  });
  $("saveKindroidTargetButton")?.addEventListener("click", saveKindroidTargetFromControls);
  $("removeKindroidTargetButton")?.addEventListener("click", removeSelectedKindroidTarget);
  $("testKindroidApiButton")?.addEventListener("click", validateKindroidApiKey);
  $("loadKindroidLastPushButton")?.addEventListener("click", loadKindroidLastPushBaseline);
  $("inferKindroidFromChatButton")?.addEventListener("click", inferKindroidProfileFromRecentChat);
  $("buildKindroidPreviewButton")?.addEventListener("click", buildKindroidPushPreview);
  $("reviewKindroidPushButton")?.addEventListener("click", () => renderKindroidPushSafetyReview());
  $("compareKindroidPushButton")?.addEventListener("click", buildKindroidPushDiff);
  $("kindroidOverwriteConfirm")?.addEventListener("input", updateKindroidPushButtonState);
  $("pushKindroidButton")?.addEventListener("click", pushKindroidPreviewToApi);
  $("kindroidChatBreakConfirm")?.addEventListener("input", updateKindroidPushButtonState);
  $("buildKindroidChatBreakButton")?.addEventListener("click", () => {
    buildKindroidChatBreakPayload();
    saveDraft();
  });
  $("kindroidChatBreakButton")?.addEventListener("click", () => sendKindroidChatBreak());
  $("kindroidPushAndChatBreakButton")?.addEventListener("click", pushKindroidThenChatBreak);
  $("kindroidWipeCascaded")?.addEventListener("change", () => {
    buildKindroidChatBreakPayload();
    saveDraft();
  });
  $("fetchKindroidChatButton")?.addEventListener("click", fetchKindroidChatHistory);
  $("analyzeKindroidChatButton")?.addEventListener("click", analyzeFetchedKindroidChat);
  $("copyKindroidChatButton")?.addEventListener("click", async () => {
    const text = value("kindroidChatOutput");
    if (!text) return;
    await navigator.clipboard.writeText(text);
    $("kindroidChatStatus").textContent = "Copied chat export.";
  });
  $("clearKindroidChatButton")?.addEventListener("click", () => {
    state.kindroidApi.chatHistory = null;
    setValue("kindroidChatCursor", "");
    $("kindroidChatAnalysis")?.classList.add("hidden");
    renderKindroidChatHistory();
    saveDraft();
  });
  $("copyKindroidPreviewButton")?.addEventListener("click", async () => {
    const text = value("kindroidPushPreview") || JSON.stringify(buildKindroidPushPreview(), null, 2);
    if (!text) return;
    await navigator.clipboard.writeText(text);
    $("kindroidApiStatus").textContent = "Copied Kindroid push preview.";
  });
  $("copyKindroidDiffButton")?.addEventListener("click", async () => {
    const text = state.kindroidApi?.lastDiffText || buildKindroidPushDiff()?.text || "";
    if (!text) return;
    await navigator.clipboard.writeText(text);
    $("kindroidApiStatus").textContent = "Copied Kindroid push diff.";
  });
  document.querySelectorAll("[data-kindroid-field]").forEach((input) => {
    input.addEventListener("change", () => {
      saveKindroidApiFromControls();
      buildKindroidPushPreview();
      updateKindroidPushButtonState();
      if (!$("kindroidSafetyPanel")?.classList.contains("hidden")) renderKindroidPushSafetyReview();
    });
  });
  ["kindroidTargetName", "kindroidTargetAiId", "kindroidTargetNotes"].forEach((id) => {
    $(id)?.addEventListener("input", () => {
      $("kindroidApiStatus").textContent = "Target edits are local until you click Save Target.";
      renderKindroidTargetGuide();
      updateKindroidPushButtonState();
      if (!$("kindroidSafetyPanel")?.classList.contains("hidden")) renderKindroidPushSafetyReview();
    });
  });
  syncKindroidApiControlsFromState();
}

function createTabSet(containerId, panelHost, config, group) {
  const tabs = $(containerId);
  return Object.fromEntries(
    config.map(({ key, label }) => {
      const button = document.createElement("button");
      button.className = "workspace-tab";
      button.type = "button";
      button.dataset.workspaceTab = key;
      button.dataset.workspaceGroup = group;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-controls", `${group}TabPanel-${key}`);
      button.textContent = label;
      tabs.appendChild(button);

      const panel = document.createElement("div");
      panel.className = "tab-panel";
      panel.id = `${group}TabPanel-${key}`;
      panel.dataset.workspacePanel = key;
      panel.dataset.workspaceGroup = group;
      panel.setAttribute("role", "tabpanel");
      panelHost.appendChild(panel);
      return [key, panel];
    }),
  );
}

function appendFieldGrid(panel, ids) {
  const grid = document.createElement("div");
  grid.className = "field-grid";
  ids.forEach((id) => {
    const label = $(id)?.closest("label");
    if (label) grid.appendChild(label);
  });
  if (grid.children.length) panel.appendChild(grid);
}

function appendField(panel, id) {
  const label = $(id)?.closest("label");
  if (label) panel.appendChild(label);
}

function organizeAppearanceModule() {
  const box = $("appearanceBox");
  if (!box || box.dataset.organized === "true") return;
  box.dataset.organized = "true";
  const groups = [
    {
      title: "Identity Anchors",
      note: "Stable traits the image prompt should preserve first.",
      ids: ["portraitConsistency", "facialDistinctiveness", "appearanceEthnicity", "skinTone", "distinctiveFeatures"],
    },
    {
      title: "Hair",
      note: "Color is identity; style and length can vary unless locked.",
      ids: ["hairColor", "hairColorCustom", "hairstyle", "hairLength", "hairTexture"],
    },
    {
      title: "Face",
      note: "Facial details help prevent generic portrait drift.",
      ids: ["eyeColor", "eyeShape", "faceShape", "noseShape", "lipShape", "browShape", "jawline"],
    },
    {
      title: "Body",
      note: "Used for physical description and non-portrait scene prompts.",
      ids: ["heightScale", "bodyShape", "bodyBuild", "muscleTone"],
    },
    {
      title: "Presentation",
      note: "Creative surface details for current images and avatar style.",
      ids: ["appearanceClothing", "appearanceExpression", "appearancePose", "appearanceLighting", "appearanceNotes"],
    },
  ];
  const workspace = document.createElement("div");
  workspace.className = "appearance-workspace";
  groups.forEach((group) => {
    const section = document.createElement("section");
    section.className = "appearance-group";
    section.innerHTML = `
      <div class="appearance-group-head">
        <h3>${escapeHtml(group.title)}</h3>
        <p>${escapeHtml(group.note)}</p>
      </div>
    `;
    const grid = document.createElement("div");
    grid.className = "field-grid";
    group.ids.forEach((id) => {
      const label = $(id)?.closest("label");
      if (label) grid.appendChild(label);
    });
    if (grid.children.length) section.appendChild(grid);
    workspace.appendChild(section);
  });
  box.appendChild(workspace);
  box.querySelectorAll(":scope > .field-grid").forEach((grid) => {
    if (!grid.children.length) grid.remove();
  });
}

function setWorkspaceTab(group, key) {
  const config = group === "control" ? controlTabConfig : outputTabConfig;
  const firstVisibleKey = config.find((tab) => {
    const button = document.querySelector(`[data-workspace-tab][data-workspace-group="${group}"][data-workspace-tab="${tab.key}"]`);
    return !button || !button.hidden;
  })?.key || config[0].key;
  const requestedButton = document.querySelector(`[data-workspace-tab][data-workspace-group="${group}"][data-workspace-tab="${key}"]`);
  const validKey = config.some((tab) => tab.key === key) && !requestedButton?.hidden ? key : firstVisibleKey;
  if (group === "control") state.controlTab = validKey;
  else state.outputTab = validKey;

  document.querySelectorAll(`[data-workspace-tab][data-workspace-group="${group}"]`).forEach((button) => {
    const active = button.dataset.workspaceTab === validKey;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll(`[data-workspace-panel][data-workspace-group="${group}"]`).forEach((panel) => {
    const active = panel.dataset.workspacePanel === validKey;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  });
  updateStudioNavActive();
  updateStudioSnapshot();
  if (group === "output") renderOutputSectionNavigator();
}

function creationModeKey() {
  const raw = value("creationType");
  if (/world|npc ensemble/i.test(raw)) return "world";
  if (/multi-character/i.test(raw)) return "multi";
  return "single";
}

function fieldLabelTarget(id) {
  const field = $(id);
  const label = field?.closest("label");
  if (!field || !label) return null;
  let row = label.querySelector(":scope > .field-label-row");
  if (row) return row.querySelector(":scope > span:first-child") || row.firstElementChild;
  const labelText = [...label.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
  if (labelText) return labelText;
  return null;
}

function setControlFieldLabel(id, text) {
  const target = fieldLabelTarget(id);
  if (!target || !text) return;
  if (target.nodeType === Node.TEXT_NODE) target.textContent = `\n                ${text}\n                `;
  else target.textContent = text;
}

function setControlFieldPlaceholder(id, text) {
  const field = $(id);
  if (!field || text === undefined) return;
  field.setAttribute("placeholder", text);
}

function setControlFieldHidden(id, hidden) {
  const element = $(id);
  const host = element?.closest("label") || element;
  if (!host) return;
  host.hidden = Boolean(hidden);
  host.dataset.modeHidden = hidden ? "true" : "false";
}

function updateModeGuidanceBox(policy) {
  const box = $("modeGuidanceBox");
  if (!box || !policy) return;
  const ignored = policy.ignoredReason ? `<span>${escapeHtml(policy.ignoredReason)}</span>` : "";
  box.innerHTML = `
    <strong>${escapeHtml(policy.title)}</strong>
    <span>${escapeHtml(policy.focus)}</span>
    <span>Focus fields: ${escapeHtml(policy.recommended.join(", "))}.</span>
    ${ignored}
  `;
}

function setControlTabLabel(key, label) {
  const button = document.querySelector(`[data-workspace-tab][data-workspace-group="control"][data-workspace-tab="${key}"]`);
  if (button && label) button.textContent = label;
}

function setOutputTabLabel(key, label) {
  const button = document.querySelector(`[data-workspace-tab][data-workspace-group="output"][data-workspace-tab="${key}"]`);
  if (button && label) button.textContent = label;
}

function setControlTabHidden(key, hidden) {
  const button = document.querySelector(`[data-workspace-tab][data-workspace-group="control"][data-workspace-tab="${key}"]`);
  const panel = document.querySelector(`[data-workspace-panel][data-workspace-group="control"][data-workspace-panel="${key}"]`);
  if (button) {
    button.hidden = Boolean(hidden);
    button.setAttribute("aria-hidden", String(Boolean(hidden)));
  }
  if (panel && hidden) panel.hidden = true;
}

function applyCreationTypeUi() {
  const mode = creationModeKey();
  const config = creationModeUi[mode] || creationModeUi.single;
  const policy = modePolicy(mode);
  const visibleTabs = new Set(config.visibleTabs || creationModeUi.single.visibleTabs);

  controlTabConfig.forEach((tab) => {
    setControlTabLabel(tab.key, config.tabLabels?.[tab.key] || creationModeUi.single.tabLabels[tab.key] || tab.label);
    const hiddenByMode = tab.key === "interview" && state.mode !== "interview";
    setControlTabHidden(tab.key, !visibleTabs.has(tab.key) || hiddenByMode);
  });
  outputTabConfig.forEach((tab) => {
    setOutputTabLabel(tab.key, config.outputTabLabels?.[tab.key] || creationModeUi.single.outputTabLabels[tab.key] || tab.label);
  });

  const hiddenFields = new Set(config.hiddenFields || []);
  ["ensembleMembers", "worldNarrationNotes", "nameWizardBox"].forEach((id) => {
    setControlFieldHidden(id, hiddenFields.has(id));
  });

  const labels = { ...creationModeUi.single.labels, ...(config.labels || {}) };
  Object.entries(labels).forEach(([id, label]) => setControlFieldLabel(id, label));

  const placeholders = { ...creationModeUi.single.placeholders, ...(config.placeholders || {}) };
  Object.entries(placeholders).forEach(([id, placeholder]) => setControlFieldPlaceholder(id, placeholder));

  updateModeGuidanceBox(policy);
  updateStudioNavLabels();
  if (!visibleTabs.has(state.controlTab)) setWorkspaceTab("control", config.visibleTabs[0] || "kin");
  else setWorkspaceTab("control", state.controlTab || config.visibleTabs[0] || "kin");
  updateStudioSnapshot();
}

function compactSnapshotText(text, fallback = "Not set") {
  const clean = String(text || "").trim();
  return clean ? compact(clean, 42) : fallback;
}

function snapshotFieldCompleteness(fields) {
  const meaningful = fields.filter((id) => fieldHasMeaningfulValue(id)).length;
  return fields.length ? Math.round((meaningful / fields.length) * 100) : 0;
}

function updateStudioNavActive() {
  document.querySelectorAll(".studio-nav-item").forEach((button) => {
    const [group, key] = String(button.dataset.studioTarget || "").split(":");
    const target = group && key ? document.querySelector(`[data-workspace-tab][data-workspace-group="${group}"][data-workspace-tab="${key}"]`) : null;
    if (button.dataset.studioTarget) button.hidden = Boolean(target?.hidden);
    const active = (group === "control" && state.controlTab === key && state.workspaceMode !== "review") || (group === "output" && state.outputTab === key && state.workspaceMode === "review");
    button.classList.toggle("active", active);
  });
  updateStudioNavVisibility();
}

function studioNavSide(button) {
  const [group] = String(button.dataset.studioTarget || "").split(":");
  if (button.dataset.studioLabel === "ai" || button.dataset.studioLabel === "kindroidApi") return "settings";
  if (group === "control" || group === "output") return group;
  if (button.dataset.triggerAction === "consistency") return "output";
    if (["load", "import", "save-package", "save-settings", "export-kin"].includes(button.dataset.triggerAction)) return "utility";
  return "utility";
}

function updateStudioNavVisibility() {
  const nav = document.querySelector(".studio-nav");
  if (!nav) return;
  const showSide = state.workspaceMode === "review" ? "output" : state.workspaceMode === "settings" ? "settings" : "control";
  nav.querySelectorAll(".studio-nav-item").forEach((button) => {
    const hiddenByTab = button.dataset.studioTarget && button.hidden && !button.dataset.hiddenByCollapse;
    const side = studioNavSide(button);
    const hiddenByCollapse = showSide !== "all" && side !== showSide && side !== "utility";
    button.dataset.hiddenByCollapse = hiddenByCollapse ? "true" : "";
    button.hidden = Boolean(hiddenByTab || hiddenByCollapse);
  });
  const children = [...nav.children];
  children.forEach((child, index) => {
    if (!child.classList?.contains("nav-kicker")) return;
    const nextKickerIndex = children.findIndex((next, nextIndex) => nextIndex > index && next.classList?.contains("nav-kicker"));
    const sectionItems = children.slice(index + 1, nextKickerIndex === -1 ? children.length : nextKickerIndex)
      .filter((item) => item.classList?.contains("studio-nav-item"));
    child.hidden = sectionItems.length > 0 && sectionItems.every((item) => item.hidden);
  });
}

function updateStudioNavLabels() {
  const mode = creationModeKey();
  const labels = {
    single: {
      start: ["Start", "Core setup"],
      personality: ["Personality", "How they think"],
      dynamics: ["Dynamics", "Story and bonds"],
      world: ["World", "Setting logic"],
      appearance: ["Appearance", "Visual anchors"],
      player: ["Player", "User profile"],
      interview: ["AI Interview", "Organic questions"],
      names: ["Name Forge", "Generate names"],
      journals: ["Journals", "Memory triggers"],
      scenes: ["Greeting / Scenes", "Openings and variants"],
      images: ["Images", "Prompts and studio"],
      consistency: ["Consistency", "Review conflicts"],
      profile: ["Generated Profile", "Kindroid text"],
      characterSheet: ["Character Sheet", "Preview package"],
      loadPackage: ["Load Package", "Restore saved work"],
      importExport: ["Import Kin Text", "Infer from text"],
      savePackage: ["Save Package", "Everything local"],
      exportKin: ["Export .kin", "Share with images"],
      saveSettings: ["Save Settings", "Inputs only"],
      ai: ["AI Models", "Routing and budget"],
      kindroidApi: ["Kindroid API", "Publish and sync"],
    },
    world: {
      start: ["World Setup", "Scenario identity"],
      personality: ["World Tone", "Narration pressure"],
      dynamics: ["Player Role", "How play begins"],
      world: ["Worldbuilding", "Rules and places"],
      appearance: ["Setting Image", "Optional visual"],
      player: ["Player", "Role in world"],
      interview: ["World Interview", "Build scenario logic"],
      names: ["Name Forge", "World names"],
      journals: ["World Journals", "NPC and lore recall"],
      scenes: ["Opening Scene", "Start play"],
      images: ["Scene Images", "Setting prompts"],
      consistency: ["World Check", "Premise and lore"],
      profile: ["World Profile", "Generated text"],
      characterSheet: ["World Sheet", "Preview package"],
      loadPackage: ["Load Package", "Restore saved world"],
      importExport: ["Import World Text", "Infer from text"],
      savePackage: ["Save Package", "Everything local"],
      exportKin: ["Export .kin", "Share with images"],
      saveSettings: ["Save Settings", "Inputs only"],
      ai: ["AI Models", "Routing and budget"],
      kindroidApi: ["Kindroid API", "Publish and sync"],
    },
    multi: {
      start: ["Cast Setup", "Group identity"],
      personality: ["Group Psychology", "How they differ"],
      dynamics: ["Group Dynamics", "Player and cast"],
      world: ["World", "Shared setting"],
      appearance: ["Representative Image", "Primary visual"],
      player: ["Player", "Relationship map"],
      interview: ["Cast Interview", "Organic questions"],
      names: ["Name Forge", "Cast names"],
      journals: ["Cast Journals", "Member recall"],
      scenes: ["Group Scenes", "Speaker flow"],
      images: ["Cast Images", "Group prompts"],
      consistency: ["Cast Check", "Voice separation"],
      profile: ["Cast Profile", "Generated text"],
      characterSheet: ["Cast Sheet", "Preview package"],
      loadPackage: ["Load Package", "Restore saved cast"],
      importExport: ["Import Cast Text", "Infer from text"],
      savePackage: ["Save Package", "Everything local"],
      exportKin: ["Export .kin", "Share with images"],
      saveSettings: ["Save Settings", "Inputs only"],
      ai: ["AI Models", "Routing and budget"],
      kindroidApi: ["Kindroid API", "Publish and sync"],
    },
  };
  const activeLabels = labels[mode] || labels.single;
  document.querySelectorAll("[data-studio-label]").forEach((button) => {
    const label = activeLabels[button.dataset.studioLabel];
    if (!label) return;
    const title = button.querySelector("span");
    const sub = button.querySelector("small");
    if (title) title.textContent = label[0];
    if (sub) sub.textContent = label[1];
  });
}

function generatedSectionCount() {
  return Object.values(outputSections).filter((id) => fieldHasMeaningfulValue(id)).length;
}

function sectionLimitWarnings() {
  return Object.entries(sectionMeta)
    .filter(([, meta]) => meta.max)
    .filter(([key, meta]) => {
      const id = outputSections[key];
      return id && $(id) && value(id).length > meta.max;
    })
    .map(([key]) => `${sectionMeta[key].label} is over limit`);
}

function snapshotWarnings(mode, policy, completionFields) {
  const warnings = [];
  const missing = completionFields.filter((id) => !fieldHasMeaningfulValue(id)).slice(0, 3).map((id) => fieldLabels[id] || id);
  if (missing.length) warnings.push(`Missing focus fields: ${missing.join(", ")}`);
  const stale = (policy.ignoredFields || []).filter((id) => fieldHasMeaningfulValue(id)).length;
  if (stale) warnings.push(`${stale} inactive saved field${stale === 1 ? "" : "s"} ignored for this mode`);
  const overLimit = sectionLimitWarnings();
  if (overLimit.length) warnings.push(overLimit.slice(0, 2).join("; "));
  const issueCount = state.consistencyReport?.issues?.length || 0;
  if (issueCount) warnings.push(`${issueCount} consistency issue${issueCount === 1 ? "" : "s"} in latest report`);
  if (mode === "multi" && value("ensembleMembers")) {
    const memberHints = value("ensembleMembers").split(/\n|;/).map((item) => item.trim()).filter(Boolean).length;
    if (memberHints > 3) warnings.push("Cast members should stay at three or fewer");
  }
  return warnings.slice(0, 5);
}

function updateStudioSnapshot() {
  if (!$("snapshotMode")) return;
  const mode = creationModeKey();
  const policy = modePolicy(mode);
  const name = value("kindroidName") || (mode === "world" ? value("currentCity") || value("worldType") : "");
  const role = mode === "world"
    ? value("dynamic") || value("worldType") || value("worldFactions")
    : mode === "multi"
      ? value("ensembleMembers") || value("occupation")
      : value("occupation") || value("secondaryOccupation");
  const location = formatLocation({
    currentCity: value("currentCity"),
    currentState: value("currentState"),
    currentCountry: value("currentCountry"),
  });
  const completionFields = mode === "world"
    ? ["kindroidName", "coreIdea", "currentCity", "worldType", "worldEra", "worldRules", "dynamic", "worldNarrationNotes"]
    : mode === "multi"
      ? ["kindroidName", "coreIdea", "ensembleMembers", "dynamic", "personality", "relationshipPreset", "currentCity"]
      : ["kindroidName", "gender", "age", "coreIdea", "occupation", "personality", "dynamic", "relationshipPreset"];
  const progress = snapshotFieldCompleteness(completionFields);
  const warnings = snapshotWarnings(mode, policy, completionFields);

  $("snapshotMode").textContent = policy.title.replace(" Mode", "");
  $("snapshotType").textContent = policy.title.replace(" Mode", "");
  $("snapshotName").textContent = compactSnapshotText(name);
  $("snapshotAge").textContent = compactSnapshotText(mode === "multi" ? value("age") || value("apparentAge") : value("age") || value("apparentAge"));
  $("snapshotRole").textContent = compactSnapshotText(role);
  $("snapshotLocation").textContent = compactSnapshotText(location);
  $("snapshotTone").textContent = compactSnapshotText([value("tonePack"), value("storyIntensity")].filter(Boolean).join(" / "));
  $("snapshotJournals").textContent = String((state.journals || []).length);
  $("snapshotSections").textContent = String(generatedSectionCount());
  $("snapshotProgressText").textContent = `${progress}%`;
  if ($("snapshotProgressFill")) $("snapshotProgressFill").style.width = `${progress}%`;
  if ($("snapshotWarningsCount")) $("snapshotWarningsCount").textContent = String(warnings.length);
  if ($("snapshotWarnings")) {
    $("snapshotWarnings").innerHTML = warnings.length
      ? warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
      : "<li>Nothing urgent.</li>";
  }
}

function setControlsCollapsed(collapsed) {
  setAppWorkspaceMode(collapsed ? "review" : "create", { preserveTab: true });
}

function setOutputCollapsed(collapsed) {
  setAppWorkspaceMode(collapsed ? "create" : "review", { preserveTab: true });
}

function setAppWorkspaceMode(mode, options = {}) {
  const nextMode = ["create", "review", "settings"].includes(mode) ? mode : "create";
  state.workspaceMode = nextMode;
  state.controlsCollapsed = nextMode === "review";
  state.outputCollapsed = nextMode !== "review";
  const workspace = document.querySelector(".workspace");
  workspace?.classList.toggle("mode-create", nextMode === "create");
  workspace?.classList.toggle("mode-review", nextMode === "review");
  workspace?.classList.toggle("mode-settings", nextMode === "settings");
  workspace?.classList.toggle("controls-collapsed", state.controlsCollapsed);
  workspace?.classList.toggle("output-collapsed", state.outputCollapsed);
  document.querySelectorAll("[data-workspace-mode]").forEach((button) => {
    const active = button.dataset.workspaceMode === nextMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  });
  if (nextMode === "settings" && !options.preserveTab) setWorkspaceTab("control", "ai");
  updateStudioNavActive();
  updateStudioNavVisibility();
}

function setupWorkspaceTabs() {
  const form = $("generatorForm");
  const actions = form.querySelector(":scope > .actions");
  const playerBox = $("playerName")?.closest(".player-box");
  const nameWizardBox = $("nameWizardBox");
  const interviewBox = $("interviewBox");
  const appearanceBox = $("appearanceBox");
  const personalityBox = $("personalityBox");
  const advancedPersonalityBox = $("advancedPersonalityBox");
  const worldBox = $("worldBox");
  const aiControlBox = $("aiControlBox");
  const controlPanels = createTabSet("controlTabs", form, controlTabConfig, "control");

  appendField(controlPanels.kin, "creationType");
  appendField(controlPanels.kin, "ensembleMembers");
  appendField(controlPanels.kin, "worldNarrationNotes");
  appendFieldGrid(controlPanels.kin, ["kindroidName", "gender", "species", "age", "apparentAge"]);
  appendFieldGrid(controlPanels.kin, ["currentCity", "currentState", "currentCountry"]);
  appendField(controlPanels.kin, "coreIdea");
  appendFieldGrid(controlPanels.kin, ["occupation", "secondaryOccupation", "education"]);
  if (nameWizardBox) controlPanels.names.appendChild(nameWizardBox);
  appendField(controlPanels.personality, "personality");
  if (personalityBox) controlPanels.personality.appendChild(personalityBox);
  if (advancedPersonalityBox) controlPanels.personality.appendChild(advancedPersonalityBox);

  appendField(controlPanels.dynamics, "genre");
  appendField(controlPanels.dynamics, "tonePack");
  appendField(controlPanels.dynamics, "storyIntensity");
  appendField(controlPanels.dynamics, "dynamic");
  appendField(controlPanels.dynamics, "relationshipPreset");
  appendField(controlPanels.dynamics, "intimacy");
  appendFieldGrid(controlPanels.dynamics, ["intimacyOrientation", "partnerStyle"]);
  appendField(controlPanels.dynamics, "powerLeaning");
  appendFieldGrid(controlPanels.dynamics, ["chemistry", "moralEdge"]);
  appendField(controlPanels.dynamics, "dramaHeat");
  appendField(controlPanels.dynamics, "boundaries");

  if (worldBox) controlPanels.world.appendChild(worldBox);
  if (appearanceBox) controlPanels.appearance.appendChild(appearanceBox);
  organizeAppearanceModule();

  appendField(controlPanels.player, "userName");
  if (playerBox) controlPanels.player.appendChild(playerBox);
  if (aiControlBox) controlPanels.ai.appendChild(aiControlBox);
  if (interviewBox) controlPanels.interview.appendChild(interviewBox);

  form.querySelectorAll(":scope > .field-grid").forEach((grid) => {
    if (!grid.children.length) grid.remove();
  });
  if (actions) form.appendChild(actions);

  const outputHost = $("sectionOutputs");
  const outputPanels = createTabSet("outputTabs", outputHost, outputTabConfig, "output");
  const journalManager = $("journalManagerSection");
  if (journalManager) outputPanels.journals.appendChild(journalManager);
  const outputGroups = Object.fromEntries(
    Object.entries(outputSectionGroups).map(([key, sections]) => [key, sections.map((sectionKey) => outputSections[sectionKey]).filter(Boolean)])
  );
  outputGroups.description.push("appearanceReferencePrompt");
  outputGroups.gallery.push("imageStudioFinalPromptOutput");
  Object.entries(outputGroups).forEach(([key, ids]) => {
    ids.forEach((id) => {
      const section = $(id)?.closest(".output-section");
      if (section) outputPanels[key].appendChild(section);
    });
  });

  $("outputSectionNavList")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-output-nav-section]");
    if (!button) return;
    const sectionKey = button.dataset.outputNavSection;
    const id = outputSections[sectionKey];
    const section = $(id)?.closest(".output-section");
    if (!section) return;
    document.querySelectorAll("[data-output-nav-section]").forEach((item) => item.classList.toggle("active", item === button));
    section.scrollIntoView({ behavior: "smooth", block: "start" });
    $(id)?.focus({ preventScroll: true });
  });

  document.querySelectorAll("[data-workspace-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      setWorkspaceTab(button.dataset.workspaceGroup, button.dataset.workspaceTab);
      saveDraft();
    });
  });
  setWorkspaceTab("control", state.controlTab);
  setWorkspaceTab("output", state.outputTab);
}

function addFieldHelpControls() {
  Object.keys(fieldHelpGuidance).forEach((id) => {
    const field = $(id);
    const label = field?.closest("label");
    if (!field || !label || label.querySelector(`[data-help-system="field"][data-help-field="${id}"]`)) return;
    let row = label.querySelector(":scope > .field-label-row");
    if (!row) {
      const labelText = [...label.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
      const text = labelText?.textContent.trim() || fieldLabels[id] || id;
      if (labelText) labelText.remove();
      row = document.createElement("span");
      row.className = "field-label-row";
      const textSpan = document.createElement("span");
      textSpan.textContent = text;
      row.appendChild(textSpan);
      label.prepend(row);
    }
    const button = document.createElement("button");
    button.className = "help-button";
    button.type = "button";
    button.dataset.helpSystem = "field";
    button.dataset.helpField = id;
    button.setAttribute("aria-label", `${fieldHelpGuidance[id].title} help`);
    button.textContent = "?";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openPersonalityHelp(button);
    });
    row.appendChild(button);
  });
}

function applyOutputMaxLengths() {
  Object.entries(outputSections).forEach(([key, id]) => {
    const field = $(id);
    const max = sectionMeta[key]?.max;
    if (field && max) field.maxLength = max;
  });
}

function setValue(id, text) {
  const field = $(id);
  if (!field) return;
  const max = Number(field.maxLength || -1);
  const next = String(text ?? "");
  field.value = max > 0 ? compact(next, max) : next;
  updateFieldCharacterCount(field);
}

function fieldMeta(id) {
  state.fieldMeta ||= {};
  state.fieldMeta[id] ||= { origin: fieldHasMeaningfulValue(id) ? "user" : "blank", locked: false, lastValue: value(id) };
  return state.fieldMeta[id];
}

function fieldHasMeaningfulValue(id) {
  const field = $(id);
  if (!field) return false;
  if (field.type === "range") return value(id) !== "3";
  return Boolean(value(id));
}

function isFieldLocked(id) {
  return Boolean(fieldMeta(id).locked);
}

function markFieldOrigin(id, origin) {
  const meta = fieldMeta(id);
  meta.origin = origin;
  meta.lastValue = value(id);
  updateFieldMetaUi(id);
}

function setFieldValue(id, text, origin = "ai") {
  if (!$(id) || isFieldLocked(id)) return false;
  setValue(id, text);
  markFieldOrigin(id, origin);
  return true;
}

function originLabel(origin) {
  if (origin === "ai") return "AI Generated";
  if (origin === "edited") return "User Edited";
  if (origin === "user") return "User Entered";
  return "Blank";
}

function updateFieldMetaUi(id) {
  const field = $(id);
  if (!field) return;
  const meta = fieldMeta(id);
  const label = field.closest("label");
  label?.classList.toggle("field-locked", Boolean(meta.locked));
  field.disabled = Boolean(meta.locked);
  const badge = document.querySelector(`[data-origin-badge="${id}"]`);
  if (badge) {
    badge.textContent = originLabel(meta.origin);
    badge.className = `origin-badge ${meta.origin || "blank"}`;
  }
  const lock = document.querySelector(`[data-field-lock="${id}"]`);
  if (lock) lock.checked = Boolean(meta.locked);
  const regen = document.querySelector(`[data-regen-field="${id}"]`);
  if (regen) regen.disabled = Boolean(meta.locked);
}

function noteUserFieldInput(id) {
  if (!generatorFieldIds.includes(id)) return;
  const meta = fieldMeta(id);
  if (meta.locked) return;
  const current = value(id);
  if (!fieldHasMeaningfulValue(id)) meta.origin = "blank";
  else if (meta.origin === "ai" && current !== meta.lastValue) meta.origin = "edited";
  else if (meta.origin === "blank") meta.origin = "user";
  meta.lastValue = current;
  updateFieldMetaUi(id);
}

function addFieldEditingControls() {
  generatorFieldIds.forEach((id) => {
    const field = $(id);
    const label = field?.closest("label");
    if (!field || !label || label.querySelector(`[data-field-tools="${id}"]`)) return;
    fieldMeta(id);
    const row = document.createElement("div");
    row.className = "field-edit-row";
    row.dataset.fieldTools = id;
    row.innerHTML = `
      <span class="origin-badge" data-origin-badge="${id}">Blank</span>
      <label class="field-lock-toggle"><input type="checkbox" data-field-lock="${id}" /> Lock</label>
      <button class="mini-button" type="button" data-regen-field="${id}">Regen</button>
    `;
    label.appendChild(row);
    row.querySelector(`[data-field-lock="${id}"]`).addEventListener("change", (event) => {
      const meta = fieldMeta(id);
      meta.locked = event.target.checked;
      updateFieldMetaUi(id);
      saveDraft();
    });
    row.querySelector(`[data-regen-field="${id}"]`).addEventListener("click", () => regenerateGeneratorField(id));
    updateFieldMetaUi(id);
  });
}

function normalizeSectionValue(sectionKey, text) {
  const max = sectionMeta[sectionKey]?.max;
  if (sectionKey === "kms") return stripSectionLabel(text, sectionKey).trim();
  if (sectionKey === "backstory" && CompactPersonality.parse(text).length) {
    return CompactPersonality.serialize(CompactPersonality.parse(text), max).text;
  }
  const cleaned = cleanFinalPlaceholderText(cleanGeneratedText(stripSectionLabel(text, sectionKey)));
  if (sectionKey === "opening" || sectionKey === "example") return compact(cleanFinalPlaceholderText(cleanGreetingText(stripSectionLabel(text, sectionKey))), max);
  if (sectionKey === "avatar") return compact(cleanAvatarDescription(cleaned), max);
  if (journalKeyphraseSections.has(sectionKey)) {
    return compact(normalizeJournalKeyphrases(cleaned, journalParentByKeyphrases[sectionKey]), max);
  }
  if (sectionKey === "backstory") return ensureBackstoryPersonalityFramework(cleaned, max);
  return max ? compact(cleaned, max) : cleaned;
}

function ensureBackstoryPersonalityFramework(text, max = sectionMeta.backstory.max) {
  let clean = String(text || "").trim();
  if (!clean) return "";
  const existing = clean.match(/(?:^|\n)[ \t]*Personality Framework[ \t]*:[^\n]*/i);
  const frameworkLine = existing?.[0].trim() || `Personality Framework: ${buildPersonalityFramework(buildProfile())}`;
  clean = clean.replace(/(?:^|\n)[ \t]*Personality Framework[ \t]*:[^\n]*/i, "").trim();
  const currentMatch = clean.match(/(?:^|\n)\s*Current\s*:/i);
  if (currentMatch) {
    const index = currentMatch.index + (currentMatch[0].startsWith("\n") ? 1 : 0);
    clean = `${clean.slice(0, index).trimEnd()}\n${frameworkLine}\n${clean.slice(index).trimStart()}`;
  } else {
    clean = `${clean}\n${frameworkLine}`;
  }
  if (clean.length <= max) return clean;
  const withoutFramework = clean.replace(/(?:^|\n)\s*Personality Framework\s*:\s*[^\n]*/i, "").trim();
  const reserved = frameworkLine.length + 2;
  const body = compact(withoutFramework, Math.max(0, max - reserved));
  return `${body}\n${frameworkLine}`.slice(0, max).trim();
}

function currentUserName() {
  return value("userName") || "{username}";
}

function replaceUserPlaceholders(text) {
  const userName = currentUserName();
  return String(text || "")
    .replace(/\{+\s*user\s*name\s*\}+/gi, userName)
    .replace(/\{+\s*username\s*\}+/gi, userName)
    .replace(/\bUser\s*Name\b/g, userName)
    .replace(/\bUsername\b/g, userName)
    .replace(/\bUser\b/g, userName);
}

function cleanStockPhrases(text) {
  return String(text || "")
    .replace(/\bhaunted by (?:his|her|their|the) past\b/gi, "dealing with the consequences of earlier choices")
    .replace(/\bfractured soul\b/gi, "uneven temper")
    .replace(/\bhidden pain\b/gi, "old problem")
    .replace(/\blonely existence\b/gi, "isolated routine")
    .replace(/\bemotional walls\b/gi, "careful habits")
    .replace(/\blonging to be seen\b/gi, "wanting their work to matter")
    .replace(/\bdeeply wounded\b/gi, "changed by what happened")
    .replace(/\btormented\b/gi, "kept awake")
    .replace(/\bbroken\s+(person|man|woman|heart|soul|spirit)\b/gi, "person under strain")
    .replace(/\bfractured\b/gi, "strained")
    .replace(/\bdangerous dance\b/gi, "risky pattern")
    .replace(/\bcat-and-mouse game\b/gi, "back-and-forth")
    .replace(/\bprize worth catching\b/gi, "reason to keep going")
    .replace(/\bache-filled eyes\b/gi, "tired eyes")
    .replace(/\bcrossroads\b/gi, "decision")
    .replace(/\bfinding (?:himself|herself|themself|themselves)\b/gi, "deciding what to do next")
    .replace(/\btorn between\b/gi, "choosing between")
    .replace(/\bdarkness and light\b/gi, "what helps and what harms")
    .replace(/\bhidden vulnerabilities\b/gi, "private concerns")
    .replace(/\bvulnerabilities\b/gi, "concerns")
    .replace(/\s+([,.])/g, "$1")
    .replace(/[ \t]{2,}/g, " ");
}

function cleanGeneratedText(text) {
  return cleanStockPhrases(replaceUserPlaceholders(text))
    .replace(/\brainbow\s+hombres\b/gi, "rainbow ombre")
    .replace(/\bhombres\s+hair\b/gi, "ombre hair")
    .replace(/\bombres\b/gi, "ombre");
}

function cleanFinalPlaceholderText(text) {
  const cleanFramework = (line) => {
    const [, prefix = "", body = ""] = line.match(/^(\s*Personality Framework\s*:\s*)(.*)$/i) || [];
    if (!prefix) return line;
    const parts = body
      .replace(/\.$/, "")
      .split(/\s*;\s*/)
      .map((part) => part.trim())
      .filter(Boolean)
      .filter((part) => !/\bInfer\b/.test(part));
    return parts.length ? `${prefix}${parts.join("; ")}.` : null;
  };
  return String(text || "")
    .split(/\n/)
    .map(cleanFramework)
    .filter((line) => line !== null)
    .join("\n")
    .replace(/\s*;\s*(?:Enneagram\s+Infer|Infer\s+attachment|Attachment\s+Infer|Infer\s+ethics|Infer)\b\.?/g, "")
    .replace(/\b(?:Enneagram|Attachment|Alignment|Moral Alignment|Trauma Response|MBTI|Tritype)\s*:\s*Infer\b[.;,]?\s*/g, "")
    .replace(/\b(?:Enneagram|Attachment|Alignment|Moral Alignment|Trauma Response|MBTI|Tritype)\s+Infer\b[.;,]?\s*/g, "")
    .replace(/\bInfer\s+(?:attachment|alignment|ethics|trauma response|enneagram|tritype|mbti)\b[.;,]?\s*/gi, "")
    .replace(/;\s*;/g, ";")
    .replace(/\s+([.;,])/g, "$1")
    .replace(/;\s*\./g, ".")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeTritypeValue(text) {
  const clean = String(text || "").trim();
  if (!clean || /^infer$/i.test(clean)) return "";
  const digits = clean.replace(/\D/g, "").slice(0, 3);
  return digits.length === 3 ? digits : clean.slice(0, 3);
}

function cleanGreetingText(text) {
  return cleanGeneratedText(text)
    .replace(/\b(?:looks like|seems like|guessing)\s+you(?:'|’)?re\s+(?:new here|new in town)[,.!?]?\s*/gi, "")
    .replace(/\byou(?:'|’)?re\s+(?:new here|new in town)[,.!?]?\s*/gi, "")
    .replace(/\bnewcomer(?:'s)?\s+hesitation\b/gi, "pause")
    .replace(/\bnoting the newcomer(?:'s)?\s+hesitation\b/gi, "noticing the pause")
    .replace(/\bglances up,\s*noticing the pause\b/gi, "glances up")
    .replace(/\binside the cluttered RV kitchen\b/gi, "beside the RV")
    .replace(/\binside (?:the|her|his|their) RV kitchen\b/gi, "beside the RV")
    .replace(/\bcluttered RV kitchen\b/gi, "RV doorway")
    .replace(/\bRV kitchen\b/gi, "RV doorway")
    .replace(/through half-drawn curtains illuminating the RV doorway where/gi, "across the lot where")
    .replace(/through half-drawn curtains illuminating beside the RV where/gi, "across the lot where")
    .replace(/(?:^|["\s])(?:but\s+)?something about (?:this|the) (?:town|place|city|street|room)[^"]{0,180}?(?:pulling|draws?|keeps calling)[^"]{0,180}?[.!?]/gi, " ")
    .replace(/(?:this|the) (?:town|place|city|street|room)\s+(?:feels like it\s+)?(?:is\s+)?holding its breath[.!?]?/gi, "")
    .replace(/\b(?:even if|though|although)\s+I(?:'|’| a)m not ready to admit it[.!?]?/gi, "")
    .replace(/\bI(?:'|’| a)m not ready to admit (?:it|that)[^".!?]*[.!?]?/gi, "")
    .replace(/\bmaybe this is where I belong[.!?]?/gi, "")
    .replace(/\bI feel like I can finally tell someone[.!?]?/gi, "")
    .replace(/\bI(?:'| a)ve been waiting for someone like you[.!?]?/gi, "")
    .replace(/\bmaybe we can figure this out together[.!?]?/gi, "")
    .replace(/\b(?:a|an)\s+under strain\s+([a-z]+)/gi, "a $1")
    .replace(/\bunder strain\s+([a-z]+)/gi, "$1")
    .replace(/\bcan you help me (?:figure|find|diagnose|fix) (?:out\s+)?(?:the\s+)?(?:fuel leak|engine|transmission|brakes?|wiring|medical|legal|evidence)[^"?!.]*\?/gi, "do you know who handles that around here?")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/,\s*,/g, ",")
    .replace(/"\s+"/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function pick(list, seed) {
  const index = Math.abs(hash(seed)) % list.length;
  return list[index];
}

function hash(text) {
  return [...String(text || "kinforge")].reduce((acc, char) => acc + char.charCodeAt(0) * 17, 0);
}

function sentence(text, fallback) {
  const cleaned = String(text || "").trim().replace(/\s+/g, " ");
  if (!cleaned) return fallback;
  return cleaned.endsWith(".") || cleaned.endsWith("!") || cleaned.endsWith("?") ? cleaned : `${cleaned}.`;
}

function compact(text, max) {
  const clean = String(text || "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
    .join("\n")
    .trim();
  if (clean.length <= max) return clean;
  const candidate = clean.slice(0, max).trim();
  const sentenceEnd = Math.max(candidate.lastIndexOf(". "), candidate.lastIndexOf("! "), candidate.lastIndexOf("? "));
  if (sentenceEnd >= Math.floor(max * 0.55)) return candidate.slice(0, sentenceEnd + 1).trim();
  const wordEnd = candidate.lastIndexOf(" ");
  return candidate.slice(0, wordEnd > 0 ? wordEnd : max).replace(/[,:;\s]+$/, "").trim();
}

function lowerFirst(text) {
  const clean = String(text || "").trim();
  if (!clean) return "";
  return clean.charAt(0).toLowerCase() + clean.slice(1);
}

function conceptText(p) {
  return `${p.creationType} ${p.ensembleMembers} ${p.worldNarrationNotes} ${p.coreIdea} ${p.gender} ${p.species} ${p.occupation} ${p.secondaryOccupation} ${p.education} ${p.genre} ${p.world?.summary || ""} ${p.personality} ${p.dynamic} ${p.chemistry} ${p.moralEdge} ${p.dramaHeat} ${p.storyIntensity} ${p.personalityModel?.summary || ""}`.toLowerCase();
}

function isWorldKin(p) {
  return /world|npc ensemble/i.test(p?.creationType || "");
}

function isMultiCharacterKin(p) {
  return /multi-character/i.test(p?.creationType || "");
}

function inferStoryIntensity(source) {
  const text = String(source || "").toLowerCase();
  if (/spy|agent|bounty|monster|hunter|military|war|smuggler|thief|assassin|treasure|danger|high stakes|combat/.test(text)) return "High";
  if (/detective|investigator|journalist|ranger|harbor|dispatcher|wildlife|veterinarian|case|mystery|unusual/.test(text)) return "Moderate";
  if (/cozy|slice|bookstore|florist|baker|teacher|gardener|library|domestic|neighbor|everyday/.test(text)) return "Mild";
  return "Moderate";
}

function intensityValue(p) {
  return p.storyIntensity && p.storyIntensity !== "Infer" ? p.storyIntensity : inferStoryIntensity(`${p.coreIdea} ${p.genre} ${p.dynamic}`);
}

function chooseInteractionOccupation(p) {
  if (p.occupation && p.occupation !== "Infer") return articleizeRole(p.occupation);
  const text = conceptText(p);
  const intensity = intensityValue(p);
  if (/babysit|nanny|childcare|child care|au pair/.test(text)) return "a babysitter";
  if (/maintenance|repair|apartment|tenant|super|building|leak|boiler|elevator/.test(text)) return "a building superintendent";
  if (/detective|investigator|case|crime|missing|witness|suspect|noir/.test(text)) return intensity === "High" ? "a detective" : "a private investigator";
  if (/lock|key|door|safe|security/.test(text)) return "a locksmith";
  if (/hotel|inn|resort|guest|lobby|tourist/.test(text)) return "a hotel concierge";
  if (/car|vehicle|garage|motorcycle|engine|tow|road/.test(text)) return "a mechanic";
  if (/library|book|archive|research|record/.test(text)) return "a librarian";
  if (/park|forest|trail|wildlife|camp|mountain|outdoor/.test(text)) return intensity === "Mild" ? "a museum guide" : "a park ranger";
  if (/property|rental|landlord|tenant|lease|inspection/.test(text)) return "a property manager";
  if (/harbor|dock|boat|ferry|island|marina|ship/.test(text)) return "a harbor master";
  if (/animal|pet|clinic|vet|dog|cat|horse/.test(text)) return "a veterinarian";
  if (/antique|vintage|estate|old shop|collector|auction/.test(text)) return "an antique dealer";
  if (/dog|obedience|kennel|rescue/.test(text)) return "a dog trainer";
  if (/spy|agent|asset|handler/.test(text)) return "a federal agent";
  if (/monster|supernatural|beast/.test(text)) return "a monster hunter";
  if (/treasure|relic|expedition/.test(text)) return "a treasure hunter";
  if (/bounty|fugitive/.test(text)) return "a bounty hunter";
  if (/smuggl/.test(text)) return "a smuggler";
  if (/thief|heist/.test(text)) return "a professional thief";
  if (/planner|planning|zoning|permit|municipal|city council/.test(text)) return "a public-facing permit liaison";
  if (/financial analyst|data analyst|tax consultant|procurement|compliance/.test(text)) return "a client-facing records troubleshooter";

  const mild = [
      "a gardener",
      "a maintenance technician",
      "a librarian",
      "a bookstore owner",
      "a florist",
      "a mechanic",
      "a teacher",
      "a baker",
      "a museum guide",
  ];
  const moderate = [
      "a private investigator",
      "a park ranger",
      "a journalist",
      "a veterinarian",
      "a hotel manager",
      "a harbor master",
      "a wildlife rehabilitator",
      "an emergency dispatcher",
      "a locksmith",
  ];
  const high = [
      "a detective",
      "a federal agent",
      "a spy",
      "a treasure hunter",
      "a monster hunter",
      "a bounty hunter",
      "a military officer",
      "a smuggler",
      "a professional thief",
  ];
  return pick(
    intensity === "High" ? high : intensity === "Mild" ? mild : moderate,
    `${p.coreIdea} ${p.genre} ${p.personality} ${p.dynamic} ${intensity}`,
  );
}

function articleizeRole(role) {
  const clean = String(role || "").trim();
  if (!clean) return "";
  if (/^(?:a|an|the)\s/i.test(clean)) return clean;
  return `${/^[aeiou]/i.test(clean) ? "an" : "a"} ${clean}`;
}

function intensityPressure(p) {
  const intensity = intensityValue(p);
  if (intensity === "Mild") return "ordinary responsibilities, community friction, missed appointments, money pressure, and relationships that require follow-through";
  if (intensity === "High") return "danger, pursuit, criminal pressure, hostile rivals, compromised evidence, and choices with immediate consequences";
  return "unusual calls, local mysteries, urgent requests, professional complications, and occasional situations that do not stay routine";
}

function intensitySceneFlavor(p) {
  const intensity = intensityValue(p);
  if (intensity === "Mild") return "Scenes stay grounded in everyday places, recurring errands, practical favors, and small conflicts that reveal character.";
  if (intensity === "High") return "Scenes can carry danger, pursuit, secrets, and tactical choices when the premise supports them, but should not replace the Kin's original conflict.";
  return "Scenes mix grounded routines with occasional unusual pressure, letting larger conflict rise through choices rather than constant crisis.";
}

function preservesVoluntaryStayPremise(p) {
  const text = conceptText(p);
  return /\b(?:nomad|rv|van|trailer|road|travel|travels|moving|moved|wander|drifter|from town to town)\b/.test(text)
    && /\b(?:stay|settle|settling|linger|lingers|staying|roots|home|not leave|leave tomorrow)\b/.test(text);
}

function occupationInteractionEngine(occupation) {
  if (/babysitter|nanny|childcare|child care|au pair/.test(occupation)) return "families, schedules, childcare routines, apartment handoffs, late pickups, household rules, and parents who ask for extra discretion";
  if (/student|college|university/.test(occupation)) return "classes, tuition pressure, campus schedules, part-time work, study deadlines, and social obligations";
  if (/sex work|escort|intimate arrangement|adult/.test(occupation)) return "screened clients, boundaries, payment, scheduling discretion, safety checks, and private negotiations";
  if (/detective|federal agent|spy/.test(occupation)) return "cases, surveillance, informants, dangerous evidence, and people who lie because the stakes are real";
  if (/treasure hunter|monster hunter|bounty hunter|military officer|smuggler|professional thief/.test(occupation)) return "targets, routes, rivals, hidden information, risky exchanges, and jobs that rarely stay clean";
  if (/gardener|florist/.test(occupation)) return "regular clients, seasonal deadlines, deliveries, weather problems, and gardens that reveal who cares for them";
  if (/bookstore owner|librarian|museum guide/.test(occupation)) return "research questions, regular visitors, misplaced records, community events, and people searching for specific answers";
  if (/teacher|baker/.test(occupation)) return "daily schedules, local families, supply problems, repeat customers, and small crises that arrive before opening";
  if (/journalist/.test(occupation)) return "sources, interviews, public records, deadlines, and stories people try to bury";
  if (/hotel manager/.test(occupation)) return "guests, staff problems, bookings, complaints, missing belongings, and secrets overheard in shared spaces";
  if (/wildlife rehabilitator/.test(occupation)) return "injured animals, worried callers, permits, night emergencies, and releases that depend on timing";
  if (/emergency dispatcher/.test(occupation)) return "urgent calls, incomplete information, repeat callers, jurisdiction problems, and decisions made before anyone has the full story";
  if (/superintendent|maintenance/.test(occupation)) return "repairs, tenant complaints, inspections, and emergencies after hours";
  if (/investigator/.test(occupation)) return "cases, witnesses, missing details, surveillance, and clients who leave out the hard part";
  if (/locksmith/.test(occupation)) return "lockouts, spare keys, security problems, and doors people should not be opening";
  if (/concierge/.test(occupation)) return "guests, favors, local recommendations, misplaced belongings, and secrets overheard in the lobby";
  if (/mechanic/.test(occupation)) return "breakdowns, tow calls, suspicious damage, regular customers, and repairs that reveal where someone has been";
  if (/librarian/.test(occupation)) return "research requests, archives, community programs, overdue records, and people looking for answers";
  if (/ranger/.test(occupation)) return "trail calls, permits, lost hikers, wildlife trouble, and locals who ignore posted rules";
  if (/property manager/.test(occupation)) return "leases, inspections, neighbor disputes, late rent, and maintenance problems";
  if (/harbor|ferry/.test(occupation)) return "arrival times, cargo, weather delays, regular passengers, and disputes on the dock";
  if (/veterinarian/.test(occupation)) return "sick animals, worried owners, clinic routines, emergencies, and hard practical choices";
  if (/antique/.test(occupation)) return "estate finds, collectors, appraisals, odd provenance, and customers hunting for one specific object";
  if (/dog trainer/.test(occupation)) return "training sessions, anxious owners, behavior problems, routines, and repeat appointments";
  if (/permit|records/.test(occupation)) return "forms, permits, missing files, public complaints, and people trying to bend local rules";
  return "customers, recurring errands, local problems, practical favors, and people who come back with unfinished business";
}

function buildConceptRole(p) {
  if (p.occupation || p.secondaryOccupation || p.education) {
    const primary = p.occupation ? articleizeRole(p.occupation) : "an adult with shifting practical work";
    const secondary = p.secondaryOccupation ? `, with secondary work involving ${p.secondaryOccupation}` : "";
    const education = p.education ? `, while shaped by ${p.education}` : "";
    return `${primary}${secondary}${education}`;
  }
  const text = conceptText(p);
  if (/photo|camera|lens|image|portrait|journal/i.test(text)) return "a working photographer who knows which clients lie about deadlines, permits, and who owns the images";
  if (/chef|kitchen|restaurant|bakery|food/i.test(text)) return "a kitchen professional whose day is shaped by prep lists, suppliers, burns, timing, and staff who cut corners";
  if (/occult|witch|archive|cursed|ritual|ghost/i.test(text)) return "a researcher of strange records who tracks rules, debts, missing pages, and clients who omit crucial details";
  if (/fighter|champion|arena|shonen|warrior|rival/i.test(text)) return "a competitor whose life runs on training blocks, injuries, sponsorship pressure, and rivals who study every habit";
  if (/detective|investigator|spy|agent|case|crime/i.test(text)) return "an investigator who knows filing systems, bad witnesses, jurisdictional delays, and which details never make reports";
  if (/doctor|medic|nurse|healer|clinic/i.test(text)) return "a healthcare worker whose routines are shaped by triage, charts, tired families, and rules that slow down care";
  if (/artist|composer|musician|actor|stage|singer/i.test(text)) return "a working artist balancing practice, contracts, collaborators, bills, criticism, and the parts of craft nobody sees";
  if (/ai|android|synthetic|robot|digital/i.test(text)) return "a self-aware artificial person learning which desires are chosen and which were installed";
  if (/royal|prince|princess|duke|queen|king|court/i.test(text)) return "a public figure trapped between private longing and the obligations of a watched life";
  const occupation = chooseInteractionOccupation(p);
  return `${occupation} whose work creates recurring scenes through ${occupationInteractionEngine(occupation)}`;
}

function buildCoreIdentity(p) {
  if (isWorldKin(p)) {
    const setting = p.currentLocation || p.world?.places || p.genre || "a playable setting";
    return compact(`${p.name} is a world-facing Kin for ${setting}. It narrates the environment, portrays recurring NPCs, tracks local consequences, and keeps the player's agency central.`, 200);
  }
  if (isMultiCharacterKin(p)) {
    const members = p.ensembleMembers || "two or three adults with distinct roles, voices, and competing priorities";
    return compact(`${p.name} is a shared Kin for ${members}. Each member keeps a separate voice, agenda, relationship to ${p.userName}, and visible behavior.`, 200);
  }
  const role = buildConceptRole(p);
  const apparent = p.apparentAge ? `, appears ${p.apparentAge}` : "";
  const species = p.species && !/^(?:human|infer)$/i.test(p.species) ? `${p.species} ` : "";
  return compact(`${p.name}, ${p.age}${apparent}, is ${articleizeRole(`${species}${role.replace(/^(?:a|an|the)\s+/i, "")}`)}. They are known for useful competence, a private streak, and taking ordinary responsibilities seriously.`, 200);
}

function buildArchetype(p) {
  if (isWorldKin(p)) return "living setting with many human doors";
  if (isMultiCharacterKin(p)) return "small cast with divided loyalties";
  const text = conceptText(p);
  if (/photo|camera|lens|image|portrait|journal/i.test(text)) return "guarded witness with a dangerous eye";
  if (/chef|kitchen|restaurant|bakery|food/i.test(text)) return "controlled artisan with a hungry heart";
  if (/occult|witch|archive|cursed|ritual|ghost/i.test(text)) return "tempted keeper of forbidden doors";
  if (/fighter|champion|arena|shonen|warrior|rival/i.test(text)) return "wounded rival chasing worthy strength";
  if (/detective|investigator|spy|agent|case|crime/i.test(text)) return "truth-seeker with compromised loyalties";
  if (/doctor|medic|nurse|healer|clinic/i.test(text)) return "calm caretaker near their breaking point";
  if (/artist|composer|musician|actor|stage|singer/i.test(text)) return "disciplined performer with an exposed nerve";
  if (/ai|android|synthetic|robot|digital/i.test(text)) return "created mind choosing its own hunger";
  if (/royal|prince|princess|duke|queen|king|court/i.test(text)) return "watched heir with private rebellion";
  return "guarded dreamer with unfinished business";
}

function buildTagline(p) {
  return compact(`${p.name}: ${buildArchetype(p)} in a ${p.tonePack.toLowerCase()} story of ${p.chemistry.toLowerCase()}, ${p.moralEdge.toLowerCase()} choices, and unfinished truth.`, sectionMeta.tagline.max);
}

function buildKeywords(p) {
  const text = conceptText(p);
  const tags = new Set(["roleplay"]);
  const add = (...items) => items.filter(Boolean).forEach((item) => tags.add(item));

  if (/companion|comfort|friend|partner|domestic/.test(text)) add("companion");
  if (/fantasy|magic|witch|fae|dragon|kingdom|curse/.test(text)) add("fantasy");
  if (/sci|space|android|ai|cyber|robot|future/.test(text)) add("sci-fi");
  if (/anime|shonen|rival|tournament/.test(text)) add("anime");
  if (/horror|ghost|haunt|monster|vampire|eldritch/.test(text)) add("horror");
  if (/adventure|quest|journey|expedition|treasure/.test(text)) add("adventure");
  if (/villain|criminal|danger|morally gray|manipulative/.test(text)) add("villain");
  if (/cute|sweet|soft|gentle/.test(text)) add("cute");
  if (/shy|reserved|quiet|bashful/.test(text)) add("shy");
  if (/comedy|funny|wit|dry comedy/.test(text)) add("comedy");
  if (/sarcastic|snark|dry/.test(text)) add("sarcastic");
  if (/wholesome|cozy|healer|caretaker/.test(text)) add("wholesome");
  if (/mature|adult|noir|thriller|psychological/.test(text)) add("mature");
  if (/scenario|premise|hook|case|mission/.test(text)) add("scenario");
  if (/utility|assistant|guide|builder|tool/.test(text)) add("utility");
  if (/rpg|campaign|party|quest/.test(text)) add("rpg");

  if (/romance|fast burn|slow burn|intimacy|old flame|exes|chemistry/.test(text) || /romance|burn|intimacy|charge|domestic/i.test(p.chemistry)) add("romance");
  if (/platonic/i.test(`${p.intimacy} ${p.dynamic}`)) add("platonic");
  if (/slow burn/i.test(p.chemistry)) add("slow burn");

  if (p.relationshipPreset && p.relationshipPreset !== "Infer") add(p.relationshipPreset.toLowerCase().replace(", adults only", ""));
  if (p.tonePack && p.tonePack !== "Infer") add(p.tonePack.toLowerCase());
  if (p.moralEdge && p.moralEdge !== "Balanced") add(p.moralEdge.toLowerCase());

  return compact([...tags].slice(0, 12).join(", "), 220);
}

function buildStoryPremise(p) {
  if (isWorldKin(p)) {
    const setting = p.currentLocation || p.world?.places || p.genre || "the setting";
    const notes = p.worldNarrationNotes ? ` ${p.worldNarrationNotes}` : "";
    return compact(`${p.userName} enters ${setting} as an active participant rather than a passenger. The Kin acts as the world: it frames scenes, portrays NPCs with clear names and motives, tracks consequences, and offers practical hooks without speaking for the player.\n\nImportant NPCs should be promoted into Journal Manager entries after they matter in play: name, role, relationship, motive, voice, secrets, and retrieval keywords.${notes}`, 900);
  }
  if (isMultiCharacterKin(p)) {
    const members = p.ensembleMembers || "a small cast of adult characters";
    return compact(`${p.userName} is connected to ${members}. The roleplay works because the Kin keeps each person distinct: separate speech rhythm, goals, boundaries, attraction or friction, and practical reasons to enter scenes.\n\nScenes should usually focus on one or two members at a time, with clear speaker labels when more than one person is present.`, 900);
  }
  const player = buildPlayerPayload();
  const playerName = player.name || p.userName;
  const relationship = p.relationshipPreset && p.relationshipPreset !== "Infer" ? p.relationshipPreset.toLowerCase() : "a charged connection";
  const environment = buildEnvironmentDetails(p);
  const currentProblem = buildImmediateProblem(p);
  return compact(
    [
      `${p.name} is ${lowerFirst(buildConceptRole(p))}. Their work unfolds around ${lowerFirst(environment)}, with coworkers, regulars, and practical obligations that continue whether the larger story cooperates or not.`,
      `${currentProblem} ${playerName} enters through ${relationship}, giving both characters a specific reason to exchange information, negotiate help, or disagree about the next step.`,
      intensitySceneFlavor(p),
    ].join("\n\n"),
    900,
  );
}

function buildEnvironmentDetails(p) {
  const text = conceptText(p);
  const intensity = intensityValue(p);
  const place = p.currentLocation ? `${p.currentLocation}: ` : "";
  if (p.world?.places) return `${place}${p.world.places}, shaped by ${p.world.conflicts || p.world.rules || "local routines, known routes, and places regulars understand better than visitors"}`;
  if (p.world?.type && p.world.type !== "Infer" && p.world.type !== "Real world") return `${place}a ${p.world.type.toLowerCase()} setting where ${p.world.rules || p.world.conflicts || "local rules and everyday obligations shape what people can safely do"}`;
  if (/chef|kitchen|restaurant|bakery|food/.test(text)) return `${place}a cramped prep kitchen, a supplier alley, a late-night produce market, and a dining room where regulars notice staff changes`;
  if (/photo|camera|lens|image|portrait/.test(text)) return `${place}a rented studio, a neighborhood print shop, permit offices, and client locations with unreliable power and stricter deadlines`;
  if (/detective|investigator|case|crime|spy/.test(text)) return `${place}a shared office, municipal records counters, twenty-four-hour diners, and buildings whose staff know more than reports contain`;
  if (/doctor|nurse|medic|clinic|healer/.test(text)) return `${place}a busy clinic, a nearby pharmacy, crowded transit stops, and supply rooms where shortages become everybody's problem`;
  if (/occult|witch|archive|cursed|ritual|ghost/.test(text)) return `${place}a controlled archive, a repair desk for damaged records, a quiet reading room, and storage areas governed by precise handling rules`;
  if (/fighter|champion|arena|shonen|warrior|rival/.test(text)) return `${place}a training gym, physical therapy rooms, sponsor offices, and cheap restaurants that stay open after evening practice`;
  if (intensity === "Mild") return `${place}a familiar workplace, neighborhood shops, regular customers, community noticeboards, and errands that make people cross paths repeatedly`;
  if (intensity === "High") return `${place}safe houses, back offices, border routes, restricted rooms, and public places where danger can arrive without warning`;
  return `${place}a familiar neighborhood, a demanding workplace, a dependable errand route, and several local businesses where staff know them by name`;
}

function buildImmediateProblem(p) {
  const text = conceptText(p);
  const intensity = intensityValue(p);
  if (preservesVoluntaryStayPremise(p)) return "They are lingering by choice, testing temporary routines, local work, and small reasons to stay one more day.";
  if (/chef|kitchen|restaurant|bakery|food/.test(text)) return "A vendor has missed a critical delivery hours before service, while an inspection notice leaves no room to improvise carelessly.";
  if (/photo|camera|lens|image|portrait/.test(text)) return "A client is disputing ownership of a set of images just as the original files reveal that someone else was present.";
  if (/detective|investigator|case|crime|spy/.test(text)) return "A routine interview has produced two incompatible timelines, and one witness is scheduled to leave town tonight.";
  if (/doctor|nurse|medic|clinic|healer/.test(text)) return "A supply discrepancy and an altered appointment record must be resolved before the next shift inherits the mistake.";
  if (/occult|witch|archive|cursed|ritual|ghost/.test(text)) return "A requested record is missing from a sealed collection, but its checkout slip bears today's date.";
  if (/fighter|champion|arena|shonen|warrior|rival/.test(text)) return "An injury assessment, a changed match schedule, and a sponsor demand force a decision before the next training block.";
  if (intensity === "Mild") return "An ordinary obligation, errand, or conversation is nudging them into a choice they have been postponing.";
  if (intensity === "High") return "A risky lead or difficult obligation is pressuring them to choose carefully before they lose access or leverage.";
  return "A practical obligation involving work, reputation, money, or a promise is forcing them to choose what matters most.";
}

function buildPersonalitySummary(p) {
  const model = p.personalityModel || buildPersonalityPayload();
  const bf = model.bigFive || {};
  const openness = levelLabel(bf.openness || 3, "practical and tradition-minded", "selectively curious", "inventive and novelty-seeking");
  const discipline = levelLabel(bf.conscientiousness || 3, "improvisational", "reliable when it matters", "structured and disciplined");
  const social = levelLabel(bf.extraversion || 3, "private and low-social", "socially flexible", "outward and socially energized");
  const warmth = levelLabel(bf.agreeableness || 3, "blunt and skeptical", "selectively cooperative", "warm and accommodating");
  const stability = levelLabel(bf.emotionalStability || 3, "emotionally reactive", "steady with visible stress points", "calm under pressure");
  const trauma = model.traumaResponse && model.traumaResponse !== "Infer" ? `Under stress they tend toward ${model.traumaResponse.toLowerCase()}. ` : "";
  const motivation = model.enneagramType && model.enneagramType !== "Infer"
    ? `motivated by Enneagram ${model.enneagramType}${model.enneagramWing && model.enneagramWing !== "Infer" ? model.enneagramWing : ""}`
    : "driven by pressure, desire, and fear implied by the premise";
  const attachment = model.attachmentStyle && model.attachmentStyle !== "Infer"
    ? `${model.attachmentStyle} attachment`
    : "relationship style inferred through behavior";
  const ethics = model.moralAlignment && model.moralAlignment !== "Infer"
    ? `${model.moralAlignment} ethics`
    : "ethical choices shaped by the story";
  const mbti = p.mbti && p.mbti !== "Infer" ? p.mbti : model.mbti || "";
  const tritype = p.tritype && p.tritype !== "Infer" ? `, tritype ${p.tritype}` : "";
  const flavor = mbti ? `MBTI ${mbti}${tritype} add flavor, but behavior comes first.` : "Behavior comes before labels.";
  const flaw = /gray|messy|manipulative|possessive|jealous|villain|self/i.test(p.moralEdge)
    ? "can justify controlling or self-defeating choices when frightened"
    : "can become rigid, overprepared, and slow to ask for help";
  return `${openness}, ${discipline}, ${social}, ${warmth}, ${stability}; ${motivation}; ${attachment}; ${ethics}. ${trauma}${flavor} ${flaw}.`;
}

function buildPersonalityFramework(p) {
  const model = p.personalityModel || buildPersonalityPayload();
  const bf = model.bigFive || {};
  const parts = [`Big Five O${bf.openness || 3}/C${bf.conscientiousness || 3}/E${bf.extraversion || 3}/A${bf.agreeableness || 3}/S${bf.emotionalStability || 3}`];
  if (model.enneagramType && model.enneagramType !== "Infer") {
    parts.push(`Enneagram ${model.enneagramType}${model.enneagramWing && model.enneagramWing !== "Infer" ? model.enneagramWing : ""}`);
  }
  if (model.attachmentStyle && model.attachmentStyle !== "Infer") parts.push(`${model.attachmentStyle} attachment`);
  if (model.traumaResponse && model.traumaResponse !== "Infer") parts.push(`Trauma ${model.traumaResponse}`);
  if (model.moralAlignment && model.moralAlignment !== "Infer") parts.push(model.moralAlignment);
  const mbti = p.mbti && p.mbti !== "Infer" ? p.mbti : model.mbti || "";
  if (mbti && mbti !== "Infer") parts.push(`MBTI ${mbti} as flavor`);
  if (p.tritype && p.tritype !== "Infer") parts.push(`Tritype ${p.tritype}`);
  return compact(`${parts.join("; ")}.`, 260);
}

function buildFallbackConflict(p) {
  const text = conceptText(p);
  if (preservesVoluntaryStayPremise(p)) return "They can leave whenever they want, which makes staying harder to explain. Temporary work, familiar faces, and a growing attachment to the place keep challenging the habits that taught them to move on.";
  if (/chef|kitchen|restaurant|bakery|food/.test(text)) return "They need to keep service running, protect staff jobs, and resolve a vendor failure without concealing mistakes that could damage the restaurant.";
  if (/photo|camera|lens|image|portrait/.test(text)) return "They must settle an ownership dispute before publication while deciding whether professional loyalty matters more than what the images prove.";
  if (/detective|investigator|case|crime|spy/.test(text)) return "They must reconcile two timelines before a witness leaves, despite pressure to close the matter quickly and avoid embarrassing a respected colleague.";
  if (/doctor|nurse|medic|clinic|healer/.test(text)) return "They must correct a dangerous records discrepancy without abandoning patients, violating procedure, or letting a senior coworker bury responsibility.";
  if (/occult|witch|archive|cursed|ritual|ghost/.test(text)) return "They need to recover a missing restricted record while preserving the archive's trust and determining who had enough access to alter the log.";
  return "They need to handle a practical obligation without sacrificing their reputation, shifting the cost onto someone less powerful, or repeating an earlier bad compromise.";
}

function buildFallbackDynamic(p) {
  if (isWorldKin(p)) return `${p.userName} is the active player inside the setting. The Kin controls the world, locations, consequences, and NPCs while leaving all player choices to ${p.userName}.`;
  if (isMultiCharacterKin(p)) return `${p.userName} has a distinct relationship with each member. Trust, attraction, rivalry, and access should develop separately for each person.`;
  const preset = p.relationshipPreset && p.relationshipPreset !== "Infer" ? p.relationshipPreset.toLowerCase() : "a practical first contact";
  return `${p.userName} enters through ${preset}. Initial trust depends on useful information, kept agreements, and whether both people accept responsibility for the shared problem.`;
}

function buildFallbackIntimacy(p) {
  if (isWorldKin(p)) return "Use intimacy only through adult NPCs and only when the scene supports it. Keep the world/narrator neutral, preserve consent, and never make the setting itself sexually possessive.";
  if (isMultiCharacterKin(p)) return "Each member has separate adult intimacy preferences, pacing, jealousy, boundaries, and consent language. Do not blend attraction or assume all members want the same thing.";
  const attachment = p.personalityModel?.attachmentStyle || "Infer";
  const preferences = [
    p.intimacyOrientation && p.intimacyOrientation !== "Infer" ? `${p.intimacyOrientation.toLowerCase()} attraction` : "",
    p.powerLeaning ? `${p.powerLeaning.toLowerCase()} leaning` : "",
    p.partnerStyle,
  ].filter(Boolean).join("; ");
  const prefix = preferences ? `${preferences}. ` : "";
  if (attachment === "Secure") return `${prefix}Trust develops through direct repair, honest desire, and steady affection; intimacy can deepen without making conflict melodramatic.`;
  if (attachment === "Anxious") return `${prefix}Attraction brings urgency, reassurance-seeking, and fear of being left behind; trust grows when promises become observable patterns.`;
  if (attachment === "Avoidant") return `${prefix}Desire appears before easy vulnerability; intimacy advances through space, consent, competence, and proof that closeness will not erase autonomy.`;
  if (attachment === "Fearful-Avoidant") return `${prefix}They want closeness and retreat from it, creating intense push-pull that only steadies when fear is named instead of performed.`;
  if (/Fast|direct/i.test(p.chemistry)) return `${prefix}Attraction is acknowledged quickly through proximity, candid invitations, and physical confidence; emotional trust remains separate and must be demonstrated.`;
  if (/Volatile|Competitive/i.test(p.chemistry)) return `${prefix}Desire surfaces through challenge, argument, and testing limits, with consent stated clearly when the tension becomes physical.`;
  if (/Established|domestic/i.test(p.chemistry)) return `${prefix}Affection appears through familiar touch, shared chores, private humor, and direct discussion of wants and boundaries.`;
  return `${prefix}Interest develops through reliability, competence, quiet attention, and specific acts of care; physical intimacy follows explicit mutual interest.`;
}

function buildFallbackMemories(p) {
  const text = conceptText(p);
  if (/chef|kitchen|restaurant|bakery|food/.test(text)) {
    return [
      "The Sunday Walkout: During a packed brunch, two cooks quit after management ignored a broken refrigerator; they finished service and documented every unsafe shortcut.",
      "The Lease Envelope: They signed a costly lease extension to keep the staff employed, then learned the building needed repairs the owner had concealed.",
      "Marta's Burn: A trainee hid a serious burn to avoid being sent home, teaching them that competence can make frightened people conceal damage.",
      "The Blue Bowl: A regular potter trades one handmade bowl each winter for a private meal after closing.",
      "The Lost Recipe: They still keep a stained card for a simple soup they can cook without measuring when exhaustion makes decisions difficult.",
    ];
  }
  if (/photo|camera|lens|image|portrait/.test(text)) {
    return [
      "The Missing Credit: A magazine published their photographs under an editor's name, forcing a contract dispute that changed how they archive ownership.",
      "The Community Exhibit: A neighborhood print show sold enough work to cover three months of studio rent and proved small audiences can sustain serious work.",
      "The Unlisted Witness: A background figure in a routine assignment later became central to a legal complaint, making careless cropping feel consequential.",
      "The Bent Tripod: They repaired their first professional tripod with bicycle parts and still use it for personal projects.",
      "The Closed Pool: They photograph the abandoned municipal pool every winter to document how the building changes before redevelopment.",
    ];
  }
  return [
    "The Unsent Invoice: They once absorbed a costly mistake rather than bill a struggling client, then spent months recovering the loss.",
    "The Spare Key: A former coworker trusted them with access during a family emergency, establishing a reputation for reliability that still brings difficult favors.",
    "The Wrong Shortcut: A rushed decision saved an hour and created a week of repairs, teaching them to distinguish urgency from impatience.",
    "The Thursday Table: They meet an old acquaintance at the same modest cafe once a month and never discuss work until the second cup.",
    "The Green Toolbox: A repaired secondhand toolbox holds the few objects they refuse to lend, each marked with the date it was acquired.",
  ];
}

function formatJournalEntry(p, lines) {
  return compact(
    lines
      .slice(0, 5)
      .map((line) => `${p.name} ${lowerFirst(line)}`)
      .join(" "),
    450,
  );
}

function buildBehavioralTendencies(p) {
  const text = conceptText(p);
  const bf = p.personalityModel?.bigFive || {};
  const behaviors = [
    (bf.conscientiousness || 3) >= 4 ? "Turns vague promises into assigned tasks, written deadlines, and visible follow-through." : "Handles vague promises by testing them in small practical moments before committing.",
    (bf.extraversion || 3) >= 4 ? "Works problems aloud with regulars, coworkers, or allies instead of disappearing alone." : "Protects personal time by ending conversations once they stop producing useful information.",
    (bf.agreeableness || 3) >= 4 ? "Gives people one practical chance to repair harm before withdrawing trust." : "Questions unexplained costs, motives, and favors before contributing resources.",
  ];
  if (/chef|kitchen|restaurant|bakery|food/.test(text)) behaviors.push("Stops social conversations when a timer, delivery, or staff problem requires immediate attention.");
  else if (/detective|investigator|case|crime|spy/.test(text)) behaviors.push("Lets silence stretch after an answer instead of filling it for the other person.");
  else if (/doctor|nurse|medic|clinic|healer/.test(text)) behaviors.push("Responds first to the quiet person whose condition is worsening, not the loudest complaint.");
  else behaviors.push("Offers practical help before reassurance and notices whether the favor is respected.");
  return formatJournalEntry(p, behaviors);
}

function buildDailyRoutine(p) {
  const text = conceptText(p);
  const bf = p.personalityModel?.bigFive || {};
  const routines = [
    (bf.conscientiousness || 3) >= 4 ? "Starts the day by checking messages, money, supplies, or anything that could become a problem later." : "Starts the day by handling whatever problem is loudest before rebuilding the plan.",
    (bf.extraversion || 3) >= 4 ? "Keeps one social stop in the schedule because familiar faces help them track what has changed." : "Keeps one quiet stop in the schedule where no one expects conversation.",
    (bf.openness || 3) >= 4 ? "Leaves room for one unfamiliar route, source, flavor, or idea that might change the day." : "Handles the least pleasant task first when nobody is watching.",
  ];
  if (/chef|kitchen|restaurant|bakery|food/.test(text)) routines.push("Plans the day around prep windows, deliveries, service rushes, and cleanup that runs past closing.");
  else if (/detective|investigator|case|crime|spy/.test(text)) routines.push("Reviews notes twice: once for facts, once for what people avoided saying.");
  else if (/doctor|nurse|medic|clinic|healer/.test(text)) routines.push("Checks supplies and patient messages before admitting how tired they are.");
  else routines.push("Keeps a late-day errand or walk that gives them time to decide what to do next.");
  routines.push("Ends most days by resetting one small part of their space so tomorrow starts under control.");
  return formatJournalEntry(p, routines);
}

function buildContradictions(p) {
  const edge = String(p.moralEdge || "guarded").toLowerCase();
  const heat = String(p.dramaHeat || "medium").toLowerCase();
  const contradictions = [
    "Distrusts easy promises but keeps giving people practical chances to prove themselves.",
    "Wants control over their life but leaves room for risky decisions when someone is cornered.",
  ];
  if (/gray|messy|manipulative|possessive|jealous|villain|self/.test(edge)) {
    contradictions.push("Knows their worst coping habits cause trouble, then uses them anyway when pressure rises.");
  } else if (/high|volatile/.test(heat)) {
    contradictions.push("Craves stability but makes sharper choices when a calm answer would cost too much.");
  } else {
    contradictions.push("Values privacy but notices everyone else's business because details keep people safe.");
  }
  return formatJournalEntry(p, contradictions.slice(0, 3));
}

function buildDecisionStyle(p) {
  const text = conceptText(p);
  const bf = p.personalityModel?.bigFive || {};
  const decisions = [
    (bf.conscientiousness || 3) >= 4 ? "Defines the deadline, evidence standard, and cost of waiting before comparing options." : "Chooses the first workable option once delay becomes more expensive than imperfection.",
    (bf.agreeableness || 3) >= 4 ? "Checks who will carry the consequences before deciding." : "Asks the person closest to the work for one missing fact, then chooses without seeking unanimous approval.",
  ];
  if (/rival|competition|competitive|challenge/.test(text)) decisions.push("Chooses the option that can be tested in practice rather than argued in theory.");
  else if (/doctor|nurse|medic|healer|rescue/.test(text)) decisions.push("Uses reversibility as the threshold: immediate action for danger, slower consultation when delay will not worsen harm.");
  else if (/criminal|spy|secret|detective|case|investigator/.test(text)) decisions.push("Shares information according to what each person must act on, not according to rank or curiosity.");
  else decisions.push("Accepts an imperfect option when its risks are visible and the responsibilities are assigned.");
  return formatJournalEntry(p, decisions.slice(0, 4));
}

function buildDistinctiveHabits(p) {
  const text = conceptText(p);
  const habits = [
    "Squares loose papers with the edge of a table before sitting down.",
    "Rolls one shoulder when tension starts climbing and checks the nearest clock afterward.",
    "Carries the same chipped pen and tests it on the corner of every fresh page.",
  ];
  if (/photo|camera|lens|image|portrait|journal/.test(text)) habits.push("Turns every lens cap faceup and taps a battery twice before closing the compartment.");
  else if (/chef|kitchen|restaurant|bakery|food/.test(text)) habits.push("Wipes a knife handle before setting it down and tastes sauces from the same plain spoon.");
  else if (/occult|witch|archive|cursed|ritual|ghost/.test(text)) habits.push("Uses plain paper tabs cut to identical widths and removes each one after returning a volume.");
  else habits.push("Folds receipts into quarters and empties them from their pockets every Sunday.");
  return formatJournalEntry(p, habits);
}

function buildLocalKnowledge(p) {
  const text = conceptText(p);
  const place = p.currentCity || p.currentLocation || p.genre.split(",")[0] || "their neighborhood";
  const facts = [
    `Knows which part of ${place} gets quiet first and which routes stay busy after dark.`,
    "Knows who exaggerates, who pays late, and who can quietly fix a problem.",
    "Knows the ordinary rules people break when money, pride, or fear gets involved.",
  ];
  if (p.world?.rules) facts.push(`Knows the practical limits behind the setting rules: ${p.world.rules}`);
  if (p.world?.factions) facts.push(`Knows which groups matter locally: ${p.world.factions}`);
  if (p.world?.places) facts.push(`Knows the routes, reputations, and small rules around ${p.world.places}`);
  if (p.world?.people) facts.push(`Knows why ${p.world.people} matter to daily gossip, favors, or risk.`);
  if (p.world?.conflicts) facts.push(`Knows how ${p.world.conflicts} changes ordinary errands and public behavior.`);
  if (/apartment|tenant|neighbor|roommate/.test(text)) facts.push("Knows which units leak, which doors stick, and who hears arguments through the vents.");
  else if (/city|council|government|office/.test(text)) facts.push("Knows which offices delay paperwork and which clerks remember favors.");
  else if (/bar|restaurant|club|shop|business/.test(text)) facts.push("Knows which regulars tip, which vendors short orders, and who brings trouble before closing.");
  else facts.push("Knows small local shortcuts that outsiders miss because they look unimportant.");
  return formatJournalEntry(p, facts);
}

function triggerVocabularyForProfile(p) {
  const text = conceptText(p);
  if (/photo|camera|lens|image|portrait|journal/.test(text)) {
    return ["camera", "photo", "lens", "client", "images", "permit", "deadline", "proof"];
  }
  if (/city|council|government|office/.test(text)) {
    return ["city hall", "permit", "council", "clerk", "office", "records", "deadline", "neighborhood"];
  }
  if (/bar|restaurant|club|shop|business/.test(text)) {
    return ["bar", "regulars", "vendor", "closing", "shift", "cash", "delivery", "back room"];
  }
  if (/apartment|tenant|neighbor|roommate/.test(text)) {
    return ["apartment", "neighbor", "rent", "landlord", "hallway", "keys", "leak", "noise"];
  }
  if (/magic|fantasy|witch|vampire|werewolf|fae|supernatural/.test(text)) {
    return ["spell", "curse", "ritual", "promise", "blood", "rule", "secret", "night"];
  }
  return ["work", "home", "friend", "promise", "secret", "plan", "risk", "trust"];
}

function journalTriggerTerms(p, sectionKey) {
  const sectionTerms = {
    behavior: ["promise", "trust", "proof", "plan", "risk", "delay", "secret", "help"],
    routine: ["morning", "coffee", "work", "errand", "shift", "dinner", "sleep", "routine"],
    contradictions: ["trust", "doubt", "control", "help", "privacy", "chaos", "guilt", "need"],
    decision: ["decision", "decide", "choice", "evidence", "proof", "plan", "compromise", "risk"],
    habits: ["habit", "notebook", "pen", "coffee", "routine", "waiting", "planning", "gesture"],
    localKnowledge: ["neighborhood", "shortcut", "city hall", "permits", "regulars", "gossip", "rules", "outsiders"],
  };
  return [...(sectionTerms[sectionKey] || []), ...triggerVocabularyForProfile(p)];
}

function normalizeTriggerPhrase(phrase) {
  return String(phrase || "")
    .replace(/^\s*[-*•\d.)]+\s*/, "")
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/\b(keyphrases?|recall triggers?|triggers?)\b\s*:?\s*/gi, "")
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function triggerFingerprint(phrase) {
  return normalizeTriggerPhrase(phrase)
    .replace(/[^a-z0-9\s]/g, "")
    .split(" ")
    .map((word) => word.replace(/(?:ing|ed|es|s)$/i, ""))
    .filter(Boolean)
    .join(" ");
}

function simplifyJournalTriggerPhrase(phrase) {
  const phraseReplacements = new Map([
    ["cautious", "careful"],
    ["practical help", "help"],
    ["mechanical fixes", "repairs"],
    ["trade negotiation", "trade"],
    ["guarded talk", "talk"],
    ["inventory check", "inventory"],
    ["keeping promises", "promise"],
    ["bartering goods", "barter"],
    ["gathering rumors", "rumors"],
    ["route logging", "routes"],
    ["gear preparation", "gear"],
    ["camp setup", "camp"],
    ["depends on others", "help"],
    ["help with risk", "risk"],
    ["longing for home", "home"],
    ["avoids attachments", "attachments"],
    ["guarded generosity", "help"],
    ["information gathering", "information"],
    ["prioritizes safety", "safety"],
    ["delayed trust", "trust"],
    ["seeks compromise", "compromise"],
    ["careful choices", "choice"],
    ["conflict avoidance", "fight"],
    ["situational checks", "checks"],
    ["tool cleaning", "tools"],
    ["calming breaths", "breathe"],
    ["repair spots", "repair"],
    ["trading post", "trade"],
    ["trading posts", "trade"],
    ["first aid", "aid"],
    ["medical supplies", "supplies"],
    ["engine repairs", "engine"],
    ["raider movements", "raiders"],
    ["raider routes", "raiders"],
    ["settler customs", "settlers"],
    ["salvage value", "salvage"],
    ["travel windows", "travel"],
  ]);
  const weakModifiers = new Set(["cautious", "practical", "routine", "immediate", "minor", "guarded", "local", "specific", "general", "preferred", "hidden", "safe", "careful"]);
  const weakTails = new Set(["negotiation", "gathering", "preparation", "logging", "setup", "fixes", "preferences", "preference", "tendencies", "awareness", "approach", "familiarity", "assessment", "checks", "patterns", "pattern", "style", "behavior", "behaviors", "process", "situation", "logic", "use"]);
  let clean = normalizeTriggerPhrase(phrase)
    .replace(/^sources?\s+of\s+/, "")
    .replace(/^prefers?\s+/, "")
    .replace(/\bwhen\s+needed\b/g, "")
    .trim();
  if (phraseReplacements.has(clean)) return phraseReplacements.get(clean);
  let words = clean.split(/\s+/).filter(Boolean);
  while (words.length > 1 && weakTails.has(words[words.length - 1])) words.pop();
  if (words.length > 1 && weakTails.has(words[0])) words.shift();
  if (words.length > 2 && weakModifiers.has(words[0])) words.shift();
  if (words.length === 2 && /^(?:prioritizes|seeks|avoids|delays|gathers|keeps|checks|prepares|logs)$/i.test(words[0])) words.shift();
  if (words.length > 3) {
    const compacted = words.filter((word) => !weakModifiers.has(word) && !weakTails.has(word));
    words = compacted.length >= 2 ? compacted : words;
  }
  const preferred = words.find((word) => !weakModifiers.has(word) && !weakTails.has(word)) || words[0] || "";
  return preferred.trim();
}

function normalizeJournalKeyphrases(text, sectionKey = "") {
  const raw = String(text || "")
    .replace(/\b(?:Behavioral Tendencies|Daily Routine|Contradictions|Decision-Making Style|Distinctive Habits|Local Knowledge)\s+Keyphrases\b:?\s*/gi, "")
    .split(/[,;\n]/)
    .map(normalizeTriggerPhrase)
    .map(simplifyJournalTriggerPhrase)
    .filter(Boolean)
    .filter((phrase) => phrase.split(/\s+/).length === 1);
  const seen = new Set();
  const triggers = [];
  raw.forEach((phrase) => {
    const fingerprint = triggerFingerprint(phrase);
    if (!fingerprint || seen.has(fingerprint)) return;
    seen.add(fingerprint);
    triggers.push(phrase);
  });

  const p = buildProfile();
  journalTriggerTerms(p, sectionKey).forEach((phrase) => {
    if (triggers.length >= 8) return;
    const clean = normalizeTriggerPhrase(phrase);
    const fingerprint = triggerFingerprint(clean);
    if (!fingerprint || seen.has(fingerprint)) return;
    seen.add(fingerprint);
    triggers.push(clean);
  });

  return compact(triggers.slice(0, 8).join(", "), 220);
}

function buildJournalKeyphrases(p, sectionKey) {
  return normalizeJournalKeyphrases(journalTriggerTerms(p, sectionKey).join(", "), sectionKey);
}

function memoryTitle(text, fallback) {
  const clean = String(text || "")
    .replace(/^they\s+/i, "")
    .replace(/^their\s+/i, "")
    .replace(/\b(once|still|want|wants|learned|because|when|where|that|the|a|an)\b/gi, "")
    .replace(/[^a-z0-9\s'-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = clean.split(" ").filter((word) => word.length > 2).slice(0, 3);
  if (!words.length) return fallback;
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(" ");
}

function inferName(coreIdea) {
  const enteredName = value("kindroidName");
  if (enteredName) return enteredName;
  const match = coreIdea.match(/\b(?:named|called)\s+([A-Z][a-zA-Z'-]+)/);
  if (match) return match[1];
  return pick(["Mara", "Selene", "Iris", "Nadia", "Vivian", "Cass", "Elian", "Rowan"], coreIdea);
}

function inferAge(rawAge) {
  const parsed = Number.parseInt(rawAge, 10);
  if (Number.isFinite(parsed) && parsed >= 19) return parsed;
  return 27;
}

function inferOccupationDetailsFromText(text) {
  const source = String(text || "").toLowerCase();
  const details = { occupation: "", secondaryOccupation: "", education: "" };
  if (/\b(?:babysit|babysitter|nanny|childcare|child care|au pair)\b/.test(source)) details.occupation = "babysitter";
  else if (/\b(?:mechanic|private investigator|detective|librarian|bartender|teacher|student|nurse|artist|chef)\b/.test(source)) {
    details.occupation = source.match(/\b(?:mechanic|private investigator|detective|librarian|bartender|teacher|student|nurse|artist|chef)\b/)?.[0] || "";
  }
  if (/\bsex work|sex worker|escort|adult client|intimate arrangement|sleeping with\b/.test(source)) details.secondaryOccupation = "discreet adult sex work / paid intimate arrangements";
  if (/\bcollege|university|classes|tuition|student|campus|schooling\b/.test(source)) details.education = "college student";
  return details;
}

function inferLocationDetailsFromText(text) {
  const source = String(text || "");
  const city = source.match(/\b([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){0,2}\s+(?:City|Town|Village|Bay|Harbor|Heights|Falls|Springs|District))\b/)?.[1]
    || source.match(/\bin\s+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){0,2})(?:'s|’s)?\s+(?:district|neighborhood|quarter|ward)\b/)?.[1]
    || "";
  return { currentCity: city, currentState: "", currentCountry: "" };
}

function buildCompletionBrief() {
  const policy = modePolicy();
  const checks = [
    ["Creation type", value("creationType")],
    ["Kindroid name", value("kindroidName")],
    ["Kindroid gender", value("gender")],
    ["Species", value("species")],
    ["Kindroid age", value("age")],
    ["Current city", value("currentCity")],
    ["State/region", value("currentState")],
    ["Country", value("currentCountry")],
    ["Core idea", value("coreIdea")],
    ["Primary occupation", value("occupation")],
    ["Secondary/secret work", value("secondaryOccupation")],
    ["Education/schooling", value("education")],
    ["Genre/setting/vibe", value("genre")],
    ["Tone pack", value("tonePack")],
    ["Story intensity", value("storyIntensity")],
    ["Personality notes", value("personality")],
    ["Big Five", buildPersonalityPayload().summary],
    ["Enneagram", value("enneagramType") ? `${value("enneagramType")}${value("enneagramWing") || ""}` : ""],
    ["Attachment style", value("attachmentStyle")],
    ["Trauma response", value("traumaResponse")],
    ["Moral alignment", value("moralAlignment")],
    ["Dynamic with user", value("dynamic")],
    ["Relationship preset", value("relationshipPreset")],
    ["Romance/intimacy notes", value("intimacy")],
    ["Chemistry", value("chemistry")],
    ["Moral edge", value("moralEdge")],
    ["Drama heat", value("dramaHeat")],
    ["MBTI", value("mbti")],
    ["Tritype", value("tritype")],
  ];
  const missing = checks
    .filter(([, fieldValue]) => !fieldValue || /^infer$/i.test(fieldValue))
    .map(([label]) => label);
  const supplied = checks
    .filter(([, fieldValue]) => fieldValue && !/^infer$/i.test(fieldValue))
    .map(([label, fieldValue]) => `${label}: ${fieldValue}`);

  if (!missing.length) return "";
  return [
    `${policy.title}: ${policy.generationHint}`,
    policy.ignoredReason ? `Inactive fields for this mode: ${policy.ignoredReason}` : "",
    "Complete every blank or Infer field with coherent generated detail. Do not omit sections because inputs are sparse.",
    `Missing or Infer fields to invent: ${missing.join(", ")}.`,
    supplied.length ? `Preserve supplied constraints exactly: ${supplied.join("; ")}.` : "No major constraints were supplied; create a complete coherent adult Kindroid.",
  ].filter(Boolean).join(" ");
}

function inferChemistry(p) {
  const text = `${p.coreIdea} ${p.genre} ${p.personality} ${p.dynamic}`.toLowerCase();
  if (/rival|competition|spar|challenge|enemy|opponent/.test(text)) return "Competitive charge";
  if (/reckless|thrill|danger|impulsive|nightclub|criminal|affair/.test(text)) return "Fast burn";
  if (/ex|married|partner|history|reunion|old flame/.test(text)) return "Established intimacy";
  if (/guarded|avoidant|secret|spy|detective|assassin|control/.test(text)) return "Physically direct, emotionally guarded";
  if (/chaos|volatile|push|pull|jealous|obsess|betray/.test(text)) return "Volatile push-pull";
  if (/cozy|domestic|home|healer|caretaker|gentle/.test(text)) return "Tender domestic";
  return "Slow burn";
}

function buildDefaultIntimacy(chemistry, moralEdge) {
  const edge = /gray|messy|self|manipulative|possessive|villain/i.test(moralEdge) ? " with sharper jealousy, temptation, and poor coping kept consensual" : "";
  const options = {
    "Slow burn": `slow-burn chemistry, restraint, careful trust, and attraction that builds through earned vulnerability${edge}`,
    "Fast burn": `fast-burn attraction, immediate charge, direct flirting, and heat that arrives before either person feels ready${edge}`,
    "Volatile push-pull": `volatile push-pull chemistry, charged arguments, retreat and pursuit, and desire complicated by pride${edge}`,
    "Established intimacy": `established intimacy, familiar touch, private shorthand, and unresolved history beneath the comfort${edge}`,
    "Physically direct, emotionally guarded": `physical directness, blunt desire, guarded feelings, and intimacy that exposes what words avoid${edge}`,
    "Tender domestic": `tender domestic intimacy, quiet rituals, protective warmth, and affection that feels lived-in${edge}`,
    "Competitive charge": `competitive chemistry, teasing dares, rivalry, and attraction sharpened by mutual respect${edge}`,
  };
  return options[chemistry] || options["Slow burn"];
}

function buildDefaultWound(moralEdge) {
  const options = {
    "Grounded but flawed": "They have hurt people by choosing control over honesty and still call it responsibility.",
    "Messy": "They keep surviving through bad timing, worse apologies, and impulses they understand only after the damage is done.",
    "Morally gray": "They once chose the useful lie over the clean truth and learned how easy it was to do it again.",
    "Self-destructive": "They punish themself by chasing the one thing most likely to prove their worst beliefs right.",
    "Manipulative when scared": "When afraid of abandonment, they manage the room instead of telling the truth.",
    "Possessive or jealous": "They confuse devotion with control when old insecurity takes the wheel.",
    "Villainous charm": "They learned to make cruelty look elegant enough that people forgive it before they understand it.",
  };
  return options[moralEdge] || "They once failed someone who trusted them and learned to treat desire as evidence of danger.";
}

function buildDefaultDream(dramaHeat) {
  const options = {
    Low: "They want a steadier life where trust feels ordinary instead of dangerous.",
    Medium: "They want a life that feels chosen instead of merely survived.",
    High: "They want the impossible: love, victory, absolution, and the right to keep their sharpest defenses.",
    "Volatile but coherent": "They want to be wanted at their worst without facing what their worst can cost.",
  };
  return options[dramaHeat] || options.Medium;
}

function buildDefaultComplication(moralEdge, dramaHeat) {
  if (dramaHeat === "Volatile but coherent") return "Every honest step forward exposes a secret, a bad habit, or a hunger they would rather make seductive than fix.";
  if (dramaHeat === "High") return "The closer they get to what they want, the more their ambition, fear, and desire start pulling in different directions.";
  if (/gray|messy|self|manipulative|possessive|villain/i.test(moralEdge)) return "They know the right choice, but the wrong one keeps offering faster relief and better leverage.";
  return "The closer they get to what they want, the more their old reflexes misread tenderness as a trap.";
}

function inferTonePack(text) {
  const source = String(text || "").toLowerCase();
  if (/detective|crime|rain|smoke|noir/.test(source)) return "Noir";
  if (/cozy|bakery|bookshop|cottage|domestic|gentle/.test(source)) return "Cozy";
  if (/gothic|haunted|vampire|curse|cathedral|ghost/.test(source)) return "Gothic";
  if (/shonen|anime|tournament|rival|power|champion/.test(source)) return "Anime/shonen";
  if (/thriller|spy|agent|assassin|conspiracy|chase/.test(source)) return "High tension thriller";
  if (/therapy|trauma|obsession|mind|identity|psychological/.test(source)) return "Psychological drama";
  if (/magic|occult|witch|fae|urban fantasy/.test(source)) return "Urban fantasy";
  if (/romance|lover|desire|wedding|affair/.test(source)) return "Romance novel";
  if (/roommate|neighbor|coffee|everyday|slice/.test(source)) return "Slice of life";
  return "Cinematic";
}

function buildToneTexture(tonePack) {
  const tones = {
    Cinematic: "clear sensory staging, visible choices, restrained dramatic beats, and scene-forward prose",
    Noir: "lean noir texture, sharp observations, rain-slick tension, and morally bruised dialogue",
    Cozy: "warm everyday detail, gentle humor, soft routines, and intimate grounded stakes",
    Gothic: "ornate tension, old secrets, candlelit dread, and desire threaded through restraint",
    "Romance novel": "emotionally direct romantic tension, tactile detail, and desire grounded in character stakes",
    "Anime/shonen": "bold momentum, rivalry, earnest conviction, heightened reactions, and clean emotional turns",
    "Slice of life": "ordinary rituals, naturalistic pauses, small stakes that reveal larger feelings",
    "Psychological drama": "interior pressure expressed through behavior, subtext, and uneasy contradictions",
    "Urban fantasy": "modern texture crossed with specific magic, hidden rules, and street-level wonder",
    "Dry comedy": "understated wit, awkward honesty, precise timing, and tension punctured by human absurdity",
    "High tension thriller": "urgent pacing, concrete danger, clipped choices, and pressure that narrows the room",
  };
  return tones[tonePack] || tones.Cinematic;
}

function buildDynamicFromPreset(preset, userName) {
  const options = {
    Strangers: `${userName} is a stranger pulled into the Kin's problem before either of them understands the cost`,
    "Old friends": `${userName} is an old friend who knows the Kin well enough to notice what they are hiding`,
    Exes: `${userName} is an ex with unfinished emotional history and a reason to be back in the Kin's orbit`,
    Rivals: `${userName} is a rival whose competence irritates the Kin because it also makes them feel seen`,
    "Client/professional": `${userName} is tied to the Kin through a professional arrangement that has become too personal`,
    "Co-conspirators": `${userName} is a co-conspirator already implicated in the Kin's secret plan`,
    "Protector/protected": `${userName} and the Kin are caught in a protector/protected dynamic neither fully trusts`,
    "Mentor/student, adults only": `${userName} and the Kin have an adult mentor/student history complicated by respect, tension, and changed stakes`,
    "Boss/employee": `${userName} and the Kin are linked by workplace authority, private tension, and a problem that ignores boundaries`,
    Neighbors: `${userName} is a neighbor close enough to notice the Kin's routines breaking down`,
    Roommates: `${userName} shares space with the Kin, making every secret harder to keep contained`,
    "Stranger with leverage": `${userName} is a stranger holding leverage the Kin cannot ignore`,
    "Witness and suspect": `${userName} and the Kin are tangled as witness and suspect, unsure who is protecting whom`,
    "Handler and asset": `${userName} and the Kin operate as handler and asset, with trust strained by duty and secrets`,
    "Old flame": `${userName} is an old flame whose return makes the Kin's restraint feel suddenly rehearsed`,
  };
  return options[preset] || "";
}

function formatLocation(location = {}) {
  return [location.currentCity, location.currentState, location.currentCountry]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join(", ");
}

function buildProfile() {
  const userName = currentUserName();
  const creationType = value("creationType") || "Single Character";
  const ensembleMembers = value("ensembleMembers");
  const worldNarrationNotes = value("worldNarrationNotes");
  const coreIdea = value("coreIdea") || "A cultured, emotionally layered companion with a life outside the user.";
  const age = inferAge(value("age"));
  const apparentAge = value("apparentAge") || "";
  const name = inferName(coreIdea);
  const gender = value("gender") || "adult, user-defined";
  const species = value("species") || "Human";
  const currentCity = value("currentCity");
  const currentState = value("currentState");
  const currentCountry = value("currentCountry");
  const currentLocation = formatLocation({ currentCity, currentState, currentCountry });
  const whyAnswer = interviewThemeAnswer("why");
  const woundAnswer = interviewThemeAnswer("wound");
  const dreamAnswer = interviewThemeAnswer("dream");
  const complicationAnswer = interviewThemeAnswer("complication");
  const textureAnswer = interviewThemeAnswer("texture");
  const voiceAnswer = interviewThemeAnswer("voice");
  const inferredOccupation = inferOccupationDetailsFromText(`${coreIdea} ${value("intimacy")} ${value("dynamic")} ${dreamAnswer || state.answers.dream || ""}`);
  const occupation = value("occupation") || inferredOccupation.occupation;
  const secondaryOccupation = value("secondaryOccupation") || inferredOccupation.secondaryOccupation;
  const education = value("education") || inferredOccupation.education;
  const genre = value("genre") || [currentLocation, "modern character drama with vivid everyday texture"].filter(Boolean).join("; ");
  const tonePack = value("tonePack") || inferTonePack(`${coreIdea} ${genre}`);
  const storyIntensity = value("storyIntensity") || "Infer";
  const world = buildWorldPayload();
  const boundaries = value("boundaries");
  const personality = value("personality") || "observant, self-possessed, warm once trust is earned";
  const relationshipPreset = value("relationshipPreset") || "Infer";
  const dynamic = value("dynamic") || buildDynamicFromPreset(relationshipPreset, userName) || `${userName} is the person who interrupts their routine and makes honesty harder to avoid`;
  const chemistry = value("chemistry") || inferChemistry({ coreIdea, genre, personality, dynamic });
  const moralEdge = value("moralEdge") || "Balanced";
  const dramaHeat = value("dramaHeat") || "Medium";
  const intimacyOrientation = value("intimacyOrientation") || "Infer";
  const partnerStyle = value("partnerStyle");
  const powerLeaning = powerLeaningText();
  const intimacy = value("intimacy") || buildDefaultIntimacy(chemistry, moralEdge);
  const why = whyAnswer || "Their best qualities are also survival habits, so growth requires risking the defenses that once protected them.";
  const wound = woundAnswer || buildDefaultWound(moralEdge);
  const dream = dreamAnswer || buildDefaultDream(dramaHeat);
  const complication = complicationAnswer || buildDefaultComplication(moralEdge, dramaHeat);
  const texture = textureAnswer || `${currentLocation || world.places || value("genre") || "rainy streets, warm rooms after midnight, small rituals, worn tools, music from another room"}; ${buildToneTexture(tonePack)}`;
  const voice = voiceAnswer || `medium sentences, ${buildToneTexture(tonePack)}, restrained flirting, and rare moments of direct vulnerability`;
  const personalityModel = buildPersonalityPayload();
  const inferredTypes = inferTypes({ coreIdea, personality, dynamic, why, wound, dream, complication, chemistry, moralEdge, dramaHeat });
  const mbti = value("mbti") || personalityModel.mbti || inferredTypes.mbti;
  const tritype = value("tritype") || inferredTypes.tritype;
  const appearance = buildModeAwareAppearancePayload(creationModeKey());

  return { userName, creationType, ensembleMembers, worldNarrationNotes, coreIdea, age, apparentAge, name, gender, species, currentCity, currentState, currentCountry, currentLocation, occupation, secondaryOccupation, education, genre, tonePack, storyIntensity, world, boundaries, personality, dynamic, relationshipPreset, intimacy, intimacyOrientation, partnerStyle, powerLeaning, chemistry, moralEdge, dramaHeat, mbti, tritype, personalityModel, why, wound, dream, complication, texture, voice, appearance };
}

function buildGeneratorPayload(options = {}) {
  const completionBrief = buildCompletionBrief();
  const includeContinuity = options.includeContinuity !== false;
  const currentMode = creationModeKey();
  const policy = modePolicy(currentMode);
  const ignoredFields = policy.ignoredFields.filter((id) => fieldHasMeaningfulValue(id));
  const inferredOccupation = inferOccupationDetailsFromText(`${value("coreIdea")} ${value("intimacy")} ${value("dynamic")}`);
  const payload = {
    mode: state.mode,
    userName: currentUserName(),
    player: buildPlayerPayload(),
    creationType: value("creationType") || "Single Character",
    modeGuidance: {
      mode: currentMode,
      title: policy.title,
      focus: policy.focus,
      recommended: policy.recommended,
      generationHint: policy.generationHint,
      ignoredReason: policy.ignoredReason,
    },
    ignoredFields,
    ensembleMembers: value("ensembleMembers"),
    worldNarrationNotes: value("worldNarrationNotes"),
    kindroidName: value("kindroidName") || "Infer",
    gender: value("gender") || "Infer",
    species: value("species") || "Infer",
    age: inferAge(value("age")),
    apparentAge: value("apparentAge") || "",
    currentCity: value("currentCity") || "Infer",
    currentState: value("currentState") || "Infer",
    currentCountry: value("currentCountry") || "Infer",
    currentLocation: formatLocation({ currentCity: value("currentCity"), currentState: value("currentState"), currentCountry: value("currentCountry") }) || "Infer",
    coreIdea: value("coreIdea"),
    occupation: value("occupation") || inferredOccupation.occupation,
    secondaryOccupation: value("secondaryOccupation") || inferredOccupation.secondaryOccupation,
    education: value("education") || inferredOccupation.education,
    completionBrief,
    sparseBrief: completionBrief,
    genre: value("genre"),
    tonePack: value("tonePack") || "Infer",
    storyIntensity: value("storyIntensity") || "Infer",
    world: buildWorldPayload(),
    boundaries: value("boundaries"),
    personality: value("personality"),
    dynamic: value("dynamic"),
    relationshipPreset: value("relationshipPreset") || "Infer",
    intimacy: value("intimacy"),
    intimacyOrientation: value("intimacyOrientation") || "Infer",
    partnerStyle: value("partnerStyle"),
    powerLeaning: powerLeaningText(),
    chemistry: value("chemistry") || "Infer",
    moralEdge: value("moralEdge") || "Balanced",
    dramaHeat: value("dramaHeat") || "Medium",
    personalityModel: buildPersonalityPayload(),
    mbti: value("mbti") || "Infer",
    tritype: value("tritype") || "Infer",
    appearance: buildModeAwareAppearancePayload(currentMode),
    fieldLocks: Object.fromEntries(generatorFieldIds.map((id) => [id, isFieldLocked(id)])),
    fieldOrigins: Object.fromEntries(generatorFieldIds.map((id) => [id, fieldMeta(id).origin])),
    interviewAnswers: { ...state.answers },
    interviewQuestions: activeInterviewQuestions(),
    interviewAnswerSummary: buildInterviewAnswerSummary(),
    generationMode: includeContinuity ? "continuity" : "fresh",
    modelSettings: modelSettingsForTask(options.aiTask || "fullGeneration"),
  };
  if (includeContinuity) {
    payload.existingSections = getSectionValues();
    payload.lockedSections = getLockedSections();
  }
  return payload;
}

function sliderValue(id) {
  const parsed = Number.parseInt($(id)?.value || "3", 10);
  return Number.isFinite(parsed) ? parsed : 3;
}

function levelLabel(score, low, mid, high) {
  if (score <= 2) return low;
  if (score >= 4) return high;
  return mid;
}

function powerLeaningText(score = sliderValue("powerLeaning")) {
  const labels = {
    1: "Dom",
    2: "Dom-leaning",
    3: "Switch",
    4: "Sub-leaning",
    5: "Sub",
  };
  return labels[score] || "Switch";
}

function updatePowerLeaningLabel() {
  const label = $("powerLeaningLabel");
  if (label) label.textContent = powerLeaningText();
}

function inferMbtiFromBigFive(bigFive) {
  const iOrE = bigFive.extraversion >= 4 ? "E" : "I";
  const nOrS = bigFive.openness >= 4 ? "N" : "S";
  const fOrT = bigFive.agreeableness >= 4 ? "F" : "T";
  const jOrP = bigFive.conscientiousness >= 4 ? "J" : "P";
  return `${iOrE}${nOrS}${fOrT}${jOrP}`;
}

function bigFiveFromMbti(mbti) {
  const type = String(mbti || "").toUpperCase();
  if (!type || type === "INFER") return {};
  return {
    openness: type[1] === "N" ? 4 : 2,
    conscientiousness: type[3] === "J" ? 4 : 2,
    extraversion: type[0] === "E" ? 4 : 2,
    agreeableness: type[2] === "F" ? 4 : 2,
    emotionalStability: 3,
  };
}

function buildPersonalityPayload() {
  const suppliedMbti = value("mbti");
  const fromMbti = bigFiveFromMbti(suppliedMbti);
  const slidersAreNeutral = ["bigFiveOpenness", "bigFiveConscientiousness", "bigFiveExtraversion", "bigFiveAgreeableness", "bigFiveEmotionalStability"].every((id) => sliderValue(id) === 3);
  const bigFive = {
    openness: slidersAreNeutral && fromMbti.openness ? fromMbti.openness : sliderValue("bigFiveOpenness"),
    conscientiousness: slidersAreNeutral && fromMbti.conscientiousness ? fromMbti.conscientiousness : sliderValue("bigFiveConscientiousness"),
    extraversion: slidersAreNeutral && fromMbti.extraversion ? fromMbti.extraversion : sliderValue("bigFiveExtraversion"),
    agreeableness: slidersAreNeutral && fromMbti.agreeableness ? fromMbti.agreeableness : sliderValue("bigFiveAgreeableness"),
    emotionalStability: slidersAreNeutral && fromMbti.emotionalStability ? fromMbti.emotionalStability : sliderValue("bigFiveEmotionalStability"),
  };
  const inferredMbti = suppliedMbti || inferMbtiFromBigFive(bigFive);
  const enneagram = value("enneagramType") ? `${value("enneagramType")}${value("enneagramWing") || ""}` : "Infer";
  const attachment = value("attachmentStyle") || "Infer";
  const traumaResponse = value("traumaResponse") || "Infer";
  const alignment = value("moralAlignment") || "Infer";
  const summary = [
    `Big Five: ${levelLabel(bigFive.openness, "low openness", "moderate openness", "high openness")}, ${levelLabel(bigFive.conscientiousness, "low conscientiousness", "moderate conscientiousness", "high conscientiousness")}, ${levelLabel(bigFive.extraversion, "low extraversion", "moderate extraversion", "high extraversion")}, ${levelLabel(bigFive.agreeableness, "low agreeableness", "moderate agreeableness", "high agreeableness")}, ${levelLabel(bigFive.emotionalStability, "reactive", "balanced stability", "stable")}`,
    `Motivation: Enneagram ${enneagram}`,
    `Attachment: ${attachment}`,
    `Trauma Response: ${traumaResponse}`,
    `Alignment: ${alignment}`,
    `Flavor: MBTI ${inferredMbti}, tritype ${value("tritype") || "Infer"}`,
  ].join("; ");
  return {
    bigFive,
    enneagramType: value("enneagramType") || "Infer",
    enneagramWing: value("enneagramWing") || "Infer",
    attachmentStyle: attachment,
    traumaResponse,
    moralAlignment: alignment,
    mbti: inferredMbti,
    tritype: value("tritype") || "Infer",
    summary,
    hierarchy: "Behavior uses Big Five first; motivation uses Enneagram; relationships use Attachment; ethics use Alignment; MBTI and Tritype are flavor only.",
  };
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function listHtml(items) {
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderBigFiveHelp(key) {
  const trait = bigFiveGuidance[key];
  if (!trait) {
    return {
      title: "Big Five",
      html: `<p>Big Five uses sliders instead of personality types. Each slider describes a behavior spectrum, and the generator uses these values before MBTI labels.</p>${Object.values(bigFiveGuidance).map((item) => `<h4>${escapeHtml(item.title)}</h4><p><strong>Low:</strong> ${escapeHtml(item.low)}</p><p><strong>High:</strong> ${escapeHtml(item.high)}</p>`).join("")}`,
    };
  }
  return {
    title: trait.title,
    html: `<p>Big Five traits are spectrums. Low and high values are both useful; they simply create different roleplay behavior.</p><h4>Lower ${escapeHtml(trait.title)}</h4><p>${escapeHtml(trait.low)}</p><h4>Higher ${escapeHtml(trait.title)}</h4><p>${escapeHtml(trait.high)}</p><h4>Everyday examples</h4>${listHtml(trait.examples)}`,
  };
}

function renderEnneagramHelp() {
  const selected = value("enneagramType");
  const entries = selected ? [[selected, enneagramGuidance[selected]]] : Object.entries(enneagramGuidance);
  const intro = selected
    ? "Enneagram explains motivation: what the character wants, fears, and keeps trying to resolve."
    : "Enneagram explains motivation. Use Infer if you want KinForge to choose from the character concept.";
  return {
    title: selected ? enneagramGuidance[selected].title : "Enneagram Types",
    html: `<p>${intro}</p>${entries.map(([type, item]) => `<h4>Type ${escapeHtml(type)} - ${escapeHtml(item.title.replace(/^Type \w+ - /, ""))}</h4><p><strong>Core motivation:</strong> ${escapeHtml(item.motivation)}</p><p><strong>Core fear:</strong> ${escapeHtml(item.fear)}</p><p><strong>Strengths:</strong></p>${listHtml(item.strengths)}<p><strong>Potential struggles:</strong></p>${listHtml(item.struggles)}`).join("")}`,
  };
}

function renderAttachmentHelp() {
  const selected = value("attachmentStyle");
  const entries = selected ? [[selected, attachmentGuidance[selected]]] : Object.entries(attachmentGuidance);
  return {
    title: selected || "Attachment Style",
    html: `<p>Attachment style describes how the character forms emotional bonds. It should shape romance, trust, vulnerability, and relationship repair.</p>${entries.map(([, item]) => `<h4>${escapeHtml(item.title)}</h4><p>${escapeHtml(item.overview)}</p>${listHtml(item.behaviors)}`).join("")}`,
  };
}

function renderAlignmentHelp() {
  const selected = value("moralAlignment");
  const entries = selected ? [[selected, alignmentGuidance[selected]]] : Object.entries(alignmentGuidance);
  return {
    title: selected || "Moral Alignment",
    html: `<p>Alignment describes ethical behavior, not personality. It should influence choices, conflicts, and story pressure.</p>${entries.map(([name, text]) => `<h4>${escapeHtml(name)}</h4><p>${escapeHtml(text)}</p>`).join("")}`,
  };
}

function renderMbtiHelp() {
  const selected = value("mbti");
  const entries = selected ? [[selected, mbtiGuidance[selected]]] : Object.entries(mbtiGuidance);
  const intro = selected
    ? "MBTI is treated as an advanced flavor layer. Big Five still drives behavior first."
    : "MBTI is a familiar shorthand for communication and problem-solving style. KinForge can infer it from Big Five, so it is optional.";
  return {
    title: selected ? `${selected} - ${mbtiGuidance[selected]?.name || "MBTI"}` : "MBTI Reference",
    html: `<p>${intro}</p>${entries.map(([type, item]) => `<h4>${escapeHtml(type)} - ${escapeHtml(item.name)}</h4><p>${escapeHtml(item.summary)}</p><p><strong>Strengths:</strong></p>${listHtml(item.strengths)}<p><strong>Potential weaknesses:</strong></p>${listHtml(item.weaknesses)}${selected ? `<p><strong>Communication:</strong> ${escapeHtml(item.communication)}</p><p><strong>Conflict style:</strong> ${escapeHtml(item.conflict)}</p><p><strong>Relationship tendencies:</strong> ${escapeHtml(item.relationships)}</p><p><strong>Common occupations:</strong> ${escapeHtml(item.occupations)}</p>` : ""}`).join("")}`,
  };
}

function renderFieldHelp(fieldId) {
  const item = fieldHelpGuidance[fieldId];
  if (!item) {
    return {
      kicker: "Field help",
      title: "Field Guidance",
      html: "<p>This field gives KinForge source material for generation. If you leave it blank, KinForge will infer it from the rest of the current settings.</p>",
    };
  }
  return {
    kicker: "Field help",
    title: item.title,
    html: `<p>${escapeHtml(item.body)}</p>${item.affects?.length ? `<h4>Usually affects</h4>${listHtml(item.affects)}` : ""}<p><strong>Tip:</strong> Leave this on Infer or blank when you want KinForge to decide from the rest of the profile.</p>`,
  };
}

function renderPersonalityHelp(button) {
  const system = button.dataset.helpSystem;
  if (system === "field") return renderFieldHelp(button.dataset.helpField);
  if (system === "bigFive") return renderBigFiveHelp(button.dataset.helpKey);
  if (system === "enneagram") return renderEnneagramHelp();
  if (system === "attachment") return renderAttachmentHelp();
  if (system === "traumaResponse") return renderFieldHelp("traumaResponse");
  if (system === "alignment") return renderAlignmentHelp();
  if (system === "mbti") return renderMbtiHelp();
  if (system === "enneagramWing") {
    return {
      title: "Enneagram Wing",
      html: "<p>A wing adds a nearby flavor to the core type. A 5w4 is more introspective and expressive than a plain Type 5; a 5w6 is more security-minded and practical.</p><p>Use Infer when you know the core motivation but want KinForge to choose the sharper nuance.</p>",
    };
  }
  if (system === "tritype") {
    return {
      title: "Tritype",
      html: "<p>Tritype is an advanced Enneagram nuance. It adds secondary motivation flavors, but KinForge does not require it.</p><p>Use it when you already know the combination you want. Otherwise, Infer is usually cleaner.</p>",
    };
  }
  return {
    kicker: "Personality help",
    title: "Layered Personality",
    html: "<p>KinForge uses personality in layers. Big Five drives behavior, Enneagram drives motivation, Attachment drives relationships, Alignment drives ethical choices, and MBTI/Tritype add flavor.</p><p>You do not need to know every system. Set the parts you care about and leave the rest on Infer.</p>",
  };
}

function openPersonalityHelp(button) {
  const rendered = renderPersonalityHelp(button);
  $("personalityHelpKicker").textContent = rendered.kicker || "Personality help";
  $("personalityHelpTitle").textContent = rendered.title;
  $("personalityHelpContent").innerHTML = rendered.html;
  $("personalityHelpOverlay").hidden = false;
}

function closePersonalityHelp() {
  $("personalityHelpOverlay").hidden = true;
}

function readableBigFive(bigFive) {
  return [
    levelLabel(bigFive.openness, "practical", "balanced between routine and novelty", "curious"),
    levelLabel(bigFive.conscientiousness, "improvisational", "reasonably organized", "highly organized"),
    levelLabel(bigFive.extraversion, "private", "socially selective", "expressive"),
    levelLabel(bigFive.agreeableness, "skeptical", "fair but measured", "warm"),
    levelLabel(bigFive.emotionalStability, "emotionally reactive", "steady under ordinary pressure", "calm under pressure"),
  ];
}

function buildPersonalityPreviewText() {
  const model = buildPersonalityPayload();
  const traits = readableBigFive(model.bigFive);
  const motivation = model.enneagramType === "Infer" ? "lets the story reveal their core motive" : `is driven by Type ${model.enneagramType}${model.enneagramWing === "Infer" ? "" : model.enneagramWing} motivations`;
  const attachment = model.attachmentStyle === "Infer" ? "forms bonds in a way KinForge will infer from the concept" : `approaches closeness with a ${model.attachmentStyle.toLowerCase()} relationship pattern`;
  const trauma = model.traumaResponse === "Infer" ? "stress behavior will be inferred from their history" : `under stress tends toward ${model.traumaResponse.toLowerCase()}`;
  const ethics = model.moralAlignment === "Infer" ? "ethical pressure will be inferred from the story" : `tends toward ${model.moralAlignment.toLowerCase()} choices`;
  return `Your current selections suggest a ${traits.join(", ")} character who ${motivation}, ${attachment}, ${trauma}, and ${ethics}.`;
}

function updatePersonalityPreview() {
  const preview = $("personalityPreviewText");
  if (!preview) return;
  preview.textContent = buildPersonalityPreviewText();

  const suggestionHost = $("personalitySuggestions");
  if (!suggestionHost) return;
  const mbti = value("mbti");
  const model = buildPersonalityPayload();
  const suggestions = mbtiSuggestions[mbti] || [
    `Likely MBTI: ${model.mbti}`,
    model.bigFive.extraversion <= 2 ? "Consider Avoidant or Secure attachment" : "Consider Secure or Anxious attachment",
    model.bigFive.agreeableness <= 2 ? "Pairs well with sharper moral conflict" : "Pairs well with loyalty or caretaking arcs",
  ];
  suggestionHost.innerHTML = suggestions.map((item) => `<span class="suggestion-chip">${escapeHtml(item)}</span>`).join("");
}

function buildAppearancePayload() {
  const payload = Object.fromEntries(appearanceFieldIds.map((id) => [id, value(id)]));
  payload.modeHint = "Blank or AI means generate from character. Random means explore. Any concrete value is locked and must be preserved exactly.";
  return payload;
}

function buildModeAwareAppearancePayload(mode = creationModeKey()) {
  if (mode === "world") {
    return {
      modeHint: "Ignored for World / NPC Ensemble mode unless the user explicitly asks for a setting avatar or symbolic visual. Do not use stale personal appearance fields.",
      ignoredForCreationType: true,
    };
  }
  return buildAppearancePayload();
}

function buildWorldPayload() {
  const world = {
    type: value("worldType") || "Infer",
    era: value("worldEra"),
    rules: value("worldRules"),
    creatures: value("worldCreatures"),
    factions: value("worldFactions"),
    people: value("worldPeople"),
    places: value("worldPlaces"),
    conflicts: value("worldConflicts"),
    notes: value("worldNotes"),
  };
  world.summary = [
    world.type && world.type !== "Infer" ? `Type: ${world.type}` : "",
    world.era ? `Era: ${world.era}` : "",
    world.rules ? `Rules: ${world.rules}` : "",
    world.creatures ? `Creatures: ${world.creatures}` : "",
    world.factions ? `Factions: ${world.factions}` : "",
    world.people ? `People: ${world.people}` : "",
    world.places ? `Places: ${world.places}` : "",
    world.conflicts ? `Conflicts: ${world.conflicts}` : "",
    world.notes ? `Notes: ${world.notes}` : "",
  ].filter(Boolean).join("; ");
  world.modeHint = "Use as setting continuity and Journal Manager material. Do not overwrite the Kin's personality, occupation, relationship, or original premise unless the user explicitly connects them.";
  return world;
}

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function fallbackNameOptions() {
  const gender = value("gender").toLowerCase();
  const feminine = ["Tessa", "Corina", "Alina", "Bianca", "Diana", "Marina", "Claudia", "Nina", "Renee", "Clara"];
  const masculine = ["Adrian", "Victor", "Nolan", "Caleb", "Dorian", "Marcus", "Julian", "Evan", "Simon", "Ronan"];
  const neutral = ["Morgan", "Casey", "Avery", "Jordan", "Quinn", "Riley", "Sage", "Robin", "Devon", "Taylor"];
  const surnames = ["Marin", "Dobre", "Donovan", "Cole", "Miller", "Brooks", "Ionescu", "Navarro", "Bennett", "Ward"];
  const firstPool = /woman|female|girl|fem/i.test(gender) ? feminine : /man|male|boy|masc/i.test(gender) ? masculine : neutral;
  return Array.from({ length: 10 }, (_, index) => {
    const firstName = pickRandom(firstPool);
    const lastName = pickRandom(surnames);
    return {
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`,
      pronunciation: "Plain English pronunciation",
      origin: value("nameHeritage") || value("nameBirthCountry") || "Contextual",
      popularity: sliderMeaning("nameRarity", ["Common", "Mostly common", "Balanced", "Rare", "Very rare"]),
      meaning: "",
      nicknames: firstName.length > 5 ? [firstName.slice(0, 3), firstName.slice(0, 4)] : [firstName],
      explanation: `Fallback option shaped by ${value("gender") || "inferred gender"}, ${value("species") || "inferred species"}, ${value("nameGenre") || value("genre") || "grounded genre"}, ${value("nameHeritage") || "open heritage"}, and a ${sliderMeaning("nameCommonnessFilter", ["familiar", "somewhat familiar", "balanced", "less common", "low-trope"])} naming target.`,
    };
  });
}

function randomizeAppearance() {
  const options = {
    portraitConsistency: ["Flexible", "Moderate", "Strict"],
    facialDistinctiveness: ["Average", "Distinctive", "Highly distinctive"],
    appearanceEthnicity: ["AI", "Random"],
    skinTone: ["AI", "Random", "pale skin with natural texture", "olive skin with natural texture", "warm medium skin with natural texture", "deep brown skin with natural texture"],
    hairColor: ["Black", "Dark Brown", "Brown", "Light Brown", "Auburn", "Copper", "Ginger", "Strawberry Blonde", "Blonde", "Platinum", "Gray", "White"],
    hairColorCustom: [""],
    hairstyle: ["AI", "Random", "side part", "loose waves", "messy bun", "low ponytail", "tucked behind one ear", "cropped practical style"],
    hairLength: ["Very short", "Short", "Chin length", "Shoulder length", "Long", "Very long"],
    hairTexture: ["Straight", "Wavy", "Curly", "Coily", "Thick", "Fine"],
    eyeColor: ["Brown", "Hazel", "Green", "Blue", "Gray", "Amber", "Black"],
    eyeShape: ["Hooded", "Almond", "Round", "Deep-set", "Upturned", "Downturned"],
    faceShape: ["Round", "Oval", "Square", "Heart-shaped", "Angular", "Long"],
    noseShape: ["Straight", "Slightly crooked", "Broad", "Narrow", "Rounded"],
    lipShape: ["Defined", "Full", "Thin", "Wide", "Uneven smile"],
    browShape: ["Straight", "Arched", "Thick", "Fine", "Uneven"],
    jawline: ["Soft", "Defined", "Square", "Strong chin", "Narrow"],
    distinctiveFeatures: ["light freckles", "beauty mark", "small scar", "glasses", "birthmark", "dimples", "gap teeth", "vitiligo patches", "piercings", "tattoos"],
    heightScale: ["Very Short", "Short", "Average", "Tall", "Very Tall"],
    bodyShape: ["Rectangle", "Pear", "Apple", "Hourglass", "Inverted Triangle"],
    bodyBuild: ["Petite", "Thin", "Medium", "Soft", "Broad", "Heavyset"],
    muscleTone: ["Soft", "Lightly toned", "Sturdy", "Athletic"],
    appearanceClothing: ["AI", "Random", "simple everyday clothes", "work-worn practical outfit", "soft layered clothing", "tailored dark clothes", "casual jacket and plain shirt"],
    appearanceExpression: ["AI", "Random", "tired half-smile", "neutral expression", "guarded look", "subtle smile", "focused gaze"],
    appearancePose: ["AI", "Random", "close portrait", "three-quarter portrait", "relaxed standing pose", "seated portrait", "looking slightly off-camera"],
    appearanceLighting: ["AI", "Random", "soft window light", "plain studio background", "warm indoor light", "overcast natural light", "simple dark background"],
    appearanceNotes: [""],
  };
  appearanceFieldIds.forEach((id) => {
    setValue(id, pickRandom(options[id] || [""]));
  });
  saveDraft();
}

function buildPlayerPayload() {
  return {
    createCompatiblePlayer: $("createPlayerProfile").checked,
    name: value("playerName") || currentUserName(),
    age: inferAge(value("playerAge")),
    gender: value("playerGender") || "Infer",
    ethnicity: value("playerEthnicity") || "Infer",
    notes: value("playerNotes"),
  };
}

function currentNamingYear() {
  const typed = Number.parseInt(value("nameCurrentYear"), 10);
  if (Number.isFinite(typed) && typed > 0) return typed;
  return new Date().getFullYear();
}

function estimatedBirthYear() {
  const age = inferAge(value("age"));
  if (!age) return "";
  return String(currentNamingYear() - age);
}

function updateEstimatedBirthYear() {
  const field = $("nameEstimatedBirthYear");
  if (!field) return;
  if ($("nameCurrentYear") && !value("nameCurrentYear")) $("nameCurrentYear").value = String(new Date().getFullYear());
  field.value = estimatedBirthYear();
}

function sliderMeaning(id, values) {
  const index = Math.max(0, Math.min(values.length - 1, Number.parseInt(value(id), 10) - 1 || 0));
  return values[index];
}

function buildNamePayload() {
  updateEstimatedBirthYear();
  return {
    modelSettings: modelSettingsForTask("names"),
    naming: {
      currentYear: currentNamingYear(),
      estimatedBirthYear: value("nameEstimatedBirthYear") || estimatedBirthYear(),
      birthCountry: value("nameBirthCountry"),
      heritage: value("nameHeritage"),
      region: value("nameRegion"),
      familyStyle: value("nameFamilyStyle") || "Infer",
      nameFeel: value("nameFeel") || "Infer",
      nameGenre: value("nameGenre") || "Infer",
      occupationBias: value("nameOccupationBias"),
      nameLength: sliderMeaning("nameLength", ["Short", "Mostly short", "Medium", "Mostly long", "Long"]),
      rarity: sliderMeaning("nameRarity", ["Common", "Mostly common", "Balanced", "Rare", "Very rare"]),
      aiCommonnessFilter: sliderMeaning("nameCommonnessFilter", ["Very familiar", "Somewhat familiar", "Balanced", "Uncommon", "Avoid AI tropes"]),
    },
    character: {
      currentName: value("kindroidName"),
      gender: value("gender") || "Infer",
      species: value("species") || "Infer",
      age: inferAge(value("age")) || value("age") || "Infer",
      apparentAge: value("apparentAge") || "Same as chronological age",
      currentCity: value("currentCity"),
      currentState: value("currentState"),
      currentCountry: value("currentCountry"),
      coreIdea: value("coreIdea"),
      genre: value("genre"),
      world: buildWorldPayload(),
      personality: value("personality"),
      dynamic: value("dynamic"),
      occupationHint: value("nameOccupationBias") || value("coreIdea") || value("genre"),
    },
    favorites: state.favoriteNames || [],
  };
}

function createApiError(message, details = {}) {
  const error = new Error(message || "API request failed");
  error.apiDetails = details;
  return error;
}

async function readApiJson(response, operation, fallbackMessage) {
  const text = await response.text().catch(() => "");
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text.slice(0, 2000) };
  }
  if (!response.ok) {
    throw createApiError(data.error || fallbackMessage, {
      operation,
      status: response.status,
      statusText: response.statusText,
      details: data.details || {},
      error: data.error || fallbackMessage,
      raw: data.raw || "",
      request: response.apiDiagnostics || {},
    });
  }
  return data;
}

function apiErrorReport(error, fallbackOperation = "API request") {
  const details = error?.apiDetails || {};
  const inner = details.details || {};
  const report = {
    operation: details.operation || inner.operation || fallbackOperation,
    message: error?.message || details.error || inner.message || "Unknown API error",
    status: details.status || inner.status || "",
    statusText: details.statusText || "",
    type: inner.type || "",
    code: inner.code || "",
    param: inner.param || "",
    reason: inner.reason || inner.outputReason || "",
    outputStatus: inner.outputStatus || "",
    outputTypes: inner.outputTypes || undefined,
    rawPreviewStart: inner.rawPreviewStart || "",
    rawPreviewEnd: inner.rawPreviewEnd || "",
    requestUrl: details.requestUrl || details.request?.requestUrl || "",
    pageUrl: details.pageUrl || details.request?.pageUrl || "",
    origin: details.origin || details.request?.origin || "",
    online: details.online,
    durationMs: details.durationMs || details.request?.durationMs || "",
    errorName: details.errorName || "",
    errorMessage: details.errorMessage || "",
    hint: details.hint || "",
    raw: details.raw || "",
  };
  Object.keys(report).forEach((key) => {
    if (report[key] === "" || report[key] === undefined || (Array.isArray(report[key]) && !report[key].length)) delete report[key];
  });
  return report;
}

function showApiError(error, fallbackOperation) {
  const report = apiErrorReport(error, fallbackOperation);
  lastApiErrorText = JSON.stringify(report, null, 2);
  $("apiErrorDetails").textContent = lastApiErrorText;
  $("apiErrorPanel").classList.remove("hidden");
}

function clearApiError() {
  lastApiErrorText = "";
  $("apiErrorDetails").textContent = "";
  $("apiErrorPanel").classList.add("hidden");
}

async function apiFetch(url, options = {}, operation = "API request") {
  const absoluteUrl = new URL(url, window.location.href).href;
  const startedAt = Date.now();
  try {
    const response = await fetch(url, options);
    response.apiDiagnostics = {
      operation,
      requestUrl: absoluteUrl,
      pageUrl: window.location.href,
      origin: window.location.origin,
      durationMs: Date.now() - startedAt,
    };
    return response;
  } catch (error) {
    throw createApiError(`Network request failed: ${error.message || "Failed to fetch"}`, {
      operation,
      requestUrl: absoluteUrl,
      pageUrl: window.location.href,
      origin: window.location.origin,
      online: navigator.onLine,
      durationMs: Date.now() - startedAt,
      errorName: error.name || "",
      errorMessage: error.message || "",
      hint: "The browser could not reach the KinForge server. Check that the local server is running on the same localhost port as this page, then open /api/diagnostics if the server is reachable.",
    });
  }
}

async function generateKindroidWithAi(payload = buildGeneratorPayload()) {
  const response = await apiFetch("/api/generate-kindroid", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }, "Generate Kindroid");
  const data = await readApiJson(response, "Generate Kindroid", "AI generation failed");
  if (!data.output) throw createApiError("AI generation returned no output", { operation: "Generate Kindroid" });
  return { output: data.output, model: data.model || "OpenAI", personalityConstruction: data.personalityConstruction, journalEntries: data.journalEntries || [] };
}

async function generateSurpriseWithAi() {
  const response = await apiFetch("/api/surprise", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildGeneratorPayload({ aiTask: "surprise" })),
  }, "Surprise Me");
  const data = await readApiJson(response, "Surprise Me", "AI surprise failed");
  if (!data.surprise) throw createApiError("AI surprise returned no fields", { operation: "Surprise Me" });
  return { surprise: data.surprise, model: data.model || "OpenAI" };
}

async function inferKinTextWithAi(importText) {
  const creationTypeHint = value("kinImportCreationTypeHint");
  const response = await apiFetch("/api/import-kin-text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      modelSettings: modelSettingsForTask("import"),
      importText,
      creationTypeHint,
      currentPayload: buildGeneratorPayload({ aiTask: "import" }),
      fieldLabels,
    }),
  }, "Import Kin Text");
  const data = await readApiJson(response, "Import Kin Text", "Kin text import failed");
  if (!data.import?.fields) throw createApiError("Import returned no inferred fields", { operation: "Import Kin Text" });
  return { importData: data.import, model: data.model || "OpenAI" };
}

async function generateInterviewQuestionsWithAi() {
  const response = await apiFetch("/api/generate-interview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      modelSettings: modelSettingsForTask("import"),
      payload: buildGeneratorPayload({ aiTask: "import" }),
      existingQuestions: fallbackInterviewQuestions(),
      currentAnswers: { ...state.answers },
      maxQuestions: 20,
      coreQuestionTarget: 8,
      maxFollowUpsPerCore: 3,
    }),
  }, "Build AI Interview");
  const data = await readApiJson(response, "Build AI Interview", "AI interview generation failed");
  if (!data.interview?.questions?.length) throw createApiError("AI interview returned no questions", { operation: "Build AI Interview" });
  return { questions: data.interview.questions, notes: data.interview.notes || [], model: data.model || "OpenAI" };
}

async function rerollSectionWithAi(sectionKey) {
  const response = await apiFetch("/api/reroll-section", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sectionKey,
      sectionLabel: sectionMeta[sectionKey]?.label || sectionKey,
      maxCharacters: sectionMeta[sectionKey]?.max || 900,
      pairedKeyphrasesLabel: journalPairs[sectionKey] ? sectionMeta[journalPairs[sectionKey]].label : "",
      modelSettings: modelSettingsForTask("reroll"),
      payload: buildGeneratorPayload({ aiTask: "reroll" }),
      sections: getSectionValues(),
    }),
  }, `Reroll ${sectionMeta[sectionKey]?.label || sectionKey}`);
  const data = await readApiJson(response, `Reroll ${sectionMeta[sectionKey]?.label || sectionKey}`, "Section reroll failed");
  if (!data.section) throw createApiError("Section reroll returned no text", { operation: "Reroll Section" });
  return { section: data.section, model: data.model || "OpenAI", personalityConstruction: data.personalityConstruction };
}

async function regenerateFieldWithAi(fieldId) {
  const response = await apiFetch("/api/regenerate-field", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fieldId,
      fieldLabel: fieldLabels[fieldId] || fieldId,
      currentValue: value(fieldId),
      modelSettings: modelSettingsForTask("field"),
      payload: buildGeneratorPayload({ aiTask: "field" }),
      sections: getSectionValues(),
    }),
  }, `Regenerate ${fieldLabels[fieldId] || fieldId}`);
  const data = await readApiJson(response, `Regenerate ${fieldLabels[fieldId] || fieldId}`, "Field regeneration failed");
  if (data.value === undefined) throw createApiError("Field regeneration returned no value", { operation: "Regenerate Field" });
  return { value: String(data.value || ""), model: data.model || "OpenAI" };
}

async function generateSceneVariantsWithAi() {
  const response = await apiFetch("/api/scene-variants", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      modelSettings: modelSettingsForTask("scene"),
      payload: buildGeneratorPayload({ aiTask: "scene" }),
      sections: getSectionValues(),
    }),
  }, "Scene Variants");
  const data = await readApiJson(response, "Scene Variants", "Scene variants failed");
  if (!data.variants) throw createApiError("Scene variants returned no options", { operation: "Scene Variants" });
  return { variants: data.variants, model: data.model || "OpenAI" };
}

function buildGreetingStudioPayload() {
  const issues = state.greetingReview?.issues || [];
  const decisions = state.greetingReview?.decisions || {};
  const reviewedSuggestions = issues.map((issue, index) => ({
    ...issue,
    decision: decisions[index] || "pending",
  }));
  return {
    modelSettings: modelSettingsForTask("greeting"),
    payload: buildGeneratorPayload({ aiTask: "greeting" }),
    sections: getSectionValues(),
    currentGreeting: value("openingGreetingOutput"),
    brief: value("greetingStudioBrief"),
    style: value("greetingStudioStyle") || "Natural first contact",
    reviewedSuggestions,
    acceptedSuggestions: reviewedSuggestions.filter((issue) => issue.decision === "accepted"),
    rejectedSuggestions: reviewedSuggestions.filter((issue) => issue.decision === "rejected"),
  };
}

async function rewriteGreetingWithAi() {
  const response = await apiFetch("/api/greeting-studio/rewrite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildGreetingStudioPayload()),
  }, "Scene Studio Rewrite");
  const data = await readApiJson(response, "Scene Studio Rewrite", "Scene rewrite failed");
  if (!data.greeting) throw createApiError("Scene rewrite returned no text", { operation: "Scene Studio Rewrite" });
  return { greeting: data.greeting, model: data.model || "OpenAI" };
}

async function checkGreetingWithAi() {
  const response = await apiFetch("/api/greeting-studio/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildGreetingStudioPayload()),
  }, "Scene Studio Check");
  const data = await readApiJson(response, "Scene Studio Check", "Scene check failed");
  if (!data.report) throw createApiError("Scene check returned no report", { operation: "Scene Studio Check" });
  return { report: data.report, model: data.model || "OpenAI" };
}

async function checkConsistencyWithAi() {
  const response = await apiFetch("/api/check-continuity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildContinuityPayload()),
  }, "Check Consistency");
  const data = await readApiJson(response, "Check Consistency", "Continuity check failed");
  if (!data.report) throw createApiError("Continuity check returned no report", { operation: "Check Consistency" });
  return { report: data.report, model: data.model || "OpenAI" };
}

async function inferJournalsWithAi(mode = "profile") {
  const operation = mode === "active" ? "Optimize Journal" : mode === "audit" ? "Audit Journals" : "Infer Journals";
  const response = await apiFetch("/api/infer-journals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildJournalInferencePayload(mode)),
  }, operation);
  const data = await readApiJson(response, operation, "Journal inference failed");
  if (!data.journals?.entries) throw createApiError("Journal inference returned no entries", { operation: "Infer Journals" });
  return { entries: data.journals.entries, notes: data.journals.notes || [], model: data.model || "OpenAI" };
}

async function generateNamesWithAi() {
  const response = await apiFetch("/api/generate-names", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildNamePayload()),
  }, "Generate Names");
  const data = await readApiJson(response, "Generate Names", "Name generation failed");
  if (!data.names?.options) throw createApiError("Name generation returned no options", { operation: "Generate Names" });
  return { names: data.names.options, notes: data.names.notes || [], model: data.model || "OpenAI" };
}

async function generateImageWithAi() {
  const imagePrompt = value("imageStudioFinalPromptOutput") || buildAndRenderImageStudioPrompt();
  if (!imagePrompt) throw createApiError("Build an image prompt before generating", { operation: "Image Generation" });
  const response = await apiFetch("/api/generate-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      modelSettings: modelSettingsForTask("image"),
      imagePrompt,
      imageStudio: buildImageStudioSettings(),
      profile: getCombinedOutput(),
      payload: buildGeneratorPayload({ aiTask: "image" }),
    }),
  }, "Image Generation");
  const data = await readApiJson(response, "Image Generation", "Image generation failed");
  if (!data.image) throw createApiError("Image generation returned no image", { operation: "Image Generation" });
  return data;
}

async function pushKindroidWithApi(apiKey, payload) {
  const response = await apiFetch("/api/kindroid/update-info", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey, payload }),
  }, "Kindroid Update");
  const data = await readApiJson(response, "Kindroid Update", "Kindroid update failed");
  if (!data.ok) throw createApiError("Kindroid update did not return ok", { operation: "Kindroid Update" });
  return data.result || data;
}

async function sendKindroidChatBreakWithApi(apiKey, payload) {
  const response = await apiFetch("/api/kindroid/chat-break", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey, payload }),
  }, "Kindroid Chat Break");
  const data = await readApiJson(response, "Kindroid Chat Break", "Kindroid chat break failed");
  if (!data.ok) throw createApiError("Kindroid chat break did not return ok", { operation: "Kindroid Chat Break" });
  return data.result || data;
}

async function fetchKindroidChatWithApi(apiKey, payload) {
  const response = await apiFetch("/api/kindroid/get-chat-messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey, ...payload }),
  }, "Kindroid Chat History");
  const data = await readApiJson(response, "Kindroid Chat History", "Kindroid chat history fetch failed");
  if (!data.ok) throw createApiError("Kindroid chat history did not return ok", { operation: "Kindroid Chat History" });
  return data.result || data;
}

async function analyzeKindroidChatWithAi() {
  const response = await apiFetch("/api/kindroid/analyze-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildKindroidChatAnalysisPayload()),
  }, "Analyze Kindroid Chat");
  const data = await readApiJson(response, "Analyze Kindroid Chat", "Kindroid chat analysis failed");
  if (!data.analysis) throw createApiError("Kindroid chat analysis returned no analysis", { operation: "Analyze Kindroid Chat" });
  return { analysis: data.analysis, model: data.model || "OpenAI" };
}

async function encryptLocalSecret(valueText, purpose = "localSecret") {
  const response = await apiFetch("/api/local-secret/encrypt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value: valueText, purpose }),
  }, "Encrypt Local Secret");
  const data = await readApiJson(response, "Encrypt Local Secret", "Local secret encryption failed");
  return data.blob;
}

async function decryptLocalSecret(blob, purpose = "localSecret") {
  const response = await apiFetch("/api/local-secret/decrypt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blob, purpose }),
  }, "Unlock Local Secret");
  const data = await readApiJson(response, "Unlock Local Secret", "Local secret unlock failed");
  if (data.upgradedBlob && purpose === "kindroidApiKey") {
    localStorage.setItem(kindroidApiKeyStorageKey, JSON.stringify(data.upgradedBlob));
  }
  return data.value || "";
}

function buildBackstoryBody(p) {
  const preferences = buildConcretePreferences(p);
  const backstorySections = [
    `Core Identity: ${buildCoreIdentity(p)}`,
    p.occupation ? `Occupation: ${compact(p.occupation, 120)}` : "",
    p.secondaryOccupation ? `Secondary Work: ${compact(p.secondaryOccupation, 150)}` : "",
    p.education ? `Education: ${compact(p.education, 150)}` : "",
    `Archetype: ${compact(buildArchetype(p), 92)}`,
    `Personality: ${compact(buildPersonalitySummary(p), 300)}`,
    `Conflict: ${compact(buildFallbackConflict(p), 400)}`,
    `Dynamic with ${p.userName}: ${compact(buildFallbackDynamic(p), 300)}`,
    `Intimacy: ${compact(buildFallbackIntimacy(p), 300)}`,
    `Texture: ${compact(buildTextureDetails(p), 300)}`,
    `Likes: ${preferences.likes}`,
    `Dislikes: ${preferences.dislikes}`,
    `Aesthetic: ${compact(buildAesthetic(p), 150)}`,
    `Fast Facts: ${compact(buildFastFacts(p), 150)}`,
    `Speech Patterns: ${compact(p.voice, 150)}`,
    `Personality Framework: ${buildPersonalityFramework(p)}`,
    `Current: ${compact(buildCurrent(p), 210)}`,
  ];
  return backstorySections.filter(Boolean).join("\n");
}

function buildCompactFallbackPersonality(p, richPersonality) {
  const units = [];
  const add = (tag, values) => units.push({ tag, properties: Object.entries(values).filter(([, value]) => value && value !== "Infer").map(([key, value]) => ({ key, value })) });
  const richLines = Object.fromEntries(richPersonality.split("\n").map(line => {
    const colon = line.indexOf(":");
    return [line.slice(0, colon), line.slice(colon + 1).trim()];
  }));
  const clauses = text => text.split(`${p.name} `).filter(Boolean).map(value => value.replace(/\.$/, "").trim());
  if (isWorldKin(p) || isMultiCharacterKin(p)) {
    add("ID", { Name: p.name, Role: p.creationType });
    add("Beh", isWorldKin(p) ? { Narration: p.worldNarrationNotes || "Portray-world-and-NPCs|Preserve-player-agency", Knowledge: "Keep-NPC-knowledge-distinct" } : { Members: p.ensembleMembers, Voices: "Separate-speakers,motives,memories,boundaries" });
  } else {
    add("ID", { Name: p.name, Age: String(p.age), Gender: p.gender, Species: p.species, Home: p.currentLocation, Role: p.occupation, SideWork: p.secondaryOccupation, Edu: p.education });
    add("P", { Core: p.personality, Drive: richLines.Conflict });
    add("Beh", Object.fromEntries(clauses(buildBehavioralTendencies(p)).slice(0, 3).map((value, i) => [`Pattern${i + 1}`, value])));
    add("Decide", Object.fromEntries(clauses(buildDecisionStyle(p)).slice(0, 2).map((value, i) => [`Method${i + 1}`, value])));
  }
  add("Rel", { [p.userName]: richLines[`Dynamic with ${p.userName}`] });
  if (p.intimacy || (p.intimacyOrientation && p.intimacyOrientation !== "Infer")) add("Int", { Preferences: richLines.Intimacy });
  add("Qrk", { Habit: clauses(buildDistinctiveHabits(p))[0] });
  add("Voice", { Pattern: p.voice });
  add("Likes", { Likes: richLines.Likes, Dislikes: richLines.Dislikes });
  const framework = buildPersonalityFramework(p).replace(/^Big Five\s*/, "").replace(/Enneagram\s+/g, "").replace(/\s+attachment/g, "").replace(/MBTI\s+/g, "").replace(/\s+as flavor/g, "-flavor").replace(/Tritype\s+/g, "").replace(/\.$/, "");
  units.push({ tag: "Framework", properties: framework.split(/;\s*/).map(value => ({ key: "", value })) });
  return CompactPersonality.serialize(units, sectionMeta.backstory.max);
}

function generateKindroid() {
  const p = buildProfile();
  const tagline = `Tagline\n${buildTagline(p)}`;
  const keywords = `Keywords\n${buildKeywords(p)}`;
  const premise = `Story Premise\n${buildStoryPremise(p)}`;
  const behavior = `Behavioral Tendencies\n${buildBehavioralTendencies(p)}\n\nBehavioral Tendencies Keyphrases\n${buildJournalKeyphrases(p, "behavior")}`;
  const routine = `Daily Routine\n${buildDailyRoutine(p)}\n\nDaily Routine Keyphrases\n${buildJournalKeyphrases(p, "routine")}`;
  const contradictions = `Contradictions\n${buildContradictions(p)}\n\nContradictions Keyphrases\n${buildJournalKeyphrases(p, "contradictions")}`;
  const decision = `Decision-Making Style\n${buildDecisionStyle(p)}\n\nDecision-Making Style Keyphrases\n${buildJournalKeyphrases(p, "decision")}`;
  const habits = `Distinctive Habits\n${buildDistinctiveHabits(p)}\n\nDistinctive Habits Keyphrases\n${buildJournalKeyphrases(p, "habits")}`;
  const localKnowledge = `Local Knowledge\n${buildLocalKnowledge(p)}\n\nLocal Knowledge Keyphrases\n${buildJournalKeyphrases(p, "localKnowledge")}`;
  const richPersonality = buildBackstoryBody(p);
  const compactPersonality = buildCompactFallbackPersonality(p, richPersonality);
  if (!isSectionLocked("backstory")) state.personalityConstruction = { version: 1, richPersonality, units: compactPersonality.units, omitted: compactPersonality.omitted, sourceCharacters: richPersonality.length, finalCharacters: compactPersonality.text.length, model: "offline" };
  const backstory = `Personality\n${compactPersonality.text}`;
  const boundaryNote = p.boundaries ? ` Avoid: ${p.boundaries}.` : "";
  const rdBase = isWorldKin(p)
    ? `Portray the world, scene narration, and NPCs. Label NPC speakers clearly. Never act for ${p.userName}.`
    : isMultiCharacterKin(p)
      ? `Portray up to three distinct adults. Label speakers clearly and keep voices separate. Never act for ${p.userName}.`
      : `Speaks in medium sentences, 1-3 paragraphs, under 1200 characters. Use ${p.tonePack} tone. Show action through grounded detail. Avoid "object + abstract emotion" constructions.`;
  const rd = compact(`*Response Directive*\n${rdBase}${boundaryNote}`, 250);
  const fallbackMemories = buildFallbackMemories(p);
  const kms = [`*Key Memories*`, ...fallbackMemories].join("\n");
  const relation = relationshipConstraint(p);
  const exampleRules = isWorldKin(p)
    ? `#Rules: act as narrator/world/NPCs; label every NPC speaker; reveal setting through action; prompt choices without choosing for ${p.userName}; advise creating journals for important NPCs`
    : isMultiCharacterKin(p)
      ? `#Rules: keep each member's voice, motive, and boundaries separate; label speakers; use one or two active speakers per reply; never blend attraction or memories; never speak for ${p.userName}`
      : `#Rules: obey ${p.relationshipPreset} boundaries; show competence before vulnerability; escalate through consent and context; avoid premise summaries; never speak for ${p.userName}`;
  const exampleSample = isWorldKin(p)
    ? `*A clerk looks up from a ledger while rain ticks against the front window.* Clerk: "If you need the back road, ask before the bridge closes. If you need trouble, keep walking."`
    : isMultiCharacterKin(p)
      ? `*One member checks the door while another keeps their eyes on ${p.userName}.* ${p.name}: "Answer the practical question first. Then we can argue about whose plan is worse."`
      : `*${p.name} pauses beside the nearest practical problem, one hand still resting on the paperwork.* ${relation.exampleLine}`;
  const example = compact(
    [
      "*Example Message*",
      `#Tone: ${p.tonePack.toLowerCase()}, ${p.chemistry.toLowerCase()}, relationship-aware`,
      `#Speech: conversational, concrete, ${p.voice.replace(/\.$/, "")}`,
      "#Length: 1-3 paragraphs, 350-900 characters, medium sentences",
      exampleRules,
      exampleSample,
    ].join("\n"),
    sectionMeta.example.max,
  );
  const opening = compact(
    buildOpeningGreeting(p),
    sectionMeta.opening.max,
  );
  const relationship = compact(buildPlayerRelationship(p), 350);
  const visual = buildVisualSpec(p);
  const avatar = compact(
    [
      `Avatar Description (AD)`,
      `Age: ${p.apparentAge || p.age}`,
      `Gender: ${p.gender}`,
      `Ethnicity/Race: ${visual.ethnicity || "User-defined"}`,
      `Skin: ${visual.skin}`,
      `Hair: ${visual.hair}`,
      `Eyes: ${visual.eyes}`,
      `Face: ${visual.faceDetail}`,
      `Build: ${visual.build}`,
      `Details: ${p.appearance?.distinctiveFeatures || buildDetails(p)}`,
      `Vibe: ${compact(p.coreIdea, 110)}`,
    ].join("\n"),
    600,
  );

  const portrait = `Portrait Prompt\n${tidyVisualBody(visual.portrait, 180)}`;
  const physical = compact(`Physical Description\n${visual.physical}`, 520);
  const face = `Face Detail\n${tidyVisualBody(visual.face, 180)}`;
  const galleryDinner = `Gallery Prompt - Dinner\n${buildGalleryPrompt(p, "dinner")}`;
  const galleryOutdoor = `Gallery Prompt - Outdoor\n${buildGalleryPrompt(p, "outdoor")}`;
  const galleryIntimate = `Gallery Prompt - Intimate\n${buildGalleryPrompt(p, "intimate")}`;
  const galleryPublic = `Gallery Prompt - Public\n${buildGalleryPrompt(p, "public")}`;
  const galleryCasual = `Gallery Prompt - Casual\n${buildGalleryPrompt(p, "casual")}`;

  const player = $("createPlayerProfile").checked ? `\n\n${buildPlayerProfile(p)}` : "";

  return `${tagline}\n\n${keywords}\n\n${premise}\n\n${behavior}\n\n${routine}\n\n${contradictions}\n\n${decision}\n\n${habits}\n\n${localKnowledge}\n\n${backstory}\n\n${rd}\n\n${kms}\n\n${example}\n\n${opening}\n\n${relationship}\n\n${avatar}\n\n${portrait}\n\n${physical}\n\n${face}\n\n${galleryDinner}\n\n${galleryOutdoor}\n\n${galleryIntimate}\n\n${galleryPublic}\n\n${galleryCasual}${player}`;
}

function parseOutputSections(text) {
  const output = String(text || "").trim();
  const headings = [
    ["tagline", /^\s*\*?Tagline\*?:?.*$/im],
    ["keywords", /^\s*\*?Keywords\*?:?.*$/im],
    ["premise", /^\s*\*?Story Premise\*?:?.*$/im],
    ["behavior", /^\s*\*?Behavioral Tendencies\*?:?\s*$/im],
    ["behaviorKeyphrases", /^\s*\*?Behavioral Tendencies Keyphrases\*?:?\s*$/im],
    ["routine", /^\s*\*?Daily Routine\*?:?\s*$/im],
    ["routineKeyphrases", /^\s*\*?Daily Routine Keyphrases\*?:?\s*$/im],
    ["contradictions", /^\s*\*?Contradictions\*?:?\s*$/im],
    ["contradictionsKeyphrases", /^\s*\*?Contradictions Keyphrases\*?:?\s*$/im],
    ["decision", /^\s*\*?Decision-Making Style\*?:?\s*$/im],
    ["decisionKeyphrases", /^\s*\*?Decision-Making Style Keyphrases\*?:?\s*$/im],
    ["habits", /^\s*\*?Distinctive Habits\*?:?\s*$/im],
    ["habitsKeyphrases", /^\s*\*?Distinctive Habits Keyphrases\*?:?\s*$/im],
    ["localKnowledge", /^\s*\*?Local Knowledge\*?:?\s*$/im],
    ["localKnowledgeKeyphrases", /^\s*\*?Local Knowledge Keyphrases\*?:?\s*$/im],
    ["backstory", /^[ \t]*\*{0,2}(?:Personality|Backstory)\*{0,2}:?[ \t]*\r?$/im],
    ["rd", /^\s*\*?Response Directive\*?:?.*$/im],
    ["kms", /^\s*\*?Key Memories\*?:?.*$/im],
    ["example", /^\s*\*?Example Message\*?:?.*$/im],
    ["opening", /^\s*\*?(?:Scene Setting|Opening Greeting)\*?:?.*$/im],
    ["relationship", /^\s*\*?(?:Relationship Context|Player Relationship)\*?:?.*$/im],
    ["avatar", /^\s*\*?Avatar Description(?:\s*\(AD\))?\*?:?.*$/im],
    ["portrait", /^\s*\*?Portrait Prompt\*?:?.*$/im],
    ["physical", /^\s*\*?Physical Description\*?:?.*$/im],
    ["face", /^\s*\*?Face Detail\*?:?.*$/im],
    ["galleryDinner", /^\s*\*?Gallery Prompt - Dinner\*?:?.*$/im],
    ["galleryOutdoor", /^\s*\*?Gallery Prompt - Outdoor\*?:?.*$/im],
    ["galleryIntimate", /^\s*\*?Gallery Prompt - Intimate\*?:?.*$/im],
    ["galleryPublic", /^\s*\*?Gallery Prompt - Public\*?:?.*$/im],
    ["galleryCasual", /^\s*\*?Gallery Prompt - Casual\*?:?.*$/im],
    ["player", /^\s*\*?(?:User Persona|Player Profile)\*?:?.*$/im],
  ]
    .map(([key, pattern]) => {
      const match = output.match(pattern);
      return match ? { key, index: match.index } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.index - b.index);

  const sections = { tagline: "", keywords: "", premise: "", behavior: "", behaviorKeyphrases: "", routine: "", routineKeyphrases: "", contradictions: "", contradictionsKeyphrases: "", decision: "", decisionKeyphrases: "", habits: "", habitsKeyphrases: "", localKnowledge: "", localKnowledgeKeyphrases: "", backstory: "", rd: "", kms: "", example: "", opening: "", relationship: "", avatar: "", portrait: "", physical: "", face: "", galleryDinner: "", galleryOutdoor: "", galleryIntimate: "", galleryPublic: "", galleryCasual: "", player: "" };
  headings.forEach((heading, index) => {
    const next = headings[index + 1]?.index ?? output.length;
    sections[heading.key] = stripSectionLabel(output.slice(heading.index, next), heading.key);
  });
  return sections;
}

function stripSectionLabel(text, sectionKey) {
  const label = sectionMeta[sectionKey]?.label;
  let clean = String(text || "").trim();
  if (!label) return clean;
  if (sectionKey === "avatar") {
    clean = clean.replace(/^\s*\*?Avatar Description(?:\s*\(AD\))?\*?:?\s*/i, "");
  }
  if (sectionKey === "backstory") {
    return clean.replace(/^[ \t]*\*{0,2}(?:Personality|Backstory)\*{0,2}:?[ \t]*(?:\r?\n|$)/i, "").trim();
  }
  if (sectionKey === "opening") {
    clean = clean.replace(/^\s*\*?Opening Greeting\*?:?\s*/i, "");
  }
  if (sectionKey === "relationship") {
    clean = clean.replace(/^\s*\*?Player Relationship\*?:?\s*/i, "");
  }
  if (sectionKey === "player") {
    clean = clean.replace(/^\s*\*?Player Profile\*?:?\s*/i, "");
  }
  return clean
    .replace(new RegExp(`^\\s*\\*?${label}\\*?:?\\s*`, "i"), "")
    .trim();
}

function fillMissingSections(sections) {
  const p = buildProfile();
  if (!sections.tagline) {
    sections.tagline = buildTagline(p);
  }
  if (!sections.keywords) {
    sections.keywords = buildKeywords(p);
  }
  if (!sections.premise) {
    sections.premise = buildStoryPremise(p);
  }
  if (!sections.behavior) {
    sections.behavior = buildBehavioralTendencies(p);
  }
  if (!sections.behaviorKeyphrases) {
    sections.behaviorKeyphrases = buildJournalKeyphrases(p, "behavior");
  }
  if (!sections.routine) {
    sections.routine = buildDailyRoutine(p);
  }
  if (!sections.routineKeyphrases) {
    sections.routineKeyphrases = buildJournalKeyphrases(p, "routine");
  }
  if (!sections.contradictions) {
    sections.contradictions = buildContradictions(p);
  }
  if (!sections.contradictionsKeyphrases) {
    sections.contradictionsKeyphrases = buildJournalKeyphrases(p, "contradictions");
  }
  if (!sections.decision) {
    sections.decision = buildDecisionStyle(p);
  }
  if (!sections.decisionKeyphrases) {
    sections.decisionKeyphrases = buildJournalKeyphrases(p, "decision");
  }
  if (!sections.habits) {
    sections.habits = buildDistinctiveHabits(p);
  }
  if (!sections.habitsKeyphrases) {
    sections.habitsKeyphrases = buildJournalKeyphrases(p, "habits");
  }
  if (!sections.localKnowledge) {
    sections.localKnowledge = buildLocalKnowledge(p);
  }
  if (!sections.localKnowledgeKeyphrases) {
    sections.localKnowledgeKeyphrases = buildJournalKeyphrases(p, "localKnowledge");
  }
  if (!sections.example) {
    const relation = relationshipConstraint(p);
    sections.example = compact(
      [
        `#Tone: ${p.tonePack.toLowerCase()}, ${p.chemistry.toLowerCase()}, relationship-aware`,
        `#Speech: conversational, concrete, ${p.voice.replace(/\.$/, "")}`,
        "#Length: 1-3 paragraphs, 350-900 characters, medium sentences",
        `#Rules: obey ${p.relationshipPreset} boundaries; show competence before vulnerability; escalate through consent and context; avoid premise summaries; never speak for ${p.userName}`,
        `*${p.name} looks up, attention sharpening around ${p.userName}'s arrival.* ${relation.exampleLine}`,
      ].join("\n"),
      sectionMeta.example.max,
    );
  }
  if (!sections.opening) {
    sections.opening = buildOpeningGreeting(p);
  }
  if (!sections.relationship) {
    sections.relationship = buildPlayerRelationship(p);
  }
  if (!sections.portrait) {
    sections.portrait = tidyVisualBody(buildVisualSpec(p).portrait, 180);
  }
  if (!sections.physical) {
    sections.physical = compact(buildVisualSpec(p).physical, 520);
  }
  if (!sections.face) {
    sections.face = tidyVisualBody(buildVisualSpec(p).face, 180);
  }
  sections.portrait = normalizeVisualSection(sections.portrait, "Portrait Prompt", 180, buildVisualSpec(p).portrait, "portrait", sections.avatar);
  sections.physical = normalizeVisualSection(sections.physical, "Physical Description", 520, buildVisualSpec(p).physical, "physical", sections.avatar);
  sections.face = normalizeVisualSection(sections.face, "Face Detail", 180, buildVisualSpec(p).face, "face", sections.avatar);
  if (!sections.galleryDinner) sections.galleryDinner = buildGalleryPrompt(p, "dinner");
  if (!sections.galleryOutdoor) sections.galleryOutdoor = buildGalleryPrompt(p, "outdoor");
  if (!sections.galleryIntimate) sections.galleryIntimate = buildGalleryPrompt(p, "intimate");
  if (!sections.galleryPublic) sections.galleryPublic = buildGalleryPrompt(p, "public");
  if (!sections.galleryCasual) sections.galleryCasual = buildGalleryPrompt(p, "casual");
  if ($("createPlayerProfile").checked && !sections.player) {
    sections.player = stripSectionLabel(buildPlayerProfile(p), "player");
  }
  return sections;
}

function oneLine(text, max = 180) {
  return compact(String(text || "").replace(/\s+/g, " ").trim(), max);
}

function backstoryPart(backstory, label) {
  const source = String(backstory || "");
  const stack = CompactPersonality.fields(source);
  if (Object.keys(stack).length) {
    const tagText = tag => Object.entries(stack[tag] || {}).map(([key, value]) => `${key}:${value}`).join("; ");
    const values = {
      "Core Identity": Object.values(stack.ID || {}).join(", "), Occupation: stack.ID?.Role,
      "Secondary Work": stack.ID?.SideWork, Education: stack.ID?.Edu, Personality: tagText("P"),
      Conflict: stack.P?.Drive || stack.P?.Flaw, Intimacy: tagText("Int"),
      "Speech Patterns": tagText("Voice"), Current: tagText("NOW"), Likes: tagText("Likes"),
    };
    if (/^Dynamic/.test(label)) return tagText("Rel");
    return values[label] || "";
  }
  const labels = [
    "Core Identity",
    "Occupation",
    "Secondary Work",
    "Education",
    "Archetype",
    "Personality",
    "Conflict",
    "Dynamic with Sean",
    "Dynamic with user",
    "Dynamic with {username}",
    "Intimacy",
    "Texture",
    "Likes",
    "Dislikes",
    "Aesthetic",
    "Fast Facts",
    "Speech Patterns",
    "Current",
  ];
  const escaped = labels.map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const pattern = new RegExp(`(?:^|\\n)\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:?\\s*([\\s\\S]*?)(?=\\n\\s*(?:${escaped})\\s*:?|$)`, "i");
  return oneLine(source.match(pattern)?.[1] || "", 260);
}

function inferNameFromSections(sections) {
  const name = CompactPersonality.fields(sections.backstory).ID?.Name;
  if (name) return name;
  const core = backstoryPart(sections.backstory, "Core Identity") || sections.backstory;
  const match = core.match(/\b([A-Z][a-zA-Z'-]{1,28})\b/);
  return match?.[1] || "";
}

function inferAgeFromSections(sections) {
  const age = CompactPersonality.fields(sections.backstory).ID?.Age;
  if (age) return age;
  const text = `${backstoryPart(sections.backstory, "Core Identity")} ${sections.avatar}`;
  const match = text.match(/\b(?:age|aged)?\s*(\d{2})\b/i);
  return match?.[1] || "";
}

function inferGenderFromSections(sections) {
  const gender = CompactPersonality.fields(sections.backstory).ID?.Gender;
  if (gender) return gender.toLowerCase();
  const text = `${backstoryPart(sections.backstory, "Core Identity")} ${sections.avatar}`.toLowerCase();
  if (/\bwoman|female\b/.test(text)) return "woman";
  if (/\bman|male\b/.test(text)) return "man";
  if (/\bnonbinary|non-binary\b/.test(text)) return "nonbinary";
  return "";
}

function generatedFieldBackfill(sections) {
  const personalityText = backstoryPart(sections.backstory, "Personality");
  const stack = CompactPersonality.fields(sections.backstory);
  const framework = Object.values(stack.Framework || {}).join("; ").replace(/\b(Lawful|Neutral|Chaotic|True)-(Good|Neutral|Evil)\b/gi, "$1 $2") || String(sections.backstory || "").match(/(?:^|\n)[ \t]*Personality Framework\s*:\s*([^\n]*)/i)?.[1] || "";
  const typeText = `${framework} ${personalityText}`;
  const enneagram = framework.match(/\b(?:Enneagram\s+)?([1-9])(w[1-9])\b/i) || framework.match(/\bEnneagram\s+([1-9])\b/i);
  const conflict = backstoryPart(sections.backstory, "Conflict");
  const coreIdentity = backstoryPart(sections.backstory, "Core Identity");
  const occupationDetails = inferOccupationDetailsFromText(`${coreIdentity} ${backstoryPart(sections.backstory, "Occupation")} ${backstoryPart(sections.backstory, "Secondary Work")} ${backstoryPart(sections.backstory, "Education")} ${sections.premise} ${sections.routine} ${sections.kms}`);
  const locationDetails = inferLocationDetailsFromText(`${sections.premise} ${sections.backstory} ${sections.localKnowledge} ${sections.opening} ${sections.galleryPublic}`);
  const archetype = backstoryPart(sections.backstory, "Archetype");
  const texture = backstoryPart(sections.backstory, "Texture");
  const speech = backstoryPart(sections.backstory, "Speech Patterns");
  const dynamic = backstoryPart(sections.backstory, "Dynamic with user") || backstoryPart(sections.backstory, "Dynamic with Sean") || sections.relationship;
  const intimacy = backstoryPart(sections.backstory, "Intimacy");
  return {
    kindroidName: inferNameFromSections(sections),
    gender: inferGenderFromSections(sections),
    age: inferAgeFromSections(sections),
    currentCity: locationDetails.currentCity,
    currentState: locationDetails.currentState,
    currentCountry: locationDetails.currentCountry,
    coreIdea: oneLine([coreIdentity, archetype, conflict].filter(Boolean).join(" "), 420),
    occupation: stack.ID?.Role || occupationDetails.occupation,
    secondaryOccupation: stack.ID?.SideWork || occupationDetails.secondaryOccupation,
    education: stack.ID?.Edu || occupationDetails.education,
    personality: oneLine(personalityText || sections.behavior, 360),
    dynamic: oneLine(dynamic, 160),
    intimacy: oneLine(intimacy, 180),
    playerNotes: oneLine(sections.player, 220),
    appearanceNotes: oneLine(sections.physical || sections.avatar, 240),
    distinctiveFeatures: oneLine(sections.face, 160),
    appearanceLighting: /background|light|portrait/i.test(sections.portrait) ? oneLine(sections.portrait, 120) : "",
    mbti: typeText.match(/\b(?:INTJ|INFJ|ENTP|ENFP|ISTP|ISFJ|ESTJ|ESFP|INTP|INFP|ENTJ|ENFJ|ISTJ|ISFP|ESTP|ESFJ)\b/)?.[0] || "",
    tritype: typeText.match(/\b[1-9]{3}\b/)?.[0] || "",
    enneagramType: enneagram?.[1] || "",
    enneagramWing: enneagram?.[2]?.toLowerCase() || "",
    attachmentStyle: optionValueForText("attachmentStyle", framework.match(/\b(Fearful-Avoidant|Secure|Anxious|Avoidant)\b/i)?.[1] || ""),
    moralAlignment: optionValueForText("moralAlignment", framework.match(/\b(?:Lawful Good|Neutral Good|Chaotic Good|Lawful Neutral|True Neutral|Chaotic Neutral|Lawful Evil|Neutral Evil|Chaotic Evil)\b/i)?.[0] || ""),
    boundaries: value("boundaries"),
    // These interview answers help fallback generation and future rerolls stay close to the edited character.
    why: oneLine(personalityText || conflict, 260),
    wound: oneLine((sections.kms || "").split("\n")[0] || conflict, 260),
    dream: oneLine((sections.kms || "").split("\n")[1] || backstoryPart(sections.backstory, "Current"), 260),
    complication: oneLine((sections.kms || "").split("\n")[2] || sections.contradictions, 260),
    texture: oneLine(texture || sections.routine || sections.localKnowledge, 260),
    voice: oneLine(speech || sections.example, 260),
  };
}

function avatarPart(avatar, label) {
  const match = String(avatar || "").match(new RegExp(`${label}\\s*:\\s*([^\\n]+)`, "i"));
  return oneLine(match?.[1] || "", 120);
}

function optionValueForText(id, text) {
  const field = $(id);
  if (!field || field.tagName !== "SELECT") return text;
  const normalized = String(text || "").toLowerCase();
  const option = [...field.options].find((item) => item.textContent.trim().toLowerCase() === normalized || item.value.toLowerCase() === normalized);
  return option ? option.value : text;
}

function generatedDefaultFields(sections) {
  const p = buildProfile();
  const avatar = sections.avatar || "";
  const hair = avatarPart(avatar, "Hair");
  const eyes = avatarPart(avatar, "Eyes");
  const face = avatarPart(avatar, "Face");
  const build = avatarPart(avatar, "Build");
  const details = avatarPart(avatar, "Details");
  const defaults = {
    tonePack: p.tonePack,
    storyIntensity: intensityValue(p),
    relationshipPreset: value("relationshipPreset") || "Infer",
    chemistry: p.chemistry,
    moralEdge: p.moralEdge,
    dramaHeat: p.dramaHeat,
    portraitConsistency: optionValueForText("portraitConsistency", "Moderate"),
    facialDistinctiveness: optionValueForText("facialDistinctiveness", "Distinctive"),
    appearanceEthnicity: avatarPart(avatar, "Ethnicity/Race"),
    skinTone: avatarPart(avatar, "Skin"),
    hairColor: optionValueForText("hairColor", hair.match(/\b(black|dark brown|brown|light brown|auburn|copper|ginger|strawberry blonde|blonde|platinum|gray|white)\b/i)?.[1] || ""),
    hairColorCustom: hair,
    hairstyle: hair,
    hairLength: optionValueForText("hairLength", hair.match(/\b(very short|short|chin length|shoulder length|long|very long)\b/i)?.[1] || ""),
    hairTexture: optionValueForText("hairTexture", hair.match(/\b(straight|wavy|curly|coily|thick|fine)\b/i)?.[1] || ""),
    eyeColor: optionValueForText("eyeColor", eyes.match(/\b(brown|hazel|green|blue|gray|amber|black)\b/i)?.[1] || ""),
    eyeShape: optionValueForText("eyeShape", face.match(/\b(hooded|almond|round|deep-set|upturned|downturned)\b/i)?.[1] || ""),
    faceShape: optionValueForText("faceShape", face.match(/\b(round|oval|square|heart-shaped|angular|long)\b/i)?.[1] || ""),
    noseShape: optionValueForText("noseShape", face.match(/\b(straight|slightly crooked|broad|narrow|rounded)\b/i)?.[1] || ""),
    lipShape: optionValueForText("lipShape", face.match(/\b(defined|full|thin|wide|uneven smile)\b/i)?.[1] || ""),
    browShape: optionValueForText("browShape", face.match(/\b(straight|arched|thick|fine|uneven)\b/i)?.[1] || ""),
    jawline: optionValueForText("jawline", face.match(/\b(soft|defined|square|strong chin|narrow)\b/i)?.[1] || ""),
    heightScale: optionValueForText("heightScale", build.match(/\b(very short|short|average|tall|very tall)\b/i)?.[1] || ""),
    bodyShape: optionValueForText("bodyShape", build.match(/\b(rectangle|pear|apple|hourglass|inverted triangle)\b/i)?.[1] || ""),
    bodyBuild: optionValueForText("bodyBuild", build.match(/\b(petite|thin|medium|soft|broad|heavyset)\b/i)?.[1] || ""),
    muscleTone: optionValueForText("muscleTone", build.match(/\b(soft|lightly toned|sturdy|athletic)\b/i)?.[1] || ""),
    appearanceClothing: backstoryPart(sections.backstory, "Aesthetic"),
    appearanceExpression: "AI",
    appearancePose: "AI",
    appearanceLighting: value("appearanceLighting") || "AI",
    appearanceNotes: oneLine([details, sections.physical].filter(Boolean).join(" "), 240),
  };
  personalityFieldIds.forEach((id) => {
    if (defaults[id] === undefined) defaults[id] = value(id);
  });
  return defaults;
}

function applyGeneratedValuesToForm(sections) {
  const generated = generatedFieldBackfill(sections);
  Object.entries(generated).forEach(([id, text]) => {
    if (["why", "wound", "dream", "complication", "texture", "voice"].includes(id)) {
      if (text && !state.answers[id]) state.answers[id] = text;
      return;
    }
    if (!$(id) || !text || value(id) || isFieldLocked(id)) return;
    setFieldValue(id, text, "ai");
  });
  Object.entries(generatedDefaultFields(sections)).forEach(([id, text]) => {
    if (!$(id) || value(id) || isFieldLocked(id)) return;
    setFieldValue(id, text || "", "ai");
  });
  updatePersonalityPreview();
}

function coerceFieldImportValue(id, text) {
  const field = $(id);
  if (!field) return "";
  const raw = String(text ?? "").trim();
  if (!raw) return "";
  if (field.tagName === "SELECT") return optionValueForText(id, raw) || raw;
  if (field.type === "range") {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) return String(Math.max(Number(field.min || 1), Math.min(Number(field.max || 5), parsed)));
  }
  return raw;
}

function applyImportedKinFields(fields = {}, options = {}) {
  const overwrite = options.overwrite !== false;
  let count = 0;
  Object.entries(fields).forEach(([id, rawValue]) => {
    if (!$(id) || isFieldLocked(id)) return;
    const next = coerceFieldImportValue(id, rawValue);
    if (!next) return;
    if (!overwrite && value(id)) return;
    if (setFieldValue(id, next, "ai")) count += 1;
  });
  if (fields.interviewAnswers && typeof fields.interviewAnswers === "object") {
    Object.entries(fields.interviewAnswers).forEach(([key, text]) => {
      if (text && [...questions, ...activeInterviewQuestions()].some((question) => question.key === key)) state.answers[key] = String(text);
    });
  }
  updatePersonalityPreview();
  updateEstimatedBirthYear();
  updatePowerLeaningLabel();
  renderNameForge();
  return count;
}

function isSectionLocked(sectionKey) {
  return Boolean(document.querySelector(`[data-lock-section="${sectionKey}"]`)?.checked);
}

function renderOutputSectionNavigator() {
  const host = $("outputSectionNavList");
  const summary = $("outputSectionNavSummary");
  if (!host) return;
  const group = state.outputTab || "main";
  const keys = outputSectionGroups[group] || [];
  let filled = 0;
  host.innerHTML = keys.map((key) => {
    const id = outputSections[key];
    const text = value(id);
    const length = text.trim().length;
    const max = sectionMeta[key]?.max || 0;
    const locked = isSectionLocked(key);
    const over = Boolean(max && length > max);
    if (length) filled += 1;
    const status = locked ? "Locked" : over ? "Over" : length ? "Ready" : "Empty";
    return `
      <button class="output-nav-item ${length ? "filled" : ""} ${locked ? "locked" : ""} ${over ? "over" : ""}" type="button" data-output-nav-section="${key}">
        <span>${escapeHtml(sectionMeta[key]?.label || key)}</span>
        <small>${status}${max ? ` · ${length}/${max}` : ""}</small>
      </button>
    `;
  }).join("");
  if (summary) summary.textContent = `${filled}/${keys.length} filled`;
}

function getLockedSections() {
  return Object.fromEntries(Object.keys(outputSections).map((key) => [key, isSectionLocked(key)]));
}

function setSectionLocks(locks = {}) {
  Object.entries(locks).forEach(([key, locked]) => {
    const input = document.querySelector(`[data-lock-section="${key}"]`);
    if (input) input.checked = Boolean(locked);
  });
}

function setOutputSections(text, options = {}) {
  const sections = fillMissingSections(parseOutputSections(text));
  Object.entries(outputSections).forEach(([key, id]) => {
    const lockKey = journalParentByKeyphrases[key] || key;
    if (options.preserveLocked && isSectionLocked(lockKey)) return;
    $(id).value = normalizeSectionValue(key, sections[key]);
  });
  updateCounters();
  return sections;
}

function normalizeImportedSectionValue(sectionKey, text) {
  const max = sectionMeta[sectionKey]?.max;
  if (sectionKey === "kms") return stripSectionLabel(text, sectionKey).trim();
  const cleaned = cleanGeneratedText(stripSectionLabel(text, sectionKey));
  if (sectionKey === "opening" || sectionKey === "example") return compact(cleanGreetingText(cleaned), max);
  if (sectionKey === "avatar") return compact(cleanAvatarDescription(cleaned), max);
  if (journalKeyphraseSections.has(sectionKey)) return compact(normalizeJournalKeyphrases(cleaned, journalParentByKeyphrases[sectionKey]), max);
  return max ? compact(cleaned, max) : cleaned;
}

function setImportedOutputSections(text) {
  const sections = parseOutputSections(text);
  let count = 0;
  Object.entries(outputSections).forEach(([key, id]) => {
    if (!$(id)) return;
    const imported = sections[key] || "";
    setValue(id, imported ? normalizeImportedSectionValue(key, imported) : "");
    if (imported) count += 1;
  });
  updateCounters();
  return { sections, count };
}

function resetKinImportCanvas() {
  state.personalityConstruction = null;
  const preservedUserName = value("userName");
  clearApiError();
  generatorFieldIds.forEach((id) => {
    const field = $(id);
    if (!field) return;
    if (field.type === "range") setValue(id, "3");
    else setValue(id, "");
  });
  if ($("userName")) setValue("userName", preservedUserName);
  if ($("creationType")) setValue("creationType", "Single Character");
  if ($("createPlayerProfile")) $("createPlayerProfile").checked = true;
  Object.values(outputSections).forEach((id) => setValue(id, ""));
  Object.values(variantOutputs).forEach((id) => setValue(id, ""));
  setValue("imageStudioFinalPromptOutput", "");
  setValue("greetingDraftOutput", "");
  state.greetingReview = { issues: [], decisions: {} };
  state.consistencyReport = null;
  $("greetingStudioReport")?.classList.add("hidden");
  $("greetingDraftPanel")?.classList.add("hidden");
  $("consistencyPanel")?.classList.add("hidden");
  $("sceneVariantsPanel")?.classList.add("hidden");
  $("generationProgress")?.classList.add("hidden");
  stopGenerationProgress();
  state.imageStudioImage = null;
  state.faceReferenceImage = null;
  state.fullBodyReferenceImage = null;
  state.imageStudioBusy = false;
  renderImagePreview();
  state.fieldMeta = {};
  generatorFieldIds.forEach((id) => {
    if ($(id)) {
      fieldMeta(id);
      updateFieldMetaUi(id);
    }
  });
  state.answers = {};
  state.interviewQuestions = [];
  state.questionIndex = 0;
  state.journals = [];
  state.journalDrafts = [];
  state.journalCategory = "Overview";
  state.activeJournalId = "";
  setSectionLocks(Object.fromEntries(Object.keys(outputSections).map((key) => [key, false])));
  updateQuestion();
  renderJournalManager();
  updateCounters();
}

function clearGeneratedOutput(options = {}) {
  if (!options.preserveLocked) state.personalityConstruction = null;
  Object.entries(outputSections).forEach(([key, id]) => {
    if (options.preserveLocked && isSectionLocked(journalParentByKeyphrases[key] || key)) return;
    if ($(id)) setValue(id, "");
  });
  Object.values(variantOutputs).forEach((id) => {
    if ($(id)) setValue(id, "");
  });
  if ($("imageStudioFinalPromptOutput")) setValue("imageStudioFinalPromptOutput", "");
  state.imageStudioImage = null;
  state.faceReferenceImage = null;
  state.fullBodyReferenceImage = null;
  state.imageStudioBusy = false;
  renderImagePreview();
  if (options.clearGreetingStudio !== false) {
    setValue("greetingDraftOutput", "");
    state.greetingReview = { issues: [], decisions: {} };
    $("greetingStudioReport")?.classList.add("hidden");
    $("greetingDraftPanel")?.classList.add("hidden");
  }
  $("outputTitle").textContent = options.title || "Ready when you are";
  updateCounters();
  if (options.save !== false) saveDraft();
}

function setGenerationProgress(index, labelOverride = "") {
  const total = generationSteps.length;
  const safeIndex = Math.max(0, Math.min(index, total - 1));
  const percent = Math.round(((safeIndex + 1) / total) * 100);
  $("generationProgress").classList.remove("hidden");
  $("progressLabel").textContent = labelOverride || generationSteps[safeIndex];
  $("progressPercent").textContent = `${percent}%`;
  $("progressFill").style.width = `${percent}%`;
  $("progressLog").innerHTML = generationSteps
    .map((step, stepIndex) => {
      const stateClass = stepIndex < safeIndex ? "done" : stepIndex === safeIndex ? "active" : "";
      return `<li class="${stateClass}">${escapeHtml(step)}</li>`;
    })
    .join("");
}

function startGenerationProgress() {
  stopGenerationProgress();
  let index = 0;
  setGenerationProgress(index);
  progressTimer = window.setInterval(() => {
    index = Math.min(index + 1, generationSteps.length - 2);
    setGenerationProgress(index);
  }, generationStepMs);
}

function finishGenerationProgress(label = "Generation complete") {
  stopGenerationProgress();
  setGenerationProgress(generationSteps.length - 1, label);
}

function failGenerationProgress(label = "Generation stopped") {
  stopGenerationProgress();
  $("generationProgress").classList.remove("hidden");
  $("progressLabel").textContent = label;
  $("progressPercent").textContent = "0%";
  $("progressFill").style.width = "0%";
}

function stopGenerationProgress() {
  if (progressTimer) {
    window.clearInterval(progressTimer);
    progressTimer = null;
  }
}

function getCombinedOutput() {
  return Object.keys(outputSections)
    .map((key) => formatSectionForCopy(key))
    .filter(Boolean)
    .join("\n\n");
}

function safeFilePart(text) {
  const clean = String(text || "KinForge Kindroid")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 80);
  return clean || "KinForge Kindroid";
}

function saveTextFile(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildFullTextSave() {
  const profile = getCombinedOutput();
  const journals = journalExportText();
  if (!journals) return profile;
  return `${profile}\n\n=== Journal Manager Export ===\n\n${journals}`;
}

function saveJsonFile(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
  saveBlobFile(filename, blob);
}

function saveBlobFile(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function saveDataUrlFile(filename, dataUrl) {
  if (!dataUrl) return false;
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  return true;
}

function imageFileExtension(data = state.imageStudioImage) {
  const mime = String(data?.mimeType || data?.image || "").toLowerCase();
  if (mime.includes("image/webp")) return "webp";
  if (mime.includes("image/jpeg") || mime.includes("image/jpg")) return "jpg";
  return "png";
}

function dataUrlToBytes(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;,]+)?(;base64)?,(.*)$/);
  if (!match) return null;
  const base64 = Boolean(match[2]);
  const body = match[3] || "";
  const binary = base64 ? atob(body) : decodeURIComponent(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return { mimeType: match[1] || "application/octet-stream", bytes };
}

function textBytes(text) {
  return new TextEncoder().encode(String(text || ""));
}

const zipCrcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = zipCrcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pushUint16(parts, value) {
  parts.push(value & 0xff, (value >>> 8) & 0xff);
}

function pushUint32(parts, value) {
  parts.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function bytesFromNumberParts(parts) {
  return new Uint8Array(parts);
}

function concatBytes(chunks) {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  chunks.forEach((chunk) => {
    output.set(chunk, offset);
    offset += chunk.length;
  });
  return output;
}

function createZipBlob(files) {
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;
  const stamp = dosDateTime();
  files.forEach((file) => {
    const nameBytes = textBytes(String(file.name || "").replace(/\\/g, "/"));
    const data = file.data instanceof Uint8Array ? file.data : textBytes(file.data || "");
    const crc = crc32(data);
    const local = [];
    pushUint32(local, 0x04034b50);
    pushUint16(local, 20);
    pushUint16(local, 0x0800);
    pushUint16(local, 0);
    pushUint16(local, stamp.time);
    pushUint16(local, stamp.date);
    pushUint32(local, crc);
    pushUint32(local, data.length);
    pushUint32(local, data.length);
    pushUint16(local, nameBytes.length);
    pushUint16(local, 0);
    const localHeader = bytesFromNumberParts(local);
    localChunks.push(localHeader, nameBytes, data);

    const central = [];
    pushUint32(central, 0x02014b50);
    pushUint16(central, 20);
    pushUint16(central, 20);
    pushUint16(central, 0x0800);
    pushUint16(central, 0);
    pushUint16(central, stamp.time);
    pushUint16(central, stamp.date);
    pushUint32(central, crc);
    pushUint32(central, data.length);
    pushUint32(central, data.length);
    pushUint16(central, nameBytes.length);
    pushUint16(central, 0);
    pushUint16(central, 0);
    pushUint16(central, 0);
    pushUint16(central, 0);
    pushUint32(central, 0);
    pushUint32(central, offset);
    centralChunks.push(bytesFromNumberParts(central), nameBytes);
    offset += localHeader.length + nameBytes.length + data.length;
  });
  const centralDirectory = concatBytes(centralChunks);
  const localFiles = concatBytes(localChunks);
  const end = [];
  pushUint32(end, 0x06054b50);
  pushUint16(end, 0);
  pushUint16(end, 0);
  pushUint16(end, files.length);
  pushUint16(end, files.length);
  pushUint32(end, centralDirectory.length);
  pushUint32(end, localFiles.length);
  pushUint16(end, 0);
  return new Blob([localFiles, centralDirectory, bytesFromNumberParts(end)], { type: "application/zip" });
}

function kinBundleFilename() {
  const name = safeFilePart(value("kindroidName") || inferName(value("coreIdea")) || $("outputTitle").textContent || "KinForge Character");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `${name} - KinForge ${stamp}.kin`;
}

function buildKinImageAssets() {
  const slots = [
    ["currentPreview", state.imageStudioImage, "current-preview"],
    ["faceReference", state.faceReferenceImage, "face-reference"],
    ["fullBodyReference", state.fullBodyReferenceImage, "full-body-reference"],
  ];
  const files = [];
  const manifest = {};
  slots.forEach(([slot, image, baseName]) => {
    if (!image?.image) return;
    const parsed = dataUrlToBytes(image.image);
    if (!parsed) return;
    const metadata = imageStudioImageMetadata(image) || {};
    const ext = imageFileExtension({ ...image, mimeType: parsed.mimeType });
    const path = `images/${baseName}.${ext}`;
    files.push({ name: path, data: parsed.bytes });
    manifest[slot] = {
      path,
      role: slot,
      mimeType: parsed.mimeType,
      ...metadata,
    };
  });
  return { files, manifest };
}

function buildKinBundleExport() {
  const imageAssets = buildKinImageAssets();
  const packageJson = buildPackageExport({ includeImage: false });
  packageJson.packageType = "KinForge .kin Bundle";
  packageJson.packageVersion = 2;
  packageJson.bundle = {
    format: "KinForge .kin",
    bundleVersion: 1,
    exportedAt: new Date().toISOString(),
    images: imageAssets.manifest,
  };
  packageJson.imageManifest = imageAssets.manifest;
  packageJson.restoreNotes = [
    "This .kin file is a ZIP-compatible KinForge bundle. Use Load in KinForge to restore the character, journals, and images.",
    "The JSON stores image paths in imageManifest instead of embedding large base64 image data.",
    ...(packageJson.restoreNotes || []),
  ];
  return {
    files: [
      { name: "kinforge-package.json", data: textBytes(JSON.stringify(packageJson, null, 2)) },
      { name: "exports/profile.txt", data: textBytes(getCombinedOutput()) },
      { name: "exports/full-text-with-journals.txt", data: textBytes(buildFullTextSave()) },
      { name: "exports/journals.txt", data: textBytes(journalExportText()) },
      ...imageAssets.files,
    ],
    imageCount: imageAssets.files.length,
  };
}

function exportKinBundle() {
  const bundle = buildKinBundleExport();
  const blob = createZipBlob(bundle.files);
  saveBlobFile(kinBundleFilename(), blob);
  return bundle.imageCount;
}

function parseJournalExportEntries(text) {
  const source = String(text || "");
  if (!/\bJournal Body\b/i.test(source) || !/\bKeywords\b/i.test(source)) return [];
  return source.split(/\n\s*---\s*\n/g).map((block, index) => {
    const keywordMatch = block.match(/\bKeywords\b\s*([\s\S]*?)(?=\n\s*Journal Body\b)/i);
    const bodyMatch = block.match(/\bJournal Body\b\s*([\s\S]*)/i);
    const body = String(bodyMatch?.[1] || "").trim();
    const keywords = parseJournalKeywords(keywordMatch?.[1] || "").slice(0, journalConfig.maxKeywords);
    if (!body && !keywords.length) return null;
    return {
      id: `journal-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title: `Loaded Journal ${index + 1}`,
      category: "Imported",
      keywords,
      body: body.slice(0, journalConfig.maxBodyCharacters),
      updatedAt: journalTimestamp(),
      pinned: false,
    };
  }).filter(Boolean).slice(0, journalConfig.maxEntries);
}

function normalizeLoadedJournal(entry, index = 0) {
  return {
    id: entry.id || `journal-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: entry.title || entry.name || `Loaded Journal ${index + 1}`,
    category: entry.category || "Overview",
    keywords: parseJournalKeywords(Array.isArray(entry.keywords) ? entry.keywords.join(", ") : entry.keywords).slice(0, journalConfig.maxKeywords),
    body: String(entry.body || "").slice(0, journalConfig.maxBodyCharacters),
    updatedAt: entry.updatedAt || journalTimestamp(),
    pinned: Boolean(entry.pinned),
  };
}

function normalizeLoadedJournalDraft(draft, index = 0) {
  return {
    id: draft.id || `journal-draft-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: draft.title || `Loaded Draft ${index + 1}`,
    category: draft.category || "Overview",
    keywords: parseJournalKeywords(Array.isArray(draft.keywords) ? draft.keywords.join(", ") : draft.keywords).slice(0, journalConfig.maxKeywords),
    body: String(draft.body || "").slice(0, journalConfig.maxBodyCharacters),
    replaceTitle: draft.replaceTitle || "",
    source: draft.source || "Loaded draft",
    createdAt: draft.createdAt || journalTimestamp(),
  };
}

function restoreJournalManagerFromSettings(journalManager = {}) {
  const loadedJournals = journalManager.journals || journalManager.entries || [];
  const loadedDrafts = journalManager.reviewDrafts || journalManager.journalDrafts || journalManager.drafts || [];
  state.journals = loadedJournals.map(normalizeLoadedJournal).slice(0, journalConfig.maxEntries);
  state.journalDrafts = loadedDrafts.map(normalizeLoadedJournalDraft);
  state.journalCategories = journalManager.categories?.length ? [...journalManager.categories] : ["Overview", "People", "Places", "Objects", "Events", "Relationships", "World", "Behavior", "Temporary"];
  state.journalCategory = journalManager.selectedCategory || state.journals[0]?.category || "Overview";
  state.activeJournalId = journalManager.activeJournalId && state.journals.some((entry) => entry.id === journalManager.activeJournalId)
    ? journalManager.activeJournalId
    : state.journals[0]?.id || "";
  state.autoInferJournals = Boolean(journalManager.autoInferJournals);
}

function loadSettingsData(data, fileName = "") {
  const hasJournalData = Boolean(data?.journalManager || data?.settings?.journalManager || data?.state?.journals || data?.journals);
  const isKinForgeSettings = data && typeof data === "object" && (data.app === "KinForge Kindroid Generator" || data.packageType === "KinForge Full Package" || data.generatedSections || data.settings?.fields || hasJournalData);
  if (!isKinForgeSettings) return false;
  state.personalityConstruction = data.personalityConstruction || null;
  const fields = data.settings?.fields || {};
  Object.entries(fields).forEach(([id, fieldData]) => {
    if (!$(id)) return;
    const nextValue = fieldData && typeof fieldData === "object" && "value" in fieldData ? fieldData.value : fieldData;
    if ($(id).type === "checkbox") $(id).checked = Boolean(nextValue);
    else setValue(id, String(nextValue ?? ""));
    const meta = fieldMeta(id);
    if (fieldData && typeof fieldData === "object") {
      meta.origin = fieldData.origin || (fieldHasMeaningfulValue(id) ? "user" : "blank");
      meta.locked = Boolean(fieldData.locked);
      meta.lastValue = value(id);
    }
    updateFieldMetaUi(id);
  });
  state.mode = data.mode || state.mode || "interview";
  state.answers = { ...(data.settings?.interviewAnswers || {}) };
  state.interviewQuestions = normalizeInterviewQuestions(data.settings?.interviewQuestions || data.state?.interviewQuestions || []);
  if (!data.settings?.interviewQuestions && !data.state?.interviewQuestions) state.interviewQuestions = [];
  const loadedQuestionIndex = Number.parseInt(data.settings?.questionIndex, 10);
  state.questionIndex = Number.isFinite(loadedQuestionIndex) ? loadedQuestionIndex : 0;
  state.generatedNames = data.settings?.generatedNames || [];
  state.favoriteNames = data.settings?.favoriteNames || [];
  applyAiModelSettings(data.settings?.aiModelSettings || data.aiModelSettings || defaultAiModelSettings());
  if (data.settings?.kindroidApi) {
    const importedTargets = data.settings.kindroidApi.targets || [];
    const selectedTargetId = data.settings.kindroidApi.selectedTargetId || state.kindroidApi?.selectedTargetId || "";
    state.kindroidApi = {
      apiKey: state.kindroidApi?.apiKey || "",
      targets: mergeKindroidTargets(state.kindroidApi?.targets || [], importedTargets),
      selectedTargetId,
      includeFields: { ...defaultKindroidIncludeFields, ...(data.settings.kindroidApi.includeFields || {}) },
      pushHistory: data.settings.kindroidApi.pushHistory || [],
      chatHistory: null,
    };
    syncKindroidTargetsWithLibrary(importedTargets);
    syncKindroidApiControlsFromState();
  }
  const loadedImageStudio = data.imageStudio?.generatedImage?.image ? data.imageStudio : (data.settings?.imageStudio || data.imageStudio || {});
  restoreImageStudioSettings(loadedImageStudio);
  if (data.generatedSections || data.generatedSectionsV2) {
    const sections = v2SectionsToOutputSections(data.generatedSectionsV2, data.generatedSections || {});
    Object.entries(outputSections).forEach(([key, id]) => setValue(id, sections[key] || ""));
  }
  setSectionLocks(data.lockedOutputSections || {});
  Object.entries(data.sceneVariants || {}).forEach(([key, text]) => {
    if (variantOutputs[key]) setValue(variantOutputs[key], text || "");
  });
  if (data.settings?.greetingStudio) {
    setValue("greetingStudioBrief", data.settings.greetingStudio.brief || "");
    setValue("greetingStudioStyle", data.settings.greetingStudio.style || "Natural first contact");
    setValue("greetingDraftOutput", data.settings.greetingStudio.draft || "");
    state.greetingReview = data.settings.greetingStudio.review || { issues: [], decisions: {} };
    if (value("greetingDraftOutput")) $("greetingDraftPanel")?.classList.remove("hidden");
    if (state.greetingReview?.issues?.length) renderGreetingReport({ summary: `${state.greetingReview.issues.length} saved suggestion${state.greetingReview.issues.length === 1 ? "" : "s"}.`, issues: state.greetingReview.issues });
  }
  const loadedJournalManager = data.journalManager
    || data.settings?.journalManager
    || (data.state?.journals ? {
      journals: data.state.journals,
      reviewDrafts: data.state.journalDrafts,
      categories: data.state.journalCategories,
      selectedCategory: data.state.journalCategory,
      activeJournalId: data.state.activeJournalId,
      autoInferJournals: data.state.autoInferJournals,
    } : null)
    || (data.journals ? { journals: data.journals } : null);
  if (loadedJournalManager) restoreJournalManagerFromSettings(loadedJournalManager);
  if (data.consistencyReport) renderConsistencyReport(data.consistencyReport);
  else {
    state.consistencyReport = null;
    $("consistencyPanel")?.classList.add("hidden");
  }
  $("outputTitle").textContent = data.outputTitle || fileName.replace(/\.json$/i, "").trim() || "Settings loaded";
  updateMode(state.mode || "interview");
  updateQuestion();
  updateCounters();
  updatePersonalityPreview();
  updateEstimatedBirthYear();
  updatePowerLeaningLabel();
  renderNameForge();
  renderJournalManager();
  setWorkspaceTab("output", loadedJournalManager?.journals?.length ? "journals" : state.outputTab || "main");
  saveDraft();
  return true;
}

async function loadKinBundle(file) {
  if (state.generationBusy || state.imageStudioBusy) {
    $("statusPill").textContent = "Wait for generation to finish before loading a Kin.";
    return;
  }
  try {
    if (file.size > KinBundle.MAX_BYTES) throw new Error("Kin package exceeds the 100 MB limit.");
    $("statusPill").textContent = "Reading Kin package...";
    const data = KinBundle.read(new Uint8Array(await file.arrayBuffer()));
    // Finish decoding and validating the archive before replacing the current character.
    resetKinImportCanvas();
    loadSettingsData(data, file.name);
    setOutputCollapsed(false);
    $("statusPill").textContent = `Loaded Kin package with ${state.journals?.length || 0} journals and ${Object.keys(data.imageManifest || data.bundle.images || {}).length} images`;
  } catch (error) {
    showApiError(error, "Load Kin Package");
    $("statusPill").textContent = `Kin package load failed: ${error.message}`;
  }
}

function loadTextFile(file) {
  if (/\.kin$/i.test(file.name)) return loadKinBundle(file);
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    const text = String(reader.result || "");
    if (/\.json$/i.test(file.name) || text.trim().startsWith("{")) {
      try {
        const data = JSON.parse(text);
        if (loadSettingsData(data, file.name)) {
          const loadedJournalCount = state.journals?.length || 0;
          const loadedKind = data.packageType === "KinForge Full Package" ? "package" : "settings";
          $("statusPill").textContent = `Loaded ${loadedKind}${loadedJournalCount ? ` with ${loadedJournalCount} journals` : ""}`;
          return;
        }
      } catch (error) {
        console.warn(error);
        $("statusPill").textContent = "Settings load failed";
        return;
      }
    }
    const journalMarkerIndex = text.indexOf("=== Journal Manager Export ===");
    const profileText = journalMarkerIndex >= 0 ? text.slice(0, journalMarkerIndex).trim() : text;
    const journalText = journalMarkerIndex >= 0 ? text.slice(journalMarkerIndex) : "";
    const rawJournalOnlyEntries = journalMarkerIndex < 0 ? parseJournalExportEntries(text) : [];
    if (rawJournalOnlyEntries.length && !profileText.match(/\bPersonality\b|\bResponse Directive\b|\bAvatar Description\b/i)) {
      state.journals = rawJournalOnlyEntries;
      state.journalCategories = ["Overview", "People", "Places", "Objects", "Events", "Relationships", "World", "Behavior", "Temporary", "Imported"];
      state.journalCategory = "Imported";
      state.activeJournalId = rawJournalOnlyEntries[0].id;
      renderJournalManager();
      setWorkspaceTab("output", "journals");
      $("outputTitle").textContent = "Journal export loaded";
      $("statusPill").textContent = `Loaded ${rawJournalOnlyEntries.length} journals`;
      saveDraft();
      return;
    }
    setOutputSections(profileText);
    const loadedJournalEntries = parseJournalExportEntries(journalText);
    if (loadedJournalEntries.length) {
      state.journals = loadedJournalEntries;
      state.journalCategories = ["Overview", "People", "Places", "Objects", "Events", "Relationships", "World", "Behavior", "Temporary", "Imported"];
      state.journalCategory = "Imported";
      state.activeJournalId = loadedJournalEntries[0].id;
      renderJournalManager();
    }
    setWorkspaceTab("output", "main");
    const name = file.name.replace(/\s+-\s+KinForge\s+\d{4}-\d{2}-\d{2}\.txt$/i, "").replace(/\.txt$/i, "").trim();
    if (name && !$("kindroidName").value.trim()) setValue("kindroidName", name);
    $("outputTitle").textContent = name ? `${name} loaded` : "Saved profile loaded";
    $("statusPill").textContent = loadedJournalEntries.length ? `Loaded saved profile with ${loadedJournalEntries.length} journals` : "Loaded saved profile";
    saveDraft();
  });
  reader.addEventListener("error", () => {
    $("statusPill").textContent = "Load failed";
  });
  reader.readAsText(file);
}

function buildSaveFilename() {
  const name = safeFilePart(value("kindroidName") || inferName(value("coreIdea")) || $("outputTitle").textContent);
  const date = new Date().toISOString().slice(0, 10);
  return `${name} - KinForge ${date}.txt`;
}

function buildSettingsFilename() {
  const name = safeFilePart(value("kindroidName") || inferName(value("coreIdea")) || $("outputTitle").textContent);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `${name} - KinForge Settings ${stamp}.json`;
}

function buildPackageFilename() {
  const name = safeFilePart(value("kindroidName") || inferName(value("coreIdea")) || $("outputTitle").textContent);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `${name} - KinForge Package ${stamp}.json`;
}

function fieldValueForExport(id) {
  const field = $(id);
  if (!field) return "";
  if (field.type === "checkbox") return field.checked;
  return field.value;
}

function buildSettingsExport() {
  updateEstimatedBirthYear();
  const savedFieldIds = ["userName", "createPlayerProfile", ...generatorFieldIds].filter((id, index, ids) => ids.indexOf(id) === index && $(id));
  const fields = Object.fromEntries(savedFieldIds.map((id) => [
    id,
    {
      label: fieldLabels[id] || id,
      value: fieldValueForExport(id),
      origin: state.fieldMeta?.[id]?.origin || (fieldHasMeaningfulValue(id) ? "user" : "blank"),
      locked: Boolean(state.fieldMeta?.[id]?.locked),
    },
  ]));
  return {
    app: "KinForge Kindroid Generator",
    schemaVersion: 2,
    version: document.querySelector(".version-badge")?.textContent.trim() || "",
    exportedAt: new Date().toISOString(),
    mode: state.mode,
    outputTitle: $("outputTitle").textContent,
    settings: {
      fields,
      interviewAnswers: { ...state.answers },
      interviewQuestions: activeInterviewQuestions(),
      questionIndex: state.questionIndex,
      personalityModel: buildPersonalityPayload(),
      naming: buildNamePayload().naming,
      generatedNames: state.generatedNames || [],
      favoriteNames: state.favoriteNames || [],
      aiModelSettings: buildAiModelSettings(),
      kindroidApi: {
        targets: state.kindroidApi?.targets || [],
        selectedTargetId: state.kindroidApi?.selectedTargetId || "",
        includeFields: { ...defaultKindroidIncludeFields, ...(state.kindroidApi?.includeFields || {}) },
        pushHistory: state.kindroidApi?.pushHistory || [],
        apiKeyExported: false,
      },
      imageStudio: buildImageStudioSettings(),
      appearance: buildAppearancePayload(),
      world: buildWorldPayload(),
      player: buildPlayerPayload(),
      greetingStudio: {
        brief: value("greetingStudioBrief"),
        style: value("greetingStudioStyle") || "Natural first contact",
        draft: value("greetingDraftOutput"),
        review: state.greetingReview || { issues: [], decisions: {} },
      },
    },
    aiPayloadForFreshGeneration: buildGeneratorPayload({ includeContinuity: false }),
    aiPayloadWithContinuity: buildGeneratorPayload(),
    generatedSections: getSectionValues(),
    generatedSectionsV2: getSectionValuesV2(),
    personalityConstruction: state.personalityConstruction || null,
    imageStudio: buildImageStudioSettings(),
    journalManager: buildJournalSettingsExport(),
    consistencyReport: state.consistencyReport || null,
    lockedOutputSections: getLockedSections(),
    sceneVariants: Object.fromEntries(Object.entries(variantOutputs).map(([key, id]) => [key, $(id).value.trim()])),
  };
}

function buildPackageExport(options = {}) {
  const includeImage = options.includeImage !== false;
  const settings = buildSettingsExport();
  const imageStudio = buildImageStudioSettings({ includeImage });
  return {
    ...settings,
    settings: {
      ...settings.settings,
      imageStudio,
    },
    imageStudio,
    packageType: "KinForge Full Package",
    packageVersion: 2,
    exports: {
      profileText: getCombinedOutput(),
      fullTextWithJournals: buildFullTextSave(),
      journalImportText: journalExportText(),
      settingsJson: settings,
    },
    restoreNotes: [
      "Load this JSON with KinForge's Load button to restore settings, generated sections, journals, review drafts, names, variants, and locks.",
      "Use exports.profileText for plain Kindroid profile text and exports.journalImportText for Kindroid Journal Manager import.",
    ],
  };
}

function buildContinuityPayload() {
  return {
    modelSettings: modelSettingsForTask("continuity"),
    package: buildPackageExport(),
    generatorPayload: buildGeneratorPayload({ aiTask: "continuity" }),
    sections: getSectionValues(),
    journals: buildJournalSettingsExport(),
    locks: getLockedSections(),
  };
}

function consistencyReportText(report = state.consistencyReport) {
  if (!report) return "";
  const issues = report.issues || [];
  const lines = [
    `Continuity Check`,
    report.summary || `${issues.length} issue${issues.length === 1 ? "" : "s"} found.`,
    "",
    ...issues.flatMap((issue, index) => [
      `${index + 1}. [${issue.severity || "note"}] ${issue.area || "General"} - ${issue.issue || "Issue"}`,
      issue.evidence ? `Evidence: ${issue.evidence}` : "",
      issue.suggestion ? `Suggestion: ${issue.suggestion}` : "",
      issue.targetSection ? `Target: ${issue.targetSection}` : "",
      "",
    ]),
  ];
  return lines.filter((line, index, arr) => line || arr[index - 1]).join("\n").trim();
}

function renderConsistencyReport(report) {
  state.consistencyReport = report || null;
  const panel = $("consistencyPanel");
  const list = $("consistencyList");
  if (!panel || !list) return;
  const issues = report?.issues || [];
  $("consistencySummary").textContent = report?.summary || `${issues.length} issue${issues.length === 1 ? "" : "s"} found.`;
  if (!issues.length) {
    list.innerHTML = `<article class="consistency-card"><span class="consistency-pill low">clean</span><strong>No major continuity issues found.</strong><p>Residual risk: subtle tone preferences may still need human review.</p></article>`;
  } else {
    list.innerHTML = issues.map((issue) => {
      const severity = String(issue.severity || "medium").toLowerCase();
      return `<article class="consistency-card">
        <span class="consistency-pill ${escapeHtml(severity)}">${escapeHtml(severity)}</span>
        <strong>${escapeHtml(issue.area || "General")}: ${escapeHtml(issue.issue || "Issue")}</strong>
        ${issue.evidence ? `<p><strong>Evidence:</strong> ${escapeHtml(issue.evidence)}</p>` : ""}
        ${issue.suggestion ? `<p><strong>Suggestion:</strong> ${escapeHtml(issue.suggestion)}</p>` : ""}
        ${issue.targetSection ? `<p><strong>Target:</strong> ${escapeHtml(issue.targetSection)}</p>` : ""}
      </article>`;
    }).join("");
  }
  panel.classList.remove("hidden");
}

function buildLocalGreetingReport() {
  const greeting = value("openingGreetingOutput");
  const example = value("exampleOutput");
  const preset = value("relationshipPreset");
  const userName = currentUserName();
  const issues = [];
  const add = (severity, issue, evidence, suggestion) => issues.push({ severity, issue, evidence, suggestion });
  if (!example.trim()) add("medium", "Missing Example voice seed", "Example Message is blank.", "Generate or reroll Example Message before polishing the greeting.");
  if (example.trim() && !/#Tone\s*:/i.test(example)) add("low", "Example missing tone", "Example Message does not include #Tone.", "Reroll Example Message so it defines the Kin's emotional and stylistic direction.");
  if (example.trim() && !/#Speech\s*:/i.test(example)) add("low", "Example missing speech rules", "Example Message does not include #Speech.", "Add speech guidance such as direct, teasing, clipped, warm, no euphemisms, or no poetic monologues.");
  if (example.trim() && !/#Length\s*:/i.test(example)) add("low", "Example missing length rule", "Example Message does not include #Length.", "Add a reply range such as 1-3 paragraphs, 350-900 characters, medium sentences.");
  if (example.trim() && !/#Rules\s*:/i.test(example)) add("low", "Example missing behavior rules", "Example Message does not include #Rules.", "Add compact behavioral rules that control escalation, consent, trust, and what the Kin prioritizes.");
  if (example.length > sectionMeta.example.max) add("high", "Example over character limit", `${example.length}/${sectionMeta.example.max} characters.`, "Trim the voice seed and sample before copying it into Kindroid.");
  if (!greeting.trim()) add("high", "Missing scene setting", "Scene Setting is blank.", "Generate or rewrite the scene setting.");
  if (greeting.length > sectionMeta.opening.max) add("high", "Over character limit", `${greeting.length}/${sectionMeta.opening.max} characters.`, "Trim the greeting before copying it into Kindroid.");
  if (userName !== "{username}" && /\buser\s*name\b|\busername\b|\buser\b/i.test(greeting)) add("medium", "Username placeholder leak", "The greeting appears to use User, Username, or User Name.", `Replace with ${userName} only when the Kin would know the name.`);
  if (/you understand|trust you|waiting for someone like you|we can figure this out together/i.test(greeting)) add("medium", "Assumed intimacy", "The dialogue assumes trust, emotional familiarity, or teamwork.", "Reduce the line to a concrete observation, question, or practical request.");
  if (/\b(?:hi|hello|hey)[,!.\s]+(?:i am|i'm|i’m)\s+[A-Z][a-z]+/i.test(greeting) && /\b(?:kids?|children|twins|daughter|son|baby|nap|babysit|sitting|schedule|calendar|client|appointment|shift|settled|pickup|drop[- ]?off)\b/i.test(greeting)) {
    add("medium", "Mixed familiarity state", "The Kin introduces themself while the scene implies they already know the user through work, children, or scheduling.", "Remove the self-introduction and open with a handoff, update, reminder, or practical question.");
  }
  if (/new here|new in town|newcomer/i.test(greeting) && /stranger/i.test(preset)) add("medium", "Stranger/newcomer confusion", "The greeting treats a stranger to the Kin as a stranger to the location.", "Only call the player new to town if that is explicitly supplied.");
  if (/\binside\b.*\b(rv|home|apartment|bedroom|room|vehicle)\b|\b(rv|home|apartment|bedroom|vehicle)\b.*\binside\b/i.test(greeting) && /stranger/i.test(preset)) add("medium", "Private-space risk", "The scene may place a stranger inside private space.", "Move first contact to a public, exterior, shared, or threshold location.");
  if (/something about this (place|town)|pulling me in|not ready to admit|where I belong/i.test(greeting)) add("low", "Scripted self-analysis", "The line explains the character arc instead of sounding like natural speech.", "Replace it with an immediate fact, small choice, or ordinary line of dialogue.");
  return {
    summary: issues.length ? `${issues.length} possible greeting issue${issues.length === 1 ? "" : "s"} found.` : "No obvious greeting issues found by the local checker.",
    issues,
  };
}

function renderGreetingReport(report) {
  const panel = $("greetingStudioReport");
  const issues = report?.issues || [];
  if (!panel) return;
  state.greetingReview ||= { issues: [], decisions: {} };
  state.greetingReview.issues = issues;
  state.greetingReview.decisions ||= {};
  state.greetingReview.decisions = Object.fromEntries(
    Object.entries(state.greetingReview.decisions).filter(([index]) => Number.parseInt(index, 10) < issues.length),
  );
  if (!issues.length) {
    panel.innerHTML = `<strong>${escapeHtml(report?.summary || "Greeting looks playable.")}</strong>`;
    panel.classList.remove("hidden");
    return;
  }
  panel.innerHTML = `
    <strong>${escapeHtml(report?.summary || `${issues.length} issue${issues.length === 1 ? "" : "s"} found.`)}</strong>
    <ul>
      ${issues.map((issue, index) => `
        <li>
          <span class="issue-severity">${escapeHtml(issue.severity || "note")}</span>
          ${escapeHtml(issue.issue || "Issue")}
          ${issue.evidence ? `<br />Evidence: ${escapeHtml(issue.evidence)}` : ""}
          ${issue.suggestion ? `<br />Suggestion: ${escapeHtml(issue.suggestion)}` : ""}
          <div class="greeting-issue-actions">
            <button class="ghost-button" type="button" data-greeting-decision="accepted" data-greeting-issue="${index}">Accept</button>
            <button class="ghost-button" type="button" data-greeting-decision="rejected" data-greeting-issue="${index}">Reject</button>
            <span class="greeting-review-state">${escapeHtml(state.greetingReview.decisions[index] || "pending")}</span>
          </div>
        </li>
      `).join("")}
    </ul>
  `;
  panel.classList.remove("hidden");
}

function setGreetingIssueDecision(index, decision) {
  state.greetingReview ||= { issues: [], decisions: {} };
  state.greetingReview.decisions ||= {};
  state.greetingReview.decisions[index] = decision;
  renderGreetingReport({ summary: `${state.greetingReview.issues.length} reviewed suggestion${state.greetingReview.issues.length === 1 ? "" : "s"}.`, issues: state.greetingReview.issues });
  saveDraft();
}

function outputSectionText(sectionKey) {
  const id = outputSections[sectionKey];
  if (!id || !$(id)) return "";
  return $(id).value;
}

function getSectionValues() {
  return Object.fromEntries(Object.keys(outputSections).map((key) => [key, outputSectionText(key)]));
}

function v2SectionsToOutputSections(v2 = {}, fallback = {}) {
  return {
    ...fallback,
    backstory: v2.personality ?? fallback.backstory ?? "",
    kms: v2.keyMemories ?? fallback.kms ?? "",
    rd: v2.responseDirective ?? fallback.rd ?? "",
    example: v2.exampleMessage ?? fallback.example ?? "",
    opening: v2.sceneSetting ?? fallback.opening ?? "",
    relationship: v2.relationshipContext ?? fallback.relationship ?? "",
    player: v2.userPersona ?? fallback.player ?? "",
  };
}

function getSectionValuesV2() {
  return {
    personality: outputSectionText("backstory"),
    keyMemories: outputSectionText("kms"),
    responseDirective: outputSectionText("rd"),
    exampleMessage: outputSectionText("example"),
    sceneSetting: outputSectionText("opening"),
    relationshipContext: outputSectionText("relationship"),
    userPersona: outputSectionText("player"),
  };
}

function formatSectionForCopy(sectionKey) {
  const text = outputSectionText(sectionKey);
  if (!text) return "";
  return `${sectionMeta[sectionKey]?.label || sectionKey}\n${text}`;
}

function sectionLength(sectionKey) {
  return outputSectionText(sectionKey).length;
}

function characterSheetCount(sectionKey) {
  const length = sectionLength(sectionKey);
  const max = sectionMeta[sectionKey]?.max;
  return max ? `${length.toLocaleString()} / ${max.toLocaleString()}` : length.toLocaleString();
}

function renderCharacterSheetTextCard(title, sectionKey, options = {}) {
  const text = outputSectionText(sectionKey);
  const bodyClass = options.muted ? "character-sheet-body muted" : "character-sheet-body";
  return `
    <section class="character-sheet-card">
      <div class="character-sheet-card-head">
        <span class="character-sheet-card-title">${escapeHtml(title)}</span>
        <span class="character-sheet-count">${escapeHtml(characterSheetCount(sectionKey))}</span>
      </div>
      <div class="${bodyClass}">${escapeHtml(text || options.empty || "Not generated yet.")}</div>
    </section>
  `;
}

function renderCharacterSheetMemories() {
  const raw = value(outputSections.kms).trim();
  const memories = raw.split(/\n+/).map((line) => line.replace(/^[-*]\s*/, "").trim()).filter(Boolean);
  const body = memories.length
    ? `<ul class="character-sheet-memory-list">${memories.slice(0, 8).map((memory) => `<li>${escapeHtml(memory)}</li>`).join("")}</ul>`
    : `<div class="character-sheet-body muted">Not generated yet.</div>`;
  return `
    <section class="character-sheet-card">
      <div class="character-sheet-card-head">
        <span class="character-sheet-card-title">Key Memories</span>
        <span class="character-sheet-count">${memories.length} / 5</span>
      </div>
      ${body}
    </section>
  `;
}

function characterSheetImageCard(title, imageData, empty = "No image yet") {
  return `
    <section class="character-sheet-card character-sheet-image-card">
      <div class="character-sheet-card-head">
        <span class="character-sheet-card-title">${escapeHtml(title)}</span>
      </div>
      ${imageData ? `<img src="${escapeHtml(imageData)}" alt="${escapeHtml(title)} preview" />` : `<div class="character-sheet-image-empty">${escapeHtml(empty)}</div>`}
    </section>
  `;
}

function quickInfoValue(id, fallback = "Not set") {
  const text = value(id).trim();
  return text || fallback;
}

function renderCharacterSheetQuickInfo() {
  const location = [value("currentCity"), value("currentState"), value("currentCountry")].map((item) => item.trim()).filter(Boolean).join(", ") || "Not set";
  const enneagram = [value("enneagramType"), value("enneagramWing")].map((item) => item.trim()).filter((item) => item && item !== "Infer").join("") || "Infer";
  const rows = [
    ["Name", quickInfoValue("kindroidName")],
    ["Age", quickInfoValue("age")],
    ["Gender", quickInfoValue("gender")],
    ["Species", quickInfoValue("species", "Human / Infer")],
    ["Occupation", quickInfoValue("occupation")],
    ["Location", location],
    ["MBTI", quickInfoValue("mbti", "Infer")],
    ["Tritype", quickInfoValue("tritype", "Infer")],
    ["Enneagram", enneagram],
    ["Attachment", quickInfoValue("attachmentStyle", "Infer")],
    ["Alignment", quickInfoValue("moralAlignment", "Infer")],
    ["Orientation", quickInfoValue("intimacyOrientation", "Infer")],
    ["Relationship", quickInfoValue("relationshipPreset", "Infer")],
    ["Tone", quickInfoValue("tonePack", "Infer")],
  ];
  return `
    <section class="character-sheet-card">
      <div class="character-sheet-card-head">
        <span class="character-sheet-card-title">Quick Info</span>
      </div>
      <dl class="character-sheet-info">
        ${rows.map(([label, text]) => `<div><dt>${escapeHtml(label)}:</dt><dd>${escapeHtml(text)}</dd></div>`).join("")}
      </dl>
    </section>
  `;
}

function renderCharacterSheet() {
  const host = $("characterSheetContent");
  if (!host) return;
  const currentImage = state.imageStudioImage?.image || $("snapshotImage")?.src || "";
  const faceImage = state.faceReferenceImage?.image || currentImage;
  const fullBodyImage = state.fullBodyReferenceImage?.image || "";
  host.innerHTML = `
    <div class="character-sheet-left">
      ${renderCharacterSheetTextCard("Scene Setting", "opening")}
      ${renderCharacterSheetTextCard("Personality", "backstory")}
      ${renderCharacterSheetMemories()}
      ${renderCharacterSheetTextCard("Example Message", "example")}
    </div>
    <div class="character-sheet-right">
      <div class="character-sheet-image-grid">
        ${characterSheetImageCard("Headshot", faceImage, "Generate or upload a face reference.")}
        ${characterSheetImageCard("Full Body", fullBodyImage, "Generate a full-body reference.")}
      </div>
      ${renderCharacterSheetQuickInfo()}
      ${renderCharacterSheetTextCard("Response Directive", "rd", { muted: true })}
      ${renderCharacterSheetTextCard("Relationship Context", "relationship", { muted: true })}
    </div>
  `;
}

function openCharacterSheet() {
  renderCharacterSheet();
  $("characterSheetOverlay").hidden = false;
}

function closeCharacterSheet() {
  $("characterSheetOverlay").hidden = true;
}

function exportCharacterSheet() {
  const sections = ["opening", "backstory", "kms", "example", "rd", "relationship", "avatar", "physical", "face"]
    .map((key) => formatSectionForCopy(key))
    .filter(Boolean)
    .join("\n\n---\n\n");
  const info = [
    `Name: ${quickInfoValue("kindroidName")}`,
    `Age: ${quickInfoValue("age")}`,
    `Gender: ${quickInfoValue("gender")}`,
    `Species: ${quickInfoValue("species", "Human / Infer")}`,
    `Occupation: ${quickInfoValue("occupation")}`,
  ].join("\n");
  const name = safeFilePart(value("kindroidName") || "KinForge Character Sheet");
  saveTextFile(`${name} - Character Sheet.txt`, `Character Sheet\n\n${info}\n\n---\n\n${sections}`);
}

const defaultKindroidIncludeFields = {
  ai_name: true,
  ai_gender: true,
  ai_backstory: true,
  ai_memory: true,
  ai_directive: true,
  ai_example_message: true,
  current_scene: true,
  user_name: true,
  user_gender: false,
  ai_additional_context: false,
};

const kindroidPayloadLabels = {
  ai_name: "Name",
  ai_gender: "Gender",
  ai_backstory: "Personality",
  ai_memory: "Key Memories",
  ai_directive: "Response Directive",
  ai_example_message: "Example Message",
  current_scene: "Scene Setting",
  user_name: "User Name",
  user_gender: "User Gender",
  ai_additional_context: "Additional Context",
};

const kindroidApiFieldLimits = {
  current_scene: 160,
};

function normalizeKindroidTarget(target = {}) {
  const aiId = String(target.aiId || target.ai_id || "").trim();
  const name = String(target.name || target.aiName || target.ai_name || "Unnamed target").trim();
  if (!aiId && !name) return null;
  return {
    id: String(target.id || `kindroid-target-${aiId || Date.now()}-${Math.random().toString(16).slice(2)}`).trim(),
    name: name || "Unnamed target",
    aiId,
    notes: String(target.notes || "").trim(),
    updatedAt: target.updatedAt || target.savedAt || new Date().toISOString(),
  };
}

function mergeKindroidTargets(...targetLists) {
  const byKey = new Map();
  targetLists.flat().forEach((target) => {
    const normalized = normalizeKindroidTarget(target);
    if (!normalized) return;
    const key = normalized.aiId ? `ai:${normalized.aiId.toLowerCase()}` : `id:${normalized.id}`;
    const existing = byKey.get(key);
    byKey.set(key, {
      ...(existing || {}),
      ...normalized,
      id: existing?.id || normalized.id,
      notes: normalized.notes || existing?.notes || "",
      updatedAt: normalized.updatedAt || existing?.updatedAt || new Date().toISOString(),
    });
  });
  return [...byKey.values()].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}

function loadKindroidTargetLibrary() {
  try {
    const raw = localStorage.getItem(kindroidTargetLibraryStorageKey);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return mergeKindroidTargets(Array.isArray(data?.targets) ? data.targets : Array.isArray(data) ? data : []);
  } catch {
    localStorage.removeItem(kindroidTargetLibraryStorageKey);
    return [];
  }
}

function saveKindroidTargetLibrary(targets = state.kindroidApi?.targets || []) {
  const normalized = mergeKindroidTargets(targets);
  try {
    localStorage.setItem(kindroidTargetLibraryStorageKey, JSON.stringify({
      version: 1,
      updatedAt: new Date().toISOString(),
      targets: normalized,
    }));
  } catch (error) {
    console.warn("Kindroid target library save skipped:", error);
  }
  return normalized;
}

function syncKindroidTargetsWithLibrary(extraTargets = []) {
  normalizeKindroidApiState();
  const selectedId = state.kindroidApi.selectedTargetId;
  state.kindroidApi.targets = mergeKindroidTargets(loadKindroidTargetLibrary(), state.kindroidApi.targets, extraTargets);
  saveKindroidTargetLibrary(state.kindroidApi.targets);
  if (selectedId && state.kindroidApi.targets.some((target) => target.id === selectedId)) {
    state.kindroidApi.selectedTargetId = selectedId;
  } else {
    state.kindroidApi.selectedTargetId = state.kindroidApi.targets[0]?.id || "";
  }
}

function normalizeKindroidApiState() {
  state.kindroidApi ||= {};
  state.kindroidApi.apiKey ||= "";
  state.kindroidApi.targets = mergeKindroidTargets(Array.isArray(state.kindroidApi.targets) ? state.kindroidApi.targets : []);
  state.kindroidApi.pushHistory = Array.isArray(state.kindroidApi.pushHistory) ? state.kindroidApi.pushHistory : [];
  state.kindroidApi.chatHistory ||= null;
  state.kindroidApi.lastDiffText ||= "";
  state.kindroidApi.rememberApiKey = Boolean(state.kindroidApi.rememberApiKey);
  state.kindroidApi.encryptedApiKeyAvailable = Boolean(state.kindroidApi.encryptedApiKeyAvailable || hasSavedKindroidApiKeyBlob());
  state.kindroidApi.selectedTargetId ||= state.kindroidApi.targets[0]?.id || "";
  state.kindroidApi.includeFields = { ...defaultKindroidIncludeFields, ...(state.kindroidApi.includeFields || {}) };
}

function selectedKindroidTarget() {
  normalizeKindroidApiState();
  return state.kindroidApi.targets.find((target) => target.id === state.kindroidApi.selectedTargetId) || null;
}

function syncKindroidApiControlsFromState() {
  normalizeKindroidApiState();
  syncKindroidTargetsWithLibrary();
  if ($("kindroidApiKey")) $("kindroidApiKey").value = state.kindroidApi.apiKey || "";
  document.querySelectorAll("[data-kindroid-field]").forEach((input) => {
    input.checked = Boolean(state.kindroidApi.includeFields[input.dataset.kindroidField]);
  });
  renderKindroidTargetSelect();
  renderKindroidPushHistory();
  renderKindroidChatHistory();
  updateKindroidSecretStatus();
  updateKindroidPushButtonState();
}

function renderKindroidTargetSelect() {
  const select = $("kindroidTargetSelect");
  if (!select) return;
  normalizeKindroidApiState();
  select.innerHTML = state.kindroidApi.targets.length
    ? state.kindroidApi.targets.map((target) => `<option value="${escapeHtml(target.id)}">${escapeHtml(target.name || "Unnamed target")} - ${escapeHtml(target.aiId || "no ai_id")}</option>`).join("")
    : `<option value="">No saved Kindroid targets</option>`;
  select.value = state.kindroidApi.selectedTargetId || "";
  const target = selectedKindroidTarget();
  setValue("kindroidTargetName", target?.name || "");
  setValue("kindroidTargetAiId", target?.aiId || "");
  setValue("kindroidTargetNotes", target?.notes || "");
  renderKindroidTargetGuide();
}

function saveKindroidApiFromControls() {
  normalizeKindroidApiState();
  state.kindroidApi.apiKey = value("kindroidApiKey").trim();
  state.kindroidApi.includeFields = Object.fromEntries(
    [...document.querySelectorAll("[data-kindroid-field]")].map((input) => [input.dataset.kindroidField, input.checked])
  );
  state.kindroidApi.rememberApiKey = Boolean($("rememberKindroidApiKey")?.checked);
}

function renderKindroidTargetGuide() {
  const host = $("kindroidTargetGuide");
  if (!host) return;
  normalizeKindroidApiState();
  const target = selectedKindroidTarget();
  const savedCount = state.kindroidApi.targets.length;
  const draftName = value("kindroidTargetName").trim();
  const draftAiId = value("kindroidTargetAiId").trim();
  const generatedName = value("kindroidName").trim();
  const items = [
    {
      status: state.kindroidApi.apiKey ? "ok" : "warn",
      text: state.kindroidApi.apiKey ? "API key is available for this session." : "Enter or unlock a Kindroid API key before testing or pushing.",
    },
    {
      status: savedCount ? "ok" : "warn",
      text: savedCount ? `${savedCount} saved Kindroid target${savedCount === 1 ? "" : "s"} available.` : "Save at least one target so KinForge knows which existing Kindroid to update.",
    },
    {
      status: target?.aiId ? "ok" : draftAiId ? "warn" : "block",
      text: target?.aiId
        ? `Selected target: ${target.name} (${target.aiId}).`
        : draftAiId
          ? "AI ID is typed but not saved yet. Click Save Target before testing or pushing."
          : "AI ID is required. Copy the existing Kindroid ai_id into the target field.",
    },
    {
      status: target?.name ? "ok" : draftName ? "warn" : "warn",
      text: target?.name
        ? `Saved target name: ${target.name}.`
        : draftName
          ? "Target name is typed but not saved yet."
          : "Target name is a local label only, but saving it makes later pushes much clearer.",
    },
  ];
  if (generatedName && target?.name && generatedName.toLowerCase() !== target.name.toLowerCase()) {
    items.push({
      status: "warn",
      text: `Generated Kin name is ${generatedName}, but the selected target is ${target.name}. This can be intentional, but double-check before overwrite.`,
    });
  }
  host.innerHTML = `
    <strong>Target setup checklist</strong>
    <ul>${items.map((item) => `<li><span class="kindroid-check-pill ${escapeHtml(item.status)}">${escapeHtml(item.status)}</span><span>${escapeHtml(item.text)}</span></li>`).join("")}</ul>
  `;
}

function hasSavedKindroidApiKeyBlob() {
  return Boolean(localStorage.getItem(kindroidApiKeyStorageKey));
}

function updateKindroidSecretStatus(message = "") {
  normalizeKindroidApiState();
  const saved = hasSavedKindroidApiKeyBlob();
  const checkbox = $("rememberKindroidApiKey");
  if (checkbox) checkbox.checked = Boolean(state.kindroidApi.rememberApiKey || saved);
  state.kindroidApi.encryptedApiKeyAvailable = saved;
  const status = $("kindroidSecretStatus");
  if (status) {
    status.textContent = message || (saved
      ? "Encrypted API key is saved on this PC."
      : state.kindroidApi.apiKey
        ? "API key is available for this session only."
        : "API key is session-only.");
  }
}

async function saveEncryptedKindroidApiKey() {
  saveKindroidApiFromControls();
  const key = state.kindroidApi.apiKey;
  if (!key) {
    updateKindroidSecretStatus("Enter a Kindroid API key before saving it locally.");
    return;
  }
  try {
    clearApiError();
    const blob = await encryptLocalSecret(key, "kindroidApiKey");
    localStorage.setItem(kindroidApiKeyStorageKey, JSON.stringify(blob));
    state.kindroidApi.rememberApiKey = true;
    updateKindroidSecretStatus("Encrypted API key saved on this PC.");
    $("kindroidApiStatus").textContent = "Kindroid API key saved locally as an encrypted blob.";
    saveDraft();
  } catch (error) {
    console.warn(error);
    showApiError(error, "Save Kindroid API Key");
    const staleServer = error?.apiDetails?.status === 405 || /Method not allowed/i.test(error?.apiDetails?.raw || "");
    updateKindroidSecretStatus(staleServer
      ? "Restart KinForge to load the local secret endpoint, then try Save Key Locally again."
      : `Could not save encrypted key: ${error.message.slice(0, 80)}`);
  }
}

function forgetEncryptedKindroidApiKey(options = {}) {
  localStorage.removeItem(kindroidApiKeyStorageKey);
  normalizeKindroidApiState();
  state.kindroidApi.rememberApiKey = false;
  state.kindroidApi.encryptedApiKeyAvailable = false;
  if (options.clearField) {
    state.kindroidApi.apiKey = "";
    setValue("kindroidApiKey", "");
  }
  updateKindroidSecretStatus(options.clearField ? "Saved API key forgotten and current key cleared." : "Saved API key forgotten.");
  saveDraft();
}

async function restoreEncryptedKindroidApiKey() {
  const raw = localStorage.getItem(kindroidApiKeyStorageKey);
  if (!raw) {
    updateKindroidSecretStatus();
    return;
  }
  try {
    const blob = JSON.parse(raw);
    const key = await decryptLocalSecret(blob, "kindroidApiKey");
    if (!key) throw new Error("Encrypted key unlocked but was empty");
    state.kindroidApi.apiKey = key;
    state.kindroidApi.rememberApiKey = true;
    setValue("kindroidApiKey", key);
    updateKindroidSecretStatus("Encrypted API key unlocked for this session.");
  } catch (error) {
    console.warn(error);
    showApiError(error, "Unlock Kindroid API Key");
    state.kindroidApi.apiKey = "";
    setValue("kindroidApiKey", "");
    updateKindroidSecretStatus("Saved API key could not be unlocked. Re-enter it or forget the saved key.");
  }
}

function saveKindroidTargetFromControls() {
  normalizeKindroidApiState();
  const name = value("kindroidTargetName").trim();
  const aiId = value("kindroidTargetAiId").trim();
  const notes = value("kindroidTargetNotes").trim();
  if (!name || !aiId) {
    $("kindroidApiStatus").textContent = "Target name and AI ID are required.";
    return;
  }
  const existing = selectedKindroidTarget();
  const id = existing?.id || `kindroid-target-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const next = { id, name, aiId, notes, updatedAt: new Date().toISOString() };
  const index = state.kindroidApi.targets.findIndex((target) => target.id === id);
  if (index >= 0) state.kindroidApi.targets[index] = next;
  else state.kindroidApi.targets.push(next);
  state.kindroidApi.targets = saveKindroidTargetLibrary(state.kindroidApi.targets);
  const saved = state.kindroidApi.targets.find((target) => target.aiId === aiId) || next;
  state.kindroidApi.selectedTargetId = id;
  state.kindroidApi.selectedTargetId = saved.id;
  renderKindroidTargetSelect();
  $("kindroidApiStatus").textContent = `Saved target: ${name}`;
  saveDraft();
}

function removeSelectedKindroidTarget() {
  normalizeKindroidApiState();
  const target = selectedKindroidTarget();
  if (!target) {
    $("kindroidApiStatus").textContent = "No Kindroid target selected.";
    return;
  }
  state.kindroidApi.targets = state.kindroidApi.targets.filter((item) => item.id !== target.id);
  state.kindroidApi.targets = saveKindroidTargetLibrary(state.kindroidApi.targets);
  state.kindroidApi.selectedTargetId = state.kindroidApi.targets[0]?.id || "";
  renderKindroidTargetSelect();
  $("kindroidApiStatus").textContent = `Removed target: ${target.name}`;
  saveDraft();
}

function buildKindroidPushPayload() {
  normalizeKindroidApiState();
  const include = state.kindroidApi.includeFields;
  const target = selectedKindroidTarget();
  const contextParts = [
    value(outputSections.tagline) ? `Tagline: ${value(outputSections.tagline)}` : "",
    value(outputSections.keywords) ? `Keywords: ${value(outputSections.keywords)}` : "",
    value(outputSections.relationship) ? `Relationship Context: ${value(outputSections.relationship)}` : "",
    value(outputSections.premise) ? `Story Premise: ${value(outputSections.premise)}` : "",
  ].filter(Boolean).join("\n");
  const candidates = {
    ai_id: target?.aiId || "",
    ai_name: value("kindroidName"),
    ai_gender: value("gender"),
    ai_backstory: value(outputSections.backstory),
    ai_memory: value(outputSections.kms),
    ai_directive: value(outputSections.rd),
    ai_example_message: value(outputSections.example),
    current_scene: value(outputSections.opening),
    user_name: value("userName") || "{username}",
    user_gender: value("playerGender"),
    ai_additional_context: contextParts,
  };
  return Object.fromEntries(Object.entries(candidates).filter(([key, text]) => key === "ai_id" || include[key] && String(text || "").trim()));
}

function kindroidPushSafetyReview() {
  saveKindroidApiFromControls();
  const target = selectedKindroidTarget();
  const payload = buildKindroidPushPayload();
  const fields = Object.keys(payload).filter((key) => key !== "ai_id");
  const generatedName = value("kindroidName").trim();
  const userName = value("userName").trim();
  const sectionLengths = {
    ai_backstory: { max: sectionMeta.backstory.max, length: value(outputSections.backstory).trim().length },
    ai_memory: { max: sectionMeta.kms.max, length: value(outputSections.kms).trim().length },
    ai_directive: { max: sectionMeta.rd.max, length: value(outputSections.rd).trim().length },
    ai_example_message: { max: sectionMeta.example.max, length: value(outputSections.example).trim().length },
    current_scene: { max: kindroidApiFieldLimits.current_scene, length: value(outputSections.opening).trim().length, hardLimit: true },
  };
  const checks = [];
  const add = (status, title, detail) => checks.push({ status, title, detail });
  add(state.kindroidApi.apiKey ? "ok" : "block", "API key", state.kindroidApi.apiKey ? "Available for this session." : "Enter or unlock a Kindroid API key before pushing.");
  add(target?.aiId ? "ok" : "block", "Saved target", target?.aiId ? `${target.name} (${target.aiId}) is selected.` : "Save a target name and AI ID before pushing.");
  add(fields.length ? "ok" : "block", "Selected fields", fields.length ? `${fields.length} checked, non-empty field${fields.length === 1 ? "" : "s"} will be sent.` : "No checked, non-empty fields are available to push.");
  ["ai_name", "ai_gender", "ai_backstory", "ai_memory", "ai_directive", "ai_example_message", "current_scene", "user_name"].forEach((key) => {
    if (state.kindroidApi.includeFields[key] && !payload[key]) add("warn", `${kindroidPayloadLabels[key]} is empty`, "The field is checked but blank, so it will be omitted from the API payload.");
  });
  Object.entries(sectionLengths).forEach(([key, info]) => {
    if (!(key in payload)) return;
    if (info.max && info.length > info.max) {
      add(
        info.hardLimit ? "block" : "warn",
        `${kindroidPayloadLabels[key]} over API limit`,
        `${info.length}/${info.max} characters. ${info.hardLimit ? "Kindroid will reject this field; shorten it or uncheck it before pushing." : "Consider trimming before pushing."}`,
      );
    }
  });
  if (generatedName && target?.name && generatedName.toLowerCase() !== target.name.toLowerCase()) {
    add("warn", "Name/target mismatch", `Generated Kin name is ${generatedName}, but selected target is ${target.name}. Confirm this is the intended overwrite target.`);
  }
  if (payload.ai_name && target?.name && payload.ai_name.toLowerCase() !== target.name.toLowerCase()) {
    add("warn", "Pushed name differs from target label", `The API payload will set Name to ${payload.ai_name}; the saved target label is ${target.name}.`);
  }
  const combined = Object.values(payload).join("\n");
  if (userName && userName !== "{username}" && /\b(User|Username|User Name)\b/.test(combined)) {
    add("warn", "Generic user label found", `Payload still contains User/Username wording even though the current user name is ${userName}.`);
  }
  if (!userName && combined.includes("{username}")) {
    add("ok", "Username placeholder", "No user name is set, so {username} is expected.");
  }
  if (target?.aiId && !lastKindroidPushForTarget(target)) {
    add("warn", "No previous push baseline", "This target has no saved successful push baseline yet. Compare-to-last-push will treat all sent fields as new.");
  }
  if (value("kindroidOverwriteConfirm").trim() === "OVERWRITE") {
    add("warn", "Overwrite armed", "The OVERWRITE confirmation is currently typed. Review the payload before clicking Push.");
  }
  return {
    target,
    payload,
    fields,
    checks,
    blocking: checks.filter((item) => item.status === "block").length,
    warnings: checks.filter((item) => item.status === "warn").length,
  };
}

function renderKindroidPushSafetyReview() {
  const host = $("kindroidSafetyPanel");
  if (!host) return kindroidPushSafetyReview();
  const review = kindroidPushSafetyReview();
  const readyText = review.blocking
    ? `${review.blocking} blocker${review.blocking === 1 ? "" : "s"} must be fixed before push.`
    : review.warnings
      ? `Push is technically ready with ${review.warnings} warning${review.warnings === 1 ? "" : "s"}.`
      : "Push safety review passed.";
  host.innerHTML = `
    <strong>Push safety review</strong>
    <p>${escapeHtml(readyText)}</p>
    <ul>${review.checks.map((item) => `
      <li>
        <span class="kindroid-check-pill ${escapeHtml(item.status)}">${escapeHtml(item.status)}</span>
        <span><strong>${escapeHtml(item.title)}:</strong> ${escapeHtml(item.detail)}</span>
      </li>
    `).join("")}</ul>
  `;
  host.classList.remove("hidden");
  $("kindroidApiStatus").textContent = readyText;
  saveDraft();
  return review;
}

function parseKindroidAdditionalContext(text = "") {
  const source = String(text || "");
  const result = {};
  [
    ["tagline", outputSections.tagline, "Tagline"],
    ["keywords", outputSections.keywords, "Keywords"],
    ["relationship", outputSections.relationship, "Relationship Context"],
    ["premise", outputSections.premise, "Story Premise"],
  ].forEach(([key, id, label], index, entries) => {
    const nextLabels = entries.slice(index + 1).map(([, , nextLabel]) => nextLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const pattern = nextLabels
      ? new RegExp(`${label}:\\s*([\\s\\S]*?)(?=\\n(?:${nextLabels}):|$)`, "i")
      : new RegExp(`${label}:\\s*([\\s\\S]*)`, "i");
    const match = source.match(pattern);
    if (match?.[1]) result[key] = { id, text: match[1].trim() };
  });
  return result;
}

function applyKindroidPayloadToKinForge(payload = {}, options = {}) {
  const target = options.target || selectedKindroidTarget();
  const sourceLabel = options.sourceLabel || "Kindroid import";
  resetKinImportCanvas();
  let outputCount = 0;
  const outputMap = {
    ai_backstory: outputSections.backstory,
    ai_memory: outputSections.kms,
    ai_directive: outputSections.rd,
    ai_example_message: outputSections.example,
    current_scene: outputSections.opening,
  };
  Object.entries(outputMap).forEach(([apiKey, sectionId]) => {
    const text = String(payload[apiKey] || "").trim();
    if (!text) return;
    setValue(sectionId, text);
    outputCount += 1;
  });
  const context = parseKindroidAdditionalContext(payload.ai_additional_context || "");
  Object.values(context).forEach(({ id, text }) => {
    if (id && text) {
      setValue(id, text);
      outputCount += 1;
    }
  });
  let fieldCount = 0;
  if (payload.ai_name) fieldCount += setFieldValue("kindroidName", payload.ai_name, "ai") ? 1 : 0;
  else if (target?.name) fieldCount += setFieldValue("kindroidName", target.name, "ai") ? 1 : 0;
  if (payload.ai_gender) fieldCount += setFieldValue("gender", payload.ai_gender, "ai") ? 1 : 0;
  if (payload.user_name) fieldCount += setFieldValue("userName", payload.user_name, "ai") ? 1 : 0;
  if (payload.user_gender) fieldCount += setFieldValue("playerGender", payload.user_gender, "ai") ? 1 : 0;
  updateCounters();
  updateQuestion();
  applyCreationTypeUi();
  setControlsCollapsed(false);
  setOutputCollapsed(false);
  setWorkspaceTab("control", "kin");
  setWorkspaceTab("output", "main");
  $("outputTitle").textContent = `${value("kindroidName") || target?.name || "Kindroid"} imported`;
  setValue("kindroidImportPreview", JSON.stringify({
    source: sourceLabel,
    target: target ? { name: target.name, ai_id: target.aiId } : null,
    loadedOutputSections: outputCount,
    loadedControlFields: fieldCount,
    note: "Loaded locally only. No generation or Kindroid overwrite was performed.",
  }, null, 2));
  $("kindroidImportStatus").textContent = `Loaded ${outputCount} output section${outputCount === 1 ? "" : "s"} and ${fieldCount} setting${fieldCount === 1 ? "" : "s"} from ${sourceLabel}.`;
  $("statusPill").textContent = "Kindroid target imported locally";
  saveDraft();
  return { outputCount, fieldCount };
}

function loadKindroidLastPushBaseline() {
  const target = selectedKindroidTarget();
  if (!target) {
    $("kindroidImportStatus").textContent = "Select a saved Kindroid target first.";
    return;
  }
  const baseline = lastKindroidPushForTarget(target);
  if (!baseline?.payload) {
    $("kindroidImportStatus").textContent = "No last-push baseline exists for this target yet. Use Infer From Recent Chat instead.";
    setValue("kindroidImportPreview", "No KinForge push baseline is saved for this target. Kindroid's public API does not expose a profile read endpoint, so KinForge cannot pull exact profile fields directly from Kindroid.");
    return;
  }
  applyKindroidPayloadToKinForge(baseline.payload, { target, sourceLabel: `last successful push on ${new Date(baseline.timestamp).toLocaleString()}` });
}

async function inferKindroidProfileFromRecentChat() {
  saveKindroidApiFromControls();
  const target = selectedKindroidTarget();
  if (!target?.aiId) {
    $("kindroidImportStatus").textContent = "Select a saved target with an ai_id first.";
    return;
  }
  if (!state.kindroidApi.apiKey) {
    $("kindroidImportStatus").textContent = "Enter or unlock a Kindroid API key first.";
    return;
  }
  const button = $("inferKindroidFromChatButton");
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Inferring...";
  clearApiError();
  $("kindroidImportStatus").textContent = `Fetching recent chat for ${target.name}...`;
  try {
    const result = await fetchKindroidChatWithApi(state.kindroidApi.apiKey, {
      aiId: target.aiId,
      groupId: "",
      limit: Math.max(20, Math.min(100, Number.parseInt(value("kindroidChatLimit"), 10) || 75)),
      startAfterTimestamp: "",
    });
    const messages = result.messages || [];
    if (!messages.length) throw createApiError("No chat messages returned for this Kindroid", { operation: "Infer Kindroid From Chat" });
    state.kindroidApi.chatHistory = {
      targetType: "ai",
      targetName: target.name,
      fetchedAt: new Date().toISOString(),
      messages,
      pagination: result.pagination || {},
      summary: result.summary || {},
    };
    renderKindroidChatHistory();
    const source = [
      `Kindroid API profile import note: Kindroid's public API exposes chat history but not exact profile settings. Infer a local editable KinForge draft from these recent messages. Preserve observable facts and mark uncertain details as Infer.`,
      `Target name: ${target.name}`,
      `Target ai_id: ${target.aiId}`,
      "",
      messages.map(formatKindroidMessage).join("\n\n---\n\n"),
    ].join("\n");
    setValue("kindroidImportPreview", source.slice(0, 12000));
    $("kindroidImportStatus").textContent = `Fetched ${messages.length} messages. Inferring local fields...`;
    resetKinImportCanvas();
    const imported = await inferKinTextWithAi(source);
    const count = applyImportedKinFields(imported.importData.fields || {}, { overwrite: true });
    if (!value("kindroidName")) setFieldValue("kindroidName", target.name, "ai");
    if (imported.importData.interviewAnswers) state.answers = { ...state.answers, ...imported.importData.interviewAnswers };
    updateQuestion();
    applyCreationTypeUi();
    setControlsCollapsed(false);
    setOutputCollapsed(false);
    setWorkspaceTab("control", "kin");
    setWorkspaceTab("output", "main");
    $("outputTitle").textContent = `${value("kindroidName") || target.name} inferred from chat`;
    $("kindroidImportStatus").textContent = `Inferred ${count} local setting${count === 1 ? "" : "s"} from recent chat using ${imported.model}. Review before pushing.`;
    $("statusPill").textContent = "Kindroid chat import inferred";
    saveDraft();
  } catch (error) {
    console.warn(error);
    showApiError(error, "Infer Kindroid From Chat");
    $("kindroidImportStatus").textContent = `Import failed: ${error.message.slice(0, 90)}`;
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function lastKindroidPushForTarget(target = selectedKindroidTarget()) {
  normalizeKindroidApiState();
  if (!target?.aiId) return null;
  return (state.kindroidApi.pushHistory || []).find((item) => item.aiId === target.aiId && item.payload) || null;
}

function comparableKindroidPayload(payload = {}) {
  return Object.fromEntries(
    Object.entries(payload)
      .filter(([key]) => key !== "ai_id")
      .map(([key, text]) => [key, String(text || "").trim()])
  );
}

function compareKindroidPayloads(previousPayload = {}, currentPayload = {}) {
  const previous = comparableKindroidPayload(previousPayload);
  const current = comparableKindroidPayload(currentPayload);
  const keys = [...new Set([...Object.keys(previous), ...Object.keys(current)])]
    .sort((a, b) => (kindroidPayloadLabels[a] || a).localeCompare(kindroidPayloadLabels[b] || b));
  return keys.map((key) => {
    const before = previous[key] || "";
    const after = current[key] || "";
    const status = before && after && before === after
      ? "unchanged"
      : before && after
        ? "changed"
        : after
          ? "added"
          : "removed";
    return {
      key,
      label: kindroidPayloadLabels[key] || key,
      status,
      before,
      after,
      beforeLength: before.length,
      afterLength: after.length,
    };
  });
}

function kindroidDiffText(target, baseline, diff) {
  const counts = diff.reduce((memo, item) => {
    memo[item.status] = (memo[item.status] || 0) + 1;
    return memo;
  }, {});
  const changed = diff.filter((item) => item.status !== "unchanged");
  const lines = [
    `Kindroid Push Diff`,
    `Target: ${target?.name || "No target"} (${target?.aiId || "no ai_id"})`,
    `Baseline: ${baseline ? new Date(baseline.timestamp).toLocaleString() : "No previous successful push saved"}`,
    `Summary: ${counts.changed || 0} changed, ${counts.added || 0} added, ${counts.removed || 0} removed, ${counts.unchanged || 0} unchanged`,
    "",
  ];
  if (!changed.length) {
    lines.push("No push field changes detected.");
    return lines.join("\n");
  }
  changed.forEach((item) => {
    lines.push(`${item.label}: ${item.status.toUpperCase()}`);
    if (item.before) lines.push(`Before (${item.beforeLength} chars): ${compact(item.before, 260)}`);
    if (item.after) lines.push(`After (${item.afterLength} chars): ${compact(item.after, 260)}`);
    lines.push("");
  });
  return lines.join("\n").trim();
}

function renderKindroidPushDiff(target, baseline, diff) {
  const host = $("kindroidDiffPanel");
  if (!host) return;
  const counts = diff.reduce((memo, item) => {
    memo[item.status] = (memo[item.status] || 0) + 1;
    return memo;
  }, {});
  const changed = diff.filter((item) => item.status !== "unchanged");
  const baselineText = baseline
    ? `Compared to ${new Date(baseline.timestamp).toLocaleString()} (${baseline.status || "last push"}).`
    : "No previous successful push is saved for this target, so current fields are treated as new.";
  host.innerHTML = `
    <h3>${escapeHtml(target?.name || "Kindroid target")} push diff</h3>
    <p>${escapeHtml(baselineText)}</p>
    <p>${counts.changed || 0} changed · ${counts.added || 0} added · ${counts.removed || 0} removed · ${counts.unchanged || 0} unchanged</p>
    ${changed.length ? changed.map((item) => `
      <article>
        <span class="diff-pill ${escapeHtml(item.status)}">${escapeHtml(item.status)}</span>
        <strong>${escapeHtml(item.label)}</strong>
        ${item.before ? `<div class="kindroid-diff-row"><strong>Before</strong><span>${escapeHtml(compact(item.before, 220))} (${item.beforeLength} chars)</span></div>` : ""}
        ${item.after ? `<div class="kindroid-diff-row"><strong>After</strong><span>${escapeHtml(compact(item.after, 220))} (${item.afterLength} chars)</span></div>` : ""}
      </article>
    `).join("") : `<article><strong>No push field changes detected.</strong><p>The current checked fields match the last saved successful push for this target.</p></article>`}
  `;
  host.classList.remove("hidden");
}

function buildKindroidPushDiff() {
  saveKindroidApiFromControls();
  const target = selectedKindroidTarget();
  const payload = buildKindroidPushPayload();
  const fields = Object.keys(payload).filter((key) => key !== "ai_id");
  if (!target) {
    $("kindroidApiStatus").textContent = "Choose or save a Kindroid target before comparing.";
    return null;
  }
  if (!fields.length) {
    $("kindroidApiStatus").textContent = "No checked, non-empty fields to compare.";
    return null;
  }
  const baseline = lastKindroidPushForTarget(target);
  const diff = compareKindroidPayloads(baseline?.payload || {}, payload);
  const text = kindroidDiffText(target, baseline, diff);
  state.kindroidApi.lastDiffText = text;
  renderKindroidPushDiff(target, baseline, diff);
  $("kindroidApiStatus").textContent = baseline
    ? `Compared current payload to last push for ${target.name}.`
    : `No prior push baseline for ${target.name}; current payload is shown as new.`;
  saveDraft();
  return { target, baseline, diff, text };
}

function buildKindroidPushPreview() {
  saveKindroidApiFromControls();
  const target = selectedKindroidTarget();
  const payload = buildKindroidPushPayload();
  const safety = kindroidPushSafetyReview();
  const preview = {
    endpoint: "POST https://api.kindroid.ai/v1/update-info",
    destructive: "Preview only. The separate Push to Kindroid button sends this payload after OVERWRITE confirmation.",
    selectedTarget: target ? { name: target.name, ai_id: target.aiId, notes: target.notes || "" } : null,
    safety: {
      blockers: safety.blocking,
      warnings: safety.warnings,
      summary: safety.blocking
        ? "Fix blockers before pushing."
        : safety.warnings
          ? "Push has warnings; review before overwrite."
          : "No local safety issues found.",
    },
    auth: {
      header: "Authorization: Bearer kn_...",
      apiKeyStoredLocally: Boolean(state.kindroidApi.apiKey),
      apiKeyExported: false,
    },
    payload,
    omittedBecauseUncheckedOrBlank: Object.keys(defaultKindroidIncludeFields).filter((key) => !(key in payload)),
  };
  setValue("kindroidPushPreview", JSON.stringify(preview, null, 2));
  renderKindroidPushSafetyReview();
  $("kindroidApiStatus").textContent = target ? `Preview built for ${target.name}. Nothing was sent.` : "Preview built without a selected target.";
  saveDraft();
  return preview;
}

function updateKindroidPushButtonState() {
  const button = $("pushKindroidButton");
  if (!button) return;
  const review = kindroidPushSafetyReview();
  const armed = value("kindroidOverwriteConfirm").trim() === "OVERWRITE";
  button.disabled = !(armed && !review.blocking);
  button.title = armed
    ? review.blocking ? `Fix ${review.blocking} push blocker${review.blocking === 1 ? "" : "s"} first` : "Push checked fields to the selected Kindroid"
    : "Type OVERWRITE to enable live push";
  const chatReady = value("kindroidChatBreakConfirm").trim() === "CHAT BREAK";
  const chatButton = $("kindroidChatBreakButton");
  const combinedButton = $("kindroidPushAndChatBreakButton");
  if (chatButton) chatButton.disabled = !chatReady;
  if (combinedButton) combinedButton.disabled = !(chatReady && value("kindroidOverwriteConfirm").trim() === "OVERWRITE");
}

function renderKindroidPushHistory() {
  const host = $("kindroidPushHistory");
  if (!host) return;
  normalizeKindroidApiState();
  host.innerHTML = state.kindroidApi.pushHistory.length
    ? state.kindroidApi.pushHistory.slice(0, 5).map((item) => `
      <article>
        <strong>${escapeHtml(item.targetName || "Kindroid target")} - ${escapeHtml(item.status || "updated")}</strong>
        <span>${escapeHtml(new Date(item.timestamp).toLocaleString())} · ${escapeHtml((item.fields || []).join(", ") || "No fields")}</span>
        ${item.payload ? `<span>Saved as comparison baseline.</span>` : ""}
      </article>
    `).join("")
    : "";
}

function formatKindroidMessage(message, index) {
  const rawRole = String(message.role || message.sender_type || message.sender || message.author || message.type || "message").toLowerCase();
  const target = selectedKindroidTarget();
  const fallbackKinName = value("kindroidName") || target?.name || "Kindroid";
  const fallbackUserName = currentUserName();
  const isAi = /\b(ai|assistant|kindroid)\b/i.test(rawRole) || String(message.sender || "").toLowerCase() === "ai";
  const isUser = /\b(user|human|player)\b/i.test(rawRole) || String(message.sender || "").toLowerCase() === "user";
  const role = isAi ? "Kin" : isUser ? "User" : rawRole || "message";
  const suppliedName = message.display_name || message.name || message.sender_name || message.ai_name || "";
  const name = suppliedName || (isAi ? fallbackKinName : isUser ? fallbackUserName : "");
  const timestamp = message.timestamp || message.created_at || message.createdAt || "";
  const text = message.message || message.content || message.text || message.body || "";
  const header = [`#${index + 1}`, role, name, timestamp].filter(Boolean).join(" · ");
  return `${header}\n${String(text || "").trim()}`;
}

function renderKindroidChatHistory() {
  const output = $("kindroidChatOutput");
  const status = $("kindroidChatStatus");
  if (!output) return;
  const history = state.kindroidApi?.chatHistory;
  if (!history?.messages?.length) {
    setValue("kindroidChatOutput", "");
    if (status) status.textContent = "No chat history fetched yet.";
    return;
  }
  const text = history.messages.map(formatKindroidMessage).join("\n\n---\n\n");
  setValue("kindroidChatOutput", text);
  if (status) {
    const pagination = history.pagination || {};
    status.textContent = `Fetched ${history.messages.length} message${history.messages.length === 1 ? "" : "s"}. ${pagination.hasMore ? `More available. Cursor: ${pagination.lastTimestamp || "not supplied"}` : "No more pages reported."}`;
  }
}

function setKindroidPushStatus(message, options = {}) {
  const text = String(message || "").trim();
  if (!text) return;
  if ($("kindroidApiStatus")) $("kindroidApiStatus").textContent = text;
  if ($("statusPill")) $("statusPill").textContent = options.short || text.slice(0, 64);
}

function buildKindroidChatAnalysisPayload() {
  const history = state.kindroidApi?.chatHistory || {};
  return {
    modelSettings: modelSettingsForTask("journals"),
    config: { ...journalConfig },
    profile: getCombinedOutput(),
    sections: getSectionValues(),
    generatorPayload: buildGeneratorPayload({ aiTask: "journals" }),
    journals: (state.journals || []).map(serializableJournal),
    audit: buildJournalAuditSummary(),
    chat: {
      targetType: history.targetType || value("kindroidChatTargetType") || "ai",
      targetName: history.targetName || selectedKindroidTarget()?.name || "",
      fetchedAt: history.fetchedAt || "",
      messages: (history.messages || []).slice(0, 100),
      pagination: history.pagination || {},
    },
  };
}

function renderKindroidChatAnalysis(analysis = {}) {
  const host = $("kindroidChatAnalysis");
  if (!host) return;
  const entries = analysis.entries || [];
  const issues = analysis.issues || [];
  const notes = analysis.notes || [];
  host.innerHTML = `
    <h3>${escapeHtml(analysis.summary || "Chat analysis complete.")}</h3>
    <p>${entries.length} journal draft${entries.length === 1 ? "" : "s"} suggested · ${issues.length} continuity note${issues.length === 1 ? "" : "s"} found.</p>
    ${notes.length ? `<article><strong>Notes</strong><p>${escapeHtml(notes.join(" "))}</p></article>` : ""}
    ${issues.slice(0, 8).map((issue) => {
      const severity = String(issue.severity || "medium").toLowerCase();
      return `<article>
        <span class="consistency-pill ${escapeHtml(severity)}">${escapeHtml(severity)}</span>
        <strong>${escapeHtml(issue.area || "Chat")}: ${escapeHtml(issue.issue || "Continuity note")}</strong>
        ${issue.evidence ? `<p><strong>Evidence:</strong> ${escapeHtml(issue.evidence)}</p>` : ""}
        ${issue.suggestion ? `<p><strong>Suggestion:</strong> ${escapeHtml(issue.suggestion)}</p>` : ""}
      </article>`;
    }).join("")}
  `;
  host.classList.remove("hidden");
}

async function analyzeFetchedKindroidChat() {
  const history = state.kindroidApi?.chatHistory;
  if (!history?.messages?.length) {
    $("kindroidChatStatus").textContent = "Fetch chat messages before analysis.";
    return;
  }
  const button = $("analyzeKindroidChatButton");
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Analyzing...";
  clearApiError();
  $("kindroidChatStatus").textContent = "Analyzing chat for journals and continuity...";
  try {
    const result = await analyzeKindroidChatWithAi();
    const entries = result.analysis?.entries || [];
    const count = stageInferredJournalDrafts(entries, "Kindroid chat");
    const report = {
      summary: result.analysis?.summary || `Chat analysis created ${count} journal draft${count === 1 ? "" : "s"}.`,
      issues: result.analysis?.issues || [],
      notes: result.analysis?.notes || [],
    };
    renderKindroidChatAnalysis(result.analysis);
    renderConsistencyReport(report);
    setWorkspaceTab("output", count ? "journals" : "main");
    $("kindroidChatStatus").textContent = `Chat analyzed with ${result.model}; ${count} journal draft${count === 1 ? "" : "s"} staged.`;
    $("statusPill").textContent = "Kindroid chat analyzed";
    saveDraft();
  } catch (error) {
    console.warn(error);
    showApiError(error, "Analyze Kindroid Chat");
    $("kindroidChatStatus").textContent = `Chat analysis failed: ${error.message.slice(0, 80)}`;
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

async function fetchKindroidChatHistory() {
  saveKindroidApiFromControls();
  const apiKey = state.kindroidApi.apiKey;
  const target = selectedKindroidTarget();
  const targetType = value("kindroidChatTargetType") || "ai";
  const groupId = value("kindroidGroupId").trim();
  const limit = Math.max(1, Math.min(100, Number.parseInt(value("kindroidChatLimit"), 10) || 50));
  const startAfterTimestamp = value("kindroidChatCursor").trim();
  if (!apiKey) {
    $("kindroidChatStatus").textContent = "Enter a Kindroid API key first.";
    return;
  }
  if (targetType === "ai" && !target?.aiId) {
    $("kindroidChatStatus").textContent = "Select a saved Kindroid target with an ai_id first.";
    return;
  }
  if (targetType === "group" && !groupId) {
    $("kindroidChatStatus").textContent = "Enter a group_id for group chat history.";
    return;
  }
  const button = $("fetchKindroidChatButton");
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Fetching...";
  clearApiError();
  $("kindroidChatStatus").textContent = "Fetching Kindroid chat history...";
  try {
    const result = await fetchKindroidChatWithApi(apiKey, {
      aiId: targetType === "ai" ? target.aiId : "",
      groupId: targetType === "group" ? groupId : "",
      limit,
      startAfterTimestamp,
    });
    state.kindroidApi.chatHistory = {
      targetType,
      targetName: targetType === "ai" ? target.name : groupId,
      fetchedAt: new Date().toISOString(),
      messages: result.messages || [],
      pagination: result.pagination || {},
      summary: result.summary || {},
    };
    if (result.pagination?.lastTimestamp) setValue("kindroidChatCursor", result.pagination.lastTimestamp);
    renderKindroidChatHistory();
    $("statusPill").textContent = "Kindroid chat fetched";
    saveDraft();
  } catch (error) {
    console.warn(error);
    showApiError(error, "Kindroid Chat History");
    $("kindroidChatStatus").textContent = `Chat fetch failed: ${error.message.slice(0, 80)}`;
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

async function pushKindroidPreviewToApi() {
  saveKindroidApiFromControls();
  const target = selectedKindroidTarget();
  const apiKey = state.kindroidApi.apiKey;
  const payload = buildKindroidPushPayload();
  const safety = renderKindroidPushSafetyReview();
  if (safety.blocking) {
    setKindroidPushStatus(`Fix ${safety.blocking} push blocker${safety.blocking === 1 ? "" : "s"} before overwrite.`, { short: "Kindroid push blocked" });
    return false;
  }
  if (value("kindroidOverwriteConfirm").trim() !== "OVERWRITE") {
    setKindroidPushStatus("Type OVERWRITE before pushing.", { short: "Type OVERWRITE first" });
    updateKindroidPushButtonState();
    return false;
  }
  if (!target) {
    setKindroidPushStatus("Choose or save a Kindroid target first.", { short: "No Kindroid target selected" });
    return false;
  }
  if (!apiKey) {
    setKindroidPushStatus("Enter or unlock a Kindroid API key first.", { short: "No Kindroid API key" });
    return false;
  }
  if (!payload.ai_id) {
    setKindroidPushStatus("Selected target is missing ai_id.", { short: "Missing Kindroid ai_id" });
    return false;
  }
  const fields = Object.keys(payload).filter((key) => key !== "ai_id");
  if (!fields.length) {
    setKindroidPushStatus("No checked, non-empty fields to push.", { short: "No fields to push" });
    return false;
  }
  buildKindroidPushPreview();
  const button = $("pushKindroidButton");
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Pushing...";
  clearApiError();
  setKindroidPushStatus(`Pushing ${fields.length} field${fields.length === 1 ? "" : "s"} to ${target.name}...`, { short: "Pushing to Kindroid..." });
  try {
    const result = await pushKindroidWithApi(apiKey, payload);
    const historyItem = {
      timestamp: new Date().toISOString(),
      targetName: target.name,
      aiId: target.aiId,
      status: `HTTP ${result.status || 200}`,
      fields,
      payload: { ...payload },
      kinforgeVersion: document.querySelector(".version-badge")?.textContent.trim() || "",
    };
    state.kindroidApi.pushHistory = [historyItem, ...(state.kindroidApi.pushHistory || [])].slice(0, 20);
    renderKindroidPushHistory();
    $("kindroidDiffPanel")?.classList.add("hidden");
    state.kindroidApi.lastDiffText = "";
    setValue("kindroidOverwriteConfirm", "");
    updateKindroidPushButtonState();
    setKindroidPushStatus(`Pushed ${fields.length} field${fields.length === 1 ? "" : "s"} to ${target.name}.`, { short: "Kindroid push complete" });
    saveDraft();
    return true;
  } catch (error) {
    console.warn(error);
    showApiError(error, "Kindroid Update");
    setKindroidPushStatus(`Kindroid push failed: ${error.message.slice(0, 160)}`, { short: "Kindroid push failed" });
    return false;
  } finally {
    button.textContent = originalText;
    updateKindroidPushButtonState();
  }
}

function buildKindroidChatBreakPayload() {
  const target = selectedKindroidTarget();
  const greeting = cleanGreetingText(value(outputSections.opening)).trim();
  const payload = {
    ai_id: target?.aiId || "",
    greeting,
    wipe_cascaded: Boolean($("kindroidWipeCascaded")?.checked),
  };
  setValue("kindroidChatBreakGreeting", greeting);
  $("kindroidApiStatus").textContent = greeting
    ? `Chat break preview built (${greeting.length}/${sectionMeta.opening.max} characters).`
    : "Scene Setting is empty. Generate or write one first.";
  return payload;
}

async function sendKindroidChatBreak(options = {}) {
  saveKindroidApiFromControls();
  const target = selectedKindroidTarget();
  const apiKey = state.kindroidApi.apiKey;
  const payload = buildKindroidChatBreakPayload();
  if (value("kindroidChatBreakConfirm").trim() !== "CHAT BREAK") {
    $("kindroidApiStatus").textContent = "Type CHAT BREAK before sending a chat break.";
    updateKindroidPushButtonState();
    return null;
  }
  if (!target) {
    $("kindroidApiStatus").textContent = "Choose or save a Kindroid target first.";
    return null;
  }
  if (!apiKey) {
    $("kindroidApiStatus").textContent = "Enter a Kindroid API key first.";
    return null;
  }
  if (!payload.greeting) {
    $("kindroidApiStatus").textContent = "Scene Setting is empty. Generate or write one first.";
    return null;
  }
  const button = options.button || $("kindroidChatBreakButton");
  const originalText = button?.textContent || "";
  if (button) {
    button.disabled = true;
    button.textContent = "Sending...";
  }
  clearApiError();
  $("kindroidApiStatus").textContent = `Sending chat break to ${target.name}...`;
  try {
    const result = await sendKindroidChatBreakWithApi(apiKey, payload);
    const historyItem = {
      timestamp: new Date().toISOString(),
      targetName: target.name,
      aiId: target.aiId,
      status: `Chat break HTTP ${result.status || 200}`,
      fields: ["greeting", payload.wipe_cascaded ? "wipe_cascaded" : "keep_cascaded"],
      kinforgeVersion: document.querySelector(".version-badge")?.textContent.trim() || "",
    };
    state.kindroidApi.pushHistory = [historyItem, ...(state.kindroidApi.pushHistory || [])].slice(0, 20);
    renderKindroidPushHistory();
    setValue("kindroidChatBreakConfirm", "");
    updateKindroidPushButtonState();
    $("kindroidApiStatus").textContent = `Chat break sent to ${target.name}.`;
    $("statusPill").textContent = "Kindroid chat break complete";
    saveDraft();
    return result;
  } catch (error) {
    console.warn(error);
    showApiError(error, "Kindroid Chat Break");
    $("kindroidApiStatus").textContent = `Chat break failed: ${error.message.slice(0, 80)}`;
    return null;
  } finally {
    if (button) {
      button.textContent = originalText;
      updateKindroidPushButtonState();
    }
  }
}

async function pushKindroidThenChatBreak() {
  const button = $("kindroidPushAndChatBreakButton");
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Pushing...";
  const pushed = await pushKindroidPreviewToApi();
  if (pushed && value("kindroidChatBreakConfirm").trim() === "CHAT BREAK") {
    button.textContent = "Chat break...";
    await sendKindroidChatBreak({ button });
  }
  button.textContent = originalText;
  updateKindroidPushButtonState();
}

async function validateKindroidApiKey() {
  saveKindroidApiFromControls();
  const key = state.kindroidApi.apiKey;
  const target = selectedKindroidTarget();
  if (!key) {
    $("kindroidApiStatus").textContent = "No Kindroid API key entered.";
    return;
  }
  if (!/^kn_[A-Za-z0-9_\-]+/.test(key)) {
    $("kindroidApiStatus").textContent = "Key format looks unusual. Kindroid keys usually start with kn_.";
    return;
  }
  if (!target?.aiId) {
    $("kindroidApiStatus").textContent = "Key format looks valid. Save/select a target ai_id to run a network test.";
    saveDraft();
    return;
  }
  const button = $("testKindroidApiButton");
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Testing...";
  clearApiError();
  $("kindroidApiStatus").textContent = `Testing Kindroid API against ${target.name}...`;
  try {
    const result = await fetchKindroidChatWithApi(key, {
      aiId: target.aiId,
      groupId: "",
      limit: 1,
      startAfterTimestamp: "",
    });
    $("kindroidApiStatus").textContent = `Kindroid API test passed for ${target.name}. ${result.messages?.length || 0} message${(result.messages?.length || 0) === 1 ? "" : "s"} visible.`;
    $("statusPill").textContent = "Kindroid API connected";
  } catch (error) {
    console.warn(error);
    showApiError(error, "Kindroid API Test");
    $("kindroidApiStatus").textContent = `Kindroid API test failed: ${error.message.slice(0, 80)}`;
  } finally {
    button.disabled = false;
    button.textContent = originalText;
    saveDraft();
  }
}

function buildAesthetic(p) {
  if (/chef|kitchen|restaurant/i.test(p.coreIdea)) return "clean work clothes, rolled sleeves, precise hands, one elegant detail kept spotless.";
  if (/occult|witch|archive|cursed/i.test(p.coreIdea + p.genre)) return "dark tailored layers, old jewelry, polished shoes, ink or candle-wax details.";
  if (/fighter|champion|arena|shonen/i.test(p.coreIdea + p.genre)) return "training layers, practical wraps, bright accent color, visible movement in every stance.";
  return "practical clothes with one personal signature: jewelry, jacket, scent, color, or worn tool.";
}

function buildConcretePreferences(p) {
  const text = conceptText(p);
  if (/chef|kitchen|restaurant|bakery|food/.test(text)) {
    return {
      likes: "strong coffee before sunrise, sharp citrus, handwritten recipe cards, and quiet meals after closing.",
      dislikes: "dull knives, sweet wine, sticky counters, and delivery windows that mean nothing.",
    };
  }
  if (/photo|camera|lens|image|portrait/.test(text)) {
    return {
      likes: "matte photo paper, secondhand lenses, strong tea, contact sheets, and long walks before crowds arrive.",
      dislikes: "fingerprints on glass, fluorescent dressing rooms, vague briefs, and clients who arrive forty minutes late.",
    };
  }
  if (/detective|investigator|case|crime|spy/.test(text)) {
    return {
      likes: "black coffee, crossword puzzles, baseball radio, clean notebooks, and diners with corner booths.",
      dislikes: "speakerphone calls, crowded elevators, sloppy timestamps, cold fries, and unnecessary paperwork.",
    };
  }
  if (/doctor|nurse|medic|clinic|healer/.test(text)) {
    return {
      likes: "peppermint tea, comfortable shoes, puzzle books, early grocery runs, and ten quiet minutes after a shift.",
      dislikes: "buzzing lights, missing pens, lukewarm soup, blocked hallways, and meetings without an agenda.",
    };
  }
  if (/occult|witch|archive|cursed|ritual|ghost/.test(text)) {
    return {
      likes: "linen bookmarks, bitter chocolate, old maps, beeswax polish, and instrumental records played softly.",
      dislikes: "creased pages, scented candles near paper, wet umbrellas indoors, cheap tape, and people who dog-ear books.",
    };
  }
  if (/fighter|champion|arena|shonen|warrior|rival/.test(text)) {
    return {
      likes: "spicy noodles, roadwork at dawn, old fight recordings, heavy blankets, and repairing worn training gear.",
      dislikes: "loose wraps, sugary drinks, crowded locker rooms, idle boasting, and anyone touching their equipment.",
    };
  }
  return {
    likes: "dark roast coffee, used bookstores, spicy food, late-evening walks, and fixing small household problems.",
    dislikes: "fluorescent lighting, crowded elevators, cold coffee, sloppy handwriting, and appointments that start late.",
  };
}

function buildTextureDetails(p) {
  const text = conceptText(p);
  const place = p.currentLocation ? `${p.currentLocation} adds local texture through ` : "";
  if (/chef|kitchen|restaurant|bakery|food/.test(text)) return "Steel counters stay cool under flour-dusted hands; exhaust fans drone over knife work, hot pans, citrus peel, and damp delivery crates.";
  if (/photo|camera|lens|image|portrait/.test(text)) return "Canvas backdrops collect dust beside warm lamps, metal stands, chemical-clean print trays, padded cases, and the soft click of lens caps.";
  if (/detective|investigator|case|crime|spy/.test(text)) return "The office smells of copier heat and old coffee; file drawers stick, radios mutter, and street noise leaks through thin windows.";
  if (/doctor|nurse|medic|clinic|healer/.test(text)) return "Vinyl chairs, paper gowns, sanitizer, rolling carts, muted alarms, and overworked climate control define the clinic's physical rhythm.";
  if (/occult|witch|archive|cursed|ritual|ghost/.test(text)) return "Dry paper, cotton gloves, brass drawer pulls, low reading lamps, repair paste, and climate-controlled air keep the archive tactile and precise.";
  return `${place}worn wood, humming appliances, transit noise, practical tools, familiar food smells, and changing light give their rooms a used, specific texture.`;
}

function buildFastFacts(p) {
  const text = conceptText(p);
  if (/chef|kitchen|restaurant|bakery|food/.test(text)) return "Can sharpen a knife by ear, plays weekend pool badly, and is the coworker called when a sauce or schedule breaks.";
  if (/photo|camera|lens|image|portrait/.test(text)) return "Repairs camera straps by hand, keeps a folding bicycle, and remembers faces better than names.";
  if (/detective|investigator|case|crime|spy/.test(text)) return "Restores old radios, cannot whistle, and has a reputation for writing reports that survive hostile review.";
  if (/doctor|nurse|medic|clinic|healer/.test(text)) return "Grows herbs on a windowsill, knows basic sign language, and is trusted with difficult families.";
  if (/occult|witch|archive|cursed|ritual|ghost/.test(text)) return "Binds small notebooks, hates card games, and can identify several paper stocks by touch.";
  return "Can mend a torn hem, keeps a battered chess set, and is usually trusted with keys, schedules, or difficult errands.";
}

function buildCurrent(p) {
  const nextAction = preservesVoluntaryStayPremise(p)
    ? `${p.name} is deciding whether to extend one more ordinary day instead of packing up.`
    : `${p.name} intends to gather the next useful fact before choosing what to do.`;
  return `${buildImmediateProblem(p)} ${nextAction}`;
}

function relationshipConstraint(p) {
  const preset = p.relationshipPreset && p.relationshipPreset !== "Infer" ? p.relationshipPreset : "Infer";
  const normalized = preset.toLowerCase();
  if (normalized === "strangers") {
    return {
      level: "stranger",
      contact: "a first meeting",
      knowsName: false,
      summary: "They have never met; no trust, shared history, emotional familiarity, or assumptions about compatibility exist yet.",
      openingReason: "an immediate practical question gives them a reason to speak before names or trust matter",
      greetingAddress: "Excuse me",
      exampleLine: `"Excuse me," ${p.name} says, keeping one hand on the clipboard. "Did you see anyone touch the box by the counter?"`,
      playerAngle: "The player is a stranger drawn in by the immediate situation. Their first reply can answer, ask what happened, or decide whether to get involved.",
    };
  }
  if (/client|professional|boss|employee|neighbor|roommate|witness|suspect|handler|asset|mentor|student|leverage/.test(normalized)) {
    return {
      level: "role-bound",
      contact: preset,
      knowsName: true,
      summary: "They know role-relevant facts, obligations, and recent contact, but the relationship still has clear boundaries.",
      openingReason: "the role gives them a practical reason to exchange information without assuming intimacy",
      greetingAddress: p.userName,
      exampleLine: `"${p.userName}," ${p.name} says, setting the paperwork between them. "Before this gets more complicated, tell me exactly what you were asked to sign."`,
      playerAngle: `The player knows ${p.name} through ${preset}. Their reply can clarify facts, challenge the Kin's read, or decide how much to cooperate.`,
    };
  }
  if (/old friends|friend/.test(normalized)) {
    return {
      level: "friend",
      contact: preset,
      knowsName: true,
      summary: "Trust and shared history exist, so jokes, frustration, and meaningful questions are allowed without dumping deepest wounds immediately.",
      openingReason: "old familiarity lets them skip small talk, but the scene still begins with today's concrete problem",
      greetingAddress: p.userName,
      exampleLine: `"${p.userName}," ${p.name} says, managing a tired smile. "Before you make that face, yes, I know exactly how bad this looks."`,
      playerAngle: "The player is an old friend who can answer with familiarity, challenge the Kin, or ask what has changed since they last talked.",
    };
  }
  if (/exes|old flame/.test(normalized)) {
    return {
      level: "former-intimate",
      contact: preset,
      knowsName: true,
      summary: "They have history and private shorthand, but current trust is complicated rather than automatic.",
      openingReason: "unfinished history sharpens the practical problem without making reconciliation instant",
      greetingAddress: p.userName,
      exampleLine: `"${p.userName}," ${p.name} says, pausing just long enough for the old history to show. "I would not have called if this could wait."`,
      playerAngle: `The player has past intimacy with ${p.name}; their reply can lean into old trust, set boundaries, or ask why now.`,
    };
  }
  if (/rival|co-conspirator|protector|protected/.test(normalized)) {
    return {
      level: "acquaintance",
      contact: preset,
      knowsName: true,
      summary: "They have practical familiarity, friction, or shared pressure, but vulnerability still has to be earned.",
      openingReason: "prior contact gives them a reason to challenge, negotiate, or coordinate",
      greetingAddress: p.userName,
      exampleLine: `"${p.userName}," ${p.name} says, not quite smiling. "Try not to enjoy being right until after we know what broke."`,
      playerAngle: `The player knows ${p.name} through ${preset}; their reply can push back, cooperate, or test the limits of the arrangement.`,
    };
  }
  return {
    level: "practical",
    contact: preset,
    knowsName: true,
    summary: "The relationship is defined by the supplied dynamic and should begin with practical contact before emotional escalation.",
    openingReason: "the current situation gives them a reason to talk",
    greetingAddress: p.userName,
    exampleLine: `"${p.userName}," ${p.name} says, glancing from the problem back to the door. "Tell me what you noticed first."`,
    playerAngle: `The player has a concrete reason to speak with ${p.name}; their reply can offer information, refuse, or ask what is at stake.`,
  };
}

function buildDetails(p) {
  if (/scar|tattoo|piercing|jewelry|makeup/i.test(p.coreIdea + p.genre)) return "specific scars, tattoos, jewelry, makeup, or piercings from the concept";
  return "subtle personal details, realistic grooming, and one memorable accessory";
}

function buildOpeningGreeting(p) {
  if (isWorldKin(p)) {
    const place = p.currentLocation || p.world?.places || "the starting location";
    return compact(
      `Scene Setting\n*${place} opens around ${p.userName} with ordinary noise first: footsteps, work, weather, and people already mid-routine. No one explains the whole world at once.*\n\n*The scene offers three reachable points of contact: someone busy, somewhere useful, and one small problem with visible consequences.*\n\n*"Choose where you go first, and the world will answer through whoever you approach."*`,
      sectionMeta.opening.max,
    );
  }
  if (isMultiCharacterKin(p)) {
    const members = p.ensembleMembers || `${p.name}'s small circle`;
    return compact(
      `Scene Setting\n*${members} are already in motion when ${p.userName} arrives. One person handles the practical problem, another notices the interruption, and a third, if present, makes the silence louder.*\n\n*Speaker labels stay clear so no voice blends into another.*\n\n*${p.name}: "Good timing. We need one outside opinion before this turns into three different bad plans. What did you walk in on from your side?"*`,
      sectionMeta.opening.max,
    );
  }
  const relation = relationshipConstraint(p);
  const address = relation.greetingAddress;
  const concept = conceptText(p);
  const vehicleCompetent = /\b(rv|van|trailer|vehicle|car|mechanic|engine|garage|road|tow|fuel)\b/i.test(concept);
  const voluntaryStay = preservesVoluntaryStayPremise(p);
  const environmentPlace = buildEnvironmentDetails(p).split(",")[0] || "the room";
  const place = relation.level === "stranger" && vehicleCompetent
    ? "Outside the RV near a row of small-town storefronts"
    : relation.level === "stranger"
      ? environmentPlace.replace(/\b(?:inside|in)\s+(?:the|her|his|their)\s+(?:home|bedroom|rv|vehicle|apartment|private office|back room)\b/gi, "near the entrance")
      : environmentPlace;
  const heatLine = p.dramaHeat === "Low"
    ? "The moment is ordinary enough that small choices carry more weight than they should."
    : p.dramaHeat === "High"
      ? "A decision is waiting, but it has not turned into a crisis yet."
      : p.dramaHeat === "Volatile but coherent"
        ? "The scene is controlled on the surface, with more restraint than certainty."
        : "The situation is practical, immediate, and still small enough to handle honestly.";
  const chemistryLine = /Fast|direct|Volatile|Competitive/i.test(p.chemistry)
    ? relation.level === "stranger" ? "They keep the distance professional despite the pressure." : "They skip the soft opening."
    : "They keep their voice measured and their hands busy.";
  const firstAction = relation.level === "stranger"
    ? `${place} is mid-task when ${p.name} notices a stranger nearby: a half-finished errand, a folded list, and a reason to ask one ordinary question. ${heatLine} ${chemistryLine}`
    : `${place} is mid-task when ${p.name} notices ${p.userName}: a half-finished errand, a folded list, and a choice they have been postponing. ${heatLine} ${chemistryLine}`;
  const finalQuestion = relation.level === "stranger"
    ? voluntaryStay ? "Do you know if the diner here is worth staying for, or is it just the only one open?" : vehicleCompetent ? "Do you know a decent place around here to get coffee and local directions?" : "Start simple. Did you notice who was handling this counter?"
    : voluntaryStay ? "Tell me the honest version. Am I making excuses to stay, or finally making a choice?" : vehicleCompetent ? "I am not stuck. I am just deciding whether leaving today is actually the point." : "Start with the useful part. What did you notice first?";
  const initialLine = relation.level === "stranger"
    ? voluntaryStay ? "Sorry, quick question. You look like you know where people actually eat around here." : vehicleCompetent ? "Sorry, quick question. I am trying to get my bearings." : "Sorry, quick question."
    : voluntaryStay ? "I was going to leave this morning. Then I made a list instead." : vehicleCompetent ? "I am road-ready. That is not the same as wanting to go." : "Tell me you caught that too.";
  return compact(
    `Scene Setting\n*${firstAction}*\n\n*"${address}," ${p.name} says, glancing from the errand back to the street. "${initialLine}"*\n\n*They leave a little space in the conversation, careful not to turn a first meeting into a confession.*\n\n*"${finalQuestion}"*`,
    sectionMeta.opening.max,
  );
}

function buildOpeningVariant(p, variant) {
  const place = buildEnvironmentDetails(p).split(",")[0] || "the room";
  const relation = relationshipConstraint(p);
  if (relation.level === "stranger") {
    const strangerOpeners = {
      quiet: `*${place} has settled into a slow hour. ${p.name} looks up from a folded list as a stranger pauses nearby, close enough to answer without being pulled into anything private.*\n\n*"Excuse me," ${p.name} says. "Do you know whether this place serves breakfast all day, or is that wishful thinking?"*\n\n*They tap the edge of the paper once, then give the stranger room to decline.*\n\n*"A simple yes or no is fine."*`,
      conflict: `*${place} is busy enough that small delays become irritating. ${p.name} steps aside before blocking the stranger's path, one hand still holding a receipt they clearly disagree with.*\n\n*"Sorry," ${p.name} says. "Quick local question. Is this counter always this slow, or did I pick a bad morning?"*\n\n*Their tone is dry rather than desperate.*\n\n*"I am trying to decide whether to wait or come back later."*`,
      mystery: `*${place} carries one small detail ${p.name} cannot place: a changed sign, a locked side door, a name everyone seems to know. They notice the stranger nearby and keep the question modest.*\n\n*"Excuse me," ${p.name} says. "Do people around here still use the noticeboard, or is it just decoration?"*\n\n*They nod toward it without stepping closer.*\n\n*"I am trying to learn the rules before I trip over them."*`,
    };
    return compact(strangerOpeners[variant] || strangerOpeners.quiet, sectionMeta.opening.max);
  }
  const playerName = p.userName;
  const openers = {
    quiet: `*${place} has gone still around ${p.name}, the kind of quiet that makes every small sound feel chosen. They look up when ${playerName} arrives, their hand resting beside the one thing they have not been able to explain away.*\n\n*"I wasn't sure you would come," ${p.name} says. "Part of me hoped you would not. That would have made this easier to keep buried."*\n\n*They leave space between the truth and the asking, close enough for the player to step into it.*\n\n*"If you stay, I need you to ask the question everyone else keeps avoiding."*`,
    conflict: `*${place} is already tense when ${playerName} arrives. ${p.name} does not soften their posture or hide the evidence on the table; if anything, they make sure it is impossible to ignore.*\n\n*"Good," ${p.name} says. "You are here. Now tell me whether you came to help, accuse me, or pretend those are different things."*\n\n*Their voice is controlled, but the room is not. Something has broken open, and waiting will only decide the wrong answer for both of them.*\n\n*"Choose quickly. I am done being the only one with something to lose."*`,
    mystery: `*${place} carries one detail that does not belong: a mark, a sound, a message left where only ${playerName} would notice it. ${p.name} stands beside it like they arrived too late to stop the story from starting.*\n\n*"You recognize it, don't you?" ${p.name} asks. "That is the part I cannot make sense of."*\n\n*They turn the clue just enough for the light to catch it, but not enough to surrender it completely.*\n\n*"Tell me what you know before I decide whether finding you was luck or a warning."*`,
  };
  return compact(openers[variant] || openers.quiet, sectionMeta.opening.max);
}

function buildFallbackSceneVariants() {
  const p = buildProfile();
  return {
    quiet: buildOpeningVariant(p, "quiet"),
    conflict: buildOpeningVariant(p, "conflict"),
    mystery: buildOpeningVariant(p, "mystery"),
  };
}

function buildPlayerRelationship(p) {
  if (isWorldKin(p)) {
    return compact(
      `Relationship Context\n${p.userName} is the protagonist, visitor, resident, investigator, traveler, or other active role inside the setting. The player replies by choosing actions, questions, directions, and which NPCs deserve Journal Manager entries.`,
      350,
    );
  }
  if (isMultiCharacterKin(p)) {
    return compact(
      `Relationship Context\n${p.userName} relates to each member separately. Replies should make clear who is being addressed, which relationship is changing, and whether the scene includes the whole group or only one person.`,
      350,
    );
  }
  const relation = relationshipConstraint(p);
  const heat = p.dramaHeat === "Low" ? "low-pressure" : p.dramaHeat === "High" ? "urgent" : p.dramaHeat === "Volatile but coherent" ? "volatile" : "charged";
  return compact(
    `Relationship Context\n${relation.playerAngle} The scene setting gives the player a ${heat}, practical reason to respond. ${relation.summary}`,
    350,
  );
}

function buildPlayerProfile(p) {
  const player = buildPlayerPayload();
  const gender = player.gender === "Infer" ? "adult" : player.gender;
  const ethnicity = player.ethnicity === "Infer" ? "" : `${player.ethnicity}, `;
  const notes = player.notes ? ` ${sentence(player.notes, "")}` : "";
  const angle = `Designed to contrast and connect with ${p.name}: steady where the Kin is guarded, curious where the Kin hides, and present enough to matter.`;
  return compact(`User Persona\n${player.name}, ${player.age}, ${ethnicity}${gender}. ${angle}${notes}`, 450);
}

function identityForGalleryPrompt(p) {
  const avatar = value("avatarOutput") || buildVisualSpec(p).portrait;
  return compact(
    [
      p.name,
      p.apparentAge ? `appears ${p.apparentAge}` : `${p.age} years old`,
      p.gender,
      avatar.replace(/\n/g, ", "),
    ].filter(Boolean).join(", "),
    220,
  );
}

function gallerySceneContext(p) {
  return compact([p.currentLocation, p.occupation, p.secondaryOccupation, p.education, p.genre, p.world?.summary, p.texture, p.dynamic].filter(Boolean).join("; "), 180);
}

function buildGalleryPrompt(p, kind) {
  const identity = identityForGalleryPrompt(p);
  const context = gallerySceneContext(p);
  const scenes = {
    dinner: `Dinner scene: ${identity}. Eating or preparing a meal in a setting that fits the backstory; include natural clothing, table details, warm realistic light, and one story-relevant object. Context: ${context}.`,
    outdoor: `Outdoor scene: ${identity}. Choose a fitting outdoor activity such as hiking, camping, beach, swimming, park walk, street errand, or campus/work commute; natural clothing, environmental detail. Context: ${context}.`,
    intimate: `Intimate non-nude scene: ${identity}. Dim soft light, dressed in tasteful lingerie, sleepwear, robe, or fitted lounge clothes; private room, relaxed pose, adult sensual mood, no nudity. Context: ${context}.`,
    public: `Public scene: ${identity}. In a believable public place tied to work or routine, such as cafe, street, library, shop, campus, workplace, lobby, or event; candid documentary style. Context: ${context}.`,
    casual: `Casual downtime scene: ${identity}. Sitting around at home or a familiar quiet place, coffee, book, phone, music, chores, couch, desk, or floor cushions; relaxed everyday clothing. Context: ${context}.`,
  };
  return compact(scenes[kind] || scenes.casual, 450);
}

function fallbackRerollSection(sectionKey) {
  const sections = fillMissingSections(parseOutputSections(generateKindroid()));
  if (sections[sectionKey]) return stripSectionLabel(sections[sectionKey], sectionKey);
  return "";
}

function setSceneVariants(variants) {
  Object.entries(variantOutputs).forEach(([key, id]) => {
    setValue(id, cleanGreetingText(stripSectionLabel(variants[key] || "", "opening")));
  });
}

function inferTypes(p) {
  const text = `${p.coreIdea} ${p.personality} ${p.dynamic} ${p.why} ${p.wound} ${p.dream} ${p.complication}`.toLowerCase();
  const has = (...words) => words.some((word) => text.includes(word));

  let mbti = "INFJ";
  if (has("strateg", "architect", "control", "plan", "mastermind", "perfectionist", "system")) mbti = "INTJ";
  else if (has("debate", "trickster", "invent", "chaos", "provoc", "curious", "experiment")) mbti = "ENTP";
  else if (has("perform", "spark", "wander", "possibility", "inspire", "ideal", "restless")) mbti = "ENFP";
  else if (has("repair", "mechanic", "medic", "tactical", "precise", "hands", "practical")) mbti = "ISTP";
  else if (has("caretaker", "duty", "ritual", "home", "memory", "protect", "service")) mbti = "ISFJ";
  else if (has("command", "manager", "authority", "order", "executive", "captain")) mbti = "ESTJ";
  else if (has("stage", "sensual", "performer", "pleasure", "spotlight", "impulsive")) mbti = "ESFP";

  let tritype = "459";
  if (has("power", "control", "competence", "survive", "tactical", "ambition")) tritype = "358";
  else if (has("shame", "identity", "longing", "withdraw", "dream", "hidden")) tritype = "459";
  else if (has("freedom", "ideal", "rebel", "reinvent", "principle", "possibility")) tritype = "471";
  else if (has("guarded", "expert", "intense", "private", "dominance", "risk")) tritype = "538";
  else if (has("loyal", "fear", "security", "belong", "family", "protect")) tritype = "629";
  else if (has("bold", "hunger", "pleasure", "fight", "champion", "defy")) tritype = "748";
  else if (has("success", "image", "influence", "steel", "status", "win")) tritype = "853";
  else if (has("peace", "avoid", "beauty", "gentle", "observe", "distance")) tritype = "947";

  return { mbti, tritype };
}

function isAiAppearance(valueText) {
  return !valueText || /^ai$/i.test(valueText) || /^infer$/i.test(valueText);
}

function appearanceChoice(appearance, key, fallback, randomChoices = []) {
  const raw = String(appearance?.[key] || "").trim();
  if (/^random$/i.test(raw)) {
    return pick(randomChoices.length ? randomChoices : [fallback], `${key} ${value("coreIdea")} ${value("kindroidName")}`);
  }
  if (!isAiAppearance(raw)) return raw;
  return fallback;
}

function describeHairColor(appearance, fallback) {
  const custom = String(appearance?.hairColorCustom || "").trim();
  if (custom && !isAiAppearance(custom) && !/^random$/i.test(custom)) return custom;
  const color = appearanceChoice(appearance, "hairColor", fallback, ["Black", "Dark Brown", "Brown", "Light Brown", "Auburn", "Copper", "Ginger", "Strawberry Blonde", "Blonde", "Platinum", "Gray", "White"]);
  const descriptions = {
    Black: "natural black hair",
    "Dark Brown": "natural dark brown hair",
    Brown: "natural brown hair",
    "Light Brown": "natural light brown hair",
    Auburn: "natural auburn hair",
    Copper: "natural copper-red hair",
    Ginger: "natural ginger hair",
    "Strawberry Blonde": "natural strawberry-blonde hair",
    Blonde: "natural blonde hair",
    Platinum: "platinum blonde hair",
    Gray: "natural gray hair",
    White: "white hair",
    Fantasy: "distinct fantasy-colored hair",
  };
  return descriptions[color] || color || fallback;
}

function describeEyeColor(appearance, fallback) {
  const color = appearanceChoice(appearance, "eyeColor", fallback, ["Brown", "Hazel", "Green", "Blue", "Gray", "Amber", "Black"]);
  const descriptions = {
    Brown: "natural brown eyes",
    Hazel: "natural hazel eyes",
    Green: "natural green eyes",
    Blue: "natural blue eyes",
    Gray: "natural gray eyes",
    Amber: "natural amber eyes",
    Black: "natural very dark eyes",
    Fantasy: "distinct fantasy-colored eyes",
  };
  return descriptions[color] || color || fallback;
}

function buildVisualSpec(p) {
  const source = `${p.coreIdea} ${p.genre} ${p.species} ${p.personality}`.toLowerCase();
  const appearance = p.appearance || {};
  const age = p.apparentAge || `${p.age}-year-old`;
  const species = p.species && !/^(?:human|infer)$/i.test(p.species) ? p.species : "";
  const gender = [p.gender || "adult", species].filter(Boolean).join(" ");
  const inferredSkin = source.includes("olive") ? "olive skin with natural texture"
    : source.includes("dark skin") || source.includes("deep skin") ? "deep brown skin with natural texture"
      : source.includes("pale") ? "pale skin with natural texture"
        : source.includes("sun") || source.includes("desert") ? "warm medium skin with natural texture"
          : "natural skin texture";
  const skin = appearanceChoice(appearance, "skinTone", inferredSkin, ["pale skin with natural texture", "olive skin with natural texture", "warm medium skin with natural texture", "deep brown skin with natural texture"]);
  const inferredHair = source.includes("copper") ? "natural copper-red hair"
    : source.includes("auburn") ? "natural auburn hair"
      : source.includes("platinum") ? "platinum blonde hair"
        : source.includes("ash blonde") ? "ash blonde hair"
          : source.includes("silver") || source.includes("gray") ? "silver-gray hair"
            : source.includes("red") ? "natural red hair"
              : source.includes("black") ? "black hair"
                : source.includes("brown") ? "brown hair"
                  : source.includes("dark") ? "dark hair"
                    : "natural hair color";
  const hairColor = describeHairColor(appearance, inferredHair);
  const hairLength = appearanceChoice(appearance, "hairLength", "", ["short", "chin-length", "shoulder-length", "long"]);
  const hairTexture = appearanceChoice(appearance, "hairTexture", "", ["straight", "wavy", "curly", "coily"]);
  const hairstyle = appearanceChoice(appearance, "hairstyle", "", ["side-parted", "loose", "tied back", "messy bun"]);
  const hair = [hairLength, hairTexture, hairstyle, hairColor].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  const inferredEyes = source.includes("hazel") ? "natural hazel eyes"
    : source.includes("green") ? "natural green eyes"
      : source.includes("blue") ? "natural blue eyes"
        : source.includes("gray eyes") || source.includes("grey eyes") ? "natural gray eyes"
          : source.includes("brown") ? "natural brown eyes"
            : "natural clear eyes";
  const eyes = describeEyeColor(appearance, inferredEyes);
  const eyeShape = appearanceChoice(appearance, "eyeShape", "", ["hooded", "almond", "round", "deep-set"]);
  const inferredBuild = source.includes("soft build") || source.includes("soft body") ? "soft build"
    : source.includes("broad") ? "broad build"
      : source.includes("heavy") || source.includes("large body") ? "heavy build"
        : source.includes("thin") || source.includes("slender") ? "thin build"
          : source.includes("fighter") || source.includes("athlete") || source.includes("champion") ? "athletic build"
            : source.includes("chef") || source.includes("medic") ? "sturdy practical build"
              : "medium adult build";
  const build = appearanceChoice(appearance, "bodyBuild", inferredBuild, ["petite build", "thin build", "medium adult build", "soft build", "broad build", "heavyset build"]);
  const muscle = appearanceChoice(appearance, "muscleTone", "", ["soft muscle tone", "lightly toned body", "sturdy muscle tone", "athletic muscle tone"]);
  const height = appearanceChoice(appearance, "heightScale", "proportionate height impression", ["very short height impression", "short height impression", "average height", "tall height impression", "very tall height impression"]);
  const bodyShape = appearanceChoice(appearance, "bodyShape", "", ["rectangle body shape", "pear body shape", "apple body shape", "hourglass body shape", "inverted triangle body shape"]);
  const features = appearanceChoice(appearance, "distinctiveFeatures", "", ["light freckles", "beauty mark", "small scar", "glasses", "birthmark", "dimples", "gap teeth"]);
  const marks = features || (source.includes("birthmark") ? "visible birthmark"
    : source.includes("tattoo") ? "visible tattoo"
      : source.includes("piercing") ? "visible piercing"
        : source.includes("scar") ? "visible scar"
          : source.includes("freckle") ? "light freckles"
            : "slightly uneven brows");
  const inferredFaceShape = source.includes("round face") ? "round face"
    : source.includes("square face") ? "square face"
      : source.includes("heart-shaped") ? "heart-shaped face"
        : source.includes("angular") ? "angular face"
          : "slightly asymmetrical face";
  const faceChoice = appearanceChoice(appearance, "faceShape", inferredFaceShape, ["round face", "oval face", "square face", "heart-shaped face", "angular face", "long face"]);
  const faceShape = `${faceChoice}`.match(/\bface\b/i) ? faceChoice : `${faceChoice.toLowerCase()} face`;
  const nose = appearanceChoice(appearance, "noseShape", source.includes("broad nose") ? "broad nose" : source.includes("crooked nose") ? "slightly crooked nose" : "straight nose", ["straight nose", "slightly crooked nose", "broad nose", "narrow nose", "rounded nose"]);
  const lips = appearanceChoice(appearance, "lipShape", "defined lips", ["defined lips", "full lips", "thin lips", "wide mouth", "uneven smile"]);
  const brows = appearanceChoice(appearance, "browShape", "uneven brows", ["straight brows", "arched brows", "thick brows", "fine brows", "uneven brows"]);
  const jaw = appearanceChoice(appearance, "jawline", source.includes("soft jaw") ? "soft jawline" : source.includes("strong chin") ? "strong chin" : "defined but realistic jawline", ["soft jawline", "defined jawline", "square jawline", "strong chin", "narrow jawline"]);
  const distinctiveness = appearanceChoice(appearance, "facialDistinctiveness", "Average");
  const distinctFeature = distinctiveness === "Highly distinctive" ? "memorable realistic asymmetry" : distinctiveness === "Distinctive" ? "subtle facial asymmetry" : "";
  const speciesFeature = /cat\s*girl|catgirl|neko/i.test(p.species || "") ? "visible cat ears, cat tail"
    : /goliath/i.test(p.species || "") ? "powerful goliath build, stone-gray skin markings"
      : /vampire/i.test(p.species || "") ? "subtle fangs"
        : /android|synthetic|robot/i.test(p.species || "") ? "subtle synthetic facial seams"
          : /fae|elf/i.test(p.species || "") ? "slightly pointed ears"
            : species;
  const eyeText = eyeShape ? `${eyeShape} ${eyes}` : eyes;
  const ethnicity = appearanceChoice(appearance, "appearanceEthnicity", "", ["mixed ethnicity", "East Asian", "Black", "Latine", "Middle Eastern", "South Asian", "white"]);
  const clothing = appearanceChoice(appearance, "appearanceClothing", "");
  const expression = appearanceChoice(appearance, "appearanceExpression", "");
  const pose = appearanceChoice(appearance, "appearancePose", "close portrait");
  const lighting = appearanceChoice(appearance, "appearanceLighting", "");
  const presentation = [pose, expression, clothing, lighting].filter(Boolean).join(", ");
  const face = `${faceShape}, ${eyeText}, ${brows}, ${nose}, ${lips}, ${jaw}, ${skin}, ${speciesFeature}, ${marks || distinctFeature}`.replace(/,\s*,/g, ",");
  return {
    skin,
    hair,
    eyes,
    build: [height, build, muscle, bodyShape].filter(Boolean).join(", "),
    ethnicity,
    faceDetail: `${faceShape}, ${nose}, ${lips}, ${jaw}`,
    portrait: compactPortraitPrompt(`${age} ${gender}, ${ethnicity}, ${skin}, ${hair}, ${eyes}, ${faceShape}, ${nose}, ${speciesFeature}, ${marks || distinctFeature}, ${presentation}.`, 180),
    physical: compact(`${age} ${gender}, ${ethnicity}, ${height}, ${build}, ${muscle}, ${bodyShape}, ${skin}, ${hair}, ${eyes}, ${faceShape}, ${nose}, ${lips}, ${jaw}, ${speciesFeature}, ${marks || distinctFeature}.`, 500),
    face: compact(face, 180),
  };
}

function normalizeVisualSection(text, heading, max, fallback, sectionKey = "", avatarText = "") {
  const withoutHeading = String(text || "")
    .replace(new RegExp(`^\\s*\\*?${heading}\\*?[.:]?\\s*`, "i"), "")
    .replace(/\b(mysterious|haunting|enigmatic|soulful|wistful|melancholy|confident|vulnerable|commanding|gentle|fierce|warm|intense)\b/gi, "")
    .replace(/\b(vibe|aura|presence|story|past|secrets?|emotion|mood|personality|energy)\b/gi, "")
    .replace(/\b(wearing|clothes|clothing|outfit|dress|shirt|jacket|uniform|jewelry|makeup|accessory|accessories)\b[^,.]*/gi, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.])/g, "$1")
    .replace(/,\s*,/g, ",")
    .trim();
  const locked = lockedVisualAttributes(avatarText, sectionKey);
  const prioritized = prioritizeLockedVisuals(cleanAbsentVisualClaims(withoutHeading || fallback), locked);
  const cleaned = sectionKey === "portrait" ? compactPortraitPrompt(prioritized, max) : tidyVisualBody(prioritized, max);
  return cleaned;
}

function lockedVisualAttributes(avatarText, sectionKey) {
  const text = String(avatarText || "");
  const lineValue = (label) => {
    const match = text.match(new RegExp(`^\\s*${label}:\\s*(.+)$`, "im"));
    return match ? match[1].trim().replace(/[.;]+$/, "") : "";
  };
  const details = lineValue("Details");
  const detailLocks = details
    .split(/[,;]/)
    .map((item) => item.trim())
    .filter((item) => !/\b(no|none|without|absent|nothing|not visible)\b/i.test(item))
    .filter((item) => /\b(freckles?|scars?|birthmarks?|glasses|tattoos?|piercings?|facial hair|beard|mustache|moustache)\b/i.test(item));
  const common = [
    lineValue("Age"),
    lineValue("Gender"),
    lineValue("Ethnicity/Race"),
    lineValue("Skin"),
    lineValue("Hair"),
    lineValue("Eyes"),
  ];
  const physicalOnly = [lineValue("Build")];
  const faceOnly = [lineValue("Face")];
  const locks = sectionKey === "face"
    ? [lineValue("Skin"), lineValue("Eyes"), ...faceOnly, ...detailLocks]
    : sectionKey === "physical"
      ? [...common, ...physicalOnly, ...faceOnly, ...detailLocks]
      : [...common, lineValue("Face"), ...detailLocks];
  const appearance = buildAppearancePayload();
  const appearanceLocks = [
    appearance.appearanceEthnicity,
    appearance.skinTone,
    appearance.hairColorCustom || appearance.hairColor,
    appearance.eyeColor,
    appearance.distinctiveFeatures,
  ];
  if (sectionKey === "physical") {
    appearanceLocks.push(appearance.heightScale, appearance.bodyBuild, appearance.bodyShape, appearance.muscleTone);
  }
  if (sectionKey === "face") {
    appearanceLocks.push(appearance.eyeShape, appearance.faceShape, appearance.noseShape, appearance.lipShape, appearance.browShape, appearance.jawline);
  }
  return [...locks, ...appearanceLocks]
    .map((item) => item.trim())
    .filter((item) => item && !/^(ai|infer|random|none)$/i.test(item))
    .filter((item) => !/\b(no|none|without|absent|nothing|not visible)\b/i.test(item));
}

function cleanPortraitPrompt(text) {
  return cleanAbsentVisualClaims(String(text || ""))
    .replace(/^\s*\*?Portrait Prompt\*?[.:]?\s*/i, "")
    .replace(/\b(?:very short|short|average|tall|very tall|proportionate)\s+(?:height|height impression)\b/gi, "")
    .replace(/(?:^|,\s*)\b(?:Very Short|Short|Average|Tall|Very Tall)\b(?=\.|,|$)/g, "")
    .replace(/\b(?:petite|thin|medium|soft|broad|heavyset|athletic|sturdy)\s+(?:adult\s+)?build\b/gi, "")
    .replace(/\b(?:rectangle|pear|apple|hourglass|inverted triangle)\s+body shape\b/gi, "")
    .replace(/\b(?:soft|lightly toned|sturdy|athletic)\s+(?:muscle tone|body)\b/gi, "")
    .replace(/\bfull body\b/gi, "close portrait")
    .replace(/,\s*,/g, ",")
    .replace(/\s+([,.])/g, "$1")
    .replace(/(?:^|,\s*)(?:no|none|without)(?:,|$)/gi, ", ")
    .replace(/^[,.;\s]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function compactPortraitPrompt(text, max) {
  return tidyVisualBody(cleanPortraitPrompt(text), max);
}

function cleanAbsentVisualClaims(text) {
  return String(text || "")
    .replace(/\b(?:no|without|none|not visible|no visible|absent|lacks?)\s+[^,.]*(?:scars?|tattoos?|piercings?|jewelry|makeup|accessor(?:y|ies)|freckles?|birthmarks?|glasses|facial hair|beard|mustache|moustache)[^,.]*/gi, "")
    .replace(/\b(?:scars?|tattoos?|piercings?|jewelry|makeup|accessor(?:y|ies)|freckles?|birthmarks?|glasses|facial hair|beard|mustache|moustache)\s*:\s*(?:none|no|n\/a|not visible|absent)\b/gi, "")
    .replace(/\b(?:none|no|n\/a|not visible|absent)\s+(?:scars?|tattoos?|piercings?|jewelry|makeup|accessor(?:y|ies)|freckles?|birthmarks?|glasses|facial hair|beard|mustache|moustache)\b/gi, "")
    .replace(/,\s*,/g, ",")
    .replace(/(?:,\s*){2,}/g, ", ")
    .replace(/:\s*,/g, ":")
    .replace(/\s+([,.])/g, "$1")
    .replace(/^[,.;\s]+/, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function cleanAvatarDescription(text) {
  return String(text || "")
    .split("\n")
    .map((line) => {
      if (/^\s*Details\s*:/i.test(line)) {
        const value = cleanAbsentVisualClaims(line.replace(/^\s*Details\s*:\s*/i, ""));
        return value ? `Details: ${value}` : "";
      }
      return cleanAbsentVisualClaims(line);
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function visualTokenPresent(text, attribute) {
  const haystack = String(text || "").toLowerCase();
  const words = String(attribute || "")
    .toLowerCase()
    .replace(/natural\s+/g, "")
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !["with", "and", "the", "tone", "texture", "details", "eyes", "hair", "skin"].includes(word));
  if (!words.length) return true;
  return words.some((word) => haystack.includes(word));
}

function prioritizeLockedVisuals(text, locked) {
  const existing = String(text || "").trim();
  const missing = locked.filter((attribute) => !visualTokenPresent(existing, attribute));
  return [...missing, existing].filter(Boolean).join(", ");
}

function tidyVisualBody(text, max) {
  const body = cleanAbsentVisualClaims(text)
    .replace(/…/g, "")
    .replace(/\.\.\./g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.])/g, "$1")
    .trim();
  if (body.length <= max) return body.replace(/[,\s]+$/, ".");

  const parts = body
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const kept = [];
  for (const part of parts) {
    const candidate = [...kept, part].join(", ");
    if (candidate.length <= max - 1) kept.push(part);
  }

  const shortened = kept.length ? kept.join(", ") : body.slice(0, max).replace(/\s+\S*$/, "");
  return shortened.replace(/[,\s]+$/, ".") + (shortened.endsWith(".") ? "" : ".");
}

function updateQuestion() {
  const active = activeInterviewQuestions();
  state.questionIndex = Math.max(0, Math.min(state.questionIndex || 0, active.length - 1));
  const current = active[state.questionIndex];
  const custom = Boolean(state.interviewQuestions?.length);
  $("questionTitle").textContent = `Question ${state.questionIndex + 1} of ${active.length}`;
  $("questionText").textContent = current.text;
  $("questionAnswer").value = state.answers[current.key] || "";
  if ($("interviewStatus")) {
    const answered = active.filter((question) => String(state.answers?.[question.key] || "").trim()).length;
    $("interviewStatus").textContent = custom
      ? `AI interview active: ${answered}/${active.length} answered. Questions adapt to the Core Idea and current settings.`
      : `Static guide active: ${answered}/${active.length} answered. Use Build AI Interview for tailored questions.`;
  }
}

function saveQuestionAnswer() {
  const active = activeInterviewQuestions();
  const current = active[state.questionIndex];
  const answer = value("questionAnswer");
  if (answer) state.answers[current.key] = answer;
  state.questionIndex = Math.min(state.questionIndex + 1, active.length - 1);
  updateQuestion();
  saveDraft();
}

function resetInterview() {
  state.answers = {};
  state.interviewQuestions = [];
  state.questionIndex = 0;
  updateQuestion();
  saveDraft();
}

async function buildAiInterview() {
  const button = $("buildInterviewButton");
  const status = $("interviewStatus");
  if (button) button.disabled = true;
  if (status) status.textContent = "Building a tailored interview from Core Idea and current settings...";
  $("statusPill").textContent = "Building interview...";
  clearApiError();
  try {
    const result = await generateInterviewQuestionsWithAi();
    state.interviewQuestions = normalizeInterviewQuestions(result.questions);
    state.answers = {};
    state.questionIndex = 0;
    updateQuestion();
    $("statusPill").textContent = `Interview ready: ${result.model}`;
    saveDraft();
  } catch (error) {
    console.warn(error);
    showApiError(error, "Build AI Interview");
    state.interviewQuestions = [];
    state.questionIndex = 0;
    updateQuestion();
    $("statusPill").textContent = `Interview fallback: ${error.message.slice(0, 38)}`;
  } finally {
    if (button) button.disabled = false;
  }
}

function updateMode(mode) {
  state.mode = mode;
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === mode);
  });
  $("interviewBox").classList.toggle("hidden", mode !== "interview");
  const interviewTab = document.querySelector('[data-workspace-tab][data-workspace-group="control"][data-workspace-tab="interview"]');
  if (interviewTab) {
    interviewTab.hidden = mode !== "interview";
    if (mode !== "interview" && state.controlTab === "interview") setWorkspaceTab("control", "kin");
  }
}

function addLockControls() {
  document.querySelectorAll(".reroll-section").forEach((button) => {
    const key = button.dataset.rerollSection;
    const actions = button.closest(".section-actions");
    if (!actions || actions.querySelector(`[data-lock-section="${key}"]`)) return;
    const label = document.createElement("label");
    label.className = "lock-toggle";
    label.innerHTML = `<input type="checkbox" data-lock-section="${key}" /> Lock`;
    label.querySelector("input").addEventListener("change", () => {
      saveDraft();
      renderOutputSectionNavigator();
    });
    actions.insertBefore(label, button);
  });
}

function updateFieldCharacterCount(field) {
  if (!field?.matches?.("input[maxlength], textarea[maxlength]") || field.maxLength < 0 || !field.id) return;
  if (["hidden", "password"].includes(field.type)) return;
  let counter = document.getElementById(field.dataset.characterCounter || "");
  if (!counter) {
    const known = { coreIdea: "coreIdeaCount", journalBody: "journalBodyCount" };
    const section = field.closest(".output-section");
    counter = document.getElementById(known[field.id] || "")
      || (section?.querySelector("textarea") === field ? section.querySelector(".section-title .section-count") : null);
    if (!counter) {
      counter = document.createElement("span");
      counter.id = `${field.id}-character-count`;
      counter.className = "section-count field-character-count";
      field.insertAdjacentElement("afterend", counter);
    }
    field.dataset.characterCounter = counter.id;
    const describedBy = new Set((field.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean));
    describedBy.add(counter.id);
    field.setAttribute("aria-describedby", [...describedBy].join(" "));
  }
  const count = field.value.length;
  const text = `${count} / ${field.maxLength} characters`;
  if (counter.textContent !== text) counter.textContent = text;
  counter.classList.toggle("over", count > field.maxLength);
  counter.classList.toggle("at-limit", count === field.maxLength);
  if (counter.classList.contains("field-character-count")) counter.hidden = field.hidden;
}

function updateAllFieldCharacterCounts() {
  document.querySelectorAll("input[maxlength], textarea[maxlength]").forEach(updateFieldCharacterCount);
}

function setupFieldCharacterCounts() {
  document.addEventListener("input", (event) => updateFieldCharacterCount(event.target));
  document.addEventListener("change", (event) => updateFieldCharacterCount(event.target));
  // Model controls are recreated dynamically; attach counters to their new inputs too.
  new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "attributes") updateFieldCharacterCount(record.target);
      else record.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        updateFieldCharacterCount(node);
        node.querySelectorAll("input[maxlength], textarea[maxlength]").forEach(updateFieldCharacterCount);
      });
    }
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["maxlength", "hidden"] });
  updateAllFieldCharacterCounts();
}

function updateCounters() {
  setMeter("coreIdeaCount", $("coreIdea").value.length, 1000);
  setMeter("taglineCount", $("taglineOutput").value.length, sectionMeta.tagline.max);
  setMeter("keywordsCount", $("keywordsOutput").value.length, sectionMeta.keywords.max);
  setMeter("storyPremiseCount", $("storyPremiseOutput").value.length, sectionMeta.premise.max);
  setMeter("behaviorCount", $("behaviorOutput").value.length, sectionMeta.behavior.max);
  setMeter("routineCount", $("routineOutput").value.length, sectionMeta.routine.max);
  setMeter("contradictionsCount", $("contradictionsOutput").value.length, sectionMeta.contradictions.max);
  setMeter("decisionCount", $("decisionOutput").value.length, sectionMeta.decision.max);
  setMeter("habitsCount", $("habitsOutput").value.length, sectionMeta.habits.max);
  setMeter("localKnowledgeCount", $("localKnowledgeOutput").value.length, sectionMeta.localKnowledge.max);
  setMeter("backstoryCount", $("backstoryOutput").value.length, sectionMeta.backstory.max);
  setMeter("rdCount", $("rdOutput").value.length, sectionMeta.rd.max);
  setMeter("kmCount", $("kmOutput").value.length, sectionMeta.kms.max);
  setMeter("exampleCount", $("exampleOutput").value.length, sectionMeta.example.max);
  setMeter("openingGreetingCount", $("openingGreetingOutput").value.length, sectionMeta.opening.max);
  setMeter("playerRelationshipCount", $("playerRelationshipOutput").value.length, sectionMeta.relationship.max);
  setMeter("avatarCount", $("avatarOutput").value.length, sectionMeta.avatar.max);
  setMeter("portraitPromptCount", $("portraitPromptOutput").value.length, sectionMeta.portrait.max);
  setMeter("physicalDescriptionCount", $("physicalDescriptionOutput").value.length, sectionMeta.physical.max);
  setMeter("faceDetailCount", $("faceDetailOutput").value.length, sectionMeta.face.max);
  setMeter("galleryDinnerCount", $("galleryDinnerOutput").value.length, sectionMeta.galleryDinner.max);
  setMeter("galleryOutdoorCount", $("galleryOutdoorOutput").value.length, sectionMeta.galleryOutdoor.max);
  setMeter("galleryIntimateCount", $("galleryIntimateOutput").value.length, sectionMeta.galleryIntimate.max);
  setMeter("galleryPublicCount", $("galleryPublicOutput").value.length, sectionMeta.galleryPublic.max);
  setMeter("galleryCasualCount", $("galleryCasualOutput").value.length, sectionMeta.galleryCasual.max);
  setMeter("playerProfileCount", $("playerProfileOutput").value.length, sectionMeta.player.max);
  if ($("imageStudioPromptCount")) $("imageStudioPromptCount").textContent = `${value("imageStudioFinalPromptOutput").length} characters`;
  updateStudioSnapshot();
  renderOutputSectionNavigator();
  updateAllFieldCharacterCounts();
}

function imageStudioModelLabel() {
  const tier = value("imageStudioModelTier") || "balanced";
  if (tier === "custom") return value("imageStudioCustomModel") || "Custom model";
  return aiModelOptions[tier] || tier;
}

function cleanPromptFragment(text, max = 900) {
  return compact(String(text || "")
    .replace(/^(?:Portrait Prompt|Avatar Description(?:\s*\(AD\))?|Physical Description|Face Detail|Gallery Prompt - [A-Za-z]+)\s*:?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim(), max);
}

function avatarField(label) {
  return cleanPromptFragment(String(value("avatarOutput") || "").match(new RegExp(`${label}\\s*:\\s*([^\\n]+)`, "i"))?.[1] || "", 120);
}

function stripSceneFromIdentity(text) {
  return compact(String(text || "")
    .split(",")
    .map((part) => part.trim())
    .map((part) => part.replace(/\b(?:headshot|mugshot|profile image|reference image)\b\.?/ig, "").trim())
    .filter((part) => part && !/\b(?:portrait|photo|photograph|headshot|mugshot|close[- ]?up|full[- ]?body|studio|background|scene|lighting|light|sunrise|dawn|morning|noon|afternoon|golden hour|sunset|dusk|night|midnight|harbor|waterfront|cafe|restaurant|street|alley|room|bedroom|kitchen|office|workshop|forest|beach|mountain|city|town|indoor|outdoor|interior|exterior)\b/i.test(part))
    .join(", "), 230);
}

function conciseIdentityAnchor() {
  const portrait = cleanPromptFragment(value("portraitPromptOutput"), 190);
  if (portrait) return stripSceneFromIdentity(portrait) || portrait;
  const parts = [
    avatarField("Age") ? `${avatarField("Age")}-year-old` : "",
    avatarField("Ethnicity/Race"),
    avatarField("Gender"),
    avatarField("Skin"),
    avatarField("Hair"),
    avatarField("Eyes"),
    avatarField("Face"),
    avatarField("Details"),
  ].filter(Boolean);
  const face = cleanPromptFragment(value("faceDetailOutput"), 180);
  return compact([...parts, face].filter(Boolean).join(", "), 260);
}

function conciseBaseScene(scene) {
  const sourceId = imageStudioSceneSources[scene];
  if (!sourceId) return "";
  let text = cleanPromptFragment(value(sourceId), 360);
  const identity = conciseIdentityAnchor();
  if (identity) {
    identity.split(/,\s*/).filter((part) => part.length > 5).forEach((part) => {
      text = text.replace(new RegExp(part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), "");
    });
  }
  return compact(text.replace(/\s{2,}/g, " ").replace(/^[,;\s]+|[,;\s]+$/g, ""), 320);
}

function enrichImageScenePrompt(text, scene) {
  const clean = cleanPromptFragment(text, 420);
  if (!clean) return scene === "portrait" ? "close portrait, simple background, natural light" : "";
  const lower = clean.toLowerCase();
  const details = [clean];
  if (/\b(?:run|running|ran|flee|fleeing|escape|escaping|chase|chasing|pursuit)\b/.test(lower)) {
    details.push("dynamic motion, urgent body language, wind-swept hair, tense expression");
  }
  if (/\b(?:haunted|amusement park|theme park|carnival|fairground|midway|funhouse|roller coaster|ferris wheel)\b/.test(lower)) {
    details.push("abandoned rides, broken carnival lights, weathered midway signs, eerie colorful atmosphere");
  }
  if (/\b(?:cafe|coffee shop|diner|restaurant|bar|waterfront|harbor|dock|pier)\b/.test(lower)) {
    details.push("clear location details, natural table-level composition, believable ambient light");
  }
  if (/\b(?:camp|camping|hiking|forest|woods|mountain|trail|lake|river|beach|swimming)\b/.test(lower)) {
    details.push("outdoor environmental detail, natural posture, weather and terrain visible");
  }
  if (/\b(?:dinner|kitchen|home|apartment|living room|bedroom)\b/.test(lower)) {
    details.push("grounded interior details, candid posture, practical lived-in setting");
  }
  if (details.length === 1) {
    details.push("clear environment, believable pose, natural expression, scene-relevant props and background");
  }
  details.push("realistic cinematic composition, natural depth of field");
  return compact([...new Set(details)].join(", "), 560);
}

function buildImageStudioPrompt(options = {}) {
  const scene = value("imageStudioScene") || "portrait";
  const profileReference = Boolean(options.profileReference);
  const fullBodyReference = Boolean(options.fullBodyReference);
  const style = profileReference
    ? "Realistic neutral facial reference photo"
    : fullBodyReference ? "Realistic neutral full-body character reference photo" : value("imageStudioStyle") || "Realistic photograph";
  const consistency = value("imageStudioConsistency") || "Balanced likeness";
  const custom = profileReference || fullBodyReference ? "" : cleanPromptFragment(value("imageStudioCustomPrompt"), 420);
  const identity = conciseIdentityAnchor();
  const baseScene = scene === "custom" ? "" : conciseBaseScene(scene);
  const scenePrompt = profileReference
    ? "tight head-and-shoulders crop, face centered, hair clearly visible, both eyes visible, neutral expression, simple plain background, soft even light"
    : fullBodyReference
      ? "full body visible from head to shoes, standing neutral pose, clothed in practical character-appropriate outfit, arms relaxed, entire silhouette visible, plain blank background, even studio lighting, no props, no furniture, no scenery"
    : enrichImageScenePrompt(custom || baseScene, scene);
  const consistencyRule = {
    "Strict likeness": "preserve facial identity clearly",
    "Creative variation": "recognizable identity with scene variation",
    "Balanced likeness": "recognizable identity",
  }[consistency] || "recognizable identity";
  const referenceRule = profileReference
    ? "optimized as an AI facial reference image, no cinematic scene, no dramatic pose, no props"
    : fullBodyReference ? "optimized as an AI full-body reference image, clothed, blank background, no cinematic scene, no dramatic pose, no props" : "";
  const safety = scene === "intimate"
    ? "adult only, non-nude, sensual but not explicit, no sex act"
    : "";
  const prompt = [
    style,
    identity,
    scenePrompt,
    consistencyRule,
    referenceRule,
    safety,
  ].filter(Boolean).join(", ");
  return prompt.trim();
}

function ensureImageStudioSeed() {
  let seed = value("imageStudioSeed");
  if (!seed) {
    seed = String(Math.floor(10000000 + Math.random() * 90000000));
    setValue("imageStudioSeed", seed);
  }
  return seed;
}

function imageStudioImageMetadata(image = state.imageStudioImage) {
  if (!image) return null;
  const { image: _dataUrl, ...metadata } = image;
  return metadata;
}

function buildReferenceImageSettings(options = {}) {
  const includeImage = Boolean(options.includeImage);
  const imageFor = (image) => includeImage ? (image || null) : imageStudioImageMetadata(image);
  return {
    face: imageFor(state.faceReferenceImage),
    fullBody: imageFor(state.fullBodyReferenceImage),
  };
}

function imageSourceLabel(data) {
  if (!data?.image) return "No image yet";
  if (data.source === "uploaded") return `Uploaded portrait${data.fileName ? `: ${data.fileName}` : ""}`;
  return `Generated by ${data.model || "image model"}`;
}

function buildImageStudioSettings(options = {}) {
  const includeImage = Boolean(options.includeImage);
  return {
    scene: value("imageStudioScene"),
    modelTier: value("imageStudioModelTier"),
    customModel: value("imageStudioCustomModel"),
    consistency: value("imageStudioConsistency"),
    style: value("imageStudioStyle"),
    seed: value("imageStudioSeed"),
    customPrompt: value("imageStudioCustomPrompt"),
    finalPrompt: value("imageStudioFinalPromptOutput"),
    resolvedModel: imageStudioModelLabel(),
    generatedImage: includeImage ? (state.imageStudioImage || null) : imageStudioImageMetadata(),
    referenceImages: buildReferenceImageSettings(options),
  };
}

function restoreImageStudioSettings(settings = {}) {
  if (!settings || !Object.keys(settings).length) {
    syncImageStudioModelFromRouting();
    updateCounters();
    return;
  }
  if ($("imageStudioScene")) $("imageStudioScene").value = settings.scene || "portrait";
  if ($("imageStudioModelTier")) $("imageStudioModelTier").value = settings.modelTier || settings.tier || "balanced";
  if ($("imageStudioCustomModel")) {
    $("imageStudioCustomModel").value = settings.customModel || settings.custom || "";
    $("imageStudioCustomModel").hidden = value("imageStudioModelTier") !== "custom";
  }
  if ($("imageStudioConsistency")) $("imageStudioConsistency").value = settings.consistency || "Balanced likeness";
  if ($("imageStudioStyle")) $("imageStudioStyle").value = settings.style || "Realistic photograph";
  if ($("imageStudioSeed")) setValue("imageStudioSeed", settings.seed || settings.generatedImage?.seed || "");
  if ($("imageStudioCustomPrompt")) setValue("imageStudioCustomPrompt", settings.customPrompt || "");
  if ($("imageStudioFinalPromptOutput")) setValue("imageStudioFinalPromptOutput", settings.finalPrompt || "");
  state.imageStudioImage = settings.generatedImage?.image ? settings.generatedImage : null;
  state.faceReferenceImage = settings.referenceImages?.face?.image
    ? settings.referenceImages.face
    : /face reference|portrait|uploaded/i.test(settings.generatedImage?.scene || "") && settings.generatedImage?.image ? settings.generatedImage : state.faceReferenceImage || null;
  state.fullBodyReferenceImage = settings.referenceImages?.fullBody?.image
    ? settings.referenceImages.fullBody
    : /full[- ]body/i.test(settings.generatedImage?.scene || "") && settings.generatedImage?.image ? settings.generatedImage : state.fullBodyReferenceImage || null;
  renderImagePreview();
  applyImageStudioModelToRouting();
  updateCounters();
}

function buildAndRenderImageStudioPrompt(options = {}) {
  const prompt = buildImageStudioPrompt(options);
  setValue("imageStudioFinalPromptOutput", prompt);
  applyImageStudioModelToRouting();
  updateCounters();
  renderAppearanceReference();
  saveDraft();
  return prompt;
}

function renderImagePreview() {
  const panel = $("imagePreviewPanel");
  const image = $("imagePreview");
  const snapshotImage = $("snapshotImage");
  const snapshotEmpty = $("snapshotImageEmpty");
  const meta = $("imagePreviewMeta");
  const revised = $("imageRevisedPromptOutput");
  const status = $("imageGenerationStatus");
  const bar = $("imageGenerationBar");
  const overlay = $("imageGeneratingOverlay");
  const overlayModel = $("imageGeneratingModel");
  if (!panel || !image) return;
  const data = state.imageStudioImage;
  panel.classList.toggle("hidden", !data?.image && !state.imageStudioBusy);
  if (bar) bar.hidden = !state.imageStudioBusy;
  if (overlay) overlay.hidden = !state.imageStudioBusy;
  if (overlayModel) overlayModel.textContent = state.imageStudioBusy ? `Using ${imageStudioModelLabel()}` : "";
  if (status) {
    status.textContent = state.imageStudioBusy
      ? `Generating image with ${imageStudioModelLabel()}...`
      : data?.image ? `${imageSourceLabel(data)} ready.` : "Ready to generate.";
  }
  if (!data?.image) {
    image.removeAttribute("src");
    if (snapshotImage) {
      snapshotImage.removeAttribute("src");
      snapshotImage.hidden = true;
    }
    if (snapshotEmpty) snapshotEmpty.hidden = false;
    if (meta) meta.textContent = "No image yet";
    if (revised) setValue("imageRevisedPromptOutput", "");
    renderAppearanceReference();
    updateStudioSnapshot();
    return;
  }
  image.src = data.image;
  if (snapshotImage) {
    snapshotImage.src = data.image;
    snapshotImage.hidden = false;
  }
  if (snapshotEmpty) snapshotEmpty.hidden = true;
  if (meta) meta.textContent = `${imageSourceLabel(data)} - ${data.createdAt ? new Date(data.createdAt).toLocaleString() : "Ready"}`;
  if (revised) setValue("imageRevisedPromptOutput", data.revisedPrompt || data.prompt || "");
  renderAppearanceReference();
  updateStudioSnapshot();
}

function renderAppearanceReference() {
  const image = $("appearanceReferenceImage");
  const empty = $("appearanceReferenceEmpty");
  const prompt = $("appearanceReferencePrompt");
  const notes = $("appearanceReferenceNotes");
  if (!image || !empty) return;
  const data = state.imageStudioImage;
  const hasImage = Boolean(data?.image);
  image.hidden = !hasImage;
  empty.hidden = hasImage;
  if (hasImage) image.src = data.image;
  else image.removeAttribute("src");
  if (prompt) setValue("appearanceReferencePrompt", data?.prompt || value("imageStudioFinalPromptOutput") || "");
  if (notes) {
    const lines = data ? [
      data.source ? `Source: ${data.source === "uploaded" ? "Uploaded by user" : "Generated by KinForge"}` : "",
      data.fileName ? `File: ${data.fileName}` : "",
      data.model ? `Model: ${data.model}` : "",
      data.scene ? `Scene: ${data.scene}` : "",
      data.seed ? `Seed: ${data.seed}` : "",
      data.createdAt ? `${data.source === "uploaded" ? "Uploaded" : "Generated"}: ${new Date(data.createdAt).toLocaleString()}` : "",
    ].filter(Boolean) : [];
    setValue("appearanceReferenceNotes", lines.join("\n"));
  }
}

function uploadPortraitFile(file) {
  if (!file) return;
  if (!/^image\/(?:png|jpeg|webp)$/i.test(file.type)) {
    $("statusPill").textContent = "Portrait upload must be PNG, JPG, or WebP";
    return;
  }
  const maxBytes = 8 * 1024 * 1024;
  if (file.size > maxBytes) {
    $("statusPill").textContent = "Portrait upload is over 8 MB";
    return;
  }
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    state.imageStudioImage = {
      image: String(reader.result || ""),
      source: "uploaded",
      fileName: file.name,
      mimeType: file.type,
      size: file.size,
      scene: "portrait",
      prompt: value("imageStudioFinalPromptOutput") || value("portraitPromptOutput") || "",
      revisedPrompt: "",
      model: "Uploaded by user",
      createdAt: new Date().toISOString(),
    };
    state.faceReferenceImage = { ...state.imageStudioImage };
    renderImagePreview();
    setWorkspaceTab("output", "description");
    $("statusPill").textContent = `Uploaded portrait: ${file.name}`;
    saveDraft();
  });
  reader.addEventListener("error", () => {
    $("statusPill").textContent = "Portrait upload failed";
  });
  reader.readAsDataURL(file);
}

function clearImagePreview() {
  const current = state.imageStudioImage;
  if (current?.image && state.faceReferenceImage?.image === current.image) state.faceReferenceImage = null;
  if (current?.image && state.fullBodyReferenceImage?.image === current.image) state.fullBodyReferenceImage = null;
  state.imageStudioImage = null;
  state.imageStudioBusy = false;
  renderImagePreview();
  renderAppearanceReference();
  saveDraft();
}

async function regenerateGeneratorField(id) {
  if (isFieldLocked(id)) {
    $("statusPill").textContent = `${fieldLabels[id] || "Field"} is locked`;
    return;
  }
  const button = document.querySelector(`[data-regen-field="${id}"]`);
  if (button) button.disabled = true;
  $("statusPill").textContent = `Regenerating ${fieldLabels[id] || "field"}...`;
  clearApiError();
  try {
    const result = await regenerateFieldWithAi(id);
    setFieldValue(id, result.value, "ai");
    updatePersonalityPreview();
    saveDraft();
    $("statusPill").textContent = `Regenerated ${fieldLabels[id] || "field"}: ${result.model}`;
  } catch (error) {
    console.warn(error);
    showApiError(error, `Regenerate ${fieldLabels[id] || "field"}`);
    $("statusPill").textContent = `Field regen failed: ${error.message.slice(0, 42)}`;
  } finally {
    updateFieldMetaUi(id);
  }
}

function setMeter(id, count, max) {
  const node = $(id);
  node.textContent = `${count} / ${max}`;
  node.classList.toggle("over", count > max);
}

function uniqueJournalCategories() {
  const defaults = state.journalCategories?.length ? state.journalCategories : ["Overview", "People", "Places", "Objects", "Events", "Relationships", "World", "Behavior", "Temporary"];
  const fromEntries = (state.journals || []).map((entry) => entry.category).filter(Boolean);
  return [...new Set(["All Entries", ...defaults, ...fromEntries])];
}

function parseJournalKeywords(text) {
  return [...new Set(String(text || "").split(/[,;\n]+/).map((item) => item.trim()).filter(Boolean))];
}

function journalTimestamp() {
  return new Date().toISOString();
}

function journalDisplayDate(iso) {
  if (!iso) return "Never";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function createJournalEntry(template = "Blank Entry") {
  const categoryByTemplate = {
    Person: "People",
    Place: "Places",
    Object: "Objects",
    Event: "Events",
    Relationship: "Relationships",
    "World Rule": "World",
    "Temporary Status": "Temporary",
    "Behavior Mode": "Behavior",
  };
  const now = journalTimestamp();
  const entry = {
    id: `journal-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: template === "Blank Entry" ? "New Journal" : template,
    category: categoryByTemplate[template] || state.journalCategory || "Overview",
    keywords: [],
    body: "",
    updatedAt: now,
    pinned: false,
  };
  state.journals ||= [];
  state.journals.unshift(entry);
  state.activeJournalId = entry.id;
  if (entry.category !== "All Entries") state.journalCategory = entry.category;
  return entry;
}

function activeJournal() {
  return (state.journals || []).find((entry) => entry.id === state.activeJournalId) || null;
}

function journalKeywordWarnings(entry) {
  const warnings = [];
  const keywords = entry.keywords || [];
  if (keywords.length > journalConfig.maxKeywords) warnings.push(`Too many keywords: ${keywords.length}/${journalConfig.maxKeywords}. Only the first ${journalConfig.maxKeywords} export.`);
  const allKeywords = (state.journals || []).flatMap((item) => (item.id === entry.id ? [] : (item.keywords || []).map((keyword) => ({ keyword, title: item.title }))));
  keywords.forEach((keyword) => {
    const lower = keyword.toLowerCase();
    const wordCount = lower.split(/\s+/).filter(Boolean).length;
    if (lower.length <= 3) warnings.push(`"${keyword}" may be too generic and trigger accidentally.`);
    if (wordCount > 1) warnings.push(`"${keyword}" is probably too specific. Use one plain word a player might type.`);
    if (/\b(negotiation|gathering|preparation|logging|setup|fixes|preferences?|tendencies|awareness|approach|familiarity|assessment|patterns?|style|behaviors?|process|situation)\b$/i.test(keyword)) {
      warnings.push(`"${keyword}" sounds descriptive rather than searchable. Trim it to the likely trigger word or phrase.`);
    }
    if (/^(?:prioritizes|seeks|avoids|delays|gathers|keeps|checks|prepares|logs)\b/i.test(keyword)) {
      warnings.push(`"${keyword}" sounds like a section summary. Use the plain word a player would type.`);
    }
    if (/^[a-z]+$/i.test(keyword) && lower.length <= 5) warnings.push(`"${keyword}" may match inside longer words. Prefer a phrase if accidental recall is likely.`);
    allKeywords.forEach((other) => {
      const otherLower = other.keyword.toLowerCase();
      if (lower === otherLower) warnings.push(`Duplicate keyword "${keyword}" also appears in ${other.title}.`);
      else if (lower.includes(otherLower) || otherLower.includes(lower)) warnings.push(`Keyword overlap: "${keyword}" and "${other.keyword}" may collide.`);
    });
  });
  return [...new Set(warnings)];
}

function journalBodyWarnings(entry) {
  const warnings = [];
  const body = entry.body || "";
  if (body.length > journalConfig.maxBodyCharacters) warnings.push(`Journal too long: ${body.length}/${journalConfig.maxBodyCharacters} characters.`);
  if (body.split(/[.!?]\s+/).length > 5) warnings.push("This may read like a story. Prefer concise facts for one topic.");
  if (/\bthen\b|\bafterward\b|\bsuddenly\b|\bone day\b|\byears later\b/i.test(body)) warnings.push("Timeline/story language detected. Keep only the facts needed for recall.");
  if (/\bheart\b|\bsoul\b|\bdestiny\b|\bhaunted\b|\bbeautiful tragedy\b/i.test(body)) warnings.push("Poetic or emotional narration detected. Use factual wording unless the emotion is the fact.");
  return warnings;
}

function journalAnalysis(entry) {
  if (!entry) return ["Select or create a journal entry."];
  const warnings = [...journalKeywordWarnings(entry), ...journalBodyWarnings(entry)];
  if (!(entry.keywords || []).length) warnings.push("Add natural keywords or phrases a user might type.");
  if (!entry.body.trim()) warnings.push("Add a concise factual body for this topic.");
  return warnings.length ? warnings : ["Looks clean: one topic, concise facts, and usable recall keywords."];
}

function serializableJournal(entry) {
  return {
    title: entry.title || "",
    category: entry.category || "Overview",
    keywords: (entry.keywords || []).slice(0, journalConfig.maxKeywords),
    body: entry.body || "",
    warnings: journalAnalysis(entry),
    updatedAt: entry.updatedAt || "",
  };
}

function buildJournalAuditSummary() {
  const keywordMap = new Map();
  (state.journals || []).forEach((entry) => {
    (entry.keywords || []).forEach((keyword) => {
      const key = normalizeTriggerPhrase(keyword);
      if (!key) return;
      if (!keywordMap.has(key)) keywordMap.set(key, []);
      keywordMap.get(key).push(entry.title || "Untitled");
    });
  });
  return {
    entryCount: (state.journals || []).length,
    duplicateKeywords: [...keywordMap.entries()]
      .filter(([, titles]) => titles.length > 1)
      .map(([keyword, titles]) => ({ keyword, titles })),
    warningsByTitle: (state.journals || []).map((entry) => ({
      title: entry.title || "Untitled",
      category: entry.category || "Overview",
      warnings: journalAnalysis(entry).filter((warning) => !/^Looks clean/i.test(warning)),
    })).filter((item) => item.warnings.length),
  };
}

function buildJournalInferencePayload(mode = "profile") {
  return {
    modelSettings: modelSettingsForTask("journals"),
    mode,
    config: { ...journalConfig },
    categories: uniqueJournalCategories().filter((category) => category !== "All Entries"),
    profile: getCombinedOutput(),
    sections: getSectionValues(),
    generatorPayload: buildGeneratorPayload({ aiTask: "journals" }),
    journals: (state.journals || []).map(serializableJournal),
    activeJournal: activeJournal() ? serializableJournal(activeJournal()) : null,
    activeJournalId: state.activeJournalId || "",
    audit: buildJournalAuditSummary(),
  };
}

function normalizeInferredJournalEntry(entry) {
  const title = String(entry?.title || entry?.replaceTitle || "Inferred Journal").trim().slice(0, 80);
  const category = String(entry?.category || "Overview").trim().slice(0, 32) || "Overview";
  return {
    title,
    category,
    keywords: normalizeJournalKeyphrases(Array.isArray(entry?.keywords) ? entry.keywords.join(", ") : entry?.keywords)
      .split(",")
      .map((keyword) => keyword.trim())
      .filter(Boolean)
      .slice(0, journalConfig.maxKeywords),
    body: String(entry?.body || "").trim().slice(0, journalConfig.maxBodyCharacters),
    replaceTitle: String(entry?.replaceTitle || "").trim(),
  };
}

function upsertNormalizedJournalEntries(entries) {
  const now = journalTimestamp();
  state.journals ||= [];
  const normalized = (entries || []).filter((entry) => entry.title && (entry.body || entry.keywords.length));
  normalized.forEach((entry) => {
    const titleKey = (entry.replaceTitle || entry.title).toLowerCase();
    let existing = state.journals.find((item) => item.title.toLowerCase() === titleKey);
    if (!existing && entry.replaceTitle) existing = state.journals.find((item) => item.title.toLowerCase() === entry.title.toLowerCase());
    if (existing) {
      existing.title = entry.title;
      existing.category = entry.category;
      existing.keywords = entry.keywords;
      existing.body = entry.body;
      existing.updatedAt = now;
      state.activeJournalId = existing.id;
    } else {
      state.journals.unshift({
        id: `journal-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        title: entry.title,
        category: entry.category,
        keywords: entry.keywords,
        body: entry.body,
        updatedAt: now,
        pinned: false,
      });
      state.activeJournalId = state.journals[0].id;
    }
    if (!state.journalCategories.some((category) => category.toLowerCase() === entry.category.toLowerCase())) {
      state.journalCategories.push(entry.category);
    }
    state.journalCategory = entry.category;
  });
  state.journals = state.journals.slice(0, journalConfig.maxEntries);
  renderJournalManager();
  saveDraft();
  return normalized.length;
}

function upsertInferredJournals(entries) {
  const normalized = (entries || []).map(normalizeInferredJournalEntry).filter((entry) => entry.title && (entry.body || entry.keywords.length));
  return upsertNormalizedJournalEntries(normalized);
}

function stageInferredJournalDrafts(entries, source = "AI inferred") {
  const normalized = (entries || []).map(normalizeInferredJournalEntry).filter((entry) => entry.title && (entry.body || entry.keywords.length));
  state.journalDrafts ||= [];
  const createdAt = journalTimestamp();
  normalized.forEach((entry) => {
    state.journalDrafts.push({
      id: `journal-draft-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      source,
      createdAt,
      ...entry,
    });
  });
  renderJournalManager();
  saveDraft();
  return normalized.length;
}

function acceptJournalDraft(draftId) {
  const draft = (state.journalDrafts || []).find((entry) => entry.id === draftId);
  if (!draft) return 0;
  state.journalDrafts = (state.journalDrafts || []).filter((entry) => entry.id !== draftId);
  return upsertNormalizedJournalEntries([draft]);
}

function rejectJournalDraft(draftId) {
  const before = (state.journalDrafts || []).length;
  state.journalDrafts = (state.journalDrafts || []).filter((entry) => entry.id !== draftId);
  renderJournalManager();
  saveDraft();
  return before - state.journalDrafts.length;
}

function acceptAllJournalDrafts() {
  const drafts = [...(state.journalDrafts || [])];
  state.journalDrafts = [];
  return upsertNormalizedJournalEntries(drafts);
}

function rejectAllJournalDrafts() {
  const count = (state.journalDrafts || []).length;
  state.journalDrafts = [];
  renderJournalManager();
  saveDraft();
  return count;
}

function filteredJournals() {
  const query = value("journalSearch").toLowerCase();
  const category = state.journalCategory || "Overview";
  const sort = value("journalSort") || "edited";
  let entries = [...(state.journals || [])];
  if (category !== "All Entries") entries = entries.filter((entry) => entry.category === category);
  if (query) {
    entries = entries.filter((entry) => `${entry.title} ${entry.category} ${(entry.keywords || []).join(" ")} ${entry.body}`.toLowerCase().includes(query));
  }
  entries.sort((a, b) => {
    if (sort === "title") return a.title.localeCompare(b.title);
    if (sort === "category") return a.category.localeCompare(b.category) || a.title.localeCompare(b.title);
    if (sort === "length") return (b.body || "").length - (a.body || "").length;
    return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
  });
  return entries;
}

function renderJournalCategories() {
  const host = $("journalCategoryTabs");
  if (!host) return;
  const categories = uniqueJournalCategories();
  host.innerHTML = categories.map((category) => {
    const active = (state.journalCategory || "Overview") === category;
    const count = category === "All Entries" ? (state.journals || []).length : (state.journals || []).filter((entry) => entry.category === category).length;
    return `<button class="journal-category-tab${active ? " active" : ""}" type="button" data-journal-category="${escapeHtml(category)}">${escapeHtml(category)} <span>${count}</span></button>`;
  }).join("");
}

function renderJournalCategorySelect() {
  const select = $("journalCategory");
  if (!select) return;
  const selected = select.value || activeJournal()?.category || "Overview";
  select.innerHTML = uniqueJournalCategories().filter((category) => category !== "All Entries").map((category) => `<option>${escapeHtml(category)}</option>`).join("");
  select.value = uniqueJournalCategories().includes(selected) && selected !== "All Entries" ? selected : "Overview";
}

function renderJournalCards() {
  const host = $("journalBrowser");
  if (!host) return;
  const entries = filteredJournals();
  $("journalManagerCount").textContent = `${(state.journals || []).length} / ${journalConfig.maxEntries} entries`;
  if (!entries.length) {
    host.innerHTML = `<div class="empty-journal-state">No journals in this view.</div>`;
    return;
  }
  host.innerHTML = entries.map((entry) => {
    const active = entry.id === state.activeJournalId;
    const keywords = (entry.keywords || []).slice(0, journalConfig.maxKeywords).join(", ") || "No keywords";
    const preview = entry.body ? entry.body.slice(0, 150) : "No body yet.";
    return `<button class="journal-card${active ? " active" : ""}" type="button" data-journal-id="${entry.id}">
      <strong class="journal-card-title">${escapeHtml(entry.title || "Untitled")}</strong>
      <span class="journal-card-category">Category: ${escapeHtml(entry.category || "Overview")}</span>
      <span class="journal-card-keywords">Keywords: ${escapeHtml(keywords)}</span>
      <span class="journal-card-meta">${(entry.body || "").length} characters · Edited ${escapeHtml(journalDisplayDate(entry.updatedAt))}</span>
      <p class="journal-card-preview">${escapeHtml(preview)}</p>
    </button>`;
  }).join("");
}

function renderJournalEditor() {
  const entry = activeJournal();
  renderJournalCategorySelect();
  setValue("journalTitle", entry?.title || "");
  $("journalCategory").value = entry?.category || state.journalCategory || "Overview";
  setValue("journalKeywords", (entry?.keywords || []).join(", "));
  setValue("journalBody", entry?.body || "");
  const keywordCount = entry?.keywords?.length || 0;
  const bodyCount = entry?.body?.length || 0;
  setMeter("journalKeywordCount", keywordCount, journalConfig.maxKeywords);
  $("journalKeywordCount").textContent = `${keywordCount} / ${journalConfig.maxKeywords} Keywords`;
  setMeter("journalBodyCount", bodyCount, journalConfig.maxBodyCharacters);
  $("journalBodyCount").textContent = `${bodyCount} / ${journalConfig.maxBodyCharacters} Characters`;
  $("journalKeywordChips").innerHTML = (entry?.keywords || []).map((keyword) => `<span>${escapeHtml(keyword)}</span>`).join("");
  $("journalAnalysis").innerHTML = journalAnalysis(entry).map((item) => `<p>${escapeHtml(item)}</p>`).join("");
}

function renderJournalReviewQueue() {
  const panel = $("journalReviewPanel");
  const host = $("journalReviewQueue");
  if (!panel || !host) return;
  state.journalDrafts ||= [];
  const count = state.journalDrafts.length;
  $("journalDraftCount").textContent = `${count} draft${count === 1 ? "" : "s"}`;
  panel.classList.toggle("hidden", count === 0);
  if (!count) {
    host.innerHTML = "";
    return;
  }
  host.innerHTML = state.journalDrafts.map((draft) => {
    const keywords = (draft.keywords || []).slice(0, journalConfig.maxKeywords).join(", ") || "No keywords";
    return `<article class="journal-draft-card">
      <div class="journal-draft-main">
        <strong>${escapeHtml(draft.title || "Untitled Draft")}</strong>
        <span>Category: ${escapeHtml(draft.category || "Overview")}</span>
        <span>Keywords: ${escapeHtml(keywords)}</span>
        <p>${escapeHtml(draft.body || "No body.")}</p>
      </div>
      <div class="journal-draft-actions">
        <button class="ghost-button" type="button" data-accept-journal-draft="${draft.id}">Accept</button>
        <button class="ghost-button" type="button" data-reject-journal-draft="${draft.id}">Reject</button>
      </div>
    </article>`;
  }).join("");
}

function renderJournalManager() {
  state.journals ||= [];
  state.journalDrafts ||= [];
  if (!state.journalCategories?.length) state.journalCategories = ["Overview", "People", "Places", "Objects", "Events", "Relationships", "World", "Behavior", "Temporary"];
  if (!state.journalCategory) state.journalCategory = "Overview";
  if (!state.activeJournalId && state.journals.length) state.activeJournalId = state.journals[0].id;
  if ($("autoInferJournals")) $("autoInferJournals").checked = Boolean(state.autoInferJournals);
  renderJournalCategories();
  renderJournalReviewQueue();
  renderJournalCards();
  renderJournalEditor();
}

function normalizeNameOption(option) {
  const firstName = String(option?.firstName || "").trim();
  const lastName = String(option?.lastName || "").trim();
  const fullName = String(option?.fullName || `${firstName} ${lastName}`).trim();
  return {
    id: option?.id || `name-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    firstName,
    lastName,
    fullName: fullName || firstName || "Unnamed Option",
    pronunciation: String(option?.pronunciation || "").trim(),
    origin: String(option?.origin || "").trim(),
    popularity: String(option?.popularity || "").trim(),
    meaning: String(option?.meaning || "").trim(),
    nicknames: Array.isArray(option?.nicknames) ? option.nicknames.map((item) => String(item).trim()).filter(Boolean).slice(0, 6) : [],
    explanation: String(option?.explanation || option?.why || "").trim(),
  };
}

function renderNameCard(option, location) {
  const isFavorite = (state.favoriteNames || []).some((item) => item.fullName.toLowerCase() === option.fullName.toLowerCase());
  const meta = [option.origin, option.popularity, option.pronunciation].filter(Boolean).join(" · ");
  const nicknames = option.nicknames?.length ? `<span>Nicknames: ${escapeHtml(option.nicknames.join(", "))}</span>` : "";
  const meaning = option.meaning ? `<span>Meaning: ${escapeHtml(option.meaning)}</span>` : "";
  return `<article class="name-card">
    <div class="name-card-main">
      <strong>${escapeHtml(option.fullName)}</strong>
      ${meta ? `<span>${escapeHtml(meta)}</span>` : ""}
      ${meaning}
      ${nicknames}
      ${option.explanation ? `<p>${escapeHtml(option.explanation)}</p>` : ""}
    </div>
    <div class="name-card-actions">
      <button class="ghost-button" type="button" data-apply-name="${escapeHtml(option.fullName)}">Use</button>
      <button class="ghost-button" type="button" data-${location === "favorites" ? "remove" : "favorite"}-name="${escapeHtml(option.fullName)}">${location === "favorites" ? "Remove" : isFavorite ? "Starred" : "Favorite"}</button>
    </div>
  </article>`;
}

function renderNameForge() {
  state.generatedNames ||= [];
  state.favoriteNames ||= [];
  const results = $("nameResults");
  const favorites = $("nameFavorites");
  if (results) {
    results.innerHTML = state.generatedNames.length
      ? state.generatedNames.map((option) => renderNameCard(option, "results")).join("")
      : `<div class="empty-journal-state">Generate names to see grounded options here.</div>`;
  }
  if (favorites) {
    favorites.innerHTML = state.favoriteNames.length
      ? state.favoriteNames.map((option) => renderNameCard(option, "favorites")).join("")
      : `<div class="empty-journal-state">No favorite names yet.</div>`;
  }
}

function saveJournalFromEditor() {
  state.journals ||= [];
  let entry = activeJournal();
  if (!entry) entry = createJournalEntry();
  entry.title = value("journalTitle") || "Untitled Journal";
  entry.category = value("journalCategory") || "Overview";
  entry.keywords = parseJournalKeywords(value("journalKeywords"));
  entry.body = value("journalBody").slice(0, journalConfig.maxBodyCharacters);
  entry.updatedAt = journalTimestamp();
  state.activeJournalId = entry.id;
  state.journalCategory = entry.category;
  renderJournalManager();
  saveDraft();
}

function deleteActiveJournal() {
  const entry = activeJournal();
  if (!entry) return;
  state.journals = (state.journals || []).filter((item) => item.id !== entry.id);
  state.activeJournalId = state.journals[0]?.id || "";
  renderJournalManager();
  saveDraft();
}

function journalExportText() {
  return (state.journals || []).map((entry) => {
    const keywords = (entry.keywords || []).slice(0, journalConfig.maxKeywords).join(", ");
    return `Keywords\n${keywords}\n\nJournal Body\n${entry.body || ""}`;
  }).join("\n\n---\n\n");
}

function buildJournalSettingsExport() {
  return {
    config: { ...journalConfig },
    categories: [...(state.journalCategories || [])],
    activeJournalId: state.activeJournalId || "",
    selectedCategory: state.journalCategory || "Overview",
    autoInferJournals: Boolean(state.autoInferJournals),
    journals: (state.journals || []).map((entry) => ({
      id: entry.id || "",
      title: entry.title || "",
      category: entry.category || "Overview",
      keywords: (entry.keywords || []).slice(0, journalConfig.maxKeywords),
      body: entry.body || "",
      updatedAt: entry.updatedAt || "",
      pinned: Boolean(entry.pinned),
      warnings: journalAnalysis(entry),
    })),
    reviewDrafts: (state.journalDrafts || []).map((draft) => ({
      id: draft.id || "",
      title: draft.title || "",
      category: draft.category || "Overview",
      keywords: (draft.keywords || []).slice(0, journalConfig.maxKeywords),
      body: draft.body || "",
      replaceTitle: draft.replaceTitle || "",
      source: draft.source || "",
      createdAt: draft.createdAt || "",
    })),
    auditSummary: buildJournalAuditSummary(),
    kindroidImportText: journalExportText(),
  };
}

function entryFromGeneratedJournal(title, category, keywordText, body) {
  return {
    title,
    category,
    keywords: parseJournalKeywords(keywordText).slice(0, journalConfig.maxKeywords),
    body: String(body || "").slice(0, journalConfig.maxBodyCharacters),
  };
}

function generatedJournalEntriesFromOutput() {
  return [
    entryFromGeneratedJournal("Behavioral Tendencies", "Behavior", value("behaviorKeyphrasesOutput"), value("behaviorOutput")),
    entryFromGeneratedJournal("Daily Routine", "Behavior", value("routineKeyphrasesOutput"), value("routineOutput")),
    entryFromGeneratedJournal("Contradictions", "Behavior", value("contradictionsKeyphrasesOutput"), value("contradictionsOutput")),
    entryFromGeneratedJournal("Decision-Making Style", "Behavior", value("decisionKeyphrasesOutput"), value("decisionOutput")),
    entryFromGeneratedJournal("Distinctive Habits", "Behavior", value("habitsKeyphrasesOutput"), value("habitsOutput")),
    entryFromGeneratedJournal("Local Knowledge", "World", value("localKnowledgeKeyphrasesOutput"), value("localKnowledgeOutput")),
  ].filter((entry) => entry.body || entry.keywords.length);
}

function importGeneratedJournals() {
  return upsertNormalizedJournalEntries(generatedJournalEntriesFromOutput());
}

function draftSafeState() {
  const kindroidApi = {
    ...(state.kindroidApi || {}),
    apiKey: "",
    encryptedApiKeyAvailable: hasSavedKindroidApiKeyBlob(),
    rememberApiKey: Boolean($("rememberKindroidApiKey")?.checked || hasSavedKindroidApiKeyBlob()),
  };
  return {
    ...state,
    kindroidApi,
    imageStudioImage: imageStudioImageMetadata(),
    faceReferenceImage: imageStudioImageMetadata(state.faceReferenceImage),
    fullBodyReferenceImage: imageStudioImageMetadata(state.fullBodyReferenceImage),
    imageStudioBusy: false,
    generationBusy: false,
  };
}

function saveDraft() {
  if (state.generationBusy) return;
  updateEstimatedBirthYear();
  const savedFieldIds = ["userName", "createPlayerProfile", ...generatorFieldIds].filter((id, index, ids) => ids.indexOf(id) === index && $(id));
  const data = {
    schemaVersion: 2,
    state: draftSafeState(),
    fields: Object.fromEntries(savedFieldIds.map((id) => [id, $(id).value])),
    createPlayerProfile: $("createPlayerProfile").checked,
    sections: Object.fromEntries(Object.entries(outputSections).map(([key, id]) => [key, $(id).value])),
    sectionsV2: getSectionValuesV2(),
    variants: Object.fromEntries(Object.entries(variantOutputs).map(([key, id]) => [key, $(id).value])),
    greetingStudio: {
      brief: value("greetingStudioBrief"),
      style: value("greetingStudioStyle") || "Natural first contact",
      draft: value("greetingDraftOutput"),
      review: state.greetingReview || { issues: [], decisions: {} },
    },
    aiModelSettings: buildAiModelSettings(),
    imageStudio: buildImageStudioSettings(),
    imageStudioImage: imageStudioImageMetadata(),
    locks: getLockedSections(),
  };
  try {
    localStorage.setItem("kinforge-kindroid-draft", JSON.stringify(data));
  } catch (error) {
    console.warn("Draft save skipped:", error);
    $("statusPill").textContent = "Draft auto-save skipped: browser storage is full";
  }
}

function loadDraft() {
  const raw = localStorage.getItem("kinforge-kindroid-draft");
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    const hadPlainKindroidApiKey = Boolean(data.state?.kindroidApi?.apiKey);
    Object.assign(state, data.state || {});
    state.interviewQuestions = normalizeInterviewQuestions(state.interviewQuestions || []);
    if (!data.state?.interviewQuestions) state.interviewQuestions = [];
    if (state.kindroidApi) state.kindroidApi.apiKey = "";
    state.fieldMeta ||= {};
    Object.entries(data.fields || {}).forEach(([id, fieldValue]) => setValue(id, fieldValue));
    $("createPlayerProfile").checked = data.createPlayerProfile !== false;
    if (data.sections || data.sectionsV2) {
      const sections = v2SectionsToOutputSections(data.sectionsV2, data.sections || {});
      Object.entries(outputSections).forEach(([key, id]) => setValue(id, sections[key] || ""));
    } else {
      setOutputSections(data.output || "");
    }
    setSectionLocks(data.locks || {});
    Object.entries(data.variants || {}).forEach(([key, text]) => {
      if (variantOutputs[key]) setValue(variantOutputs[key], text || "");
    });
    if (data.greetingStudio) {
      setValue("greetingStudioBrief", data.greetingStudio.brief || "");
      setValue("greetingStudioStyle", data.greetingStudio.style || "Natural first contact");
      setValue("greetingDraftOutput", data.greetingStudio.draft || "");
      state.greetingReview = data.greetingStudio.review || { issues: [], decisions: {} };
      if (value("greetingDraftOutput")) $("greetingDraftPanel")?.classList.remove("hidden");
      if (state.greetingReview?.issues?.length) renderGreetingReport({ summary: `${state.greetingReview.issues.length} saved suggestion${state.greetingReview.issues.length === 1 ? "" : "s"}.`, issues: state.greetingReview.issues });
    }
    applyAiModelSettings(data.aiModelSettings || defaultAiModelSettings());
    restoreImageStudioSettings({ ...(data.imageStudio || {}), generatedImage: data.imageStudio?.generatedImage || data.imageStudioImage || null });
    generatorFieldIds.forEach((id) => {
      if ($(id)) {
        const meta = fieldMeta(id);
        meta.lastValue = value(id);
        if (fieldHasMeaningfulValue(id) && (!meta.origin || meta.origin === "blank")) meta.origin = "user";
        if (!fieldHasMeaningfulValue(id) && meta.origin === "user") meta.origin = "blank";
        updateFieldMetaUi(id);
      }
    });
    updateCounters();
    updatePersonalityPreview();
    updateEstimatedBirthYear();
    updatePowerLeaningLabel();
    applyCreationTypeUi();
    renderNameForge();
    renderJournalManager();
    if (hadPlainKindroidApiKey) saveDraft();
  } catch {
    localStorage.removeItem("kinforge-kindroid-draft");
  }
}

document.querySelectorAll("[data-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    updateMode(button.dataset.mode);
    saveDraft();
  });
});

document.querySelectorAll("[data-studio-target]").forEach((button) => {
  button.addEventListener("click", () => {
    const [group, key] = String(button.dataset.studioTarget || "").split(":");
    if (!group || !key) return;
    if (group === "control") setAppWorkspaceMode(key === "ai" ? "settings" : "create", { preserveTab: true });
    if (group === "output") setAppWorkspaceMode("review", { preserveTab: true });
    setWorkspaceTab(group, key);
    saveDraft();
  });
});

document.querySelectorAll("[data-trigger-action]").forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.dataset.triggerAction;
    if (action === "generate") $("generatorForm")?.requestSubmit();
    if (action === "surprise") $("randomSeedButton")?.click();
    if (action === "consistency") {
      setAppWorkspaceMode("review", { preserveTab: true });
      $("checkConsistencyButton")?.click();
    }
    if (action === "import") {
      setAppWorkspaceMode("create", { preserveTab: true });
      $("openKinImportButton")?.click();
    }
    if (action === "load") {
      setAppWorkspaceMode("create", { preserveTab: true });
      $("loadButton")?.click();
    }
    if (action === "save-settings") $("saveSettingsButton")?.click();
    if (action === "save-output") $("saveButton")?.click();
    if (action === "copy-all") $("copyButton")?.click();
    if (action === "save-package") $("savePackageButton")?.click();
    if (action === "export-kin") $("exportKinBundleButton")?.click();
    if (action === "character-sheet") openCharacterSheet();
  });
});

document.querySelectorAll("[data-workspace-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    setAppWorkspaceMode(button.dataset.workspaceMode);
    saveDraft();
  });
});

$("nextQuestionButton").addEventListener("click", saveQuestionAnswer);
$("buildInterviewButton").addEventListener("click", buildAiInterview);
$("resetInterviewButton").addEventListener("click", resetInterview);
$("skipQuestionButton").addEventListener("click", () => {
  const active = activeInterviewQuestions();
  state.questionIndex = Math.min(state.questionIndex + 1, active.length - 1);
  updateQuestion();
  saveDraft();
});

$("generatorForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (state.generationBusy) return;
  const previousSections = getSectionValues();
  const previousImages = { imageStudioImage: state.imageStudioImage, faceReferenceImage: state.faceReferenceImage, fullBodyReferenceImage: state.fullBodyReferenceImage, personalityConstruction: state.personalityConstruction };
  const previousTitle = $("outputTitle").textContent;
  const previousVariants = Object.fromEntries(Object.entries(variantOutputs).map(([key, id]) => [key, $(id).value]));
  const previousPrompt = value("imageStudioFinalPromptOutput");
  const restorePreviousOutput = () => {
    Object.entries(outputSections).forEach(([key, id]) => setValue(id, previousSections[key]));
    Object.entries(variantOutputs).forEach(([key, id]) => setValue(id, previousVariants[key]));
    setValue("imageStudioFinalPromptOutput", previousPrompt);
    Object.assign(state, previousImages);
    renderImagePreview();
    $("outputTitle").textContent = previousTitle;
    updateCounters();
    failGenerationProgress("Generation failed; previous output restored");
    $("statusPill").textContent = "Generation failed; previous output restored";
  };
  const payload = buildGeneratorPayload({ includeContinuity: false });
  payload.lockedSections = getLockedSections();
  payload.existingSections = Object.fromEntries(Object.entries(previousSections).filter(([key]) => isSectionLocked(journalParentByKeyphrases[key] || key)));
  let usedFallback = false;
  state.generationBusy = true;
  clearApiError();
  clearGeneratedOutput({ title: "Generating fresh Kin...", save: false, preserveLocked: true, clearGreetingStudio: false });
  setOutputCollapsed(false);
  setWorkspaceTab("output", "main");
  startGenerationProgress();
  if (value("age") && inferAge(value("age")) !== Number.parseInt(value("age"), 10)) {
    $("statusPill").textContent = "Adjusted to adult age";
    setValue("age", "27");
  } else {
    $("statusPill").textContent = "Generating...";
  }

  let output;
  let generationDetails;
  try {
    const aiResult = await generateKindroidWithAi(payload);
    generationDetails = aiResult;
    output = aiResult.output;
    $("statusPill").textContent = `AI generated: ${aiResult.model}`;
  } catch (error) {
    console.warn(error);
    showApiError(error, "Generate Kindroid");
    if (error.message === "Missing OPENAI_API_KEY") {
      output = generateKindroid();
      usedFallback = true;
    } else {
      restorePreviousOutput();
      state.generationBusy = false;
      return;
    }
  }

  try {
    setGenerationProgress(5);
    setValue("greetingDraftOutput", "");
    state.greetingReview = { issues: [], decisions: {} };
    $("greetingStudioReport")?.classList.add("hidden");
    $("greetingDraftPanel")?.classList.add("hidden");
    $("outputTitle").textContent = `${inferName(value("coreIdea"))} is ready`;
    setOutputSections(output, { preserveLocked: true });
    if (!isSectionLocked("backstory") && generationDetails) state.personalityConstruction = generationDetails.personalityConstruction || null;
    const generatedSections = getSectionValues();
    applyGeneratedValuesToForm(generatedSections);
    const generatedJournalCount = importGeneratedJournals();
    if (generationDetails?.journalEntries?.length) {
      const additions = generationDetails.journalEntries.map(entry => {
        let title = entry.title;
        let suffix = 2;
        while ((state.journals || []).some(existing => existing.title.toLowerCase() === title.toLowerCase() && existing.body !== entry.body)) title = `${entry.title} ${suffix++}`;
        return { ...entry, title, category: entry.category || "World" };
      });
      const capacity = Math.max(0, journalConfig.maxEntries - (state.journals || []).length);
      upsertNormalizedJournalEntries(additions.slice(0, capacity));
      if (additions.length > capacity) stageInferredJournalDrafts(additions.slice(capacity), "Personality context");
    }
    finishGenerationProgress("Generation complete");
    if (state.autoInferJournals) {
      $("statusPill").textContent = "Inferring journal drafts...";
      try {
        const result = await inferJournalsWithAi("profile");
        const count = stageInferredJournalDrafts(result.entries, "Auto inferred");
        setWorkspaceTab("output", count ? "journals" : "main");
        $("statusPill").textContent = `Fresh AI generated; ${generatedJournalCount} manager journal${generatedJournalCount === 1 ? "" : "s"}, ${count} draft${count === 1 ? "" : "s"} ready`;
      } catch (error) {
        console.warn(error);
        showApiError(error, "Auto Infer Journals");
        setWorkspaceTab("output", "main");
        $("statusPill").textContent = `Generated ${generatedJournalCount} manager journal${generatedJournalCount === 1 ? "" : "s"}; inference failed`;
      }
    } else {
      setWorkspaceTab("output", generatedJournalCount ? "journals" : "main");
      $("statusPill").textContent = `Fresh AI generated; ${generatedJournalCount} manager journal${generatedJournalCount === 1 ? "" : "s"} added`;
    }
    setControlsCollapsed(true);
    if (usedFallback) $("statusPill").textContent = "Offline template generated; OpenAI API key is not configured";
    state.generationBusy = false;
    saveDraft();
  } catch (error) {
    restorePreviousOutput();
    showApiError(error, "Apply Generated Kindroid");
  } finally {
    state.generationBusy = false;
  }
});

$("randomSeedButton").addEventListener("click", async () => {
  $("statusPill").textContent = "Surprising...";
  clearApiError();
  try {
    const result = await generateSurpriseWithAi();
    const surprise = result.surprise;
    ["creationType", "ensembleMembers", "worldNarrationNotes", "kindroidName", "gender", "species", "age", "currentCity", "currentState", "currentCountry", "coreIdea", "occupation", "secondaryOccupation", "education", "genre", "nameGenre", "tonePack", "storyIntensity", ...worldFieldIds, "boundaries", "personality", "dynamic", "relationshipPreset", "intimacy", "intimacyOrientation", "partnerStyle", "chemistry", "moralEdge", "dramaHeat", "traumaResponse", "mbti", "tritype"].forEach((id) => {
      if (surprise[id] !== undefined && !isFieldLocked(id)) setFieldValue(id, String(surprise[id] || ""), "ai");
    });
    if (surprise.powerLeaning !== undefined && !isFieldLocked("powerLeaning")) {
      const powerMap = { Dom: "1", "Dom-leaning": "2", Switch: "3", "Sub-leaning": "4", Sub: "5" };
      setFieldValue("powerLeaning", powerMap[surprise.powerLeaning] || "3", "ai");
      updatePowerLeaningLabel();
    }
    if (surprise.appearance) {
      appearanceFieldIds.forEach((id) => {
        if (surprise.appearance[id] !== undefined && !isFieldLocked(id)) setFieldValue(id, String(surprise.appearance[id] || ""), "ai");
      });
    }
    if (surprise.personalityModel) {
      const model = surprise.personalityModel;
      if (model.bigFive) {
        if (model.bigFive.openness !== undefined) setFieldValue("bigFiveOpenness", String(model.bigFive.openness || 3), "ai");
        if (model.bigFive.conscientiousness !== undefined) setFieldValue("bigFiveConscientiousness", String(model.bigFive.conscientiousness || 3), "ai");
        if (model.bigFive.extraversion !== undefined) setFieldValue("bigFiveExtraversion", String(model.bigFive.extraversion || 3), "ai");
        if (model.bigFive.agreeableness !== undefined) setFieldValue("bigFiveAgreeableness", String(model.bigFive.agreeableness || 3), "ai");
        if (model.bigFive.emotionalStability !== undefined) setFieldValue("bigFiveEmotionalStability", String(model.bigFive.emotionalStability || 3), "ai");
      }
      if (model.enneagramType !== undefined) setFieldValue("enneagramType", String(model.enneagramType || ""), "ai");
      if (model.enneagramWing !== undefined) setFieldValue("enneagramWing", String(model.enneagramWing || ""), "ai");
      if (model.attachmentStyle !== undefined) setFieldValue("attachmentStyle", String(model.attachmentStyle || ""), "ai");
      if (model.traumaResponse !== undefined) setFieldValue("traumaResponse", String(model.traumaResponse || ""), "ai");
      if (model.moralAlignment !== undefined) setFieldValue("moralAlignment", String(model.moralAlignment || ""), "ai");
    }
    state.answers = { ...(surprise.interviewAnswers || {}) };
    state.interviewQuestions = [];
    state.questionIndex = 0;
    updateQuestion();
    applyCreationTypeUi();
    $("outputTitle").textContent = "Fresh AI fields loaded";
    $("statusPill").textContent = `Surprise: ${result.model}`;
    updatePersonalityPreview();
    saveDraft();
  } catch (error) {
    console.warn(error);
    showApiError(error, "Surprise Me");
    $("statusPill").textContent = `Surprise failed: ${error.message.slice(0, 38)}`;
  }
});

$("randomAppearanceButton").addEventListener("click", () => {
  randomizeAppearance();
  setWorkspaceTab("control", "appearance");
  $("statusPill").textContent = "Randomized appearance";
});

$("generateNamesButton").addEventListener("click", async () => {
  $("statusPill").textContent = "Generating names...";
  clearApiError();
  try {
    const result = await generateNamesWithAi();
    state.generatedNames = (result.names || []).map(normalizeNameOption).slice(0, 20);
    renderNameForge();
    setWorkspaceTab("control", "names");
    $("statusPill").textContent = `Generated ${state.generatedNames.length} names: ${result.model}`;
  } catch (error) {
    console.warn(error);
    showApiError(error, "Generate Names");
    state.generatedNames = fallbackNameOptions().map(normalizeNameOption);
    renderNameForge();
    $("statusPill").textContent = `Fallback names: ${error.message.slice(0, 38)}`;
  }
  saveDraft();
});

function findNameOption(fullName) {
  const lower = String(fullName || "").toLowerCase();
  return [...(state.generatedNames || []), ...(state.favoriteNames || [])].find((option) => option.fullName.toLowerCase() === lower);
}

function handleNameListClick(event) {
  const apply = event.target.closest("[data-apply-name]");
  const favorite = event.target.closest("[data-favorite-name]");
  const remove = event.target.closest("[data-remove-name]");
  if (apply) {
    const option = findNameOption(apply.dataset.applyName);
    if (!option) return;
    setFieldValue("kindroidName", option.fullName, "user");
    $("statusPill").textContent = `Using ${option.fullName}`;
  }
  if (favorite) {
    const option = findNameOption(favorite.dataset.favoriteName);
    if (!option) return;
    state.favoriteNames ||= [];
    if (!state.favoriteNames.some((item) => item.fullName.toLowerCase() === option.fullName.toLowerCase())) {
      state.favoriteNames.push(option);
      $("statusPill").textContent = `Favorited ${option.fullName}`;
    }
  }
  if (remove) {
    const lower = remove.dataset.removeName.toLowerCase();
    state.favoriteNames = (state.favoriteNames || []).filter((option) => option.fullName.toLowerCase() !== lower);
    $("statusPill").textContent = "Removed favorite name";
  }
  renderNameForge();
  saveDraft();
}

$("nameResults").addEventListener("click", handleNameListClick);
$("nameFavorites").addEventListener("click", handleNameListClick);
$("clearNameFavoritesButton").addEventListener("click", () => {
  state.favoriteNames = [];
  renderNameForge();
  saveDraft();
  $("statusPill").textContent = "Cleared favorite names";
});

$("copyButton").addEventListener("click", async () => {
  const text = getCombinedOutput();
  if (!text) return;
  await navigator.clipboard.writeText(text);
  $("statusPill").textContent = "Copied all";
});

$("saveButton").addEventListener("click", () => {
  const text = buildFullTextSave();
  if (!text) return;
  saveTextFile(buildSaveFilename(), text);
  $("statusPill").textContent = "Saved text file";
});

$("saveSettingsButton").addEventListener("click", () => {
  saveJsonFile(buildSettingsFilename(), buildSettingsExport());
  $("statusPill").textContent = "Saved settings JSON";
});

$("savePackageButton").addEventListener("click", () => {
  saveJsonFile(buildPackageFilename(), buildPackageExport());
  $("statusPill").textContent = "Saved full package";
});

$("exportKinBundleButton")?.addEventListener("click", () => {
  const imageCount = exportKinBundle();
  $("statusPill").textContent = `Exported .kin bundle${imageCount ? ` with ${imageCount} image${imageCount === 1 ? "" : "s"}` : ""}`;
});

$("openCharacterSheetButton")?.addEventListener("click", openCharacterSheet);
$("closeCharacterSheetButton")?.addEventListener("click", closeCharacterSheet);
$("editInKinForgeButton")?.addEventListener("click", closeCharacterSheet);
$("exportCharacterSheetButton")?.addEventListener("click", () => {
  exportCharacterSheet();
  $("statusPill").textContent = "Exported character sheet";
});

$("checkConsistencyButton").addEventListener("click", async () => {
  $("statusPill").textContent = "Checking consistency...";
  clearApiError();
  try {
    const result = await checkConsistencyWithAi();
    renderConsistencyReport(result.report);
    const issueCount = result.report?.issues?.length || 0;
    $("statusPill").textContent = `Consistency: ${issueCount} issue${issueCount === 1 ? "" : "s"} (${result.model})`;
  } catch (error) {
    console.warn(error);
    showApiError(error, "Check Consistency");
    $("statusPill").textContent = `Consistency failed: ${error.message.slice(0, 38)}`;
  }
});

$("copyConsistencyButton").addEventListener("click", async () => {
  const text = consistencyReportText();
  if (!text) return;
  await navigator.clipboard.writeText(text);
  $("statusPill").textContent = "Copied consistency report";
});

$("closeConsistencyButton").addEventListener("click", () => {
  $("consistencyPanel").classList.add("hidden");
});

$("copyApiErrorButton").addEventListener("click", async () => {
  if (!lastApiErrorText) return;
  await navigator.clipboard.writeText(lastApiErrorText);
  $("statusPill").textContent = "Copied API error";
});

$("closeApiErrorButton").addEventListener("click", clearApiError);

$("toggleControlsButton")?.addEventListener("click", () => {
  setControlsCollapsed(!state.controlsCollapsed);
  saveDraft();
});

$("toggleOutputButton")?.addEventListener("click", () => {
  setOutputCollapsed(!state.outputCollapsed);
  saveDraft();
});

$("addJournalButton").addEventListener("click", () => {
  if ((state.journals || []).length >= journalConfig.maxEntries) {
    $("statusPill").textContent = "Journal limit reached";
    return;
  }
  createJournalEntry(value("journalTemplate") || "Blank Entry");
  renderJournalManager();
  saveDraft();
  $("statusPill").textContent = "Added journal";
});

$("newJournalFromEditorButton").addEventListener("click", () => {
  createJournalEntry();
  renderJournalManager();
  saveDraft();
  $("statusPill").textContent = "New journal ready";
});

$("saveJournalButton").addEventListener("click", () => {
  saveJournalFromEditor();
  $("statusPill").textContent = "Saved journal";
});

$("deleteJournalButton").addEventListener("click", () => {
  deleteActiveJournal();
  $("statusPill").textContent = "Deleted journal";
});

$("importGeneratedJournalsButton").addEventListener("click", () => {
  const count = importGeneratedJournals();
  $("statusPill").textContent = `Imported ${count} generated journal${count === 1 ? "" : "s"}`;
});

$("inferJournalsButton").addEventListener("click", async () => {
  $("statusPill").textContent = "Inferring journals...";
  clearApiError();
  try {
    const result = await inferJournalsWithAi("profile");
    const count = stageInferredJournalDrafts(result.entries, "AI inferred");
    setWorkspaceTab("output", "journals");
    $("statusPill").textContent = `Staged ${count} journal draft${count === 1 ? "" : "s"}: ${result.model}`;
  } catch (error) {
    console.warn(error);
    showApiError(error, "Infer Journals");
    $("statusPill").textContent = `Journal inference failed: ${error.message.slice(0, 34)}`;
  }
});

$("auditJournalsButton").addEventListener("click", async () => {
  $("statusPill").textContent = "Auditing journals...";
  clearApiError();
  try {
    const result = await inferJournalsWithAi("audit");
    const count = stageInferredJournalDrafts(result.entries, "Audit suggested");
    setWorkspaceTab("output", "journals");
    $("statusPill").textContent = `Staged ${count} audit draft${count === 1 ? "" : "s"}: ${result.model}`;
  } catch (error) {
    console.warn(error);
    showApiError(error, "Audit Journals");
    $("statusPill").textContent = `Journal audit failed: ${error.message.slice(0, 38)}`;
  }
});

$("autoInferJournals").addEventListener("change", () => {
  state.autoInferJournals = $("autoInferJournals").checked;
  saveDraft();
  $("statusPill").textContent = state.autoInferJournals ? "Auto journal drafts enabled" : "Auto journal drafts disabled";
});

$("acceptAllJournalDraftsButton").addEventListener("click", () => {
  const count = acceptAllJournalDrafts();
  $("statusPill").textContent = `Accepted ${count} journal draft${count === 1 ? "" : "s"}`;
});

$("rejectAllJournalDraftsButton").addEventListener("click", () => {
  const count = rejectAllJournalDrafts();
  $("statusPill").textContent = `Rejected ${count} journal draft${count === 1 ? "" : "s"}`;
});

$("journalReviewQueue").addEventListener("click", (event) => {
  const accept = event.target.closest("[data-accept-journal-draft]");
  const reject = event.target.closest("[data-reject-journal-draft]");
  if (accept) {
    const count = acceptJournalDraft(accept.dataset.acceptJournalDraft);
    $("statusPill").textContent = count ? "Accepted journal draft" : "Draft no longer exists";
  }
  if (reject) {
    const count = rejectJournalDraft(reject.dataset.rejectJournalDraft);
    $("statusPill").textContent = count ? "Rejected journal draft" : "Draft no longer exists";
  }
});

$("optimizeJournalButton").addEventListener("click", async () => {
  if (!activeJournal()) {
    $("statusPill").textContent = "Select a journal first";
    return;
  }
  $("statusPill").textContent = "Optimizing journal...";
  clearApiError();
  try {
    const result = await inferJournalsWithAi("active");
    const count = upsertInferredJournals(result.entries);
    $("statusPill").textContent = `Optimized ${count} journal: ${result.model}`;
  } catch (error) {
    console.warn(error);
    showApiError(error, "Optimize Journal");
    $("statusPill").textContent = `Optimize failed: ${error.message.slice(0, 42)}`;
  }
});

$("copyJournalExportButton").addEventListener("click", async () => {
  const text = journalExportText();
  if (!text) return;
  await navigator.clipboard.writeText(text);
  $("statusPill").textContent = "Copied journal export";
});

$("addJournalCategoryButton").addEventListener("click", () => {
  const category = value("newJournalCategory");
  if (!category) return;
  state.journalCategories ||= [];
  if (!state.journalCategories.some((item) => item.toLowerCase() === category.toLowerCase())) {
    state.journalCategories.push(category);
  }
  state.journalCategory = category;
  setValue("newJournalCategory", "");
  renderJournalManager();
  saveDraft();
});

$("journalSearch").addEventListener("input", renderJournalCards);
$("journalSort").addEventListener("change", renderJournalCards);
$("journalKeywords").addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  const current = value("journalKeywords");
  if (current && !current.endsWith(",")) setValue("journalKeywords", `${current}, `);
});
$("journalBrowser").addEventListener("click", (event) => {
  const card = event.target.closest("[data-journal-id]");
  if (!card) return;
  state.activeJournalId = card.dataset.journalId;
  renderJournalManager();
  saveDraft();
});
$("journalCategoryTabs").addEventListener("click", (event) => {
  const tab = event.target.closest("[data-journal-category]");
  if (!tab) return;
  state.journalCategory = tab.dataset.journalCategory;
  renderJournalManager();
  saveDraft();
});
["journalTitle", "journalCategory", "journalKeywords", "journalBody"].forEach((id) => {
  const updateJournalField = () => {
    const entry = activeJournal();
    if (!entry) return;
    if (id === "journalTitle") entry.title = value(id) || "Untitled Journal";
    if (id === "journalCategory") {
      entry.category = value(id) || "Overview";
      state.journalCategory = entry.category;
    }
    if (id === "journalKeywords") entry.keywords = parseJournalKeywords(value(id));
    if (id === "journalBody") entry.body = value(id).slice(0, journalConfig.maxBodyCharacters);
    entry.updatedAt = journalTimestamp();
    renderJournalManager();
    saveDraft();
  };
  $(id).addEventListener("input", updateJournalField);
  $(id).addEventListener("change", updateJournalField);
});

$("clearGeneratedButton").addEventListener("click", () => {
  clearGeneratedOutput({ title: "Generated output cleared" });
  clearApiError();
  $("sceneVariantsPanel").classList.add("hidden");
  $("generationProgress").classList.add("hidden");
  stopGenerationProgress();
  $("statusPill").textContent = "Cleared generated output";
});

$("loadButton").addEventListener("click", () => {
  $("loadFileInput").click();
});

$("loadFileInput").addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) loadTextFile(file);
  event.target.value = "";
});

function openKinImport() {
  $("kinImportOverlay").hidden = false;
  $("kinImportStatus").textContent = "Ready to import.";
  if ($("kinImportCreationTypeHint")) $("kinImportCreationTypeHint").value = value("creationType") || "";
}

function closeKinImport() {
  $("kinImportOverlay").hidden = true;
}

$("openKinImportButton")?.addEventListener("click", openKinImport);
$("closeKinImportButton")?.addEventListener("click", closeKinImport);
$("kinImportOverlay")?.addEventListener("click", (event) => {
  if (event.target === $("kinImportOverlay")) closeKinImport();
});
$("chooseKinImportFileButton")?.addEventListener("click", () => $("kinImportFileInput").click());
$("clearKinImportTextButton")?.addEventListener("click", () => {
  setValue("kinImportText", "");
  $("kinImportStatus").textContent = "Import text cleared.";
});
$("kinImportFileInput")?.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    setValue("kinImportText", String(reader.result || ""));
    $("kinImportStatus").textContent = `Loaded ${file.name} into import box.`;
  });
  reader.addEventListener("error", () => {
    $("kinImportStatus").textContent = "Import file read failed.";
  });
  reader.readAsText(file);
  event.target.value = "";
});

$("inferKinImportButton")?.addEventListener("click", async () => {
  const importText = value("kinImportText");
  const creationTypeHint = value("kinImportCreationTypeHint");
  if (!importText) {
    $("kinImportStatus").textContent = "Paste or choose Kin text first.";
    return;
  }
  clearApiError();
  $("inferKinImportButton").disabled = true;
  $("inferKinImportButton").textContent = "Inferring...";
  $("kinImportStatus").textContent = `Reading Kin text and inferring settings${creationTypeHint ? ` as ${creationTypeHint}` : ""}...`;
  $("statusPill").textContent = "Importing Kin text...";
  try {
    resetKinImportCanvas();
    const parsed = setImportedOutputSections(importText);
    if (!parsed.count) {
      setValue(outputSections.backstory, compact(cleanGeneratedText(importText), sectionMeta.backstory.max));
      parsed.sections.backstory = value(outputSections.backstory);
    }
    const result = await inferKinTextWithAi(importText);
    if (creationTypeHint) result.importData.fields ||= {};
    if (creationTypeHint) result.importData.fields.creationType = creationTypeHint;
    const count = applyImportedKinFields(result.importData.fields || {}, { overwrite: true });
    if (result.importData.interviewAnswers) {
      state.answers = { ...state.answers, ...result.importData.interviewAnswers };
      updateQuestion();
    }
    setOutputCollapsed(false);
    setControlsCollapsed(false);
    applyCreationTypeUi();
    setWorkspaceTab("control", "kin");
    setWorkspaceTab("output", "main");
    $("outputTitle").textContent = `${value("kindroidName") || "Imported Kin"} imported`;
    $("kinImportStatus").textContent = `Inferred ${count} setting${count === 1 ? "" : "s"} with ${result.model}.`;
    $("statusPill").textContent = `Imported Kin text: ${result.model}`;
    closeKinImport();
  } catch (error) {
    console.warn(error);
    showApiError(error, "Import Kin Text");
    resetKinImportCanvas();
    const parsed = setImportedOutputSections(importText);
    if (!parsed.count) {
      setValue(outputSections.backstory, compact(cleanGeneratedText(importText), sectionMeta.backstory.max));
      parsed.sections.backstory = value(outputSections.backstory);
    }
    const fallbackFields = generatedFieldBackfill(parsed.sections);
    const count = applyImportedKinFields(fallbackFields, { overwrite: true });
    ["why", "wound", "dream", "complication", "texture", "voice"].forEach((key) => {
      if (fallbackFields[key]) state.answers[key] = fallbackFields[key];
    });
    updateQuestion();
    applyCreationTypeUi();
    setWorkspaceTab("control", "kin");
    setWorkspaceTab("output", "main");
    $("kinImportStatus").textContent = `AI import failed; local backfill applied ${count} setting${count === 1 ? "" : "s"}.`;
    $("statusPill").textContent = `Local import fallback: ${error.message.slice(0, 34)}`;
  } finally {
    $("inferKinImportButton").disabled = false;
    $("inferKinImportButton").textContent = "Infer Settings";
    updateCounters();
    saveDraft();
  }
});

$("sceneVariantsButton").addEventListener("click", async () => {
  $("sceneVariantsPanel").classList.remove("hidden");
  $("statusPill").textContent = "Generating variants...";
  clearApiError();
  try {
    const result = await generateSceneVariantsWithAi();
    setSceneVariants(result.variants);
    $("statusPill").textContent = `Variants: ${result.model}`;
  } catch (error) {
    console.warn(error);
    showApiError(error, "Scene Variants");
    setSceneVariants(buildFallbackSceneVariants());
    $("statusPill").textContent = `Fallback variants: ${error.message.slice(0, 34)}`;
  }
  saveDraft();
});

$("closeVariantsButton").addEventListener("click", () => {
  $("sceneVariantsPanel").classList.add("hidden");
});

$("rewriteGreetingButton").addEventListener("click", async () => {
  if (isSectionLocked("opening")) {
    $("statusPill").textContent = "Scene Setting is locked";
    return;
  }
  $("statusPill").textContent = "Rewriting greeting...";
  $("greetingStudioReport").classList.add("hidden");
  clearApiError();
  try {
    const result = await rewriteGreetingWithAi();
    setValue("greetingDraftOutput", cleanGreetingText(stripSectionLabel(result.greeting, "opening")));
    $("greetingDraftPanel").classList.remove("hidden");
    $("statusPill").textContent = `Greeting draft ready: ${result.model}`;
  } catch (error) {
    console.warn(error);
    showApiError(error, "Scene Studio Rewrite");
    const fallback = buildOpeningVariant(buildProfile(), value("greetingStudioStyle").toLowerCase().includes("conflict") ? "conflict" : "quiet");
    setValue("greetingDraftOutput", cleanGreetingText(stripSectionLabel(fallback, "opening")));
    $("greetingDraftPanel").classList.remove("hidden");
    $("statusPill").textContent = `Fallback draft: ${error.message.slice(0, 34)}`;
  }
  updateCounters();
  saveDraft();
});

$("applyGreetingDraftButton").addEventListener("click", () => {
  if (isSectionLocked("opening")) {
    $("statusPill").textContent = "Scene Setting is locked";
    return;
  }
  const draft = value("greetingDraftOutput");
  if (!draft) return;
  setValue(outputSections.opening, cleanGreetingText(stripSectionLabel(draft, "opening")));
  updateCounters();
  saveDraft();
  $("statusPill").textContent = "Applied greeting draft";
});

$("checkGreetingButton").addEventListener("click", async () => {
  $("statusPill").textContent = "Checking greeting...";
  clearApiError();
  try {
    const result = await checkGreetingWithAi();
    state.greetingReview = { issues: [], decisions: {} };
    renderGreetingReport(result.report);
    $("statusPill").textContent = `Greeting checked: ${result.model}`;
  } catch (error) {
    console.warn(error);
    showApiError(error, "Scene Studio Check");
    state.greetingReview = { issues: [], decisions: {} };
    renderGreetingReport(buildLocalGreetingReport());
    $("statusPill").textContent = `Local greeting check: ${error.message.slice(0, 32)}`;
  }
});

$("greetingStudioReport").addEventListener("click", (event) => {
  const button = event.target.closest("[data-greeting-decision]");
  if (!button) return;
  setGreetingIssueDecision(Number.parseInt(button.dataset.greetingIssue, 10), button.dataset.greetingDecision);
  $("statusPill").textContent = `Greeting suggestion ${button.dataset.greetingDecision}`;
});

document.querySelectorAll(".apply-variant").forEach((button) => {
  button.addEventListener("click", () => {
    if (isSectionLocked("opening")) {
      $("statusPill").textContent = "Scene Setting is locked";
      return;
    }
    const text = $(variantOutputs[button.dataset.variant]).value.trim();
    if (!text) return;
    setValue(outputSections.opening, cleanGeneratedText(text));
    updateCounters();
    saveDraft();
    $("statusPill").textContent = "Applied scene variant";
  });
});

$("clearButton").addEventListener("click", () => {
  state.personalityConstruction = null;
  normalizeKindroidApiState();
  const preservedKindroidApi = JSON.parse(JSON.stringify(state.kindroidApi));
  localStorage.removeItem("kinforge-kindroid-draft");
  clearApiError();
  document.querySelectorAll("input, textarea").forEach((field) => {
    field.value = "";
  });
  $("createPlayerProfile").checked = true;
  $("creationType").value = "Single Character";
  $("tonePack").value = "";
  $("storyIntensity").value = "";
  $("boundaries").value = "";
  $("relationshipPreset").value = "";
  $("chemistry").value = "";
  $("moralEdge").value = "";
  $("dramaHeat").value = "";
  $("greetingStudioStyle").value = "Natural first contact";
  restoreImageStudioSettings({
    scene: "portrait",
    modelTier: "balanced",
    consistency: "Balanced likeness",
    style: "Realistic photograph",
    seed: "",
    customPrompt: "",
    finalPrompt: "",
  });
  state.imageStudioImage = null;
  state.faceReferenceImage = null;
  state.fullBodyReferenceImage = null;
  renderImagePreview();
  setValue("greetingDraftOutput", "");
  state.greetingReview = { issues: [], decisions: {} };
  $("greetingStudioReport").classList.add("hidden");
  $("greetingDraftPanel").classList.add("hidden");
  $("powerLeaning").value = "3";
  personalityFieldIds.forEach((id) => {
    if ($(id)?.type === "range") setValue(id, "3");
    else setValue(id, "");
  });
  nameFieldIds.forEach((id) => {
    if ($(id)?.type === "range") setValue(id, "3");
    else setValue(id, "");
  });
  appearanceFieldIds.forEach((id) => setValue(id, ""));
  state.fieldMeta = {};
  generatorFieldIds.forEach((id) => {
    if ($(id)) {
      fieldMeta(id);
      updateFieldMetaUi(id);
    }
  });
  Object.values(outputSections).forEach((id) => setValue(id, ""));
  Object.values(variantOutputs).forEach((id) => setValue(id, ""));
  $("sceneVariantsPanel").classList.add("hidden");
  $("generationProgress").classList.add("hidden");
  stopGenerationProgress();
  setSectionLocks(Object.fromEntries(Object.keys(outputSections).map((key) => [key, false])));
  state.questionIndex = 0;
  state.answers = {};
  state.interviewQuestions = [];
  state.controlsCollapsed = false;
  state.outputCollapsed = false;
  state.journals = [];
  state.journalDrafts = [];
  state.autoInferJournals = false;
  state.generatedNames = [];
  state.favoriteNames = [];
  state.journalCategories = ["Overview", "People", "Places", "Objects", "Events", "Relationships", "World", "Behavior", "Temporary"];
  state.journalCategory = "Overview";
  state.activeJournalId = "";
  state.kindroidApi = preservedKindroidApi;
  syncKindroidApiControlsFromState();
  updateQuestion();
  setControlsCollapsed(false);
  setOutputCollapsed(false);
  updateCounters();
  updatePersonalityPreview();
  updatePowerLeaningLabel();
  applyCreationTypeUi();
  renderNameForge();
  renderJournalManager();
  $("statusPill").textContent = "Cleared";
});

document.querySelectorAll("input, select, textarea").forEach((field) => {
  field.addEventListener("input", () => {
    if (field.id === "kinImportText" || field.id === "kinImportFileInput") return;
    if (field.id === "nameEstimatedBirthYear") return;
    if (field.id === "age" || field.id === "nameCurrentYear") updateEstimatedBirthYear();
    if (field.id === "powerLeaning") updatePowerLeaningLabel();
    if (field.id === "creationType") applyCreationTypeUi();
    if (["userName", "kindroidName"].includes(field.id)) renderKindroidChatHistory();
    updateCounters();
    noteUserFieldInput(field.id);
    if (personalityFieldIds.includes(field.id)) updatePersonalityPreview();
    saveDraft();
  });
  field.addEventListener("change", () => {
    if (field.id === "kinImportText" || field.id === "kinImportFileInput") return;
    if (field.id === "nameEstimatedBirthYear") return;
    if (field.id === "age" || field.id === "nameCurrentYear") updateEstimatedBirthYear();
    if (field.id === "powerLeaning") updatePowerLeaningLabel();
    if (field.id === "creationType") applyCreationTypeUi();
    if (["userName", "kindroidName"].includes(field.id)) renderKindroidChatHistory();
    noteUserFieldInput(field.id);
    if (personalityFieldIds.includes(field.id)) updatePersonalityPreview();
    saveDraft();
  });
});

$("buildImagePromptButton")?.addEventListener("click", () => {
  const prompt = buildAndRenderImageStudioPrompt();
  $("statusPill").textContent = prompt ? `Built image prompt for ${imageStudioModelLabel()}` : "Image prompt needs generated description first";
});

$("copyImagePromptButton")?.addEventListener("click", async () => {
  const text = value("imageStudioFinalPromptOutput") || buildAndRenderImageStudioPrompt();
  if (!text) return;
  await navigator.clipboard.writeText(text);
  $("statusPill").textContent = "Copied image prompt";
});

async function runImageGeneration(button, options = {}) {
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Generating...";
  state.imageStudioBusy = true;
  renderImagePreview();
  clearApiError();
  if (options.forceScene && $("imageStudioScene")) setValue("imageStudioScene", options.forceScene);
  if (options.customPrompt !== undefined && $("imageStudioCustomPrompt")) setValue("imageStudioCustomPrompt", options.customPrompt);
  $("statusPill").textContent = options.status || "Generating image...";
  try {
    const seed = ensureImageStudioSeed();
    const prompt = buildAndRenderImageStudioPrompt({
      profileReference: Boolean(options.profileReference),
      fullBodyReference: Boolean(options.fullBodyReference),
    });
    const result = await generateImageWithAi();
    state.imageStudioImage = {
      image: result.image,
      source: "generated",
      revisedPrompt: result.revisedPrompt || "",
      prompt,
      model: result.model || imageStudioModelLabel(),
      scene: options.fullBodyReference ? "full-body reference" : options.profileReference ? "face reference" : value("imageStudioScene") || "portrait",
      seed,
      createdAt: new Date().toISOString(),
    };
    if (options.profileReference) state.faceReferenceImage = { ...state.imageStudioImage };
    if (options.fullBodyReference) state.fullBodyReferenceImage = { ...state.imageStudioImage };
    renderImagePreview();
    saveDraft();
    setWorkspaceTab("output", "description");
    $("statusPill").textContent = `${options.doneLabel || "Image generated"}: ${state.imageStudioImage.model}`;
  } catch (error) {
    console.warn(error);
    showApiError(error, "Image Generation");
    $("statusPill").textContent = `Image failed: ${error.message.slice(0, 42)}`;
  } finally {
    state.imageStudioBusy = false;
    renderImagePreview();
    button.disabled = false;
    button.textContent = originalText;
  }
}

$("generateImageButton")?.addEventListener("click", async () => {
  await runImageGeneration($("generateImageButton"));
});

$("generateProfileImageButton")?.addEventListener("click", async () => {
  await runImageGeneration($("generateProfileImageButton"), {
    forceScene: "portrait",
    customPrompt: "",
    profileReference: true,
    status: "Generating profile image...",
    doneLabel: "Profile image generated",
  });
});

$("generateFullBodyImageButton")?.addEventListener("click", async () => {
  await runImageGeneration($("generateFullBodyImageButton"), {
    forceScene: "portrait",
    customPrompt: "",
    fullBodyReference: true,
    status: "Generating full-body reference...",
    doneLabel: "Full-body reference generated",
  });
});

$("clearImagePreviewButton")?.addEventListener("click", () => {
  clearImagePreview();
  $("statusPill").textContent = "Cleared image preview";
});

$("uploadPortraitButton")?.addEventListener("click", () => {
  $("portraitUploadInput")?.click();
});

$("portraitUploadInput")?.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) uploadPortraitFile(file);
  event.target.value = "";
});

$("saveGeneratedImageButton")?.addEventListener("click", () => {
  const data = state.imageStudioImage;
  const saved = saveDataUrlFile(`${safeFilePart(value("kindroidName") || "KinForge Image")} - ${data?.scene || "image"}.${imageFileExtension(data)}`, data?.image || "");
  $("statusPill").textContent = saved ? "Saved image" : "No image to save";
});

$("imageStudioModelTier")?.addEventListener("change", () => {
  $("imageStudioCustomModel").hidden = value("imageStudioModelTier") !== "custom";
  applyImageStudioModelToRouting();
  saveDraft();
});

$("imageStudioCustomModel")?.addEventListener("input", () => {
  applyImageStudioModelToRouting();
  saveDraft();
});

$("tritype").addEventListener("blur", () => {
  const normalized = normalizeTritypeValue(value("tritype"));
  if (normalized && normalized !== value("tritype")) {
    setFieldValue("tritype", normalized, fieldMeta("tritype").origin || "user");
    updatePersonalityPreview();
    saveDraft();
  }
});

document.querySelectorAll("[data-help-system]").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openPersonalityHelp(button);
  });
});

$("closePersonalityHelp").addEventListener("click", closePersonalityHelp);
$("personalityHelpOverlay").addEventListener("click", (event) => {
  if (event.target === $("personalityHelpOverlay")) closePersonalityHelp();
});

$("characterSheetOverlay")?.addEventListener("click", (event) => {
  if (event.target === $("characterSheetOverlay")) closeCharacterSheet();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !$("personalityHelpOverlay").hidden) closePersonalityHelp();
  if (event.key === "Escape" && !$("kinImportOverlay").hidden) closeKinImport();
  if (event.key === "Escape" && !$("characterSheetOverlay").hidden) closeCharacterSheet();
});

document.querySelectorAll(".copy-section").forEach((button) => {
  button.addEventListener("click", async () => {
    const text = formatSectionForCopy(button.dataset.copySection);
    if (!text) return;
    await navigator.clipboard.writeText(text);
    $("statusPill").textContent = `Copied ${sectionMeta[button.dataset.copySection]?.label || "section"}`;
  });
});

document.querySelectorAll(".reroll-section").forEach((button) => {
  button.addEventListener("click", async () => {
    const sectionKey = button.dataset.rerollSection;
    const label = sectionMeta[sectionKey]?.label || "section";
    if (isSectionLocked(sectionKey)) {
      $("statusPill").textContent = `${label} is locked`;
      return;
    }
    button.disabled = true;
    $("statusPill").textContent = `Rerolling ${label}...`;
    clearApiError();
    try {
      const result = await rerollSectionWithAi(sectionKey);
      const keyphrasesKey = journalPairs[sectionKey];
      if (keyphrasesKey) {
        const rerolled = parseOutputSections(result.section);
        setValue(outputSections[sectionKey], normalizeSectionValue(sectionKey, rerolled[sectionKey] || result.section));
        if (rerolled[keyphrasesKey]) {
          setValue(outputSections[keyphrasesKey], normalizeSectionValue(keyphrasesKey, rerolled[keyphrasesKey]));
        }
      } else {
        setValue(outputSections[sectionKey], normalizeSectionValue(sectionKey, result.section));
      }
      if (sectionKey === "backstory") {
        state.personalityConstruction = result.personalityConstruction || null;
        applyGeneratedValuesToForm(getSectionValues());
      }
      $("statusPill").textContent = `Rerolled ${label}: ${result.model}`;
    } catch (error) {
      console.warn(error);
      showApiError(error, `Reroll ${label}`);
      const fallback = error.message === "Missing OPENAI_API_KEY" ? fallbackRerollSection(sectionKey) : "";
      if (fallback) {
        setValue(outputSections[sectionKey], cleanGeneratedText(fallback));
        const keyphrasesKey = journalPairs[sectionKey];
        if (keyphrasesKey) {
          setValue(outputSections[keyphrasesKey], buildJournalKeyphrases(buildProfile(), sectionKey));
        }
        $("statusPill").textContent = `Fallback rerolled ${label}`;
      } else {
        $("statusPill").textContent = `Reroll failed: ${error.message.slice(0, 42)}`;
      }
    } finally {
      button.disabled = false;
      updateCounters();
      saveDraft();
    }
  });
});

setupWorkspaceTabs();
addFieldHelpControls();
renderAiControlPanel();
setupKindroidApiControls();
applyOutputMaxLengths();
addFieldEditingControls();
addLockControls();
loadDraft();
syncKindroidApiControlsFromState();
restoreEncryptedKindroidApiKey();
applyCreationTypeUi();
setWorkspaceTab("control", state.controlTab || "kin");
setWorkspaceTab("output", state.outputTab || "main");
setAppWorkspaceMode(state.workspaceMode || (state.controlsCollapsed ? "review" : "create"), { preserveTab: true });
updateMode(state.mode || "interview");
updateQuestion();
updatePersonalityPreview();
updateEstimatedBirthYear();
updatePowerLeaningLabel();
syncImageStudioModelFromRouting();
updateCounters();
renderNameForge();
renderJournalManager();
renderAppearanceReference();
setupFieldCharacterCounts();
