export function isAuthorPreview(location, embedded = false) {
  const url = new URL(location);
  return embedded && url.searchParams.get('controller') === 'parent'
    && url.searchParams.has('quick-edit')
    && (url.hostname.endsWith('.preview.da.live') || url.hostname === 'localhost');
}

export function hasExperiments(doc) {
  return Boolean(doc.head.querySelector(
    'meta[name^="experiment"], meta[name^="campaign"], meta[name^="audience"], '
      + 'meta[property^="experiment:"], meta[property^="campaign:"], meta[property^="audience:"]',
  )) || [...doc.querySelectorAll('.section-metadata > div > div:first-child')]
    .some((cell) => /^(experiment|campaign|audience)(\b|-)/i.test(cell.textContent.trim()));
}

// Eager decoration removes section metadata, so keep the decision for the lazy phase.
let enabled = false;
let authoring = false;

export async function runExperimentation(doc, options) {
  authoring = isAuthorPreview(window.location.href, window.parent !== window);
  enabled = authoring || hasExperiments(doc);
  if (!enabled) return false;
  try {
    const { loadEager } = await import('../plugins/experimentation/src/index.js');
    await loadEager(doc, options);
    return true;
  } catch (error) {
    enabled = false;
    // eslint-disable-next-line no-console
    console.error('Failed to load experimentation (eager):', error);
    return false;
  }
}

export async function runExperimentationLazy(doc, options) {
  if (!enabled) return false;
  const { host, hostname, origin } = window.location;
  const preview = authoring || hostname === 'localhost' || hostname.endsWith('.page')
    || (typeof options.isProd === 'function' && !options.isProd())
    || (options.prodHost && ![host, hostname, origin].includes(options.prodHost));
  if (!preview) return false;
  try {
    const { loadLazy } = await import('../plugins/experimentation/src/index.js');
    await loadLazy(doc, { ...options, ...(authoring ? { simulationUI: false } : {}) });
    return true;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to load experimentation (lazy):', error);
    return false;
  }
}
