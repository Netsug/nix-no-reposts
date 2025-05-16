import md5 from 'blueimp-md5'; // TODO: Switch to BLAKE3 / SHA-1. Something fast and secure.

type SeenPostSubredditEntry = {
    subreddit: string;
    timestamp: number; // Unix epoch in milliseconds
};

type SeenPostIDEntry = {
    postID: string;
    timestamp: number; // Unix epoch in milliseconds
};

type SeenMediaEntry = {
    postID: string;
    timestamp: number; // Unix epoch in milliseconds
};

type ExtensionSettings = {
    deleteThreshold?: number;
    hideCrossposts?: boolean;
    debugMode?: boolean;
    lessAggressivePruning?: boolean;
    incognitoExclusiveMode?: boolean;
};

type StorageData = {
    seenPostsSubreddit: Record<string, SeenPostSubredditEntry>;
    seenPostsID: Record<string, SeenPostIDEntry>;
    seenMedia: Record<string, SeenMediaEntry>;
};

let seenPostsSubreddit: Record<string, SeenPostSubredditEntry> = {};
let seenPostsID: Record<string, SeenPostIDEntry> = {};
let seenMedia: Record<string, SeenMediaEntry> = {};

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
const isMediaDetectionEnabled: boolean = true;

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
    incognitoExclusiveMode = settings.incognitoExclusiveMode ?? incognitoExclusiveMode;

    deleteThresholdDuration = getThresholdMilliseconds(thresholdSetting);

    if (isDebugging) {
        console.log("Settings loaded: ", settings);
    }
}

function getSettings(): Promise<ExtensionSettings> {
    return new Promise((resolve) => {
        chrome.storage.local.get(
            ['deleteThreshold', 'hideCrossposts', 'debugMode', 'lessAggressivePruning', 'incognitoExclusiveMode'],
            (result) => resolve(result as ExtensionSettings)
        );
    });
}

