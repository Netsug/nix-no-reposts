import md5 from 'blueimp-md5';

type SeenPostSubredditEntry = {
    subreddit: string;
    timestamp: number; // Unix epoch in milliseconds
};

type SeenPostIDEntry = {
    postID: string;
    timestamp: number; // Unix epoch in milliseconds
};

type ExtensionSettings = {
    deleteThreshold?: number;
    hideCrossposts?: boolean;
    debugMode?: boolean;
    lessAggressivePruning?: boolean;
    incognito?: boolean;
};

type StorageData = {
    seenPostsSubreddit: Record<string, SeenPostSubredditEntry>;
    seenPostsID: Record<string, SeenPostIDEntry>;
};

let seenPostsSubreddit: Record<string, SeenPostSubredditEntry> = {};
let seenPostsID: Record<string, SeenPostIDEntry> = {};

function getThresholdMilliseconds(val: number): number | null {
    const msValues = [
        6 * 60 * 60 * 1000,       // 6 hours
        24 * 60 * 60 * 1000,      // 1 day
        2 * 24 * 60 * 60 * 1000,  // 2 days
        7 * 24 * 60 * 60 * 1000,  // 1 week
        14 * 24 * 60 * 60 * 1000, // 2 weeks
        null                     // Never
    ];
    return msValues[val] ?? null;
}

let deleteThresholdDuration: number | null = 2 * 24 * 60 * 60 * 1_000; // Default 2 days in milliseconds (changeable via settings)
let isFilteringCrossposts: boolean = false;
let isDebugging: boolean = false;
let lessAggressivePruning: boolean = false;
let incognitoExclusiveMode: boolean = false;

function md5hash(data: string): string {
    return md5(data);
}

async function loadSettings(): Promise<void> {
    const settings = await getSettings();

    // Use default values if the setting is not available
    const thresholdSetting = settings.deleteThreshold ?? 2;
    isFilteringCrossposts = settings.hideCrossposts ?? isFilteringCrossposts;
    isDebugging = settings.debugMode ?? isDebugging;
    lessAggressivePruning = settings.lessAggressivePruning ?? lessAggressivePruning;
    incognitoExclusiveMode = settings.incognito ?? incognitoExclusiveMode;

    deleteThresholdDuration = getThresholdMilliseconds(thresholdSetting);

    if (isDebugging) {
        console.log("Settings loaded: ", settings);
    }
}

function getSettings(): Promise<ExtensionSettings> {
    return new Promise((resolve) => {
        chrome.storage.local.get(
            ['deleteThreshold', 'hideCrossposts', 'debugMode', 'lessAggressivePruning', 'incognito'],
            (result) => resolve(result as ExtensionSettings)
        );
    });
}

async function removeOldEntries(): Promise<void> {
    const now = Date.now();

    // "Never" is selected
    if (deleteThresholdDuration === null) {
        return;
    }

    // Calculate the cutoff time based on the current time and threshold duration
    const cutoffTime = now - deleteThresholdDuration;

    if (isDebugging) {
        console.log(`Cutoff time is ${new Date(cutoffTime).toISOString()}`);
    }

    let entriesRemoved = 0;

    // Process subreddit entries
    for (const [key, entry] of Object.entries(seenPostsSubreddit)) {
        if (entry.timestamp < cutoffTime) {
            if (isDebugging) {
                console.log(`Removing expired subreddit entry: ${key}`);
            }
            delete seenPostsSubreddit[key];
            entriesRemoved++;
        }
    }

    // Process postID entries
    for (const [key, entry] of Object.entries(seenPostsID)) {
        if (entry.timestamp < cutoffTime) {
            if (isDebugging) {
                console.log(`Removing expired postID entry: ${key}`);
            }
            delete seenPostsID[key];
            entriesRemoved++;
        }
    }

    if (entriesRemoved > 0) {
        // Save the pruned objects back to storage
        await Promise.all([
            new Promise<void>((resolve) => chrome.storage.local.set({ seenPostsSubreddit }, resolve)),
            new Promise<void>((resolve) => chrome.storage.local.set({ seenPostsID }, resolve))
        ]);

        if (isDebugging) {
            console.log(`Removed ${entriesRemoved} expired entries`);
        }
    }
}


