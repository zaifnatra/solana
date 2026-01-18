-- MASTER DATABASE SETUP
-- Run this SINGLE script in Supabase SQL Editor to fix all tables and permissions.

-- 1. PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  updated_at timestamptz default now(),
  username text,
  first_name text,
  last_name text,
  avatar_url text,
  role text default 'user',
  art_types text[],
  genres text[],
  onboarding_completed boolean default false,
  wallet_address text
);

-- 2. ARTISTS TABLE
DROP TABLE IF EXISTS public.artists CASCADE;
CREATE TABLE public.artists (
    artist_id uuid references public.profiles(id) on delete cascade primary key,
    mint_address text,
    genre text,
    total_backed numeric default 0,
    created_at timestamptz default now()
);

-- 3. PERMISSIONS (RLS) - RESET EVERYTHING
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artists ENABLE ROW LEVEL SECURITY;

-- Drop potential conflicting policies
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.profiles;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.artists;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.artists;
-- Drop old specific named policies if they exist
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;

-- Create Universal Development Policies
DROP POLICY IF EXISTS "Universal Access Profiles" ON public.profiles;
CREATE POLICY "Universal Access Profiles" ON public.profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public Read Profiles" ON public.profiles;
CREATE POLICY "Public Read Profiles" ON public.profiles FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Universal Access Artists" ON public.artists;
CREATE POLICY "Universal Access Artists" ON public.artists FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public Read Artists" ON public.artists;
CREATE POLICY "Public Read Artists" ON public.artists FOR SELECT TO anon USING (true);

-- 4. AUTOMATIC PROFILE CREATION TRIGGER
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, username, onboarding_completed, role)
  VALUES (new.id, split_part(new.email, '@', 1), false, 'user')
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 5. BACKFILL EXISTING USERS
INSERT INTO public.profiles (id, username, onboarding_completed, role)
SELECT id, split_part(email, '@', 1), false, 'user'
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.profiles)
ON CONFLICT DO NOTHING;
