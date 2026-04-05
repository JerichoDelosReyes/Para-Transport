-- Phase 4 continuation: User Logs Audit Table
DROP TABLE IF EXISTS user_logs CASCADE;

CREATE TABLE user_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE user_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own logs" 
ON user_logs FOR INSERT TO authenticated 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own logs"
ON user_logs FOR SELECT TO authenticated
USING (auth.uid() = user_id);
