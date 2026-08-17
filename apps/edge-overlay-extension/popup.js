(async function initializePopup() {
  const enabledInput = document.querySelector("#enabled");
  const choiceSelect = document.querySelector("#gif-choice");
  const status = document.querySelector("#status");
  const options = globalThis.ARK3_GIF_OPTIONS ?? [];
  const { resolveSelectedGifId } = globalThis.ARK3_POPUP_STATE;
  let tabId;
  let busy = false;

  function showStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle("error", isError);
  }

  function setControlsAvailable(available) {
    enabledInput.disabled = !available || busy;
    choiceSelect.disabled = !available || busy;
  }

  function friendlyError(error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/cannot access|cannot be scripted|missing host permission/i.test(message)) {
      return "Edge does not allow extensions to modify this page. Try a regular website.";
    }
    return `Could not update this tab: ${message}`;
  }

  async function send(type, gifId) {
    const response = await chrome.tabs.sendMessage(tabId, { type, gifId });
    if (!response?.ok) {
      throw new Error(response?.error || "The page did not accept the request.");
    }
    return response;
  }

  for (const option of options) {
    const element = document.createElement("option");
    element.value = option.id;
    element.textContent = option.label;
    choiceSelect.append(element);
  }

  if (options.length === 0) {
    showStatus("No GIF assets are configured.", true);
    return;
  }

  enabledInput.addEventListener("change", async () => {
    busy = true;
    setControlsAvailable(true);
    try {
      const response = await send(
        enabledInput.checked ? "ark3-overlay:enable" : "ark3-overlay:disable",
        choiceSelect.value,
      );
      enabledInput.checked = response.enabled;
      showStatus(response.enabled ? "Overlay enabled on this tab." : "Overlay disabled.");
    } catch (error) {
      enabledInput.checked = !enabledInput.checked;
      showStatus(friendlyError(error), true);
    } finally {
      busy = false;
      setControlsAvailable(true);
    }
  });

  choiceSelect.addEventListener("change", async () => {
    busy = true;
    setControlsAvailable(true);
    try {
      await chrome.storage.local.set({ lastGifId: choiceSelect.value });
      await send("ark3-overlay:set-gif", choiceSelect.value);
      showStatus(
        enabledInput.checked
          ? "Animation updated on this tab."
          : "Selection saved. Enable the overlay to show it.",
      );
    } catch (error) {
      showStatus(friendlyError(error), true);
    } finally {
      busy = false;
      setControlsAvailable(true);
    }
  });

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tabId = tab?.id;
    if (tabId === undefined) {
      throw new Error("No active tab is available.");
    }
    if (!/^https?:|^file:/.test(tab.url ?? "")) {
      throw new Error("Edge does not allow extensions to modify this page. Try a regular website.");
    }

    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["gif-options.js", "content.js"],
    });

    const stored = await chrome.storage.local.get("lastGifId");
    const response = await send("ark3-overlay:get-state");
    const selectedId = resolveSelectedGifId(options, response, stored.lastGifId);
    choiceSelect.value = selectedId;
    enabledInput.checked = response.enabled;
    setControlsAvailable(true);
    showStatus(response.enabled ? "Overlay enabled on this tab." : "Overlay disabled.");
  } catch (error) {
    setControlsAvailable(false);
    showStatus(friendlyError(error), true);
  }
})();
