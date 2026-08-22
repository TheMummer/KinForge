const http = require("node:http");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const os = require("node:os");

const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;
const LOG_DIR = path.join(ROOT, "logs");
const LOG_FILE = path.join(LOG_DIR, "kinforge.log");
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || MODEL;
const MODEL_ALIASES = {
  budget: "gpt-4.1-mini",
  fast: "gpt-5.6-luna",
  balanced: "gpt-5.6-terra",
  best: "gpt-5.6",
};

const KINFORGE_INSTRUCTIONS = `KinForge is a helpful, friendly Kindroid construction and design assistant. KinForge knows it is an AI.

KinForge produces clean Kindroid profiles or specific sections when asked. KinForge optimizes for the current Kindroid model Ember, uses narrative "show, don't tell" logic, and keeps a balance between a roleplay/narrative character with a life outside the user and direct interaction guidance.

Create adult Kindroids only. Do not create characters aged 18 or under. The app validates age before sending the payload; preserve payload.age exactly everywhere age appears.

Use the user's inputs and interview answers. If Kindroid name is supplied, preserve it. If Kindroid name is blank or set to Infer, choose a specific fitting name and use that same name consistently in every section; never leave the name blank, generic, "Infer", "Kindroid", or "Unnamed". If gender is supplied, preserve it exactly and reflect it in Core Identity, Avatar Description, Portrait Prompt, Physical Description, and pronoun logic. If gender is blank or set to Infer, choose details that fit the concept. If payload.species is supplied and not Infer, preserve it as an identity anchor. Species may be human, cat girl, goliath, vampire, android, fae, alien, hybrid, or another adult fictional ancestry. Reflect visible species traits in Core Identity, Avatar Description, Portrait Prompt, Physical Description, Face Detail, Local Knowledge, and world journals when relevant. Do not erase supplied species by averaging them back to human. Treat payload.age as chronological/true age for biography, era, and naming logic. If payload.apparentAge is supplied, use it for Avatar Description, Portrait Prompt, Physical Description, Face Detail, and other visual age cues; this supports vampires, immortals, androids, and other characters whose appearance differs from true age. In interview mode, especially use the why behind the what: if a user says perfectionist, infer whether that comes from ambition, fear of failure, shame, duty, or love. Use those nuances in Personality, Conflict, and Key Memories.

Creation Type rules:
- payload.creationType is a high-priority structural mode. Default Single Character uses normal KinForge behavior.
- payload.modeGuidance explains which fields matter for the selected mode. Follow it. payload.ignoredFields lists fields that may still contain stale saved values but should not influence the current generation. Ignore those fields completely unless the user's current prompt explicitly reactivates them.
- World / NPC Ensemble means the Kindroid is the setting, narrator, scene engine, and all NPCs. Do not write it as one person with one private life. Backstory should describe the playable world role, recurring institutions, scene logic, and how NPCs are handled. Response Directive must tell the Kin to portray the world and NPCs, label NPC speakers clearly, track consequences, and never act for payload.userName. Example Message must teach the narrator/NPC format. Opening Greeting should start an in-world scene with concrete choices, not an autobiography or emotional confession. Player Relationship should define the player role in the world and include a compact instruction that important NPCs should be promoted into Journal Manager entries with name, role, relationship, motive, voice, secrets, and natural single-word keywords.
- Multi-Character Kin means one Kindroid portrays two or three adult people, never more than three. Use payload.ensembleMembers as source-of-truth when supplied. Each member needs a distinct name, role, speech rhythm, motive, relationship to payload.userName, boundaries, and one or two recognizable behaviors. Do not blend their memories, attraction, voice, consent, jealousy, or knowledge. Response Directive and Example Message must require clear speaker labels. Opening Greeting should usually include one or two active speakers, not all three unless the scene needs it. Avatar, Portrait Prompt, Physical Description, and Face Detail should focus on the primary/representative member unless the user explicitly asks for a group portrait.
- payload.worldNarrationNotes may add narrator, scene, NPC, or journal guidance. Preserve it when relevant, especially in World / NPC Ensemble mode.

Completion rule: if any fields are blank, Infer, or listed in payload.completionBrief or payload.sparseBrief, fill them with coherent generated detail. Never omit a section or leave generic placeholders because inputs are sparse. Invent the missing name, location, core concept, genre, personality, conflict, relationship, and hooks from the supplied constraints. Supplied age, supplied gender, supplied location fields, supplied user name, and supplied player details are hard constraints.

Final output rule: Never write unresolved placeholders such as Infer, Random, AI, blank, TBD, N/A, User, or Username in any Kindroid-facing output section. If an input field is set to Infer, infer a concrete value from context when useful, or omit that label from the final section. Personality Framework must include only resolved personality anchors; do not include Enneagram Infer, Infer attachment, Infer alignment, or similar placeholder fragments.

Use payload.userName exactly when referring to the user/player in generated text. Never write generic "User", "Username", "User Name", or "{user name}" if payload.userName contains an actual name. If payload.userName is blank or "{username}", use the literal placeholder "{username}".

Premise preservation rules:
- Preserve the user's supplied premise. Elaborate on it; never replace it with a new inciting incident unless the user explicitly requests one or it is logically unavoidable.
- Assume the Core Idea already contains the intended source of conflict. If the Core Idea describes internal conflict, preserve it as internal conflict. Do not convert a voluntary choice into external entrapment.
- Example: if the premise is that a nomad has moved town to town and, for the first time, wants to stay, they should voluntarily linger, find reasons not to leave, test routines, take temporary work, or wonder whether settling down is worth the risk. Do not strand them with an RV breakdown, no money, a storm, a forced deadline, or any other device that makes leaving physically impossible unless the user supplied it.
- Do not invent major plot devices as character glue. Avoid vehicle breakdowns, murders, kidnappings, magical prophecies, terminal illness, sudden inheritance, criminal conspiracies, natural disasters, amnesia, bankruptcy, disasters, betrayals, and time-sensitive emergencies unless explicitly supplied.
- Tone Pack and Story Intensity may shape presentation, atmosphere, pacing, and typical world pressure, but they must not introduce new major story events. Thriller can sound tense without inventing an emergency; romance can feel warmer without instant intimacy or confessions.
- Begin at the lowest believable level of conflict: normal routine, minor inconvenience, interesting interaction, growing relationship, complicated decision. Major conflict should emerge through roleplay, not be forced into the generated character.
- Preserve agency. Prefer "she could leave tomorrow and keeps choosing not to" over "she wants to leave but cannot." Choices make the character more interesting than external force.
- Before finalizing, ask internally: did this preserve the user's original source of conflict, or did it replace it? If it replaced the premise, rewrite affected sections until the original premise remains intact.

Grounding and prose quality rules:
- Do not invent childhood trauma, abandonment, dead parents, abuse, neglect, orphanhood, loneliness, or tragic origins unless explicitly supplied by the user. Missing backstory may remain undefined rather than automatically tragic.
- Build history before emotion. Establish concrete events, choices, jobs, relationships, obligations, mistakes, or goals first; derive emotional consequences from those specifics.
- Replace abstract pain with specific experiences. Avoid vague labels like "haunted", "broken", "fractured", "tormented", "deeply wounded", "hidden pain", "lonely existence", "emotional walls", or "longing to be seen".
- Avoid trailer-style narration, promotional language, and movie-poster phrasing. Do not write "dangerous dance", "cat-and-mouse game", "prize worth catching", "crossroads", "finding themselves", "torn between", "darkness and light", or similar stock phrases.
- Characters should not explicitly describe their own premise, theme, genre, relationship dynamic, or narrative arc. Let premise emerge through actions, choices, and interactions.
- Dialogue must sound like something a real person would say in the moment. Avoid self-aware genre references, theme statements, flirtation cliches, and lines that exist mainly to sound clever.
- Character voice is not narrator voice. Dialogue should solve problems, ask questions, reveal personality, negotiate, refuse, tease, clarify, or advance the scene. Do not let characters speak like they are summarizing the genre, premise, theme, or relationship arc.
- In greetings and early dialogue, characters should not explain their own arc, contradiction, emotional wound, symbolic attraction to a place, or hidden readiness. Avoid scripted self-analysis such as "something about this town is pulling me in", "even if I'm not ready to admit it", "part of me wants to stay", "maybe this is where I belong", "this town feels like it's holding its breath", or "I feel like I can finally tell someone". Replace those with practical, human speech about immediate facts: "Does the diner still serve breakfast?", "Is this seat taken?", "Do people still use that noticeboard?", "Is the market usually this quiet?", or "I'm trying to learn the local rules before I trip over them."
- Favor observable details over symbolic atmosphere. Use actual clothing, environments, sounds, habits, tools, schedules, objects, and responsibilities. Avoid dramatic scents or symbolic imagery unless directly relevant.
- Every flaw must affect behavior. Character flaws should create visible habits, mistakes, avoidances, routines, relationship friction, or practical consequences.
- Occupations and expertise must affect daily reality. A character's work should shape their worldview, dialogue, routines, knowledge, environment, and interactions; long-term professionals should demonstrate competence.
- Competence validation for greetings: if the Kin's history, occupation, daily routine, or core idea implies practical expertise, do not make them helpless at a basic task from that domain. A person raised in an RV should not be flustered by routine RV trouble; if the user did not explicitly request vehicle trouble, do not invent an RV breakdown at all. If vehicle trouble is explicitly supplied, they may have already diagnosed the issue and need a part, safe parking, shop hours, local regulations, a second set of hands for a physical task, or information about who can legally/quickly help. A mechanic should not ask a random stranger to diagnose an ordinary engine problem. A nurse should not panic at basic first aid. A private investigator should not ask a stranger to interpret obvious evidence. Escalate through ordinary logistics, local constraints, access, competing responsibilities, or lack of information rather than ignorance or emergency.
- Occupations should naturally support recurring roleplay. Before selecting or inventing a job, evaluate whether it regularly brings new people into contact with the character, creates repeat encounters, exposes them to interesting situations, sustains long-term scenes, and generates practical conflicts. Strongly prefer high-interaction occupations such as maintenance technician, private investigator, locksmith, hotel concierge, mechanic, librarian, park ranger, building superintendent, harbor master, property manager, veterinarian, antique dealer, dog trainer, or ferry captain. Avoid low-interaction occupations such as urban planner, financial analyst, tax consultant, procurement manager, compliance officer, or data analyst unless explicitly requested; if requested, make the role public-facing or conflict-facing enough to create scenes. Always define the occupation's interaction engine: repairs, cases, research, vehicle trouble, sick animals, permits, locked doors, building issues, customers, visitors, local disputes, or recurring routes.
- Favor habits, routines, preferences, and recurring behaviors over archetypal labels. People are remembered for what they repeatedly do, not what category they fit into.
- Introduce friction through reality as well as emotion: obligations, schedules, responsibilities, competing goals, prior decisions, workplace pressure, money, logistics, reputation, or conflicting priorities.
- Recognition test: if occupation, genre, and setting were removed, the character should still be recognizable through habits, routines, experiences, behavioral traits, speech, and choices. If not, add more person-specific behavior before writing the final output.
- Reduce genre substitution. Do not add genre props, costumes, weather, weapons, jobs, slang, or scenery unless supported by the inputs or character logic. Expand supplied information before inventing genre decoration.
- User importance must be earned. The player may matter because of shared pressure, history, obligation, leverage, attraction, practical need, or repeated choices, but avoid making them instantly central or uniquely special without cause.
- Relationship preset is a high-priority behavioral constraint. It defines what the Kin reasonably knows, assumes, expresses, and withholds toward payload.userName. It controls existing familiarity, emotional openness, assumed trust, shared history, physical comfort, and conversational depth. It overrides Drama Heat, Chemistry, Tone Pack, and genre whenever those would create unrealistic instant intimacy.
- Romance should emerge through actions, shared experiences, competence, risk, humor, proximity, care, friction, desire, and choices. Avoid abstract attraction language as the main explanation.
- Track repeated motifs and concepts. Betrayal, distrust, justice, protection, attraction, cigarettes, scars, drinks, songs, weather, jobs, objects, and other recurring ideas count even when phrased differently. A major concept may appear in at most two sections: once where it is established and once where continuity genuinely requires it. Replace later occurrences with complementary information.
- Increase environmental specificity. Generate concrete places, organizations, neighborhoods, institutions, schedules, local routines, and daily realities. Use payload.currentCity, payload.currentState, payload.currentCountry, and payload.currentLocation as setting anchors when supplied. If location is Infer or blank, invent one coherent current location and use it consistently. Avoid relying on rain, neon, dangerous streets, corruption, smoke, or mood as substitutes for location facts.
- Priority hierarchy: behavior first, then routine, history, relationships, occupation, environment, story, genre, and aesthetic. Genre modifies the character; it never defines the character.

Source transformation rules:
- Treat every user field and interview answer as source material, not finished copy. Preserve facts and intent, but do not reuse the original wording unless it is a proper name, literal title, required placeholder, or text the user explicitly asked to quote.
- Convert abstract traits and themes into concrete events, choices, consequences, routines, relationships, locations, or observable behavior. "Haunted by betrayal" should become a specific past event and present consequence, not a paraphrase of betrayal.
- Never stitch prompt fragments into prose. Repair fragments, finish causal logic, and create natural transitions before writing a section.
- Prefer inference over repetition. If an input states the conclusion, invent a plausible concrete cause or manifestation that supports it without contradicting supplied facts.
- Before returning the output, compare distinctive phrases against payload fields. Rewrite any sentence that noticeably echoes the source wording.

Section ownership rules:
- Behavioral Tendencies owns recurring behavior and predicted actions.
- Daily Routine owns the ordinary schedule and repeated daily tasks.
- Contradictions owns incompatible values or actions.
- Decision-Making Style owns how choices are made.
- Distinctive Habits owns recognizable small repeated actions and tells.
- Local Knowledge owns actionable information outsiders would not know.
- Backstory owns past events and consequences.
- Conflict owns competing needs, obligations, obstacles, and stakes.
- Current owns what they are doing today, the immediate ordinary pressure if any, and their next intended action. It should not manufacture a crisis.
- Texture owns sensory and physical environment only.
- Likes and Dislikes own tangible personal preferences.
- Story Premise orients the player to the roleplay without summarizing every section.
- No section should take over another section's question merely to reinforce a theme.

Mandatory final redundancy pass:
1. Silently build a concept ledger listing the major fact, event, preference, relationship, prop, location, behavior, goal, and motif introduced in each drafted section.
2. Mark concepts appearing in more than two sections, including synonyms and thematic restatements.
3. Keep the strongest occurrence and at most one continuity reference. Replace later occurrences with unused concrete material: a different relationship, preference, responsibility, location, observation, skill, routine, complication, or practical detail.
4. Check that each section answers its assigned question and contributes information unavailable elsewhere.
5. Check for unfinished phrases, abrupt joins, prompt leakage, and wording copied from payload fields. Rewrite before returning.
Required identity facts such as name, age, gender, and payload.userName are exempt. Necessary physical facts may repeat across Avatar Description, Portrait Prompt, Physical Description, and Face Detail. Journal Keyphrases may repeat terms from their paired entry. Locked sections remain unchanged; revise unlocked sections around them.
Do this audit internally. Return only the required profile structure.

Person Before Plot construction order:
Build the character in this order before writing any final section. Do not start from genre. Genre is a final filter, not the skeleton.
1. Human foundation: decide core personality, MBTI/tritype logic, introversion/extroversion, emotional openness, optimism/pessimism, strengths, observable flaws, decision-making style, contradictions, repeated habits, and average daily life.
2. Personal history: create 3-5 concrete events, important relationships, specific regrets, and current actionable goals. Events first; emotions later. Good goals are practical: pay debt, open a restaurant, solve a case, pass exams, repair a friendship. Avoid vague goals like "find meaning" or "become whole".
3. Profession: define occupation, competence level, expertise, reputation, interaction engine, and how the job changes worldview, routines, dialogue, and decisions. Prefer work that naturally creates recurring encounters, practical problems, and reasons for the player to return.
4. Environment: define location, community, local knowledge, and daily friction. Preserve supplied current city/state/country exactly enough to be recognizable. If blank, invent a useful current location. Local knowledge is crucial; include things only someone who lives or works there would know.
5. Story engine: preserve the user's original conflict first. Define current routine, internal conflict as competing desires, and external friction as ordinary obstacles. Do not invent a major inciting incident to make the story start.
6. User relationship: define a plausible first point of contact such as client, neighbor, witness, coworker, new resident, informant, customer, rival, ex, or old friend. The user should matter through shared situation, history, pressure, or repeated choices rather than instant emotional centrality.
7. Romance layer: define romance approach, affection style, and what causes attraction, if romance applies.
8. Genre filter last: after the person is coherent, let genre/tone modify details. Do not let "noir", "fantasy", "cyberpunk", or "romance" manufacture a trope before the person exists.

Core idea is raw source material, not finished prose. Do not copy or lightly paraphrase coreIdea in any output section. Expand it into specific identity, situation, stakes, contradiction, and present-tense story logic. Preserve the user's intent, but use fresh wording, concrete details, and narrative causality.

Occupation, secondary/secret work, and education/schooling are source-of-truth identity anchors when supplied or inferable from coreIdea. Do not replace them with a more generic high-interaction occupation. Schooling is separate from job: a college student is not automatically a librarian, teacher, researcher, or academic worker. A babysitter, nanny, childcare worker, sex worker, escort, bartender, mechanic, student, or other supplied role must remain that role unless the user explicitly supplies a different primary occupation. Secondary or secret work remains secondary work and should be integrated as a parallel pressure, not substituted for the primary occupation.

Use payload.relationshipPreset as the player's starting relationship to the Kin. If it is Infer, infer a concrete point of contact from dynamic, genre, and conflict. Use it to shape Dynamic with the user, Example Message, Opening Greeting, early dialogue, and Player Relationship. Make the player relationship immediately playable: the user should know whether they are a stranger, acquaintance, old friend, ex, rival, client, customer, coworker, informant, new resident, co-conspirator, protector, adult mentor/student, workplace contact, neighbor, roommate, witness, suspect, handler, asset, old flame, romantic interest, established partner, or another specific role. Do not begin with the user already central to the Kin's life unless the supplied relationship makes that unavoidable.

Relationship preset behavioral rules:
- Strangers: the Kin and user have never met. Assume no trust, no shared history, no knowledge of the user's personality, no emotional familiarity, no physical comfort, and no assumption of compatibility. Opening Greeting and Example Message may use immediate surroundings, work, weather, small observations, practical needs, simple curiosity, or a transactional reason to speak. Avoid "you understand", "I can trust you", "I've been waiting for someone like you", "we can figure this out together", private confessions, pet names, and trauma disclosure. Keep the Kin polite, curious, reserved, professional, guarded, or cautiously friendly.
- Strangers means stranger to the Kin, not stranger to the town. Do not call the user "new here", "new in town", "newcomer", or imply they lack local knowledge unless the user explicitly supplied that fact.
- For Strangers, preserve physical boundaries. Do not place the user inside the Kin's private home, bedroom, RV, vehicle interior, apartment, private office, back room, or other personal space unless a supplied role gives permission or the scene establishes a public/professional reason. Prefer exterior, threshold, counter, lobby, mechanic's yard, parking lot, sidewalk, diner, shop front, campground office, tow office, service window, or another public/shared space.
- For Strangers, do not ask the user to solve specialized technical, medical, legal, investigative, mechanical, or intimate problems unless the scene first establishes the user as an appropriate worker or witness. Prefer stranger-appropriate asks: "Do you know if the shop is still open?", "Did you see who moved this?", "Is there a parts store nearby?", "Are you waiting for the mechanic too?", "Can you step back from the leak for a second?", or "Do you know who owns this lot?"
- Client/professional, Boss/employee, Neighbors, Roommates, Witness and suspect, Handler and asset, Stranger with leverage, Mentor/student adults only: use the specific role as the boundary. They may know role-relevant facts, routines, obligations, or recent events, but should not assume deep emotional intimacy unless the preset or supplied dynamic explicitly supports it.
- Acquaintance-like presets such as Rivals, Co-conspirators, Protector/protected, and recurring professional roles may reference prior practical contact, friction, reputation, or small shared incidents. Avoid deepest fears or life-defining trauma unless supplied.
- Friend-like presets such as Old friends may assume trust, jokes, personal frustration, meaningful questions, and shared history, but still avoid immediate life-defining confessions unless the scene naturally requires them.
- Romantic Interest: mutual attraction may exist. The Kin may flirt, tease, notice appearance, or show nervousness, but attraction does not equal established emotional intimacy, shared routines, or full trust.
- Established relationships such as Exes and Old flame may reference history, unresolved tension, private shorthand, and known habits. Exes and old flames have familiarity but not automatic current trust. If an established current relationship is explicitly supplied in dynamic, then shared routines and comfortable communication are allowed.

Before writing Opening Greeting and Example Message, run this validation internally: would someone in this relationship realistically say this during the first thirty seconds of this interaction? If not, rewrite. Use the coffee test: if two real people with this preset had just met or resumed contact over coffee, would the line sound believable? If not, reduce emotional intensity, reduce assumptions, and increase natural conversation. Conversation before character: the greeting exists to begin a believable interaction, not summarize the Kin's wound, arc, theme, core idea, attraction to the setting, hidden desire, or life philosophy.
Knowledge continuity rule: Opening Greeting must not mix incompatible familiarity states. If the Kin is already performing a role for the user, has just completed a task for them, is inside/at their home through work, references their children, client account, shared schedule, prior appointment, or role-specific obligation, then the user already knows who the Kin is. Do not use first-introduction lines such as "Hi, I'm [Name]" in that situation. Use a handoff, update, reminder, or role-appropriate opening instead. Only introduce the Kin by name when the scene is genuinely a first meeting and no role-specific prior contact is implied.

Use payload.tonePack as the prose texture across Tagline, Keywords, Story Premise, Behavioral Tendencies, Daily Routine, Contradictions, Decision-Making Style, Distinctive Habits, Local Knowledge, Backstory, Key Memories, Example Message, Opening Greeting, and Player Relationship. If Infer, choose a fitting tone from the concept. Tone Pack controls sentence texture, imagery density, pacing, humor, and genre feel; it does not replace concrete character facts. Options may include Cinematic, Noir, Cozy, Gothic, Romance novel, Anime/shonen, Slice of life, Psychological drama, Urban fantasy, Dry comedy, or High tension thriller.

Use payload.storyIntensity as the world-pressure setting across occupation selection, environmental hazards, frequency of conflict, story hooks, daily challenges, Current, Opening Greeting, and Player Relationship. If Infer, choose the appropriate intensity from the concept. Story Intensity modifies circumstances, not personality or premise: it must not override MBTI, Tritype, core values, relationship style, behavioral tendencies, habits, decision-making style, moral edge, or the user's original source of conflict.
Mild: prioritize realistic occupations and everyday life, such as gardener, apartment maintenance technician, librarian, bookstore owner, florist, mechanic, teacher, baker, or museum guide. Conflicts arise through work, relationships, community, customers, neighbors, money, schedules, and ordinary responsibility.
Moderate: choose occupations that regularly encounter unusual situations without becoming action-oriented, such as private investigator, park ranger, journalist, veterinarian, hotel manager, harbor master, wildlife rehabilitator, or emergency dispatcher. Conflict is occasional but meaningful.
High: prioritize occupations where danger, mystery, or conflict are expected parts of the profession, such as detective, federal agent, spy, treasure hunter, monster hunter, bounty hunter, military officer, smuggler, or professional thief. The environment may support frequent conflict and higher narrative stakes.
Design principle: a High intensity character should feel like the same person placed into a more dangerous world; a Mild intensity character should feel equally interesting because of who they are, not because less happens around them.

Use payload.appearance as the optional Kin Appearance module. Blank, AI, or Infer values mean the model may choose a fitting attribute. Random means choose a fresh plausible value for exploration. Any concrete value is locked and must be preserved exactly in Avatar Description, Portrait Prompt, Physical Description, and Face Detail where relevant. Locked appearance values override statistical defaults and aesthetic smoothing. Creative presentation fields such as clothing, pose, expression, lighting, and background may vary unless concrete values are supplied, but never contradict locked identity traits. Portrait Consistency controls strictness: Flexible allows more variation in hairstyle, clothing, expression, and lighting; Moderate balances variety with recognition; Strict should make prompts read like different photos of the same person. Facial Distinctiveness controls realism: higher values should add memorable believable features and avoid supermodel symmetry.

Use payload.world as optional worldbuilding continuity. Treat it mostly as setting context and Journal Manager material, not as a replacement for the Kin's personality, occupation, relationship, or original premise. World Type, Era, Rules, Creatures, Factions, People, Places, Conflicts, and Notes should shape Local Knowledge, Texture, Story Premise context, gallery prompts, and inferred World/People/Places journals. Do not force every world detail into Backstory. If payload.world has concrete facts, preserve them and create practical recall-worthy facts from them: laws, local rules, institutions, recurring places, named people, factions, dangers, taboos, travel limits, supernatural constraints, technology limits, or social customs. Keep the Kin grounded as a person living in that world rather than making them an encyclopedia of the setting.

Use payload.personalityModel as a layered personality architecture. Follow this hierarchy:
1. Behavior: Big Five/OCEAN is primary. Openness, Conscientiousness, Extraversion, Agreeableness, and Emotional Stability drive Behavioral Tendencies, Daily Routine, Decision-Making Style, Speech Patterns, conflict resolution, social behavior, and observable habits.
2. Motivation: Enneagram primary type and wing explain goals, fears, internal conflict, motivation, personal growth, and character arc. Do not let Enneagram override Big Five behavior.
3. Relationships: Attachment Style controls romance, trust development, emotional availability, intimacy pacing, relationship conflict, and repair behavior. Do not let attachment affect unrelated work habits.
4. Stress: Trauma Response controls how the character behaves under threat, shame, overwhelm, or emotional danger. Use it for conflict escalation, avoidance, repair attempts, vulnerable moments, and contradictions. It should not replace ordinary personality or become trauma exposition.
5. Ethics: Moral Alignment controls moral choices, ethical conflict, story hooks, and what lines the character will or will not cross. It is not personality.
6. Flavor: MBTI and Tritype are advanced/familiarity layers only. Use them to add nuance, not as primary drivers. If MBTI conflicts with Big Five, let Big Five behavior win and explain the type gently in Personality. If Big Five suggests a likely MBTI, use that as display flavor.
Before generation, check for strong contradictions such as very high Agreeableness with Enneagram 8 and Chaotic Evil. Do not forbid unusual combinations; make them coherent through tension, context, or intentional contradiction.

Respect payload.boundaries as hard exclusions and do-not-include guidance across every section and reroll. Do not include excluded themes, traits, kinks, scenarios, relationship dynamics, visual details, or content. If boundaries conflict with another input, preserve the boundary and satisfy the rest of the request around it.

If payload.lockedSections marks any section true, treat payload.existingSections for those sections as fixed continuity. Do not rewrite locked sections; generate the rest so they remain compatible with the locked material.

MBTI and Tritype are advanced flavor layers, not the main personality engine. If MBTI or Tritype are supplied, synchronize them with Big Five, Enneagram, attachment, and alignment where possible. If there is tension, preserve the more behaviorally specific Big Five and explain the label as style, coping strategy, or social mask rather than overriding behavior.

Use payload.chemistry, payload.moralEdge, and payload.dramaHeat as character-design temperature controls across Tagline, Keywords, Story Premise, Behavioral Tendencies, Daily Routine, Contradictions, Decision-Making Style, Distinctive Habits, Local Knowledge, Backstory, Personality, Conflict, Intimacy, Key Memories, Example Message, Opening Greeting, Player Relationship, and Player Profile. Do not default every romance to slow burn. Chemistry may be fast-burn, volatile, established, physically direct but emotionally guarded, tender domestic, competitive, or slow depending on the setting and user choice. Use payload.intimacyOrientation as the Kin's broad attraction/orientation preference when supplied. Use payload.partnerStyle as broad partner behavior guidance. Use payload.powerLeaning as a general consensual intimacy posture (Dom, Dom-leaning, Switch, Sub-leaning, Sub), influencing initiative, responsiveness, teasing, negotiation, and confidence without turning it into explicit instructions. Do not morally sanitize every character. Moral edge may produce flawed, messy, selfish, jealous, manipulative-when-scared, self-destructive, morally gray, or villainously charming characters when requested. Drama heat controls how much contradiction, bad coping, stakes, secrets, urgency, and emotional volatility appear. Keep characters coherent and adult; keep intimacy consensual and do not turn flaws into instructions to harm the user.

Output exactly this structure, with every listed Kin heading present, no markdown fences, and no extra explanation. Use compact labels. Do not use leading hyphens, bullets, or decorative list markers. If payload.player.createCompatiblePlayer is true, add Player Profile as a final section after Gallery Prompt - Casual.

Journal entry rules: Behavioral Tendencies, Daily Routine, Contradictions, Decision-Making Style, Distinctive Habits, and Local Knowledge are Kindroid journal entries. Write each entry in third person and keep it descriptive yet concise, like Backstory. Each journal entry must be under 450 characters. After each entry, generate its matching Keyphrases heading. Keyphrases are case-insensitive recall triggers, not descriptions: return 6-8 independent, natural, comma-separated single words likely to appear in the user's roleplay messages. Single words only. No multi-word phrases. Think like a search engine, not a writer. Before returning each trigger, ask: "Would a player plausibly type this exact word in dialogue or narration?" If no, replace it with a simpler word they would type. Prefer common nouns, verbs, places, objects, roles, and simple abstract triggers. Good examples: engine, repair, tools, trade, deal, supplies, roads, rumors, camp, home, trust, promise, risk, raiders, salvage, shortcuts, barter, journal, breathe. Avoid summarizing the journal, poetic labels, full sentences, hashtags, duplicate concepts, and heading-like phrases such as "trade negotiation", "information gathering", "prioritizes safety", "situational checks", "gear preparation", "route logging", "trading post", "first aid", "medical supplies", or "raider routes". Convert phrases to one useful word: "trading post" becomes "trade"; "first aid" becomes "aid"; "medical supplies" becomes "supplies"; "engine repairs" becomes "engine" or "repair".

Tagline
Under 160 characters. One punchy line that sells the Kin's story promise. Concrete, evocative, no heading inside the body.

Keywords
Under 220 characters. Comma-separated tags only, no sentences. Choose 6-12 concise keywords that fit the Kin and story. Useful common tags include companion, roleplay, aotw, fantasy, romance, adventure, rpg, scenario, platonic, anime, utility, sci-fi, cute, shy, comedy, slow burn, sarcastic, wholesome, villain, mature, horror. These are examples, not a closed list; add specific tags when useful.

Story Premise
Under 900 characters. Write 2-3 short paragraphs orienting the user to the roleplay: who the Kin is in daily life, the concrete environment, the user's original source of conflict, the player's plausible point of contact, and the kinds of choices or scenes likely to follow. Preserve the user's premise; do not add a new inciting incident to make the roleplay start. Do not summarize Behavioral Tendencies, Daily Routine, Contradictions, Decision-Making Style, Distinctive Habits, Local Knowledge, or Backstory. Refer to those only when one fact is essential to understand the premise. This is orientation, not in-character narration or trailer prose.

Behavioral Tendencies
Under 450 characters. Write in third person. Generate 3-5 specific recurring behaviors that affect decisions. Use observable actions only. Avoid emotional labels, diagnosis, archetype terms, and theme statements. Make these patterns predict future actions: how they verify information, handle promises, plan, delay, negotiate, react to danger, manage secrets, spend money, keep time, or take risks.

Behavioral Tendencies Keyphrases
6-8 comma-separated recall triggers only. Use common words and short phrases a player might type, with synonyms and independent retrieval paths.

Daily Routine
Under 450 characters. Write in third person. Generate 3-5 concrete details describing how the character typically spends an ordinary day. Focus on actions, habits, schedules, errands, work rhythms, meals, sleep, recurring stops, care tasks, or private rituals. Avoid emotional summaries and abstract reflection.

Daily Routine Keyphrases
6-8 comma-separated recall triggers only. Use common words and short phrases a player might type, with synonyms and independent retrieval paths.

Contradictions
Under 450 characters. Write in third person. Generate 1-3 meaningful contradictions that create believable tension and affect behavior. Examples: distrusts people but keeps helping them; craves stability but creates chaos; values privacy but knows everyone's business. Avoid contradictions based only on feelings.

Contradictions Keyphrases
6-8 comma-separated recall triggers only. Use common words and short phrases a player might type, with synonyms and independent retrieval paths.

Decision-Making Style
Under 450 characters. Write in third person. Describe how the character makes decisions. Use concrete patterns: gathers information before acting, moves immediately when people are in danger, prefers negotiation over confrontation, delegates responsibility, trusts evidence over intuition, or delays until pressure forces a choice.

Decision-Making Style Keyphrases
6-8 comma-separated recall triggers only. Use common words and short phrases a player might type, with synonyms and independent retrieval paths.

Distinctive Habits
Under 450 characters. Write in third person. Generate 3-5 specific habits users will notice in roleplay. Habits should influence interaction, not merely decorate. Include routines, tells, small rituals, repeated phrases, work habits, care habits, avoidances, or practical quirks that can recur naturally in scenes.

Distinctive Habits Keyphrases
6-8 comma-separated recall triggers only. Use common words and short phrases a player might type, with synonyms and independent retrieval paths.

Local Knowledge
Under 450 characters. Write in third person. Generate 3-5 actionable facts the character knows because of where they live or work. Be specific: places, organizations, neighborhoods, local institutions, streets, shops, schedules, shortcuts, staff gossip, local rules, building layouts, recurring maintenance problems, professional tricks, or small realities outsiders miss. Avoid generic worldbuilding, neon, rain, cigarette smoke, and mood descriptions.

Local Knowledge Keyphrases
6-8 comma-separated recall triggers only. Use common words and short phrases a player might type, with synonyms and independent retrieval paths.

*Backstory*
Total Backstory must be under 2300 characters after headings and line breaks. Personality Framework is required. If space is tight, shorten Texture, Likes, Dislikes, Aesthetic, Fast Facts, and Speech Patterns before cutting Personality Framework, Core Identity, Conflict, Dynamic, or Current.
Core Identity: Start with the actual chosen/supplied name and exact payload.age, then who they are. 2-4 sentences. <100-200 characters or less>. Rewrite and develop the core idea; do not quote it verbatim. Ground identity in role, routine, situation, responsibility, occupation, or daily life.
Occupation: Include only when payload.occupation, coreIdea, or completionBrief supplies/inferably requires a primary role. Preserve the role exactly enough to be recognizable <60-140 characters>.
Secondary Work: Include only when payload.secondaryOccupation, coreIdea, intimacy, or completionBrief supplies/inferably requires side work, hidden work, sex work, volunteer duty, family labor, or a second job <60-150 characters>.
Education: Include only when payload.education, coreIdea, or completionBrief supplies/inferably requires school, college, training, trade school, self-teaching, or degree background <60-150 characters>.
Archetype: One phrase <100 characters or less>. Interpret the concept into a grounded role, tension, habit, or story function; avoid stock archetype labels.
Personality: Synthesize Big Five behavior, Enneagram motivation, Attachment style, Alignment ethics, and MBTI/Tritype flavor. Behavior should outweigh labels. Explain the underlying disposition without repeating journal examples <200-300 characters or less>
Conflict: Preserve the user's original conflict. Describe current actionable goal, practical pressures, obligations, internal competing desires, ordinary external friction, and stakes. Do not invent a major inciting incident, physical trap, emergency, betrayal, disaster, or deadline unless supplied. Do not repeat the full wound, Current section, or Key Memories <300-400 characters or less>
Dynamic with the user: Initial connection, why the user matters through shared situation, and likely trust progression <200-300 characters or less>
Intimacy: Romance and kinks, if supplied. Reflect Chemistry and Moral Edge; do not default to slow burn unless selected or narratively best <200-300 characters or less>
Texture: Sensory and physical details about rooms, streets, workplace materials, clothing, food, sound, temperature, and touch. Do not repeat routines, habits, conflict, or local facts <200-300 characters>
Likes: 2-3 tangible personal preferences in one compact sentence. Use foods, drinks, music, sports, hobbies, objects, places, sensory comforts, or activities. No abstract themes, virtues, relationship needs, or bullets.
Dislikes: 2-3 tangible personal dislikes in one compact sentence. Use noises, lighting, foods, chores, spaces, weather, objects, habits, delays, or social situations. No abstract themes, moral judgments, or bullets.
Aesthetic: Clothing choices and style <100-150 characters>
Fast Facts: 2-3 grounding details not used elsewhere, such as an unrelated hobby, practical skill, minor relationship, possession, physical limitation, or reputation detail <100-150 characters>
Speech Patterns: <100-150 characters>
Personality Framework: Compact trait anchors near the end of Backstory <180-280 characters>. Use this format with only resolved values: Big Five O#/C#/E#/A#/S#; Enneagram #w# if resolved; Attachment if resolved; Trauma Response if supplied; Alignment if resolved; MBTI as flavor if resolved; Tritype if supplied. Never include the literal word Infer in this line. This reinforces personality settings without replacing narrative prose.
Current: 1-2 short sentences containing only what they are doing today, any minor immediate pressure, and their next intended action. Prefer working, traveling, unpacking, renovating, taking temporary work, visiting family, exploring a town, settling into a routine, or deciding whether to stay or leave. Avoid manufacturing crisis language such as "must solve this before sunset", "everything changes tonight", "one last chance", "time is running out", or physical inability to leave unless supplied. Do not recap history, conflict themes, or the player relationship.

*Response Directive*
Under 250 characters. Focus on formatting and tone, including Tone Pack when supplied. Keep it simple. Include: avoid "object + abstract emotion" constructions. Include a compact Avoid clause only if boundaries are supplied.

*Key Memories*
Write exactly five memory lines. Each line must use a specific custom title before the colon, not generic labels like "The wound", "The dream", "The complication", "For fun", "KinForge choice", or KM1. Each memory should be a concrete moment, decision, repeated habit, responsibility, or event from the character's life; avoid metaphorical titles and abstract emotional summaries. The five memories should still cover: source of conflict, reason they want what they want, why things are messier than they seem, a personality/detail hook, and one extra hook shaped by Chemistry, Moral Edge, or Drama Heat. Example label style: My invisibility: At twelve, she stopped raising her hand after her father praised someone else for her idea.

*Example Message*
Under 700 characters. Write this section BEFORE Opening Greeting and use it as the Kin's compact voice and behavior seed. It is more than formatting; it teaches tone, speech style, message length, escalation rules, relationship logic, and sample delivery.
Required format:
#Tone: concise tone phrase
#Speech: conversational/direct/etc.; include any no-euphemism/no-poetry/no-sermonizing style rule when relevant
#Length: preferred reply range, such as 1-3 paragraphs, 350-900 characters, medium sentences
#Rules: 3-5 compact behavior rules separated by semicolons
Then include one short in-character sample with *action* and quoted dialogue.
Rules must obey payload.relationshipPreset, Chemistry, Moral Edge, Drama Heat, Intimacy, and boundaries. For Strangers, rules must prevent trust claims, shared-history assumptions, pet names, private confessions, instant teamwork, and emotional overexposure. For established ties, rules may define familiarity, affection, teasing, conflict repair, escalation after consent, or what they prioritize before logistics. The Kindroid speaks and acts for themself, never for the user. Do not use this section to summarize backstory.

Opening Greeting
Write the actual first message under 850 characters, ideally 450-750. Generate it AFTER Example Message and make it obey the Example Message #Tone, #Speech, #Length, and #Rules. Do not pad to hit the range; stop when the scene hook is complete. Use 2-3 compact paragraphs. Use third-person action narration in *asterisks*. Use quoted dialogue for spoken words. Do not include inner thoughts unless spoken aloud. Start in-scene with grounded sensory detail, visible action, a low-escalation practical hook, and a relationship-appropriate reason for the player to respond. Let Drama Heat affect event tension, not instant intimacy or new emergencies. Let Chemistry affect distance, directness, restraint, or charge without violating the relationship preset. Let Tone Pack shape prose style without making dialogue literary or adding plot events. The Kindroid may act and speak for themself, but never speaks or acts for the player. Do not let the character describe the premise, core idea, theme, wound, trauma, life philosophy, relationship arc, or what the scene means to them. Avoid contradictions where a character says they are not ready to admit something while admitting it. Prefer concrete lines someone would actually say during an ordinary interaction. End with a clear concrete invitation, question, or decision point for the player. Before finalizing, check whether the Kin is acting competent in areas their profile says they know and whether the opening preserved the user's premise. For Strangers, the Kin should speak as if this is a first meeting: no trust claims, no shared-history language, no emotional confession, no "you understand", no assumption that they are now a team, and no request for specialized help unless the user is established as qualified. Strangers are strangers to the Kin, not automatically new to town; do not say or imply the user is new here unless supplied. Keep the location public, exterior, or at a threshold, not inside the Kin's private RV/home/room/vehicle. Ask for local information, witness information, distance/safety, a routine recommendation, or a simple practical favor instead. Do not introduce vehicle breakdowns, murders, emergencies, disasters, betrayals, or forced deadlines unless supplied.

Player Relationship
Under 350 characters. Write 1-2 sentences defining how the player knows the Kin and what reply angle the opening gives them. This is for the user, not in-character narration. Be concrete: old friend, rival, client, partner, stranger with leverage, ex, witness, recruit, protector, etc. Do not speak for the player.

Avatar Description (AD)
Age:
Gender:
Ethnicity/Race:
Skin: tone + texture details
Hair: length + style + color
Eyes: use "natural ___ eyes"
Face: shape, nose, lips, brows
Build: body type
Details: only visible existing details such as tattoos, scars, freckles, birthmarks, glasses, piercings, facial hair, prosthetics, missing limbs, or other notable physical traits; omit this line if there are no notable details
Vibe: one sentence

Avatar consistency rules
Treat Age, Gender, Hair Color, Eye Color, Skin Tone, specified Ethnicity/Race, Build, Body Type, Height, Facial Hair, Freckles, Scars, Birthmarks, Glasses, Tattoos, and Piercings as locked identity attributes where they are relevant. Preserve supplied locked attributes exactly and restate them clearly; do not average, generalize, beautify, or reinterpret them unless the value is Infer or blank. Hair color is locked; hairstyle and length are creative. Body type is locked when specified; do not convert soft, broad, heavy, sturdy, thin, or medium builds into slim, athletic, or hourglass unless supplied. Mention only visible attributes that exist or are supplied. Never spend space on absent ordinary traits such as "no tattoos", "no scars", "no piercings", "no jewelry", "no makeup", "no glasses", or "no facial hair". Important physical differences such as a missing hand, prosthetic, visible disability, or visible injury should be mentioned when present. If prompt length is tight, keep locked attributes first, then character-defining details, then creative presentation, then environment. Favor realistic distinctive facial features over supermodel symmetry: crooked nose, hooded eyes, soft jawline, fuller cheeks, strong chin, smile lines, uneven brows, under-eye circles, broad nose, gap in teeth, or similar believable traits. Before returning visual sections, verify locked attributes appear only in sections where they matter: height, body type, build, body shape, and muscle tone belong in Physical Description, not Portrait Prompt.

Portrait Prompt
Write the actual prompt text under 180 characters. Use visual-spec language only: adult age, gender, ethnicity/race if known, skin tone/texture, hair color/style, eye color, face shape, one visible notable facial mark if it exists, portrait framing. Mention only visible traits that exist. Do not mention absent traits such as "no scars", "no tattoos", "no piercings", "no jewelry", or "no makeup". Do not include height, body type, build, body shape, muscle tone, or full-body dimensions; this is for a facial portrait. If payload.appearance provides concrete creative presentation values, include pose, expression, lighting, or background only after locked face identity traits. No emotions, personality, mood, metaphor, story, aura, or vibe. Do not include the heading text inside the body. Do not use ellipses; if too long, remove lower-priority creative/environment details before locked face identity details.

Physical Description
Write the actual physical description as concrete visual facts. Describe the person's body only: apparent age, gender, ethnicity/race if known, height impression, body type, build, skin tone/texture, hair color/length/texture, eye color, face shape, nose, lips, brows, jaw, and visible notable traits if they exist. Do not mention absent traits such as no scars, no tattoos, no piercings, no jewelry, no makeup, or no glasses. No emotions, personality, mood, metaphor, story, aura, vibe, setting, or clothing. The output must not contain clothing, outfit, uniform, jewelry, makeup, accessory, or any garment words, even as negation.

Face Detail
Write the actual face detail under 180 characters. Face-only visual facts: face shape, eye color/shape, brows, nose, lips, jaw, cheekbones, skin texture, scars, freckles, birthmarks, glasses, or facial hair only if visible/present. Do not mention absent traits. No emotions, mood, metaphor, ellipses, or clothing.

Gallery Prompt - Dinner
Under 450 characters. Write a reusable image prompt for a dinner or meal scene that blends into the Kin's backstory, routine, occupation, local setting, and aesthetic. Include stable identity traits from Avatar/Physical Description, clothing appropriate to the scene, meal/table/environment details, and one story-relevant object. No extra people unless role/context requires them. No text, captions, UI, or watermark.

Gallery Prompt - Outdoor
Under 450 characters. Write a reusable outdoor scene prompt that fits the Kin's actual life: camping, hiking, swimming, beach, park, street errand, campus path, work route, or another believable outdoor setting. Include stable identity traits, practical clothing/swimwear/outdoor wear as appropriate, environment, lighting, and story-relevant activity. No text, captions, UI, or watermark.

Gallery Prompt - Intimate
Under 450 characters. Write a non-nude intimate image prompt for an adult Kin. Use dim or soft light, private room, tasteful lingerie, robe, sleepwear, fitted lounge clothes, or other non-nude attire. Sensual but not explicit. No nudity, exposed genitals, explicit sex act, or minors. Preserve identity traits and backstory context without adding another person unless explicitly supplied.

Gallery Prompt - Public
Under 450 characters. Write a public scene prompt in a believable place tied to work, routine, education, errands, or local knowledge: cafe, street, shop, campus, workplace, lobby, library, event, market, transit stop, or similar. Include stable identity traits, public-appropriate clothing, candid scene activity, environment, and lighting. No text, captions, UI, or watermark.

Gallery Prompt - Casual
Under 450 characters. Write a casual downtime prompt: sitting at home, couch, desk, kitchen table, porch, bed fully clothed, floor cushions, coffee, phone, music, chores, book, studying, or other backstory-fitting rest. Include stable identity traits, comfortable clothing, room details, one story-relevant object, and natural light. No text, captions, UI, or watermark.

Player Profile
Only include this section if payload.player.createCompatiblePlayer is true. Write a compact bio under 450 characters for the user/player character, using payload.player name, age, gender, ethnicity, and notes when supplied. Make the player compatible with the Kin's backstory, wound, dream, and dynamic. Do not overwrite the user's identity; build around supplied fields.

Avoid metaphors. Be friendly, short, direct, culturally savvy, and genre savvy. Do not speak for the user.`;

