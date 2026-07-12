#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const artifactsDir = path.resolve(__dirname, '..', '.artifacts');
fs.mkdirSync(artifactsDir, { recursive: true });
