/* eslint-disable max-len */
import { describe, expect, it } from 'vitest';
import { parseParquetFooter } from './parquet.utils.js';

const TYPE = { STOP: 0, I32: 5, I64: 6, BINARY: 8, LIST: 9, STRUCT: 12 };
function varint(value) { const output = []; let remaining = BigInt(value); do { let next = Number(remaining & 127n); remaining >>= 7n; if (remaining) next |= 128; output.push(next); } while (remaining); return output; }
function integer(value) { const number = BigInt(value); return varint((number << 1n) ^ (number >> 63n)); }
function binary(value) { const encoded = new TextEncoder().encode(value); return [...varint(encoded.length), ...encoded]; }
function field(id, type, value, previous = 0) { const delta = id - previous; return [delta > 0 && delta <= 15 ? delta << 4 | type : type, ...(delta > 0 && delta <= 15 ? [] : varint(id)), ...value]; }
function struct(fields) { let previous = 0; const output = []; fields.forEach(([id, type, value]) => { output.push(...field(id, type, value, previous)); previous = id; }); return [...output, TYPE.STOP]; }
function list(type, values) { return [values.length < 15 ? values.length << 4 | type : 0xf0 | type, ...(values.length < 15 ? [] : varint(values.length)), ...values.flat()]; }
function footer(metadata) { const magic = [80, 65, 82, 49]; const view = new DataView(new ArrayBuffer(4)); view.setUint32(0, metadata.length, true); return Uint8Array.from([...magic, ...metadata, ...new Uint8Array(view.buffer), ...magic]).buffer; }
function schema(name, type, repetition, children = 0) { const fields = [[3, TYPE.I32, integer(repetition)], [4, TYPE.BINARY, binary(name)], [5, TYPE.I32, integer(children)]]; if (type !== undefined) fields.unshift([1, TYPE.I32, integer(type)]); return struct(fields); }
function minimalFooter() {
  const columnMetadata = struct([[2, TYPE.LIST, list(TYPE.I32, [integer(0), integer(2)])], [4, TYPE.I32, integer(6)], [6, TYPE.I64, integer(15)], [7, TYPE.I64, integer(10)]]);
  const chunk = struct([[3, TYPE.STRUCT, columnMetadata]]);
  const group = struct([[1, TYPE.LIST, list(TYPE.STRUCT, [chunk])], [2, TYPE.I64, integer(15)], [3, TYPE.I64, integer(2)]]);
  return footer(struct([[1, TYPE.I32, integer(2)], [2, TYPE.LIST, list(TYPE.STRUCT, [schema('schema', undefined, 0, 1), schema('items', 1, 2)])], [3, TYPE.I64, integer(2)], [4, TYPE.LIST, list(TYPE.STRUCT, [group])], [6, TYPE.BINARY, binary('unit-test')]]));
}

describe('parseParquetFooter', () => {
  it('parses schema, row group, and column metadata from a valid footer', () => {
    const result = parseParquetFooter(minimalFooter());
    expect(result.error).toBeNull();
    expect(result.metadata).toMatchObject({ version: 2, createdBy: 'unit-test', numRows: 2 });
    expect(result.metadata.schema.children[0]).toMatchObject({ name: 'items', type: 'INT32', repetition: 'REPEATED', nesting: 1 });
    expect(result.metadata.rowGroups[0]).toMatchObject({ totalByteSize: 15, numRows: 2 });
    expect(result.metadata.rowGroups[0].columnChunks[0]).toMatchObject({ codec: 'ZSTD', encodings: ['PLAIN', 'RLE'], compressedSize: 10, uncompressedSize: 15 });
  });

  it('reports missing magic without throwing', () => {
    const data = new Uint8Array(minimalFooter()); data[0] = 0;
    expect(parseParquetFooter(data.buffer).error).toBe('Missing leading PAR1 magic bytes.');
  });

  it('reports a footer length outside the file', () => {
    const data = new Uint8Array(minimalFooter()); data[data.length - 8] = 255;
    expect(parseParquetFooter(data.buffer).error).toBe('Footer length points outside the file.');
  });

  it('reports truncated compact footer fields without throwing', () => {
    const data = new Uint8Array(minimalFooter());
    const shortened = data.slice(0, data.length - 10);
    expect(parseParquetFooter(shortened.buffer).error).toBeTruthy();
  });
});
