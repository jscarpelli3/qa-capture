# Installing and Running QA Capture

Status: Current prototype deployment  
Capture script version: `0.1.0`

This document describes how the browser capture utility itself is hosted, installed, activated, and removed. For ZIP parsing, see [`archive-format.md`](archive-format.md).

## Hosted files

The source repository is:

```text
https://github.com/jscarpelli3/qa-capture
```

GitHub Pages publishes the `main` branch from the repository root. The live files are:

```text
Capture script:
https://jscarpelli3.github.io/qa-capture/qa-capture.js

Bookmarklet source:
https://jscarpelli3.github.io/qa-capture/bookmarklet.js

Project page:
https://jscarpelli3.github.io/qa-capture/
```

GitHub Pages serves `qa-capture.js` as `application/javascript` over HTTPS. A browser must be able to load that origin under the reviewed site's Content Security Policy.

The current URL tracks the latest `main` deployment. Before broader distribution, releases should also publish immutable versioned paths such as:

```text
https://jscarpelli3.github.io/qa-capture/releases/0.1.0/qa-capture.js
```

Production integrations should pin a version instead of silently following `main` once immutable releases exist.

## Runtime characteristics

`qa-capture.js` is a self-executing browser script. It has no framework or runtime dependencies and does not need React, WordPress, or a package manager.

When it runs, it:

1. Creates an isolated Shadow DOM interface.
2. Asks for the reviewer's display name if no session exists.
3. Lets the reviewer select an element and create a note.
4. Captures ordinary page, element, style, viewport, and diagnostic context.
5. Stores the working session under its own `sessionStorage` key.
6. Generates the review ZIP entirely in the browser.

It does not currently send review data to a server. **Export ZIP** is the only delivery mechanism in the current release.

## Option A: Bookmarklet

Use this for ad hoc reviews without changing the target site.

