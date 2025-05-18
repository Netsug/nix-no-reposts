import md5 from 'blueimp-md5'; // TODO: Switch to BLAKE3 / SHA-1. Something fast and secure.

type SeenPostSubredditEntry = {
    subreddit: string;
    timestamp: number; // Unix epoch in milliseconds
};

type SeenPostIDEntry = {
    postID: string;
    timestamp: number;
};

type SeenMediaEntry = {
    postID: string;
    timestamp: number;
};

type ExtensionSettings = {
    deleteThreshold?: number;
    hideCrossposts?: boolean;
    debugMode?: boolean;
    lessAggressivePruning?: boolean;
    incognitoExclusiveMode?: boolean;
    hideTextPosts?: boolean;
    hideImagePosts?: boolean;
    hideVideoPosts?: boolean;
    hideGalleryPosts?: boolean;
    hideMediaPosts?: boolean;
    hideLinkPosts: boolean;
};

type StorageData = {
    seenPostsSubreddit: Record<string, SeenPostSubredditEntry>;
    seenPostsID: Record<string, SeenPostIDEntry>;
    seenMedia: Record<string, SeenMediaEntry>;
};

let seenPostsSubreddit: Record<string, SeenPostSubredditEntry> = {};
let seenPostsID: Record<string, SeenPostIDEntry> = {};
let seenMedia: Record<string, SeenMediaEntry> = {};

/**
 * Converts the value from the range element (0-5) to milliseconds.
 * 
 * @param val - The value from the range (0-5)
 * @returns milliseconds corresponding to the value
 * 0 = 6 hours, 1 = 1 day, 2 = 2 days, 3 = 1 week, 4 = 2 weeks, 5 = Never
 */
function getThresholdMilliseconds(val: number): number | null {
    const msValues = [
        6 * 60 * 60 * 1000,         // 6 hours  - 0
        24 * 60 * 60 * 1000,        // 1 day    - 1
        2 * 24 * 60 * 60 * 1000,    // 2 days   - 2
        7 * 24 * 60 * 60 * 1000,    // 1 week   - 3
        14 * 24 * 60 * 60 * 1000,   // 2 weeks  - 4
        null                        // Never    - 5
    ];
    return msValues[val] ?? null;
}

let deleteThresholdDuration: number | null = 2 * 24 * 60 * 60 * 1_000; // Default 2 days in milliseconds (changeable via settings)
let isHideCrossposts: boolean = false;
let isDebugging: boolean = false;
let lessAggressivePruning: boolean = false;
let incognitoExclusiveMode: boolean = false;
let isHideTextPosts: boolean = true;
let isHideImageGIFPosts: boolean = true;
let isHideVideoPosts: boolean = true;
let isHideGalleryPosts: boolean = true;
let isHideLinkPosts: boolean = true;

function hash(data: string): string {
    return md5(data);
}

async function loadSettings(): Promise<void> {
    const settings = await getSettings();

    // Use default values if the setting is not available
    const deleteThresholdSetting = settings.deleteThreshold ?? 2;
    isHideCrossposts = settings.hideCrossposts ?? isHideCrossposts;
    isDebugging = settings.debugMode ?? isDebugging;
    lessAggressivePruning = settings.lessAggressivePruning ?? lessAggressivePruning;
    incognitoExclusiveMode = settings.incognitoExclusiveMode ?? incognitoExclusiveMode;
    isHideTextPosts = settings.hideTextPosts ?? isHideTextPosts;
    isHideImageGIFPosts = settings.hideImagePosts ?? isHideImageGIFPosts;
    isHideVideoPosts = settings.hideVideoPosts ?? isHideVideoPosts;
    isHideGalleryPosts = settings.hideGalleryPosts ?? isHideGalleryPosts;
    isHideLinkPosts = settings.hideLinkPosts ?? isHideLinkPosts;

    // Convert 0-5 to milliseconds
    // 0 = 6 hours, 1 = 1 day, 2 = 2 days, 3 = 1 week, 4 = 2 weeks, 5 = Never
    deleteThresholdDuration = getThresholdMilliseconds(deleteThresholdSetting);

    if (isDebugging) {
        console.log("Settings loaded: ", settings);
    }
}

function getSettings(): Promise<ExtensionSettings> {
    return new Promise((resolve) => {
        chrome.storage.local.get(
                ['deleteThreshold', 
                'hideCrossposts', 
                'debugMode', 
                'lessAggressivePruning', 
                'incognitoExclusiveMode', 
                'hideTextPosts', 
                'hideImagePosts', 
                'hideVideoPosts', 
                'hideGalleryPosts',
                'hideLinkPosts'
            ],
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
async function filterPosts(): Promise<void> {
    const posts = document.querySelectorAll('article');

    let hasUpdatesSubreddit: boolean = false;
    let hasUpdatesID: boolean = false;
    let hasUpdatesMedia: boolean = false;

    // Iterate through all posts to apply filtering logic based on user settings
    for (const post of posts) {
        const element = post.querySelector('shreddit-post');
        if (!element) continue;

        const postType = element?.getAttribute('post-type')?.toLowerCase() ?? "";
        let hideThisPost: boolean = false;

        // Check if the post type should be hidden based on settings
        if (shouldHidePostBasedOnType(postType)) {
            hideThisPost = await processPostFilters(hideThisPost, element);
        }

        if (hideThisPost) {
            (post as HTMLElement).style.display = 'none';
        }
    };

    // Save back to storage only if we added something new
    updatePostStorage();

    async function processPostFilters(hideThisPost: boolean, element: Element): Promise<boolean> {
        hideThisPost = filterPostByCrosspost(hideThisPost, element);
        ({ hideThisPost, hasUpdatesSubreddit } = filterPostBySubreddit(element, hideThisPost, hasUpdatesSubreddit));
        ({ hideThisPost, hasUpdatesID } = filterPostByID(element, hideThisPost, hasUpdatesID));
        ({ hideThisPost, hasUpdatesMedia } = await filterByImageHash(hideThisPost, element));
        return hideThisPost;
    }

    function shouldHidePostBasedOnType(postType: string): boolean {
        return (postType === 'crosspost' && isHideCrossposts) ||
            (postType === 'text' && isHideTextPosts) ||
            (postType === 'video' && isHideVideoPosts) ||
            (postType === 'gallery' && isHideGalleryPosts) ||
            ((postType === 'gif' || postType === 'image') && isHideImageGIFPosts) ||
            (postType === 'link' && isHideLinkPosts)
            ;
    }

    function updatePostStorage(): void {
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
}

function filterPostByCrosspost(hideThisPost: boolean, element: Element) {
        hideThisPost = isCrosspost(element);

        if (isDebugging) {
            if (hideThisPost) {
                console.log("Filtered post based on crosspost");
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
    const title = hash(titleRaw);
    const author = hash(authorRaw);
    const postID = hash(postIDRaw);
    const postKey = hash(`${title}|${author}`);

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

    const contentLink = hash(contentLinkRaw);
    const author = hash(authorRaw);
    const subreddit = hash(subredditRaw);

    const key = hash(`${contentLink}|${author}`);

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

    if (!hideThisPost) {
        try {
            const imageUrl = post.getAttribute('content-href');
            if (imageUrl) {
                if (!imageUrl.match(/\.(jpe?g|png|bmp|tiff|webp|svg|gif)$/i)) { // Only hashes the first image of gifs
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
                        const postID = hash(postIDRaw);

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