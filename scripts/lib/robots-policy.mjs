function parseGroups(robotsBody) {
  const groups = [];
  let agents = [];
  let rules = [];

  const flush = () => {
    if (agents.length > 0) groups.push({ agents, rules });
    agents = [];
    rules = [];
  };

  for (const rawLine of String(robotsBody).split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) {
      if (rules.length > 0) flush();
      continue;
    }
    const directive = line.match(/^([^:]+):\s*(.*)$/);
    if (!directive) continue;
    const name = directive[1].trim().toLowerCase();
    const value = directive[2].trim();
    if (name === "user-agent") {
      if (rules.length > 0) flush();
      agents.push(value.toLowerCase());
      continue;
    }
    if ((name === "allow" || name === "disallow") && agents.length > 0) {
      rules.push({ type: name, pattern: value });
    }
  }
  flush();
  return groups;
}

function ruleMatch(pattern, path) {
  if (!pattern) return null;
  const anchored = pattern.endsWith("$");
  const pathPattern = anchored ? pattern.slice(0, -1) : pattern;
  const expression = pathPattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  const regex = new RegExp(`^${expression}${anchored ? "$" : ""}`);
  if (!regex.test(path)) return null;
  return pathPattern.replace(/\*/g, "").length;
}

function applicableRules(robotsBody, userAgent) {
  const groups = parseGroups(robotsBody);
  const normalizedAgent = String(userAgent).trim().toLowerCase();
  const specificGroups = groups.filter((group) =>
    group.agents.some((agent) => agent !== "*" && agent === normalizedAgent));
  const selectedGroups = specificGroups.length > 0
    ? specificGroups
    : groups.filter((group) => group.agents.includes("*"));
  return selectedGroups.flatMap((group) => group.rules);
}

function pathIsDisallowed(rules, path) {
  const matches = rules
    .map((rule) => ({ ...rule, matchLength: ruleMatch(rule.pattern, path) }))
    .filter((rule) => rule.matchLength !== null)
    .sort((left, right) =>
      right.matchLength - left.matchLength ||
      Number(right.type === "allow") - Number(left.type === "allow"));
  return matches[0]?.type === "disallow";
}

export function robotsDisallowsEntirePathTree(robotsBody, path, userAgent = "googlebot") {
  const normalizedPath = String(path).replace(/\/+$/, "") || "/";
  const descendantPath = normalizedPath === "/" ? "/" : `${normalizedPath}/`;
  const rules = applicableRules(robotsBody, userAgent);
  return pathIsDisallowed(rules, normalizedPath)
    || pathIsDisallowed(rules, descendantPath);
}

export function robotsDeclaresSitemap(robotsBody, expectedSitemapUrl) {
  const expected = String(expectedSitemapUrl).trim();
  return String(robotsBody).split(/\r?\n/).some((rawLine) => {
    const line = rawLine.replace(/#.*$/, "").trim();
    const directive = line.match(/^sitemap:\s*(\S+)\s*$/i);
    return directive?.[1] === expected;
  });
}