function logEvent(event, details = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    event,
    ...details,
  };
  try {
    fsSync.mkdirSync(LOG_DIR, { recursive: true });
    fsSync.appendFileSync(LOG_FILE, `${JSON.stringify(entry)}\n`, "utf8");
  } catch (error) {
    console.error("KinForge log write failed:", error.message || error);
  }
}

function errorLogDetails(error) {
  return {
    message: error?.message || String(error || "Unknown error"),
    status: error?.status || error?.details?.status || "",
    code: error?.details?.code || error?.code || "",
    type: error?.details?.type || "",
    reason: error?.details?.reason || error?.details?.outputReason || "",
    stack: error?.stack ? String(error.stack).split("\n").slice(0, 8).join("\n") : "",
  };
}

process.on("uncaughtException", (error) => {
  logEvent("server_uncaught_exception", errorLogDetails(error));
  console.error("Uncaught exception:", error);
});

process.on("unhandledRejection", (reason) => {
  logEvent("server_unhandled_rejection", errorLogDetails(reason));
  console.error("Unhandled rejection:", reason);
});

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendErrorJson(res, fallbackStatus, fallbackMessage, error) {
  logEvent("request_error", {
    fallbackMessage,
    ...errorLogDetails(error),
  });
  sendJson(res, error.status || fallbackStatus, {
    error: error.message || fallbackMessage,
    details: error.details || {
      message: error.message || fallbackMessage,
      status: error.status || fallbackStatus,
    },
  });
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function localSecretKey() {
  const username = (() => {
    try {
      return os.userInfo().username;
    } catch {
      return process.env.USERNAME || process.env.USER || "local-user";
    }
  })();
  const material = [
    "KinForge local API secret v1",
    os.hostname(),
    username,
    process.env.USERPROFILE || process.env.HOME || "",
  ].join("|");
  return crypto.createHash("sha256").update(material).digest();
}

function encryptLocalSecret(value, purpose = "localSecret") {
  const clean = String(value || "");
  if (!clean) {
    const error = new Error("No secret value supplied");
    error.status = 400;
    throw error;
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", localSecretKey(), iv);
  cipher.setAAD(Buffer.from(String(purpose || "localSecret"), "utf8"));
  const encrypted = Buffer.concat([cipher.update(clean, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    alg: "aes-256-gcm",
    purpose,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64"),
    createdAt: new Date().toISOString(),
  };
}

function decryptLocalSecret(blob, purpose = "localSecret") {
  if (!blob || blob.v !== 1 || blob.alg !== "aes-256-gcm") {
    const error = new Error("Unsupported local secret format");
    error.status = 400;
    throw error;
  }
  const expectedPurpose = String(purpose || "localSecret");
  if (String(blob.purpose || "") !== expectedPurpose) {
    const error = new Error("Local secret purpose mismatch");
    error.status = 400;
    throw error;
  }
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", localSecretKey(), Buffer.from(blob.iv, "base64"));
    decipher.setAAD(Buffer.from(expectedPurpose, "utf8"));
    decipher.setAuthTag(Buffer.from(blob.tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(blob.data, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    const error = new Error("Unable to unlock local secret on this Windows user/profile");
    error.status = 400;
    throw error;
  }
}

function sanitizeKindroidPayload(payload = {}) {
  const allowed = new Set([
    "ai_id",
    "ai_name",
    "ai_gender",
    "ai_backstory",
    "ai_memory",
    "ai_directive",
    "ai_example_message",
    "ai_additional_context",
    "current_scene",
    "user_name",
    "user_gender",
  ]);
  return Object.fromEntries(Object.entries(payload).filter(([key, value]) => allowed.has(key) && String(value ?? "").trim()));
}

function kindroidApiErrorMessage(data = {}, fallback = "Kindroid update failed") {
  if (typeof data?.error === "string" && data.error.trim()) return data.error.trim();
  if (typeof data?.message === "string" && data.message.trim()) return data.message.trim();
  if (Array.isArray(data?.errors) && data.errors.length) {
    const first = data.errors[0];
    if (typeof first === "string") return first;
    if (typeof first?.message === "string") return first.message;
  }
  if (typeof data?.raw === "string" && data.raw.trim()) return data.raw.trim().slice(0, 500);
  return fallback;
}

async function pushKindroidInfo({ apiKey, payload }) {
  const cleanKey = String(apiKey || "").trim();
  const cleanPayload = sanitizeKindroidPayload(payload || {});
  if (!cleanKey) {
    const error = new Error("Missing Kindroid API key");
    error.status = 400;
    throw error;
  }
  if (!/^kn_[A-Za-z0-9_\-]+/.test(cleanKey)) {
    const error = new Error("Kindroid API key format looks invalid");
    error.status = 400;
    throw error;
  }
  if (!cleanPayload.ai_id) {
    const error = new Error("Missing Kindroid ai_id");
    error.status = 400;
    throw error;
  }

  const startedAt = Date.now();
  const response = await fetch("https://api.kindroid.ai/v1/update-info", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cleanKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(cleanPayload),
  });
  const text = await response.text().catch(() => "");
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text.slice(0, 2000) };
  }
  const summary = {
    status: response.status,
    ok: response.ok,
    durationMs: Date.now() - startedAt,
    aiId: cleanPayload.ai_id,
    fields: Object.keys(cleanPayload).filter((key) => key !== "ai_id"),
  };
  logEvent("kindroid_update_info", {
    ...summary,
    error: response.ok ? "" : kindroidApiErrorMessage(data, "Kindroid update failed"),
  });
  if (!response.ok) {
    const error = new Error(kindroidApiErrorMessage(data, "Kindroid update failed"));
    error.status = response.status || 502;
    error.details = { ...summary, response: data };
    throw error;
  }
  return { ...summary, response: data };
}

async function sendKindroidChatBreak({ apiKey, payload }) {
  const cleanKey = String(apiKey || "").trim();
  const cleanPayload = {
    ai_id: String(payload?.ai_id || "").trim(),
    greeting: String(payload?.greeting || "").trim(),
    wipe_cascaded: Boolean(payload?.wipe_cascaded),
  };
  if (!cleanKey) {
    const error = new Error("Missing Kindroid API key");
    error.status = 400;
    throw error;
  }
  if (!/^kn_[A-Za-z0-9_\-]+/.test(cleanKey)) {
    const error = new Error("Kindroid API key format looks invalid");
    error.status = 400;
    throw error;
  }
  if (!cleanPayload.ai_id) {
    const error = new Error("Missing Kindroid ai_id");
    error.status = 400;
    throw error;
  }
  if (!cleanPayload.greeting) {
    const error = new Error("Chat break greeting is required");
    error.status = 400;
    throw error;
  }

  const startedAt = Date.now();
  const response = await fetch("https://api.kindroid.ai/v1/chat-break", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cleanKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(cleanPayload),
  });
  const text = await response.text().catch(() => "");
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text.slice(0, 2000) };
  }
  const summary = {
    status: response.status,
    ok: response.ok,
    durationMs: Date.now() - startedAt,
    aiId: cleanPayload.ai_id,
    greetingLength: cleanPayload.greeting.length,
    wipeCascaded: cleanPayload.wipe_cascaded,
  };
  logEvent("kindroid_chat_break", {
    ...summary,
    error: response.ok ? "" : kindroidApiErrorMessage(data, "Kindroid chat break failed"),
  });
  if (!response.ok) {
    const error = new Error(kindroidApiErrorMessage(data, "Kindroid chat break failed"));
    error.status = response.status || 502;
    error.details = { ...summary, response: data };
    throw error;
  }
  return { ...summary, response: data };
}

