import createPreviewChannel, {
  BRIDGE_MESSAGE,
  requestPreviewAction,
} from '../../../scripts/experimentation-channel.js';
import {
  MFE_ORIGIN,
  getBackendOptions,
  getPageContext,
  getEditorHash,
  getMfeUrl,
  isMfeMessage,
  rememberImsOrganization,
  setupExperimentationConnection,
} from './context.js';

const form = document.querySelector('#connect');
const status = document.querySelector('#status');
const button = form.querySelector('button');
const changeButton = document.querySelector('#change-organization');
const pending = new Map();
rememberImsOrganization(form.querySelector('[name="imsOrg"]'));
let page;
let actions;
let latestConfig;
let channel;
let frame;

function showError(error) {
  status.hidden = false;
  status.textContent = error.message || 'The experimentation connection failed.';
}

function requestPreview(action, details = {}) {
  return requestPreviewAction(channel, pending, action, details);
}

function sendConfig(config) {
  frame?.contentWindow?.postMessage({
    type: 'ue:experimentation-config',
    source: 'da-host',
    config,
  }, MFE_ORIGIN);
}

function hideFrame() {
  frame?.remove();
  frame = undefined;
}

// A fresh frame per connection: the MFE reads ue-data from the URL hash only at
// startup, so reassigning src with a new organization would just be a fragment
// navigation that keeps the previous organization and token.
function showFrame(url) {
  hideFrame();
  const next = document.createElement('iframe');
  next.id = 'experimentation';
  next.title = 'Production Contextual Experimentation';
  next.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-downloads');
  next.addEventListener('load', () => {
    if (frame === next && latestConfig) sendConfig(latestConfig);
  });
  next.src = url;
  frame = next;
  document.body.append(next);
}

window.addEventListener('message', async (event) => {
  if (!page || !frame || !isMfeMessage(event, frame)) return;
  try {
    if (event.data.type === 'ue:request-fresh-config') {
      latestConfig = await requestPreview('config');
      sendConfig(latestConfig);
    } else if (event.data.type === 'ue:navigateTo') {
      const hash = getEditorHash(event.data.pageUrl, page);
      actions.setHash(hash);
    } else if (event.data.action === 'highlightElement') {
      await requestPreview('highlight', { selector: event.data.selector });
    } else if (event.data.action === 'removeHighlight') {
      await requestPreview('clear');
    }
  } catch (error) {
    showError(error);
  }
});

async function init() {
  if (window.parent === window || !window.location.ancestorOrigins?.length
    || window.location.ancestorOrigins[0] !== 'https://da.live') {
    throw new Error('Open this plugin from the Experience Workspace tool panel.');
  }
  const { default: sdk } = await import('https://da.live/nx/utils/sdk.js');
  const host = await sdk;
  page = getPageContext(host.context);
  ({ actions } = host);
  if (!host.token) throw new Error('Sign in to DA, then reopen this panel.');
  channel = createPreviewChannel(page.pageUrl);
  status.textContent = `Page: ${page.pageUrl}`;
  await setupExperimentationConnection({
    form,
    status,
    button,
    changeButton,
    showFrame,
    hideFrame,
    requestConfig: async () => {
      latestConfig = await requestPreview('config');
    },
    createMfeUrl: (imsOrg) => getMfeUrl({
      pageUrl: page.pageUrl,
      origin: window.location.origin,
      token: host.token,
      imsOrg,
      ...getBackendOptions(window.location.search),
    }),
  });
}

init().catch((error) => {
  form.hidden = false;
  showError(error);
});

window.addEventListener('pagehide', () => {
  if (channel) {
    channel.postMessage({
      type: BRIDGE_MESSAGE, requestId: crypto.randomUUID(), action: 'clear',
    });
    channel.close();
  }
  pending.forEach((cancel) => cancel());
  pending.clear();
  hideFrame();
});
