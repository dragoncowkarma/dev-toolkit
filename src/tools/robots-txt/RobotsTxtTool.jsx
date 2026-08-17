import { useEffect, useMemo, useState } from 'react';
import { evaluatePath, parseRobotsTxt } from './robotsTxt.utils.js';
import './robotsTxt.css';

const SAMPLE_ROBOTS_TXT = [
  'User-agent: *',
  'Disallow: /admin',
  'Disallow: /fish',
  'Allow: /fish/salmon.html',
  'Disallow: /fish/*.php$',
  'Crawl-delay: 10',
  '',
  'User-agent: Googlebot',
  'Disallow: /private',
  '',
  'User-agent: Googlebot',
  'Allow: /private/press-kit',
  '',
  'Sitemap: https://example.com/sitemap.xml',
  'Sitemap: https://example.com/sitemap-news.xml',
].join('\n');

const RULE_LABELS = {
  allow: 'Allow',
  disallow: 'Disallow',
  'crawl-delay': 'Crawl-delay',
};

/**
 * Formats a single parsed rule for display, e.g. `Disallow: /fish/*.php$ (line 5)`.
 * @param {{type: string, value: string, line: number}} rule Parsed rule.
 * @returns {string} Human-readable rule summary.
 */
function formatRule(rule) {
  const value = rule.value === '' ? '(empty)' : rule.value;
  return `${RULE_LABELS[rule.type] ?? rule.type}: ${value} (line ${rule.line})`;
}

/**
 * Builds the copy-to-clipboard verdict summary text for the current path test.
 * @param {Object} args
 * @param {string} args.userAgent Requested crawler user-agent.
 * @param {string} args.path Requested path.
 * @param {import('./robotsTxt.utils.js').EvaluationResult} args.evaluation Evaluation result.
 * @returns {string} A one-line, self-contained summary of the verdict and its evidence.
 */
function buildVerdictSummary({ userAgent, path, evaluation }) {
  const groupText = evaluation.group ? `group "${evaluation.group}"` : 'no applicable group';
  const evidenceText = evaluation.matchedRule
    ? `matched ${formatRule(evaluation.matchedRule)}`
    : 'no matching rule (default allow)';
  return `robots.txt check for user-agent "${userAgent}" and path "${path}": `
    + `${evaluation.verdict} (${groupText}, ${evidenceText}).`;
}

/**
 * Renders a local Robots.txt Tester: parses pasted `robots.txt` content into user-agent groups
 * and sitemap entries, then lets the user test whether a path is allowed for a chosen crawler.
 * Nothing entered here leaves the browser.
 *
 * @returns {React.JSX.Element} Robots.txt Tester interface.
 */
