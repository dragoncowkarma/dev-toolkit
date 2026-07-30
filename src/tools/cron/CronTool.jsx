import { useEffect, useMemo, useState } from 'react';
import { describeCron, formatExecution, getNextExecutions } from './cron.utils.js';
import './cron.css';

const PRESETS = [
  ['Every minute', '* * * * *'],
  ['Every hour', '0 * * * *'],
  ['Daily at midnight', '0 0 * * *'],
  ['Monday 9 AM', '0 9 * * 1'],
  ['Every 5 minutes', '*/5 * * * *'],
];

/** Renders a live cron expression explainer and schedule preview. */
export default function CronTool() {
  const [expression, setExpression] = useState('*/5 * * * *');
  const [copied, setCopied] = useState('');
  const result = useMemo(() => {
    try {
      return { description: describeCron(expression), dates: getNextExecutions(expression) };
    } catch (error) {
      return { error: error.message };
    }
  }, [expression]);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(''), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy(value, type) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(type);
    } catch {
      setCopied('error');
    }
  }

  return (
    <section className="cron-tool" aria-label="Cron Parser Tool">
      <div className="cron-tool__intro">
        <p className="cron-tool__eyebrow">Scheduler</p>
        <h2>Cron Parser</h2>
        <p>Explain five- or six-field cron schedules and preview upcoming runs.</p>
      </div>
      <div className="cron-tool__presets" aria-label="Cron presets">
        {PRESETS.map(([label, value]) => (
          <button type="button" key={value} onClick={() => setExpression(value)}>
            {label}
          </button>
        ))}
      </div>
      <div className="cron-tool__input-group">
        <label htmlFor="cron-expression">Cron expression</label>
        <div>
          <input
            id="cron-expression"
            value={expression}
            onChange={(event) => setExpression(event.target.value)}
            spellCheck="false"
            aria-describedby="cron-help"
          />
          <button type="button" onClick={() => copy(expression, 'expression')}>
            {copied === 'expression' ? 'Copied' : 'Copy expression'}
          </button>
        </div>
        <p id="cron-help">5 fields: minute hour day month weekday · 6 fields add seconds first.</p>
      </div>
      {result.error ? (
        <div className="cron-tool__error" role="alert">
          {result.error}
        </div>
      ) : (
        <>
          <div className="cron-tool__description">
            <div>
              <span>Human-readable schedule</span>
              <strong>{result.description}</strong>
            </div>
            <button type="button" onClick={() => copy(result.description, 'description')}>
              {copied === 'description' ? 'Copied' : 'Copy description'}
            </button>
          </div>
          <div className="cron-tool__schedule">
            <h3>Next 5 executions</h3>
            <ol aria-label="Next cron executions">
              {result.dates.map((date) => (
                <li key={date.toISOString()}>
                  <time dateTime={date.toISOString()}>{formatExecution(date)}</time>
                </li>
              ))}
            </ol>
          </div>
        </>
      )}
      <p className="cron-tool__status" role="status" aria-live="polite">
        {copied === 'error'
          ? 'Failed to copy to clipboard.'
          : copied ? 'Copied to clipboard.' : ''}
      </p>
    </section>
  );
}
