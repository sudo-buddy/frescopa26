import {
  loadHeader,
  loadFooter,
  decorateIcons,
  decorateSections,
  decorateBlocks,
  decorateTemplateAndTheme,
  waitForFirstImage,
  loadSection,
  loadSections,
  loadCSS,
  buildBlock,
  readBlockConfig,
  toClassName,
  getMetadata,
} from './aem.js';
import {
  COMMERCE_ENABLED,
  loadCommerceEager,
  loadCommerceLazy,
  initializeCommerce,
  loadErrorPage,
} from './commerce.js';
import {
  isAuthorPreview,
  runExperimentation,
  runExperimentationLazy,
} from './experiment-loader.js';

if (window.trustedTypes && window.trustedTypes.createPolicy) {
  const innerTT = window.trustedTypes.createPolicy('tt-inner', {
    createHTML: (s) => s, // avoid stack overflow
  });

  window.trustedTypes.createPolicy('default', {
    createHTML: (input, type, sink) => {
      let processedInput = input;
      if (/srcdoc\s*=/i.test(processedInput)) {
        const doc = new DOMParser().parseFromString(innerTT.createHTML(processedInput), 'text/html');
        doc.querySelectorAll('iframe[srcdoc]').forEach((el) => el.removeAttribute('srcdoc'));
        processedInput = doc.body.innerHTML;
      }
      if (sink.includes('createContextualFragment') || sink.includes('Document write')) {
        const doc = new DOMParser().parseFromString(innerTT.createHTML(processedInput), 'text/html');
        doc.querySelectorAll('script').forEach((el) => el.remove());
        processedInput = doc.body.innerHTML;
      }
      return processedInput;
    },
    createScriptURL: (input) => input,
    createScript: (input) => input,
  });
}

/**
 * load fonts.css and set a session storage flag
 */
async function loadFonts() {
  await loadCSS(`${window.hlx.codeBasePath}/styles/fonts.css`);
  try {
    if (!window.location.hostname.includes('localhost')) sessionStorage.setItem('fonts-loaded', 'true');
  } catch (e) {
    // do nothing
  }
}

/**
 * Turns `/widgets/...` links into widget blocks.
 * @param {Element} main The container element
 */
function buildWidgetAutoBlocks(main) {
  const widgetLinks = [...main.querySelectorAll('a[href*="/widgets/"]')];
  widgetLinks.forEach((link) => {
    if (link.closest('.widget')) return;
    const newLink = link.cloneNode(true);
    const widgetBlock = buildBlock('widget', { elems: [newLink] });
    const p = link.closest('p');
    if (
      p
      && p.querySelectorAll('a').length === 1
      && p.querySelector('a') === link
      && p.textContent.trim() === link.textContent.trim()
    ) {
      p.replaceWith(widgetBlock);
    } else {
      link.replaceWith(widgetBlock);
    }
  });
}

/**
 * Builds all synthetic blocks in a container element.
 * @param {Element} main The container element
 */
function buildAutoBlocks(main) {
  try {
    // auto load `*/fragments/*` references
    const fragments = [...main.querySelectorAll('a[href*="/fragments/"]')].filter((f) => !f.closest('.fragment'));
    if (fragments.length > 0) {
      // eslint-disable-next-line import/no-cycle
      import('../blocks/fragment/fragment.js').then(({ loadFragment }) => {
        fragments.forEach(async (fragment) => {
          try {
            const { pathname } = new URL(fragment.href);
            const frag = await loadFragment(pathname);
            fragment.parentElement.replaceWith(...frag.children);
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Fragment loading failed', error);
          }
        });
      });
    }
    buildWidgetAutoBlocks(main);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Auto Blocking failed', error);
  }
}

/**
 * Decorates formatted links to style them as buttons.
 * @param {HTMLElement} main The main container element
 */
