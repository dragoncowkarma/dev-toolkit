const RESERVED_FIELD_START = 19000;
const RESERVED_FIELD_END = 19999;

class SchemaSyntaxError extends Error {
  constructor(message, token, path) {
    super(`${path}: ${message} at line ${token.line}, column ${token.column}`);
  }
}

/**
 * Validates Protocol Buffers source syntax and field-number constraints.
 *
 * @param {string} source - The .proto source text to validate.
 * @returns {{ errors: string[], isValid: boolean }} Validation results.
 */
export function validateProtobufSchema(source) {
  if (typeof source !== 'string') {
    return { errors: ['schema: source must be a string'], isValid: false };
  }

  try {
    const parser = new ProtobufParser(tokenize(source));
    parser.parse();
    return { errors: parser.errors, isValid: parser.errors.length === 0 };
  } catch (error) {
    return { errors: [error.message], isValid: false };
  }
}

function tokenize(source) {
  const tokens = [];
  let index = 0;
  let line = 1;
  let column = 1;

  function advance() {
    const character = source[index++];
    if (character === '\n') {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
    return character;
  }

  while (index < source.length) {
    const character = source[index];
    if (/\s/.test(character)) {
      advance();
    } else if (source.startsWith('//', index)) {
      while (index < source.length && advance() !== '\n') {
        // Consume a line comment.
      }
    } else if (source.startsWith('/*', index)) {
      advance();
      advance();
      while (index < source.length && !source.startsWith('*/', index)) advance();
      if (index >= source.length) {
        throw new Error(`schema: unterminated block comment at line ${line}, column ${column}`);
      }
      advance();
      advance();
    } else if (character === '"' || character === "'") {
      const start = { line, column };
      const quote = advance();
      let value = '';
      while (index < source.length && source[index] !== quote) {
        if (source[index] === '\\') advance();
        value += advance();
      }
      if (index >= source.length) {
        throw new Error(
          `schema: unterminated string at line ${start.line}, column ${start.column}`
        );
      }
      advance();
      tokens.push({ type: 'string', value, ...start });
    } else if (/[A-Za-z_]/.test(character)) {
      const start = { line, column };
      let value = '';
      while (index < source.length && /[A-Za-z0-9_]/.test(source[index])) value += advance();
      tokens.push({ type: 'identifier', value, ...start });
    } else if (/[0-9-]/.test(character)) {
      const start = { line, column };
      let value = '';
      if (source[index] === '-') value += advance();
      while (index < source.length && /[0-9]/.test(source[index])) value += advance();
      if (value === '-') {
        throw new Error(`schema: unexpected '-' at line ${line}, column ${column}`);
      }
      tokens.push({ type: 'number', value, ...start });
    } else if ('{}()[]=;,.<>[]'.includes(character)) {
      tokens.push({ type: 'symbol', value: advance(), line, column: column - 1 });
    } else {
      throw new Error(`schema: unexpected '${character}' at line ${line}, column ${column}`);
    }
  }
  tokens.push({ type: 'eof', value: '', line, column });
  return tokens;
}

class ProtobufParser {
  constructor(tokens) {
    this.tokens = tokens;
    this.position = 0;
    this.syntax = 'proto2';
    this.errors = [];
  }

  parse() {
    while (!this.isEnd()) this.parseDeclaration('schema');
  }

  parseDeclaration(path) {
    if (this.consume('syntax')) {
      this.expect('=');
      const syntax = this.expectType('string', path);
      if (!['proto2', 'proto3'].includes(syntax.value)) {
        throw new SchemaSyntaxError('syntax must be proto2 or proto3', syntax, path);
      }
      this.syntax = syntax.value;
      this.expect(';', path);
    } else if (this.consume('package')) {
      this.parseQualifiedName(path);
      this.expect(';', path);
    } else if (this.consume('import')) {
      if (this.peek().value === 'weak' || this.peek().value === 'public') this.next();
      this.expectType('string', path);
      this.expect(';', path);
    } else if (this.consume('message')) {
      this.parseMessage(path);
    } else if (this.consume('enum')) {
      this.parseEnum(path);
    } else if (this.consume('service')) {
      this.parseService(path);
    } else if (this.consume('option')) {
      this.skipThroughSemicolon(path);
    } else {
      throw new SchemaSyntaxError(`unexpected '${this.peek().value}'`, this.peek(), path);
    }
  }

  parseMessage(parentPath) {
    const name = this.expectIdentifier(parentPath).value;
    const path = `${parentPath === 'schema' ? 'message' : `${parentPath}.message`} ${name}`;
    const state = {
      numbers: new Map(),
      names: new Set(),
      fields: [],
      reservedNumbers: [],
      reservedNames: new Set(),
    };
    this.expect('{', path);
    while (!this.consume('}')) {
      if (this.isEnd()) throw new SchemaSyntaxError('expected closing brace', this.peek(), path);
      if (this.consume('message')) this.parseMessage(path);
      else if (this.consume('enum')) this.parseEnum(path);
      else if (this.consume('oneof')) this.parseOneof(path, state);
      else if (this.consume('reserved')) this.parseReserved(path, state);
      else if (this.consume('option') || this.consume('extensions')) {
        this.skipThroughSemicolon(path);
      }
      else this.parseField(path, state, false);
    }
    this.validateReservedFields(state);
  }

  parseOneof(path, state) {
    const name = this.expectIdentifier(path).value;
    const oneofPath = `${path}.oneof ${name}`;
    this.expect('{', oneofPath);
    while (!this.consume('}')) {
      if (this.isEnd()) {
        throw new SchemaSyntaxError('expected closing brace', this.peek(), oneofPath);
      }
      if (this.consume('option')) this.skipThroughSemicolon(oneofPath);
      else this.parseField(oneofPath, state, true);
    }
  }

  parseField(path, state, inOneof) {
    if (inOneof && ['optional', 'required', 'repeated'].includes(this.peek().value)) {
      throw new SchemaSyntaxError('oneof fields cannot have a label', this.peek(), path);
    }
    if (!inOneof && ['optional', 'required', 'repeated'].includes(this.peek().value)) this.next();
    this.parseType(path);
    const nameToken = this.expectIdentifier(path);
    const fieldPath = `${path}.field ${nameToken.value}`;
    this.expect('=', fieldPath);
    const numberToken = this.expectType('number', fieldPath);
    const number = Number(numberToken.value);
    if (!Number.isInteger(number) || number < 1 || number > 536870911) {
      this.errors.push(`${fieldPath}: field number must be between 1 and 536870911`);
    }
    if (number >= RESERVED_FIELD_START && number <= RESERVED_FIELD_END) {
      this.errors.push(`${fieldPath}: field number ${number} is reserved by Protocol Buffers`);
    }
    if (state.numbers.has(number)) {
      this.errors.push(`${fieldPath}: duplicate field number ${number}`);
    }
    state.numbers.set(number, nameToken.value);
    if (state.names.has(nameToken.value)) this.errors.push(`${fieldPath}: duplicate field name`);
    state.names.add(nameToken.value);
    state.fields.push({ name: nameToken.value, number, path: fieldPath });
    if (this.consume('[')) this.skipBalanced('[', ']', fieldPath);
    this.expect(';', fieldPath);
  }

  parseType(path) {
    if (this.consume('map')) {
      this.expect('<', path);
      this.parseQualifiedName(path);
      this.expect(',', path);
      this.parseQualifiedName(path);
      this.expect('>', path);
      return;
    }
    this.parseQualifiedName(path);
  }

  parseReserved(path, state) {
    while (true) {
      const token = this.peek();
      if (token.type === 'string') {
        state.reservedNames.add(this.next().value);
      } else {
        const start = Number(this.expectType('number', path).value);
        let end = start;
        if (this.consume('to')) {
          end = this.consume('max') ? 536870911 : Number(this.expectType('number', path).value);
        }
        state.reservedNumbers.push([start, end]);
      }
      if (!this.consume(',')) break;
    }
    this.expect(';', path);
  }

  validateReservedFields(state) {
    for (const field of state.fields) {
      if (state.reservedNames.has(field.name)) {
        this.errors.push(`${field.path}: field name is reserved`);
      }
      const isReservedNumber = state.reservedNumbers.some(
        ([start, end]) => field.number >= start && field.number <= end
      );
      if (isReservedNumber) {
        this.errors.push(`${field.path}: field number ${field.number} is reserved`);
      }
    }
  }

  parseEnum(parentPath) {
    const name = this.expectIdentifier(parentPath).value;
    const path = `${parentPath === 'schema' ? 'enum' : `${parentPath}.enum`} ${name}`;
    let firstValue;
    this.expect('{', path);
    while (!this.consume('}')) {
      if (this.isEnd()) throw new SchemaSyntaxError('expected closing brace', this.peek(), path);
      if (this.consume('option') || this.consume('reserved')) {
        this.skipThroughSemicolon(path);
        continue;
      }
      this.expectIdentifier(path);
      this.expect('=', path);
      const value = Number(this.expectType('number', path).value);
      if (firstValue === undefined) firstValue = value;
      if (this.consume('[')) this.skipBalanced('[', ']', path);
      this.expect(';', path);
    }
    if (this.syntax === 'proto3' && firstValue !== 0) {
      this.errors.push(`${path}: first enum value must be 0 in proto3`);
    }
  }

  parseService(parentPath) {
    const name = this.expectIdentifier(parentPath).value;
    const path = `${parentPath === 'schema' ? 'service' : `${parentPath}.service`} ${name}`;
    this.expect('{', path);
    while (!this.consume('}')) {
      if (this.consume('option')) {
        this.skipThroughSemicolon(path);
      } else {
        this.expect('rpc', path);
        this.expectIdentifier(path);
        this.expect('(', path);
        this.consume('stream');
        this.parseQualifiedName(path);
        this.expect(')', path);
        this.expect('returns', path);
        this.expect('(', path);
        this.consume('stream');
        this.parseQualifiedName(path);
        this.expect(')', path);
        if (this.consume('{')) this.skipBalanced('{', '}', path);
        else this.expect(';', path);
      }
    }
  }

  parseQualifiedName(path) {
    this.consume('.');
    this.expectIdentifier(path);
    while (this.consume('.')) this.expectIdentifier(path);
  }

  skipThroughSemicolon(path) {
    while (!this.isEnd() && !this.consume(';')) {
      if (this.consume('{')) this.skipBalanced('{', '}', path);
      else this.next();
    }
    if (this.isEnd()) throw new SchemaSyntaxError('expected semicolon', this.peek(), path);
  }

  skipBalanced(open, close, path) {
    let depth = 1;
    while (depth > 0 && !this.isEnd()) {
      const token = this.next().value;
      if (token === open) depth += 1;
      if (token === close) depth -= 1;
    }
    if (depth > 0) throw new SchemaSyntaxError(`expected '${close}'`, this.peek(), path);
  }

  consume(value) {
    if (this.peek().value !== value) return false;
    this.next();
    return true;
  }

  expect(value, path) {
    if (!this.consume(value)) {
      throw new SchemaSyntaxError(`expected '${value}'`, this.peek(), path);
    }
  }

  expectIdentifier(path) {
    return this.expectType('identifier', path);
  }

  expectType(type, path) {
    const token = this.peek();
    if (token.type !== type) {
      throw new SchemaSyntaxError(`expected ${type}`, token, path);
    }
    return this.next();
  }

  peek() {
    return this.tokens[this.position];
  }

  next() {
    return this.tokens[this.position++];
  }

  isEnd() {
    return this.peek().type === 'eof';
  }
}
