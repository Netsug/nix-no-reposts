// This is used to check if the current window is in incognito mode

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'getIncognitoStatus') {
        chrome.windows.getCurrent({}, (window) => {
            sendResponse({ isIncognito: window?.incognito ?? false });
        });
        return true; // Keep the message channel open
    }
});