async function removeOldEntries(): Promise<void> {
    // "Never" is selected
    if (deleteThresholdDuration === null) {
        return;
    }

    const now = Date.now();
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

    // Process Media entries
    for (const [key, entry] of Object.entries(seenMedia)) {
        if (entry.timestamp < cutoffTime) {
            if (isDebugging) {
                console.log(`Removing expired postID entry: ${key}`);
            }
            delete seenMedia[key];
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
async function filterPosts() {
    const posts = document.querySelectorAll('article');

    let hasUpdatesSubreddit: boolean = false;
    let hasUpdatesID: boolean = false;
    let hasUpdatesMedia: boolean = false;

    for (const post of posts) {
        const element = post.querySelector('shreddit-post');
        if (!element) return;

        let hideThisPost: boolean = false;

        hideThisPost = filterPostByCrosspost(hideThisPost, element);
        ({ hideThisPost, hasUpdatesSubreddit } = filterPostBySubreddit(element, hideThisPost, hasUpdatesSubreddit));
        ({ hideThisPost, hasUpdatesID } = filterPostByID(element, hideThisPost, hasUpdatesID));
        ({ hideThisPost, hasUpdatesMedia} = await filterByImageHash(hideThisPost, element));

        if (hideThisPost) {
            (post as HTMLElement).style.display = 'none';
        }
    };

    // Save back to storage only if we added something new
    if (hasUpdatesSubreddit) {
        chrome.storage.local.set({ seenPostsSubreddit: seenPostsSubreddit });
    }
    if (hasUpdatesID) {
        chrome.storage.local.set({ seenPostsID: seenPostsID });
    }
    if (hasUpdatesMedia) {
        chrome.storage.local.set({ seenMedia: seenMedia });
    }
}

function filterPostByCrosspost(hideThisPost: boolean, element: Element) {
    if (isFilteringCrossposts) {
        hideThisPost = isCrosspost(element);

        if (isDebugging) {
            if (hideThisPost) {
                console.log("Filtered post based on crosspost");
            }
        }
    }
    return hideThisPost;
}

function filterPostByID(element: Element, hideThisPost: boolean, hasUpdatesID: boolean) {
    const now = Date.now();

    const authorRaw = element.getAttribute('author') || "";
    const titleRaw = element.getAttribute('post-title') || "";
    const postIDRaw = element.getAttribute('id') || "";

    // Hash for consistent storage
    const title = md5hash(titleRaw);
    const author = md5hash(authorRaw);
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
    return { hideThisPost, hasUpdatesID };
}

function filterPostBySubreddit(element: Element, hideThisPost: boolean, hasUpdatesSubreddit: boolean) {
    const now = Date.now();

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
        };
        hasUpdatesSubreddit = true;
    }
    return { author, hideThisPost, hasUpdatesSubreddit };
}

function isCrosspost(element: Element): boolean {
    return element?.hasAttribute('post-type') && element.getAttribute('post-type')?.toLowerCase() === 'crosspost';
}

async function filterByImageHash(hideThisPost: boolean, post: Element) {
    let hasUpdatesMedia: boolean = false; // 'true' could help with debugging

    if (!hideThisPost && isMediaDetectionEnabled) {
        try {
            const imageUrl = post.getAttribute('content-href');
            if (imageUrl) {
                if (!imageUrl.match(/\.(jpe?g|png|bmp|tiff|webp|svg)$/i)) {
                    if (isDebugging) console.log("Skipped non-image content-href:", imageUrl);
                    return { hideThisPost, hasUpdatesMedia };
                }

                const img = new Image();
                img.crossOrigin = 'anonymous';

                await new Promise<void>((resolve) => {
                    img.onload = () => resolve();
                    img.onerror = () => {
                        if (isDebugging) console.log("Image failed to load:", imageUrl);
                        resolve();
                    };
                    img.src = imageUrl;
                });

                if (img.naturalWidth > 0 || img.naturalHeight > 0) {
                    const mediaHash = await calculateImageHash(img);
                    if (mediaHash) {
                        if (isDebugging) {
                            console.log("Media hash: ", mediaHash);
                        }

                        const storedMediaEntry = seenMedia[mediaHash];
                        const postIDRaw = post.getAttribute('id') || "";
                        const postID = md5hash(postIDRaw);

                        if (storedMediaEntry) {
                            if (storedMediaEntry.postID != postID) {
                                hideThisPost = true;
                                if (isDebugging) {
                                    console.log(`Filtered duplicate based on media content hash: ${mediaHash}`);
                                }
                            }
                        } else {
                            const now = Date.now();
                            seenMedia[mediaHash] = {
                                postID: postID,
                                timestamp: now
                            };

                            hasUpdatesMedia = true;
                        }
                    }
                }
            }
        } catch (e) {
            if (isDebugging) {
                console.log(e);
            }
        }
    }

    return { hideThisPost, hasUpdatesMedia };
}

async function calculateImageHash(imgElement: HTMLImageElement): Promise<string> {
    try {
        // Fetch image as Blob (bypass CORS if crossOrigin is set)
        const response = await fetch(imgElement.src, { mode: 'cors' });
        if (!response.ok && isDebugging) {
            throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
        }
        const blob = await response.blob();

        // Hash the blob bytes using Web Crypto API (SHA-256)
        const arrayBuffer = await blob.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    } catch (e) {
        if (isDebugging) {
            console.error("Error calculating image hash:", e);
        }
        throw e;
    }
}

async function initialize() {
    await loadSettings();
    await loadStorageData();
    await checkIncognitoMode();

    async function checkIncognitoMode() {
        let isIncognitoWindow;

        if (chrome.windows && await chrome.windows.getCurrent()) {
            isIncognitoWindow = await new Promise<boolean>((resolve) => {
                chrome.runtime.sendMessage({ type: 'getIncognitoStatus' }, (response) => {
                    resolve(response?.isIncognito ?? false);
                });
            });
        } else {
            //console.log("Chrome.Windows API not supported");
        }

        if (incognitoExclusiveMode && !isIncognitoWindow) {
            if (isDebugging) {
                console.log("Incognito Exclusive Mode is enabled, but this window is not incognito. Exiting...");
            }
            return; // Exit if it's not an incognito window and exclusive mode is enabled
        }
    }

    await removeOldEntries();
    filterPosts();

    // Run filterPosts() every time the DOM changes
    // Debounced observer to avoid excessive triggering
    observer();

    function observer() {
        let debounceTimer: number;
        const observer = new MutationObserver(() => {
            clearTimeout(debounceTimer);
            debounceTimer = window.setTimeout(() => {
                filterPosts();
            }, 50); // 50 milliseconds after the last DOM change is made, call filterPosts()
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }
}

async function loadStorageData(): Promise<void> {
    const {
        seenPostsSubreddit: storedSubredditPosts = {},
        seenPostsID: storedIDPosts = {},
        seenMedia: storedMedia = {},
    } = await new Promise<Partial<StorageData & { seenMedia: Record<string, SeenMediaEntry> }>>((resolve) =>
        chrome.storage.local.get(["seenPostsSubreddit", "seenPostsID", "seenMedia"],
            (result) => resolve(result)));

    seenPostsSubreddit = storedSubredditPosts;
    seenPostsID = storedIDPosts;
    seenMedia = storedMedia;

    if (isDebugging) {
        console.log(`Loaded ${Object.keys(seenPostsSubreddit).length} subreddit entries, ${Object.keys(seenPostsID).length} post ID entries, and ${Object.keys(seenMedia).length} media entries from storage`);
    }
}

initialize();