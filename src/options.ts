// options.ts

type SeenPostSubredditEntry = {
    subreddit: string;
    timestamp: number; // Unix epoch in milliseconds
};

type SeenPostIDEntry = {
    postID: string;
    timestamp: number; // Unix epoch in milliseconds
};

// Utility function to save setting
function saveSetting(key: string, value: number | boolean) {
    chrome.storage.local.set({ [key]: value });
}

// Load all settings on page load
function loadSettings() {
    chrome.storage.local.get([
        'deleteThreshold',
        'hideCrossposts',
        'lessAggressivePruning',
        'debugMode',
        'incognito'
    ], (settings) => {
        const rangeInput = document.getElementById('persistentStorage') as HTMLInputElement;
        const rangeLabel = document.getElementById('persistentStorageLabel')!;
        const crosspostCheckbox = document.getElementById('crosspostCheckbox') as HTMLInputElement;
        const pruneCheckbox = document.getElementById('pruneCheckbox') as HTMLInputElement;
        const debugCheckbox = document.getElementById('debugModeCheckbox') as HTMLInputElement;
        const incognitoModeCheckbox = document.getElementById('incognitoModeCheckbox') as HTMLInputElement;

        // Load values or fallback to defaults
        const threshold = settings.deleteThreshold ?? 2;
        rangeInput.value = threshold.toString();
        rangeLabel.textContent = formatThresholdLabel(threshold);

        crosspostCheckbox.checked = settings.hideCrossposts ?? false;
        pruneCheckbox.checked = settings.lessAggressivePruning ?? false;
        debugCheckbox.checked = settings.debugMode ?? false;
        incognitoModeCheckbox.checked = settings.incognito ?? false;
    });
}

// Converts index 0-6 to readable label
function formatThresholdLabel(value: number): string {
    const labels = ['6 hours', '1 day', '2 days', '1 week' , '2 weeks', 'Never'];
    return labels[value] ?? 'Unknown';
}

// Set up event listeners
// Set up event listeners
function setupEventHandlers() {
    const rangeInput = document.getElementById('persistentStorage') as HTMLInputElement;
    const rangeLabel = document.getElementById('persistentStorageLabel')!;
    const crosspostCheckbox = document.getElementById('crosspostCheckbox') as HTMLInputElement;
    const incognitoModeCheckbox = document.getElementById('incognitoModeCheckbox') as HTMLInputElement;
    const pruneCheckbox = document.getElementById('pruneCheckbox') as HTMLInputElement;
    const debugCheckbox = document.getElementById('debugModeCheckbox') as HTMLInputElement;

    const resetButton = document.getElementById('resetButton')!;
    const deleteStorageButton = document.getElementById('deleteStorage')!;

    // Range input
    rangeInput.addEventListener('input', () => {
        const val = parseInt(rangeInput.value);
        rangeLabel.textContent = formatThresholdLabel(val);
        saveSetting('deleteThreshold', val);
    });

    // Checkboxes
    crosspostCheckbox.addEventListener('change', () => {
        saveSetting('hideCrossposts', crosspostCheckbox.checked);
    });

    incognitoModeCheckbox.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        if (target.checked) {
            const modal = document.getElementById('incognitoWarningModal')!;
            const cancelButton = document.getElementById('cancelButton')!;
            const proceedButton = document.getElementById('proceedButton')!;

            // Show the modal
            modal.classList.remove('hidden');

            // Handle cancel button
            cancelButton.addEventListener('click', () => {
                target.checked = false;
                modal.classList.add('hidden');
            });

            // Handle proceed button
            proceedButton.addEventListener('click', () => {
                saveSetting('incognito', target.checked);
                modal.classList.add('hidden');
            });
        } else {
            saveSetting('incognito', target.checked);
        }
    });
    

    pruneCheckbox.addEventListener('change', () => {
        saveSetting('lessAggressivePruning', pruneCheckbox.checked);
    });

    debugCheckbox.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        if (target.checked) {
            const modal = document.getElementById('debugModeWarningModal')!;
            const cancelButton = document.getElementById('debugCancelButton')!;
            const proceedButton = document.getElementById('debugProceedButton')!;

            // Show the modal
            modal.classList.remove('hidden');

            // Handle cancel button
            cancelButton.addEventListener('click', () => {
                target.checked = false;
                modal.classList.add('hidden');
            });

            // Handle proceed button
            proceedButton.addEventListener('click', () => {
                saveSetting('debugMode', target.checked);
                modal.classList.add('hidden');
            });
        } else {
            saveSetting('debugMode', target.checked);
        }
    });    

    // Reset
    resetButton.addEventListener('click', () => {
        chrome.storage.local.clear(() => {
            loadSettings();
        });
    });

    // Delete storage
    deleteStorageButton.addEventListener('click', () => {
        chrome.storage.local.remove(['seenPostsSubreddit', 'seenPostsID'], () => {
            updateStats();
        });
    });
    
    setupStoredPostsButton();

    // Initial stats update
    updateStats();
}

function setupStoredPostsButton() {
    const viewStoredPostsButton = document.getElementById('viewStoredPostsButton')! as HTMLButtonElement;

    viewStoredPostsButton.addEventListener('click', () => {
        displayStoredPosts(); // Show or hide the stored posts dropdown
    });
}

    function displayStoredPosts() {
        const storedPostsList = document.getElementById('storedPostsList')! as HTMLUListElement;
        const dropdown = document.getElementById('storedPostsDropdown')!;

        chrome.storage.local.get(['seenPostsSubreddit', 'seenPostsID'], (data) => {
            const postsSubreddit = data.seenPostsSubreddit || {};
            const postsID = data.seenPostsID || {};

            // Combine posts into a single list
            const allPosts = [
                ...Object.keys(postsSubreddit).map(key => {
                    const post: SeenPostSubredditEntry = postsSubreddit[key];
                    const timestamp = post.timestamp;
                    return `md5hash(title|author): ${key} - md5hash(subreddit): ${post.subreddit} - Timestamp: ${timestamp}`;
                }),
                ...Object.keys(postsID).map(key => {
                    const post: SeenPostIDEntry = postsID[key];
                    const timestamp = post.timestamp;
                    const postID = post.postID;
                    return `md5hash(content-href|author): ${key} - md5hash(postID): ${postID}  Seen at: ${timestamp}`;
                })
            ];

            // Clear previous posts and populate new list
            storedPostsList.innerHTML = '';
            allPosts.forEach(post => {
                const listItem = document.createElement('li');
                listItem.textContent = post;
                storedPostsList.appendChild(listItem);
            });

            // Toggle the dropdown visibility
            dropdown.classList.toggle('hidden');
        });
    }

// Calculate tracked entries and estimate size
function updateStats() {
    const trackedEntries = document.getElementById('trackedEntries')!;
    const storageSize = document.getElementById('storageSize')!;

    chrome.storage.local.get(['seenPostsSubreddit', 'seenPostsID'], (data) => {
        const countSub = Object.keys(data.seenPostsSubreddit || {}).length;
        const countID = Object.keys(data.seenPostsID || {}).length;
        const total = countID + countSub;
        trackedEntries.textContent = total.toString();

        // Roughly estimate size
        const jsonSize = JSON.stringify(data).length;
        const kbSize = (jsonSize / 1024).toFixed(2);
        storageSize.textContent = `${kbSize} KB`;
    });
}

// Init
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    setupEventHandlers();
});
