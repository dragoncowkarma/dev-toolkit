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
    expect(formatGraphQL('query GetUser($id:ID!,$include:Boolean!=true){user:node(id:$id)@include(if:$include){id}}')).toBe(
      'query GetUser($id: ID!, $include: Boolean! = true) {\n  user: node(id: $id)@include(if: $include) {\n    id\n  }\n}'
    );
  });

  it('formats named fragments, inline fragments, and fragment spreads', () => {
    const input = 'fragment UserFields on User{id name}query{node(id:"1"){...UserFields ...on Admin{permissions}}}';
    expect(formatGraphQL(input)).toBe(
      'fragment UserFields on User {\n  id\n  name\n}\nquery {\n  node(id: "1") {\n    ...UserFields\n    ... on Admin {\n      permissions\n    }\n  }\n}'
    );
  });

  it('formats multiple operations and SDL definitions', () => {
    expect(formatGraphQL('query One{a}subscription Updates{changed{id}}type User{id:ID!}')).toBe(
      'query One {\n  a\n}\nsubscription Updates {\n  changed {\n    id\n  }\n}\ntype User {\n  id: ID!\n}'
    );
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
