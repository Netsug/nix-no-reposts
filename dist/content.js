"use strict";
// src/content.ts
chrome.storage.local.remove("blockedKeywords", () => {
    console.log("Blocked keywords cleared");
});
function filterPosts() {
    const posts = document.querySelectorAll('article');
    chrome.storage.local.get(["blockedKeywords"], (result) => {
        let blockedKeywords = result.blockedKeywords || [];
        posts.forEach((post) => {
            const titleElement = post.querySelector('shreddit-post');
            if (titleElement) {
                const titleText = titleElement.getAttribute('post-title')?.toLowerCase() || "";
                if (blockedKeywords.some((keyword) => titleText.includes(keyword))) {
                    post.style.display = 'none'; // Hide the post
                    console.log("Filtered post:", titleText);
                }
                else {
                    // If not already blocked, add this post's title to blockedKeywords
                    blockedKeywords.push(titleText);
                }
            }
        });
        // Save the updated blockedKeywords after checking all posts
        chrome.storage.local.set({ blockedKeywords: [...new Set(blockedKeywords)] }, () => {
            console.log("Updated blocked keywords:", blockedKeywords);
        });
    });
}
filterPosts();
// Optional: Observe for DOM changes and re-filter
const observer = new MutationObserver(() => {
    filterPosts(); // Use the same blockedKeywords
});
observer.observe(document.body, { childList: true, subtree: true });
