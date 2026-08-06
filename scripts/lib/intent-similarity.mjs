const phraseAliases = [
  [/\b(?:first|opening)\s+(?:(?:ai|roleplay)\s+){0,2}(?:message|reply|response)\b/g, " first_reply "],
  [/\b(?:prepared|supplied|existing|ready[- ]made)\s+(?:(?:ai|roleplay)\s+){0,2}(?:plot|premise|story)\b/g, " prepared_story "],
  [/\b(?:blank|custom|self[- ]authored)\s+(?:(?:ai|roleplay)\s+){0,2}(?:prompt|premise)\b/g, " custom_prompt "],
  [/\b(?:stay|remain|keep)\s+in\s+character\b/g, " maintain_role "],
  [/\b(?:get|getting)\s+started\b/g, " begin "],
  [/\b(?:worth\s+trying|worth\s+a\s+try|evaluate|assess|test)\b/g, " evaluate "],
];

const tokenAliases = new Map([
  ["based", "based"],
  ["begins", "begin"], ["beginning", "begin"], ["began", "begin"],
  ["start", "begin"], ["starts", "begin"], ["starting", "begin"],
  ["enter", "begin"], ["enters", "begin"], ["entering", "begin"],
  ["play", "begin"], ["playing", "begin"], ["try", "begin"], ["trying", "begin"],
  ["compare", "compare"], ["compares", "compare"], ["comparing", "compare"],
  ["comparison", "compare"], ["against", "compare"], ["versus", "compare"],
  ["vs", "compare"], ["difference", "compare"],
  ["select", "choose"], ["selecting", "choose"], ["pick", "choose"], ["choosing", "choose"],
  ["write", "write"], ["writes", "write"], ["writing", "write"],
  ["draft", "write"], ["drafting", "write"], ["compose", "write"],
  ["message", "reply"], ["messages", "reply"], ["replying", "reply"],
  ["response", "reply"], ["responses", "reply"],
  ["fix", "recover"], ["recovering", "recover"], ["revive", "recover"], ["unstick", "recover"],
  ["maintain", "maintain_role"], ["continuity", "maintain_role"],
  ["pace", "pacing"], ["paced", "pacing"], ["length", "pacing"],
  ["speech", "dialogue"],
  ["move", "action"], ["moves", "action"], ["acting", "action"],
  ["goal", "motivation"], ["objective", "motivation"], ["motive", "motivation"],
  ["consequences", "consequence"], ["outcome", "consequence"], ["impact", "consequence"],
  ["roles", "role"], ["character", "role"], ["characters", "role"],
  ["stories", "story"], ["scenes", "scene"], ["prompts", "prompt"],
  ["decide", "decide"], ["deciding", "decide"], ["decision", "decide"],
]);

const stopWords = new Set([
  "a", "an", "and", "are", "as", "at", "be", "before", "by", "can", "do", "for",
  "from", "has", "have", "how", "i", "if", "in", "inside", "is", "it", "its", "my",
  "of", "on", "one", "or", "so", "than", "that", "the", "their", "then", "this", "to",
  "use", "using", "want", "whether", "which", "while", "with", "without", "you", "your",
  "available", "based", "chosen", "current", "immediate", "immediately", "led", "next", "now",
]);

const genericWeights = new Map([
  ["ai", 0.05],
  ["roleplay", 0.15],
  ["story", 0.2],
  ["scene", 0.25],
  ["role", 0.3],
  ["voice", 0.35],
  ["experience", 0.1],
  ["product", 0.05],
  ["format", 0.05],
  ["game", 0.1],
  ["interactive", 0.2],
]);

function canonicalToken(token) {
  if (tokenAliases.has(token)) return tokenAliases.get(token);
  if (token.length > 5 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 5 && token.endsWith("ing")) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith("ed")) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

export function normalizeIntentTokens(value) {
  let text = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  for (const [pattern, replacement] of phraseAliases) text = text.replace(pattern, replacement);
  return text
    .match(/[a-z0-9_]+/g)?.map(canonicalToken)
    .filter((token) => token && !stopWords.has(token)) ?? [];
}

