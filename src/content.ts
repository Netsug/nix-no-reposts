import md5 from 'blueimp-md5';

type SeenPostSubredditEntry = {
    subreddit: string;
    timestamp: number; // Unix epoch in milliseconds
};

type SeenPostIDEntry = {
    postID: string;
    timestamp: number; // Unix epoch in milliseconds
};

let seenPostsSubreddit: Record<string, SeenPostSubredditEntry> = {};
let seenPostsID: Record<string, SeenPostIDEntry> = {};

let deleteThreshold: number = 2 * 24 * 60 * 60 * 1_000; // Default 2 days in milliseconds (changeable via settings)
let isFilteringCrossposts: boolean = true;
let isDebugging: boolean = true;
let lessAggressivePruning: boolean = false;
let incognitoExclusiveMode: boolean = false;

function md5hash(data: string): string {
    return md5(data);
}

async function loadSettings(): Promise<void> {
    const settings = await new Promise<any>((resolve) =>
        chrome.storage.local.get(['deleteThreshold', 'isFilteringCrossposts', 'isDebugging', 'lessAggressivePruning', 'incognito'], resolve)
    );

    // Use default values if the setting is not available
    deleteThreshold = settings.deleteThreshold ?? deleteThreshold;
    isFilteringCrossposts = settings.isFilteringCrossposts ?? isFilteringCrossposts;
    isDebugging = settings.isDebugging ?? isDebugging;
    lessAggressivePruning = settings.lessAggressivePruning ?? lessAggressivePruning;
    incognitoExclusiveMode = settings.incognito ?? incognitoExclusiveMode;

    if (isDebugging) {
        console.log("Settings loaded: ", settings);
    }
}


async function removeOldEntries(): Promise<void> {
    const now = Date.now();

    // Get the data from storage
    const { seenPostsSubreddit = {}, seenPostsID = {} } = await new Promise<Record<string, any>>((resolve) =>
        chrome.storage.local.get(["seenPostsSubreddit", "seenPostsID"], resolve)
    ) as { seenPostsSubreddit: Record<string, SeenPostSubredditEntry>, seenPostsID: Record<string, SeenPostIDEntry> };

    const newSeenPostsSubreddit: Record<string, SeenPostSubredditEntry> = {};
    const newSeenPostsID: Record<string, SeenPostIDEntry> = {};

    // Process subreddit entries
    for (const [key, entry] of Object.entries(seenPostsSubreddit)) {
        if (now - entry.timestamp < deleteThreshold) {
            newSeenPostsSubreddit[key] = entry;
        } else {
            if (isDebugging) {
                console.log(`Removing expired subreddit entry: ${key}`);
            }
        }
    }

    // Process postID entries
    for (const [key, entry] of Object.entries(seenPostsID)) {
        if (now - entry.timestamp < deleteThreshold) {
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

        let contentLink;
        let author;
        let subreddit;

        // Anonymize the entries
        if (isDebugging) {
            contentLink = element.getAttribute('content-href')?.toLowerCase() || "";
            author = element.getAttribute('author')?.toLowerCase() || "";
            subreddit = element.getAttribute('subreddit-name')?.toLowerCase() || "";
        }
        else {
            contentLink = md5hash(element.getAttribute('content-href')?.toLowerCase() || "");
            author = md5hash(element.getAttribute('author')?.toLowerCase() || "");
            subreddit = md5hash(element.getAttribute('subreddit-name')?.toLowerCase() || "");
        }

        let key;
        if (isDebugging) {
            key = `${contentLink}|${author}`;
        }
        else {
            key = md5hash(`${contentLink}|${author}`);
        }

        const storedSubredditEntry = seenPostsSubreddit[key];

        // If the entry exists...
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

        let title;
        let postID;

        if (isDebugging) {
            title = element.getAttribute('post-title') || "";
            postID = element.getAttribute('id') || "";
            key = `${title}|${author}`;
        } else {
            title = md5hash(element.getAttribute('post-title') || "");
            postID = md5hash(element.getAttribute('id') || "");
            key = md5hash(`${title}|${author}`);
        }

        if (!hideThisPost) { // Avoid storing the same post twice - save memory
            if (!lessAggressivePruning) { // lessAggressivePruning == true -> don't remove posts based on author + title combo 

                const storedTitleEntry = seenPostsID[key];
                if (storedTitleEntry) {
                    if (storedTitleEntry.postID != postID) {
                        hideThisPost = true;
                        if (isDebugging) {
                            console.log(`Filtered duplicate with similar title: ${title}`);
                        }
                    }
                }
                else {
                    seenPostsID[key] = {
                        postID: postID,
                        timestamp: now
                    }
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