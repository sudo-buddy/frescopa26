---
name: da-contextual-experimentation
description: Set up, port, test, or troubleshoot the production Contextual Experimentation MFE in Document Authoring Experience Workspace on an AEM Edge Delivery Services site. Use for DA canvas registration, experimentation runtime wiring, remembered IMS organization IDs, same-origin preview transport, and safe experiment lifecycle validation.
---

# Contextual experimentation in DA

Use this workflow for a DA-backed AEM Edge Delivery Services site. This skill
contains instructions, not the integration code or the production MFE.

## Establish the contract

1. Read the target repository's `AGENTS.md` and deployment instructions.
2. Determine the actual GitHub owner, repository, and code branch:
   ```sh
   gh repo view --json nameWithOwner --jq .nameWithOwner
   git branch --show-current
   git status --short
   ```
3. Preserve the site's existing runtime, commerce, language, and editor setup.
   This workflow adds a DA UI adapter, not a storefront or runtime replacement.
4. Confirm an entitled Adobe IMS organization and a signed-in DA session. Never
   hardcode an organization ID or token in source, examples, PRs, or this skill.
5. Ask for explicit authorization before creating content, publishing,
   activating, stopping, or deleting experiments. Use a dedicated test page,
   not the homepage. EDS branches isolate code, not authored content: publishing
   a test page can make that content available on other code branches.

## Integration files

In this repository, inspect:

- `scripts/experiment-loader.js`: existing loading and DA canvas detection.
- `scripts/experimentation-preview.js`: configuration and highlight bridge.
- `scripts/experimentation-channel.js`: same-origin preview transport.
- `tools/plugins/contextual-experimentation/context.js`: context, navigation,
  organization persistence, MFE URL, and message validation.
- `tools/plugins/contextual-experimentation/contextual-experimentation.js`,
  `.html`, and `.css`: DA SDK bootstrap and panel.
- `scripts/scripts.js`: conditional preview-bridge bootstrap.
- `tests/scripts/experimentation.test.mjs` and the README's Experimentation section.

