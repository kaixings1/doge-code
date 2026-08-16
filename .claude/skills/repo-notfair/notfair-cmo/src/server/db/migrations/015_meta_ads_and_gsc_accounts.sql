-- Per-project Meta Ads and Google Search Console account/property
-- selection — same pattern as google_ads_account_id (migration 002).
-- The notfair-metaads bearer can cover multiple ad accounts; the
-- notfair-googlesearchconsole bearer can cover multiple verified
-- properties. Onboarding asks the user to pick one of each (when the
-- token has >1) so the specialist agents always target the right
-- entity. Null until picked.

ALTER TABLE projects ADD COLUMN meta_ads_account_id TEXT;
ALTER TABLE projects ADD COLUMN gsc_property_id     TEXT;
