# Mobile capture widget plan

Status: steps 1 to 5 implemented on `feat/mobile-tap-confirm` (widget 0.4.17); not yet tested on real devices
Last updated: November 17, 2026
Scope: the capture widget (`qa-capture.js`) only. The developer dashboard is out of scope for mobile work.

## Goals

1. On a phone, the reviewer always sees what they selected before writing a note.
2. The widget never covers what the reviewer is commenting on unless they want it to.
3. Menus, drawers, and accordions can be noted, and the reviewer is told what to do when one closes.
4. Screenshots are easier to take on desktop and clearly guided on mobile.

## Reviewer flow (mobile)

1. **Arrive.** Opening an invitation or shared link shows a sheet with the project name, a name field, and **Start review**, followed by one dismissible tip: "Tap +, then tap the part of the page you want to comment on."
2. **Resting.** The page is fully usable. A small draggable dock holds the well mark (with a saved-note count badge) and a **+** button. Pins mark noted elements.
3. **Targeting.** Tapping **+** shows a thin banner ("Tap an element · Cancel"). Taps now select instead of activating the page. Scrolling still works.
4. **Confirm.** A tap highlights the element and shows a bar with two choices: **Make a note on this** and **Choose a different area**. Tapping elsewhere on the page also moves the highlight. There are no bigger/smaller controls.
5. **Write.** A sheet covering three quarters of the screen rises above the keyboard with note type, feedback, and screenshot controls. The selected element stays visible above it where possible.
6. **Out of the way.** A handle on the sheet hides all widget UI so the reviewer can look at the page again (see below). Tapping the marker brings everything back with the note intact.
7. **Save.** A toast confirms the save and the widget returns to resting.
8. **Review and submit.** Tapping the well mark opens a full-height sheet listing notes (edit, delete), sync status, and **Submit review**. Submission logic is unchanged.

The large-area warning in the note panel is dropped on mobile because the highlight already shows what was selected.

## Out of the way mode

Used both for reference ("let me look again") and for mobile screenshots.

- Every widget element leaves the screen: sheet, dock, pins, toast.
- One marker remains: the well icon, translucent, about fingertip size, at the screen edge, draggable.
- The icon is rendered as a single-color (white) silhouette with `mix-blend-mode: difference`, so it inverts against whatever is behind it. Because the widget's shadow host is its own stacking context, the blend is applied to the host element while this mode is active (only the marker is visible then). A faint outline ring keeps it findable over mid-gray or busy areas.
- WebKit (Safari) does not blend with the page canvas, the background a site sets on `html` or `body`. The marker checks what is behind it: over painted elements it keeps the inverting blend; over the canvas it switches to a solid dark or light icon chosen by the canvas color's luminance. It rechecks on scroll, resize, and drag.
- It pulses slowly so it reads as "waiting on you," not "minimized." With `prefers-reduced-motion`, it is static.
- Tapping it restores the previous state exactly, including unsaved note text.
- **Reference mode** keeps the selection highlight visible. **Screenshot mode** hides it.
- While in this mode, page taps stay blocked so the reviewer cannot navigate away by accident. Scrolling and pinch zoom work.

## Screenshots

Automatic DOM-reconstruction screenshots are **not** being built. They were removed earlier because cross-origin resources made them unreliable (see `current-state-handoff.md`), and the remaining failure modes (iframes, video, fonts, some CSS) could produce misleading images.

### Desktop

- A **Screenshot** button in the note sheet.
- Pressing it hides the widget, requests screen sharing (`getDisplayMedia`, preferring the current tab where the browser supports it), grabs one frame, stops sharing immediately, restores the widget, and attaches the image as a note screenshot.
- The browser shows a permission prompt every time. The button appears only in Chromium browsers (Chrome, Edge, Arc, Brave), which can share a single tab; Safari and Firefox can only share a whole window or screen, so they keep attach, paste, and drop. If the reviewer picks anything other than a tab, the capture is discarded.
- Manual attach (choose file, paste, drop) remains.
- Screen capture exists only on HTTPS pages. On a desktop HTTP staging site the Screenshot button is hidden and attach, paste, and drop remain.
- After returning from phone screenshot mode, the tap on the marker opens the photo picker directly.