For human-readable setup instructions, see the
[DA and Experience Workspace wiki](https://github.com/sudo-buddy/frescopa26/wiki/Contextual-Experimentation-with-DA-and-Experience-Workspace).

To port the integration, transfer these files and their directly dependent
loading changes into the target repository, reconcile its conventions, and
preserve licenses. Do not modify `scripts/aem.js` or replace an already installed
runtime. Do not copy confidential MFE source into a public site repository.
Check the existing runtime's API and preserve its eager/lazy loading behavior.
If a target has no runtime, treat installation as a separate, explicitly agreed
prerequisite; upstream `adobe/aem-experimentation` uses main, not the removed v2.
Set the actual production hostname reported by the preview bridge.

DA canvas previews must expose genuine engine configuration even when there
are no experiments. Preserve consent requirements; do not grant consent or
change RUM sampling implicitly.

## Register and open the DA panel

Open `https://da.live/config#/{owner}/{repo}` and add this row to the `library`
sheet, preserving all existing rows and columns:

| title | path |
|-------|------|
| Contextual Experimentation | /tools/plugins/contextual-experimentation/contextual-experimentation.html |

Use the configuration UI's supported save action and verify the row persists
in a newly opened canvas. Do not assume clicking a save control opens a menu.

Deploy the code branch, then open:

`https://da.live/canvas?ref={branch}#/{owner}/{repo}/{page}`

Use Layout or Split view so a preview iframe exists, and explicitly select
**Contextual Experimentation** in the tool list. Do not send speculative
End/Enter key sequences that could instead focus or edit page content.

The plugin and preview must use the same branch's origin:

`https://{branch}--{repo}--{owner}.preview.da.live`

DA's Shadow DOM iframes are not reliably enumerated by `window.parent.frames`.
Use the shared, canonical-page-scoped preview channel, not sibling frame
enumeration. Do not send credentials over that channel. Local plugin
development with `ref=local` does not establish a deployed same-origin E2E
connection; prefer a deployed feature branch for integration testing.

## Authentication and remembered organization

Load the guest SDK from `https://da.live/nx/utils/sdk.js`. Use the actual
SDK-resolved page context and its in-memory token.

The production MFE is:

`https://experience.adobe.com/solutions/ExpSuccess-aem-experimentation-mfe/static-assets/resources/ue.html`

The adapter supplies its supported `ue-data` fragment with the host origin,
page URL, IMS organization, token, production environment, and UI preferences.
Keep tokens out of query strings, storage, logs, screenshots of developer
tools, and repository artifacts.

The connection form remembers only valid submitted organization IDs under
`da:contextual-experimentation:ims-org` in origin-scoped localStorage. Prefill
the form; do not automatically connect or activate anything. A new valid
submission replaces the value. Invalid input or blocked/full storage must not
prevent manual entry. Main and feature branches have separate storage origins,
so users enter the ID once on each origin/browser.

Accept MFE messages only from both its exact production origin and actual
iframe window. Support genuine configuration requests, validated same-site
navigation, and highlight/clear requests. Do not claim selector-based editing,
temporary content previews, or unsupported DA save actions are implemented.
Save authored changes before navigating to a different variant.

## Validate safely

Run the target repository's documented commands. In this repository:

```sh
node --test tests/scripts/experimentation.test.mjs tests/scripts/quick-edit.test.mjs
npm run lint
npx eslint tests/scripts/experimentation.test.mjs tests/scripts/quick-edit.test.mjs
npx stylelint "tools/plugins/contextual-experimentation/*.css"
git diff --check
```

Validate in real DA, not only in a mock with ordinary DOM iframes:

1. Confirm the expected code branch, genuine runtime version/configuration, and
   successful preview-channel reply.
2. Submit an authorized organization, confirm the MFE renders, then reload or
   reopen the panel and verify prefill without re-entry. Never print the token.
3. Check actual backend HTTP statuses, not fabricated empty results.

After the MFE loads, unrestricted accessibility snapshots can expose its
token-bearing iframe URL. Use screenshots and safe evaluations through known
element handles returning only status/visibility booleans. Do not return iframe
`src`, location fragments, raw authentication context, request headers, or
credential-bearing snapshots, even to temporary files.

If browser automation is unavailable or hangs, report that blocker and request
the smallest necessary manual step. Do not claim an automated browser check
passed because deployed source files match or unit tests pass.

For an authorized lifecycle test, use identifiable control/challenger content
and a bounded date range. Verify inactive draft behavior, activation, configured
allocation, real variant replacement and HTTP success, a working CTA, and
published deactivation. Check stopped behavior on a fresh **unforced** URL:
simulation query parameters can deliberately force an inactive experiment.

An API-driven DA/AEM runtime cycle is not proof that the full MFE
Save/Activate/Stop UI works. CTA navigation is not proof of analytics ingestion.
Record these as separate results. Leave the test stopped and report any
published pages that remain. Refresh browser-cached variant responses when
checking newly published fixture changes.

## Troubleshoot by owner and resource

- Missing commerce configuration, language sheets, or navigation/footer
  fragments are site prerequisites, not UI adapter changes. Diagnose them
  separately; do not fabricate content or change storefront behavior here.
- Palette stylesheet errors and import-map conflicts belong to the editor
  integration. Keep their fixes separate from this contextual UI change.
- ProseMirror `TextSelection` warnings: trace the DA editor/selection stack
  separately. Do not patch minified vendor code or `scripts/aem.js` to hide it.
- MFE version lookup requesting removed `v2/package.json`: report it as a
  production-MFE dependency issue; the site's runtime should still use main.
- Core scripts/styles missing after merge: verify Code Sync and compare
  decompressed deployed assets with the merged source before altering code.
  A site administrator can request a Code Bus resync through the authenticated
  Admin API when necessary; inspect the job's failed count and completion.

Current DA sessions can use the host's `daFetch` helper from
`https://da.live/nx2/utils/api.js` for authorized admin operations. Let it handle
authentication; return only HTTP status and safe job progress. Do not extract
tokens to a shell or include authorization headers in diagnostics.

## Deployment and handoff

Use a feature branch. Inspect and preserve the target PR template. Include a
real `.aem.page` URL illustrating the change and the DA feature-canvas URL.
Report exact validation commands with results, and distinguish runtime,
browser UI, backend access, and analytics validation.

Use `gh pr checks` to inspect actual Code Sync/performance results. After a
human merges, verify main serves the tested assets and point users to the
normal main canvas URL without the feature `ref`. Remind them that organization
prefill on main requires its own first submission.

Do not auto-merge, publish real content, or activate a production experiment
without authorization. Finish with verified outcomes and explicit remaining
limitations.
