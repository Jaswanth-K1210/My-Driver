#!/usr/bin/env bash
# Push the canonical API client out to every app that vendors a copy.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
src="$here/api-client.js"

for dest in \
  "$here/../website/src/lib/api.js" \
  "$here/../mobile/user/src/lib/api.js" \
  "$here/../mobile/driver/src/lib/api.js"
do
  mkdir -p "$(dirname "$dest")"
  cp "$src" "$dest"
  echo "synced -> ${dest#"$here/../"}"
done