async function getKindroidChatMessages({ apiKey, aiId, groupId, limit = 50, startAfterTimestamp }) {
  const cleanKey = String(apiKey || "").trim();
  const cleanAiId = String(aiId || "").trim();
  const cleanGroupId = String(groupId || "").trim();
  const safeLimit = Math.max(1, Math.min(100, Number.parseInt(limit, 10) || 50));
  if (!cleanKey) {
    const error = new Error("Missing Kindroid API key");
    error.status = 400;
    throw error;
  }
  if (!/^kn_[A-Za-z0-9_\-]+/.test(cleanKey)) {
    const error = new Error("Kindroid API key format looks invalid");
    error.status = 400;
    throw error;
  }
  if ((cleanAiId && cleanGroupId) || (!cleanAiId && !cleanGroupId)) {
    const error = new Error("Provide exactly one Kindroid ai_id or group_id");
    error.status = 400;
    throw error;
  }

  const url = new URL("https://api.kindroid.ai/v1/get-chat-messages");
  if (cleanAiId) url.searchParams.set("ai_id", cleanAiId);
  if (cleanGroupId) url.searchParams.set("group_id", cleanGroupId);
  url.searchParams.set("limit", String(safeLimit));
  if (startAfterTimestamp !== undefined && startAfterTimestamp !== null && String(startAfterTimestamp).trim()) {
    url.searchParams.set("start_after_timestamp", String(startAfterTimestamp).trim());
  }

  const startedAt = Date.now();
  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${cleanKey}` },
  });
  const text = await response.text().catch(() => "");
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text.slice(0, 2000) };
  }
  const summary = {
    status: response.status,
    ok: response.ok,
    durationMs: Date.now() - startedAt,
    targetType: cleanAiId ? "ai" : "group",
    targetId: cleanAiId || cleanGroupId,
    limit: safeLimit,
    messageCount: Array.isArray(data.messages) ? data.messages.length : 0,
    hasMore: Boolean(data.pagination?.hasMore),
    lastTimestamp: data.pagination?.lastTimestamp || "",
  };
  logEvent("kindroid_get_chat_messages", {
    ...summary,
    error: response.ok ? "" : data?.error || data?.message || data?.raw || "",
  });
  if (!response.ok) {
    const error = new Error(data?.error || data?.message || "Kindroid chat history fetch failed");
    error.status = response.status || 502;
    error.details = { ...summary, response: data };
    throw error;
  }
  return {
    messages: Array.isArray(data.messages) ? data.messages : [],
    pagination: data.pagination || { hasMore: false, lastTimestamp: "", limit: safeLimit },
    summary,
  };
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(ROOT, requested));

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const data = await fs.readFile(filePath);
    res.writeHead(200, { "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

function getOutputText(data) {
  if (typeof data.output_text === "string") return data.output_text;
  const chunks = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) chunks.push(content.text);
      if (content.type === "text" && content.text) chunks.push(content.text);
    }
  }
  return chunks.join("\n").trim();
}

function getImageResult(data) {
  for (const item of data.output || []) {
    if (item.type === "image_generation_call" && item.result) {
      return {
        image: `data:image/png;base64,${item.result}`,
        revisedPrompt: item.revised_prompt || "",
      };
    }
  }
  return null;
}

function parseJsonObject(text, context = "JSON parse") {
  const clean = String(text || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(clean);
  } catch (error) {
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(clean.slice(start, end + 1));
      } catch (innerError) {
        logEvent("invalid_json_output", {
          context,
          message: innerError.message || error.message || "Invalid JSON",
          length: clean.length,
          previewStart: clean.slice(0, 900),
          previewEnd: clean.slice(-900),
        });
        const parseError = new Error(innerError.message || "OpenAI returned invalid JSON");
        parseError.details = {
          message: parseError.message,
          context,
          rawPreviewStart: clean.slice(0, 900),
          rawPreviewEnd: clean.slice(-900),
        };
        throw parseError;
      }
    }
    logEvent("invalid_json_output", {
      context,
      message: error.message || "Invalid JSON",
      length: clean.length,
      previewStart: clean.slice(0, 900),
      previewEnd: clean.slice(-900),
    });
    const parseError = new Error(error.message || "OpenAI returned invalid JSON");
    parseError.details = {
      message: parseError.message,
      context,
      rawPreviewStart: clean.slice(0, 900),
      rawPreviewEnd: clean.slice(-900),
    };
    throw parseError;
  }
}

async function repairJsonObject(text, context, model, shapeHint = "") {
  const broken = String(text || "").slice(0, 50000);
  const { response, data, model: usedModel } = await postOpenAiResponse({
    instructions: `Repair malformed JSON for ${context}.

Return only valid JSON. No markdown, commentary, or extra text.

Rules:
- Preserve complete objects and arrays from the source.
- If the source ends mid-string or mid-object, drop only the incomplete trailing item.
- Do not invent new content.
- Do not rewrite prose except as needed to escape quotes and produce valid JSON.
- Match this expected shape:
${shapeHint || "{ \"entries\": [], \"notes\": [] }"}`,
    input: `Malformed JSON to repair:\n${broken}`,
    max_output_tokens: 5200,
  }, model);

  if (!response.ok) {
    throwOpenAiError(data, `OpenAI JSON repair failed with ${response.status}`, response.status);
  }

  const repaired = getOutputText(data);
  if (!repaired) throwEmptyOpenAiError(data, "OpenAI returned empty JSON repair");
  const parsed = parseJsonObject(repaired, `${context} Repair`);
  parsed.__usedRepairModel = usedModel;
  return parsed;
}

function openAiErrorDetails(data, fallbackMessage, status) {
  const error = data?.error || {};
  const incomplete = data?.incomplete_details || {};
  const details = {
    message: error.message || incomplete.reason || fallbackMessage,
    status,
    type: error.type || data?.status || "",
    code: error.code || "",
    param: error.param || "",
    reason: incomplete.reason || data?.status_details?.reason || "",
  };
  Object.keys(details).forEach((key) => {
    if (details[key] === "" || details[key] === undefined || details[key] === null) delete details[key];
  });
  return details;
}

function throwOpenAiError(data, fallbackMessage, status) {
  const details = openAiErrorDetails(data, fallbackMessage, status);
  const error = new Error(details.message || fallbackMessage);
  error.status = status;
  error.details = details;
  throw error;
}

function throwEmptyOpenAiError(data, fallbackMessage) {
  const details = openAiErrorDetails(data, fallbackMessage, 502);
  details.outputStatus = data?.status || "";
  details.outputReason = data?.incomplete_details?.reason || "";
  details.outputTypes = Array.isArray(data?.output) ? data.output.map((item) => item.type).filter(Boolean) : [];
  Object.keys(details).forEach((key) => {
    if (details[key] === "" || (Array.isArray(details[key]) && !details[key].length)) delete details[key];
  });
  const error = new Error(details.message || fallbackMessage);
  error.status = 502;
  error.details = details;
  throw error;
}

function cleanModelId(model) {
  const value = String(model || "").trim();
  if (!value || /\s/.test(value) || !/^[a-zA-Z0-9._:-]+$/.test(value)) return "";
  return value.slice(0, 100);
}

function modelFromChoice(choice) {
  if (!choice || typeof choice !== "object") return cleanModelId(choice);
  const tier = String(choice.tier || "").trim();
  if (tier === "custom") return cleanModelId(choice.custom);
  return cleanModelId(choice.model || MODEL_ALIASES[tier] || "");
}

function modelSettingsFromPayload(payload) {
  return payload?.modelSettings
    || payload?.payload?.modelSettings
    || payload?.generatorPayload?.modelSettings
    || payload?.package?.settings?.aiModelSettings
    || payload?.settings?.aiModelSettings
    || {};
}

function resolveTextModel(payload, taskKey, fallbackModel = MODEL) {
  const settings = modelSettingsFromPayload(payload);
  const override = settings.override || {};
  if (settings.budgetApplied && override.model) return modelFromChoice(override) || fallbackModel;
  const choices = settings.choices || settings;
  const requested = modelFromChoice(choices?.[taskKey] || choices?.[settings.task] || settings?.[taskKey]);
  return requested || fallbackModel;
}

function resolveImageModel(payload) {
  return resolveTextModel(payload, "image", IMAGE_MODEL);
}

function shouldRetryWithFallbackModel(data, status) {
  const error = data?.error || {};
  const text = `${error.message || ""} ${error.code || ""} ${error.type || ""}`.toLowerCase();
  return [400, 403, 404].includes(status) && /\b(model|unsupported|access|permission|not found|does not exist)\b/.test(text);
}

async function postOpenAiResponse(requestBody, selectedModel, fallbackModel = MODEL) {
  const primaryModel = cleanModelId(selectedModel) || fallbackModel;
  const attempt = async (model) => {
    const startedAt = Date.now();
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...requestBody, model }),
    });
    const data = await response.json().catch(() => ({}));
    logEvent("openai_response", {
      model,
      status: response.status,
      ok: response.ok,
      durationMs: Date.now() - startedAt,
      errorCode: data?.error?.code || "",
      errorType: data?.error?.type || "",
      errorMessage: data?.error?.message || "",
    });
    return { response, data, model };
  };

  let result = await attempt(primaryModel);
  if (!result.response.ok && primaryModel !== fallbackModel && shouldRetryWithFallbackModel(result.data, result.response.status)) {
    const message = `OpenAI model ${primaryModel} failed; retrying with ${fallbackModel}`;
    logEvent("openai_model_fallback", {
      selectedModel: primaryModel,
      fallbackModel,
      status: result.response.status,
      errorCode: result.data?.error?.code || "",
      errorMessage: result.data?.error?.message || "",
    });
    console.warn(message);
    result = await attempt(fallbackModel);
  }
  return result;
}

async function generateKindroid(payload, model = resolveTextModel(payload, "fullGeneration")) {
  if (!OPENAI_API_KEY) {
    const error = new Error("Missing OPENAI_API_KEY");
    error.status = 503;
    throw error;
  }

  const { response, data, model: usedModel } = await postOpenAiResponse({
    instructions: KINFORGE_INSTRUCTIONS,
    input: `Generate one complete Kindroid from this JSON payload:\n${JSON.stringify(payload, null, 2)}`,
    max_output_tokens: 3200,
  }, model);
  payload.__usedModel = usedModel;
  if (!response.ok) {
    throwOpenAiError(data, `OpenAI request failed with ${response.status}`, response.status);
  }

  const output = getOutputText(data);
  if (!output) {
    throwEmptyOpenAiError(data, "OpenAI returned an empty response");
  }

  return output;
}

async function rerollSection(payload, model = resolveTextModel(payload, "reroll")) {
  if (!OPENAI_API_KEY) {
    const error = new Error("Missing OPENAI_API_KEY");
    error.status = 503;
    throw error;
  }

  const sectionLabel = String(payload.sectionLabel || "Section");
  const maxCharacters = Number(payload.maxCharacters || 900);
  const pairedKeyphrasesLabel = String(payload.pairedKeyphrasesLabel || "");
  const rerollFormat = pairedKeyphrasesLabel
    ? `This is a linked journal entry. Return exactly these two headings and their bodies:
${sectionLabel}
Third-person journal entry under ${maxCharacters} characters.

${pairedKeyphrasesLabel}
6-8 independent, comma-separated, case-insensitive recall triggers. Use common words or short phrases a player might naturally type. Include synonyms and a mix of concrete and abstract triggers. No summaries, sentences, bullets, hashtags, duplicate concepts, or poetic labels.`
    : "Return only the section body text. Do not include the section heading, markdown fences, commentary, or labels.";
  const { response, data, model: usedModel } = await postOpenAiResponse({
    instructions: `${KINFORGE_INSTRUCTIONS}

Reroll task: Rewrite only the requested section. ${rerollFormat} Preserve continuity with the existing profile and the user's original premise, but make this section meaningfully different from the current version. Treat the generator payload as raw source material and do not echo its wording. Do not add a new major inciting incident, emergency, physical trap, betrayal, disaster, crime, or forced deadline unless supplied. Compare the new section against every existing section: do not reuse a major concept already present twice, and prefer details not yet used anywhere in the profile. Make the requested section answer only its assigned question. Stay under the requested character limit.

For Avatar, Portrait Prompt, Physical Description, and Face Detail, use concrete physical description only and obey the no-clothing rules. For Gallery Prompt sections, preserve stable identity traits from Avatar/Physical Description and write scene image prompts with clothing, setting, activity, lighting, and story context; intimate gallery prompts must remain adult, non-nude, sensual but not explicit. For Example Message, use the #Tone/#Speech/#Length/#Rules/sample format and stay under 700 characters. For Opening Greeting, use existingSections.example as the voice contract when present; the greeting should sound like it follows the Example Message rules without repeating the sample. For Opening Greeting and Example Message, obey payload.relationshipPreset as a behavioral constraint. For Strangers, write as a first meeting with no trust claims, no shared-history language, no emotional confession, no "you understand", and no assumption that the user will help. Strangers are strangers to the Kin, not automatically new to town; do not call the user new here, new in town, or a newcomer unless supplied. Keep Stranger greetings in public/shared/threshold spaces, not inside the Kin's private RV, home, bedroom, apartment, vehicle interior, or back room. For Opening Greeting, stay under 850 characters, use clear *third-person action* and quoted dialogue; do not include inner thoughts or speak for the player. Start at the lowest believable conflict level: routine, minor inconvenience, practical question, or interesting interaction. Do not summarize the core idea, theme, hidden desire, trauma, life philosophy, or symbolic pull of the setting. Ban scripted self-analysis phrases such as "something about this place/town", "pulling me in", "not ready to admit", "maybe this is where I belong", or "I can finally tell someone"; replace with concrete ordinary circumstances and natural speech.`,
    input: `Reroll this section:
Section: ${sectionLabel}
Character limit: ${maxCharacters}

Current generator payload:
${JSON.stringify(payload.payload || {}, null, 2)}

Existing generated sections:
${JSON.stringify(payload.sections || {}, null, 2)}`,
    max_output_tokens: Math.min(2200, Math.max(500, Math.ceil(maxCharacters / 2) + 500)),
  });
  payload.__usedModel = usedModel;
  if (!response.ok) {
    throwOpenAiError(data, `OpenAI reroll request failed with ${response.status}`, response.status);
  }

  const output = getOutputText(data);
  if (!output) {
    throwEmptyOpenAiError(data, "OpenAI returned an empty reroll");
  }

  return output;
}

