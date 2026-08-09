#!/usr/bin/env bash
# deliver.sh — upload the latest PawBond IPA to TestFlight via App Store Connect
#
# Usage:
#   ./scripts/deliver.sh                     # auto-picks newest .ipa in project root
#   ./scripts/deliver.sh path/to/build.ipa   # explicit IPA
#
# Credentials (set once, never stored in this file):
#   APPLE_ID   — your Apple ID email            (or export APPLE_ID=you@example.com)
#   APPLE_PASS — app-specific password from     (or export APPLE_PASS=xxxx-xxxx-xxxx-xxxx)
#                appleid.apple.com > Security > App-Specific Passwords
#
# Alternatively, use an App Store Connect API key (no password prompt):
#   Set KEY_ID, KEY_ISSUER_ID, and KEY_PATH below.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# ── Locate IPA ────────────────────────────────────────────────────────────────

if [[ "${1:-}" != "" ]]; then
  IPA="$1"
else
  IPA=$(ls -t "$PROJECT_DIR"/build-*.ipa 2>/dev/null | head -1)
  if [[ -z "$IPA" ]]; then
    echo "❌  No build-*.ipa found in $PROJECT_DIR"
    echo "    Run a local build first, or pass the IPA path as an argument."
    exit 1
  fi
fi

if [[ ! -f "$IPA" ]]; then
  echo "❌  File not found: $IPA"
  exit 1
fi

echo "📦  IPA : $IPA"
echo "📏  Size: $(du -sh "$IPA" | cut -f1)"
echo ""

# ── Auth method ───────────────────────────────────────────────────────────────
# Option A: App Store Connect API key (preferred — no 2FA hassle)
#   Generate at: App Store Connect → Users & Access → Integrations → App Store Connect API
KEY_ID="${ASC_KEY_ID:-}"           # e.g.  ABCD123456
KEY_ISSUER_ID="${ASC_ISSUER_ID:-}" # e.g.  xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
KEY_PATH="${ASC_KEY_PATH:-}"       # e.g.  ~/.private_keys/AuthKey_ABCD123456.p8

# Option B: Apple ID + app-specific password
APPLE_ID="${APPLE_ID:-}"
APPLE_PASS="${APPLE_PASS:-}"

# ── Upload ────────────────────────────────────────────────────────────────────

if [[ -n "$KEY_ID" && -n "$KEY_ISSUER_ID" && -n "$KEY_PATH" ]]; then
  echo "🔑  Auth: App Store Connect API key ($KEY_ID)"
  echo "⬆️   Uploading to TestFlight…"
  echo ""
  xcrun altool \
    --upload-app \
    --type ios \
    --file "$IPA" \
    --apiKey "$KEY_ID" \
    --apiIssuer "$KEY_ISSUER_ID" \
    --verbose

elif [[ -n "$APPLE_ID" && -n "$APPLE_PASS" ]]; then
  echo "🔑  Auth: Apple ID ($APPLE_ID)"
  echo "⬆️   Uploading to TestFlight…"
  echo ""
  xcrun altool \
    --upload-app \
    --type ios \
    --file "$IPA" \
    --username "$APPLE_ID" \
    --password "$APPLE_PASS" \
    --verbose

else
  echo "❌  No credentials found."
  echo ""
  echo "Option A — App Store Connect API key (recommended, no 2FA):"
  echo "  export ASC_KEY_ID=ABCD123456"
  echo "  export ASC_ISSUER_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
  echo "  export ASC_KEY_PATH=~/.private_keys/AuthKey_ABCD123456.p8"
  echo ""
  echo "Option B — Apple ID + app-specific password:"
  echo "  export APPLE_ID=you@example.com"
  echo "  export APPLE_PASS=xxxx-xxxx-xxxx-xxxx   # from appleid.apple.com"
  echo ""
  echo "Then re-run: ./scripts/deliver.sh"
  exit 1
fi

echo ""
echo "✅  Upload complete! Check TestFlight in App Store Connect."
echo "    It usually takes 5–15 min to process before testers can install."
