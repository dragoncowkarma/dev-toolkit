import { describe, expect, it } from 'vitest';
import {
  parseBrowser,
  parseCPU,
  parseDevice,
  parseEngine,
  parseOperatingSystem,
  parseUserAgent,
  UNKNOWN_VALUE,
} from './userAgent.utils.js';

const CHROME_WINDOWS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ',
  '(KHTML, like Gecko) Chrome/124.0.6367.207 Safari/537.36',
].join('');
const SAFARI_MACOS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 ',
  '(KHTML, like Gecko) Version/17.4 Safari/605.1.15',
].join('');
const FIREFOX_LINUX =
  'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0';
const IPHONE_SAFARI = [
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 ',
  '(KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
].join('');
const ANDROID_CHROME = [
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 ',
  '(KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36',
].join('');
const EDGE_WINDOWS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ',
  'Chrome/124.0.0.0 Safari/537.36 Edg/124.0.2478.80',
].join('');
const SAMSUNG_ANDROID = [
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 SamsungBrowser/25.0 ',
  'Chrome/121.0.0.0 Mobile Safari/537.36',
].join('');
const OPERA_WINDOWS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ',
  '(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 OPR/109.0.0.0',
].join('');
const LEGACY_EDGE = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ',
  '(KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36 Edge/18.19041',
].join('');
const INTERNET_EXPLORER =
  'Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.1; Trident/6.0)';
const GOOGLEBOT =
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15';
const SMART_TV = 'Mozilla/5.0 (SMART-TV; Linux; Tizen 7.0) AppleWebKit/537.36';

describe('parseBrowser', () => {
  it('prioritizes branded browsers before Chrome or Safari compatibility tokens', () => {
    expect(parseBrowser(CHROME_WINDOWS)).toEqual({ name: 'Chrome', version: '124.0.6367.207' });
    expect(parseBrowser(EDGE_WINDOWS)).toEqual({
      name: 'Microsoft Edge',
      version: '124.0.2478.80',
    });
    expect(parseBrowser(SAMSUNG_ANDROID)).toEqual({ name: 'Samsung Internet', version: '25.0' });
    expect(parseBrowser(OPERA_WINDOWS)).toEqual({ name: 'Opera', version: '109.0.0.0' });
    expect(parseBrowser(LEGACY_EDGE)).toEqual({ name: 'Microsoft Edge', version: '18.19041' });
    expect(parseBrowser(SAFARI_MACOS)).toEqual({ name: 'Safari', version: '17.4' });
    expect(parseBrowser(FIREFOX_LINUX)).toEqual({ name: 'Firefox', version: '125.0' });
  });

  it('identifies common crawlers', () => {
    expect(parseBrowser(GOOGLEBOT)).toEqual({ name: 'Googlebot', version: '2.1' });
  });
});

describe('parseOperatingSystem', () => {
  it('extracts desktop and mobile operating systems with versions', () => {
    expect(parseOperatingSystem(CHROME_WINDOWS)).toEqual({ name: 'Windows', version: '10.0' });
    expect(parseOperatingSystem(SAFARI_MACOS)).toEqual({ name: 'macOS', version: '10.15.7' });
    expect(parseOperatingSystem(IPHONE_SAFARI)).toEqual({ name: 'iOS', version: '17.4' });
    expect(parseOperatingSystem(ANDROID_CHROME)).toEqual({ name: 'Android', version: '14' });
    expect(parseOperatingSystem(FIREFOX_LINUX)).toEqual({ name: 'Linux', version: UNKNOWN_VALUE });
    expect(
      parseOperatingSystem('Mozilla/5.0 (X11; CrOS x86_64 15662.71.0) AppleWebKit/537.36'),
    ).toEqual({ name: 'Chrome OS', version: '15662.71.0' });
  });
});

describe('parseDevice', () => {
  it('categorizes desktop, mobile, tablet, bot, and smart TV User-Agents', () => {
    expect(parseDevice(CHROME_WINDOWS)).toMatchObject({ type: 'Desktop' });
    expect(parseDevice(IPHONE_SAFARI)).toMatchObject({ type: 'Mobile', vendor: 'Apple' });
    expect(parseDevice(IPAD)).toMatchObject({
      type: 'Tablet',
      model: 'iPad',
    });
    expect(parseDevice(GOOGLEBOT)).toMatchObject({
      type: 'Bot/Crawler',
    });
    expect(parseDevice(SMART_TV)).toMatchObject({
      type: 'Smart TV',
    });
  });
});

describe('parseEngine and parseCPU', () => {
  it('detects Blink, WebKit, Gecko, and reported processor architectures', () => {
    expect(parseEngine(CHROME_WINDOWS)).toEqual({ name: 'Blink', version: '537.36' });
    expect(parseEngine(SAFARI_MACOS)).toEqual({ name: 'WebKit', version: '605.1.15' });
    expect(parseEngine(FIREFOX_LINUX)).toEqual({ name: 'Gecko', version: '125.0' });
    expect(parseEngine(INTERNET_EXPLORER)).toEqual({ name: 'Trident', version: '6.0' });
    expect(parseCPU(CHROME_WINDOWS)).toEqual({ architecture: 'x86_64' });
    expect(parseCPU('Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36')).toEqual({
      architecture: 'arm64',
    });
    expect(parseCPU('Mozilla/5.0 (X11; Linux i686) Gecko/20100101 Firefox/125.0')).toEqual({
      architecture: 'ia32',
    });
  });
});

describe('parseUserAgent', () => {
  it('returns stable fallbacks for empty or invalid values', () => {
    expect(parseUserAgent()).toEqual({
      browser: { name: UNKNOWN_VALUE, version: UNKNOWN_VALUE },
      os: { name: UNKNOWN_VALUE, version: UNKNOWN_VALUE },
      device: { type: UNKNOWN_VALUE, vendor: UNKNOWN_VALUE, model: UNKNOWN_VALUE },
      engine: { name: UNKNOWN_VALUE, version: UNKNOWN_VALUE },
      cpu: { architecture: UNKNOWN_VALUE },
    });
    expect(parseUserAgent(42).browser.name).toBe(UNKNOWN_VALUE);
  });

  it('combines each parser into one structured result', () => {
    const result = parseUserAgent(ANDROID_CHROME);
    expect(result.browser.name).toBe('Chrome');
    expect(result.os).toEqual({ name: 'Android', version: '14' });
    expect(result.device.type).toBe('Mobile');
    expect(result.engine.name).toBe('Blink');
  });
});
