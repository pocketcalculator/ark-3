(function configurePopupState(root) {
  function resolveSelectedGifId(options, overlayState, storedGifId) {
    const validIds = new Set(options.map((option) => option.id));
    const validStoredId = validIds.has(storedGifId) ? storedGifId : undefined;
    const validTabId = validIds.has(overlayState?.gifId) ? overlayState.gifId : undefined;

    if (overlayState?.enabled) {
      return validTabId ?? validStoredId ?? options[0]?.id;
    }
    return validStoredId ?? validTabId ?? options[0]?.id;
  }

  const popupState = Object.freeze({ resolveSelectedGifId });
  root.ARK3_POPUP_STATE = popupState;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = popupState;
  }
})(globalThis);
