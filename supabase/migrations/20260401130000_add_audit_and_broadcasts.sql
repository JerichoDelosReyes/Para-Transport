-- Phase 3: Chatbot Audit Logging
DROP TABLE IF EXISTS chatbot_logs CASCADE;
CREATE TABLE chatbot_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    query TEXT NOT NULL,
    response TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS for Chatbot Logs
ALTER TABLE chatbot_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own chatbot logs" 
ON chatbot_logs FOR INSERT TO authenticated 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own chatbot logs"
ON chatbot_logs FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- Phase 4: Real-time Global Broadcasts
CREATE TABLE IF NOT EXISTS broadcasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'info', -- 'info', 'warning', 'alert'
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    expires_at TIMESTAMP WITH TIME ZONE
);

-- RLS for Broadcasts (Admin writes, everyone reads)
ALTER TABLE broadcasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active broadcasts"
ON broadcasts FOR SELECT TO anon, authenticated
USING (is_active = true AND (expires_at IS NULL OR expires_at > now()));
