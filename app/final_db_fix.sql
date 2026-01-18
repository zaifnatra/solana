-- FINAL FIX SCRIPT
-- RUN THIS IN SUPABASE SQL EDITOR

-- 1. FIX PERMISSIONS (The "406" error is because these are missing!)
alter table public.profiles enable row level security;

-- Allow reading profiles (Fixes the loading hang)
drop policy if exists "Users can view all profiles" on public.profiles;
create policy "Users can view all profiles" on public.profiles for select using ( true );

-- Allow updating your own profile (Fixes the "Saving..." hang)
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles for update using ( auth.uid() = id );

-- Allow inserting your own profile
drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile" on public.profiles for insert with check ( auth.uid() = id );


-- 2. CREATE MISSING PROFILE ROW (For you specifically)
-- Uses the ID from your screenshot: f5e36188-71a2-4582-9553-a066d7a1a952
insert into public.profiles (id, username, onboarding_completed)
values ('f5e36188-71a2-4582-9553-a066d7a1a952', 'user_manual_fix', false)
on conflict (id) do nothing;


-- 3. ENSURE TRIGGER EXISTS (For future users)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, first_name, last_name)
  values (new.id, new.email, '', '');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
