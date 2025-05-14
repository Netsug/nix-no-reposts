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

const seenPostsSubreddit: Record<string, SeenPostSubredditEntry> = {};
const seenPostsID: Record<string, SeenPostIDEntry> = {};

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

let deleteThreshold: number | null = 2 * 24 * 60 * 60 * 1_000; // Default 2 days in milliseconds (changeable via settings)
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
    deleteThreshold = settings.deleteThreshold ?? deleteThreshold;
    isFilteringCrossposts = settings.hideCrossposts ?? isFilteringCrossposts;
    isDebugging = settings.debugMode ?? isDebugging;
    lessAggressivePruning = settings.lessAggressivePruning ?? lessAggressivePruning;
    incognitoExclusiveMode = settings.incognito ?? incognitoExclusiveMode;

    // Check if deleteThreshold is null first
    let thresholdMs: number | null = null;
    if (deleteThreshold !== null) {
        thresholdMs = getThresholdMilliseconds(deleteThreshold);
    }

    if (thresholdMs !== null) {
        const cutoffTime = Date.now() - thresholdMs;
        deleteThreshold = cutoffTime;

        if (isDebugging) {
            console.log(`Cutoff time is ${new Date(cutoffTime).toISOString()}`);
        }
    } else {
        // "Never" case — do not delete anything
        deleteThreshold = null;
        if (isDebugging) {
            console.log("Delete threshold is set to 'Never'; no deletions will occur.");
        }
    }

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
    if (deleteThreshold === null) {
        return;
    }

    // Get the data from storage
    const {
        seenPostsSubreddit = {},
        seenPostsID = {},
    } = await new Promise<Partial<StorageData>>((resolve) =>
        chrome.storage.local.get(["seenPostsSubreddit", "seenPostsID"],
            (result) => resolve(result as StorageData)));

    const newSeenPostsSubreddit: Record<string, SeenPostSubredditEntry> = {};
    const newSeenPostsID: Record<string, SeenPostIDEntry> = {};

    // Process subreddit entries
    for (const [key, entry] of Object.entries(seenPostsSubreddit)) {
        if (now - entry.timestamp > deleteThreshold) {
            newSeenPostsSubreddit[key] = entry;
        } else {
            if (isDebugging) {
                console.log(`Removing expired subreddit entry: ${key}`);
            }
        }
    }

    // Process postID entries
    for (const [key, entry] of Object.entries(seenPostsID)) {
        if (now - entry.timestamp > deleteThreshold) {
            newSeenPostsID[key] = entry;
        } else {
            if (isDebugging) {
                console.log(`Removing expired postID entry: ${key}`);
            }
        }
    }

    const changesToSubreddit = Object.keys(newSeenPostsSubreddit).length !== Object.keys(seenPostsSubreddit).length;
    const changesToID = Object.keys(newSeenPostsID).length !== Object.keys(seenPostsID).length;

    // Save back if there were changes
    if (changesToSubreddit) {
        await new Promise<void>((resolve) =>
            chrome.storage.local.set({ seenPostsSubreddit: newSeenPostsSubreddit }, resolve)
        );
    }

    if (changesToID) {
        await new Promise<void>((resolve) =>
            chrome.storage.local.set({ seenPostsID: newSeenPostsID }, resolve)
        );
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

initialize();