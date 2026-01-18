-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Profiles table (extends Supabase Auth)
create table profiles (
  id uuid references auth.users not null primary key,
  wallet_address text unique not null,
  username text,
  role text check (role in ('artist', 'fan')) default 'fan',
  bio text,
  avatar_url text,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- Artists table (extends Profiles)
create table artists (
  artist_id uuid references profiles(id) not null primary key,
  mint_address text,
  genre text,
  total_backed numeric default 0,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Posts table
create table posts (
  id uuid default uuid_generate_v4() primary key,
  artist_id uuid references artists(artist_id) not null,
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- RLS Policies
alter table profiles enable row level security;
alter table artists enable row level security;
alter table posts enable row level security;

-- Public read access
create policy "Public profiles are viewable by everyone." on profiles for select using (true);
create policy "Public artists are viewable by everyone." on artists for select using (true);
create policy "Public posts are viewable by everyone." on posts for select using (true);

-- User update access
create policy "Users can update own profile." on profiles for update using (auth.uid() = id);
create policy "Artists can insert own posts." on posts for insert with check (auth.uid() = artist_id);
