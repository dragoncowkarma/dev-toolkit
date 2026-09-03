/**
 * Local, client-side parser and path-permission evaluator for the Robots Exclusion Protocol
 * (RFC 9309), plus the widely-embedded Sitemaps protocol and the non-normative `Crawl-delay`
 * extension. Nothing here performs network access: all input is text the caller supplies.
 */

/**
 * @typedef {'allow'|'disallow'|'crawl-delay'} RobotsRuleType
 */

/**
 * @typedef {Object} RobotsRule
 * @property {RobotsRuleType} type The directive kind.
 * @property {string} value Raw directive value, exactly as written (may be empty).
 * @property {number} line One-based source line number the directive appeared on.
 */

/**
 * @typedef {Object} RobotsGroup
 * @property {string} userAgent Lower-cased product token this merged group applies to (RFC 9309
 *   user-agent comparison is case-insensitive, so the original casing is not preserved).
 * @property {RobotsRule[]} rules Allow/Disallow/Crawl-delay rules, in original file order.
 */

/**
 * @typedef {Object} RobotsSitemap
 * @property {string} url Raw `Sitemap` directive value.
 * @property {number} line One-based source line number.
 */

/**
 * @typedef {Object} IgnoredLine
 * @property {number} line One-based source line number.
 * @property {string} text The trimmed, non-blank, non-comment-only original line text.
 */

/**
 * @typedef {Object} ParsedRobotsTxt
 * @property {RobotsGroup[]} groups Merged rule sets, one per distinct user-agent token, in
 *   order of first appearance in the file.
 * @property {RobotsSitemap[]} sitemaps File-scoped `Sitemap` entries, in file order.
 * @property {IgnoredLine[]} ignoredLines Lines that were not a recognized `field: value` pair,
 *   or a recognized field used somewhere it is not valid (e.g. a rule before any `User-agent`).
 */

/**
 * @typedef {Object} EvaluationResult
 * @property {'ALLOWED'|'DISALLOWED'} verdict The resolved crawl permission for the path.
 * @property {{type: RobotsRuleType, value: string, line: number}|null} matchedRule The rule
 *   that decided the verdict, or `null` when no rule applied (default allow).
 * @property {string|null} group The selected group's user-agent token, or `null` when no group
 *   in the file applies to the requested user-agent at all (a distinct "no applicable group"
 *   outcome from "a group applied but none of its rules matched this path").
 */

/** Field names this parser recognizes, compared case-insensitively. */
const KNOWN_FIELDS = new Set(['user-agent', 'disallow', 'allow', 'sitemap', 'crawl-delay']);

/**
 * Strips a trailing `#`-prefixed comment from a single line. Robots.txt comments run to the
 * end of the line and have no escape mechanism.
 * @param {string} line Raw source line.
 * @returns {string} The line with any trailing comment removed.
 */
function stripComment(line) {
  const index = line.indexOf('#');
  return index === -1 ? line : line.slice(0, index);
}

/**
 * Parses raw `robots.txt` text into merged user-agent groups, a flat sitemap list, and any
 * lines that could not be interpreted. This function MUST NOT throw: per RFC 9309, robots.txt
 * parsing is intentionally lenient, so any input it cannot make sense of is reported through
 * `ignoredLines` rather than failing the whole parse.
 *
 * Grouping follows RFC 9309 §2.2.1: one or more consecutive `User-agent` lines form a group
 * header; the group's rules are every `Allow`/`Disallow`/`Crawl-delay` line that follows, up to
 * the next `User-agent` line that starts a new group (i.e. one seen after the group already
 * collected a rule) or end of file. `Sitemap` lines are file-scoped and never break a group in
 * progress. Groups that redeclare the same user-agent token later in the file are merged into
 * the token's existing rule set, appending rules in the order encountered so the merged result
 * still reflects original file order.
 *
 * @param {unknown} text Raw `robots.txt` file contents. Non-string input is treated as empty.
 * @returns {ParsedRobotsTxt} The parsed groups, sitemaps, and ignored lines.
 */
