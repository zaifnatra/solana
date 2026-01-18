-- RESTORE READ ACCESS TO PROFILES
-- Run this to fix the "nothing loading" issue

-- 1. Verify RLS is on (it should be, but just in case)
alter table public.profiles enable row level security;

-- 2. Add the missing SELECT policy
-- This allows anyone (logged in or not) to read basic profile info, 
-- which is needed for the app to check if you are onboarded.
drop policy if exists "Users can view all profiles" on public.profiles;
create policy "Users can view all profiles" on public.profiles for select using ( true );

-- 3. Verify Update Policy (Just to be double sure)
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
for update using ( auth.uid() = id );
