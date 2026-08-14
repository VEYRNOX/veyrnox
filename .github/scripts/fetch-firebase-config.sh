#!/usr/bin/env bash
# Fetch a Firebase native config at build time without committing it to git.
# The caller must authenticate gcloud first. Config files contain public client
# identifiers, but keeping them CI-generated prevents the wrong Firebase app
# from silently being baked into a release channel.

set -euo pipefail

if [[ $# -ne 4 ]]; then
  echo "usage: $0 <android|ios> <project-id> <firebase-app-id> <output-path>" >&2
  exit 64
fi

platform="$1"
project_id="$2"
firebase_app_id="$3"
output_path="$4"

case "$platform" in
  android) collection="androidApps" ;;
  ios) collection="iosApps" ;;
  *)
    echo "unsupported Firebase platform: $platform" >&2
    exit 64
    ;;
esac

if [[ ! "$project_id" =~ ^[a-z0-9-]+$ ]]; then
  echo "invalid Firebase project id" >&2
  exit 64
fi
if [[ ! "$firebase_app_id" =~ ^1:[0-9]+:(android|ios):[a-f0-9]+$ ]]; then
  echo "invalid Firebase app id" >&2
  exit 64
fi

access_token="$(gcloud auth print-access-token)"
response_file="$(mktemp)"
decoded_file="$(mktemp)"
trap 'rm -f "$response_file" "$decoded_file"' EXIT

curl --fail --silent --show-error \
  -H "Authorization: Bearer ${access_token}" \
  "https://firebase.googleapis.com/v1beta1/projects/${project_id}/${collection}/${firebase_app_id}/config" \
  --output "$response_file"

jq -er '.configFileContents' "$response_file" \
  | openssl base64 -d -A > "$decoded_file"

if [[ ! -s "$decoded_file" ]]; then
  echo "Firebase returned an empty config file" >&2
  exit 1
fi

mkdir -p "$(dirname "$output_path")"
mv "$decoded_file" "$output_path"
chmod 600 "$output_path"
echo "Fetched Firebase ${platform} config for ${firebase_app_id}."
