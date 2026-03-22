-- Recent searches table: stores per-user search history
CREATE TABLE IF NOT EXISTS public.recent_searches (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    place_id TEXT NOT NULL,
    title TEXT NOT NULL,
    subtitle TEXT,
    latitude NUMERIC NOT NULL,
    longitude NUMERIC NOT NULL,
    searched_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for fast per-user lookup
CREATE INDEX idx_recent_searches_user ON public.recent_searches(user_id, searched_at DESC);

-- Unique constraint: one entry per user+place (upsert-friendly)
ALTER TABLE public.recent_searches ADD CONSTRAINT uq_recent_searches_user_place UNIQUE (user_id, place_id);

-- RLS
ALTER TABLE public.recent_searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own recent searches"
    ON public.recent_searches FOR SELECT
    USING (user_id = public.auth_uid());

CREATE POLICY "Users can insert own recent searches"
    ON public.recent_searches FOR INSERT
    WITH CHECK (user_id = public.auth_uid());

CREATE POLICY "Users can delete own recent searches"
    ON public.recent_searches FOR DELETE
    USING (user_id = public.auth_uid());
