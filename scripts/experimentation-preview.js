import createPreviewChannel, { BRIDGE_MESSAGE } from './experimentation-channel.js';

export function getExperimentConfig(namespace, prodHost) {
  return JSON.parse(JSON.stringify({
    experiments: namespace?.experiments || [],
    campaigns: namespace?.campaigns || [],
    audiences: namespace?.audiences || [],
    experimentation: namespace?.experimentation,
    prodHost,
  }));
}

export default function connectAuthorPreview({ prodHost }) {
  const channel = createPreviewChannel(window.location.href);
  const blockLegacyAuthorMessages = (event) => {
    const type = event.data?.type;
    if (typeof type === 'string'
      && (type.startsWith('hlx:experimentation-') || type === 'hlx:last-modified-request')) {
      // This DA panel uses the scoped channel, not the legacy simulation handshake.
      event.stopImmediatePropagation();
    }
  };
  window.addEventListener('message', blockLegacyAuthorMessages, true);
  const highlights = new Map();
  const clearHighlight = () => {
    highlights.forEach(({ value, priority }, element) => {
      if (value) element.style.setProperty('outline', value, priority);
      else element.style.removeProperty('outline');
    });
    highlights.clear();
  };

  const onMessage = (event) => {
    if (event.data?.type !== BRIDGE_MESSAGE || event.data?.response) return;
    const { requestId, action, selector } = event.data;
    if (typeof requestId !== 'string') return;
    let result;
    try {
      if (action === 'config') {
        result = getExperimentConfig(window.aem || window.hlx, prodHost);
      } else if (action === 'highlight') {
        clearHighlight();
        if (typeof selector !== 'string' || selector.length > 1024) return;
        document.querySelectorAll(selector).forEach((element) => {
          highlights.set(element, {
            value: element.style.getPropertyValue('outline'),
            priority: element.style.getPropertyPriority('outline'),
          });
          element.style.setProperty('outline', '2px solid #3b63fb', 'important');
        });
        result = true;
      } else if (action === 'clear') {
        clearHighlight();
        result = true;
      } else return;
      channel.postMessage({
        type: BRIDGE_MESSAGE, response: true, requestId, result,
      });
    } catch {
      channel.postMessage({
        type: BRIDGE_MESSAGE, response: true, requestId, error: 'Preview action failed.',
      });
    }
  };
  channel.onmessage = onMessage;
  const disconnect = () => {
    channel.close();
    window.removeEventListener('pagehide', disconnect);
    window.removeEventListener('message', blockLegacyAuthorMessages, true);
    clearHighlight();
  };
  window.addEventListener('pagehide', disconnect, { once: true });
  return disconnect;
}
