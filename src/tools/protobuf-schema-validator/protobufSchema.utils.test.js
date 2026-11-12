import { describe, expect, it } from 'vitest';
import { validateProtobufSchema } from './protobufSchema.utils.js';

describe('validateProtobufSchema', () => {
  it('accepts proto3 schemas with imports, maps, oneofs, nested types, and services', () => {
    const result = validateProtobufSchema(`
      syntax = "proto3";
      package example.v1;
      import public "google/protobuf/timestamp.proto";
      message User {
        reserved 7 to 9, "old_name";
        string id = 1 [json_name = "userId"];
        map<string, string> labels = 2;
        oneof contact { string email = 3; string phone = 4; }
        message Address { string city = 1; }
        enum State { STATE_UNKNOWN = 0; STATE_ACTIVE = 1; }
      }
      service UserService {
        rpc GetUser (GetUserRequest) returns (stream User);
      }
    `);

    expect(result).toEqual({ errors: [], isValid: true });
  });

  it('reports duplicate field numbers with a qualified field path', () => {
    const result = validateProtobufSchema('message Foo { string bar = 2; int32 baz = 2; }');

    expect(result.errors).toContain('message Foo.field baz: duplicate field number 2');
  });

  it('rejects Protocol Buffers reserved field-number range', () => {
    const result = validateProtobufSchema('message Foo { string bar = 19000; }');

    expect(result.errors).toContain(
      'message Foo.field bar: field number 19000 is reserved by Protocol Buffers'
    );
  });

  it('honors reserved field numbers and names', () => {
    const result = validateProtobufSchema(`
      message Foo {
        reserved 2 to 4, "legacy";
        string legacy = 1;
        string active = 3;
      }
    `);

    expect(result.errors).toContain('message Foo.field legacy: field name is reserved');
    expect(result.errors).toContain('message Foo.field active: field number 3 is reserved');
  });

  it('honors reserved declarations that follow a field', () => {
    const result = validateProtobufSchema(
      'message Foo { string legacy = 2; reserved 2, "legacy"; }'
    );

    expect(result.errors).toContain('message Foo.field legacy: field name is reserved');
    expect(result.errors).toContain('message Foo.field legacy: field number 2 is reserved');
  });

  it('requires the first proto3 enum entry to be zero', () => {
    const result = validateProtobufSchema('syntax = "proto3"; enum State { ACTIVE = 1; }');

    expect(result.errors).toContain('enum State: first enum value must be 0 in proto3');
  });

  it('reports malformed syntax with source location', () => {
    const result = validateProtobufSchema('message Foo { string name = ; }');

    expect(result.isValid).toBe(false);
    expect(result.errors[0]).toMatch(
      /^message Foo.field name: expected number at line 1, column 29$/
    );
  });
});