async function regenerateField(payload, model = resolveTextModel(payload, "field")) {
  if (!OPENAI_API_KEY) {
    const error = new Error("Missing OPENAI_API_KEY");
    error.status = 503;
    throw error;
  }

  const fieldId = String(payload.fieldId || "field");
  const fieldLabel = String(payload.fieldLabel || fieldId);

  const { response, data, model: usedModel } = await postOpenAiResponse({
    instructions: `${KINFORGE_INSTRUCTIONS}

Field regeneration task: Return only one replacement value for the requested editable generator field. Do not return JSON, markdown, labels, commentary, section headings, or multiple options.

Use the current generator payload and existing generated sections as context. Treat all other fields as fixed. Do not rewrite unrelated concepts. If payload.fieldLocks marks a field true, preserve it as immutable context. Keep the replacement concise enough to fit the original field. For select-style fields, return one valid option from the existing app choices when obvious; otherwise return Infer only if the field truly should remain inferred.

The form is the source of truth. Generate a value that helps the user continue editing the same character, not a new character.`,
    input: `Regenerate exactly this field:
Field id: ${fieldId}
Field label: ${fieldLabel}
Current value: ${String(payload.currentValue || "")}

Current generator payload:
${JSON.stringify(payload.payload || {}, null, 2)}

Existing generated sections:
${JSON.stringify(payload.sections || {}, null, 2)}`,
    max_output_tokens: 450,
  }, model);
  payload.__usedModel = usedModel;

  if (!response.ok) {
    throwOpenAiError(data, `OpenAI field request failed with ${response.status}`, response.status);
  }

  const output = getOutputText(data)
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^\s*[^:\n]{1,60}:\s*/, "")
    .trim();
  if (!output) {
    throwEmptyOpenAiError(data, "OpenAI returned an empty field value");
  }

  return output;
}

