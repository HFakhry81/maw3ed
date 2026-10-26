-- Phase 2: staff account ↔ professional staff profile junction.
-- Vocabulary: Maw3ed has no separate "branch" tenant; branch maps to workspace_id.
-- A login (app_users) may hold memberships in many workspaces; within one workspace
-- a user links to at most one staff record, and a staff record links to at most one user.

ALTER TABLE workspace_members
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspace_members_status_check'
  ) THEN
    ALTER TABLE workspace_members
      ADD CONSTRAINT workspace_members_status_check
      CHECK (status IN ('active', 'suspended'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS workspace_staff_links (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  staff_id TEXT NOT NULL,
  role_in_workspace TEXT NOT NULL DEFAULT 'desk'
    CHECK (role_in_workspace IN ('desk', 'provider', 'both')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, user_id),
  UNIQUE (workspace_id, staff_id),
  FOREIGN KEY (workspace_id, staff_id)
    REFERENCES workspace_ops_staff(workspace_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS workspace_staff_links_user_idx
  ON workspace_staff_links (user_id, status);

CREATE INDEX IF NOT EXISTS workspace_staff_links_workspace_idx
  ON workspace_staff_links (workspace_id, status);