function decorateButtons(main) {
  main.querySelectorAll('p a[href]').forEach((a) => {
    a.title = a.title || a.textContent;
    const p = a.closest('p');
    const text = a.textContent.trim();

    // quick structural checks
    if (a.querySelector('img') || p.textContent.trim() !== text) return;

    // skip URL display links
    try {
      if (new URL(a.href).href === new URL(text, window.location).href) return;
    } catch { /* continue */ }

    // require authored formatting for buttonization
    const strong = a.closest('strong');
    const em = a.closest('em');
    if (!strong && !em) return;

    p.className = 'button-wrapper';
    a.className = 'button';
    if (strong && em) { // high-impact call-to-action
      a.classList.add('accent');
      const outer = strong.contains(em) ? strong : em;
      outer.replaceWith(a);
    } else if (strong) {
      a.classList.add('primary');
      strong.replaceWith(a);
    } else {
      a.classList.add('secondary');
      em.replaceWith(a);
    }
  });
}

/**
 * Applies `section-metadata` blocks as section classes and data attributes.
 * This project's aem.js decorateSections does not process section metadata, so
 * we handle it here: read each `.section-metadata` block config, apply `style`
 * values as classes on the parent section, and other keys as data attributes,
 * then remove the block so it is not treated as a loadable block.
 * @param {Element} main The main element
 */
function decorateSectionMetadata(main) {
  main.querySelectorAll(':scope > .section .section-metadata').forEach((metaBlock) => {
    const section = metaBlock.closest('.section');
    const meta = readBlockConfig(metaBlock);
    Object.keys(meta).forEach((key) => {
      if (key === 'style') {
        meta.style.split(',').map((s) => toClassName(s.trim())).filter((s) => s)
          .forEach((style) => section.classList.add(style));
      } else {
        section.dataset[toClassName(key).replace(/-([a-z])/g, (g) => g[1].toUpperCase())] = meta[key];
      }
    });
    const wrapper = metaBlock.parentElement;
    metaBlock.remove();
    if (wrapper && wrapper.classList.contains('section-metadata-wrapper') && !wrapper.childNodes.length) {
      wrapper.remove();
    }
  });
}

/**
 * Adds scroll-triggered fade/rise reveals to section content, matching the
 * source site. Applied JS-first so content is never hidden without JS, and
 * disabled when the user prefers reduced motion.
 * @param {Element} main The main element
 */
function decorateScrollReveal(main) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-in');
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });

  main.querySelectorAll(':scope > .section').forEach((section, sectionIndex) => {
    // Skip the first (above-the-fold/LCP) section to avoid a load-time flash.
    if (sectionIndex === 0) return;
    // Reveal targets: each default-content head child and each block wrapper.
    const targets = [
      ...section.querySelectorAll(':scope > .default-content-wrapper > *'),
      ...section.querySelectorAll(':scope > div[class$="-wrapper"] > .block'),
    ];
    targets.forEach((el, i) => {
      el.classList.add('reveal');
      el.style.setProperty('--reveal-delay', `${Math.min(i * 0.08, 0.32)}s`);
      observer.observe(el);
    });
  });
}

/**
 * Adds a "Home / <Page>" breadcrumb to the intro of catalogue pages (those
 * with a filter bar), mirroring the source site. The current-page label is
 * derived from the URL so it stays correct across machines / coffee / etc.
 * @param {Element} main The main element
 */
function decorateCatalogueBreadcrumb(main) {
  // Only catalogue pages (with the filter tab bar) carry a breadcrumb.
  if (!main.querySelector('.machine-filter')) return;
  const intro = [...main.querySelectorAll(':scope > .section')]
    .find((section) => section.querySelector('h1'));
  const wrapper = intro?.querySelector('.default-content-wrapper');
  const heading = wrapper?.querySelector('h1');
  if (!wrapper || !heading) return;

  const homeHref = window.location.pathname.replace(/[^/]+$/, '');
  const segment = window.location.pathname.replace(/\/$/, '').split('/').pop() || '';
  const label = segment
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  const nav = document.createElement('nav');
  nav.className = 'page-breadcrumb';
  nav.setAttribute('aria-label', 'Breadcrumb');
  const home = document.createElement('a');
  home.href = homeHref;
  home.textContent = 'Home';
  const sep = document.createElement('span');
  sep.setAttribute('aria-hidden', 'true');
  sep.textContent = '/';
  const current = document.createElement('span');
  current.setAttribute('aria-current', 'page');
  current.textContent = label;
  nav.append(home, sep, current);
  wrapper.prepend(nav);
}