export function intentFingerprint(value) {
  return [...new Set(normalizeIntentTokens(value))].sort().join("|");
}

function tokenSet(value) {
  return new Set(normalizeIntentTokens(value));
}

function tokenWeight(token) {
  return genericWeights.get(token) ?? 1;
}

function primaryTaskFingerprint(tokens) {
  const has = (token) => tokens.has(token);
  if (has("first_reply")) return "first_reply";
  if (has("compare") && (has("custom_prompt") || has("prepared_story") || has("prompt"))) {
    return "compare_starting_route";
  }
  if (has("recover")) return "recover_scene";
  if (has("maintain_role")) return "maintain_role";
  if (has("pacing")) return "reply_pacing";
  if (has("motivation")) return "role_motivation";
  if (has("consequence")) return "consequential_choice";
  if (has("dialogue") && has("action")) return "dialogue_or_action";
  if (has("choose") && has("role")) return "choose_role";
  if (has("begin") && (has("roleplay") || has("story") || has("scene"))) return "begin_roleplay";
  return null;
}

export function compareIntentText(leftValue, rightValue) {
  const left = tokenSet(leftValue);
  const right = tokenSet(rightValue);
  const leftFingerprint = [...left].sort().join("|");
  const rightFingerprint = [...right].sort().join("|");
  const union = new Set([...left, ...right]);
  let intersectionWeight = 0;
  let unionWeight = 0;
  let leftWeight = 0;
  let rightWeight = 0;
  let sharedCoreTokens = 0;
  let leftCoreTokens = 0;
  let rightCoreTokens = 0;
  for (const token of union) {
    const weight = tokenWeight(token);
    unionWeight += weight;
    if (left.has(token) && right.has(token)) {
      intersectionWeight += weight;
      if (!genericWeights.has(token)) sharedCoreTokens += 1;
    }
  }
  for (const token of left) {
    leftWeight += tokenWeight(token);
    if (!genericWeights.has(token)) leftCoreTokens += 1;
  }
  for (const token of right) {
    rightWeight += tokenWeight(token);
    if (!genericWeights.has(token)) rightCoreTokens += 1;
  }
  const similarity = unionWeight ? intersectionWeight / unionWeight : 0;
  const containment = Math.min(leftWeight, rightWeight)
    ? intersectionWeight / Math.min(leftWeight, rightWeight)
    : 0;
  const leftTask = primaryTaskFingerprint(left);
  const rightTask = primaryTaskFingerprint(right);
  const taskFingerprintMatch = Boolean(leftTask && leftTask === rightTask);
  const exactFingerprint = Boolean(leftFingerprint && leftFingerprint === rightFingerprint);
  const broadBeginMatch = (
    (leftTask === "begin_roleplay" && rightCoreTokens === 0) ||
    (rightTask === "begin_roleplay" && leftCoreTokens === 0)
  ) && containment >= 0.65 && intersectionWeight >= 0.25;
  const nearDuplicate = exactFingerprint || taskFingerprintMatch || broadBeginMatch || similarity >= 0.72 || (
    containment >= 0.88 && intersectionWeight >= 1.75 && sharedCoreTokens >= 2
  );
  return {
    nearDuplicate,
    exactFingerprint,
    taskFingerprintMatch,
    broadBeginMatch,
    similarity,
    containment,
    sharedCoreTokens,
    leftFingerprint,
    rightFingerprint,
    taskFingerprint: taskFingerprintMatch ? leftTask : null,
  };
}

function candidateText(candidate) {
  return [candidate?.keyword, candidate?.decisionEvidence?.searcherJob]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");
}

