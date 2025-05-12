chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'getIncognitoStatus') {
        chrome.windows.getCurrent({}, (window) => {
            sendResponse({ isIncognito: window?.incognito ?? false });
        });
        return true; // Keep the message channel open
    }
});
