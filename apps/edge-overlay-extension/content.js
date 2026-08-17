(function installOverlayController() {
  if (globalThis.__ark3GifOverlayControllerInstalled) {
    return;
  }
  globalThis.__ark3GifOverlayControllerInstalled = true;

  const state = {
    host: null,
    image: null,
    fallback: null,
    gifId: null,
  };

  function findOption(gifId) {
    const options = globalThis.ARK3_GIF_OPTIONS ?? [];
    return options.find((option) => option.id === gifId) ?? options[0];
  }

  function isEnabled() {
    return Boolean(state.host?.isConnected);
  }

  function removeOverlay() {
    state.host?.remove();
    state.host = null;
    state.image = null;
    state.fallback = null;
  }

  function setGif(gifId) {
    const option = findOption(gifId);
    if (!option) {
      throw new Error("No GIF assets are configured.");
    }

    state.gifId = option.id;
    if (!state.image || !state.fallback) {
      return;
    }

    state.fallback.hidden = true;
    state.image.hidden = false;
    state.image.alt = option.label;
    state.image.src = chrome.runtime.getURL(option.path);
  }

  function createOverlay(gifId) {
    removeOverlay();

    const host = document.createElement("div");
    host.id = "ark3-gif-overlay-root";
    host.setAttribute("aria-hidden", "true");
    const importantStyles = {
      all: "initial",
      position: "fixed",
      inset: "0",
      width: "100vw",
      height: "100vh",
      margin: "0",
      padding: "0",
      border: "0",
      overflow: "hidden",
      pointerEvents: "none",
      zIndex: "2147483647",
      isolation: "isolate",
      contain: "strict",
    };
    for (const [property, value] of Object.entries(importantStyles)) {
      host.style.setProperty(
        property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`),
        value,
        "important",
      );
    }

    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial; }
      .backdrop {
        align-items: center;
        background: rgba(0, 0, 0, 0.72);
        display: flex;
        height: 100%;
        justify-content: center;
        overflow: hidden;
        width: 100%;
      }
      img {
        display: block;
        height: 100%;
        max-height: 100%;
        max-width: 100%;
        object-fit: contain;
        width: 100%;
      }
      [hidden] { display: none !important; }
      .fallback {
        align-items: center;
        color: white;
        display: flex;
        flex-direction: column;
        font: 600 16px/1.4 system-ui, sans-serif;
        gap: 20px;
        text-align: center;
      }
      .pulse {
        animation: ark3-pulse 1.2s ease-in-out infinite alternate;
        background: linear-gradient(135deg, #00b7c3, #7f5af0);
        border: 10px solid rgba(255, 255, 255, 0.8);
        border-radius: 50%;
        box-shadow: 0 0 40px #00b7c3;
        height: 120px;
        width: 120px;
      }
      @keyframes ark3-pulse {
        from { transform: scale(0.7) rotate(-10deg); }
        to { transform: scale(1.2) rotate(10deg); }
      }
    `;

    const backdrop = document.createElement("div");
    backdrop.className = "backdrop";
    const image = document.createElement("img");
    const fallback = document.createElement("div");
    fallback.className = "fallback";
    fallback.hidden = true;
    const pulse = document.createElement("div");
    pulse.className = "pulse";
    const fallbackText = document.createElement("span");
    fallbackText.textContent = "GIF unavailable — showing the built-in animation.";
    fallback.append(pulse, fallbackText);
    image.addEventListener("error", () => {
      image.hidden = true;
      fallback.hidden = false;
    });
    image.addEventListener("load", () => {
      image.hidden = false;
      fallback.hidden = true;
    });
    backdrop.append(image, fallback);
    shadow.append(style, backdrop);

    state.host = host;
    state.image = image;
    state.fallback = fallback;
    document.documentElement.append(host);
    setGif(gifId);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    try {
      switch (message?.type) {
        case "ark3-overlay:get-state":
          sendResponse({
            ok: true,
            enabled: isEnabled(),
            gifId: state.gifId,
          });
          break;
        case "ark3-overlay:enable":
          createOverlay(message.gifId);
          sendResponse({ ok: true, enabled: true, gifId: state.gifId });
          break;
        case "ark3-overlay:set-gif":
          setGif(message.gifId);
          sendResponse({
            ok: true,
            enabled: isEnabled(),
            gifId: state.gifId,
          });
          break;
        case "ark3-overlay:disable":
          removeOverlay();
          sendResponse({ ok: true, enabled: false, gifId: state.gifId });
          break;
        default:
          return false;
      }
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return false;
  });
})();