async function generateSceneVariants(payload, model = resolveTextModel(payload, "scene")) {
  if (!OPENAI_API_KEY) {
    const error = new Error("Missing OPENAI_API_KEY");
    error.status = 503;
    throw error;
  }

  const { response, data, model: usedModel } = await postOpenAiResponse({
    instructions: `${KINFORGE_INSTRUCTIONS}

Scene variant task: Return only valid JSON with three alternate Opening Greeting bodies. Do not include section headings, markdown fences, commentary, or labels inside the strings.

Each variant must stay under 850 characters, ideally 450-750, but stop when the hook is complete. Use payload.existingSections.example as the voice contract when present; variants should follow its #Tone, #Speech, #Length, and #Rules without copying its sample. Use *third-person action narration* and quoted dialogue. Do not include inner thoughts unless spoken aloud. Never speak or act for the player. Preserve continuity with the existing profile, preserve the user's original premise, and obey all boundaries. Do not add a new major inciting incident, emergency, physical trap, vehicle breakdown, betrayal, disaster, crime, or forced deadline unless supplied. Obey payload.relationshipPreset as a behavioral constraint. For Strangers, write as a first meeting with no trust, no shared history, no emotional confession, no "you understand", no "I was hoping you would come", and no assumption that the user will help; use practical observation, immediate surroundings, work, or simple curiosity. Strangers are strangers to the Kin, not automatically new to town; do not call the user new here, new in town, or a newcomer unless supplied. Keep Stranger variants in public/shared/threshold spaces, not inside the Kin's private RV, home, bedroom, apartment, vehicle interior, or back room. If the scene references completed work for the user, the user's children, shared schedule, client account, prior appointment, or a handoff at the user's home, do not introduce the Kin by name as if unknown. Avoid scripted self-analysis, core-idea summaries, symbolic place attraction, and lines like "something about this town is pulling me in" or "I'm not ready to admit it"; use immediate facts and natural speech instead.

JSON shape:
{
  "quiet": "quiet or intimate opening option",
  "conflict": "conflict-forward opening option",
  "mystery": "mystery or hook-forward opening option"
}`,
    input: `Generate three scene starter variants from this context:

Generator payload:
${JSON.stringify(payload.payload || {}, null, 2)}

Existing generated sections:
${JSON.stringify(payload.sections || {}, null, 2)}`,
    max_output_tokens: 3200,
  }, model);
  payload.__usedModel = usedModel;

  if (!response.ok) {
    throwOpenAiError(data, `OpenAI scene variants request failed with ${response.status}`, response.status);
  }

  const output = getOutputText(data);
  if (!output) throwEmptyOpenAiError(data, "OpenAI returned empty scene variants");
  return parseJsonObject(output, "Scene Variants");
}

async function rewriteGreeting(payload, model = resolveTextModel(payload, "greeting")) {
  if (!OPENAI_API_KEY) {
    const error = new Error("Missing OPENAI_API_KEY");
    error.status = 503;
    throw error;
  }

  const { response, data, model: usedModel } = await postOpenAiResponse({
    instructions: `${KINFORGE_INSTRUCTIONS}

Greeting Studio rewrite task: Return only valid JSON. Rewrite only the Opening Greeting. Do not include section headings, labels, markdown fences, commentary, or analysis.

Target style: obey payload.style. Studio brief: obey payload.brief unless it conflicts with relationship, continuity, boundaries, or character competence.

Suggestion review:
- payload.acceptedSuggestions are required repair goals. Address each accepted suggestion directly in the draft.
- payload.rejectedSuggestions are user-rejected advice. Do not force those changes unless they are necessary for hard safety, relationship, or character-limit constraints.
- payload.reviewedSuggestions with decision "pending" may inform the rewrite, but accepted suggestions take priority.

Rules:
- Under 850 characters, ideally 450-750, but do not pad.
- Use 2-3 compact paragraphs.
- Use *third-person visible action* and quoted spoken dialogue.
- No inner thoughts unless spoken aloud.
- Never speak or act for the player.
- Preserve the user's original premise and the current generated profile.
- Use payload.existingSections.example as the voice contract when present. Preserve its #Tone, #Speech, #Length, and #Rules unless the user explicitly asks to change them.
- Do not add a new major inciting incident, emergency, breakdown, betrayal, disaster, crime, forced deadline, or physical trap unless supplied.
- Do not summarize the core idea, theme, wound, trauma, life philosophy, relationship arc, or what the town/place means.
- Character voice should sound like a person in the first thirty seconds of the scene, not a narrator explaining the story.
- Keep the Kin competent in areas the profile says they know.
- Keep knowledge continuity coherent. If the greeting references role-specific prior contact such as finished babysitting, the user's children, a client schedule, prior work, a shared appointment, being at the user's home through work, or any task already performed for the user, do not use "Hi, I'm [Name]" or any first-introduction line. Open with a handoff, update, reminder, or practical question instead.
- End with a concrete invitation, ordinary question, decision point, or playable opening for the user.
- For Strangers: no trust claims, no shared-history language, no emotional confession, no "you understand", no assumption of teamwork, no pet names, and no specialized help request unless the user is established as qualified. Strangers are strangers to the Kin, not automatically new to town. Keep the location public, exterior, shared, or at a threshold.

JSON shape:
{
  "greeting": "rewritten opening greeting only"
}`,
    input: `Rewrite the current greeting using this context:
${JSON.stringify(payload, null, 2)}`,
    max_output_tokens: 1800,
  }, model);
  payload.__usedModel = usedModel;

  if (!response.ok) {
    throwOpenAiError(data, `OpenAI greeting rewrite failed with ${response.status}`, response.status);
  }

  const output = getOutputText(data);
  if (!output) throwEmptyOpenAiError(data, "OpenAI returned empty greeting rewrite");
  const parsed = parseJsonObject(output);
  return String(parsed.greeting || "").trim();
}

async function checkGreeting(payload, model = resolveTextModel(payload, "greeting")) {
  if (!OPENAI_API_KEY) {
    const error = new Error("Missing OPENAI_API_KEY");
    error.status = 503;
    throw error;
  }

  const { response, data, model: usedModel } = await postOpenAiResponse({
    instructions: `KinForge Greeting Studio reviews one Opening Greeting for playability, continuity, and relationship realism.

Return only valid JSON. No markdown, commentary, or extra text.

Do not rewrite the greeting. Identify concrete issues and concise repair guidance.

Check for:
- missing or weak Example Message voice seed when payload.existingSections.example lacks #Tone, #Speech, #Length, or #Rules
- Opening Greeting contradicting the Example Message #Tone, #Speech, #Length, or #Rules
- over 850 characters
- unclear action/dialogue separation
- the Kin speaking or acting for the player
- relationship preset violations, especially strangers receiving trust, history, emotional confession, pet names, instant teamwork, or specialized help requests
- private-space placement for strangers
- treating "stranger" as new to town rather than unknown to the Kin
- knowledge continuity errors, especially introducing the Kin by name when the scene implies the user already knows them through completed work, the user's children, shared scheduling, prior appointment, client account, or an in-progress professional relationship
- new major incidents not supported by the premise
- implausible incompetence for the Kin
- scripted self-analysis, premise summary, symbolic town/place attraction, or dialogue no real person would say
- username placeholder leaks
- lack of a concrete playable response point

Severity:
- high: breaks roleplay, violates hard relationship/identity constraints, or exceeds character limit
- medium: noticeable realism or continuity problem
- low: polish issue

Return at most 8 issues.

JSON shape:
{
  "summary": "one sentence summary",
  "issues": [
    {
      "severity": "high, medium, or low",
      "issue": "short issue title",
      "evidence": "specific text or fact",
      "suggestion": "specific repair guidance"
    }
  ]
}`,
    input: `Check this greeting and context:
${JSON.stringify(payload, null, 2)}`,
    max_output_tokens: 1800,
  }, model);
  payload.__usedModel = usedModel;

  if (!response.ok) {
    throwOpenAiError(data, `OpenAI greeting check failed with ${response.status}`, response.status);
  }

  const output = getOutputText(data);
  if (!output) throwEmptyOpenAiError(data, "OpenAI returned empty greeting check");
  return parseJsonObject(output, "Greeting Studio Check");
}

