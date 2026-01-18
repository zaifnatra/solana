-- FIX DATABASE RELATIONSHIPS
-- The issue: 'profiles' is linked to a 'Users' table, but it should be linked to 'auth.users' where your login actually lives.

-- 1. Remove the wrong link to the empty "Users" table
alter table public.profiles 
drop constraint if exists profiles_id_fkey;

-- 2. Create the CORRECT link to the system "auth.users" table
alter table public.profiles
add constraint profiles_id_fkey
foreign key (id) references auth.users (id) 
on delete cascade;

-- 3. Re-run the permissions setup (just to be safe)
alter table public.profiles enable row level security;

drop policy if exists "Users can view all profiles" on public.profiles;
create policy "Users can view all profiles" on public.profiles for select using ( true );

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles for update using ( auth.uid() = id );

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile" on public.profiles for insert with check ( auth.uid() = id );


-- 4. NOW insert your profile row again (It should work this time!)
insert into public.profiles (id, username, onboarding_completed, first_name, last_name)
values ('f5e36188-71a2-4582-9553-a066d7a1a952', 'user_manual_fix', false, '', '')
on conflict (id) do nothing;