/**
 * Restructures the machine-catalogue band heads into the source's two-column
 * layout: the eyebrow / heading / lede on the left, and a "How they differ"
 * note (the trailing paragraph) on the right with a labelled amber rule.
 * @param {Element} main The main element
 */
function decorateMachineBandHeads(main) {
  main.querySelectorAll(':scope > .section:has(.cards-machine) > .default-content-wrapper')
    .forEach((wrapper) => {
      const kids = [...wrapper.children];
      const heading = kids.find((el) => el.tagName === 'H2');
      const paragraphs = kids.filter((el) => el.tagName === 'P');
      // The last paragraph is the "how they differ" note — only split it out
      // when there's a heading and more than one paragraph (eyebrow + lede + note).
      if (!heading || paragraphs.length < 2) return;
      const note = paragraphs[paragraphs.length - 1];

      const left = document.createElement('div');
      left.className = 'section-head-copy';
      const right = document.createElement('div');
      right.className = 'section-head-note';
      const label = document.createElement('span');
      label.className = 'section-head-note-label';
      label.textContent = 'How they differ';
      right.append(label, note);
      kids.filter((el) => el !== note).forEach((el) => left.append(el));

      wrapper.classList.add('section-head-split');
      wrapper.append(left, right);
    });
}

/**
 * Decorates the Journal article header. Turns the flattened breadcrumb
 * ("The Journal / The Atelier") into styled crumbs (a muted "The Journal" link
 * back to the listing + a terracotta current category) and groups the header
 * copy with the top byline into a banded header, matching the source where the
 * intro sits on the alt paper tone above the hero image.
 * @param {Element} main The main element
 */
function decorateArticleHeader(main) {
  const section = main.querySelector(':scope > .section:has(.article-byline)');
  if (!section) return;
  const copy = section.querySelector(':scope > .default-content-wrapper');
  const crumb = copy?.querySelector(':scope > p:first-child');
  if (!crumb || !crumb.textContent.includes('/')) return;

  // Rebuild the breadcrumb: first segment links to the Journal listing, the
  // last is the current category (terracotta, no link).
  const parts = crumb.textContent.split('/').map((s) => s.trim()).filter(Boolean);
  const nav = document.createElement('nav');
  nav.className = 'article-breadcrumb';
  nav.setAttribute('aria-label', 'Breadcrumb');
  const blogHref = window.location.pathname.replace(/[^/]+$/, 'blog');
  parts.forEach((part, i) => {
    if (i > 0) {
      const sep = document.createElement('span');
      sep.setAttribute('aria-hidden', 'true');
      sep.textContent = '/';
      nav.append(sep);
    }
    if (i === 0) {
      const a = document.createElement('a');
      a.href = blogHref;
      a.textContent = part;
      nav.append(a);
    } else {
      const span = document.createElement('span');
      if (i === parts.length - 1) span.setAttribute('aria-current', 'page');
      span.textContent = part;
      nav.append(span);
    }
  });
  crumb.replaceWith(nav);

  // Group the header copy + top byline into a banded header so the alt tone can
  // span both and stop above the hero image.
  const topByline = section.querySelector(':scope > .article-byline-wrapper');
  const header = document.createElement('div');
  header.className = 'article-header';
  section.insertBefore(header, copy);
  header.append(copy);
  if (topByline) header.append(topByline);
}

/**
 * Decorates the main element.
 * @param {Element} main The main element
 */
// eslint-disable-next-line import/prefer-default-export
export function decorateMain(main) {
  decorateIcons(main);
  buildAutoBlocks(main);
  decorateSections(main);
  decorateSectionMetadata(main);
  decorateBlocks(main);
  decorateButtons(main);
  decorateCatalogueBreadcrumb(main);
  decorateMachineBandHeads(main);
  decorateArticleHeader(main);
}