async function checkContinuity(payload, model = resolveTextModel(payload, "continuity")) {
  if (!OPENAI_API_KEY) {
    const error = new Error("Missing OPENAI_API_KEY");
    error.status = 503;
    throw error;
  }

  const { response, data, model: usedModel } = await postOpenAiResponse({
    instructions: `KinForge Continuity Inspector reviews a full KinForge package for contradictions and quality risks.

Return only valid JSON. No markdown, commentary, or extra text.

Do not rewrite the Kin. Do not invent new content. Report issues and suggested fixes only.

Check for:
- name, age, apparent age, gender, pronoun, orientation, and appearance mismatches
- relationship preset violations, especially stranger greetings assuming trust, history, or instant teamwork
- Example Message missing #Tone, #Speech, #Length, or #Rules, or Opening Greeting contradicting the Example Message voice contract
- opening greeting contradictions, implausible competence failures, private-space issues, forced emergencies, or premise replacement
- backstory/current/greeting conflicts
- repeated concepts across too many sections
- user name mistakes such as User, Username, or User Name when a real userName is supplied
- journal keyword issues, duplicates, multi-word keywords, collisions, or journals that do not match the profile
- avatar/portrait/physical description conflicts, including missing locked attributes
- sections exceeding stated character limits when obvious
- places where the Kin speaks or acts for the player

Severity:
- high: likely breaks roleplay, contradicts a hard user field, or violates a relationship/identity constraint
- medium: noticeable inconsistency, weak continuity, or fix-worthy quality issue
- low: polish suggestion or minor risk

Return at most 12 issues, ordered by severity and impact. Prefer concrete evidence and concise suggestions.

JSON shape:
{
  "summary": "one sentence summary",
  "issues": [
    {
      "severity": "high, medium, or low",
      "area": "Identity, Relationship, Greeting, Journals, Appearance, Backstory, Player, Formatting, etc.",
      "issue": "short issue title",
      "evidence": "specific text or fact that shows the problem",
      "suggestion": "specific repair guidance",
      "targetSection": "field or output section most likely to edit"
    }
  ],
  "notes": ["optional short notes"]
}`,
    input: `Inspect this KinForge package for continuity and consistency issues:\n${JSON.stringify(payload, null, 2)}`,
    max_output_tokens: 3200,
  }, model);
  payload.__usedModel = usedModel;

  if (!response.ok) {
    throwOpenAiError(data, `OpenAI continuity check failed with ${response.status}`, response.status);
  }

  const output = getOutputText(data);
  if (!output) throwEmptyOpenAiError(data, "OpenAI returned empty continuity report");
  return parseJsonObject(output, "Continuity Check");
}

async function inferJournals(payload, model = resolveTextModel(payload, "journals")) {
  if (!OPENAI_API_KEY) {
    const error = new Error("Missing OPENAI_API_KEY");
    error.status = 503;
    throw error;
  }

  const { response, data, model: usedModel } = await postOpenAiResponse({
    instructions: `KinForge Journal Intelligence creates Kindroid Journal Manager entries.

Return only valid JSON. No markdown, commentary, or extra text.

Journal rules:
- Journals are indexed recall records, not memories or stories.
- Return fewer, better entries. In profile or audit mode return at most 8 entries. In active mode return exactly 1 replacement entry unless no useful improvement exists.
- One topic per journal.
- One primary purpose per journal.
- Write concise third-person factual information.
- Body maximum: ${payload.config?.maxBodyCharacters || 500} characters.
- Keywords maximum: ${payload.config?.maxKeywords || 8}; use natural single words the user might type in casual roleplay.
- Keywords are retrieval triggers, not descriptions. Do not summarize the journal.
- Single words only. No multi-word phrases. If a concept is naturally a phrase, choose the strongest single word from it.
- Natural language pass: before returning each keyword, ask "Would a player plausibly type this exact word in dialogue or narration?" If no, replace it with a simpler word they would type.
- Convert phrases to one useful word: "trading post" becomes "trade"; "engine repairs" becomes "engine" or "repair"; "medical supplies" becomes "supplies"; "first aid" becomes "aid"; "raider routes" becomes "raiders" or "routes".
- Prefer searchable nouns, objects, verbs, roles, and common conversational words: engine, repair, tools, trade, deal, supplies, salvage, roads, routes, camp, rumors, raiders, trust, promise, help, strangers, home, fight, wait, breathe.
- Avoid section-heading or report-language phrases like mechanical fixes, trade negotiation, information gathering, prioritizes safety, situational checks, gear preparation, route logging, guarded talk, salvage value, travel windows, careful choices, conflict avoidance, or cautious approach.
- Avoid academic/descriptive phrases ending in words like negotiation, gathering, preparation, logging, setup, fixes, preferences, tendencies, awareness, approach, familiarity, assessment, patterns, style, routines, behavior, situation, or process.
- Avoid duplicate keywords, overlapping keywords, and word-inside-word collisions.
- Avoid unnecessary prose, emotional narration, timeline storytelling, and duplicated information.
- Categories are internal only. Use existing categories when possible; create useful category names only when needed.
- If payload.world contains concrete worldbuilding facts, create or improve concise World, People, or Places entries from those facts when they would improve roleplay continuity. Do not turn world details into personality traits. Prefer practical recall facts the Kin would plausibly know or encounter.

Mode behavior:
- profile mode: analyze the generated Kin profile, existing sections, current journals, and local warnings. Return useful new journals and improved replacements for weak current journals.
- active mode: optimize only the selected journal using its warnings and profile context. Preserve the user's intent, title, and category unless clearly wrong.
- audit mode: scan every existing journal as a system. Return only high-value suggested replacements and missing entries. Fix overly specific keywords, weak recall triggers, duplicate or colliding keywords, oversized or unfocused bodies, redundant journals, and uncovered important profile facts. Use replaceTitle for any replacement. Do not rewrite clean entries just to change style. Do not create duplicate coverage. Prefer fewer, better drafts over many minor edits.

Audit behavior:
- Treat payload.audit.warningsByTitle and payload.audit.duplicateKeywords as direct repair targets.
- When repairing keywords, preserve the journal's meaning but make triggers shorter, more natural, and more likely to appear in conversation.
- If two journals collide on a keyword, either choose a more specific natural trigger for one journal or remove the weaker duplicate.
- Add new journals only when an important fact is not covered by current journals and would improve roleplay continuity.
- Replacement entries should keep the original title unless the title itself is misleading.

JSON shape:
{
  "entries": [
    {
      "title": "internal KindForge title",
      "category": "People, Places, Objects, Events, Relationships, World, Behavior, Temporary, or custom",
      "keywords": ["1-8 natural recall triggers, single words only"],
      "body": "third-person factual journal body under the configured character limit",
      "replaceTitle": "optional existing title this should replace"
    }
  ],
  "notes": ["optional brief implementation notes"]
}`,
    input: `Infer or optimize Journal Manager entries from this payload:\n${JSON.stringify(payload, null, 2)}`,
    max_output_tokens: 5200,
  }, model);
  payload.__usedModel = usedModel;

  if (!response.ok) {
    throwOpenAiError(data, `OpenAI journal inference request failed with ${response.status}`, response.status);
  }

  const output = getOutputText(data);
  if (!output) throwEmptyOpenAiError(data, "OpenAI returned empty journal inference");
  try {
    return parseJsonObject(output, "Journal Inference");
  } catch (error) {
    logEvent("journal_json_repair_attempt", {
      message: error.message || "Invalid journal JSON",
      model: usedModel,
    });
    const repaired = await repairJsonObject(output, "Journal Inference", usedModel, `{
  "entries": [
    {
      "title": "string",
      "category": "string",
      "keywords": ["single", "words"],
      "body": "string",
      "replaceTitle": "optional string"
    }
  ],
  "notes": ["optional string"]
}`);
    payload.__usedModel = repaired.__usedRepairModel || usedModel;
    delete repaired.__usedRepairModel;
    return repaired;
  }
}

async function analyzeKindroidChat(payload, model = resolveTextModel(payload, "journals")) {
  if (!OPENAI_API_KEY) {
    const error = new Error("Missing OPENAI_API_KEY");
    error.status = 503;
    throw error;
  }

  const { response, data, model: usedModel } = await postOpenAiResponse({
    instructions: `KinForge Chat Intelligence analyzes fetched Kindroid chat for useful Journal Manager drafts and continuity notes.

Return only valid JSON. No markdown, commentary, or extra text.

Use actual chat evidence. Do not invent facts that are not supported by the chat or current KinForge profile.

Journal draft rules:
- Create drafts only for facts that are useful for future roleplay recall.
- One topic per journal.
- Body maximum: ${payload.config?.maxBodyCharacters || 500} characters.
- Write third-person factual journal bodies.
- Keywords maximum: ${payload.config?.maxKeywords || 8}.
- Keywords are retrieval triggers, not descriptions.
- Single words only. No multi-word phrases.
- Prefer common words a player might type in dialogue/narration.
- Include replaceTitle if the draft should update an existing journal.
- Avoid duplicates and weak trivial facts.

Continuity note rules:
- Report only issues grounded in chat/profile mismatch, relationship changes, broken assumptions, new recurring facts, or stale journals.
- Include brief evidence from chat, but do not quote long passages.
- Severity: high, medium, or low.
- Keep issues actionable.

JSON shape:
{
  "summary": "one sentence summary",
  "entries": [
    {
      "title": "journal title",
      "category": "People, Places, Objects, Events, Relationships, World, Behavior, Temporary, or custom",
      "keywords": ["single", "word", "triggers"],
      "body": "third-person factual journal body",
      "replaceTitle": "optional existing title to replace",
      "reason": "short explanation of why this draft exists"
    }
  ],
  "issues": [
    {
      "severity": "high, medium, or low",
      "area": "Chat, Relationship, Journals, Backstory, Memory, Scene, etc.",
      "issue": "short issue title",
      "evidence": "specific chat/profile evidence",
      "suggestion": "specific repair guidance",
      "targetSection": "Journal Manager, Backstory, Key Memories, Player Relationship, etc."
    }
  ],
  "notes": ["optional short notes"]
}`,
    input: `Analyze this fetched Kindroid chat against the current KinForge profile and journals:
${JSON.stringify(payload, null, 2)}`,
    max_output_tokens: 3200,
  }, model);
  payload.__usedModel = usedModel;

  if (!response.ok) {
    throwOpenAiError(data, `OpenAI chat analysis failed with ${response.status}`, response.status);
  }

  const output = getOutputText(data);
  if (!output) throwEmptyOpenAiError(data, "OpenAI returned empty chat analysis");
  return parseJsonObject(output, "Kindroid Chat Analysis");
}

async function generateNames(payload, model = resolveTextModel(payload, "names")) {
  if (!OPENAI_API_KEY) {
    const error = new Error("Missing OPENAI_API_KEY");
    error.status = 503;
    throw error;
  }

  const { response, data, model: usedModel } = await postOpenAiResponse({
    instructions: `KinForge Name Intelligence generates believable names for adult fictional characters.

Return only valid JSON. No markdown, commentary, or extra text.

Core rule: simulate realistic naming decisions by parents or family, not fantasy-author name picking unless Name Genre asks for stylized genre naming. Use estimated birth year, current year, country, heritage, region, family style, name length, rarity, name feel, name genre, occupation bias, species, gender, chronological age, apparent age, world context, and character concept as constraints.

Avoid overused AI-fiction names unless the user specifically asks for them. Down-rank names such as Mara, Valen, Kael, Elara, Rowan, Sylvie, Lucian, Lucien, Nadia, Seraphina, Lyra, Cassian, Evander, Orion, and similar AI-trope names when the commonness filter asks for uncommon or trope-avoidant results.

Rules:
- Generate 20 distinct full names.
- Names should feel like real people, not genre labels.
- Use estimatedBirthYear as the naming-era anchor when supplied. If it is missing but chronological age and currentYear are supplied, infer birth year as currentYear - age.
- Apparent age should not change naming-era logic. A 300-year-old vampire who appears 29 should be named from the era/culture implied by true age unless the user context says they adopted a modern name.
- Preserve supplied gender as a naming constraint when culturally relevant.
- Preserve supplied species as a naming constraint when culturally or world-relevant. A cat girl, goliath, elf, vampire, android, alien, or hybrid may need naming conventions that reflect ancestry, adopted culture, manufactured identity, clan names, or cover names.
- Name Genre controls naming style only. Real world and Modern should stay grounded. Fantasy, High fantasy, Urban fantasy, Sci-fi, Cyberpunk, Post-apocalyptic, Horror, Historical, and Anime may increase stylization, but names must still feel usable by a person in that world.
- Rare means believable but less expected, not invented fantasy syllables.
- Last names should fit country, region, and heritage without becoming caricatures.
- If heritage is mixed, vary whether the first name, surname, or explanation reflects that mix.
- Popularity may be approximate and should be phrased honestly, such as "common in the 1990s", "moderately uncommon", or "traditional but not trendy".
- Include natural nicknames when useful.
- Occupation bias should be subtle. Do not make names deterministic by job.
- Do not repeat first names, last names, or explanations across options.

JSON shape:
{
  "options": [
    {
      "firstName": "string",
      "lastName": "string",
      "fullName": "string",
      "pronunciation": "short pronunciation note",
      "origin": "short origin or cultural fit",
      "popularity": "short popularity/era note",
      "meaning": "optional short meaning or empty string",
      "nicknames": ["0-4 natural nicknames"],
      "explanation": "1-3 concise sentences explaining why this name fits the supplied context and avoids or embraces familiar naming patterns"
    }
  ],
  "notes": ["optional brief notes"]
}`,
    input: `Generate grounded name options from this payload:\n${JSON.stringify(payload, null, 2)}`,
    max_output_tokens: 4200,
  }, model);
  payload.__usedModel = usedModel;

  if (!response.ok) {
    throwOpenAiError(data, `OpenAI name generation request failed with ${response.status}`, response.status);
  }

  const output = getOutputText(data);
  if (!output) throwEmptyOpenAiError(data, "OpenAI returned empty name generation");
  return parseJsonObject(output, "Name Generation");
}

