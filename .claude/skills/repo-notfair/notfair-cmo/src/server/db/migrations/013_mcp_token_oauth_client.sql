-- Migration 013: persist OAuth client + token endpoint on mcp_tokens.
--
-- Refresh-token rotation needs three things at runtime: the token endpoint
-- URL, the dynamically-registered client_id, and (where the server requires
-- it) the client_secret. We have all three in mcp_oauth_pending during the
-- authorize flow but used to throw them away after the callback finished.
-- Persisting them here lets the refresh helper exchange a refresh_token for
-- a fresh access_token without bouncing the user back through consent.
--
-- All three columns are nullable. Pre-existing rows (created before this
-- migration) have no refresh_token captured either, so they fall through to
-- the "reconnect to fix" path on next 401 — exactly the behavior they had
-- before. New rows written by the patched callback will populate them.

ALTER TABLE mcp_tokens ADD COLUMN token_endpoint TEXT;
ALTER TABLE mcp_tokens ADD COLUMN client_id      TEXT;
ALTER TABLE mcp_tokens ADD COLUMN client_secret  TEXT;
