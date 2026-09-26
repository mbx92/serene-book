#!/bin/sh
set -eu
node scripts/prepare-deployment.js
exec node .output/server/index.mjs
