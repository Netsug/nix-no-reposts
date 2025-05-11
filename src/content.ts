// TODO: Fix this
// @ts-ignore
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
const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1_000; // Two days in milliseconds (time we store each entry) TODO: This seems arbitrary. Any other suggestions for a set length?

function md5hash(data: string): string {
    //return CryptoJS.MD5(data).toString(CryptoJS.enc.Hex);
    return md5(data);
}

// Load seenPosts at every page load and remove expired entries

function removeOldEntires(): void {
    chrome.storage.local.get(["seenPostsSubreddit"], (result) => {
        const now = Date.now();
        let removedEntires: boolean = false;

        const stored = result.seenPostsSubreddit || {};
        seenPostsSubreddit = {};

        // Remove expired entires
        for (const [key, entry] of Object.entries(stored) as [string, SeenPostSubredditEntry][]) {
            if (now - entry.timestamp < TWO_DAYS_MS) {
                seenPostsSubreddit[key] = entry;
                removedEntires = true;
                // console.log("Removing: " + key + " subreddit: " + entry.subreddit);
            }
        }

        // Update storage in case we pruned expired entries
        if (removedEntires) {
            chrome.storage.local.set({ seenPostsSubreddit: seenPostsSubreddit });
        }
    });

    chrome.storage.local.get(["seenPostsID"], (result) => {
        const now = Date.now();
        let removedEntires: boolean = false;
        const stored = result.seenPostsID || {};
        seenPostsID = {};

        // Remove expired entires
        for (const [key, entry] of Object.entries(stored) as [string, SeenPostIDEntry][]) {
            if (now - entry.timestamp < TWO_DAYS_MS) {
                seenPostsID[key] = entry;
                removedEntires = true;
                console.log("Removing: " + key + " title: " + entry.postID);
            }
        }

        // Update storage in case we pruned expired entries
        if (removedEntires) {
            chrome.storage.local.set({ seenPostsID: seenPostsID });
        }

    })


    // Start the filtering of the current page
    filterPosts();
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

        // Anonymize the entries
        //const contentLink = md5hash(element.getAttribute('content-href')?.toLowerCase() || "" );
        //const author = md5hash(element.getAttribute('author')?.toLowerCase() || "" );
        //const subreddit = md5hash(element.getAttribute('subreddit-name')?.toLowerCase() || "" );

        const contentLink = element.getAttribute('content-href')?.toLowerCase() || "";
        const author = element.getAttribute('author')?.toLowerCase() || "";
        const subreddit = element.getAttribute('subreddit-name')?.toLowerCase() || "";

        let key = `${contentLink}|${author}`;
        const storedSubredditEntry = seenPostsSubreddit[key];

        // If the entry exists...
        if (storedSubredditEntry) {
            // and the entry's subreddit is not equal to this <article> subreddit
            if (storedSubredditEntry.subreddit !== subreddit) {
                // Hide it
                hideThisPost = true;
                //console.log(`Filtered duplicate from another subreddit: ${subreddit}`);
            }
        } else {
            // First time seeing this content+author combo. Add it to the storage.
            seenPostsSubreddit[key] = {
                subreddit: subreddit,
                timestamp: now
            }
            hasUpdatesSubreddit = true;
        }

        // Optimize
        if (!hideThisPost) {
            const title = element.getAttribute('post-title') || "";
            key = `${title}|${author}`;

            const storedTitleEntry = seenPostsID[key];
            const postID = element.getAttribute('id') || "";

            if (storedTitleEntry) {
                if (storedTitleEntry.postID != postID) {
                    hideThisPost = true;
                    console.log(`Filtered duplicate with similar title: ${title}`);
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

        if (hideThisPost) {
            (post as HTMLElement).style.display = 'none';
        }
    });

    // Save back to storage only if we added something new
    if (hasUpdatesSubreddit) {
        chrome.storage.local.set({ seenPosts: seenPostsSubreddit });
    }
    if (hasUpdatesID) {
        chrome.storage.local.set({ seenPostsTitle: seenPostsID });
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