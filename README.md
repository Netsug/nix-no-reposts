# Nix, No Reposts!

Are you tired of seeing the same content across multiple subreddits? Are you tired or seeing users reposting the same content again and again? This browser extension automatically filters duplicate posts and crossposts from your Reddit feed, creating a cleaner browsing experience.

## Overview

This extension helps you avoid seeing the same content multiple times while browsing Reddit by:

- Filtering out duplicate posts that appear across different subreddits
- Optionally hiding crossposts

## Features

- **Duplicate Post Detection**: Identifies and hides posts with the same content that appear in multiple subreddits
- **Title-based Filtering**: Can detect similar posts based on titles (configurable)
- **Crosspost Filtering**: Option to hide all crossposts
- **Automatic Cleanup**: Periodically removes old entries based on your preferred time threshold
- **Incognito Mode Support**: Can be configured to work exclusively in incognito mode
- **Privacy-Focused**: Uses MD5 hashing to avoid storing plain-text post data

### Customizable Settings:
- Choose how long to remember seen posts (6 hours to never forget)
- Toggle crosspost filtering
- Enable less aggressive pruning for fewer false positives
- Debug mode for troubleshooting

## Installation

1. Download or clone this repository
2. Open Chrome/Edge and navigate to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the directory containing this extension
5. Navigate to Reddit and enjoy a cleaner feed!

## Configuration

Access the extension settings by clicking on the extension icon in your browser toolbar:

- **Delete Threshold**: How long to remember seen posts (6 hours, 1 day, 2 days, 1 week, 2 weeks, or never)
- **Hide Crossposts**: Toggle filtering of all crossposts
- **Less Aggressive Pruning**: Enable to reduce false positives when filtering similar posts
- **Incognito Mode Only**: When enabled, the extension will only work in incognito windows
- **Debug Mode**: Enable to see detailed logging in the console

## How It Works

The extension scans Reddit posts as you browse and:

1. Creates a unique hash for each post based on content link and author, or title and author
2. Stores this information locally with a timestamp
3. Compares new posts against previously seen content
4. Hides duplicates according to your preferences
5. Periodically cleans up old entries based on your chosen threshold

## Privacy

This extension:

- Works entirely in your browser
- Does not send any data to external servers
- Uses MD5 hashing to avoid storing plain-text post information. Only timestamps (and user settings) are stored not hashed.
- Automatically cleans up old data based on your settings

## Development

This extension is built with TypeScript for the backend, Tailwind CSS for the frontend, and uses the Chrome Extension API for browser integration.

### Project Structure

- `content.ts`: Main filtering logic
- `background.js`: Sees if the current window is in incognito
- `options.html/options.js`: Settings interface
- `manifest.json`: Extension configuration

### Building from Source

1. Install dependencies: `npm install`
2. Compile TypeScript: `npm run build`
3. The compiled extension will be in the `dist` directory

## Contributions

Contributions are welcome! Please feel free to submit a Pull Request.

## License

GPLv3

Made with ❤️ for Reddit users tired of seeing the same content multiple times.