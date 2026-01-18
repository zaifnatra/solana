-- Add wallet_address column to profiles table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'wallet_address') THEN
        ALTER TABLE profiles ADD COLUMN wallet_address text UNIQUE;
    END IF;
END $$;
