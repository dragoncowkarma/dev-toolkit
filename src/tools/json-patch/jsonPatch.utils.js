const ARRAY_INDEX_PATTERN = /^(0|[1-9][0-9]*)$/;
const PATCH_OPERATIONS = new Set([
  "add",
  "remove",
  "replace",
  "move",
  "copy",
  "test",
]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cloneJson(value) {
  if (Array.isArray(value)) return value.map(cloneJson);
  if (!isObject(value)) return value;
  return Object.keys(value).reduce((clone, key) => {
    clone[key] = cloneJson(value[key]);
    return clone;
  }, {});
}

function equalJson(first, second) {
  if (Object.is(first, second)) return true;
  if (typeof first !== typeof second || first === null || second === null)
    return false;
  if (typeof first !== "object") return false;
  if (Array.isArray(first) || Array.isArray(second)) {
    return (
      Array.isArray(first) &&
      Array.isArray(second) &&
      first.length === second.length &&
      first.every((value, index) => equalJson(value, second[index]))
    );
  }
  const firstKeys = Object.keys(first);
  const secondKeys = Object.keys(second);
  return (
    firstKeys.length === secondKeys.length &&
    firstKeys.every(
      (key) => Object.hasOwn(second, key) && equalJson(first[key], second[key]),
    )
  );
}

function pointerError(message) {
  return { message };
}

function parseTokens(pointer) {
  const parsed = parseJsonPointer(pointer);
  if (parsed.error) return { tokens: [], error: parsed.error };
  return { tokens: parsed.tokens, error: null };
}

function resolveTokens(document, tokens) {
  let current = document;
  for (const token of tokens) {
    if (Array.isArray(current)) {
      if (token === "-") return { found: false, value: undefined, error: null };
      if (!ARRAY_INDEX_PATTERN.test(token)) {
        return {
          found: false,
          value: undefined,
          error: pointerError(`Invalid array index "${token}".`),
        };
      }
      const index = Number(token);
      if (index >= current.length)
        return { found: false, value: undefined, error: null };
      current = current[index];
      continue;
    }
    if (isObject(current)) {
      if (!Object.hasOwn(current, token))
        return { found: false, value: undefined, error: null };
      current = current[token];
      continue;
    }
    return { found: false, value: undefined, error: null };
  }
  return { found: true, value: current, error: null };
}

function parseOperationPointer(operation, property) {
  const parsed = parseTokens(operation[property]);
  if (parsed.error) return parsed;
  return { tokens: parsed.tokens, error: null };
}

function operationFailure(message, index) {
  return { ok: false, error: { message, index } };
}

function targetFailure(label, resolution, index) {
  if (resolution.error)
    return operationFailure(`${label}: ${resolution.error.message}`, index);
  return operationFailure(`${label} does not exist.`, index);
}

function resolveParent(document, tokens) {
  if (tokens.length === 0)
    return { found: false, value: undefined, error: null };
  return resolveTokens(document, tokens.slice(0, -1));
}

function addAtPath(document, tokens, value, index) {
  if (tokens.length === 0) return { ok: true, document: cloneJson(value) };
  const parent = resolveParent(document, tokens);
  if (!parent.found || parent.error)
    return targetFailure("Add target parent", parent, index);
  const token = tokens[tokens.length - 1];
  if (Array.isArray(parent.value)) {
    if (token === "-")
      return { ok: true, document: addToArray(document, tokens, value) };
    if (!ARRAY_INDEX_PATTERN.test(token)) {
      return operationFailure(`Invalid array index "${token}" for add.`, index);
    }
    if (Number(token) > parent.value.length) {
      return operationFailure(
        `Add array index "${token}" is out of range.`,
        index,
      );
    }
    return { ok: true, document: addToArray(document, tokens, value) };
  }
  if (isObject(parent.value)) {
    parent.value[token] = cloneJson(value);
    return { ok: true, document };
  }
  return operationFailure("Add target parent is not a container.", index);
}

function addToArray(document, tokens, value) {
  const parent = resolveParent(document, tokens).value;
  const token = tokens[tokens.length - 1];
  const insertionIndex = token === "-" ? parent.length : Number(token);
  parent.splice(insertionIndex, 0, cloneJson(value));
  return document;
}

function removeAtPath(document, tokens, index) {
  if (tokens.length === 0)
    return operationFailure("Cannot remove the document root.", index);
  const target = resolveTokens(document, tokens);
  if (!target.found || target.error)
    return targetFailure("Remove target", target, index);
  const parent = resolveParent(document, tokens).value;
  const token = tokens[tokens.length - 1];
  if (Array.isArray(parent)) parent.splice(Number(token), 1);
  else delete parent[token];
  return { ok: true, document };
}

function replaceAtPath(document, tokens, value, index) {
  if (tokens.length === 0) return { ok: true, document: cloneJson(value) };
  const target = resolveTokens(document, tokens);
  if (!target.found || target.error)
    return targetFailure("Replace target", target, index);
  const parent = resolveParent(document, tokens).value;
  const token = tokens[tokens.length - 1];
  if (Array.isArray(parent)) parent[Number(token)] = cloneJson(value);
  else parent[token] = cloneJson(value);
  return { ok: true, document };
}

function isProperPrefix(prefix, whole) {
  return (
    prefix.length < whole.length &&
    prefix.every((token, index) => token === whole[index])
  );
}

function validateOperation(operation, index) {
  if (!isObject(operation))
    return operationFailure("Operation must be an object.", index);
  if (!PATCH_OPERATIONS.has(operation.op)) {
    return operationFailure(
      `Unknown operation "${String(operation.op)}".`,
      index,
    );
  }
  if (typeof operation.path !== "string")
    return operationFailure("Operation path must be a string.", index);
  if (
    ["add", "replace", "test"].includes(operation.op) &&
    !Object.hasOwn(operation, "value")
  ) {
    return operationFailure(
      `Operation "${operation.op}" requires a value.`,
      index,
    );
  }
  if (
    ["move", "copy"].includes(operation.op) &&
    typeof operation.from !== "string"
  ) {
    return operationFailure(
      `Operation "${operation.op}" requires a from pointer.`,
      index,
    );
  }
  return null;
}

function applyOperation(document, operation, index) {
  const path = parseOperationPointer(operation, "path");
  if (path.error)
    return operationFailure(`Invalid path: ${path.error.message}`, index);
  if (operation.op === "add")
    return addAtPath(document, path.tokens, operation.value, index);
  if (operation.op === "remove")
    return removeAtPath(document, path.tokens, index);
  if (operation.op === "replace")
    return replaceAtPath(document, path.tokens, operation.value, index);
  if (operation.op === "test") {
    const target = resolveTokens(document, path.tokens);
    if (!target.found || target.error)
      return targetFailure("Test target", target, index);
    if (!equalJson(target.value, operation.value)) {
      return operationFailure(
        "Test operation did not match the target value.",
        index,
      );
    }
    return { ok: true, document };
  }
  const from = parseOperationPointer(operation, "from");
  if (from.error)
    return operationFailure(
      `Invalid from pointer: ${from.error.message}`,
      index,
    );
  const source = resolveTokens(document, from.tokens);
  if (!source.found || source.error)
    return targetFailure("From target", source, index);
  if (operation.op === "copy")
    return addAtPath(document, path.tokens, source.value, index);
  if (isProperPrefix(from.tokens, path.tokens)) {
    return operationFailure(
      "Cannot move a value into one of its children.",
      index,
    );
  }
  if (
    from.tokens.every(
      (token, tokenIndex) => token === path.tokens[tokenIndex],
    ) &&
    from.tokens.length === path.tokens.length
  ) {
    return { ok: true, document };
  }
  const removed = removeAtPath(document, from.tokens, index);
  if (!removed.ok) return removed;
  return addAtPath(removed.document, path.tokens, source.value, index);
}

function escapeToken(token) {
  return token.replaceAll("~", "~0").replaceAll("/", "~1");
}

function appendPointer(path, token) {
  return `${path}/${escapeToken(token)}`;
}

function generateOperations(source, target, path, operations) {
  if (equalJson(source, target)) return;
  if (Array.isArray(source) && Array.isArray(target)) {
    const sharedLength = Math.min(source.length, target.length);
    for (let index = 0; index < sharedLength; index += 1) {
      generateOperations(
        source[index],
        target[index],
        appendPointer(path, String(index)),
        operations,
      );
    }
    for (let index = source.length - 1; index >= target.length; index -= 1) {
      operations.push({
        op: "remove",
        path: appendPointer(path, String(index)),
      });
    }
    for (let index = source.length; index < target.length; index += 1) {
      operations.push({
        op: "add",
        path: appendPointer(path, String(index)),
        value: cloneJson(target[index]),
      });
    }
    return;
  }
  if (isObject(source) && isObject(target)) {
    Object.keys(source)
      .sort()
      .forEach((key) => {
        if (!Object.hasOwn(target, key))
          operations.push({ op: "remove", path: appendPointer(path, key) });
      });
    Object.keys(target)
      .sort()
      .forEach((key) => {
        const nextPath = appendPointer(path, key);
        if (!Object.hasOwn(source, key))
          operations.push({
            op: "add",
            path: nextPath,
            value: cloneJson(target[key]),
          });
        else generateOperations(source[key], target[key], nextPath, operations);
      });
    return;
  }
  operations.push({ op: "replace", path, value: cloneJson(target) });
}

/**
 * Parses an RFC 6901 JSON Pointer or URI-fragment pointer without throwing.
 *
 * @param {string} pointer - A JSON Pointer string, optionally in URI-fragment form.
 * @returns {{tokens: string[], error: {message: string} | null}}
 * Parsed reference tokens or an error.
 */
export function parseJsonPointer(pointer) {
  if (typeof pointer !== "string")
    return { tokens: [], error: pointerError("Pointer must be a string.") };
  let decodedPointer = pointer;
  if (pointer.startsWith("#")) {
    try {
      decodedPointer = decodeURIComponent(pointer.slice(1));
    } catch {
      return {
        tokens: [],
        error: pointerError(
          "URI-fragment pointer contains invalid percent encoding.",
        ),
      };
    }
  }
  if (decodedPointer === "") return { tokens: [], error: null };
  if (!decodedPointer.startsWith("/")) {
    return {
      tokens: [],
      error: pointerError('A non-empty pointer must begin with "/".'),
    };
  }
  const rawTokens = decodedPointer.slice(1).split("/");
  for (const token of rawTokens) {
    if (/(~[^01]|~$)/.test(token)) {
      return {
        tokens: [],
        error: pointerError(`Invalid escape sequence in token "${token}".`),
      };
    }
  }
  return {
    tokens: rawTokens.map((token) =>
      token.replaceAll("~1", "/").replaceAll("~0", "~"),
    ),
    error: null,
  };
}

/**
 * Resolves a JSON Pointer to exactly one location, distinguishing malformed pointers from misses.
 *
 * @param {*} document - The JSON value to address.
 * @param {string} pointer - An RFC 6901 JSON Pointer or URI-fragment pointer.
 * @returns {{found: boolean, value: *, error: {message: string} | null}} Resolution outcome.
 */
export function resolveJsonPointer(document, pointer) {
  const parsed = parseTokens(pointer);
  if (parsed.error)
    return { found: false, value: undefined, error: parsed.error };
  return resolveTokens(document, parsed.tokens);
}

/**
 * Applies RFC 6902 operations atomically. Failed patches return the original document unchanged.
 *
 * @param {*} document - The source JSON value.
 * @param {Array<object>} operations - RFC 6902 operation objects.
 * @returns {{ok: boolean, document: *, error: {message: string, index: number} | null}} Outcome.
 */
export function applyJsonPatch(document, operations) {
  if (!Array.isArray(operations))
    return { ...operationFailure("Patch must be an array.", -1), document };
  for (let index = 0; index < operations.length; index += 1) {
    const validationError = validateOperation(operations[index], index);
    if (validationError) return { ...validationError, document };
  }
  let workingDocument = cloneJson(document);
  for (let index = 0; index < operations.length; index += 1) {
    const outcome = applyOperation(workingDocument, operations[index], index);
    if (!outcome.ok) return { ...outcome, document };
    workingDocument = outcome.document;
  }
  return { ok: true, document: workingDocument, error: null };
}

/**
 * Produces an RFC 6902 add/remove/replace patch that transforms source into target.
 *
 * @param {*} source - The original JSON value.
 * @param {*} target - The desired JSON value.
 * @returns {Array<object>} A machine-applicable RFC 6902 patch.
 */
export function generateJsonPatch(source, target) {
  const operations = [];
  generateOperations(source, target, "", operations);
  return operations;
}
