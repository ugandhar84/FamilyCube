#!/bin/bash
# Check feature flags in the database

if [ -z "$DATABASE_URL" ]; then
  echo "❌ DATABASE_URL not set. Get it from Supabase Dashboard → Settings → Database"
  echo ""
  echo "To use this script:"
  echo "  export DATABASE_URL='postgresql://...'"
  echo "  ./scripts/check-feature-flags.sh"
  exit 1
fi

echo "Checking voice appointment feature flag..."
psql "$DATABASE_URL" << EOF
SELECT key, value FROM app_settings WHERE key = 'appt_voice_input_enabled';
EOF

echo ""
echo "If the flag is not shown above, run this to create it:"
echo "  psql \$DATABASE_URL << 'SQL_EOF'"
echo "  INSERT INTO app_settings (key, value, updated_by, updated_at)"
echo "  VALUES ('appt_voice_input_enabled', true, 'system', NOW())"
echo "  ON CONFLICT (key) DO UPDATE SET value = true, updated_at = NOW();"
echo "  SQL_EOF"
