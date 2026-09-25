# QA Capture console prototype

A zero-dependency, single-page browser utility for attaching contextual QA notes to page elements and exporting the result as a portable ZIP.

## Try it

1. Open the page you want to review.
2. Open the browser developer tools and select the Console.
3. Copy all of `qa-capture.js`, paste it into the console, and run it.
4. Enter your name, select **Start review**, and add notes.
5. Select **Export ZIP** when finished.

Review data is saved under the utility's own key in `sessionStorage`. On another page of the same origin, run the script again and the current review will be restored automatically. A full navigation removes the injected interface itself, so this console-delivered prototype must still be re-run on each page.

Some browsers display a warning before allowing pasted console code. Only bypass that warning for code you have personally inspected and trust.

While developing locally, a shorter loader is more convenient:

```js
fetch("http://localhost:8000/qa-capture.js")
  .then((response) => response.text())
  .then((source) => (0, eval)(source));
```

Serve this directory with:

```sh
python3 -m http.server 8000
```

The target site's Content Security Policy or CORS policy may prevent this loader. Pasting the complete file is the fallback.

## Bookmarklet

`bookmarklet.js` contains the bookmarklet loader and points to the GitHub Pages copy of `qa-capture.js`. Use its complete one-line contents as a bookmark's URL.

Clicking the bookmarklet always begins the add-note flow:

- On the first run, QA Capture asks for the reviewer's name and then activates element selection.
- On later same-origin pages, it restores the current session and activates selection immediately.
- If QA Capture is already running on the page, clicking the bookmarklet activates selection without loading it again.

The bookmarklet must be clicked again after each full navigation. Content Security Policy can prevent remotely hosted scripts from loading; manually pasting the complete script remains the prototype fallback.

## Export format

```text
qa-review-<timestamp>.zip
├── manifest.json
├── review.json
└── assets/
    └── note_<id>.png
```

`review.json` uses the schema identifier `qa-review/1`. Its `header` includes:

- Generator and schema version
- Reviewer-provided name
- Review start and export timestamps
- Page URL, origin, path, title, and language
- Browser name, version, and user agent
- Operating-system platform, locale, timezone, and connectivity
- Viewport, device-pixel ratio, color scheme, motion preference, and touch capability
- An explicit list of data excluded for privacy

Each note includes its text and type, page context, element selector and XPath, sanitized markup, visible text, selected computed styles, geometry, ancestors, viewport state, recent script errors, and recent failed Fetch/XHR requests.

Element images are best-effort. Browser security rules, external assets, advanced CSS, canvas, video, and iframes may prevent or reduce fidelity. A note still saves when image capture fails.

## Privacy boundaries

QA Capture does not read or export:

- Cookies
- Existing site data in `localStorage`, `sessionStorage`, or IndexedDB
- Form values
- Passwords
- Request or response bodies
- Request headers or authentication tokens

URL fragments are removed. Query strings are retained because they can be useful for reproducing a page, but parameters whose names resemble tokens, passwords, authentication values, signatures, sessions, or API keys are replaced with `[REDACTED]`.

## Prototype limitations

- The interface must be re-injected after a full refresh or navigation.
- Session restoration works only within the same browser tab and origin. Cross-origin preview pages have separate browser storage.
- Browser `sessionStorage` quotas can prevent large screenshot collections from persisting, although they can still be exported before navigating.
- Console and network diagnostics begin only after the utility starts.
- It does not capture resources loaded directly by the browser, such as failed images or stylesheets.
- Existing site code can technically inspect or interfere with any client-side utility.

Run `window.__qaCapture.destroy()` to remove the interface, event listeners, and network instrumentation.

Run `window.__qaCapture.reset()` to erase the utility's saved session and begin a new review. This does not modify any storage owned by the reviewed site.
