<p align="center">
    <img src=images/icon-256.png alt="icon" width=200/>
</p>

# Nix, No Reposts!

Tired of seeing the same posts over and over on Reddit?
This browser extension automatically filters out duplicate posts and crossposts across Reddit.

## Overview

This extension helps you avoid seeing the same content multiple times while browsing Reddit by:

- Filtering out duplicate posts that appear across different subreddits
- Detecting and filtering duplicate media content (images, videos, galleries)
- Selectively hiding different types of posts (text, image, video, link, gallery)
- Optionally hiding crossposts
- All with complete privacy - everything happens locally in your browser

## Features

- **Comprehensive Duplicate Detection**:
  - Content link + author-based filtering
  - Title + author similarity detection
  - Advanced media content matching (images, videos, galleries)
  - Cross-subreddit duplicate detection
  
- **Customizable Post Type Filtering**:
  - Text posts
  - Image/GIF posts
  - Video posts
  - Gallery posts
  - Link posts
  - Crossposts

- **Smart Memory Management**:
  - Automatically removes old entries based on your preferred time threshold
  - Configurable retention periods (6 hours to never forget)

- **Privacy and Security**:
  - Uses SHA256 hashing for all stored data
  - No server communication - everything stays in your browser
  - Automatic data cleanup based on your settings

- **Developer Features**:
  - Optional debug mode
  - Storage statistics and inspection tools

## Installation

## Prerequisites
- Node.js (version 16 or higher)
- npm or yarn package manager


## Setup Instructions

1. Clone and install dependencies:

```bash
git clone https://github.com/Netsug/nix-no-reposts
cd nix-no-reposts
npm install
```

2. Build the extension:
```bash
npm run build
```

3. Load in Chrome/Edge:

Open Chrome/Edge and navigate to chrome://extensions/.

Enable "Developer mode" (toggle in top right).

Click "Load unpacked" and select the dist folder (or whatever your build output directory is).

4. Navigate to Reddit and enjoy a cleaner feed!

## Configuration

Access the extension settings by clicking on the extension icon in your browser toolbar:

### General Settings
- **Delete Threshold**: How long to remember seen posts (6 hours, 1 day, 2 days, 1 week, 2 weeks, or never)
- **Hide Crossposts**: Toggle filtering of all crossposts
- **Less Aggressive Pruning**: Enable to reduce false positives when filtering similar posts
- **Debug Mode**: Enable to see detailed logging in the console

### Post Type Filtering
Control exactly which types of posts are subject to duplicate filtering:
- Hide Text Posts
- Hide Image Posts
- Hide Video Posts
- Hide Gallery Posts
- Hide Link Posts

### Storage Management
- View statistics on tracked entries and storage size
- Reset settings to defaults
- Delete all stored post data

## How It Works

The extension employs multiple techniques to detect duplicate content:

1. **Content Link + Author Detection**: 
   - Creates a unique hash from content URL + author
   - Detects the same content shared by the same person across subreddits

2. **Title + Author Similarity**: 
   - Creates a unique hash from post title + author
   - Helps detect slightly modified reposts (can be disabled with "Less Aggressive Pruning")

3. **Media Content Analysis**:
   - For images: Creates content-based hashes to match visually identical images
   - For videos: Analyzes video content to detect duplicates
   - For galleries: Creates combined hashes of all images in the gallery

4. **Storage and Privacy**:
   - All identifiers are stored as secure SHA256 hashes
   - Data is automatically pruned based on your threshold settings
   - Works entirely locally - no data is sent to servers

## Technical Details

This extension is built with TypeScript for robustness and uses modern browser APIs for efficiency:

- MutationObserver for real-time DOM monitoring
- Chrome Storage API for persistent data storage
- Background services for media content processing
- Responsive settings UI with Tailwind CSS

### Project Structure

- `content.ts`: Main filtering logic and post detection
- `options.html/options.ts`: Settings interface and storage management
- `manifest.json`: Extension configuration

### Building from Source

1. Install dependencies: `npm install`
2. Compile TypeScript: `npm run build`
3. The compiled extension will be in the `dist` directory

## Privacy Commitment

Your privacy is our top priority:

- No data ever leaves your browser
- All post identifiers are stored as SHA256 hashes
- No tracking or analytics
- Automatic data cleanup based on your settings
- All code is open source
- View how the extension stores viewed posts in settings

## Contributions

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This extension is licensed under GPLv3. Source code and license: https://github.com/Netsug/nix-no-reposts