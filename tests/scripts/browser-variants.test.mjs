/* eslint-env es2021 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getBrowser,
  getBrowserVariant,
  parseBrowserVariants,
} from '../../scripts/browser-variants.js';

const UA = {
  chromeMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  chromeIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1',
  safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  safariIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  opera: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 OPR/115.0.0.0',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  firefox: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.7; rv:132.0) Gecko/20100101 Firefox/132.0',
  firefoxIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/132.0 Mobile/15E148 Safari/605.1.15',
};

test('getBrowser classifies Chrome, Safari and everything else', () => {
  assert.equal(getBrowser(UA.chromeMac), 'chrome');
  assert.equal(getBrowser(UA.chromeAndroid), 'chrome');
  assert.equal(getBrowser(UA.chromeIos), 'chrome');
  assert.equal(getBrowser(UA.safariMac), 'safari');
  assert.equal(getBrowser(UA.safariIos), 'safari');
  ['edge', 'opera', 'samsung', 'firefox', 'firefoxIos'].forEach((name) => {
    assert.equal(getBrowser(UA[name]), 'other', name);
  });
  assert.equal(getBrowser(''), 'other');
});

test('parseBrowserVariants reads comma or newline separated pairs', () => {
  assert.deepEqual(
    parseBrowserVariants('Chrome: Challenger-1,\nsafari : challenger-2, default: control, broken'),
    { chrome: 'challenger-1', safari: 'challenger-2', default: 'control' },
  );
  assert.deepEqual(parseBrowserVariants(''), {});
});

test('getBrowserVariant maps the browser and falls back to default', () => {
  const metadata = 'chrome: challenger-1, safari: challenger-2, default: control';
  assert.equal(getBrowserVariant(metadata, UA.chromeMac), 'challenger-1');
  assert.equal(getBrowserVariant(metadata, UA.safariIos), 'challenger-2');
  assert.equal(getBrowserVariant(metadata, UA.firefox), 'control');
  assert.equal(getBrowserVariant('chrome: challenger-1', UA.firefox), undefined);
});
