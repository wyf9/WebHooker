-- 0012_targets.sql: Group Push Targets and Route Target IDs

CREATE TABLE IF NOT EXISTS d1_targets (
  id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  name TEXT NOT NULL,
  platform TEXT NOT NULL,
  channel_id TEXT,
  thread_id TEXT,
  chat_id TEXT,
  topic_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (id, group_id),
  FOREIGN KEY (group_id) REFERENCES d1_groups(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_d1_targets_group_id ON d1_targets(group_id);

ALTER TABLE d1_routes ADD COLUMN target_ids TEXT;