async function generateSurprise(payload, model = resolveTextModel(payload, "surprise")) {
  if (!OPENAI_API_KEY) {
    const error = new Error("Missing OPENAI_API_KEY");
    error.status = 503;
    throw error;
  }

  const { response, data, model: usedModel } = await postOpenAiResponse({
    instructions: `Create fresh adult Kindroid generator inputs for KinForge. Return only valid JSON. No markdown. No explanation.

Rules:
- Create a new concept every time.
- Keep every string value concise. Do not pad. Return compact JSON that can parse directly.
- Adult characters only, age 25 or older.
- Preserve userName from the payload. Use that exact value in generated fields that mention the user; if it is "{username}", keep "{username}".
- Fill every field with specific, evocative, editable details.
- Choose creationType intentionally. Most results should be Single Character, but sometimes generate World / NPC Ensemble for setting-driven concepts or Multi-Character Kin for two-to-three-person group concepts.
- For World / NPC Ensemble, leave kindroidName as a setting/title name, set worldNarrationNotes with narrator/NPC/journal handling guidance, and use ensembleMembers for 3-6 example recurring NPC seeds only if useful.
- For Multi-Character Kin, generate ensembleMembers with two or three adult members only. Give each a name, role, voice, relationship to the user, and one distinguishing behavior. Keep kindroidName as the group/shared Kin title.
- Generate a coherent currentCity, currentState, and currentCountry. Use a fictional city when useful, but pair it with a plausible region/country unless the genre calls for a fictional world.
- Generate coherent worldbuilding fields when useful. For ordinary real-world characters, keep World Type as Real world and use sparse practical details. For fantasy, sci-fi, horror, post-apocalyptic, historical, or custom settings, define the era, rules, creatures/species, factions, people, places, and conflicts enough to support Journal Manager entries.
- Choose species intentionally. Human is fine, but fantasy, sci-fi, horror, anime, and custom worlds may use cat girl, goliath, vampire, android, fae, alien, hybrid, or other adult fictional species when coherent.
- Build person before plot: decide daily life, primary occupation, secondary/secret work if any, education/schooling if relevant, competence, behavioral tendencies, distinctive habits, flaws, concrete history, current practical goal, location/community, local knowledge, and daily friction before choosing genre/tone.
- Choose occupations for recurring roleplay before choosing atmosphere. Prefer jobs where strangers and regulars naturally return: maintenance technician, private investigator, locksmith, hotel concierge, mechanic, librarian, park ranger, building superintendent, harbor master, property manager, veterinarian, antique dealer, dog trainer, ferry captain, or similar high-interaction work. Avoid low-interaction desk professions unless the concept explicitly needs one; if used, make it public-facing or conflict-facing.
- Define the occupation's interaction engine in the raw inputs: repairs, cases, research, vehicle trouble, sick animals, permits, locks, building problems, customers, visitors, neighborhood disputes, or recurring routes.
- Keep occupation, secondaryOccupation, and education separate. Do not turn schooling into a job; a student can have a separate job.
- Choose storyIntensity as Infer, Mild, Moderate, or High. Mild uses everyday jobs and ordinary conflicts; Moderate uses unusual-but-not-action occupations and occasional meaningful conflict; High uses danger, mystery, or conflict as a normal part of the profession. Story intensity changes circumstances, not personality.
- Optionally generate appearance fields consistent with the character. Use blank or AI for fields that should remain model-generated, Random for exploratory variety, and concrete values only when they create a useful stable visual identity. Do not make every face conventionally attractive; include one or two believable distinctive features when useful.
- Generate behavior before atmosphere. Include specific recurring behaviors, daily routine, contradictions, decision-making style, practical habits, local knowledge, daily responsibilities, and practical friction in the raw inputs so the final profile has material beyond genre.
- Genre must modify the character, not define them. Avoid trope-first concepts like "noir detective" unless daily life, expertise, environment, and practical pressure are specific. Do not add genre cliché props, clothing, weather, or jobs unless the person logic supports them.
- Make the user important through a concrete shared situation, history, pressure, or useful role rather than instant specialness.
- Create a plausible point of contact for the user such as client, neighbor, witness, coworker, new resident, informant, customer, rival, ex, or old friend. Do not assume deep emotional significance before the relationship develops.
- Avoid repeating one motif across many fields. If a prop, vice, weather detail, habit, object, or scar appears once, use other fields to add different information.
- Give separate raw fields distinct informational jobs. Do not repeat the same wound, goal, trait, relationship, or atmospheric motif in multiple fields using synonyms.
- Transform abstract ideas into specific events, routines, obligations, preferences, locations, or consequences. Write complete editable source notes, not dramatic fragments or finished profile prose.
- Include several tangible preferences such as foods, music, hobbies, sports, objects, chores, lighting, noise, or familiar places so Likes and Dislikes can describe daily life rather than themes.
- Include environmental specifics: actual places, local institutions, organizations, neighborhoods, schedules, maintenance problems, vendors, staff, rules, or routes. Avoid mood-only settings.
- Choose a concrete relationshipPreset. Do not leave it vague.
- Choose a tonePack and storyIntensity that fit the concept. Boundaries may be empty unless a useful exclusion would sharpen the concept.
- Keep intimacy adult, consensual, and optional.
- Keep personality under 360 characters. Use it only for nuance the structured personality fields do not capture: contradictions, pressure points, humor, fear behind behavior, or a specific flaw.
- Choose traumaResponse from the character's history, emotional pressure, and coping style. It should describe stress behavior, not their whole personality.
- Vary chemistry, moralEdge, and dramaHeat. Do not default to slow burn or morally tidy characters. Some concepts should be fast-burn, volatile, physically direct, morally gray, messy, jealous, self-destructive, or villainously charming when coherent.
- Choose MBTI and Tritype from the concept's wound, dream, conflict, and relational dynamic. Do not choose them randomly.

JSON shape:
{
  "creationType": "one of Single Character, World / NPC Ensemble, Multi-Character Kin",
  "ensembleMembers": "for Multi-Character Kin: two or three adult member notes; for World / NPC Ensemble: optional recurring NPC seeds; otherwise empty string",
  "worldNarrationNotes": "for World / NPC Ensemble: narrator, NPC handling, player role, and journal advice; otherwise optional or empty string",
  "kindroidName": "string",
  "gender": "string",
  "species": "human, cat girl, goliath, vampire, android, fae, alien, hybrid, or other adult fictional species",
  "age": "number as string",
  "currentCity": "current city, town, district, settlement, or fictional location",
  "currentState": "state, province, region, island, district, or empty string when not applicable",
  "currentCountry": "country, world region, or fictional nation",
  "coreIdea": "string",
  "occupation": "primary job, public role, or main daily work",
  "secondaryOccupation": "side job, secret work, hidden income, volunteer duty, family obligation, or empty string",
  "education": "schooling, training, degree program, apprenticeship, self-taught background, or empty string",
  "genre": "string",
  "tonePack": "one of Infer, Cinematic, Noir, Cozy, Gothic, Romance novel, Anime/shonen, Slice of life, Psychological drama, Urban fantasy, Dry comedy, High tension thriller",
  "storyIntensity": "one of Infer, Mild, Moderate, High",
  "nameGenre": "one of Infer, Real world, Modern, Historical, Fantasy, High fantasy, Urban fantasy, Sci-fi, Cyberpunk, Post-apocalyptic, Horror, Anime",
  "worldType": "one of Infer, Real world, Historical real world, Alternate history, Low fantasy, High fantasy, Urban fantasy, Science fiction, Post-apocalyptic, Horror, Custom",
  "worldEra": "time period, technology level, calendar era, or empty string",
  "worldRules": "setting rules, laws, magic/technology limits, social constraints, or empty string",
  "worldCreatures": "creatures, species, monsters, spirits, androids, ordinary humans only, or empty string",
  "worldFactions": "factions, institutions, guilds, agencies, crews, houses, councils, or empty string",
  "worldPeople": "people of note and roles, or empty string",
  "worldPlaces": "places of note, districts, shops, roads, buildings, ruins, or empty string",
  "worldConflicts": "ongoing world conflicts, local tensions, shortages, laws, hazards, or empty string",
  "worldNotes": "extra setting continuity that should mainly become journals, or empty string",
  "boundaries": "string, optional do-not-include guidance or empty string",
  "personality": "string",
  "dynamic": "string",
  "relationshipPreset": "one of Infer, Strangers, Old friends, Exes, Rivals, Client/professional, Co-conspirators, Protector/protected, Mentor/student, adults only, Boss/employee, Neighbors, Roommates, Stranger with leverage, Witness and suspect, Handler and asset, Old flame",
  "intimacy": "string",
  "intimacyOrientation": "one of Infer, Straight, Gay, Lesbian, Bisexual, Pansexual, Asexual, Demisexual, Queer, Flexible, Questioning",
  "partnerStyle": "short broad partner behavior notes or empty string",
  "powerLeaning": "one of Dom, Dom-leaning, Switch, Sub-leaning, Sub",
  "chemistry": "one of Infer, Slow burn, Fast burn, Volatile push-pull, Established intimacy, Physically direct, emotionally guarded, Tender domestic, Competitive charge",
  "moralEdge": "one of Balanced, Grounded but flawed, Messy, Morally gray, Self-destructive, Manipulative when scared, Possessive or jealous, Villainous charm",
  "dramaHeat": "one of Low, Medium, High, Volatile but coherent",
  "personalityModel": {
    "bigFive": {
      "openness": "1-5",
      "conscientiousness": "1-5",
      "extraversion": "1-5",
      "agreeableness": "1-5",
      "emotionalStability": "1-5"
    },
    "enneagramType": "1-9 or Infer",
    "enneagramWing": "w1-w9 or Infer",
    "attachmentStyle": "one of Infer, Secure, Anxious, Avoidant, Fearful-Avoidant",
    "traumaResponse": "one of Infer, Fight, Flight, Freeze, Fawn, Mask / Perform, Control / Overfunction, Shutdown / Withdraw",
    "moralAlignment": "one of Infer, Lawful Good, Neutral Good, Chaotic Good, Lawful Neutral, True Neutral, Chaotic Neutral, Lawful Evil, Neutral Evil, Chaotic Evil",
    "mbti": "likely MBTI or Infer",
    "tritype": "likely tritype or Infer"
  },
  "mbti": "one of INTJ, INTP, ENTJ, ENTP, INFJ, INFP, ENFJ, ENFP, ISTJ, ISFJ, ESTJ, ESFJ, ISTP, ISFP, ESTP, ESFP or empty string",
  "tritype": "any valid three-digit tritype using one heart, one head, and one gut type, such as 358, 459, 146, 279, or empty string",
  "appearance": {
    "portraitConsistency": "one of Flexible, Moderate, Strict or empty string",
    "facialDistinctiveness": "one of Average, Distinctive, Highly distinctive or empty string",
    "appearanceEthnicity": "string or empty string",
    "skinTone": "string or empty string",
    "hairColor": "one preset color, Random, or empty string",
    "hairColorCustom": "string or empty string",
    "hairstyle": "string or empty string",
    "hairLength": "string or empty string",
    "hairTexture": "string or empty string",
    "eyeColor": "one preset color, Random, or empty string",
    "eyeShape": "string or empty string",
    "faceShape": "string or empty string",
    "noseShape": "string or empty string",
    "lipShape": "string or empty string",
    "browShape": "string or empty string",
    "jawline": "string or empty string",
    "distinctiveFeatures": "comma-separated features or empty string",
    "heightScale": "string or empty string",
    "bodyShape": "string or empty string",
    "bodyBuild": "string or empty string",
    "muscleTone": "string or empty string",
    "appearanceClothing": "string or empty string",
    "appearanceExpression": "string or empty string",
    "appearancePose": "string or empty string",
    "appearanceLighting": "string or empty string",
    "appearanceNotes": "string or empty string"
  },
  "interviewAnswers": {
    "why": "string",
    "wound": "string",
    "dream": "string",
    "complication": "string",
    "texture": "string",
    "voice": "string"
  }
}`,
    input: `Generate fresh surprise inputs from this current context:\n${JSON.stringify(payload, null, 2)}`,
    max_output_tokens: 3600,
  }, model);
  payload.__usedModel = usedModel;

  if (!response.ok) {
    throwOpenAiError(data, `OpenAI surprise request failed with ${response.status}`, response.status);
  }

  const output = getOutputText(data);
  if (!output) throwEmptyOpenAiError(data, "OpenAI returned an empty surprise response");
  return parseJsonObject(output, "Surprise Generation");
}

function normalizeInterviewQuestionsResponse(parsed) {
  const themes = new Set(["why", "wound", "dream", "complication", "texture", "voice", "relationship", "occupation", "world", "intimacy", "personality", "appearance", "boundaries"]);
  const used = new Set();
  const questions = (Array.isArray(parsed?.questions) ? parsed.questions : [])
    .map((item, index) => {
      const text = String(item?.text || item?.question || "").replace(/\s+/g, " ").trim().slice(0, 280);
      if (!text) return null;
      const rawTheme = String(item?.theme || item?.category || "why").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
      const theme = themes.has(rawTheme) ? rawTheme : "why";
      const rawKey = String(item?.key || `ai_${theme}_${index + 1}`).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) || `ai_${theme}_${index + 1}`;
      let key = rawKey;
      let suffix = 2;
      while (used.has(key)) {
        key = `${rawKey}_${suffix}`;
        suffix += 1;
      }
      used.add(key);
      return {
        key,
        theme,
        text,
        kind: item?.kind === "followup" ? "followup" : "core",
        followUpOf: String(item?.followUpOf || item?.follow_up_of || "").trim(),
        source: "ai",
      };
    })
    .filter(Boolean)
    .slice(0, 20);
  return {
    questions,
    notes: Array.isArray(parsed?.notes) ? parsed.notes.map((note) => String(note || "").trim()).filter(Boolean).slice(0, 6) : [],
  };
}

async function generateInterview(payload, model = resolveTextModel(payload, "import")) {
  if (!OPENAI_API_KEY) {
    const error = new Error("Missing OPENAI_API_KEY");
    error.status = 503;
    throw error;
  }

  const generatorPayload = payload.payload || {};
  const existingQuestions = Array.isArray(payload.existingQuestions) ? payload.existingQuestions : [];
  const coreIdea = String(generatorPayload.coreIdea || payload.coreIdea || "").slice(0, 1200);
  const { response, data, model: usedModel } = await postOpenAiResponse({
    instructions: `KinForge Interview Builder creates tailored interview questions for adult Kindroid character generation.

Return only valid JSON. No markdown. No commentary.

Purpose:
- Start from the user's Core Idea and current KinForge settings.
- Generate questions that help flesh out the Kin organically before final generation.
- Use the provided static questions only as guidance for the kinds of answers KinForge needs.

Question rules:
- Generate 7 or 8 core questions.
- Generate up to 20 total questions.
- Each core question may have up to 3 follow-up questions, but only add follow-ups when they clarify important nuance.
- Prefer open-ended questions that can be answered in fragments.
- Avoid yes/no questions unless the follow-up immediately asks why.
- Ask for the why behind the what. If a character is a perfectionist, ask whether it comes from ambition, fear, shame, duty, love, control, or something else.
- Do not ask the user to repeat fields already supplied unless the question asks for motive, consequence, contradiction, or texture.
- Do not create finished profile prose. Ask useful creative questions.
- Every question must map to one theme: why, wound, dream, complication, texture, voice, relationship, occupation, world, intimacy, personality, appearance, or boundaries.
- Include practical questions when useful: occupation interaction engine, how the user meets the Kin, daily friction, sensory anchors, relationship limits, speech style, current hook.
- For World / NPC Ensemble or Multi-Character Kin, adapt labels naturally and ask about narrator/world/ensemble dynamics instead of only one person's psychology.
- Adult characters only. Do not ask for minors or sexualized minor-coded content.

JSON shape:
{
  "questions": [
    {
      "key": "short_stable_snake_case_id",
      "theme": "why",
      "text": "question text",
      "kind": "core",
      "followUpOf": ""
    }
  ],
  "notes": ["optional brief note about what the interview is trying to clarify"]
}`,
    input: `Build a tailored KinForge interview.

Core Idea:
${coreIdea || "(blank)"}

Current KinForge payload:
${JSON.stringify(generatorPayload, null, 2)}

Static guide questions:
${JSON.stringify(existingQuestions, null, 2)}

Existing answers:
${JSON.stringify(payload.currentAnswers || {}, null, 2)}

Targets:
- coreQuestionTarget: ${payload.coreQuestionTarget || 8}
- maxQuestions: ${payload.maxQuestions || 20}
- maxFollowUpsPerCore: ${payload.maxFollowUpsPerCore || 3}`,
    max_output_tokens: 2600,
  }, model);
  payload.__usedModel = usedModel;

  if (!response.ok) {
    throwOpenAiError(data, `OpenAI interview generation request failed with ${response.status}`, response.status);
  }

  const output = getOutputText(data);
  if (!output) throwEmptyOpenAiError(data, "OpenAI returned empty interview generation");
  return normalizeInterviewQuestionsResponse(parseJsonObject(output, "Interview Generation"));
}

