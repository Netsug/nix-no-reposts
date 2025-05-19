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
    //let hasUpdatesID: boolean = false;
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
    await updatePostStorage();

    // by which method we filter a post is disconnected from if we filter a post
    // An image post can be filtered by its ID for example.
    async function processPostFilters(hideThisPost: boolean, element: Element): Promise<boolean> {
        // Ordered from least intensive to most intensive
        hideThisPost = filterPostByCrosspost(hideThisPost, element);
        
        ({ hideThisPost, hasUpdatesSubreddit } = filterPostBySubreddit(element, hideThisPost, hasUpdatesSubreddit));
        
        //({ hideThisPost, hasUpdatesID } = filterPostByID(element, hideThisPost, hasUpdatesID));
        
        const imageResult = await filterByImageHash(hideThisPost, element);
        hideThisPost = imageResult.hideThisPost;
        hasUpdatesMedia = hasUpdatesMedia || imageResult.hasUpdatesMedia;

        const videoResult = await filterByVideoHash(hideThisPost, element);
        hideThisPost = videoResult.hideThisPost;
        hasUpdatesMedia = hasUpdatesMedia || videoResult.hasUpdatesMedia;

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

    async function updatePostStorage(): Promise<void> {
        const promises: Promise<void>[] = [];

        if (hasUpdatesSubreddit) {
            promises.push(chrome.storage.local.set({ seenPostsSubreddit }));
        }

        /*if (hasUpdatesID) {
            promises.push(chrome.storage.local.set({ seenPostsID }));
        }*/

        if (hasUpdatesMedia) {
            promises.push(chrome.storage.local.set({ seenMedia }));
        }

        await Promise.all(promises);
    }    
}

function filterPostByCrosspost(hideThisPost: boolean, element: Element) {
    if(hideThisPost){
        // Post already hidden
        return hideThisPost;
    }

    hideThisPost = isCrosspost(element);

    if (isDebugging) {
        if (hideThisPost) {
            console.log("Filtered post based on crosspost");
        }
    }
    return hideThisPost;
}


// The other methods are most likely reliable enough to make this obsolete.
// I.e this causes more trouble than it solves.
/*
function filterPostByID(element: Element, hideThisPost: boolean, hasUpdatesID: boolean) {
    if (hideThisPost) {
        // Post already hidden;
        return { hideThisPost, hasUpdatesID };
    }

    const now = Date.now();

    const authorRaw = element.getAttribute('author') || "";
    const titleRaw = element.getAttribute('post-title') || "";
    const postIDRaw = element.getAttribute('id') || "";

    const title = hash(titleRaw);
    const author = hash(authorRaw);
    const postID = hash(postIDRaw);
    const postKey = hash(`${title}|${author}`);

    if (isDebugging) {
        console.log(`Post Key (title|author): ${titleRaw}|${author}`);
    }

    // It's rare, but there are are cases where one user can have multiple posts with the same title.
    // And the content being different.
    if (lessAggressivePruning) {
        return { hideThisPost, hasUpdatesID };
    }

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
    return { hideThisPost, hasUpdatesID };
}
    */

function filterPostBySubreddit(element: Element, hideThisPost: boolean, hasUpdatesSubreddit: boolean) {
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
            timestamp: Date.now()
        };
        hasUpdatesSubreddit = true;
    }
    return { hideThisPost, hasUpdatesSubreddit };
}

function isCrosspost(element: Element): boolean {
    return element?.hasAttribute('post-type') && element.getAttribute('post-type')?.toLowerCase() === 'crosspost';
}

