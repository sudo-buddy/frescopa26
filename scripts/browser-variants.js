/**
 * Maps a user agent to a coarse browser name.
 * Chromium-based browsers other than Chrome (Edge, Opera, Samsung Internet, ...) are 'other'.
 * Chrome on iOS (CriOS) is 'chrome'; Safari excludes every other WebKit-based iOS browser.
 * @param {string} userAgent
 * @returns {'chrome'|'safari'|'other'}
 */
export function getBrowser(userAgent = '') {
  if (/Edg(e|A|iOS)?\/|OPR\/|Opera|SamsungBrowser\/|YaBrowser\/|Vivaldi\//.test(userAgent)) {
    return 'other';
  }
  if (/Chrome\/|CriOS\//.test(userAgent)) {
    return 'chrome';
  }
  if (/Safari\//.test(userAgent) && !/Chromium|Android|FxiOS\//.test(userAgent)) {
    return 'safari';
  }
  return 'other';
}

/**
 * Parses `browser-variants` page metadata, e.g.
 * "chrome: challenger-1, safari: challenger-2, default: control".
 * @param {string} value
 * @returns {Record<string, string>} browser (or 'default') to variant name
 */
export function parseBrowserVariants(value = '') {
  return value.split(/[,\n]/).reduce((mapping, entry) => {
    const [browser, variant] = entry.split(':').map((part) => part?.trim().toLowerCase());
    if (browser && variant) {
      mapping[browser] = variant;
    }
    return mapping;
  }, {});
}

/**
 * Picks the experiment variant for this visitor's browser.
 * @param {string} metadataValue the page's `browser-variants` metadata
 * @param {string} userAgent
 * @returns {string|undefined} the variant name, or undefined to keep the random allocation
 */
export function getBrowserVariant(metadataValue, userAgent) {
  const mapping = parseBrowserVariants(metadataValue);
  return mapping[getBrowser(userAgent)] ?? mapping.default;
}