### Mobile

Mobile browsers offer no way for a page to capture the screen, so mobile screenshots are taken with the phone's own buttons.

1. In the note sheet the reviewer taps **Take screenshot**.
2. A popup explains that phones don't let websites take screenshots automatically, then lists the steps: press **Hide QAWELL** (reopening anything that closed, staying on the page), take a screenshot with the phone's buttons, press the QAWELL icon to come back and attach it. Buttons: **Cancel** and **Hide QAWELL**. A backdrop tap or Escape also cancels.
3. Screenshot mode starts (out of the way, no highlight).
4. Tapping the marker returns to the sheet with **Attach your screenshot** front and center, opening the photo picker.

Known limits:

- The marker appears in the screenshot. It is small, translucent, and at the edge, but cannot be removed.
- Browsers do not tell a page when a screenshot is taken, so the reviewer must tap to come back.

Copy for "paste or drop" is removed on touch devices.

## Menus, drawers, and other things that close

### Prevention

- Every touch, pointer, and mouse event that starts on the widget is stopped at a window-level capture listener so page code never sees it. Tapping **+** or the confirm bar then no longer counts as an outside click.
- In targeting mode, page `pointerdown`, `touchstart`, `mousedown`, and their up events are intercepted the same way, not only `click` (today only `click` is blocked, at `qa-capture.js:327`).
- Touch targeting stops relying on `click`, which iOS does not reliably fire on non-interactive elements.
- The element context (selector, styles, geometry) is captured **at tap time** instead of on save, so a note stays complete if the element closes later.

Some components will still close: ones that close on focus loss, on window blur (including the desktop screen share prompt), or that registered their own listeners before the widget loaded.

### Detection and guidance

1. **Prediction at tap time.** If the tapped element is inside something that looks toggleable, the confirm bar adds a tip: "This looks like a menu that may close. If you need a screenshot of it open, take one now, before you continue." Signals: an ancestor or controlling element with `aria-expanded="true"`, an open `<details>`, an open `<dialog>`, `role` of `menu`, `menubar`, `listbox`, or `dialog`, or a fixed or absolutely positioned overlay container.
2. **Observation while writing.** The highlighted element is watched. If it becomes hidden, collapses to zero size, or is removed, the sheet says: "The menu closed. Your note is still attached to it. To include a screenshot of it open, reopen it and take one, then attach it here."

Screenshot mode leaves the page usable (reference mode does not) so a closed menu can be reopened before the screenshot. The reviewer is asked to stay on the page, since leaving it loses the unsaved note.

Prediction catches most cases early but misses sites without proper markup. Observation is reliable but only fires after the fact.

## Dock

- Mobile: freely draggable, kept inside the safe area, position remembered per project. A movement threshold separates tap from drag.
- The existing **move widget** button remains as the keyboard alternative.
- Desktop dock behavior is unchanged.

## Desktop impact

Desktop also gets: event shielding, tap-time context capture, open/close detection, and the screen-share Screenshot button. Desktop panels keep their current floating layout.

## Build order

1. **Targeting and shielding.** Tap, highlight, confirm bar, window-level event shielding, tap-time context capture, iOS-safe targeting.
2. **Sheet and out of the way mode.** Three-quarter sheet for all mobile panels, keyboard handling via `visualViewport`, out of the way marker with blend inversion and reduced-motion support.
3. **Screenshots.** Desktop screen-share capture; mobile guided screenshot flow.
4. **Open/close detection.** Prediction tip and observation message.
5. **Draggable dock.**

## Release risk

`https://qawell.dev/capture.js` proxies the GitHub Pages copy of `qa-capture.js` (`apps/web/src/app/capture.js/route.ts`), so every merge to `main` reaches every client site immediately. A separate preview copy of the script is needed for testing on real phones before release.

## Open items

- Ship-standards waiver for this work has not been recorded in `.claude/ship-standards.json`. Without it, the standards apply to widget code that is touched.
- The server allows up to five screenshots per note; the widget allows one. Not changed by this plan.