async function filterByImageHash(hideThisPost: boolean, post: Element) {
    let hasUpdatesMedia = false;
    if (hideThisPost) return { hideThisPost, hasUpdatesMedia };

    const isGallery = post.getAttribute("post-type") === "gallery";

    if (isGallery) {
        const result = await processGalleryImages(post, hideThisPost);
        hideThisPost = result.hideThisPost;
        hasUpdatesMedia = hasUpdatesMedia || result.hasUpdatesMedia;
        processGalleryImages(post, hideThisPost);

        /**
         * Processes gallery images: fetches image URLs, hashes them, and updates seenMedia.
         * 
         * @param post - The post element containing the gallery
         * @param hideThisPost - Flag to indicate if the post should be hidden
         * @returns 
         */
        async function processGalleryImages(post: Element, hideThisPost: boolean): Promise<{ hideThisPost: boolean, hasUpdatesMedia: boolean }> {
            let hasUpdatesMedia = false;
            const contentRefUrl = post.getAttribute('content-href');
            if (!contentRefUrl) {
            console.warn('No content-href attribute on gallery post');
            return { hideThisPost, hasUpdatesMedia };
            }

            let imageUrls: string[] = [];
            try {
            imageUrls = await fetchGalleryImageUrls(contentRefUrl);
            } catch (e) {
            console.error('Failed to get gallery images:', e);
            return { hideThisPost, hasUpdatesMedia };
            }

            if (imageUrls.length === 0 && isDebugging) {
            console.warn("No images found in gallery page");
            return { hideThisPost, hasUpdatesMedia };
            }

            if (isDebugging) {
            console.log("Gallery post detected, image URLs: ", imageUrls);
            }

            const fetchHash = await fetchGalleryHashes(imageUrls);
            const combinedHash = fetchHash ? fetchHash.slice(0, 32) : ""; // Saving only the first 32 characters

            if (!combinedHash && isDebugging) {
            console.warn('Failed to get combined gallery hash');
            return { hideThisPost, hasUpdatesMedia };
            }

            if (isDebugging) {
            console.log("Combined hash: ", combinedHash);
            }

            if (combinedHash.length < 32) {
            console.warn("Combined hash is too short: ", combinedHash);
            return { hideThisPost, hasUpdatesMedia };
            }

            const storedMediaEntry = seenMedia[combinedHash];
            const postIDRaw = post.getAttribute('id') || "";
            const postID = hash(postIDRaw);

            if (storedMediaEntry) {
            if (storedMediaEntry.postID != postID) {
                hideThisPost = true;
                if (isDebugging) {
                console.log(`Filtered duplicate based on gallery content hash: ${combinedHash}`);
                }
            }
            } else {
            seenMedia[combinedHash] = { postID, timestamp: Date.now() };
            hasUpdatesMedia = true;
            }
            return { hideThisPost, hasUpdatesMedia };
        }
    } else {
        processSingleImage(post, hideThisPost);
    }

    return { hideThisPost, hasUpdatesMedia };

    /**
     * Fetches the hash of a single image.
     * 
     * @param post - The post element containing the image
     * @param hideThisPost - Flag to indicate if the post should be hidden
     * @returns 
     */
    async function processSingleImage(post: Element, hideThisPost: boolean): Promise<{ hideThisPost: boolean, hasUpdatesMedia: boolean }> {
        let hasUpdatesMedia = false;
        const imageUrl = post.getAttribute('content-href');
        if (!imageUrl) return { hideThisPost, hasUpdatesMedia };

        const fetchedHash = await fetchImageHash(imageUrl);
        const mediaHash = fetchedHash ? fetchedHash.slice(0, 32) : null;

        if (!mediaHash) {
            console.warn("Image hash failed for:", imageUrl);
            return { hideThisPost, hasUpdatesMedia };
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
            seenMedia[mediaHash] = { postID, timestamp: Date.now() };
            hasUpdatesMedia = true;
        }
        return { hideThisPost, hasUpdatesMedia };
    }

    const result = await processSingleImage(post, hideThisPost);
    hideThisPost = result.hideThisPost;
    hasUpdatesMedia = hasUpdatesMedia || result.hasUpdatesMedia;

    /**
     * Fetches the hashes of images in a gallery.
     * 
     * @param imageUrls - Array of image URLs to fetch and hash
     * @returns 
     */
    async function fetchGalleryHashes(imageUrls: string[] = []): Promise<string> {
        const hashes: string[] = [];

        for (const imageUrl of imageUrls) {
            const hash = await fetchImageHash(imageUrl);
            if (hash) {
                hashes.push(hash);
            } else {
                if (isDebugging) {
                    console.warn("Failed to fetch image hash for URL: ", imageUrl);
                }
            }
        }

        if (hashes.length === 0 && isDebugging) {
            console.warn("No hashes found for gallery images");
            return "";
        }

        // Hash the concatenated string of hashes
        const combinedHash = hash(hashes.join(''));
        return combinedHash;
    }

    /**
     * Fetches the image URLs from a gallery post.
     * 
     * @param url - The URL of the gallery post
     * @returns 
     */
    async function fetchGalleryImageUrls(url: string): Promise<string[]> {
        return new Promise((resolve, reject) => {
            // Convert post url to json url (add .json at the end)
            let jsonUrl = url;
            if (!jsonUrl.endsWith('.json')) {
                jsonUrl = jsonUrl.replace(/\/?$/, '') + '.json';
            }

            chrome.runtime.sendMessage(
                { type: 'fetchGalleryJson', url: jsonUrl },
                (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }
                    if (response.error) {
                        reject(new Error(response.error));
                        return;
                    }
                    if (!response.json) {
                        reject(new Error("No JSON returned from background fetch"));
                        return;
                    }

                    try {
                        const data = JSON.parse(response.json);
                        // Reddit API returns an array, first element holds post data
                        const postData = data[0]?.data?.children?.[0]?.data;
                        if (!postData) {
                            resolve([]);
                            return;
                        }
                        if (!postData.gallery_data || !postData.media_metadata) {
                            resolve([]);
                            return;
                        }

                        const items = postData.gallery_data.items;
                        const mediaMetadata = postData.media_metadata;

                        const imageUrls: string[] = [];

                        for (const item of items) {
                            const mediaId = item.media_id;
                            const media = mediaMetadata[mediaId];
                            if (!media || !media.s || !media.s.u) continue;

                            // Fix &amp; encoding in URL
                            const imageUrl = media.s.u.replace(/&amp;/g, '&');
                            imageUrls.push(imageUrl);
                        }

                        resolve(imageUrls);

                    } catch (err) {
                        if (err instanceof Error) {
                            reject(new Error('Failed to parse Reddit JSON: ' + err.message));
                        } else {
                            reject(new Error('Failed to parse Reddit JSON: ' + String(err)));
                        }
                    }
                }
            );
        });
    }

    /**
     * Fetches the hash of an image from a given URL.
     * 
     * @param imageUrl - The URL of the image to fetch and hash
     * @returns 
     */
    async function fetchImageHash(imageUrl: string) {
        return await new Promise<string | null>((resolve) => {
            const timeoutId = setTimeout(() => {
                console.warn('Timeout waiting for background response');
                resolve(null);
            }, 5000); // 5 seconds timeout

            chrome.runtime.sendMessage(
                { type: 'fetchAndHashImage', url: imageUrl },
                (response) => {
                    clearTimeout(timeoutId);
                    if (chrome.runtime.lastError) {
                        console.error('chrome.runtime.lastError:', chrome.runtime.lastError.message);
                        resolve(null);
                        return;
                    }
                    if (response && response.hash) {
                        resolve(response.hash);
                    } else {
                        resolve(null);
                    }
                }
            );
        });
    }
}

