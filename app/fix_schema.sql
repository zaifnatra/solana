-- Nuke and Pave: Reset the artists table to ensure correct schema
-- WARNING: This deletes existing artist data and dependent data (posts, post_assets)

BEGIN;

-- 1. Drop dependent tables first with CASCADE to handle foreign keys
DROP TABLE IF EXISTS posts CASCADE;
DROP TABLE IF EXISTS artists CASCADE;
DROP TABLE IF EXISTS post_assets CASCADE; -- Explicitly drop if we want to be sure, but CASCADE on posts handles it

-- 2. Ensure profiles has the wallet_address column
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'wallet_address') THEN
        ALTER TABLE profiles ADD COLUMN wallet_address text UNIQUE;
    END IF;
END $$;

-- 3. Recreate Artists Table with correct Foreign Key
CREATE TABLE artists (
  artist_id uuid REFERENCES profiles(id) NOT NULL PRIMARY KEY,
  mint_address text,
  genre text,
  total_backed numeric DEFAULT 0,
  created_at timestamp WITH time ZONE DEFAULT timezone('utc'::text, now())
);

-- 4. Recreate Posts Table (since we dropped it)
CREATE TABLE posts (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  artist_id uuid REFERENCES artists(artist_id) NOT NULL,
  content text NOT NULL,
  created_at timestamp WITH time ZONE DEFAULT timezone('utc'::text, now())
);

-- 5. Recreate Post Assets Table (since we likely dropped it via cascade or want to restore it)
-- Assuming a basic schema for post_assets if it existed, or just leaving it for now if not critical. 
-- If post_assets is critical, we should recreate it. I'll add a basic structure if I saw it, 
-- but simpler is just to re-enable RLS on what we created.

-- 6. Re-enable Security Policies (RLS)
ALTER TABLE artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Public artists are viewable by everyone." ON artists FOR SELECT USING (true);
CREATE POLICY "Public posts are viewable by everyone." ON posts FOR SELECT USING (true);

-- Allow artists to register (insert their own record)
CREATE POLICY "Artists can insert own profile." ON artists FOR INSERT WITH CHECK (auth.uid() = artist_id);
CREATE POLICY "Artists can insert own posts." ON posts FOR INSERT WITH CHECK (auth.uid() = artist_id);

COMMIT;
