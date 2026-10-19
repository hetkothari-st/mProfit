/**
 * Minimal robots.txt check for the `User-agent: *` group (our agent name is listed by no site, so `*` is the
 * group that applies). Longest matching rule wins; on a tie Allow wins; `*` is a wildcard and a trailing `$`
 * anchors the end, as in RFC 9309. An empty `Disallow:` allows everything.
 */
export function robotsAllows(robotsTxt: string, path: string): boolean {
  const rules: { allow: boolean; pattern: string }[] = [];
  let agents: string[] = [];
  let inRules = false;
  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const field = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    if (field === 'user-agent') {
      if (inRules) {
        agents = [];
        inRules = false;
      }
      agents.push(value.toLowerCase());
      continue;
    }
    if (field !== 'allow' && field !== 'disallow') continue;
    inRules = true;
    if (!agents.includes('*') || value === '') continue;
    rules.push({ allow: field === 'allow', pattern: value });
  }
  let best: { allow: boolean; length: number } | null = null;
  for (const rule of rules) {
    if (!matches(rule.pattern, path)) continue;
    const length = rule.pattern.length;
    if (!best || length > best.length || (length === best.length && rule.allow)) best = { allow: rule.allow, length };
  }
  return best ? best.allow : true;
}

function matches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const re = body
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${re}${anchored ? '$' : ''}`).test(path);
}