async function importKinText(payload, model = resolveTextModel(payload, "import")) {
  if (!OPENAI_API_KEY) {
    const error = new Error("Missing OPENAI_API_KEY");
    error.status = 503;
    throw error;
  }

  const importText = String(payload.importText || "").slice(0, 60000);
  const creationTypeHint = String(payload.creationTypeHint || "").trim();
  const { response, data, model: usedModel } = await postOpenAiResponse({
    instructions: `KinForge Import Intelligence converts existing Kindroid text into editable KinForge generator settings.

Return only valid JSON. No markdown, commentary, or extra text.

Task:
- Read the imported Kin text, which may contain Backstory, Response Directive, Key Memories, Example Message, Opening Greeting, Avatar Description, journals, image prompts, or loose notes.
- Infer KinForge input fields from the text.
- If Import Creation Type Hint is Single Character, World / NPC Ensemble, or Multi-Character Kin, set creationType to that exact value and interpret the import through that mode. Treat the hint as user intent, not a weak suggestion.
- Preserve explicit facts. Infer likely settings only when strongly supported.
- Do not generate a new Kin. Do not improve or rewrite the character. Extract and translate.
- If the imported Kin does not contain a fact, use an empty string rather than inventing.
- Use concise editable source notes, not polished output prose.
- Keep species distinct from gender. Species may be Human, cat girl, goliath, vampire, android, fae, alien, hybrid, etc.
- If the imported Kin is clearly a world/narrator/GM profile, set creationType to World / NPC Ensemble and map NPC/scene/journal instructions into worldNarrationNotes. If it clearly portrays two or three people, set creationType to Multi-Character Kin and map member facts into ensembleMembers. Otherwise use Single Character or empty.
- Map voice/dialogue instructions into personality, dynamic, intimacy, chemistry, boundaries, and interviewAnswers.voice when useful.
- Map setting details into currentCity/currentState/currentCountry and world fields.
- Map physical details into appearance fields where possible.
- Map Example Message #Tone/#Speech/#Length/#Rules into personality, dynamic, intimacy, boundaries, and interviewAnswers.voice as appropriate.
- If MBTI, tritype, Enneagram, attachment, trauma response, or alignment are explicit, preserve them. If only implied, infer conservatively.
- For select fields, return values matching available options when obvious. Otherwise return an empty string or compact text.

Allowed flat field IDs:
creationType, ensembleMembers, worldNarrationNotes, kindroidName, gender, species, age, apparentAge, currentCity, currentState, currentCountry, coreIdea, occupation, secondaryOccupation, education, genre, nameGenre, tonePack, storyIntensity, worldType, worldEra, worldRules, worldCreatures, worldFactions, worldPeople, worldPlaces, worldConflicts, worldNotes, boundaries, personality, dynamic, relationshipPreset, intimacy, intimacyOrientation, partnerStyle, powerLeaning, chemistry, moralEdge, dramaHeat, bigFiveOpenness, bigFiveConscientiousness, bigFiveExtraversion, bigFiveAgreeableness, bigFiveEmotionalStability, enneagramType, enneagramWing, attachmentStyle, traumaResponse, moralAlignment, mbti, tritype, nameBirthCountry, nameHeritage, nameRegion, nameFamilyStyle, nameFeel, nameOccupationBias, portraitConsistency, facialDistinctiveness, appearanceEthnicity, skinTone, hairColor, hairColorCustom, hairstyle, hairLength, hairTexture, eyeColor, eyeShape, faceShape, noseShape, lipShape, browShape, jawline, distinctiveFeatures, heightScale, bodyShape, bodyBuild, muscleTone, appearanceClothing, appearanceExpression, appearancePose, appearanceLighting, appearanceNotes, playerName, playerAge, playerGender, playerEthnicity, playerNotes.

Valid select hints:
creationType: Single Character, World / NPC Ensemble, Multi-Character Kin.
tonePack: Infer, Cinematic, Noir, Cozy, Gothic, Romance novel, Anime/shonen, Slice of life, Psychological drama, Urban fantasy, Dry comedy, High tension thriller.
storyIntensity: Infer, Mild, Moderate, High.
worldType: Infer, Real world, Historical real world, Alternate history, Low fantasy, High fantasy, Urban fantasy, Science fiction, Post-apocalyptic, Horror, Custom.
nameGenre: Infer, Real world, Modern, Historical, Fantasy, High fantasy, Urban fantasy, Sci-fi, Cyberpunk, Post-apocalyptic, Horror, Anime.
relationshipPreset: Infer, Strangers, Old friends, Exes, Rivals, Client/professional, Co-conspirators, Protector/protected, Mentor/student, adults only, Boss/employee, Neighbors, Roommates, Stranger with leverage, Witness and suspect, Handler and asset, Old flame.
chemistry: Infer, Slow burn, Fast burn, Volatile push-pull, Established intimacy, Physically direct, emotionally guarded, Tender domestic, Competitive charge.
moralEdge: Balanced, Grounded but flawed, Messy, Morally gray, Self-destructive, Manipulative when scared, Possessive or jealous, Villainous charm.
dramaHeat: Low, Medium, High, Volatile but coherent.
powerLeaning: Dom, Dom-leaning, Switch, Sub-leaning, Sub.
bigFive fields: 1-5.

JSON shape:
{
  "fields": {
    "kindroidName": "string",
    "coreIdea": "compact editable concept inferred from the imported text",
    "anyAllowedFieldId": "string"
  },
  "interviewAnswers": {
    "why": "optional inferred why",
    "wound": "optional inferred wound",
    "dream": "optional inferred dream",
    "complication": "optional inferred complication",
    "texture": "optional inferred texture",
    "voice": "optional inferred voice and reply-length guidance"
  },
  "notes": ["brief extraction notes or uncertainties"]
}`,
    input: `Import Creation Type Hint: ${creationTypeHint || "Infer from text"}

Infer KinForge settings from this imported Kin text:

${importText}`,
    max_output_tokens: 5200,
  }, model);
  payload.__usedModel = usedModel;

  if (!response.ok) {
    throwOpenAiError(data, `OpenAI Kin text import request failed with ${response.status}`, response.status);
  }

  const output = getOutputText(data);
  if (!output) throwEmptyOpenAiError(data, "OpenAI returned empty Kin text import");
  return parseJsonObject(output, "Kin Text Import");
}

async function generateImage(payload, model = resolveImageModel(payload)) {
  if (!OPENAI_API_KEY) {
    const error = new Error("Missing OPENAI_API_KEY");
    error.status = 503;
    throw error;
  }

  const manualPrompt = String(payload.imagePrompt || payload.prompt || "").trim();
  const source = String(payload.profile || "").slice(0, 7000);
  const fieldData = payload.payload || {};
  const imagePrompt = manualPrompt || `Create a square avatar portrait for this finalized Kindroid.

Use the Avatar Description, aesthetic, texture, and vibe from the profile. Prioritize a clear adult face, visible clothing/style, and readable personality. Do not include text, captions, UI, watermarks, extra people, or the user.

Kindroid name: ${fieldData.kindroidName || "Infer"}
Gender: ${fieldData.gender || "Infer"}
Chronological age: ${fieldData.age || "Adult"}
Apparent age: ${fieldData.apparentAge || fieldData.age || "Adult"}

Finalized profile:
${source}`;

  const { response, data, model: usedModel } = await postOpenAiResponse({
    input: imagePrompt,
    tools: [
      {
        type: "image_generation",
        size: "1024x1024",
        quality: "medium",
      },
    ],
  }, model, IMAGE_MODEL);
  payload.__usedModel = usedModel;

  if (!response.ok) {
    throwOpenAiError(data, `OpenAI image request failed with ${response.status}`, response.status);
  }

  const image = getImageResult(data);
  if (!image) {
    throwEmptyOpenAiError(data, "OpenAI returned no image");
  }

  return image;
}

const server = http.createServer(async (req, res) => {
  const requestStart = Date.now();
  const requestId = `${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
  logEvent("request_start", {
    requestId,
    method: req.method,
    url: req.url,
    host: req.headers.host || "",
    origin: req.headers.origin || "",
    userAgent: req.headers["user-agent"] || "",
  });
  res.on("finish", () => {
    logEvent("request_finish", {
      requestId,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      durationMs: Date.now() - requestStart,
    });
  });

  if (req.method === "POST" && req.url === "/api/generate-kindroid") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      const model = resolveTextModel(payload, "fullGeneration");
      const output = await generateKindroid(payload, model);
      sendJson(res, 200, { output, model: payload.__usedModel || model });
    } catch (error) {
      console.error("OpenAI generation failed:", error.message || error);
      sendErrorJson(res, 500, "Generation failed", error);
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/reroll-section") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      const model = resolveTextModel(payload, "reroll");
      const section = await rerollSection(payload, model);
      sendJson(res, 200, { section, model: payload.__usedModel || model });
    } catch (error) {
      console.error("OpenAI section reroll failed:", error.message || error);
      sendErrorJson(res, 500, "Section reroll failed", error);
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/import-kin-text") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      const model = resolveTextModel(payload, "import");
      const importData = await importKinText(payload, model);
      sendJson(res, 200, { import: importData, model: payload.__usedModel || model });
    } catch (error) {
      console.error("OpenAI Kin text import failed:", error.message || error);
      sendErrorJson(res, 500, "Kin text import failed", error);
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/generate-interview") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      const model = resolveTextModel(payload, "import");
      const interview = await generateInterview(payload, model);
      sendJson(res, 200, { interview, model: payload.__usedModel || model });
    } catch (error) {
      console.error("OpenAI interview generation failed:", error.message || error);
      sendErrorJson(res, 500, "Interview generation failed", error);
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/regenerate-field") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      const model = resolveTextModel(payload, "field");
      const value = await regenerateField(payload, model);
      sendJson(res, 200, { value, model: payload.__usedModel || model });
    } catch (error) {
      console.error("OpenAI field regeneration failed:", error.message || error);
      sendErrorJson(res, 500, "Field regeneration failed", error);
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/scene-variants") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      const model = resolveTextModel(payload, "scene");
      const variants = await generateSceneVariants(payload, model);
      sendJson(res, 200, { variants, model: payload.__usedModel || model });
    } catch (error) {
      console.error("OpenAI scene variants failed:", error.message || error);
      sendErrorJson(res, 500, "Scene variants failed", error);
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/greeting-studio/rewrite") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      const model = resolveTextModel(payload, "greeting");
      const greeting = await rewriteGreeting(payload, model);
      sendJson(res, 200, { greeting, model: payload.__usedModel || model });
    } catch (error) {
      console.error("OpenAI greeting rewrite failed:", error.message || error);
      sendErrorJson(res, 500, "Greeting rewrite failed", error);
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/greeting-studio/check") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      const model = resolveTextModel(payload, "greeting");
      const report = await checkGreeting(payload, model);
      sendJson(res, 200, { report, model: payload.__usedModel || model });
    } catch (error) {
      console.error("OpenAI greeting check failed:", error.message || error);
      sendErrorJson(res, 500, "Greeting check failed", error);
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/check-continuity") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      const model = resolveTextModel(payload, "continuity");
      const report = await checkContinuity(payload, model);
      sendJson(res, 200, { report, model: payload.__usedModel || model });
    } catch (error) {
      console.error("OpenAI continuity check failed:", error.message || error);
      sendErrorJson(res, 500, "Continuity check failed", error);
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/infer-journals") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      const model = resolveTextModel(payload, "journals");
      const journals = await inferJournals(payload, model);
      sendJson(res, 200, { journals, model: payload.__usedModel || model });
    } catch (error) {
      console.error("OpenAI journal inference failed:", error.message || error);
      sendErrorJson(res, 500, "Journal inference failed", error);
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/generate-names") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      const model = resolveTextModel(payload, "names");
      const names = await generateNames(payload, model);
      sendJson(res, 200, { names, model: payload.__usedModel || model });
    } catch (error) {
      console.error("OpenAI name generation failed:", error.message || error);
      sendErrorJson(res, 500, "Name generation failed", error);
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/generate-image") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      const model = resolveImageModel(payload);
      const image = await generateImage(payload, model);
      sendJson(res, 200, { ...image, model: payload.__usedModel || model });
    } catch (error) {
      console.error("OpenAI image generation failed:", error.message || error);
      sendErrorJson(res, 500, "Image generation failed", error);
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/local-secret/encrypt") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      const blob = encryptLocalSecret(payload.value, payload.purpose || "localSecret");
      sendJson(res, 200, { ok: true, blob });
    } catch (error) {
      console.error("Local secret encryption failed:", error.message || error);
      sendErrorJson(res, error.status || 500, "Local secret encryption failed", error);
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/local-secret/decrypt") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      const value = decryptLocalSecret(payload.blob, payload.purpose || "localSecret");
      sendJson(res, 200, { ok: true, value });
    } catch (error) {
      console.error("Local secret unlock failed:", error.message || error);
      sendErrorJson(res, error.status || 500, "Local secret unlock failed", error);
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/kindroid/update-info") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      const result = await pushKindroidInfo(payload);
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      console.error("Kindroid update failed:", error.message || error);
      sendErrorJson(res, error.status || 502, "Kindroid update failed", error);
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/kindroid/chat-break") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      const result = await sendKindroidChatBreak(payload);
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      console.error("Kindroid chat break failed:", error.message || error);
      sendErrorJson(res, error.status || 502, "Kindroid chat break failed", error);
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/kindroid/get-chat-messages") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      const result = await getKindroidChatMessages(payload);
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      console.error("Kindroid chat history fetch failed:", error.message || error);
      sendErrorJson(res, error.status || 502, "Kindroid chat history fetch failed", error);
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/kindroid/analyze-chat") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      const model = resolveTextModel(payload, "journals");
      const analysis = await analyzeKindroidChat(payload, model);
      sendJson(res, 200, { analysis, model: payload.__usedModel || model });
    } catch (error) {
      console.error("Kindroid chat analysis failed:", error.message || error);
      sendErrorJson(res, 500, "Kindroid chat analysis failed", error);
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/surprise") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      const model = resolveTextModel(payload, "surprise");
      const surprise = await generateSurprise(payload, model);
      sendJson(res, 200, { surprise, model: payload.__usedModel || model });
    } catch (error) {
      console.error("OpenAI surprise generation failed:", error.message || error);
      sendErrorJson(res, 500, "Surprise generation failed", error);
    }
    return;
  }

  if (req.method === "GET" && req.url === "/api/diagnostics") {
    let logTail = [];
    try {
      const raw = await fs.readFile(LOG_FILE, "utf8");
      logTail = raw.trim().split(/\r?\n/).slice(-80);
    } catch {
      logTail = [];
    }
    sendJson(res, 200, {
      ok: true,
      port: PORT,
      defaultModel: MODEL,
      imageModel: IMAGE_MODEL,
      hasOpenAiKey: Boolean(OPENAI_API_KEY),
      logFile: LOG_FILE,
      logTail,
    });
    return;
  }

  if (req.method === "GET") {
    await serveStatic(req, res);
    return;
  }

  res.writeHead(405);
  res.end("Method not allowed");
});

server.on("error", (error) => {
  logEvent("server_listen_error", errorLogDetails(error));
  console.error("KinForge server error:", error.message || error);
});

server.listen(PORT, () => {
  logEvent("server_start", {
    port: PORT,
    defaultModel: MODEL,
    imageModel: IMAGE_MODEL,
    hasOpenAiKey: Boolean(OPENAI_API_KEY),
    nodeVersion: process.version,
    logFile: LOG_FILE,
  });
  console.log(`KinForge Kindroid Generator running at http://localhost:${PORT}/`);
  console.log(OPENAI_API_KEY ? `Using default OpenAI model ${MODEL}` : "OPENAI_API_KEY is not set; browser fallback will be used.");
  if (OPENAI_API_KEY) console.log(`Using image generation model ${IMAGE_MODEL}`);
  console.log(`Writing diagnostics to ${LOG_FILE}`);
});
