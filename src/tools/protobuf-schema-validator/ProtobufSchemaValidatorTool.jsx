import { useMemo, useState } from 'react';
import { validateProtobufSchema } from './protobufSchema.utils.js';
import './protobufSchemaValidator.css';

const EXAMPLE_SCHEMA = `syntax = "proto3";
package example.v1;

message User {
  string id = 1;
  map<string, string> labels = 2;
  oneof contact {
    string email = 3;
    string phone = 4;
  }
}
`;

/**
 * Renders a browser-based Protocol Buffers schema validator.
 *
 * @returns {React.JSX.Element} The Protobuf schema validator UI.
 */
export default function ProtobufSchemaValidatorTool() {
  const [source, setSource] = useState(EXAMPLE_SCHEMA);
  const result = useMemo(() => validateProtobufSchema(source), [source]);
  const descriptionId = 'protobuf-schema-description';

  return (
    <section className="protobuf-validator" aria-labelledby="protobuf-schema-title">
      <div className="protobuf-validator__header">
        <div>
          <h2 id="protobuf-schema-title">Protocol Buffers Schema Validator</h2>
          <p id={descriptionId}>
            Validate .proto source syntax and common field constraints locally.
          </p>
        </div>
        <button type="button" className="protobuf-validator__button" onClick={() => setSource('')}>
          Clear
        </button>
      </div>

      <label className="protobuf-validator__label" htmlFor="protobuf-schema-input">
        Schema source
      </label>
      <textarea
        id="protobuf-schema-input"
        className="protobuf-validator__input"
        aria-describedby={descriptionId}
        value={source}
        onChange={(event) => setSource(event.target.value)}
        placeholder={'syntax = "proto3";\n\nmessage Example {\n  string name = 1;\n}'}
        spellCheck={false}
      />

      {source.trim() === '' ? (
        <div className="protobuf-validator__status" role="status">
          Enter a schema to validate it.
        </div>
      ) : result.isValid ? (
        <div className="protobuf-validator__success" role="status">
          Schema is valid.
        </div>
      ) : (
        <div className="protobuf-validator__errors" role="alert" aria-live="assertive">
          <strong>Schema validation failed</strong>
          <ul>
            {result.errors.map((error) => <li key={error}>{error}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}
