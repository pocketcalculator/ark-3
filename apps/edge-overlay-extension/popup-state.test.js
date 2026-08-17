const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveSelectedGifId } = require("./popup-state.js");

const options = [
  { id: "original-pulse" },
  { id: "original-bounce" },
];

test("stored selection wins over stale tab state while overlay is disabled", () => {
  assert.equal(
    resolveSelectedGifId(
      options,
      { enabled: false, gifId: "original-pulse" },
      "original-bounce",
    ),
    "original-bounce",
  );
});

test("per-tab selection wins while overlay is enabled", () => {
  assert.equal(
    resolveSelectedGifId(
      options,
      { enabled: true, gifId: "original-pulse" },
      "original-bounce",
    ),
    "original-pulse",
  );
});

test("invalid stored and tab IDs fall back to a configured option", () => {
  assert.equal(
    resolveSelectedGifId(
      options,
      { enabled: false, gifId: "removed-tab-option" },
      "removed-stored-option",
    ),
    "original-pulse",
  );
});
