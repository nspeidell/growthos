#!/usr/bin/env bash
# ═══════════════════════════════════════════
# apply-migrations.sh
#
# Apply all D1 migrations in order.
#
# Usage:
#   ./scripts/apply-migrations.sh --local     # local dev (miniflare)
#   ./scripts/apply-migrations.sh --remote    # production D1
# ═══════════════════════════════════════════

set -euo pipefail

# ─── Config ───

DB_NAME_DEV="growthos-dev"
DB_NAME_PROD="growthos-prod"
MIGRATIONS_DIR="src/lib/db/migrations"

# ─── Parse Args ───

MODE=""
DB_NAME=""

case "${1:-}" in
  --local)
    MODE="--local"
    DB_NAME="$DB_NAME_DEV"
    ;;
  --remote)
    MODE="--remote"
    DB_NAME="$DB_NAME_PROD"
    ;;
  *)
    echo "Usage: $0 [--local|--remote]"
    echo ""
    echo "  --local   Apply to local D1 (miniflare) using $DB_NAME_DEV"
    echo "  --remote  Apply to production D1 using $DB_NAME_PROD"
    exit 1
    ;;
esac

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║     GrowthOS D1 Migration Runner            ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "  Mode:     $MODE"
echo "  Database: $DB_NAME"
echo "  Dir:      $MIGRATIONS_DIR"
echo ""

# ─── Apply Migrations ───

MIGRATION_FILES=$(find "$MIGRATIONS_DIR" -name "*.sql" | sort)
TOTAL=$(echo "$MIGRATION_FILES" | wc -l | tr -d ' ')
COUNT=0
FAILED=0

for file in $MIGRATION_FILES; do
  COUNT=$((COUNT + 1))
  BASENAME=$(basename "$file")
  printf "  [%02d/%02d] Applying %-30s ... " "$COUNT" "$TOTAL" "$BASENAME"

  if wrangler d1 execute "$DB_NAME" $MODE --file="$file" 2>/dev/null; then
    echo "✅"
  else
    echo "❌ FAILED"
    FAILED=$((FAILED + 1))
  fi
done

echo ""
echo "  ─────────────────────────────────────"
echo "  Applied: $((COUNT - FAILED))/$TOTAL"

if [ $FAILED -gt 0 ]; then
  echo "  ⚠️  $FAILED migration(s) failed. Check errors above."
  exit 1
else
  echo "  ✅ All migrations applied successfully."
fi

echo ""
