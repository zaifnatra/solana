-- MASTER FIX SCRIPT V2
-- Run this in Supabase SQL Editor.
-- This ensures ALL columns and permissions exist.

-- 1. SETUP STORAGE (AVATARS)
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict (id) do nothing;

drop policy if exists "Public Access" on storage.objects;
create policy "Public Access" on storage.objects for select using ( bucket_id = 'avatars' );

drop policy if exists "Auth Upload" on storage.objects;
create policy "Auth Upload" on storage.objects for insert with check ( bucket_id = 'avatars' and auth.role() = 'authenticated' );

-- 2. SETUP PROFILES COLUMNS (Ensure all exist)
alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists last_name text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists onboarding_completed boolean default false;
alter table public.profiles add column if not exists updated_at timestamptz default now();

-- Handle Arrays (Supabase uses text[] for simple lists)
alter table public.profiles add column if not exists art_types text[];
alter table public.profiles add column if not exists genres text[];

-- 3. SETUP PERMISSIONS
alter table public.profiles enable row level security;

drop policy if exists "Users can view all profiles" on public.profiles;
create policy "Users can view all profiles" on public.profiles for select using ( true );

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles for update using ( auth.uid() = id );

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile" on public.profiles for insert with check ( auth.uid() = id );
