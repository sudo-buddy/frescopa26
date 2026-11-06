# Frescopa 2026
for AEM

> **Test Repository**: This is a test repository for demonstration purposes.

## Environments
- Preview: https://main--{repo}--{owner}.aem.page/
- Live: https://main--{repo}--{owner}.aem.live/

## Documentation

Before using the aem-boilerplate, we recommand you to go through the documentation on https://www.aem.live/docs/ and more specifically:
1. [Developer Tutorial](https://www.aem.live/developer/tutorial)
2. [The Anatomy of a Project](https://www.aem.live/developer/anatomy-of-a-project)
3. [Web Performance](https://www.aem.live/developer/keeping-it-100)
4. [Markup, Sections, Blocks, and Auto Blocking](https://www.aem.live/developer/markup-sections-blocks)

## Installation

```sh
npm i
```

## Linting

```sh
npm run lint
```

## Navigation search

The navigation modal uses the same vector-search, generative-answer, and result
metadata helpers as the Content AI search block. A compact AI summary appears
above the ranked results, with source links and the authored `Disclaimer Text`
when provided. The modal styling, default suggestions, and trending products
remain unchanged.

On the first query, it reads the authored Content AI search block from
`/search.plain.html`. Keep `Base Url`, `Content Source`, and `Content Source Type`
configured on that page. `Base Url` must point to the public search proxy, not
an upstream endpoint requiring a credential in the browser. Missing configuration
or request failures show an explicit error with a retry button, never mock results.
Both `/search` and `/gensearch` on the proxy must allow the site's origins through CORS, including
`http://localhost:3000` for development. Its `OPTIONS` responses must allow `POST`
and the `Content-Type` header; both preflight and actual responses need
`Access-Control-Allow-Origin`. This is a server-side requirement and cannot be
fixed in the browser code.

Typing is debounced by 250 ms. Results and the summary load independently after
configuration is loaded. Requests are cancelled on query changes or close, with
a 15-second results timeout and a 30-second summary timeout. Summary failures
leave results intact and offer a summary-only retry; empty answers are shown
explicitly. Up to eight unique page results are displayed in server
rank order, using at most three pages to compensate for duplicate indexed chunks.
Result links retain their indexed canonical origin; the index controls which
pages appear, including any indexed templates or demos.

## Local development

1. Create a new repository based on the `aem-boilerplate` template
1. Add the [AEM Code Sync GitHub App](https://github.com/apps/aem-code-sync) to the repository
1. Install the [AEM CLI](https://github.com/adobe/helix-cli): `npm install -g @adobe/aem-cli`
1. Start AEM Proxy: `aem up` (opens your browser at `http://localhost:3000`)
1. Open the `{repo}` directory in your favorite IDE and start coding :)

## Experimentation

For step-by-step setup and configuration, see the
[Contextual Experimentation with DA and Experience Workspace wiki](https://github.com/sudo-buddy/frescopa26/wiki/Contextual-Experimentation-with-DA-and-Experience-Workspace).
The UI adapter is the same integration proposed in
[markszulc/frescopa26#47](https://github.com/markszulc/frescopa26/pull/47);
this fork retains its own working demo configuration and runtime loading.

### Demo prerequisites

This repository runs as a **non-commerce, English-only DA experimentation demo**.
`COMMERCE_ENABLED` in `scripts/commerce.js` is false: page startup does not fetch
`/config.json`, and account/cart tools are not offered in the header. Existing
commerce blocks remain in the repository but are not configured for this demo.
Enable commerce only after supplying genuine public storefront configuration.

`placeholders/languages.json` supplies the English row required by the shared
header/footer. This is deliberately a static demo configuration. To move language
management into DA, publish an authored sheet at `/placeholders/languages`, then
remove the static JSON file so it cannot shadow the authored data.

Navigation and footer content must also be authored and previewed in DA at
`/fragments/nav` and `/fragments/footer`, or selected through the page's `nav`
and `footer` metadata. The English sheet does not create these fragments.

The DA palette compatibility stylesheet is adapted from Apache-2.0-licensed
[`adobe/da-nx`](https://github.com/adobe/da-nx/blob/main/blocks/edit/da-palette/da-palette.css)
and scoped to its Shadow DOM host. Quick edit preserves existing import-map
mappings and initializes once per preview document. A remaining ProseMirror
`TextSelection` warning is an upstream DA editor diagnostic, not proof of an
experimentation connection failure.

### Reusable agent skill

The [DA contextual experimentation skill](.github/skills/da-contextual-experimentation/SKILL.md)
documents the setup and validation workflow for other users. Copilot discovers
it in `.github/skills`; check availability with `/skills`. To use it in another
repository, copy the skill directory and port the integration files it lists,
preserving their licenses and adapting the site context. The skill is guidance,
not a bundled copy of the MFE or an automatic deployment.

### Runtime

The Adobe experimentation engine is vendored unchanged from
[`adobe/aem-experimentation`, branch `main`](https://github.com/adobe/aem-experimentation/tree/df007dd7647e559db7f09f3357c9dbdf81c4f91d)
at commit `df007dd7647e559db7f09f3357c9dbdf81c4f91d` (version 2.0.0).
Its Apache license is in `plugins/experimentation/LICENSE.md`. The former `v2`
branch was merged into `main`; use `main` for future updates. Update the three
files in `plugins/experimentation/src/` together, retain the license, update
this revision, and rerun validation.

`scripts/experiment-loader.js` runs the eager phase before main content
decoration and the lazy phase after blocks load. Ordinary pages without
experiment, campaign, or audience metadata do not load the engine.
Section metadata is detected before decoration removes it. In DA canvas
previews the engine also loads on pages without experiments so the authoring
panel can request its configuration. The preview and plugin communicate over
a same-origin BroadcastChannel scoped to the page and a random, per-tab
sessionStorage identifier. This works with DA's Shadow DOM frames, which are
not listed in `parent.frames`. No credentials are sent through this channel.
Runtime failures are logged without
preventing the rest of the site from rendering.

The production hostname is `main--frescopa26--sudo-buddy.aem.live` in
`scripts/scripts.js`; update it when adding a custom production domain.
The lazy Sidekick simulation UI is limited to preview/development and is
disabled inside DA canvas, where the dedicated panel owns the UI. No experiment
is authored, published, or activated by installing this code. Optional RUM
sampling, audience definitions, and consent integration are unchanged.
For a consent-gated experiment, author `Experiment Requires Consent: true`
and connect your consent manager using the upstream engine's consent API.

### DA contextual authoring adapter

The adapter at
`/tools/plugins/contextual-experimentation/contextual-experimentation.html`
loads the production Contextual Experimentation MFE. It supplies the current
DA page, the DA session's IMS token, and the Adobe IMS organization of that
session. Tokens are held only in memory and passed in the MFE URL
fragment, not query strings or browser storage. Never paste tokens into site
configuration or source files.

When no organization has been chosen explicitly, the panel asks Adobe IMS for
the organization of the signed-in DA session (the same organization DA shows in
its profile menu) and opens CE automatically, with no form, sign-in, or
connection click. Use **Change Adobe organization** to choose another one;
valid submitted IDs are saved to origin-scoped localStorage and take precedence
afterwards. The form appears only when the session organization cannot be
detected or the connection fails. If storage is unavailable, manual entry still works. Configuration requests retry
briefly while the preview starts; no experiment is automatically activated.

After deploying this code branch, add a row to the site's DA `library` sheet
at <https://da.live/config#/sudo-buddy/frescopa26>, preserving existing rows:

| title | path |
|-------|------|
| Contextual Experimentation | /tools/plugins/contextual-experimentation/contextual-experimentation.html |

For local plugin development, set that row's `ref` to `local` and open
<https://da.live/canvas?ref=local#/sudo-buddy/frescopa26/index> with `aem up`
running. Use Layout or Split view so the canvas preview exists. **The canvas
preview must also run the deployed runtime code**: `ref=local` alone only loads
the plugin from localhost, not the canvas site's scripts. The preview bridge
requires the deployed plugin and preview to share an origin; use a feature
branch deployed to AEM for end-to-end testing, rather than `ref=local`.
Open `https://da.live/canvas?ref={branch}#/sudo-buddy/frescopa26/index`
to load both the canvas and the registered plugin from that code branch.

The adapter relays actual engine configuration, same-site variant navigation,
and experiment hover highlighting. DA's currently available host protocol does
not expose selector-based selection or temporary DOM preview APIs. Those
operations are not implemented; this is not yet a full contextual authoring
integration. Save document changes before navigating to another variant.
Production MFE authentication and backend access require an entitled IMS
organization and must be verified in DA after deployment; local checks do not
establish that end-to-end connection.

### Validation

```sh
node --test tests/scripts/experimentation.test.mjs tests/scripts/quick-edit.test.mjs
npm run lint
npx eslint tests/scripts/experimentation.test.mjs tests/scripts/quick-edit.test.mjs
npx stylelint "tools/plugins/contextual-experimentation/*.css"
```
