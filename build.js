const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

// Copy manifest.json
fs.copyFileSync('manifest.json', 'dist/manifest.json');

// Bundle content.ts
esbuild.build({
    entryPoints: ['src/content.ts'],
    bundle: true,
    outfile: 'dist/content.js',
    format: 'iife', // Use IIFE so it's valid in a content script
    target: ['chrome103'],
    platform: 'browser',
    loader: {
        '.ts': 'ts',
    },
}).catch(() => process.exit(1));

// Bundle options.ts (new build for options page)
esbuild.build({
    entryPoints: ['src/options.ts'],
    bundle: true,
    outfile: 'dist/options.js',
    format: 'esm', // Use ES module format for options.js
    target: ['chrome103'],
    platform: 'browser',
    loader: {
        '.ts': 'ts',
    },
}).catch(() => process.exit(1));
