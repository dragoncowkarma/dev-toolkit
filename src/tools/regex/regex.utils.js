/**
 * Preset regular expression patterns for common test cases.
 */
export const REGEX_PRESETS = [
  {
    id: 'email',
    name: 'Email',
    pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}',
    flags: 'g',
    description: 'Matches standard email addresses (e.g., user@example.com).',
    testText: 'Send emails to support@company.com and john.doe@gmail.co.kr for help.'
  },
  {
    id: 'url',
    name: 'URL',
    pattern: 'https?:\\/\\/(?:www\\.)?[-a-zA-Z0-9@:%._\\+~#=]{1,256}\\.[a-zA-Z0-9()]{1,6}\\b(?:[-a-zA-Z0-9()@:%_\\+.~#?&//=]*)',
    flags: 'gi',
    description: 'Matches standard HTTP/HTTPS URLs.',
    testText: 'Visit https://google.com or check out http://www.wikipedia.org/wiki/Regular_expression.'
  },
  {
    id: 'ipv4',
    name: 'IPv4 Address',
    pattern: '\\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\b',
    flags: 'g',
    description: 'Matches IPv4 addresses (0.0.0.0 to 255.255.255.255).',
    testText: 'Local host is 127.0.0.1, external server is 192.168.1.254. Invalid IP: 999.123.45.6.'
  },
  {
    id: 'phone_kr',
    name: 'Korean Phone Number',
    pattern: '01[016789]-\\d{3,4}-\\d{4}',
    flags: 'g',
    description: 'Matches Korean mobile phone numbers (e.g., 010-1234-5678).',
    testText: 'Call me at 010-1234-5678 or office number 011-987-6543.'
  },
  {
    id: 'date',
    name: 'Date (YYYY-MM-DD)',
    pattern: '\\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\\d|3[01])',
    flags: 'g',
    description: 'Matches ISO date format YYYY-MM-DD.',
    testText: 'The project started on 2026-07-30 and ends on 2027-12-31. Wrong date: 2026-13-45.'
  },
  {
    id: 'html_tag',
    name: 'HTML Tag',
    pattern: '<([a-zA-Z1-6]+)([^>]*)(?:>(.*?)<\\/\\1>|\\s*\\/>)',
    flags: 'g',
    description: 'Matches basic HTML tags and captures tag name, attributes, and content.',
    testText: '<div>Hello <b>World</b>!</div> <img src="image.png" />'
  }
];

/**
 * Executes a regular expression on the provided test text and extracts matches and segment ranges for highlighting.
 *
 * @param {string} pattern - The regular expression pattern string.
 * @param {string} flags - The regex flags (e.g., 'g', 'i', 'm', 's', 'u').
 * @param {string} testText - The text to execute the regex on.
 * @returns {object} An object containing the validity, errors, matches, and highlighting segments.
 */
export function runRegex(pattern, flags, testText) {
  if (!pattern) {
    return {
      isValid: true,
      matches: [],
      segments: [{ type: 'text', text: testText }]
    };
  }

  try {
    const regex = new RegExp(pattern, flags);
    const matches = [];
    const isGlobal = flags.includes('g');

    if (isGlobal) {
      let match;
      while ((match = regex.exec(testText)) !== null) {
        matches.push({
          index: match.index,
          length: match[0].length,
          text: match[0],
          groups: match.slice(1),
          namedGroups: match.groups || {}
        });

        // Safe advancement for zero-width matches to prevent infinite loops
        if (match[0].length === 0) {
          regex.lastIndex++;
        }
      }
    } else {
      const match = regex.exec(testText);
      if (match) {
        matches.push({
          index: match.index,
          length: match[0].length,
          text: match[0],
          groups: match.slice(1),
          namedGroups: match.groups || {}
        });
      }
    }

    // Segment construction for matched vs unmatched parts
    const segments = [];
    let lastSliceIndex = 0;

    matches.forEach((m, matchIndex) => {
      // Unmatched segment before the match
      if (m.index > lastSliceIndex) {
        segments.push({
          type: 'text',
          text: testText.slice(lastSliceIndex, m.index)
        });
      }

      // Matched segment (even zero-width matches are pushed for cursor-style indicator)
      segments.push({
        type: 'match',
        text: m.text,
        matchIndex: matchIndex,
        index: m.index,
        length: m.length
      });

      lastSliceIndex = m.index + m.length;
    });

    // Unmatched segment after all matches
    if (lastSliceIndex < testText.length) {
      segments.push({
        type: 'text',
        text: testText.slice(lastSliceIndex)
      });
    }

    return {
      isValid: true,
      matches,
      segments
    };
  } catch (err) {
    return {
      isValid: false,
      error: err.message,
      matches: [],
      segments: [{ type: 'text', text: testText }]
    };
  }
}
