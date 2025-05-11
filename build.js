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
    plugins: [
        {
            name: 'copy-manifest',
            setup(build) {
                build.onEnd(() => {
                    // Copy manifest from the root to the dist directory
                    fs.copyFileSync(path.resolve(__dirname, 'manifest.json'), path.resolve(__dirname, 'manifest.json'));
                });
            }
        }
    ],
    format: 'iife', // Use IIFE so it's valid in a content script
    target: ['chrome103'],
    platform: 'browser',
    loader: {
        '.ts': 'ts',
    },
}).catch(() => process.exit(1));
