//import * as CryptoJS from 'crypto-js';

// TODO: Fix this
// @ts-ignore
import md5 from 'blueimp-md5';

type SeenPostEntry = {
    subreddit: string;
    timestamp: number; // Unix epoch in milliseconds
};

let seenPosts: Record<string, SeenPostEntry> = {};
const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1_000; // Two days in milliseconds (time we store each entry) TODO: This seems arbitrary. Any other suggestions for a set length?

function md5hash(data: string): string {
    //return CryptoJS.MD5(data).toString(CryptoJS.enc.Hex);
    return md5(data);
}

// Load seenPosts at every page load and remove expired entries
chrome.storage.local.get(["seenPosts"], (result) => {
    const now = Date.now();
    const stored = result.seenPosts || {};
    seenPosts = {};

    // Remove expired entires
    for (const [key, entry] of Object.entries(stored) as [string, SeenPostEntry][]) {
        if (now - entry.timestamp < TWO_DAYS_MS) {
            seenPosts[key] = entry;
            // console.log("Removing: " + key + " subreddit: " + entry.subreddit);
        }
    }

    // Update storage in case we pruned expired entries
    chrome.storage.local.set({ seenPosts });

    filterPosts();
});

// Perform filtering and update seenPosts in memory
function filterPosts() {
    const now = Date.now();
    const posts = document.querySelectorAll('article');
    let hasUpdates = false;

    posts.forEach((post) => {
        const element = post.querySelector('shreddit-post');
        if (!element) return;

        // Anonymize the entries
        const contentLink = md5hash(element.getAttribute('content-href')?.toLowerCase() || "" );
        const author = md5hash(element.getAttribute('post-author')?.toLowerCase() || "" );
        const subreddit = md5hash(element.getAttribute('subreddit-name')?.toLowerCase() || "" );

        const key = `${contentLink}|${author}`;
        const storedSubredditEntry = seenPosts[key];

        // If the entry exists...
        if (storedSubredditEntry) {
            // and the entry's subreddit is equal to this <article> subreddit
            if (storedSubredditEntry.subreddit !== subreddit) {
                // Hide it
                (post as HTMLElement).style.display = 'none';
                // console.log(`Filtered duplicate from another subreddit: ${contentLink}`);
            }
        } else {
            // First time seeing this content+author combo. Add it to the storage.
            seenPosts[key] = {
                subreddit: subreddit,
                timestamp: now
            }
            hasUpdates = true;
        }
    });

    // Save back to storage only if we added something new
    if (hasUpdates) {
        chrome.storage.local.set({ seenPosts });
    }
}

// Debounced observer to avoid excessive triggering
let debounceTimer: number;
const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
        filterPosts();
    }, 50);
});
observer.observe(document.body, { childList: true, subtree: true });