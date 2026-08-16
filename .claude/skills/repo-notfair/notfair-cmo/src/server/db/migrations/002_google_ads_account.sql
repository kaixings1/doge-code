-- Per-project Google Ads account selection. A bearer from notfair.co's MCP
-- can grant access to multiple customer accounts; the onboarding flow asks
-- the user to pick one and persists it here so the audit + later automation
-- always target the right account.
ALTER TABLE projects ADD COLUMN google_ads_account_id TEXT;
