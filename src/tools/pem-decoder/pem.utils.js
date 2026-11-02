import { decodeBase64 } from '../asn1-decoder/asn1.utils.js';

const PEM_BOUNDARY = /-----BEGIN ([A-Z0-9][A-Z0-9 ]*)-----|-----END ([A-Z0-9][A-Z0-9 ]*)-----/g;

/**
 * Parses PEM armor into labels and decoded binary payloads.
 *
 * @param {string} input
 * @returns {Array<{label: string, bytes: Uint8Array}>}
 * @throws {Error} When PEM boundaries or a Base64 payload are malformed.
 */
export function parsePemBlocks(input) {
  if (typeof input !== 'string') throw new TypeError('PEM input must be a string.');

  PEM_BOUNDARY.lastIndex = 0;
  const blocks = [];
  let activeBlock = null;
  let previousEnd = 0;
  let boundary;

  while ((boundary = PEM_BOUNDARY.exec(input)) !== null) {
    const textBeforeBoundary = input.slice(previousEnd, boundary.index);
    if (!activeBlock && textBeforeBoundary.trim()) {
      throw new Error('PEM input contains text outside a BEGIN/END block.');
    }

    const beginLabel = boundary[1];
    const endLabel = boundary[2];
    if (beginLabel) {
      if (activeBlock) {
        throw new Error(`PEM block "${activeBlock.label}" is missing its END boundary.`);
      }
      activeBlock = { label: beginLabel, bodyStart: PEM_BOUNDARY.lastIndex };
    } else if (!activeBlock) {
      throw new Error(`Unexpected PEM END boundary for "${endLabel}".`);
    } else {
      if (activeBlock.label !== endLabel) {
        throw new Error(
          `PEM BEGIN label "${activeBlock.label}" does not match END label "${endLabel}".`
        );
      }
      const body = input.slice(activeBlock.bodyStart, boundary.index);
      if (!body.trim()) throw new Error(`PEM block "${activeBlock.label}" has no Base64 payload.`);
      try {
        blocks.push({ label: activeBlock.label, bytes: decodeBase64(body) });
      } catch {
        throw new Error(`PEM block "${activeBlock.label}" has invalid Base64 payload.`);
      }
      activeBlock = null;
    }
    previousEnd = PEM_BOUNDARY.lastIndex;
  }

  if (activeBlock) throw new Error(`PEM block "${activeBlock.label}" is missing its END boundary.`);
  if (input.slice(previousEnd).trim()) {
    throw new Error('PEM input contains text outside a BEGIN/END block.');
  }
  if (blocks.length === 0) throw new Error('Provide at least one PEM BEGIN/END block.');
  return blocks;
}