export function analyzeCandidateIntentBatch(candidates) {
  const profiles = (Array.isArray(candidates) ? candidates : []).map((candidate, index) => ({
    index,
    keyword: String(candidate?.keyword || "").trim().toLowerCase(),
    text: candidateText(candidate),
    fingerprint: intentFingerprint(candidateText(candidate)),
  }));
  const parents = profiles.map((_, index) => index);
  const find = (index) => {
    let root = index;
    while (parents[root] !== root) root = parents[root];
    while (parents[index] !== index) {
      const next = parents[index];
      parents[index] = root;
      index = next;
    }
    return root;
  };
  const union = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parents[Math.max(leftRoot, rightRoot)] = Math.min(leftRoot, rightRoot);
  };
  const collisions = [];
  for (let left = 0; left < profiles.length; left += 1) {
    for (let right = left + 1; right < profiles.length; right += 1) {
      const comparison = compareIntentText(profiles[left].text, profiles[right].text);
      if (!comparison.nearDuplicate) continue;
      union(left, right);
      collisions.push({ left: profiles[left], right: profiles[right], comparison });
    }
  }
  const clusterMap = new Map();
  for (const profile of profiles) {
    const root = find(profile.index);
    const cluster = clusterMap.get(root) ?? {
      fingerprint: profiles[root].fingerprint,
      members: [],
    };
    cluster.members.push(profile);
    clusterMap.set(root, cluster);
  }
  const clusters = [...clusterMap.values()];
  return { profiles, clusters, collisions, distinctCount: clusters.length };
}

function reportSlug(report) {
  return String(report?.publication?.slug || report?.draft?.slug || "").replace(/^\//, "");
}

export function publishedIntentRecords(pages, reports) {
  const reportsBySlug = new Map();
  for (const report of Array.isArray(reports) ? reports : []) {
    const slug = reportSlug(report);
    if (!slug || report?.publication?.status !== "published") continue;
    const values = reportsBySlug.get(slug) ?? [];
    values.push(report);
    reportsBySlug.set(slug, values);
  }
  return (Array.isArray(pages) ? pages : []).map((page) => {
    const slug = String(page?.slug || "").replace(/^\//, "");
    const fields = [
      { source: "keyword", value: page?.keyword },
      { source: "h1", value: page?.h1 },
      { source: "page.architecture.intent.searcherJob", value: page?.architecture?.intent?.searcherJob },
      { source: "page.architecture.intent.decisionToEnable", value: page?.architecture?.intent?.decisionToEnable },
      { source: "page.architecture.intent.oneSentenceAnswer", value: page?.architecture?.intent?.oneSentenceAnswer },
      { source: "page.searcherJob", value: page?.searcherJob },
    ];
    for (const report of reportsBySlug.get(slug) ?? []) {
      fields.push(
        { source: "report.contentStrategy.searcherJob", value: report?.contentStrategy?.searcherJob },
        { source: "report.draft.architecture.intent.searcherJob", value: report?.draft?.architecture?.intent?.searcherJob },
        { source: "report.draft.architecture.intent.decisionToEnable", value: report?.draft?.architecture?.intent?.decisionToEnable },
        { source: "report.draft.architecture.intent.oneSentenceAnswer", value: report?.draft?.architecture?.intent?.oneSentenceAnswer },
      );
    }
    return {
      slug,
      path: String(page?.path || `/${slug}`),
      fields: fields
        .map((field) => ({ ...field, value: String(field.value || "").trim() }))
        .filter((field) => field.value),
    };
  });
}

function comparisonStrength(comparison) {
  return Math.max(
    comparison.similarity,
    comparison.containment * 0.9,
    comparison.exactFingerprint ? 1 : 0,
    comparison.taskFingerprintMatch ? 0.98 : 0,
  );
}

export function findPublishedIntentMatch(candidate, records) {
  const candidateFields = [
    { source: "candidate.keyword", value: String(candidate?.keyword || "").trim() },
    { source: "candidate.searcherJob", value: String(candidate?.decisionEvidence?.searcherJob || "").trim() },
  ].filter((field) => field.value);
  let best = null;
  for (const record of Array.isArray(records) ? records : []) {
    for (const candidateField of candidateFields) {
      for (const publishedField of record.fields) {
        const comparison = compareIntentText(candidateField.value, publishedField.value);
        if (!comparison.nearDuplicate) continue;
        const strength = comparisonStrength(comparison);
        if (!best || strength > best.strength) {
          best = { record, candidateField, publishedField, comparison, strength };
        }
      }
    }
  }
  return best;
}
