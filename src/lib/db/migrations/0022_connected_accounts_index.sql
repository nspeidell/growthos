-- Fix D1 timeout on connected_accounts upsert lookup
-- The callback route queries WHERE workspace_id + platform + platform_account_id
-- but no index covers all three columns, causing a full table scan → timeout.

CREATE INDEX IF NOT EXISTS idx_connected_accounts_lookup
  ON connected_accounts(workspace_id, platform, platform_account_id);