// Perform filtering and update seenPosts in memory
function filterPosts() {
    const now = Date.now();
    const posts = document.querySelectorAll('article');

    let hasUpdatesSubreddit: boolean = false;
    let hasUpdatesID: boolean = false;

    posts.forEach((post) => {
        const element = post.querySelector('shreddit-post');
        if (!element) return;

        let hideThisPost: boolean = false;
        if (isFilteringCrossposts) {
            hideThisPost = isCrosspost(element);

            if (isDebugging) {
                if (hideThisPost) {
                    console.log("Filtered post based on crosspost");
                }
            }
        }

        const contentLinkRaw = element.getAttribute('content-href')?.toLowerCase() || "";
        const authorRaw = element.getAttribute('author')?.toLowerCase() || "";
        const subredditRaw = element.getAttribute('subreddit-name')?.toLowerCase() || "";

        const contentLink = md5hash(contentLinkRaw);
        const author = md5hash(authorRaw);
        const subreddit = md5hash(subredditRaw);

        const key = md5hash(`${contentLink}|${author}`);

        if (isDebugging) {
            console.log(`Key (content|author): ${key}, Subreddit: ${subredditRaw}`);
        }

        const storedSubredditEntry = seenPostsSubreddit[key];

        // If the entry exists... (if we have seen this author + content-link before)
        if (storedSubredditEntry) {
            // and the entry's subreddit is not equal to this <article> subreddit
            if (storedSubredditEntry.subreddit !== subreddit) {
                // Hide it
                hideThisPost = true;
                if (isDebugging) {
                    console.log(`Filtered duplicate from another subreddit: ${subreddit}`);
                }
            }
        } else {
            // First time seeing this content+author combo. Add it to the storage.
            seenPostsSubreddit[key] = {
                subreddit: subreddit,
                timestamp: now
            }
            hasUpdatesSubreddit = true;
        }

        // Always use raw values initially for consistent hashing and debug logging
        const titleRaw = element.getAttribute('post-title') || "";
        const postIDRaw = element.getAttribute('id') || "";

        // Hash for consistent storage
        const title = md5hash(titleRaw);
        const postID = md5hash(postIDRaw);
        const postKey = md5hash(`${title}|${author}`); // 'author' is already hashed above

        if (isDebugging) {
            console.log(`Post Key (title|author): ${titleRaw}|${author}`);
        }

        if (!hideThisPost) {
            if (!lessAggressivePruning) {
                const storedTitleEntry = seenPostsID[postKey];
                if (storedTitleEntry) {
                    if (storedTitleEntry.postID !== postID) {
                        hideThisPost = true;
                        if (isDebugging) {
                            console.log(`Filtered duplicate with similar title: ${titleRaw}`);
                        }
                    }
                } else {
                    seenPostsID[postKey] = {
                        postID: postID,
                        timestamp: now
                    };
                    hasUpdatesID = true;
                }
            }
        }


        if (hideThisPost) {
            (post as HTMLElement).style.display = 'none';
        }
    });

    // Save back to storage only if we added something new
    if (hasUpdatesSubreddit) {
        chrome.storage.local.set({ seenPostsSubreddit: seenPostsSubreddit });
    }
    if (hasUpdatesID) {
        chrome.storage.local.set({ seenPostsID: seenPostsID });
    }
}

function isCrosspost(element: Element): boolean {
    return element?.hasAttribute('post-type') && element.getAttribute('post-type')?.toLowerCase() === 'crosspost';
}

async function initialize() {
    await loadSettings();
    await loadStorageData();

    let isIncognitoWindow;

    if (chrome.windows && await chrome.windows.getCurrent()) {
        isIncognitoWindow = await new Promise<boolean>((resolve) => {
            chrome.runtime.sendMessage({ type: 'getIncognitoStatus' }, (response) => {
                resolve(response?.isIncognito ?? false);
            });
        });
    }
    else {
        //console.log("Chrome.Windows API not supported");
    }

    if (incognitoExclusiveMode && !isIncognitoWindow) {
        if (isDebugging) {
            console.log("Incognito Exclusive Mode is enabled, but this window is not incognito. Exiting...");
        }
        return; // Exit if it's not an incognito window and exclusive mode is enabled
    }

    await removeOldEntries();
    filterPosts();

    // Run filterPosts() every time the DOM changes
    // Debounced observer to avoid excessive triggering
    let debounceTimer: number;
    const observer = new MutationObserver(() => {
        clearTimeout(debounceTimer);
        debounceTimer = window.setTimeout(() => {
            filterPosts();
        }, 50); // 50 milliseconds after the last DOM change is made, call filterPosts()
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

async function loadStorageData(): Promise<void> {
    // Get all data from storage
    const {
        seenPostsSubreddit: storedSubredditPosts = {},
        seenPostsID: storedIDPosts = {},
    } = await new Promise<Partial<StorageData>>((resolve) =>
        chrome.storage.local.get(["seenPostsSubreddit", "seenPostsID"],
            (result) => resolve(result as StorageData)));

    // Update our in-memory objects with all data from storage
    seenPostsSubreddit = storedSubredditPosts;
    seenPostsID = storedIDPosts;

    if (isDebugging) {
        console.log(`Loaded ${Object.keys(seenPostsSubreddit).length} subreddit entries and ${Object.keys(seenPostsID).length} post ID entries from storage`);
    }
}

initialize();