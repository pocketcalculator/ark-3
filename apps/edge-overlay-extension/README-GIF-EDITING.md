# GIF editing and customization

This guide is for maintainers of the Microsoft Edge GIF overlay extension.
End users should follow [README-INSTALL.md](README-INSTALL.md).

## Asset expectations

- Store selectable animations in [`assets/`](assets/).
- Use an actual animated GIF with a `.gif` filename. Renaming another format to
  `.gif` does not convert it and can cause the built-in fallback to appear.
- Use only assets you created, that are licensed for redistribution, or that
  you are otherwise authorized to use. Do not commit an asset unless its terms
  permit repository redistribution.
- Prefer simple lowercase filenames with hyphens, such as
  `status-celebration.gif`. Paths and filenames are case-sensitive in some
  development and deployment environments.
- Preserve all animation frames when editing or optimizing. An export that
  flattens the image to one frame will still load, but it will no longer move.

The overlay uses `object-fit: contain`, so it preserves the GIF's aspect ratio
and scales it within the viewport. There is no required pixel size or
implementation-enforced file-size limit. As a practical starting point, use a
source around 480–720 pixels on its longest edge and aim for 5 MB or less.
Reduce dimensions, frame rate, frame count, or color count if loading is slow.
Check the optimized file visually because aggressive GIF optimization can
change frame disposal, transparency, timing, or looping.

## Authorized-user Duck Hunt slot

The selectable option is already configured in
[`gif-options.js`](gif-options.js):

```text
assets/duck-hunt-dog-authorized.gif
```

The repository intentionally does not include that animation. To use the slot,
place a GIF you are authorized to use at the exact path above. No code or
manifest change is needed. If redistribution is not authorized, keep the file
local and do not commit it.

Do not extract or copy assets from games, videos, or websites unless you
already have the necessary authorization. Selecting this option while its file
is absent or invalid shows the extension's built-in CSS fallback.

## Add a selectable GIF

1. Copy the authorized GIF into `assets/`.
2. Add an object to `ARK3_GIF_OPTIONS` in
   [`gif-options.js`](gif-options.js):

   ```js
   Object.freeze({
     id: "status-celebration",
     label: "Status celebration",
     path: "assets/status-celebration.gif",
   }),
   ```

3. Give `id` a stable, unique value. `label` is the text shown in the popup's
   **Animation** list. `path` is relative to the extension root.
4. Reload the unpacked extension and validate it as described below.

The existing `assets/*.gif` entry in [`manifest.json`](manifest.json) makes
GIFs in that directory available to webpages. Adding another `.gif` there does
not require an individual manifest entry.

## Remove or rename a selectable GIF

- **Remove:** delete its object from `gif-options.js`, then delete the asset if
  it is no longer used and may be removed.
- **Rename the label only:** change only `label`.
- **Rename the file:** rename the asset and update the object's `path`.
- **Rename the ID:** update `id`, but treat this as a migration. Edge may still
  have the old ID in local extension storage; the popup safely falls back to a
  valid configured option.

Keep at least one configured option. With an empty options array, the popup
reports **No GIF assets are configured.** and cannot enable the overlay.

## Validate changes

1. Open `edge://extensions` and select **Reload** on **ARK-3 GIF Overlay**.
2. Reload a normal `http://` or `https://` test page, then open **GIF Overlay**.
3. Confirm every configured label appears under **Animation**.
4. Select each GIF, turn on **Show on this tab**, and confirm that it animates,
   loops as expected, preserves its aspect ratio, and is fully visible.
5. Confirm links and controls under the overlay remain clickable.
6. Turn the overlay off, reopen the popup, and confirm the last selection is
   retained.
7. Test a missing path and confirm the message
   **GIF unavailable — showing the built-in animation.** appears.
8. Reload the webpage and confirm the enabled overlay is removed.

Optional regression test from the repository root:

```sh
node --test apps/edge-overlay-extension/popup-state.test.js
```