async function filterByVideoHash(hideThisPost: boolean, post: Element){
    let hasUpdatesMedia: boolean = false;

    if(hideThisPost){
        // Post is already hidden
        return { hideThisPost, hasUpdatesMedia };
    }

    const videoUrl = post.getAttribute('content-href');
    if (!videoUrl) {
        // Video link doesn't exist
        return { hideThisPost, hasUpdatesMedia };
    }

    const mediaHash = await fetchVideoHash();
    const videoHash = mediaHash ? mediaHash.slice(0, 32) : null; // Saving only the first 32 characters

    if (!mediaHash || mediaHash.length < 32 || !videoHash) {
        console.warn("(Video) Hash didn't work " + videoUrl);
        return { hideThisPost, hasUpdatesMedia };
    }

    if (isDebugging) {
        console.log("Video hash: ", videoHash);
    }

    const storedMediaEntry = seenMedia[videoHash];
    const postIDRaw = post.getAttribute('id') || "";
    const postID = hash(postIDRaw);
    if (storedMediaEntry) {
        if (storedMediaEntry.postID != postID) {
            hideThisPost = true;
            if (isDebugging) {
                console.log(`Filtered duplicate based on video content hash: ${videoHash}`);
            }
        }
    } else {
        seenMedia[videoHash] = {
            postID: postID,
            timestamp: Date.now()
        };

        hasUpdatesMedia = true;
    }

    return { hideThisPost, hasUpdatesMedia };

    async function fetchVideoHash() {
        return await new Promise<string | null>((resolve) => {
            const timeoutId = setTimeout(() => {
                console.warn('Timeout waiting for background response');
                resolve(null);
            }, 5000); // 5 seconds timeout

            chrome.runtime.sendMessage(
                { type: 'fetchAndHashVideo', url: videoUrl },
                (response) => {
                    clearTimeout(timeoutId);
                    if (chrome.runtime.lastError) {
                        console.error('chrome.runtime.lastError:', chrome.runtime.lastError.message);
                        resolve(null);
                        return;
                    }
                    if (response && response.hash) {
                        resolve(response.hash);
                    } else {
                        resolve(null);
                    }
                }
            );
        });
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