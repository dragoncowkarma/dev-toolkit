import { useMemo, useState } from 'react';
import { parseVCards } from './vcardParser.utils.js';
import './vcardParser.css';

function formatName(name) {
  return [name.prefix, name.given, name.additional, name.family, name.suffix]
    .filter(Boolean)
    .join(' ');
}

function Detail({ label, children }) {
  return <><dt>{label}</dt><dd>{children}</dd></>;
}

function VCardResult({ card, index }) {
  const label = card.fullName || (card.name && formatName(card.name)) || `vCard ${index + 1}`;
  const valid = card.errors.length === 0;
  return (
    <article className="vcard-result" aria-label={`vCard ${index + 1}: ${label}`}>
      <header className="vcard-result__header">
        <div>
          <p className="vcard-result__eyebrow">vCard {index + 1}</p>
          <h3>{label}</h3>
        </div>
        <span
          className={`vcard-result__badge ${valid ? 'vcard-result__badge--valid' : ''}`}
        >
          {valid ? 'Valid' : 'Needs attention'}
        </span>
      </header>
      {card.errors.length > 0 && (
        <ul className="vcard-result__messages" role="alert">
          {card.errors.map((error) => <li key={error}>{error}</li>)}
        </ul>
      )}
      {card.warnings.length > 0 && (
        <ul className="vcard-result__messages vcard-result__messages--warning">
          {card.warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      )}
      <dl className="vcard-result__details">
        <Detail label="Version">{card.version || 'Not found'}</Detail>
        {card.name && (
          <Detail label="Structured name">{formatName(card.name) || 'Empty'}</Detail>
        )}
        {card.organization.length > 0 && (
          <Detail label="Organization">{card.organization.filter(Boolean).join(' · ')}</Detail>
        )}
        {card.title && <Detail label="Title">{card.title}</Detail>}
        {card.phones.length > 0 && (
          <Detail label="Phone">
            {card.phones.map(({ value, types }) => (
              <span key={`${value}-${types.join()}`} className="vcard-result__item">
                {value}{types.length > 0 && ` (${types.join(', ')})`}
              </span>
            ))}
          </Detail>
        )}
        {card.emails.length > 0 && (
          <Detail label="Email">
            {card.emails.map(({ value, types }) => (
              <span key={`${value}-${types.join()}`} className="vcard-result__item">
                {value}{types.length > 0 && ` (${types.join(', ')})`}
              </span>
            ))}
          </Detail>
        )}
        {card.addresses.length > 0 && (
          <Detail label="Address">
            {card.addresses.map((address, addressIndex) => (
              <span key={addressIndex} className="vcard-result__item">
                {[
                  address.street,
                  address.locality,
                  address.region,
                  address.postalCode,
                  address.country,
                ]
                  .filter(Boolean)
                  .join(', ') || 'Empty address'}
                {address.types.length > 0 && ` (${address.types.join(', ')})`}
              </span>
            ))}
          </Detail>
        )}
        {card.urls.length > 0 && (
          <Detail label="URL">
            {card.urls.map((url) => <span key={url} className="vcard-result__item">{url}</span>)}
          </Detail>
        )}
        {card.birthday && <Detail label="Birthday">{card.birthday}</Detail>}
        {card.notes.length > 0 && (
          <Detail label="Note">
            {card.notes.map((note) => (
              <span key={note} className="vcard-result__item">{note}</span>
            ))}
          </Detail>
        )}
        {card.photos.length > 0 && (
          <Detail label="Photo">
            {card.photos.map((photo, photoIndex) => (
              <span key={photoIndex} className="vcard-result__item">
                {photo.external ? 'External reference (not loaded)' : 'Embedded photo detected'}
              </span>
            ))}
          </Detail>
        )}
      </dl>
    </article>
  );
}

/**
 * Renders an in-browser vCard parser and validator.
 * @returns {React.JSX.Element} The vCard parser UI.
 */
export default function VCardParserTool() {
  const [input, setInput] = useState('');
  const cards = useMemo(() => (input.trim() ? parseVCards(input) : []), [input]);
  const validCount = cards.filter((card) => card.errors.length === 0).length;

  return (
    <section className="vcard-parser" aria-label="vCard Parser Tool">
      <div className="vcard-parser__intro">
        <div>
          <h2>vCard Parser</h2>
          <p>Parse VCF contacts locally. No contact data leaves your browser.</p>
        </div>
        <button
          type="button"
          className="vcard-parser__clear"
          onClick={() => setInput('')}
          disabled={!input}
        >
          Clear
        </button>
      </div>
      <label className="vcard-parser__label" htmlFor="vcard-input">
        VCF content
      </label>
      <textarea
        id="vcard-input"
        className="vcard-parser__input"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder={'BEGIN:VCARD\nVERSION:4.0\nFN:Alex Example\nEND:VCARD'}
        spellCheck={false}
      />
      {input.trim() && (
        <p className="vcard-parser__status" role="status" aria-live="polite">
          {validCount} of {cards.length} {cards.length === 1 ? 'card' : 'cards'} valid
        </p>
      )}
      {cards.length > 0 && (
        <div className="vcard-parser__results">
          {cards.map((card, index) => (
            <VCardResult
              key={`${index}-${card.rawLines.join('\n')}`}
              card={card}
              index={index}
            />
          ))}
        </div>
      )}
    </section>
  );
}
