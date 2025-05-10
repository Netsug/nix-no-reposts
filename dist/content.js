"use strict";
// todo: get link instead of title in case of link post?
function filterPosts() {
    const posts = document.querySelectorAll('article');
    try {
        chrome.storage.local.get(["seenPosts"], (result) => {
            const seenPosts = result.seenPosts || {};
            const updatedSeen = { ...seenPosts };
            posts.forEach((post) => {
                const element = post.querySelector('shreddit-post');
                if (!element)
                    return;
                const title = element.getAttribute('content-href')?.toLowerCase() || "";
                const author = element.getAttribute('post-author')?.toLowerCase() || "";
                const subreddit = element.getAttribute('subreddit-name')?.toLowerCase() || "";
                const key = `${title}|${author}`;
                const storedSubreddit = seenPosts[key];
                if (storedSubreddit) {
                    if (storedSubreddit !== subreddit) {
                        post.style.display = 'none';
                        console.log(`Filtered duplicate from another subreddit: ${title}`);
                    }
                    // If same subreddit, show it. Nothing to do
                }
                else {
                    // First time seeing this title+author combo
                    updatedSeen[key] = subreddit;
                    // Do not hide
                }
            });
            chrome.storage.local.set({ seenPosts: updatedSeen });
        });
    }
    catch (e) {
        console.error(e);
    }
}
filterPosts();
const observer = new MutationObserver(() => {
    filterPosts();
});
observer.observe(document.body, { childList: true, subtree: true });
