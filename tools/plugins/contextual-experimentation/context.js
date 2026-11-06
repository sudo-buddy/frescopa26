export const MFE_ORIGIN = 'https://experience.adobe.com';

const IMS_ORG_STORAGE_KEY = 'da:contextual-experimentation:ims-org';
const IMS_ORG_PATTERN = /^[a-z0-9]+@AdobeOrg$/i;

export function rememberImsOrganization(input) {
  try {
    const saved = window.localStorage.getItem(IMS_ORG_STORAGE_KEY);
    if (IMS_ORG_PATTERN.test(saved)) input.value = saved;
  } catch {
    // Keep manual entry available when browser storage is blocked.
  }
  input.form.addEventListener('submit', () => {
    const imsOrg = input.value.trim();
    if (!IMS_ORG_PATTERN.test(imsOrg)) return;
    try {
      window.localStorage.setItem(IMS_ORG_STORAGE_KEY, imsOrg);
    } catch {
      // Connecting still works when storage is full or blocked.
    }
  });
}

const IMS_ORGANIZATIONS_URL = 'https://ims-na1.adobelogin.com/ims/organizations/v5';

function getTokenClientId(token) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const { client_id: clientId } = JSON.parse(atob(payload));
    return typeof clientId === 'string' && /^[\w.-]+$/.test(clientId) ? clientId : null;
  } catch {
    return null;
  }
}

// Mirrors DA's profile menu: the first organization of the signed-in IMS profile.
export async function getSessionOrganization(token, fetchImpl = fetch) {
  const clientId = typeof token === 'string' && getTokenClientId(token);
  if (!clientId) return null;
  try {
    const url = new URL(IMS_ORGANIZATIONS_URL);
    url.searchParams.set('client_id', clientId);
    const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return null;
    const organizations = await response.json();
    if (!Array.isArray(organizations)) return null;
    return organizations
      .map(({ orgRef } = {}) => `${orgRef?.ident}@${orgRef?.authSrc}`)
      .find((id) => IMS_ORG_PATTERN.test(id)) || null;
  } catch {
    return null;
  }
}

export async function setupExperimentationConnection({
  form, frame, status, button, changeButton, requestConfig, createMfeUrl,
  resolveOrganization = async () => null,
}) {
  const input = form.querySelector('[name="imsOrg"]');
  let connecting = false;
  const connect = async () => {
    if (connecting) return;
    connecting = true;
    button.disabled = true;
    changeButton.disabled = true;
    status.hidden = false;
    status.textContent = 'Connecting to the canvas runtime...';
    try {
      await requestConfig();
      frame.src = createMfeUrl(input.value.trim());
      form.hidden = true;
      status.hidden = true;
      frame.hidden = false;
      changeButton.hidden = false;
    } catch (error) {
      form.hidden = false;
      frame.hidden = true;
      frame.removeAttribute('src');
      changeButton.hidden = true;
      status.hidden = false;
      status.textContent = error.message || 'The experimentation connection failed.';
    } finally {
      connecting = false;
      button.disabled = false;
      changeButton.disabled = false;
    }
  };
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    await connect();
  });
  changeButton.addEventListener('click', () => {
    frame.hidden = true;
    frame.removeAttribute('src');
    form.hidden = false;
    changeButton.hidden = true;
    status.hidden = true;
    input.focus();
  });
  if (!IMS_ORG_PATTERN.test(input.value.trim())) {
    const pageStatus = status.textContent;
    status.hidden = false;
    status.textContent = 'Finding your Adobe organization...';
    const organization = await resolveOrganization().catch(() => null);
    if (IMS_ORG_PATTERN.test(organization)) input.value = organization;
    status.textContent = pageStatus;
  }
  button.disabled = false;
  if (IMS_ORG_PATTERN.test(input.value.trim())) {
    form.hidden = true;
    await connect();
  } else {
    form.hidden = false;
  }
}

export function getPageContext(context) {
  const {
    org, repo, site = repo, branch, path = '/',
  } = context;
  if (![org, site, branch].every((part) => typeof part === 'string'
    && /^[a-z0-9-]+$/.test(part))) {
    throw new Error('DA has not resolved this site and its code branch. Reopen the panel.');
  }
  const origin = `https://${branch}--${site}--${org}.preview.da.live`;
  const page = new URL(`/${path.replace(/^\/+/, '')}`, origin);
  page.search = '';
  page.hash = '';
  return {
    org, site, origin, pageUrl: page.href,
  };
}

export function getEditorHash(href, context) {
  const url = new URL(href, context.origin);
  if (url.origin !== context.origin || url.username || url.password) {
    throw new Error('The MFE requested navigation outside this DA site.');
  }
  const path = url.pathname.replace(/\.html$/, '').replace(/^\/+|\/+$/g, '') || 'index';
  return `/${context.org}/${context.site}/${path}`;
}

export function getMfeUrl({
  pageUrl, origin, token, imsOrg,
}) {
  if (!token || !IMS_ORG_PATTERN.test(imsOrg)) {
    throw new Error('Sign in to DA and supply a valid Adobe IMS organization ID.');
  }
  const url = new URL(
    '/solutions/ExpSuccess-aem-experimentation-mfe/static-assets/resources/ue.html',
    MFE_ORIGIN,
  );
  const data = {
    triggerSource: 'ue',
    env: 'prod',
    origin,
    pageUrl,
    imsToken: token,
    imsOrg,
    colorScheme: 'light',
    locale: 'en-US',
  };
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  url.hash = `ue-data=${encodeURIComponent(btoa(String.fromCharCode(...bytes)))}`;
  return url.href;
}

export function isMfeMessage(event, frame) {
  return event.origin === MFE_ORIGIN && event.source === frame.contentWindow
    && event.data?.source === 'AEMExperimentation';
}
