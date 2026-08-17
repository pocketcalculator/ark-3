# Install and use the Edge GIF overlay

## Install the unpacked extension

1. Make sure the complete repository is available locally.
2. In Microsoft Edge, open `edge://extensions`.
3. Turn on **Developer mode** using the switch on the Extensions page.
4. Select **Load unpacked**.
5. Choose the `apps/edge-overlay-extension` folder—the folder that directly
   contains `manifest.json`. Do not choose the repository root or the
   `assets` folder.
6. Confirm **ARK-3 GIF Overlay** appears in the installed extensions list.

## Pin and open it

1. Open a normal `http://` or `https://` webpage.
2. Select the **Extensions** button (puzzle-piece icon) in the Edge toolbar.
3. Pin **ARK-3 GIF Overlay** if you want its action to remain on the toolbar.
4. Select **ARK-3 GIF Overlay** (its popup title is **GIF Overlay**).

## Select and show a GIF

1. Choose an item from the **Animation** list.
2. Turn on **Show on this tab**.
3. Turn the same switch off to remove the overlay.

The overlay fills the viewport but does not block clicks. Each tab has its own
enabled state and current animation. The most recently selected animation is
saved as the default for other tabs. Reloading or navigating a tab removes its
overlay.

The **Authorized Duck Hunt dog asset (user-supplied)** option works only when
an authorized local asset has been added by a maintainer. The repository does
not bundle it. If a selected GIF is missing or invalid, a built-in animation is
shown instead.

## Reload after extension changes

After a maintainer changes code or GIF files:

1. Open `edge://extensions`.
2. Select **Reload** on the **ARK-3 GIF Overlay** card.
3. Reload the webpage where you want to use it.
4. Reopen **GIF Overlay**, select the animation, and enable it again.

## Restricted pages

Edge does not allow this extension to modify browser pages such as
`edge://extensions`, extension-store pages, and some protected documents. On
those pages the popup disables its controls and displays:

> Edge does not allow extensions to modify this page. Try a regular website.

Use a normal `http://` or `https://` page instead. For local `file://` pages,
open the extension's **Details** page and enable **Allow access to file URLs**
if Edge offers that setting.

## Troubleshooting

- **Load unpacked reports a manifest error:** select the
  `apps/edge-overlay-extension` folder containing `manifest.json`, not a parent
  or child folder.
- **The toolbar action is missing:** open the Extensions menu and pin
  **ARK-3 GIF Overlay**.
- **Controls remain disabled:** switch to a normal webpage and reopen the
  popup.
- **The built-in fallback appears:** the selected GIF is missing, invalid, or
  not a real GIF. Ask the maintainer to check `gif-options.js` and `assets/`.
- **A changed GIF or label does not appear:** reload the extension at
  `edge://extensions`, reload the target page, and reopen the popup.
- **The overlay disappeared:** page reloads and navigation intentionally remove
  it; enable it again.

## Uninstall

1. Open `edge://extensions`.
2. Find **ARK-3 GIF Overlay**.
3. Select **Remove**, then confirm.
