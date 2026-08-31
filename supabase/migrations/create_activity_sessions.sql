-- Create activity_sessions table to track check-in/check-out windows
CREATE TABLE IF NOT EXISTS activity_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_id UUID NOT NULL REFERENCES activity_events(id) ON DELETE CASCADE,
  checked_in_at TIMESTAMP WITH TIME ZONE NOT NULL,
  checked_out_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for fast lookups
CREATE INDEX idx_activity_sessions_user_active
ON activity_sessions(user_id, is_active, checked_in_at DESC);

CREATE INDEX idx_activity_sessions_activity
ON activity_sessions(activity_id);

-- Enable RLS
ALTER TABLE activity_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can see their own sessions
CREATE POLICY "Users can view their own sessions"
ON activity_sessions FOR SELECT
USING (auth.uid() = user_id);

-- RLS Policy: Service role (backend) can insert/update
CREATE POLICY "Service role manages sessions"
ON activity_sessions FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');
