import { describe, expect, it } from 'vitest';
import { validateAvroSchema } from './avroSchema.utils.js';

function validate(schema) {
  return validateAvroSchema(JSON.stringify(schema));
}

describe('validateAvroSchema', () => {
  it('accepts primitive schemas and a union', () => {
    expect(validateAvroSchema('"string"')).toMatchObject({ valid: true, errors: [] });
    expect(validate(['null', 'string'])).toMatchObject({ valid: true, errors: [] });
    expect(validate({ type: ['null', 'string'] })).toMatchObject({ valid: true, errors: [] });
  });

  it('accepts records, enums, arrays, fixed values, logical types, and named references', () => {
    const schema = {
      type: 'record', name: 'Envelope', namespace: 'example', fields: [
        { name: 'createdAt', type: { type: 'long', logicalType: 'timestamp-millis' } },
        { name: 'status', type: { type: 'enum', name: 'Status', symbols: ['NEW', 'DONE'] } },
        { name: 'history', type: { type: 'array', items: 'Status' } },
        { name: 'labels', type: { type: 'map', values: 'string' } },
        { name: 'checksum', type: { type: 'fixed', name: 'Checksum', size: 16 } },
      ],
    };
    expect(validate(schema)).toMatchObject({ valid: true, errors: [] });
  });

  it('reports malformed JSON', () => {
    expect(validateAvroSchema('{')).toMatchObject({ valid: false });
    expect(validateAvroSchema('{').errors[0]).toMatch(/Malformed JSON/);
  });

  it('reports an invalid type name and an unresolved reference', () => {
    expect(validate({ type: 'unknown-type' }).errors.join(' '))
      .toMatch(/Unresolved named-type reference/);
    expect(validate({ type: 'record', name: 'Root', fields: [{ name: 'item', type: 'Later' }] })
      .errors.join(' ')).toMatch(/Unresolved named-type reference "Later"/);
  });

  it('reports missing names and duplicate fields', () => {
    const missingName = validate({ type: 'record', fields: [] });
    expect(missingName.errors.join(' ')).toMatch(/record name/);

    const duplicate = validate({
      type: 'record', name: 'Root', fields: [
        { name: 'same', type: 'string' }, { name: 'same', type: 'long' },
      ],
    });
    expect(duplicate.errors.join(' ')).toMatch(/Duplicate field name "same"/);
    expect(validate({}).errors.join(' ')).toMatch(/missing required property "type"/);
  });
});
