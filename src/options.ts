// options.ts

// Utility function to save setting
function saveSetting(key: string, value: string | number | boolean) {
    chrome.storage.local.set({ [key]: value });
}

// Utility function to load a single setting
function loadSetting(key: string, defaultValue: number | boolean = false): Promise<number | boolean> {
    return new Promise((resolve) => {
        chrome.storage.local.get(key, (item) => {
            if (item[key] === undefined) {
                chrome.storage.local.set({ [key]: defaultValue }); // Save default
                resolve(defaultValue);
            } else {
                resolve(item[key]);
            }
        });
    });
}

// Load all settings on page load
async function loadSettings() {
    const rangeInput = document.getElementById('persistentStorage') as HTMLInputElement;
    const rangeLabel = document.getElementById('persistentStorageLabel')!;
    const crosspostCheckbox = document.getElementById('crosspostCheckbox') as HTMLInputElement;
    const pruneCheckbox = document.getElementById('pruneCheckbox') as HTMLInputElement;
    const debugCheckbox = document.getElementById('debugModeCheckbox') as HTMLInputElement;
    const incognitoModeCheckbox = document.getElementById('incognitoModeCheckbox') as HTMLInputElement;
    const hideText = document.getElementById('hideTextPostCheckbox') as HTMLInputElement;
    const hideLink = document.getElementById('hideLinkPostCheckbox') as HTMLInputElement;
    const hideImage = document.getElementById('hideImagePostCheckbox') as HTMLInputElement;
    const hideVideo = document.getElementById('hideVideoPostCheckbox') as HTMLInputElement;
    const hideGallery = document.getElementById('hideGalleryPostCheckbox') as HTMLInputElement;

    // Load values or fallback to defaults
    const threshold = await loadSetting('deleteThreshold', 2) as number;
    rangeInput.value = threshold.toString();
    rangeLabel.textContent = formatThresholdLabel(threshold);

    crosspostCheckbox.checked = await loadSetting('hideCrossposts', false) as boolean;
    pruneCheckbox.checked = await loadSetting('lessAggressivePruning', false) as boolean;
    debugCheckbox.checked = await loadSetting('debugMode', false) as boolean;
    incognitoModeCheckbox.checked = await loadSetting('incognitoExclusiveMode', false) as boolean;
    hideText.checked = await loadSetting('hideTextPosts', true) as boolean;
    hideLink.checked = await loadSetting('hideLinkPosts', true) as boolean;
    hideImage.checked = await loadSetting('hideImagePosts', true) as boolean;
    hideVideo.checked = await loadSetting('hideVideoPosts', true) as boolean;
    hideGallery.checked = await loadSetting('hideGalleryPosts', true) as boolean;
}

// Converts index 0-5 to readable label
function formatThresholdLabel(value: number): string {
    const labels = ['6 hours', '1 day', '2 days', '1 week', '2 weeks', 'Never'];
    return labels[value] ?? 'Unknown';
}

// Function to handle checkbox toggles and save settings
/*function toggleCheckbox(checkbox: HTMLInputElement) {
    const key = checkbox.id;
    saveSetting(key, checkbox.checked);
}*/

