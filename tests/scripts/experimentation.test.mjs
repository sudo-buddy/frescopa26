/* eslint-env es2021 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isAuthorPreview,
  runExperimentation,
  runExperimentationLazy,
} from '../../scripts/experiment-loader.js';
import connectAuthorPreview, { getExperimentConfig } from '../../scripts/experimentation-preview.js';
import createPreviewChannel, {
  BRIDGE_MESSAGE, requestPreviewAction,
} from '../../scripts/experimentation-channel.js';
import {
  MFE_ORIGIN,
  getPageContext,
  getEditorHash,
  getMfeUrl,
  getSessionOrganization,
  isMfeMessage,
  rememberImsOrganization,
  setupExperimentationConnection,
} from '../../tools/plugins/contextual-experimentation/context.js';

function connectionElements(value) {
  const formEvents = new Map();
  const changeEvents = new Map();
  const input = { value, focus() { this.focused = true; } };
  const form = {
    hidden: false,
    querySelector: () => input,
    addEventListener: (name, handler) => formEvents.set(name, handler),
  };
  const frame = { hidden: true, removeAttribute(name) { delete this[name]; } };
  const button = { disabled: true };
  const changeButton = {
    hidden: true,
    addEventListener: (name, handler) => changeEvents.set(name, handler),
  };
  return {
    form,
    frame,
    button,
    changeButton,
    status: {},
    input,
    submit: () => formEvents.get('submit')({ preventDefault() {} }),
    change: () => changeEvents.get('click')(),
  };
}

const page = getPageContext({
  org: 'sudo-buddy', repo: 'frescopa26', branch: 'main', path: '/index',
});

test('author preview requires the DA canvas controller, quick edit, and an embedded page', () => {
  const preview = `${page.pageUrl}?controller=parent&quick-edit=on`;
  assert.equal(isAuthorPreview(preview, true), true);
  assert.equal(isAuthorPreview(preview, false), false);
  assert.equal(isAuthorPreview(page.pageUrl, true), false);
  assert.equal(isAuthorPreview(`${page.pageUrl}?controller=parent`, true), false);
  assert.equal(isAuthorPreview('https://unrelated.example/?controller=parent&quick-edit=on', true), false);
  assert.equal(isAuthorPreview('http://localhost:3000/?controller=parent&quick-edit=on', true), true);
});

test('ordinary pages skip both phases and eager failures leave page rendering available', async (t) => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  });
  const win = { location: new URL('http://localhost:3000/') };
  win.parent = win;
  globalThis.window = win;
  const doc = {
    head: { querySelector: () => null },
    body: { dataset: {} },
    querySelectorAll: () => [],
  };
  assert.equal(await runExperimentation(doc, {}), false);
  assert.equal(await runExperimentationLazy(doc, {}), false);

  const failure = new Error('Test engine initialization failure');
  doc.head.querySelector = () => ({});
  doc.head.querySelectorAll = () => { throw failure; };
  globalThis.document = doc;
  const errors = t.mock.method(console, 'error', () => {});
  assert.equal(await runExperimentation(doc, {}), false);
  assert.equal(errors.mock.callCount(), 1);
  assert.equal(errors.mock.calls[0].arguments[1], failure);
  assert.equal(await runExperimentationLazy(doc, {}), false);
});

test('empty DA canvas pages initialize the real engine without a separate simulation UI', async (t) => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  });
  const win = {
    location: new URL(`${page.pageUrl}?controller=parent&quick-edit=on`),
    parent: {},
    hlx: {},
    addEventListener: t.mock.fn(),
  };
  const doc = {
    head: { querySelectorAll: () => [] },
    body: { dataset: {} },
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  globalThis.window = win;
  globalThis.document = doc;
  const options = { prodHost: 'main--frescopa26--sudo-buddy.aem.live' };
  assert.equal(await runExperimentation(doc, options), true);
  assert.equal(win.hlx.experimentation.version, '2.0.0');
  assert.deepEqual(win.hlx.experiments, []);
  assert.equal(await runExperimentationLazy(doc, options), true);
});

test('DA context resolves the actual code branch and keeps navigation inside this site', () => {
  assert.equal(page.pageUrl, 'https://main--frescopa26--sudo-buddy.preview.da.live/index');
  assert.equal(
    getEditorHash('/variants/new.html?experiment=test#section', page),
    '/sudo-buddy/frescopa26/variants/new',
  );
  assert.equal(getEditorHash('/', page), '/sudo-buddy/frescopa26/index');
  [
    'https://unrelated.example/variant',
    '//unrelated.example/variant',
    // eslint-disable-next-line no-script-url
    'javascript:alert(1)',
    `https://user:password@${new URL(page.origin).hostname}/variant`,
  ].forEach((href) => assert.throws(() => getEditorHash(href, page), /outside this DA site/));
  assert.throws(() => getPageContext({ org: 'sudo-buddy', repo: 'frescopa26' }), /code branch/);
});

test('MFE credentials travel only in the production iframe fragment', () => {
  const url = new URL(getMfeUrl({
    pageUrl: page.pageUrl,
    origin: 'http://localhost:3000',
    token: 'test-token-not-a-credential',
    imsOrg: '123ABC@AdobeOrg',
  }));
  assert.equal(url.origin, MFE_ORIGIN);
  assert.equal(url.search, '');
  const data = JSON.parse(atob(decodeURIComponent(url.hash.slice('#ue-data='.length))));
  assert.equal(data.env, 'prod');
  assert.equal(data.pageUrl, page.pageUrl);
  assert.equal(data.imsToken, 'test-token-not-a-credential');
  assert.throws(() => getMfeUrl({ token: 'test', imsOrg: 'invalid' }), /organization ID/);
});

test('organization input remembers valid submissions and prefills later forms', (t) => {
  const previousWindow = globalThis.window;
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });
  const values = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
  };
  const input = { value: '', form: new EventTarget() };
  rememberImsOrganization(input);
  input.value = ' 123ABC@AdobeOrg ';
  input.form.dispatchEvent(new Event('submit'));
  assert.deepEqual([...values.values()], ['123ABC@AdobeOrg']);

  const reopened = { value: '', form: new EventTarget() };
  rememberImsOrganization(reopened);
  assert.equal(reopened.value, '123ABC@AdobeOrg');
  reopened.value = '456DEF@AdobeOrg';
  reopened.form.dispatchEvent(new Event('submit'));
  assert.deepEqual([...values.values()], ['456DEF@AdobeOrg']);
  reopened.value = 'invalid';
  reopened.form.dispatchEvent(new Event('submit'));
  assert.deepEqual([...values.values()], ['456DEF@AdobeOrg']);

  values.forEach((value, key) => values.set(key, 'invalid'));
  const invalidSaved = { value: '', form: new EventTarget() };
  rememberImsOrganization(invalidSaved);
  assert.equal(invalidSaved.value, '');
});

test('blocked or full browser storage does not prevent organization form submission', (t) => {
  const previousWindow = globalThis.window;
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });
  globalThis.window = {
    get localStorage() { throw new Error('Storage access denied'); },
  };
  const input = { value: '123ABC@AdobeOrg', form: new EventTarget() };
  assert.doesNotThrow(() => rememberImsOrganization(input));
  assert.doesNotThrow(() => input.form.dispatchEvent(new Event('submit')));

  globalThis.window = {
    localStorage: {
      getItem: () => null,
      setItem: () => { throw new Error('Storage quota exceeded'); },
    },
  };
  const fullStorage = { value: '123ABC@AdobeOrg', form: new EventTarget() };
  assert.doesNotThrow(() => rememberImsOrganization(fullStorage));
  assert.doesNotThrow(() => fullStorage.form.dispatchEvent(new Event('submit')));
});

test('remembered organization opens CE with the DA token once and can be changed', async (t) => {
  const ui = connectionElements('123ABC@AdobeOrg');
  let ready;
  const config = new Promise((resolve) => { ready = resolve; });
  const requestConfig = t.mock.fn(() => config);
  const createMfeUrl = t.mock.fn((imsOrg) => getMfeUrl({
    pageUrl: page.pageUrl, origin: page.origin, token: 'fresh-test-token', imsOrg,
  }));
  const opening = setupExperimentationConnection({ ...ui, requestConfig, createMfeUrl });
  assert.equal(ui.button.disabled, true);
  assert.equal(ui.form.hidden, true);
  await ui.submit();
  assert.equal(requestConfig.mock.callCount(), 1);
  ready();
  await opening;
  assert.equal(new URL(ui.frame.src).origin, MFE_ORIGIN);
  assert.equal(ui.form.hidden, true);
  assert.equal(ui.frame.hidden, false);
  assert.equal(ui.changeButton.hidden, false);

  ui.change();
  assert.equal(ui.form.hidden, false);
  assert.equal(ui.frame.hidden, true);
  assert.equal(ui.frame.src, undefined);
  assert.equal(ui.input.focused, true);
  ui.input.value = ' 456DEF@AdobeOrg ';
  await ui.submit();
  assert.deepEqual(createMfeUrl.mock.calls.map(({ arguments: args }) => args[0]), [
    '123ABC@AdobeOrg', '456DEF@AdobeOrg',
  ]);
  assert.equal(ui.frame.hidden, false);
});

test('missing or invalid organization keeps first-use setup available', async (t) => {
  await Promise.all(['', 'invalid'].map(async (value) => {
    const ui = connectionElements(value);
    const requestConfig = t.mock.fn(async () => {});
    await setupExperimentationConnection({
      ...ui, requestConfig, createMfeUrl: () => `${MFE_ORIGIN}/test`,
    });
    assert.equal(requestConfig.mock.callCount(), 0);
    assert.equal(ui.form.hidden, false);
    assert.equal(ui.button.disabled, false);
    ui.input.value = '123ABC@AdobeOrg';
    await ui.submit();
    assert.equal(requestConfig.mock.callCount(), 1);
    assert.equal(ui.form.hidden, true);
  }));
});

test('first use opens CE with the DA session organization and keeps an explicit saved choice', async (t) => {
  const ui = connectionElements('');
  const requestConfig = t.mock.fn(async () => {});
  const createMfeUrl = t.mock.fn(() => `${MFE_ORIGIN}/test`);
  const resolveOrganization = t.mock.fn(async () => '789GHI@AdobeOrg');
  await setupExperimentationConnection({
    ...ui, requestConfig, createMfeUrl, resolveOrganization,
  });
  assert.deepEqual(createMfeUrl.mock.calls[0].arguments, ['789GHI@AdobeOrg']);
  assert.equal(ui.form.hidden, true);
  assert.equal(ui.frame.hidden, false);

  const saved = connectionElements('123ABC@AdobeOrg');
  const unused = t.mock.fn(async () => '789GHI@AdobeOrg');
  await setupExperimentationConnection({
    ...saved, requestConfig, createMfeUrl, resolveOrganization: unused,
  });
  assert.equal(unused.mock.callCount(), 0);
  assert.equal(createMfeUrl.mock.calls[1].arguments[0], '123ABC@AdobeOrg');

  const undetected = connectionElements('');
  undetected.status.textContent = 'Page: test';
  await setupExperimentationConnection({
    ...undetected,
    requestConfig,
    createMfeUrl,
    resolveOrganization: async () => { throw new Error('IMS unavailable'); },
  });
  assert.equal(undetected.form.hidden, false);
  assert.equal(undetected.status.textContent, 'Page: test');
});

test('session organization uses the DA token client and ignores unusable IMS responses', async (t) => {
  const claims = btoa(JSON.stringify({ client_id: 'darkalley' })).replace(/=+$/, '');
  const token = `header.${claims}.signature`;
  const fetchImpl = t.mock.fn(async () => ({
    ok: true,
    json: async () => [{ orgRef: { ident: 'bad id', authSrc: 'AdobeOrg' } },
      { orgRef: { ident: '789GHI', authSrc: 'AdobeOrg' } }],
  }));
  assert.equal(await getSessionOrganization(token, fetchImpl), '789GHI@AdobeOrg');
  const [url, options] = fetchImpl.mock.calls[0].arguments;
  assert.equal(url.origin, 'https://ims-na1.adobelogin.com');
  assert.equal(url.searchParams.get('client_id'), 'darkalley');
  assert.equal(options.headers.Authorization, `Bearer ${token}`);

  assert.equal(await getSessionOrganization('not-a-jwt', fetchImpl), null);
  assert.equal(fetchImpl.mock.callCount(), 1);
  assert.equal(await getSessionOrganization(token, async () => ({ ok: false })), null);
  assert.equal(await getSessionOrganization(token, async () => { throw new Error('offline'); }), null);
  const emptyJson = async () => ({ ok: true, json: async () => ({}) });
  assert.equal(await getSessionOrganization(token, emptyJson), null);
});

test('automatic connection failure returns to the form for manual retry', async (t) => {
  const ui = connectionElements('123ABC@AdobeOrg');
  let failed = false;
  const requestConfig = t.mock.fn(async () => {
    if (!failed) {
      failed = true;
      throw new Error('Preview is unavailable');
    }
  });
  await setupExperimentationConnection({
    ...ui, requestConfig, createMfeUrl: () => `${MFE_ORIGIN}/test`,
  });
  assert.equal(ui.status.textContent, 'Preview is unavailable');
  assert.equal(ui.form.hidden, false);
  assert.equal(ui.button.disabled, false);
  assert.equal(ui.frame.hidden, true);
  assert.equal(ui.changeButton.hidden, true);
  await ui.submit();
  assert.equal(ui.form.hidden, true);
  assert.equal(ui.status.hidden, true);
});

test('configuration request waits for a late preview and stops retrying after its reply', async (t) => {
  const name = `late-preview-${crypto.randomUUID()}`;
  const client = new BroadcastChannel(name);
  const pending = new Map();
  let preview;
  const start = setTimeout(() => {
    preview = new BroadcastChannel(name);
    preview.onmessage = ({ data }) => preview.postMessage({
      type: BRIDGE_MESSAGE, response: true, requestId: data.requestId, result: 'ready',
    });
  }, 20);
  t.after(() => {
    clearTimeout(start);
    pending.forEach((cancel) => cancel());
    client.close();
    preview?.close();
  });
  const sends = t.mock.method(client, 'postMessage');
  assert.equal(await requestPreviewAction(client, pending, 'config'), 'ready');
  assert.ok(sends.mock.callCount() >= 2);
  assert.equal(pending.size, 0);
  const count = sends.mock.callCount();
  await new Promise((resolve) => { setTimeout(resolve, 550); });
  assert.equal(sends.mock.callCount(), count);
});

test('closing the panel cancels an outstanding preview action', async (t) => {
  const channel = Object.assign(new EventTarget(), { postMessage: t.mock.fn() });
  const pending = new Map();
  const response = requestPreviewAction(channel, pending, 'highlight', { selector: '.hero' });
  pending.values().next().value();
  await assert.rejects(response, /panel was closed/);
  assert.equal(pending.size, 0);
});

test('MFE messages require both the production origin and the actual iframe window', () => {
  const frame = { contentWindow: {} };
  const event = {
    origin: MFE_ORIGIN,
    source: frame.contentWindow,
    data: { source: 'AEMExperimentation' },
  };
  assert.equal(isMfeMessage(event, frame), true);
  assert.equal(isMfeMessage({ ...event, origin: 'https://unrelated.example' }, frame), false);
  assert.equal(isMfeMessage({ ...event, source: {} }, frame), false);
  assert.equal(isMfeMessage({ ...event, data: {} }, frame), false);
});

test('preview configuration excludes unrelated runtime namespace fields', () => {
  const namespace = {
    experimentation: { version: '2.0.0' },
    experiments: [{ config: { id: 'hero' } }],
    campaigns: [],
    audiences: [],
    unrelated: { privateValue: 'must-not-be-sent' },
  };
  const config = getExperimentConfig(namespace, 'www.example.com');
  assert.equal(config.unrelated, undefined);
  assert.deepEqual(config.experiments, namespace.experiments);
  config.experiments[0].config.id = 'changed';
  assert.equal(namespace.experiments[0].config.id, 'hero');
});

test('preview transport works without enumerated frames and isolates pages and tabs', async (t) => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const channels = [];
  let disconnect;
  t.after(() => {
    disconnect?.();
    channels.forEach((channel) => channel.close());
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  });
  const storage = () => {
    const values = new Map();
    return {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    };
  };
  const outline = { value: '1px dotted red', priority: 'important' };
  const marker = {
    style: {
      getPropertyValue: () => outline.value,
      getPropertyPriority: () => outline.priority,
      setProperty: (name, value, priority) => { Object.assign(outline, { value, priority }); },
    },
  };
  const win = {
    location: new URL(`${page.origin}/index?controller=parent&quick-edit=on`),
    parent: { frames: { length: 0 } },
    sessionStorage: storage(),
    addEventListener: t.mock.fn(),
    removeEventListener: t.mock.fn(),
    hlx: { experimentation: { version: '2.0.0' }, experiments: [], unrelated: 'not-for-panel' },
  };
  globalThis.window = win;
  globalThis.document = { querySelectorAll: () => [marker] };
  disconnect = connectAuthorPreview({ prodHost: 'www.example.com' });
  const guard = win.addEventListener.mock.calls.find(({ arguments: args }) => args[2] === true)
    .arguments[1];
  const stop = t.mock.fn();
  guard({ data: { type: 'hlx:experimentation-get-config' }, stopImmediatePropagation: stop });
  assert.equal(stop.mock.callCount(), 1);
  guard({ data: { type: BRIDGE_MESSAGE }, stopImmediatePropagation: stop });
  assert.equal(stop.mock.callCount(), 1);
  const client = createPreviewChannel(`${page.origin}/`);
  const otherPage = createPreviewChannel(`${page.origin}/other`);
  const currentStorage = win.sessionStorage;
  win.sessionStorage = storage();
  const otherTab = createPreviewChannel(page.pageUrl);
  win.sessionStorage = currentStorage;
  channels.push(client, otherPage, otherTab);
  let leakedMessages = 0;
  otherPage.onmessage = () => { leakedMessages += 1; };
  otherTab.onmessage = () => { leakedMessages += 1; };
  const request = (action, details = {}) => new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const timer = setTimeout(() => reject(new Error('Preview did not respond')), 2000);
    client.onmessage = ({ data }) => {
      if (!data.response || data.requestId !== requestId) return;
      clearTimeout(timer);
      if (data.error) reject(new Error(data.error));
      else resolve(data.result);
    };
    client.postMessage({
      type: BRIDGE_MESSAGE, requestId, action, ...details,
    });
  });
  const config = await request('config');
  assert.equal(config.experimentation.version, '2.0.0');
  assert.deepEqual(config.experiments, []);
  assert.equal(config.unrelated, undefined);
  await request('highlight', { selector: '.experiment-check' });
  assert.equal(outline.value, '2px solid #3b63fb');
  await request('clear');
  assert.deepEqual(outline, { value: '1px dotted red', priority: 'important' });
  await request('highlight', { selector: '.experiment-check' });
  disconnect();
  assert.ok(win.removeEventListener.mock.calls.some(({ arguments: args }) => (
    args[0] === 'message' && args[1] === guard && args[2] === true
  )));
  assert.deepEqual(outline, { value: '1px dotted red', priority: 'important' });
  await new Promise((resolve) => { setTimeout(resolve, 25); });
  assert.equal(leakedMessages, 0);
  assert.throws(() => createPreviewChannel('http://localhost:3000/index'), /same code branch/);
});
