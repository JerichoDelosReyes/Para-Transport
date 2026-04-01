-- Create fare_matrices table
CREATE TABLE IF NOT EXISTS public.fare_matrices (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    vehicle_type TEXT NOT NULL UNIQUE,
    base_fare NUMERIC NOT NULL,
    base_distance NUMERIC NOT NULL,
    per_km_rate NUMERIC NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.fare_matrices ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read access on fare_matrices" ON public.fare_matrices FOR SELECT USING (true);
