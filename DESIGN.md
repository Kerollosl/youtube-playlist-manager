# Integrated YouTube selection controls

## Direction

YouTube's incumbent visual world is pinned. Use Roboto with Arial fallback, neutral native surfaces, a single YouTube blue action accent, consistent 20px SVG icons, and clear blue selected card surfaces. Do not introduce an independent dashboard, brand system, decorative motion, or oversized status panels.

## Themes

The content script host sits outside `ytd-app`; it explicitly mirrors the document root's `dark` attribute. Shadow controls use local tokens rather than assuming inherited YouTube theme variables.

| Token | Light | Dark |
| --- | --- | --- |
| Surface | #ffffff | #212121 |
| Text | #0f0f0f | #f1f1f1 |
| Secondary text | #606060 | #b6b6b6 |
| Border | #e0e0e0 | #464646 |
| Hover | #f2f2f2 | #383838 |
| Primary action | #065fd4 | #3ea6ff |
| Primary action text | #ffffff | #0f0f0f |
| Error text | #b3261e | #ffb4ab |

## Layout and hierarchy

A 56px floating bottom toolbar sits 20px from the desktop edge and 12px on narrow viewports. It contains the selection count, Copy links, Select all, Deselect all, More, and Close. The menu contains Cut, Copy, Save to playlist, Copy links, and Delete selected. Save stays in the menu.

While selection mode is enabled, clicking anywhere in a video card selects or deselects it instead of opening the video. The native card layout stays in place. Selected cards use a solid blue surface and a 44px blue corner checkmark. Keyboard users can toggle the same selection through a focusable checkbox, with a visible card focus outline. Shift-click selects or clears a range.

Toasts are capped at 420px and use brief status copy. Errors expose Details, which preserves the full message and links to the reader check. Reader JSON remains in a collapsed technical disclosure. Dialogs use a native surface, 20px title, close control, labeled 44px inputs, slim scrollable lists, and separated action footer.

At 560px and below, the count denominator and Copy links text hide while full accessible labels remain. The toolbar retains 44px hit targets and fits 375px. Dialogs fit the viewport with 12px outer inset. At 340px and below, Copy links is available from More while Select all and Deselect all remain directly accessible.

## Interaction

All interactive controls have visible focus and hover states. More supports Arrow Up/Down, Home, End, and Escape. Dialogs trap focus and restore it on close; Escape closes the dialog. Async operation state disables affected controls. Reduced-motion disables color transitions. Errors persist until another status supersedes them or the user opens their details.

## Data boundaries

Only rendered rows in the current page container participate in inline selection. Playlist pages use playlist video rows, excluding watch panels and stale pages. A verified complete snapshot supplies the total denominator. Selection and mutation safeguards remain in the existing adapter/worker flow.
