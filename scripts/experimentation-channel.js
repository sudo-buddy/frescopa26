export const BRIDGE_MESSAGE = 'da:contextual-experimentation';

export function requestPreviewAction(channel, pending, action, details = {}) {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    let timer;
    let retry;
    let onMessage;
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(retry);
      channel.removeEventListener('message', onMessage);
      pending.delete(requestId);
      if (error) reject(error);
      else resolve(result);
    };
    onMessage = ({ data }) => {
      if (data?.type !== BRIDGE_MESSAGE || !data.response || data.requestId !== requestId) return;
      finish(data.error ? new Error(data.error) : null, data.result);
    };
    const send = () => {
      try {
        channel.postMessage({
          type: BRIDGE_MESSAGE, requestId, action, ...details,
        });
      } catch (error) {
        finish(error);
      }
    };
    channel.addEventListener('message', onMessage);
    pending.set(requestId, () => finish(new Error('The experimentation panel was closed.')));
    timer = setTimeout(() => finish(new Error('The canvas runtime did not respond. Open Layout or Split view and check that this code branch includes the experimentation runtime.')), 10000);
    if (action === 'config') retry = setInterval(send, 500);
    send();
  });
}

export default function createPreviewChannel(pageUrl) {
  const url = new URL(pageUrl);
  if (url.origin !== window.location.origin) {
    throw new Error('Open the deployed DA plugin on the same code branch as the canvas preview.');
  }
  // Same-origin frames share sessionStorage within a tab, including inside Shadow DOM.
  let session;
  try {
    session = window.sessionStorage.getItem(BRIDGE_MESSAGE);
    if (!session) {
      session = crypto.randomUUID();
      window.sessionStorage.setItem(BRIDGE_MESSAGE, session);
    }
  } catch {
    throw new Error('Allow browser storage for this DA preview to connect the experimentation panel.');
  }
  const path = url.pathname.replace(/\.html$/, '').replace(/\/index$/, '/')
    .replace(/\/+$/, '') || '/';
  return new BroadcastChannel(`${BRIDGE_MESSAGE}:${session}:${path}`);
}
