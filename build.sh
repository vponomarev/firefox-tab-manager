#!/bin/sh
set -eu

npx --yes web-ext@10.5.0 build \
  --source-dir src \
  --artifacts-dir . \
  --filename firefox-tab-manager.zip \
  --overwrite-dest
