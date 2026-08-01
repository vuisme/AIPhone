import pg from 'pg'

const { Pool } = pg

const MIGRATION_1 = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version integer PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS studio_users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('ADMIN', 'USER')),
  status text NOT NULL CHECK (status IN ('ACTIVE', 'DISABLED')),
  created_by text REFERENCES studio_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS studio_workflows (
  id text PRIMARY KEY,
  owner_user_id text NOT NULL REFERENCES studio_users(id) ON DELETE RESTRICT,
  document jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS studio_workflow_assets (
  workflow_id text NOT NULL REFERENCES studio_workflows(id) ON DELETE CASCADE,
  asset_id text NOT NULL,
  image_png bytea NOT NULL,
  sha256 text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workflow_id, asset_id)
);

CREATE TABLE IF NOT EXISTS studio_workflow_grants (
  workflow_id text NOT NULL REFERENCES studio_workflows(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES studio_users(id) ON DELETE CASCADE,
  permission text NOT NULL DEFAULT 'EDIT' CHECK (permission IN ('EDIT')),
  granted_by text NOT NULL REFERENCES studio_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workflow_id, user_id)
);

CREATE TABLE IF NOT EXISTS studio_devices (
  id text PRIMARY KEY,
  serial text NOT NULL UNIQUE,
  label text,
  model text,
  owner_user_id text NOT NULL REFERENCES studio_users(id) ON DELETE RESTRICT,
  credential_ciphertext text,
  credential_iv text,
  credential_auth_tag text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS studio_device_grants (
  device_id text NOT NULL REFERENCES studio_devices(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES studio_users(id) ON DELETE CASCADE,
  permission text NOT NULL DEFAULT 'USE' CHECK (permission IN ('USE')),
  granted_by text NOT NULL REFERENCES studio_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, user_id)
);

CREATE TABLE IF NOT EXISTS studio_audit_events (
  id bigserial PRIMARY KEY,
  actor_user_id text REFERENCES studio_users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS studio_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS studio_workflows_owner_idx ON studio_workflows(owner_user_id);
CREATE INDEX IF NOT EXISTS studio_workflow_grants_user_idx ON studio_workflow_grants(user_id);
CREATE INDEX IF NOT EXISTS studio_devices_owner_idx ON studio_devices(owner_user_id);
CREATE INDEX IF NOT EXISTS studio_device_grants_user_idx ON studio_device_grants(user_id);
CREATE INDEX IF NOT EXISTS studio_audit_created_idx ON studio_audit_events(created_at DESC);
`

const MIGRATION_2 = `
ALTER TABLE studio_devices
  ADD COLUMN IF NOT EXISTS connection_mode text NOT NULL DEFAULT 'USB'
    CHECK (connection_mode IN ('USB', 'CLOUD_CALLBACK')),
  ADD COLUMN IF NOT EXISTS callback_device_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS callback_secret_ciphertext text,
  ADD COLUMN IF NOT EXISTS callback_secret_iv text,
  ADD COLUMN IF NOT EXISTS callback_secret_auth_tag text,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

CREATE INDEX IF NOT EXISTS studio_devices_connection_mode_idx ON studio_devices(connection_mode);
`

export class Database {
  constructor(connectionString = process.env.DATABASE_URL) {
    if (!connectionString) throw new Error('DATABASE_URL is required')
    this.pool = new Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 })
  }

  async initialize() {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock($1)', [0x41495048])
      await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
      const applied = await client.query('SELECT 1 FROM schema_migrations WHERE version = 1')
      if (applied.rowCount === 0) {
        await client.query(MIGRATION_1)
        await client.query('INSERT INTO schema_migrations(version) VALUES (1)')
      }
      const callbackApplied = await client.query('SELECT 1 FROM schema_migrations WHERE version = 2')
      if (callbackApplied.rowCount === 0) {
        await client.query(MIGRATION_2)
        await client.query('INSERT INTO schema_migrations(version) VALUES (2)')
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  query(text, values) {
    return this.pool.query(text, values)
  }

  async transaction(run) {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const result = await run(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async close() {
    await this.pool.end()
  }
}
