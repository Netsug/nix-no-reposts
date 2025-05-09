// src/options.ts
const keywordsInput = document.getElementById('keywords') as HTMLTextAreaElement | null;
const saveButton = document.getElementById('save') as HTMLButtonElement | null;

if (keywordsInput && saveButton) {
    // Load saved keywords from Chrome storage
    chrome.storage.local.get({ blockedKeywords: "" }, (result) => {
        keywordsInput.value = result.blockedKeywords;
    });

    // Save keywords to Chrome storage
    saveButton.addEventListener('click', () => {
        const keywords = keywordsInput.value.split(',').map(k => k.trim()).filter(k => k !== "");
        chrome.storage.local.set({ blockedKeywords: keywords }, () => {
            alert('Keywords saved!');
        });
    });
}