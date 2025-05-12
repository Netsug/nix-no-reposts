var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// src/options.ts
var require_options = __commonJS({
  "src/options.ts"() {
    var keywordsInput = document.getElementById("keywords");
    var saveButton = document.getElementById("save");
    if (keywordsInput && saveButton) {
      chrome.storage.local.get({ blockedKeywords: "" }, (result) => {
        keywordsInput.value = result.blockedKeywords;
      });
      saveButton.addEventListener("click", () => {
        const keywords = keywordsInput.value.split(",").map((k) => k.trim()).filter((k) => k !== "");
        chrome.storage.local.set({ blockedKeywords: keywords }, () => {
          alert("Keywords saved!");
        });
      });
    }
  }
});
export default require_options();
