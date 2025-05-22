/* global chrome */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'fetchAndHashVideo' || message.type === 'fetchAndHashImage') {
        fetch(message.url)
            .then(response => {
                if (!response.ok) throw new Error('Fetch failed: ' + response.statusText);
                return response.blob();
            })
            .then(blob => blob.arrayBuffer())
            .then(arrayBuffer => crypto.subtle.digest('SHA-256', arrayBuffer))
            .then(hashBuffer => {
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                sendResponse({ hash: hashHex.slice(0, 32) });
            })
            .catch(error => {
                console.error(`${message.type} fetch/hash error:`, error);
                sendResponse({ hash: null, error: error.message });
            });
        return true; // keep async response channel open
    }

    if (message.type === 'fetchGalleryJson' && message.url) {
        fetch(message.url)
            .then(res => res.text())
            .then(text => sendResponse({ json: text }))
            .catch(err => sendResponse({ error: err.message }));
        return true;
    }

    
});

chrome.action.onClicked.addListener(() => {
    chrome.runtime.openOptionsPage();
});