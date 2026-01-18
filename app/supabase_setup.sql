-- Copy and paste this ENTIRE block into your Supabase SQL Editor and run it.

-- 1. Create the 'avatars' storage bucket
insert into storage.buckets (id, name, public) 
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- 2. Storage Policies (Allow public view, auth upload)
drop policy if exists "Public Access" on storage.objects;
create policy "Public Access" on storage.objects for select using ( bucket_id = 'avatars' );

drop policy if exists "Auth Upload" on storage.objects;
create policy "Auth Upload" on storage.objects for insert with check ( bucket_id = 'avatars' and auth.role() = 'authenticated' );

-- 3. Fix missing columns in profiles table
alter table public.profiles 
add column if not exists updated_at timestamptz default now();

-- 4. Profiles Security Policies (Allow users to update their own row)
alter table public.profiles enable row level security;

drop policy if exists "Users can view all profiles" on public.profiles;
create policy "Users can view all profiles" on public.profiles for select using ( true );

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
for update using ( auth.uid() = id );

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile" on public.profiles
for insert with check ( auth.uid() = id );
