-- Rate limiting buckets (D1-backed fixed window)
CREATE TABLE IF NOT EXISTS rate_limits (
    bucket_key TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 1,
    reset_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_reset_at ON rate_limits(reset_at);

-- Composite analytics & session hygiene indexes
CREATE INDEX IF NOT EXISTS idx_click_events_link_source ON click_events(link_id, source);
CREATE INDEX IF NOT EXISTS idx_click_events_link_ip ON click_events(link_id, ip_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