// Set up event listeners
function setupEventHandlers() {
    const rangeInput = document.getElementById('persistentStorage') as HTMLInputElement;
    const rangeLabel = document.getElementById('persistentStorageLabel')!;
    const crosspostCheckbox = document.getElementById('crosspostCheckbox') as HTMLInputElement;
    const incognitoModeCheckbox = document.getElementById('incognitoModeCheckbox') as HTMLInputElement;
    const pruneCheckbox = document.getElementById('pruneCheckbox') as HTMLInputElement;
    const debugCheckbox = document.getElementById('debugModeCheckbox') as HTMLInputElement;
    const hideTextCheckbox = document.getElementById('hideTextPostCheckbox') as HTMLInputElement;
    const hideLinkCheckbox = document.getElementById('hideLinkPostCheckbox') as HTMLInputElement;
    const hideImageCheckbox = document.getElementById('hideImagePostCheckbox') as HTMLInputElement;
    const hideVideoCheckbox = document.getElementById('hideVideoPostCheckbox') as HTMLInputElement;
    const hideGalleryCheckbox = document.getElementById('hideGalleryPostCheckbox') as HTMLInputElement;
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

    hideTextCheckbox.addEventListener('change', () => {
        saveSetting('hideTextPosts', hideTextCheckbox.checked);
    });

    hideLinkCheckbox.addEventListener('change', () => {
        saveSetting('hideLinkPosts', hideLinkCheckbox.checked);
    });

    hideImageCheckbox.addEventListener('change', () => {
        saveSetting('hideImagePosts', hideImageCheckbox.checked);
    });

    hideVideoCheckbox.addEventListener('change', () => {
        saveSetting('hideVideoPosts', hideVideoCheckbox.checked);
    });

    hideGalleryCheckbox.addEventListener('change', () => {
        saveSetting('hideGalleryPosts', hideGalleryCheckbox.checked);
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
                saveSetting('incognitoExclusiveMode', target.checked); // Revert the setting
                modal.classList.add('hidden');
            });

            // Handle proceed button
            proceedButton.addEventListener('click', () => {
                saveSetting('incognitoExclusiveMode', target.checked);
                modal.classList.add('hidden');
            });
        } else {
            saveSetting('incognitoExclusiveMode', target.checked);
        }
    });

    // Prune checkbox
    pruneCheckbox.addEventListener('change', () => {
        saveSetting('lessAggressivePruning', pruneCheckbox.checked);
    });

    // Debug mode checkbox
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
                saveSetting('debugMode', target.checked); // Revert the setting
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

    const keysToKeep = ['seenPostsSubreddit', 'seenPostsID', 'seenMedia'];

    // Reset storage
    // This will remove all keys except the ones in keysToKeep
    resetButton.addEventListener('click', () => {
        chrome.storage.local.get(null, (items) => {
            const allKeys = Object.keys(items);
            const keysToRemove = allKeys.filter(key => !keysToKeep.includes(key));

            chrome.storage.local.remove(keysToRemove, () => {
                loadSettings();
                updateStats();
                displayStoredPosts(); // Update the displayed stored posts if any
            });
        });
    });    

    // Delete storage
    deleteStorageButton.addEventListener('click', () => {
        chrome.storage.local.remove(['seenPostsSubreddit', 'seenPostsID', 'seenMedia'], () => {
            updateStats();
            displayStoredPosts(); // Update the displayed stored posts (should be empty)
        });
    });

    setupStoredPostsButton();

    // Initial stats update
    updateStats();
}

// Set up the button to view stored posts
function setupStoredPostsButton() {
    const viewStoredPostsButton = document.getElementById('viewStoredPostsButton')! as HTMLButtonElement;
    const storedPostsDropdown = document.getElementById('storedPostsDropdown')!;

    viewStoredPostsButton.addEventListener('click', () => {
        storedPostsDropdown.classList.toggle('hidden');
        if (!storedPostsDropdown.classList.contains('hidden')) {
            displayStoredPosts();
        }
    });
}

// Display stored posts in the dropdown
function displayStoredPosts() {
    const storedPostsList = document.getElementById('storedPostsList')! as HTMLUListElement;

    chrome.storage.local.get(null, (data) => {
        // Clear previous entries
        storedPostsList.innerHTML = '';

        const relevantKeys = ['seenPostsSubreddit', 'seenPostsID', 'seenMedia'];

        relevantKeys.forEach(key => {
            if (Object.prototype.hasOwnProperty.call(data, key)) {
                const value = data[key];
                if (typeof value === 'object' && value !== null) {
                    const listItemTitle = document.createElement('li');
                    listItemTitle.classList.add('font-semibold', 'mb-1');
                    listItemTitle.textContent = `--- ${key} ---`;
                    storedPostsList.appendChild(listItemTitle);

                    for (const [subKey, subValue] of Object.entries(value)) {
                        const item = document.createElement('li');
                        const pre = document.createElement('pre');
                        pre.textContent = `${subKey}:\n${JSON.stringify(subValue, null, 2)}`;
                        item.appendChild(pre);
                        storedPostsList.appendChild(item);
                    }
                } else {
                    const item = document.createElement('li');
                    item.textContent = `${key}: ${JSON.stringify(value)}`;
                    storedPostsList.appendChild(item);
                }
            }
        });

        if (storedPostsList.children.length === 0) {
            const emptyItem = document.createElement('li');
            emptyItem.textContent = 'No stored posts data found.';
            storedPostsList.appendChild(emptyItem);
        }
    });
}


// Calculate tracked entries and estimate size
function updateStats() {
    const trackedEntries = document.getElementById('trackedEntries')!;
    const storageSize = document.getElementById('storageSize')!;

    const keysToCheck = ['seenPostsSubreddit', 'seenPostsID', 'seenMedia'];
    let totalCount = 0;
    let totalSize = 0;

    chrome.storage.local.get(keysToCheck, (data) => {
        keysToCheck.forEach(key => {
            if (Object.prototype.hasOwnProperty.call(data, key) && typeof data[key] === 'object' && data[key] !== null) {
                totalCount += Object.keys(data[key]).length;
                totalSize += JSON.stringify(data[key]).length;
            } else if (Object.prototype.hasOwnProperty.call(data, key)) {
                totalSize += JSON.stringify(data[key]).length;
                totalCount += 1; // Consider individual settings as one entry
            }
        });

        trackedEntries.textContent = totalCount.toString();
        const kbSize = (totalSize / 1024).toFixed(2);
        storageSize.textContent = `${kbSize} KB`;
    });
}

// Init
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    setupEventHandlers();
});