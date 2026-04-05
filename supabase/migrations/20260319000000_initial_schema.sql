-- Users table mapping to Firebase Auth UIDs
CREATE TABLE public.users (
    id TEXT PRIMARY KEY, -- Firebase Auth UID
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Note: In this architecture, Supabase handling ONLY DB, Firebase handles AUTH.
-- Make sure to allow read/write via Row Level Security (RLS) policies 
-- tailored for public anon access or by verifying the Firebase JWT in a custom Supabase Edge Function / Custom JWT.

-- Example Routes Table for Para App
CREATE TABLE public.routes (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    vehicle_type TEXT NOT NULL, -- Jeepney, Tricycle, Bus...
    path_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;

-- Note: Proper RLS generation requires setting up Custom JWT validation for Firebase Auth tokens inside Supabase.