export default function RobotsTxtTool() {
  const [rawInput, setRawInput] = useState('');
  const [userAgent, setUserAgent] = useState('*');
  const [path, setPath] = useState('/');
  const [copyStatus, setCopyStatus] = useState('');

  const { groups, sitemaps, ignoredLines } = useMemo(() => parseRobotsTxt(rawInput), [rawInput]);
  const evaluation = useMemo(
    () => evaluatePath(groups, { userAgent, path }),
    [groups, userAgent, path],
  );

  useEffect(() => {
    if (!copyStatus) return undefined;
    const timeout = setTimeout(() => setCopyStatus(''), 1500);
    return () => clearTimeout(timeout);
  }, [copyStatus]);

  function loadSample() {
    setRawInput(SAMPLE_ROBOTS_TXT);
    setUserAgent('Googlebot');
    setPath('/private/press-kit');
    setCopyStatus('');
  }

  function handleClear() {
    setRawInput('');
    setUserAgent('*');
    setPath('/');
    setCopyStatus('');
  }

  async function handleCopyVerdict() {
    const summary = buildVerdictSummary({ userAgent, path, evaluation });
    try {
      await navigator.clipboard.writeText(summary);
      setCopyStatus('Verdict summary copied to clipboard.');
    } catch {
      setCopyStatus('Unable to copy the verdict summary to the clipboard.');
    }
  }

  const evidenceText = evaluation.matchedRule
    ? formatRule(evaluation.matchedRule)
    : 'No matching rule — default allow.';
  const groupText = evaluation.group
    ? `Selected group: "${evaluation.group}"`
    : 'No applicable group in this robots.txt.';

  return (
    <section className="robots-txt-tool" aria-label="Robots.txt Tester Tool">
      <header className="robots-txt-tool__intro">
        <p className="robots-txt-tool__eyebrow">Tester</p>
        <h2>Robots.txt Tester</h2>
        <p>
          Paste a robots.txt file to parse it locally, review its user-agent groups and
          sitemaps, and test whether a path is allowed for a chosen crawler.
        </p>
      </header>

      <div className="robots-txt-tool__toolbar">
        <div className="robots-txt-tool__actions">
          <button type="button" onClick={loadSample}>Load sample robots.txt</button>
          <button type="button" onClick={handleClear}>Clear</button>
        </div>
      </div>

      <label className="robots-txt-tool__label" htmlFor="robots-txt-input">
        robots.txt content
      </label>
      <textarea
        id="robots-txt-input"
        className="robots-txt-tool__input"
        value={rawInput}
        onChange={(event) => setRawInput(event.target.value)}
        placeholder="Paste the contents of a robots.txt file…"
        spellCheck={false}
        aria-label="robots.txt content"
      />

      {ignoredLines.length > 0 && (
        <p className="robots-txt-tool__alert" role="alert">
          {ignoredLines.length} {ignoredLines.length === 1 ? 'line' : 'lines'} could not be
          parsed and {ignoredLines.length === 1 ? 'was' : 'were'} skipped. See the ignored
          lines list below.
        </p>
      )}

      {groups.length > 0 && (
        <section className="robots-txt-tool__groups" aria-label="Parsed user-agent groups">
          <h3>User-agent groups</h3>
          {groups.map((group) => (
            <article
              key={group.userAgent}
              className="robots-txt-tool__group"
              aria-label={`Rules for user-agent ${group.userAgent}`}
            >
              <h4>{group.userAgent}</h4>
              {group.rules.length > 0 ? (
                <ul>
                  {group.rules.map((rule) => (
                    <li key={`${rule.type}-${rule.line}`}>
                      <span
                        className={
                          `robots-txt-tool__rule-type robots-txt-tool__rule-type--${rule.type}`
                        }
                      >
                        {RULE_LABELS[rule.type] ?? rule.type}
                      </span>
                      <code>{rule.value === '' ? '(empty)' : rule.value}</code>
                      <span className="robots-txt-tool__rule-line">line {rule.line}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="robots-txt-tool__empty">No rules declared for this group.</p>
              )}
            </article>
          ))}
        </section>
      )}

      {sitemaps.length > 0 && (
        <section className="robots-txt-tool__sitemaps" aria-label="Sitemap entries">
          <h3>Sitemaps</h3>
          <ul>
            {sitemaps.map((sitemap) => (
              <li key={`${sitemap.url}-${sitemap.line}`}>
                <code>{sitemap.url}</code>
                <span className="robots-txt-tool__rule-line">line {sitemap.line}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {ignoredLines.length > 0 && (
        <details className="robots-txt-tool__ignored">
          <summary>Ignored lines ({ignoredLines.length})</summary>
          <ul>
            {ignoredLines.map(({ line, text }) => (
              <li key={line}>Line {line}: <code>{text}</code></li>
            ))}
          </ul>
        </details>
      )}

      <section className="robots-txt-tool__tester" aria-label="Path tester">
        <h3>Path tester</h3>
        <div className="robots-txt-tool__tester-fields">
          <div className="robots-txt-tool__field">
            <label htmlFor="robots-txt-user-agent">User-agent</label>
            <input
              id="robots-txt-user-agent"
              type="text"
              value={userAgent}
              onChange={(event) => setUserAgent(event.target.value)}
              placeholder="*"
              aria-label="User-agent"
            />
          </div>
          <div className="robots-txt-tool__field">
            <label htmlFor="robots-txt-path">Path</label>
            <input
              id="robots-txt-path"
              type="text"
              value={path}
              onChange={(event) => setPath(event.target.value)}
              placeholder="/admin/settings"
              aria-label="Path"
            />
          </div>
        </div>

        <p
          className="robots-txt-tool__verdict"
          role="status"
          aria-live="polite"
          aria-label="Path test verdict"
        >
          <span
            className={
              `robots-txt-tool__badge robots-txt-tool__badge--${evaluation.verdict.toLowerCase()}`
            }
          >
            {evaluation.verdict}
          </span>
          <span className="robots-txt-tool__evidence">
            {groupText} — {evidenceText}
          </span>
        </p>

        <button type="button" onClick={handleCopyVerdict}>Copy verdict</button>
        {copyStatus && (
          <p
            className="robots-txt-tool__copy-status"
            role="status"
            aria-live="polite"
            aria-label="Copy feedback"
          >
            {copyStatus}
          </p>
        )}
      </section>
    </section>
  );
}
