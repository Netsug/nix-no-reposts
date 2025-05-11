//import * as CryptoJS from 'crypto-js';

// TODO: Fix this
// @ts-ignore
import md5 from 'blueimp-md5';

type SeenPostEntry = {
    subreddit: string;
    timestamp: number; // Unix epoch in milliseconds
};

type SeenPostTitleEntry = {
    postID: string;
    timestamp: number; // Unix epoch in milliseconds
};


let seenPosts: Record<string, SeenPostEntry> = {};
let seenPostsTitle: Record<string, SeenPostTitleEntry> = {};
const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1_000; // Two days in milliseconds (time we store each entry) TODO: This seems arbitrary. Any other suggestions for a set length?

function md5hash(data: string): string {
    //return CryptoJS.MD5(data).toString(CryptoJS.enc.Hex);
    return md5(data);
}

// Load seenPosts at every page load and remove expired entries

function removeOldEntires(): void {
    chrome.storage.local.get(["seenPosts"], (result) => {
        const now = Date.now();
        let removedEntires: boolean = false;

        const stored = result.seenPosts || {};
        seenPosts = {};

        // Remove expired entires
        for (const [key, entry] of Object.entries(stored) as [string, SeenPostEntry][]) {
            if (now - entry.timestamp < TWO_DAYS_MS) {
                seenPosts[key] = entry;
                removedEntires = true;
                // console.log("Removing: " + key + " subreddit: " + entry.subreddit);
            }
        }

        // Update storage in case we pruned expired entries
        if (removedEntires) {
            chrome.storage.local.set({ seenPosts });
        }
    });

    chrome.storage.local.get(["seenPostsTitle"], (result) => {
        const now = Date.now();
        let removedEntires: boolean = false;
        const stored = result.seenPostsTitle || {};
        seenPostsTitle = {};

        // Remove expired entires
        for (const [key, entry] of Object.entries(stored) as [string, SeenPostTitleEntry][]) {
            if (now - entry.timestamp < TWO_DAYS_MS) {
                seenPostsTitle[key] = entry;
                removedEntires = true;
                console.log("Removing: " + key + " title: " + entry.title);
            }
        }

        // Update storage in case we pruned expired entries
        if (removedEntires) {
            chrome.storage.local.set({ seenPostsTitle });
        }

    })


    // Start the filtering of the current page
    filterPosts();
}

// Perform filtering and update seenPosts in memory
function filterPosts() {
    const now = Date.now();
    const posts = document.querySelectorAll('article');

    let hasUpdates: boolean = false;
    let hasUpdatesTitle: boolean = false;

    posts.forEach((post) => {
        const element = post.querySelector('shreddit-post');
        if (!element) return;

        let hidePost: boolean = false;

        // Anonymize the entries
        //const contentLink = md5hash(element.getAttribute('content-href')?.toLowerCase() || "" );
        //const author = md5hash(element.getAttribute('author')?.toLowerCase() || "" );
        //const subreddit = md5hash(element.getAttribute('subreddit-name')?.toLowerCase() || "" );

        const contentLink = element.getAttribute('content-href')?.toLowerCase() || "";
        const author = element.getAttribute('author')?.toLowerCase() || "";
        const subreddit = element.getAttribute('subreddit-name')?.toLowerCase() || "";

        let key = `${contentLink}|${author}`;
        const storedSubredditEntry = seenPosts[key];

        // If the entry exists...
        if (storedSubredditEntry) {
            // and the entry's subreddit is not equal to this <article> subreddit
            if (storedSubredditEntry.subreddit !== subreddit) {
                // Hide it
                hidePost = true;
                //console.log(`Filtered duplicate from another subreddit: ${subreddit}`);
            }
        } else {
            // First time seeing this content+author combo. Add it to the storage.
            seenPosts[key] = {
                subreddit: subreddit,
                timestamp: now
            }
            hasUpdates = true;
        }

        const title = element.getAttribute('post-title') || "";
        key = `${title}|${author}`;
        
        const storedTitleEntry = seenPostsTitle[key];
        const postID = element.getAttribute('id') || "";

        if (storedTitleEntry) {
            if (storedTitleEntry.postID != postID) {
                hidePost = true;
                console.log(`Filtered duplicate with similar title: ${title}`);
            }
        }
        else {
            seenPostsTitle[key] = {
                postID: postID,
                timestamp: now
            }
            hasUpdatesTitle = true;
        }

        if (hidePost) {
            (post as HTMLElement).style.display = 'none';
        }
    });

    // Save back to storage only if we added something new
    if (hasUpdates) {
        chrome.storage.local.set({ seenPosts });
    }
    if (hasUpdatesTitle) {
        chrome.storage.local.set({ seenPostsTitle });
    }
}

// Initialize
removeOldEntires();

// Run filterPosts() every time the DOMS changes
// Debounced observer to avoid excessive triggering
let debounceTimer: number;
const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
        filterPosts();
    }, 50);
});
observer.observe(document.body, { childList: true, subtree: true });