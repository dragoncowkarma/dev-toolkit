export const UNKNOWN_VALUE = 'Unknown';

function normalizeUserAgent(userAgent) {
  return typeof userAgent === 'string' ? userAgent.trim() : '';
}

function details(name = UNKNOWN_VALUE, version = UNKNOWN_VALUE) {
  return { name, version };
}

function deviceDetails(type = UNKNOWN_VALUE, vendor = UNKNOWN_VALUE, model = UNKNOWN_VALUE) {
  return { type, vendor, model };
}

function cpuDetails(architecture = UNKNOWN_VALUE) {
  return { architecture };
}

function findVersion(userAgent, expression) {
  return userAgent.match(expression)?.[1] ?? UNKNOWN_VALUE;
}

/**
 * Parses a browser or crawler name and version from a User-Agent string.
 *
 * @param {string} userAgent User-Agent string to inspect.
 * @returns {{name: string, version: string}} Parsed browser details.
 */
export function parseBrowser(userAgent) {
  const ua = normalizeUserAgent(userAgent);
  if (!ua) return details();

  const browserMatchers = [
    ['Googlebot', /Googlebot\/([\d.]+)/i],
    ['Bingbot', /bingbot\/([\d.]+)/i],
    ['Microsoft Edge', /Edg(?:A|iOS)?\/([\d.]+)/i],
    ['Microsoft Edge', /Edge\/([\d.]+)/i],
    ['Opera', /(?:OPR|OPiOS)\/([\d.]+)/i],
    ['Samsung Internet', /SamsungBrowser\/([\d.]+)/i],
    ['Firefox', /(?:Firefox|FxiOS)\/([\d.]+)/i],
    ['Chrome', /(?:Chrome|CriOS)\/([\d.]+)/i],
    ['Chromium', /Chromium\/([\d.]+)/i],
    ['Internet Explorer', /MSIE\s([\d.]+)/i],
    ['Internet Explorer', /Trident\/.+?rv:([\d.]+)/i],
  ];

  for (const [name, expression] of browserMatchers) {
    const version = findVersion(ua, expression);
    if (version !== UNKNOWN_VALUE) return details(name, version);
  }

  const safariVersion = findVersion(ua, /Version\/([\d.]+).*Safari\//i);
  if (safariVersion !== UNKNOWN_VALUE) return details('Safari', safariVersion);

  if (/bot|crawler|spider|slurp|archiver/i.test(ua)) {
    return details('Bot/Crawler');
  }

  return details();
}

/**
 * Parses an operating system name and version from a User-Agent string.
 *
 * @param {string} userAgent User-Agent string to inspect.
 * @returns {{name: string, version: string}} Parsed operating system details.
 */
export function parseOperatingSystem(userAgent) {
  const ua = normalizeUserAgent(userAgent);
  if (!ua) return details();

  const windowsPhoneVersion = findVersion(ua, /Windows Phone(?: OS)?\s([\d.]+)/i);
  if (windowsPhoneVersion !== UNKNOWN_VALUE) return details('Windows Phone', windowsPhoneVersion);

  const iosVersion = findVersion(ua, /(?:CPU (?:iPhone )?OS|iPhone OS) ([\d_]+)/i);
  if (iosVersion !== UNKNOWN_VALUE && /iPhone|iPad|iPod/i.test(ua)) {
    return details('iOS', iosVersion.replaceAll('_', '.'));
  }

  const androidVersion = findVersion(ua, /Android\s([\d.]+)/i);
  if (androidVersion !== UNKNOWN_VALUE) return details('Android', androidVersion);

  const chromeOsVersion = findVersion(ua, /CrOS\s[^\s]+\s([\d.]+)/i);
  if (chromeOsVersion !== UNKNOWN_VALUE) return details('Chrome OS', chromeOsVersion);

  const windowsVersion = findVersion(ua, /Windows NT\s([\d.]+)/i);
  if (windowsVersion !== UNKNOWN_VALUE) return details('Windows', windowsVersion);

  const macOsVersion = findVersion(ua, /Mac OS X\s([\d_]+)/i);
  if (macOsVersion !== UNKNOWN_VALUE) return details('macOS', macOsVersion.replaceAll('_', '.'));

  if (/Linux/i.test(ua)) return details('Linux');

  return details();
}

/**
 * Alias for parseOperatingSystem for concise parser consumers.
 *
 * @param {string} userAgent User-Agent string to inspect.
 * @returns {{name: string, version: string}} Parsed operating system details.
 */
export function parseOS(userAgent) {
  return parseOperatingSystem(userAgent);
}

/**
 * Parses the device category and available vendor or model clues from a User-Agent string.
 *
 * @param {string} userAgent User-Agent string to inspect.
 * @returns {{type: string, vendor: string, model: string}} Parsed device details.
 */
export function parseDevice(userAgent) {
  const ua = normalizeUserAgent(userAgent);
  if (!ua) return deviceDetails();

  if (/bot|crawler|spider|slurp|archiver|facebookexternalhit/i.test(ua)) {
    return deviceDetails('Bot/Crawler');
  }

  if (/smart-tv|smarttv|hbbtv|appletv|googletv|web0s|tizen|aft[a-z0-9-]*/i.test(ua)) {
    return deviceDetails('Smart TV');
  }

  if (/iPad/i.test(ua)) return deviceDetails('Tablet', 'Apple', 'iPad');
  if (/Kindle|Silk\/|Tablet|PlayBook/i.test(ua)) return deviceDetails('Tablet');

  if (/iPhone/i.test(ua)) return deviceDetails('Mobile', 'Apple', 'iPhone');
  if (/iPod/i.test(ua)) return deviceDetails('Mobile', 'Apple', 'iPod');
  if (/Android/i.test(ua)) {
    return deviceDetails(/Mobile/i.test(ua) ? 'Mobile' : 'Tablet');
  }
  if (/Mobile|IEMobile|Windows Phone/i.test(ua)) return deviceDetails('Mobile');

  if (/Windows|Macintosh|X11|Linux|CrOS/i.test(ua)) return deviceDetails('Desktop');

  return deviceDetails();
}

/**
 * Parses the browser rendering engine and its reported version from a User-Agent string.
 *
 * @param {string} userAgent User-Agent string to inspect.
 * @returns {{name: string, version: string}} Parsed engine details.
 */
export function parseEngine(userAgent) {
  const ua = normalizeUserAgent(userAgent);
  if (!ua) return details();

  const tridentVersion = findVersion(ua, /Trident\/([\d.]+)/i);
  if (tridentVersion !== UNKNOWN_VALUE) return details('Trident', tridentVersion);

  const edgeHtmlVersion = findVersion(ua, /Edge\/([\d.]+)/i);
  if (edgeHtmlVersion !== UNKNOWN_VALUE) return details('EdgeHTML', edgeHtmlVersion);

  const prestoVersion = findVersion(ua, /Presto\/([\d.]+)/i);
  if (prestoVersion !== UNKNOWN_VALUE) return details('Presto', prestoVersion);

  const appleWebKitVersion = findVersion(ua, /AppleWebKit\/([\d.]+)/i);
  if (appleWebKitVersion !== UNKNOWN_VALUE) {
    if (/(?:Chrome|Chromium|Edg(?:A|iOS)?|OPR|SamsungBrowser)\//i.test(ua)) {
      return details('Blink', appleWebKitVersion);
    }
    return details('WebKit', appleWebKitVersion);
  }

  const geckoVersion = findVersion(ua, /rv:([\d.]+).+?Gecko\//i);
  if (geckoVersion !== UNKNOWN_VALUE) return details('Gecko', geckoVersion);

  const khtmlVersion = findVersion(ua, /KHTML\/([\d.]+)/i);
  if (khtmlVersion !== UNKNOWN_VALUE) return details('KHTML', khtmlVersion);

  return details();
}

/**
 * Parses a CPU architecture when the User-Agent string reports one.
 *
 * @param {string} userAgent User-Agent string to inspect.
 * @returns {{architecture: string}} Parsed CPU details.
 */
export function parseCPU(userAgent) {
  const ua = normalizeUserAgent(userAgent);
  if (!ua) return cpuDetails();

  if (/\b(?:arm64|aarch64|armv8l?|armv8-a)\b/i.test(ua)) return cpuDetails('arm64');
  if (/\b(?:armv?[5-7]l?|arm)\b/i.test(ua)) return cpuDetails('arm');
  if (/\b(?:x86_64|x86-64|amd64|win64|wow64|x64)\b/i.test(ua)) return cpuDetails('x86_64');
  if (/\b(?:i[3-6]86|ia32|x86)\b/i.test(ua)) return cpuDetails('ia32');
  if (/\b(?:ppc|powerpc)\b/i.test(ua)) return cpuDetails('ppc');
  if (/\bIntel\b/i.test(ua)) return cpuDetails('x86_64');

  return cpuDetails();
}

/**
 * Parses all supported User-Agent detail groups in one deterministic result.
 *
 * @param {string} userAgent User-Agent string to inspect.
 * @returns {{browser: object, os: object, device: object, engine: object, cpu: object}}
 *   Structured browser, operating system, device, engine, and CPU details.
 */
export function parseUserAgent(userAgent) {
  const ua = normalizeUserAgent(userAgent);
  return {
    browser: parseBrowser(ua),
    os: parseOperatingSystem(ua),
    device: parseDevice(ua),
    engine: parseEngine(ua),
    cpu: parseCPU(ua),
  };
}

/**
 * Safely reads the current browser's User-Agent string, including non-browser fallbacks.
 *
 * @returns {string} Current User-Agent string, or an empty string when unavailable.
 */
export function getCurrentUserAgent() {
  if (typeof navigator === 'undefined' || typeof navigator.userAgent !== 'string') {
    return '';
  }
  return navigator.userAgent;
}

/**
 * Parses the User-Agent string exposed by the current browser client.
 *
 * @returns {{browser: object, os: object, device: object, engine: object, cpu: object}}
 *   Structured details for the current client.
 */
export function detectCurrentUserAgent() {
  return parseUserAgent(getCurrentUserAgent());
}

export const USER_AGENT_PRESETS = [
  {
    id: 'chrome-windows',
    label: 'Chrome on Windows',
    userAgent: [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ',
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    ].join(''),
  },
  {
    id: 'safari-macos',
    label: 'Safari on macOS',
    userAgent: [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 ',
      '(KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    ].join(''),
  },
  {
    id: 'firefox-linux',
    label: 'Firefox on Linux',
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
  },
  {
    id: 'ios-safari',
    label: 'Mobile Safari on iPhone',
    userAgent: [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 ',
      '(KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    ].join(''),
  },
  {
    id: 'android-chrome',
    label: 'Chrome on Android',
    userAgent: [
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 ',
      '(KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36',
    ].join(''),
  },
  {
    id: 'samsung-internet',
    label: 'Samsung Internet on Android',
    userAgent: [
      'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 ',
      '(KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
    ].join(''),
  },
  {
    id: 'googlebot',
    label: 'Googlebot crawler',
    userAgent:
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  },
];
