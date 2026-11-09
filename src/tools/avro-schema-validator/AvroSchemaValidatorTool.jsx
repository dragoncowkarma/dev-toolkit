import { useMemo, useState } from 'react';
import { validateAvroSchema } from './avroSchema.utils.js';
import './avroSchemaValidator.css';

const EXAMPLE_SCHEMA = `{
  "type": "record",
  "name": "User",
  "namespace": "example.avro",
  "fields": [
    { "name": "id", "type": "long" },
    { "name": "email", "type": ["null", "string"], "default": null }
  ]
}`;

/**
 * Renders a client-side Avro schema validator.
 *
 * @returns {React.JSX.Element} The Avro schema validation tool.
 */
export default function AvroSchemaValidatorTool() {
  const [schemaText, setSchemaText] = useState(EXAMPLE_SCHEMA);
  const result = useMemo(() => validateAvroSchema(schemaText), [schemaText]);

  return (
    <section className="avro-schema-validator" aria-labelledby="avro-schema-validator-title">
      <div className="avro-schema-validator__heading">
        <div>
          <p className="avro-schema-validator__eyebrow">Client-side validation</p>
          <h2 id="avro-schema-validator-title">Avro Schema Validator</h2>
          <p>Validate Apache Avro schema JSON locally. Nothing is sent over the network.</p>
        </div>
        <button
          type="button"
          className="avro-schema-validator__button"
          onClick={() => setSchemaText(EXAMPLE_SCHEMA)}
        >
          Load example
        </button>
      </div>

      <label className="avro-schema-validator__label" htmlFor="avro-schema-input">
        Avro schema JSON
      </label>
      <textarea
        id="avro-schema-input"
        className="avro-schema-validator__textarea"
        value={schemaText}
        onChange={(event) => setSchemaText(event.target.value)}
        spellCheck={false}
        aria-describedby="avro-schema-result"
      />

      <div
        id="avro-schema-result"
        className={`avro-schema-validator__result ${result.valid ? 'is-valid' : 'is-invalid'}`}
        role={result.valid ? 'status' : 'alert'}
      >
        {result.valid ? (
          <span>Schema is valid.</span>
        ) : (
          <>
            <strong>
              Schema has {result.errors.length} error{result.errors.length === 1 ? '' : 's'}.
            </strong>
            <ul>
              {result.errors.map((error) => <li key={error}>{error}</li>)}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
