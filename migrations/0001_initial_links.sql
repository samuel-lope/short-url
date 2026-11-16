-- Baseline matching existing production shorturldb schema
CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    longURL TEXT NOT NULL,
    shortURL TEXT UNIQUE,
    titleURL TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
);