export function parseRobotsTxt(text) {
  const source = typeof text === 'string' ? text : '';
  const lines = source.split(/\r\n|\r|\n/);

  const groups = [];
  const sitemaps = [];
  const ignoredLines = [];
  const groupByToken = new Map();

  // Tokens (lower-cased) declared by the run of `User-agent` lines currently being read.
  let currentAgents = [];
  // Whether a rule has already been attached to `currentAgents` since it was last started.
  let currentGroupHasRules = false;

  lines.forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const trimmed = stripComment(rawLine).trim();
    if (trimmed === '') return; // Blank line or comment-only line: a separator, not an error.

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) {
      ignoredLines.push({ line: lineNumber, text: rawLine.trim() });
      return;
    }

    const field = trimmed.slice(0, colonIndex).trim().toLowerCase();
    const value = trimmed.slice(colonIndex + 1).trim();

    if (!KNOWN_FIELDS.has(field)) {
      ignoredLines.push({ line: lineNumber, text: rawLine.trim() });
      return;
    }

    if (field === 'sitemap') {
      if (!value) {
        ignoredLines.push({ line: lineNumber, text: rawLine.trim() });
        return;
      }
      sitemaps.push({ url: value, line: lineNumber });
      return;
    }

    if (field === 'user-agent') {
      if (!value) {
        ignoredLines.push({ line: lineNumber, text: rawLine.trim() });
        return;
      }
      const token = value.toLowerCase();
      if (currentAgents.length === 0 || currentGroupHasRules) {
        // Either the very first group header, or a User-agent line seen after the in-progress
        // group already gathered rules: this starts a brand-new group.
        currentAgents = [token];
        currentGroupHasRules = false;
      } else if (!currentAgents.includes(token)) {
        // Still inside a consecutive run of User-agent lines: they all share one rule set.
        // Skip tokens already collected so a repeated token doesn't get the rule attached twice.
        currentAgents.push(token);
      }
      if (!groupByToken.has(token)) {
        const group = { userAgent: token, rules: [] };
        groupByToken.set(token, group);
        groups.push(group);
      }
      return;
    }

    // field is 'disallow', 'allow', or 'crawl-delay'.
    if (currentAgents.length === 0) {
      // A rule with no preceding User-agent line belongs to no group (RFC 9309 §2.2.1).
      ignoredLines.push({ line: lineNumber, text: rawLine.trim() });
      return;
    }
    currentGroupHasRules = true;
    const rule = { type: field, value, line: lineNumber };
    currentAgents.forEach((token) => {
      groupByToken.get(token).rules.push(rule);
    });
  });

  return { groups, sitemaps, ignoredLines };
}

/**
 * Escapes regex metacharacters in a pattern segment. Callers pre-split on `*` before calling
 * this, so `*` itself never reaches it.
 * @param {string} segment Literal text to escape.
 * @returns {string} The segment with regex-significant characters escaped.
 */
