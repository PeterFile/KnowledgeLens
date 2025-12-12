#!/usr/bin/env node
const { execSync } = require('child_process');
const version = require('../package.json').version;
const tag = `v${version}`;

console.log(`Creating tag: ${tag}`);
execSync(`git tag ${tag}`, { stdio: 'inherit' });
console.log(`Tag ${tag} created. Run 'git push origin ${tag}' to publish.`);
