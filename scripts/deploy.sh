#!/usr/bin/env bash
# ═══════════════════════════════════════════
# deploy.sh — GrowthOS Production Deployment
#
# Runs migrations, deploys worker, deploys Next.js app.
#
# Usage:
#   ./scripts/deploy.sh              # Full deploy
#   ./scripts/deploy.sh --skip-worker  # Skip Cloudflare worker deploy
#   ./scripts/deploy.sh --dry-run      # Show what would happen
# ═══════════════════════════════════════════

set -euo pipefail

# ─── Colors ───
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ─── Config ───
SKIP_WORKER=false
DRY_RUN=false

for arg in "$@"; do
  case $arg in
    --skip-worker) SKIP_WORKER=true ;;
    --dry-run) DRY_RUN=true ;;
    *) echo "Unknown arg: $arg"; exit 1 ;;
  esac
done

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        GrowthOS Production Deploy            ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════╝${NC}"
echo ""

# ─── Pre-flight Checks ───
echo -e "${YELLOW}▸ Pre-flight checks...${NC}"

# Check CLI tools
command -v wrangler >/dev/null 2>&1 || { echo -e "${RED}✗ wrangler CLI not found. Run: npm i -g wrangler${NC}"; exit 1; }
command -v vercel >/dev/null 2>&1 || { echo -e "${RED}✗ vercel CLI not found. Run: npm i -g vercel${NC}"; exit 1; }
command -v node >/dev/null 2>&1 || { echo -e "${RED}✗ node not found. Install Node.js 20+${NC}"; exit 1; }

echo -e "  ${GREEN}✓${NC} wrangler $(wrangler --version 2>/dev/null | head -1)"
echo -e "  ${GREEN}✓${NC} vercel $(vercel --version 2>/dev/null)"
echo -e "  ${GREEN}✓${NC} node $(node --version)"
echo ""

# ─── Step 1: Type Check ───
echo -e "${YELLOW}▸ Step 1: Type checking...${NC}"
if [ "$DRY_RUN" = true ]; then
  echo "  [DRY RUN] Would run: npx tsc --noEmit --skipLibCheck"
else
  if npx tsc --noEmit --skipLibCheck 2>/dev/null; then
    echo -e "  ${GREEN}✓${NC} No type errors"
  else
    echo -e "  ${RED}✗${NC} Type errors found. Fix before deploying."
    exit 1
  fi
fi
echo ""

# ─── Step 2: Run Migrations ───
echo -e "${YELLOW}▸ Step 2: Applying D1 migrations...${NC}"
if [ "$DRY_RUN" = true ]; then
  echo "  [DRY RUN] Would run: ./scripts/apply-migrations.sh --remote"
else
  ./scripts/apply-migrations.sh --remote
fi
echo ""

# ─── Step 3: Deploy Cloudflare Worker ───
if [ "$SKIP_WORKER" = false ]; then
  echo -e "${YELLOW}▸ Step 3: Deploying Cloudflare Worker...${NC}"
  if [ "$DRY_RUN" = true ]; then
    echo "  [DRY RUN] Would run: wrangler deploy"
  else
    wrangler deploy
    echo -e "  ${GREEN}✓${NC} Worker deployed"
  fi
else
  echo -e "${YELLOW}▸ Step 3: Skipping worker deploy (--skip-worker)${NC}"
fi
echo ""

# ─── Step 4: Deploy to Vercel ───
echo -e "${YELLOW}▸ Step 4: Deploying to Vercel...${NC}"
if [ "$DRY_RUN" = true ]; then
  echo "  [DRY RUN] Would run: vercel --prod"
else
  DEPLOY_URL=$(vercel --prod 2>&1 | grep -o 'https://[^ ]*' | head -1)
  echo -e "  ${GREEN}✓${NC} Deployed to: $DEPLOY_URL"
fi
echo ""

# ─── Done ───
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║        Deploy Complete ✅                     ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo "  Next steps:"
echo "    1. Visit your app URL and verify login works"
echo "    2. Check Vercel → Settings → Cron Jobs (4 crons should be registered)"
echo "    3. Check Cloudflare → D1 → growthos-prod (tables should exist)"
echo ""
