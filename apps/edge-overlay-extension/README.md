# Microsoft Edge GIF overlay extension

A standalone Manifest V3 extension that places a click-through, full-viewport
GIF overlay over the active webpage.

## Guides

- **Using the extension:** [installation and end-user guide](README-INSTALL.md)
- **Maintaining its animations:** [GIF editing and customization guide](README-GIF-EDITING.md)

The extension includes two original placeholder GIFs. Its optional Duck Hunt
entry intentionally has no bundled asset; users must supply only assets they
are authorized to use.

## Behavior at a glance

- The **Show on this tab** switch controls only the active tab.
- Each tab keeps its own enabled state and displayed animation.
- The last animation selected is saved as the default for other tabs.
- Reloading or navigating the tab removes the overlay.
- Missing or invalid GIFs display a built-in CSS fallback animation.
- Edge prevents the extension from modifying browser and other protected pages.
