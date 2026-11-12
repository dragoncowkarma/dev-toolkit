/**
 * Parses an HLS attribute list while preserving quoted comma-separated values.
 * @param {string} value Attribute-list text following a tag colon.
 * @returns {Record<string, string>} Attributes indexed by their uppercase names.
 */
export function parseAttributeList(value) {
  const attributes = {};
  const parts = value.match(/(?:[^,\"]|\"[^\"]*\")+/g) ?? [];

  parts.forEach((part) => {
    const separator = part.indexOf('=');
    if (separator === -1) return;
    const name = part.slice(0, separator).trim().toUpperCase();
    const rawValue = part.slice(separator + 1).trim();
    attributes[name] = rawValue.replace(/^\"|\"$/g, '');
  });

  return attributes;
}

/**
 * Parses a duration and optional title from an EXTINF tag payload.
 * @param {string} value Text following `#EXTINF:`.
 * @returns {{duration: number, title: string, valid: boolean}}
 */
export function parseExtinf(value) {
  const commaIndex = value.indexOf(',');
  const durationText = (commaIndex === -1 ? value : value.slice(0, commaIndex)).trim();
  const duration = Number(durationText);
  return {
    duration,
    title: commaIndex === -1 ? '' : value.slice(commaIndex + 1).trim(),
    valid: durationText !== '' && Number.isFinite(duration) && duration >= 0,
  };
}

function createIssue(level, message, line) {
  return { level, message, line };
}

/**
 * Parses and validates an HLS M3U8 playlist entirely in memory.
 * @param {string} source Playlist source text.
 * @returns {{type: string, segments: Array<object>, variants: Array<object>, errors: Array<object>,
 * warnings: Array<object>, version: string, targetDuration: number|null, mediaSequence: string,
 * endList: boolean}}
 */
export function parseM3u8Playlist(source) {
  const lines = String(source ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  const errors = [];
  const warnings = [];
  const segments = [];
  const variants = [];
  let version = '';
  let targetDuration = null;
  let mediaSequence = '';
  let endList = false;
  let pendingSegment = null;
  let pendingVariant = null;
  let currentKey = null;
  let hasStreamInf = false;

  if (lines[0]?.trim() !== '#EXTM3U') {
    errors.push(createIssue('error', '#EXTM3U must be the first line of the playlist.', 1));
  }

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    const lineNumber = index + 1;

    if (pendingVariant && (!line || line.startsWith('#'))) {
      const issue = createIssue(
        'error',
        '#EXT-X-STREAM-INF must be immediately followed by a variant URI.',
        pendingVariant.line
      );
      pendingVariant.issues.push(issue);
      errors.push(issue);
      pendingVariant = null;
    }

    if (!line || line === '#EXTM3U' || (line.startsWith('#') && !line.startsWith('#EXT'))) return;

    if (line.startsWith('#EXTINF:')) {
      if (pendingSegment) {
        const issue = createIssue(
          'error', '#EXTINF must be followed by a segment URI.', pendingSegment.line
        );
        pendingSegment.issues.push(issue);
        errors.push(issue);
      }
      const parsed = parseExtinf(line.slice('#EXTINF:'.length));
      pendingSegment = { ...parsed, line: lineNumber, uri: '', key: currentKey, issues: [] };
      if (!parsed.valid) {
        const issue = createIssue(
          'error', '#EXTINF duration must be a non-negative number.', lineNumber
        );
        pendingSegment.issues.push(issue);
        errors.push(issue);
      }
      return;
    }

    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      hasStreamInf = true;
      const attributes = parseAttributeList(line.slice('#EXT-X-STREAM-INF:'.length));
      pendingVariant = { attributes, line: lineNumber, uri: '', issues: [] };
      if (!attributes.BANDWIDTH) {
        const issue = createIssue(
          'error', 'BANDWIDTH is required on #EXT-X-STREAM-INF.', lineNumber
        );
        pendingVariant.issues.push(issue);
        errors.push(issue);
      }
      return;
    }

    if (line.startsWith('#EXT-X-VERSION:')) {
      version = line.slice('#EXT-X-VERSION:'.length).trim();
      return;
    }
    if (line.startsWith('#EXT-X-TARGETDURATION:')) {
      const parsedTarget = Number(line.slice('#EXT-X-TARGETDURATION:'.length).trim());
      targetDuration = Number.isFinite(parsedTarget) ? parsedTarget : null;
      return;
    }
    if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
      mediaSequence = line.slice('#EXT-X-MEDIA-SEQUENCE:'.length).trim();
      return;
    }
    if (line.startsWith('#EXT-X-KEY:')) {
      currentKey = parseAttributeList(line.slice('#EXT-X-KEY:'.length));
      return;
    }
    if (line === '#EXT-X-ENDLIST') {
      endList = true;
      return;
    }
    if (line.startsWith('#')) return;

    if (pendingVariant) {
      pendingVariant.uri = line;
      variants.push(pendingVariant);
      pendingVariant = null;
      return;
    }
    if (pendingSegment) {
      pendingSegment.uri = line;
      segments.push(pendingSegment);
      pendingSegment = null;
      return;
    }

    const issue = createIssue(
      'error', 'Every segment URI must be preceded by #EXTINF.', lineNumber
    );
    errors.push(issue);
    segments.push({
      duration: 0, title: '', line: lineNumber, uri: line, key: currentKey, issues: [issue],
    });
  });

  if (pendingVariant) {
    const issue = createIssue(
      'error',
      '#EXT-X-STREAM-INF must be immediately followed by a variant URI.',
      pendingVariant.line
    );
    pendingVariant.issues.push(issue);
    errors.push(issue);
  }
  if (pendingSegment) {
    const issue = createIssue(
      'error', '#EXTINF must be followed by a segment URI.', pendingSegment.line
    );
    pendingSegment.issues.push(issue);
    errors.push(issue);
  }

  segments.forEach((segment) => {
    if (targetDuration !== null && segment.duration > targetDuration) {
      const issue = createIssue(
        'warning',
        `Segment duration ${segment.duration} exceeds TARGETDURATION ${targetDuration}.`,
        segment.line
      );
      segment.issues.push(issue);
      warnings.push(issue);
    }
  });

  return {
    type: hasStreamInf ? 'Master' : 'Media',
    segments,
    variants,
    errors,
    warnings,
    version,
    targetDuration,
    mediaSequence,
    endList,
  };
}

/**
 * Calculates the total declared duration of parsed media segments.
 * @param {Array<{duration: number}>} segments Parsed segment entries.
 * @returns {number} Total duration in seconds.
 */
export function getTotalDuration(segments) {
  return segments.reduce((total, segment) => {
    return total + (Number.isFinite(segment.duration) ? segment.duration : 0);
  }, 0);
}