const experimentationConfig = {
  prodHost: 'main--frescopa26--sudo-buddy.aem.live',
  decorateFunction: async (element) => {
    decorateMain(element);
    await loadSections(element);
  },
  // Pins experiment variants by browser when the page sets `browser-variants` metadata,
  // e.g. "chrome: challenger-1, safari: challenger-2, default: control".
  selectVariant: async () => {
    const browserVariants = getMetadata('browser-variants');
    if (!browserVariants) return undefined;
    const { getBrowserVariant } = await import('./browser-variants.js');
    return getBrowserVariant(browserVariants, navigator.userAgent);
  },
};

let commerceReady = false;
let experimentationReady = false;

/**
 * Loads everything needed to get to LCP.
 * @param {Element} doc The container element
 */
async function loadEager(doc) {
  document.documentElement.lang = 'en';
  decorateTemplateAndTheme();
  const main = doc.querySelector('main');
  if (main) {
    experimentationReady = await runExperimentation(doc, experimentationConfig);
    if (COMMERCE_ENABLED) {
      try {
        await initializeCommerce();
        commerceReady = true;
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Error initializing commerce configuration:', e);
      }
    }
    decorateMain(main);
    // Only commerce pages need a working config; other pages keep rendering without it.
    if (commerceReady) {
      try {
        await loadCommerceEager();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Error loading commerce:', e);
        loadErrorPage(418);
      }
    } else if (COMMERCE_ENABLED && main.querySelector('.product-details')) {
      loadErrorPage(418);
    }
    document.body.classList.add('appear');
    await loadSection(main.querySelector('.section'), waitForFirstImage);
  }

  try {
    /* if desktop (proxy for fast connection) or fonts already loaded, load fonts.css */
    if (window.innerWidth >= 900 || sessionStorage.getItem('fonts-loaded')) {
      loadFonts();
    }
  } catch (e) {
    // do nothing
  }
}

/**
 * Loads everything that doesn't need to be delayed.
 * @param {Element} doc The container element
 */
async function loadLazy(doc) {
  loadHeader(doc.querySelector('header'));

  const main = doc.querySelector('main');
  await loadSections(main);

  decorateScrollReveal(main);

  const { hash } = window.location;
  const element = hash ? doc.getElementById(hash.substring(1)) : false;
  if (hash && element) element.scrollIntoView();

  loadFooter(doc.querySelector('footer'));

  if (commerceReady) await loadCommerceLazy();

  loadCSS(`${window.hlx.codeBasePath}/styles/lazy-styles.css`);
  loadFonts();

  const loadQuickEdit = async (...args) => {
    // eslint-disable-next-line import/no-cycle
    const { default: initQuickEdit } = await import('../tools/quick-edit/quick-edit.js');
    initQuickEdit(...args);
  };

  const addSidekickListeners = (sk) => {
    sk.addEventListener('custom:quick-edit', loadQuickEdit);
  };

  const sk = document.querySelector('aem-sidekick');
  if (sk) {
    addSidekickListeners(sk);
  } else {
    // wait for sidekick to be loaded
    document.addEventListener('sidekick-ready', () => {
    // sidekick now loaded
      addSidekickListeners(document.querySelector('aem-sidekick'));
    }, { once: true });
  }

  await runExperimentationLazy(doc, experimentationConfig);
}

/**
 * Loads everything that happens a lot later,
 * without impacting the user experience.
 */
function loadDelayed() {
  import('./consent-check.js');
  // eslint-disable-next-line import/no-cycle
  window.setTimeout(() => import('./delayed.js'), 3000);
  // load anything that can be postponed to the latest here
}

export async function loadPage() {
  await loadEager(document);
  await loadLazy(document);
  loadDelayed();
}

const pageLoaded = loadPage();

if (isAuthorPreview(window.location.href, window.parent !== window)) {
  pageLoaded.then(async () => {
    if (!experimentationReady) return;
    const { default: connectAuthorPreview } = await import('./experimentation-preview.js');
    connectAuthorPreview(experimentationConfig);
  });
}

(() => {
  const hasQE = new URL(window.location.href).searchParams.has('quick-edit');
  // eslint-disable-next-line import/no-cycle
  if (hasQE) import('../tools/quick-edit/quick-edit.js').then((mod) => mod.default());
})();
