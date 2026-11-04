import { useState } from 'react';
import { parseDnsPacketInput } from './dnsPacket.utils.js';
import './dnsPacketParser.css';

const SAMPLES = {
  query: '1a2b01000001000000000000076578616d706c6503636f6d0000010001',
  response:
    '1a2b81800001000100000000076578616d706c6503636f6d0000010001c00c000100010000012c00045db8d822',
};

function displayData(data) {
  if (Array.isArray(data)) return data.map((value) => `"${value}"`).join(', ');
  if (typeof data === 'object') {
    return Object.entries(data)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
  }
  return data;
}

function RecordList({ records, kind }) {
  if (records.length === 0) return <p className="dns-packet-parser__empty">No {kind} records.</p>;
  return (
    <div className="dns-packet-parser__records" role="list">
      {records.map((record, index) => (
        <article
          className="dns-packet-parser__record"
          role="listitem"
          key={`${record.name}-${index}`}
        >
          <strong>{record.name}</strong>
          <span>{record.typeName}</span>
          <span>{record.className}</span>
          <span>TTL {record.ttl}</span>
          <code>{displayData(record.data)}</code>
        </article>
      ))}
    </div>
  );
}

function MessageSection({ title, records, kind, open = false }) {
  return (
    <details className="dns-packet-parser__section" open={open}>
      <summary>{title} ({records.length})</summary>
      <RecordList records={records} kind={kind} />
    </details>
  );
}

/**
 * Renders an in-browser decoder for raw RFC 1035 DNS wireformat messages.
 * @returns {React.JSX.Element} DNS packet parser tool.
 */
export default function DnsPacketParserTool() {
  const [format, setFormat] = useState('hex');
  const [input, setInput] = useState('');
  const [packet, setPacket] = useState(null);
  const [error, setError] = useState('');

  function decode(value = input, selectedFormat = format) {
    try {
      setPacket(parseDnsPacketInput(value, selectedFormat));
      setError('');
    } catch (caughtError) {
      setPacket(null);
      setError(caughtError.message);
    }
  }

  function loadSample(sample) {
    setFormat('hex');
    setInput(sample);
    decode(sample, 'hex');
  }

  return (
    <section className="dns-packet-parser" aria-label="DNS Packet Parser">
      <div className="dns-packet-parser__controls">
        <label htmlFor="dns-packet-format">Packet format</label>
        <select
          id="dns-packet-format"
          value={format}
          onChange={(event) => setFormat(event.target.value)}
        >
          <option value="hex">Hex</option>
          <option value="base64">Base64</option>
        </select>
        <button type="button" onClick={() => loadSample(SAMPLES.query)}>Load A query</button>
        <button type="button" onClick={() => loadSample(SAMPLES.response)}>Load A response</button>
        <button
          type="button"
          className="dns-packet-parser__decode"
          onClick={() => decode()}
        >
          Decode packet
        </button>
      </div>

      <label className="dns-packet-parser__input-label" htmlFor="dns-packet-input">
        Raw DNS wireformat ({format === 'hex' ? 'hexadecimal bytes' : 'Base64 bytes'})
      </label>
      <textarea
        id="dns-packet-input"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder="Paste a DNS packet…"
        spellCheck={false}
      />

      {error && <p className="dns-packet-parser__error" role="alert">{error}</p>}

      {packet && (
        <div className="dns-packet-parser__result" aria-live="polite">
          <section className="dns-packet-parser__header" aria-labelledby="dns-header-title">
            <div>
              <p className="dns-packet-parser__eyebrow">Transaction ID</p>
              <h2 id="dns-header-title">0x{packet.header.id.toString(16).padStart(4, '0')}</h2>
            </div>
            <div className="dns-packet-parser__badges" aria-label="DNS header flags">
              <span>{packet.header.flags.qr ? 'Response' : 'Query'}</span>
              {packet.header.flags.rd && <span>Recursion Desired</span>}
              {packet.header.flags.ra && <span>Recursion Available</span>}
              {packet.header.flags.aa && <span>Authoritative</span>}
              {packet.header.flags.tc && <span>Truncated</span>}
              <span>{packet.header.flags.rcodeName}</span>
            </div>
          </section>
          <p className="dns-packet-parser__flag-detail">
            Opcode {packet.header.flags.opcode} · Z {packet.header.flags.z} · RCODE{' '}
            {packet.header.flags.rcode}
          </p>
          <dl className="dns-packet-parser__counts" aria-label="DNS section counts">
            <div>
              <dt>Questions</dt>
              <dd>{packet.header.questionCount}</dd>
            </div>
            <div>
              <dt>Answers</dt>
              <dd>{packet.header.answerCount}</dd>
            </div>
            <div>
              <dt>Authority</dt>
              <dd>{packet.header.authorityCount}</dd>
            </div>
            <div>
              <dt>Additional</dt>
              <dd>{packet.header.additionalCount}</dd>
            </div>
          </dl>
          <MessageSection
            title="Questions"
            records={packet.questions.map((question) => ({
              ...question,
              ttl: '—',
              data: `${question.typeName} / ${question.className}`,
            }))}
            kind="question"
            open
          />
          <MessageSection title="Answers" records={packet.answers} kind="answer" open />
          <MessageSection title="Authority" records={packet.authorities} kind="authority" />
          <MessageSection title="Additional" records={packet.additionals} kind="additional" />
        </div>
      )}
    </section>
  );
}