1. Open the hosted [`bookmarklet.js`](https://jscarpelli3.github.io/qa-capture/bookmarklet.js).
2. Copy its complete one-line contents, including the `javascript:` prefix.
3. Create a browser bookmark named **QA Capture**.
4. Paste the copied line into the bookmark's URL field.
5. Open the page to review and click the bookmark.

Behavior:

- On first use for an origin and tab, the reviewer enters their name and then selects an element.
- If the utility is already present, clicking the bookmark immediately activates add-note selection.
- After a full navigation, click the bookmark again. The existing same-origin, same-tab session is restored and selection activates immediately.
- Single-page application navigation does not remove the utility because the document remains loaded.

Possible blocker: a site's Content Security Policy may disallow scripts from `https://jscarpelli3.github.io`. If the bookmark appears to do nothing, inspect the browser console for a `script-src` CSP error.

## Option B: Direct script tag

Use this when QA Capture should load automatically throughout a staging or preview site:

```html
<script src="https://jscarpelli3.github.io/qa-capture/qa-capture.js"></script>
```

Place it in `<head>` to observe errors and failed requests as early as possible. Loading it near the end of `<body>` also works, but diagnostics begin later.

Do not include the script in a public production build unless exposing the QA interface there is intentional.

If the site has a Content Security Policy, its `script-src` policy must permit:

```text
https://jscarpelli3.github.io
```

The exact CSP modification depends on the existing policy. Do not weaken a nonce- or hash-based policy broadly just to accommodate the prototype.

## Option C: React staging site

The script is independent of React. Add it to the HTML template used only by preview or staging deployments:

```html
<script src="https://jscarpelli3.github.io/qa-capture/qa-capture.js"></script>
```

For environment-controlled injection in application code:

```ts
export function installQaCapture() {
  if (import.meta.env.PROD) return;
  if (document.querySelector("script[data-qa-capture]")) return;

  const script = document.createElement("script");
  script.src = "https://jscarpelli3.github.io/qa-capture/qa-capture.js";
  script.dataset.qaCapture = "";
  document.head.appendChild(script);
}
```

Call it once from the application's startup path. For Create React App, use its environment convention rather than `import.meta.env.PROD`.

Prefer build-time environment checks over hostname substring checks. Preview platforms may expose unexpected hostnames, and hostname logic is easy to copy into production incorrectly.

## Option D: WordPress staging site

WordPress should enqueue the hosted file instead of editing `header.php` directly:

```php
add_action( 'wp_enqueue_scripts', function () {
    if ( 'production' === wp_get_environment_type() ) {
        return;
    }

    wp_enqueue_script(
        'qa-capture',
        'https://jscarpelli3.github.io/qa-capture/qa-capture.js',
        array(),
        '0.1.0',
        false
    );
} );
```

The final `false` instructs WordPress to place the script in `<head>`.

Set the environment in `wp-config.php` before WordPress's stop-editing comment:

```php
define( 'WP_ENVIRONMENT_TYPE', 'staging' );
```

Set the production clone to:

```php
define( 'WP_ENVIRONMENT_TYPE', 'production' );
```

If the script is enqueued unconditionally on an unprotected staging site, every visitor will see the QA interface. Add an authenticated capability check or use the bookmarklet when that is undesirable.

## Session persistence

The working review uses:

```text
sessionStorage key: __qaCaptureSession_v1
```

Properties:

- Scoped to the current origin and browser tab
- Survives refreshes and full same-origin navigation
- Does not cross into a different origin
- Ends when the browser discards that tab's session storage
- May exceed browser quotas when many images are captured

Automatic script-tag installation reloads the utility on each page, after which it restores the saved session. Bookmarklet installation requires clicking the bookmark again after each full page load.

The utility does not read storage owned by the reviewed site.

## Browser control API

While loaded, the utility exposes:

```js
window.__qaCapture
```

Available methods:

```js
window.__qaCapture.addNote(); // enter element-selection mode
window.__qaCapture.open();    // open setup or information panel
window.__qaCapture.export();  // export the current ZIP
window.__qaCapture.getData(); // return the current review object
window.__qaCapture.destroy(); // remove UI and instrumentation; preserve session
window.__qaCapture.reset();   // erase the saved session and start over
```

`getData()` is useful for development but must not be treated as trusted data merely because it came from the capture utility.

## Reviewer workflow

1. Activate or load QA Capture.
2. Enter a reviewer name on first use.
3. Hover until the intended element is outlined.
4. Click the element.
5. Choose a note-type pill.
6. Enter feedback and save.
7. Repeat across the page or site.
8. Select **Export ZIP**.
9. Import the ZIP into a compatible adapter such as Agency Brain.

Each note records its own `window.innerWidth`, `window.innerHeight`, outer-window dimensions, device-pixel ratio, and scroll position at capture time. Resizing between notes is therefore preserved.

## Privacy and security boundaries

The current capture utility intentionally excludes:

- Cookies
- Existing site web-storage contents
- Form values and passwords
- Request and response bodies
- Request headers and authentication tokens

It removes URL fragments and redacts query parameters whose names resemble tokens, secrets, passwords, authentication values, sessions, signatures, or API keys.

Captured content is still untrusted and may be sensitive. Only run the utility on sites and pages where the reviewer is authorized to capture QA context.

## Troubleshooting

### Clicking the bookmark does nothing

- Open developer tools and inspect the console.
- Look for a Content Security Policy error.
- Confirm JavaScript bookmarklets are permitted by the browser.
- Confirm the bookmark URL begins with `javascript:` and was not converted into a search query.
- Open the hosted script URL directly to verify network access.

### Notes disappear after navigation

- Confirm the destination is the same origin, including protocol and port.
- If using a bookmarklet, activate it again on the new document.
- Check whether the browser blocks session storage.
- Large screenshot collections may exceed the session-storage quota.

### The utility appears in production

- Remove the script from the production HTML or build.
- Verify environment configuration rather than hostname assumptions.
- For WordPress, confirm `WP_ENVIRONMENT_TYPE` is `production`.

### Element image is missing

Element-image capture is best-effort. Cross-origin assets, canvas, video, iframes, browser restrictions, and advanced CSS can prevent capture. The note and its structured context remain valid without an image.
