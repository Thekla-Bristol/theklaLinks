-- One row per page view or tap. No IP addresses or cookies are stored:
-- "visitor" is a one-way hash that changes every week, so nobody can be followed over time.
CREATE TABLE IF NOT EXISTS hits (
  ts       INTEGER NOT NULL,   -- milliseconds since 1970 (UTC)
  day      TEXT    NOT NULL,   -- London date, YYYY-MM-DD
  hour     INTEGER NOT NULL,   -- London hour, 0-23
  kind     TEXT    NOT NULL,   -- 'pv' page view | 'ev' tap
  name     TEXT    NOT NULL DEFAULT '',
  visitor  TEXT    NOT NULL,
  referrer TEXT    NOT NULL DEFAULT '',
  device   TEXT    NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS hits_ts ON hits (ts);
CREATE INDEX IF NOT EXISTS hits_kind_ts ON hits (kind, ts);
