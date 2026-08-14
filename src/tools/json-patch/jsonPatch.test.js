import { describe, expect, it } from "vitest";
import {
  applyJsonPatch,
  generateJsonPatch,
  parseJsonPointer,
  resolveJsonPointer,
} from "./jsonPatch.utils.js";

describe("parseJsonPointer", () => {
  it("accepts the root, empty member tokens, URI fragments, and ordered escapes", () => {
    expect(parseJsonPointer("")).toEqual({ tokens: [], error: null });
    expect(parseJsonPointer("/")).toEqual({ tokens: [""], error: null });
    expect(parseJsonPointer("#/a%2Fb")).toEqual({
      tokens: ["a", "b"],
      error: null,
    });
    expect(parseJsonPointer("/~01")).toEqual({ tokens: ["~1"], error: null });
  });

  it("returns descriptive errors for malformed pointers without throwing", () => {
    expect(parseJsonPointer("a/b").error.message).toMatch(/begin/i);
    expect(parseJsonPointer("/bad~2escape").error.message).toMatch(/escape/i);
    expect(parseJsonPointer("#%E0%A4%A").error.message).toMatch(/percent/i);
  });
});

describe("resolveJsonPointer", () => {
  it("resolves escaped object keys and distinguishes misses from malformed array indices", () => {
    const document = { "a/b": 1, "m~n": 2, "~1": 9, a: [10, 20] };
    expect(resolveJsonPointer(document, "/a~1b")).toMatchObject({
      found: true,
      value: 1,
    });
    expect(resolveJsonPointer(document, "/m~0n")).toMatchObject({
      found: true,
      value: 2,
    });
    expect(resolveJsonPointer(document, "/~01")).toMatchObject({
      found: true,
      value: 9,
    });
    expect(resolveJsonPointer(document, "/a/01").error.message).toMatch(
      /array index/i,
    );
    expect(resolveJsonPointer(document, "/a/5")).toEqual({
      found: false,
      value: undefined,
      error: null,
    });
    expect(resolveJsonPointer(document, "/a/-")).toEqual({
      found: false,
      value: undefined,
      error: null,
    });
  });

  it("treats descent into scalars as a well-formed miss", () => {
    expect(resolveJsonPointer({ a: [10] }, "/a/0/x")).toEqual({
      found: false,
      value: undefined,
      error: null,
    });
  });
});

describe("applyJsonPatch", () => {
  it("adds array values at an index or append marker and rejects out-of-range indexes", () => {
    expect(
      applyJsonPatch({ a: [1, 2] }, [{ op: "add", path: "/a/-", value: 3 }]),
    ).toMatchObject({
      ok: true,
      document: { a: [1, 2, 3] },
    });
    expect(
      applyJsonPatch({ a: [1, 2] }, [{ op: "add", path: "/a/2", value: 3 }]),
    ).toMatchObject({
      ok: true,
      document: { a: [1, 2, 3] },
    });
    expect(
      applyJsonPatch({ a: [1, 2] }, [{ op: "add", path: "/a/3", value: 3 }]),
    ).toMatchObject({
      ok: false,
      error: { index: 0 },
    });
  });

  it("is atomic and never mutates its input after a later operation fails", () => {
    const document = { a: [1, 2] };
    const pristine = structuredClone(document);
    const result = applyJsonPatch(document, [
      { op: "add", path: "/x", value: 1 },
      { op: "remove", path: "/nope" },
    ]);
    expect(result).toMatchObject({ ok: false, document, error: { index: 1 } });
    expect(document).toEqual(pristine);
    expect(result.document).toBe(document);
  });

  it("uses JSON structural equality for test operations", () => {
    expect(
      applyJsonPatch({ n: 1, o: { b: 2, a: 1 } }, [
        { op: "test", path: "/n", value: 1.0 },
        { op: "test", path: "/o", value: { a: 1, b: 2 } },
      ]),
    ).toMatchObject({ ok: true });
    expect(
      applyJsonPatch({ n: 1 }, [{ op: "test", path: "/n", value: 2 }]),
    ).toMatchObject({
      ok: false,
      error: { index: 0 },
    });
  });

  it("supports moves, rejects moves into children, and handles root replacements", () => {
    expect(
      applyJsonPatch({ a: { value: 1 } }, [
        { op: "move", from: "/a", path: "/b" },
      ]),
    ).toMatchObject({ ok: true, document: { b: { value: 1 } } });
    expect(
      applyJsonPatch({ a: { b: 1 } }, [
        { op: "move", from: "/a", path: "/a/b" },
      ]),
    ).toMatchObject({ ok: false, error: { index: 0 } });
    expect(
      applyJsonPatch({ a: 1 }, [{ op: "replace", path: "", value: [1, 2] }]),
    ).toMatchObject({ ok: true, document: [1, 2] });
    expect(
      applyJsonPatch({ a: 1 }, [{ op: "remove", path: "" }]),
    ).toMatchObject({
      ok: false,
      error: { index: 0 },
    });
  });

  it("validates malformed patch shapes and returns operation indexes without throwing", () => {
    expect(applyJsonPatch({}, null)).toMatchObject({
      ok: false,
      error: { index: -1 },
    });
    expect(applyJsonPatch({}, [{ op: "unknown", path: "/a" }])).toMatchObject({
      ok: false,
      error: { index: 0 },
    });
    expect(applyJsonPatch({}, [{ op: "add", path: "/a" }])).toMatchObject({
      ok: false,
      error: { index: 0 },
    });
    expect(applyJsonPatch({}, [{ op: "move", path: "/a" }])).toMatchObject({
      ok: false,
      error: { index: 0 },
    });
    expect(applyJsonPatch({}, [null])).toMatchObject({
      ok: false,
      error: { index: 0 },
    });
  });

  it("copies independently and supports add, remove, and replace object members", () => {
    const result = applyJsonPatch({ a: { nested: true }, old: 1 }, [
      { op: "copy", from: "/a", path: "/b" },
      { op: "replace", path: "/a/nested", value: false },
      { op: "remove", path: "/old" },
    ]);
    expect(result).toMatchObject({
      ok: true,
      document: { a: { nested: false }, b: { nested: true } },
    });
  });
});

describe("generateJsonPatch", () => {
  it("round-trips fixtures including arrays, escaped keys, roots, and null members", () => {
    const fixtures = [
      [
        { user: { name: "Ada", active: true } },
        { user: { name: "Grace", tags: ["dev"] } },
      ],
      [
        [1, 2],
        [1, 9, 2],
      ],
      [
        [1, 2, 3],
        [1, 3],
      ],
      [{ "a/b": 1 }, { "a/b": 2, plain: true }],
      [{ "m~n": 1 }, { "m~n": { value: 2 } }],
      [{ value: 1 }, ["root", "type", "change"]],
      [
        { nullable: null, present: true },
        { nullable: null, added: false },
      ],
    ];
    fixtures.forEach(([source, target]) => {
      const patch = generateJsonPatch(source, target);
      expect(applyJsonPatch(source, patch)).toEqual({
        ok: true,
        document: target,
        error: null,
      });
    });
  });

  it("uses correctly escaped machine-applicable pointer paths", () => {
    expect(
      generateJsonPatch({ "a/b": 1, "m~n": 1 }, { "a/b": 2, "m~n": 3 }),
    ).toEqual([
      { op: "replace", path: "/a~1b", value: 2 },
      { op: "replace", path: "/m~0n", value: 3 },
    ]);
  });
});