function escapeRegExpLiteral(segment) {
  return segment.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The RFC 3986 §2.3 "unreserved" character set: octets that decode to one of these are safe to
 * fold back to their literal form without changing a URI's meaning.
 */
const UNRESERVED_CHAR = /^[A-Za-z0-9\-._~]$/;

/**
 * Normalizes percent-encoded octets in a path or path-pattern so semantically-identical forms
 * compare equal, per RFC 9309 §2.2.2 (which defers to RFC 3986 §2.3/§6.2.2.2): a `%XX` escape
 * that decodes to an RFC 3986 "unreserved" character is folded back to that literal character
 * (so `%69` and `i` compare equal); every other escape - reserved characters such as `%2F`
 * (which must stay distinct from a literal `/` path separator), non-ASCII bytes, and malformed
 * `%` sequences - is left as-is, only with its hex digits upper-cased for a stable comparison
 * form. This intentionally decodes octet-by-octet rather than as UTF-8: non-ASCII bytes never
 * match `UNRESERVED_CHAR`, so multi-byte sequences safely pass through unchanged.
 * @param {string} value Raw path or path-pattern value.
 * @returns {string} The value with safe percent-escapes decoded and the rest normalized.
 */
function normalizePercentEncoding(value) {
  return value.replace(/%([0-9A-Fa-f]{2})/g, (match, hex) => {
    const char = String.fromCharCode(parseInt(hex, 16));
    return UNRESERVED_CHAR.test(char) ? char : `%${hex.toUpperCase()}`;
  });
}

/**
 * Compiles a robots.txt path pattern into a matcher, per RFC 9309 §2.2.3: `*` matches any run
 * of characters (including none), and a trailing `$` anchors the match to the end of the path.
 * Matching is otherwise a literal prefix match, and is case-sensitive. The pattern is
 * percent-normalized first (see `normalizePercentEncoding`) so it lines up with a similarly
 * normalized request path.
 * @param {string} pattern Rule path value (e.g. `/fish/*.php$`).
 * @returns {RegExp} A regular expression implementing the pattern's match semantics.
 */
function compilePathPattern(pattern) {
  const normalized = normalizePercentEncoding(pattern);
  const hasEndAnchor = normalized.endsWith('$');
  const body = hasEndAnchor ? normalized.slice(0, -1) : normalized;
  const escaped = body.split('*').map(escapeRegExpLiteral).join('.*');
  return new RegExp(`^${escaped}${hasEndAnchor ? '$' : ''}`);
}

/**
 * Selects the rule set that applies to a requesting crawler's user-agent, per RFC 9309 §2.2.1.
 * Every group whose token is a case-insensitive match found within the requested user-agent
 * string is "specific" and applies; when more than one specific group matches (e.g. a crawler
 * whose user-agent contains both a product token and a more specific variant of it, such as
 * `Googlebot-News/1.0` matching both `googlebot` and `googlebot-news`), their rules are combined
 * into a single synthesized group rather than picking only the longest-token match, since RFC
 * 9309 requires every matching specific group's rules to be considered. The `*` group is used
 * only as a fallback, when no specific group matches at all. A literal `*` (or blank) request
 * always selects the `*` group directly, if one exists.
 * @param {RobotsGroup[]} groups Parsed, merged groups.
 * @param {string} userAgent Requesting crawler's user-agent (or product token).
 * @returns {RobotsGroup|null} The selected (possibly synthesized) group, or `null` when nothing
 *   applies.
 */
function selectGroup(groups, userAgent) {
  const wildcardGroup = groups.find((group) => group.userAgent === '*') ?? null;
  const requested = String(userAgent ?? '').trim().toLowerCase();
  if (!requested || requested === '*') return wildcardGroup;

  const matches = groups.filter(
    (group) => group.userAgent !== '*' && requested.includes(group.userAgent),
  );

  if (matches.length === 0) return wildcardGroup;
  if (matches.length === 1) return matches[0];

  // More than one specific product token matched: RFC 9309 requires combining their rules
  // rather than choosing a single "most specific" group.
  return {
    userAgent: matches.map((group) => group.userAgent).join(', '),
    rules: matches.flatMap((group) => group.rules),
  };
}

/**
 * Evaluates whether a crawl path is allowed for a given user-agent against parsed robots.txt
 * groups, per RFC 9309 §2.2.2.
 *
 * Precedence (documented here since the RFC leaves exact tie-break wording implementation
 * defined beyond "the most specific rule wins"): among rules in the selected group whose
 * pattern matches the path, the rule whose path *value* has the greatest character length wins
 * (wildcards and the `$` anchor count as their literal characters, matching how most production
 * crawlers - e.g. Google's documented algorithm - implement "most specific"). On an exact
 * length tie between a matching `Allow` and a matching `Disallow`, `Allow` wins, mirroring
 * Google's and Bing's documented tie-break and the least-surprising outcome for an author who
 * wrote both rules. An empty `Disallow:` (and, symmetrically, an empty `Allow:`) value carries
 * no path and is never a candidate, per the "empty value means no restriction" note in RFC 9309.
 *
 * The request path is percent-normalized before matching (see `normalizePercentEncoding`), so a
 * percent-escaped octet equivalent to a rule pattern's literal character (e.g.
 * `/catalog/%69tem` vs. `Disallow: /catalog/item`) is correctly caught. The `/robots.txt` URI
 * itself is always implicitly allowed regardless of any rule that would otherwise match it - per
 * RFC 9309 §2.1, a robots.txt file can never disallow fetching itself - so it short-circuits to
 * `ALLOWED` before any group's rules are consulted.
 *
 * @param {RobotsGroup[]} groups Parsed, merged groups (typically `parseRobotsTxt(text).groups`).
 * @param {Object} [options]
 * @param {string} [options.userAgent='*'] Requesting crawler's user-agent or product token.
 * @param {string} [options.path='/'] Request path (and, if present, query string) to test.
 * @returns {EvaluationResult} The resolved verdict, evidence rule, and selected group.
 */
export function evaluatePath(groups, options = {}) {
  const list = Array.isArray(groups) ? groups : [];
  const userAgent = options.userAgent ?? '*';
  const rawPath = typeof options.path === 'string' && options.path ? options.path : '/';
  const path = normalizePercentEncoding(rawPath);

  const group = selectGroup(list, userAgent);

  if (path.split('?')[0] === '/robots.txt') {
    return { verdict: 'ALLOWED', matchedRule: null, group: group ? group.userAgent : null };
  }

  if (!group) {
    return { verdict: 'ALLOWED', matchedRule: null, group: null };
  }

  const candidates = group.rules
    .filter((rule) => (rule.type === 'allow' || rule.type === 'disallow') && rule.value !== '')
    .filter((rule) => compilePathPattern(rule.value).test(path));

  if (candidates.length === 0) {
    return { verdict: 'ALLOWED', matchedRule: null, group: group.userAgent };
  }

  const winner = candidates.reduce((best, rule) => {
    if (!best) return rule;
    if (rule.value.length > best.value.length) return rule;
    const isTie = rule.value.length === best.value.length;
    if (isTie && rule.type === 'allow' && best.type === 'disallow') {
      return rule;
    }
    return best;
  }, null);

  return {
    verdict: winner.type === 'allow' ? 'ALLOWED' : 'DISALLOWED',
    matchedRule: { type: winner.type, value: winner.value, line: winner.line },
    group: group.userAgent,
  };
}
