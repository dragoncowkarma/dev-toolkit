import { describe, expect, it } from 'vitest';
import { formatGraphQL, minifyGraphQL } from './graphqlFormatter.utils.js';

describe('GraphQL formatter', () => {
  it('formats simple and nested queries with the selected indent width', () => {
    expect(formatGraphQL('query{viewer{id profile{name}}}')).toBe(
      'query {\n  viewer {\n    id\n    profile {\n      name\n    }\n  }\n}'
    );
    expect(formatGraphQL('query{viewer{id}}', { indentSize: 4 })).toBe(
      'query {\n    viewer {\n        id\n    }\n}'
    );
  });

  it('preserves variables, directives, aliases, and arguments', () => {
    const input =
      'query GetUser($id:ID!,$include:Boolean!=true){user:node(id:$id)@include(if:$include){id}}';
    const expected = [
      'query GetUser($id: ID!, $include: Boolean! = true) {',
      '  user: node(id: $id)@include(if: $include) {',
      '    id',
      '  }',
      '}',
    ].join('\n');
    expect(formatGraphQL(input)).toBe(expected);
  });

  it('formats named fragments, inline fragments, and fragment spreads', () => {
    const input = [
      'fragment UserFields on User{id name}',
      'query{node(id:"1"){...UserFields ...on Admin{permissions}}}',
    ].join('');
    const expected = [
      'fragment UserFields on User {',
      '  id',
      '  name',
      '}',
      'query {',
      '  node(id: "1") {',
      '    ...UserFields',
      '    ... on Admin {',
      '      permissions',
      '    }',
      '  }',
      '}',
    ].join('\n');
    expect(formatGraphQL(input)).toBe(expected);
  });

  it('formats multiple operations and SDL definitions', () => {
    const input = 'query One{a}subscription Updates{changed{id}}type User{id:ID!}';
    const expected = [
      'query One {',
      '  a',
      '}',
      'subscription Updates {',
      '  changed {',
      '    id',
      '  }',
      '}',
      'type User {',
      '  id: ID!',
      '}',
    ].join('\n');
    expect(formatGraphQL(input)).toBe(expected);
  });

  it('minifies valid documents while keeping required token boundaries', () => {
    expect(minifyGraphQL('query Find ($id: ID!) {\n  user(id: $id) { name }\n}')).toBe(
      'query Find($id:ID!){user(id:$id){name}}'
    );
  });

  it('rejects malformed input with a useful syntax error', () => {
    expect(() => formatGraphQL('query { viewer { id }')).toThrow(/unclosed '\{'/i);
    expect(() => minifyGraphQL('query { name: ^ }')).toThrow(/unexpected '\^'/i);
  });
});
