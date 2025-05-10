"use strict";
let seenPosts = {};
// Load seenPosts from storage once at startup
chrome.storage.local.get(["seenPosts"], (result) => {
    seenPosts = result.seenPosts || {};
    filterPosts(); // Initial run after loading storage
});
// Perform filtering and update seenPosts in memory
function filterPosts() {
    const posts = document.querySelectorAll('article');
    let hasUpdates = false;
    posts.forEach((post) => {
        const element = post.querySelector('shreddit-post');
        if (!element)
            return;
        const contentLink = element.getAttribute('content-href')?.toLowerCase() || "";
        const author = element.getAttribute('post-author')?.toLowerCase() || "";
        const subreddit = element.getAttribute('subreddit-name')?.toLowerCase() || "";
        const key = `${contentLink}|${author}`;
        const storedSubreddit = seenPosts[key];
        if (storedSubreddit) {
            if (storedSubreddit !== subreddit) {
                post.style.display = 'none';
                console.log(`Filtered duplicate from another subreddit: ${contentLink}`);
            }
        }
        else {
            // First time seeing this content+author combo
            seenPosts[key] = subreddit;
            hasUpdates = true;
        }
    });
    // Save back to storage only if we added something new
    if (hasUpdates) {
        chrome.storage.local.set({ seenPosts });
    }
}
// Debounced observer to avoid excessive triggering
let debounceTimer;
const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
        filterPosts();
    }, 200);
});
observer.observe(document.body, { childList: true, subtree: true });
