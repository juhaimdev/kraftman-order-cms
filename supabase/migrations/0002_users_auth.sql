-- =============================================================================
-- Delhivery One Command Center - Team Authentication (Username + PIN)
-- Migration 0002: users table with PIN authentication & role-based access
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'operator' CHECK (role IN ('admin', 'operator')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Case-insensitive unique index on trimmed lowercase username
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON public.users (LOWER(TRIM(username)));
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users (role);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON public.users (is_active);

-- Enable Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Service role has full access; anon has no direct access
DROP POLICY IF EXISTS "Service role manages users" ON public.users;
CREATE POLICY "Service role manages users"
  ON public.users
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Touch updated_at trigger
CREATE OR REPLACE FUNCTION public.set_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON public.users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.set_users_updated_at();

COMMENT ON TABLE public.users IS 'Kraftman Delhivery One Command Center operators and administrators authenticated via PIN';
