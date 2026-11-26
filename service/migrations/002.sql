CREATE TABLE profiles (
    account_id TEXT PRIMARY KEY REFERENCES accounts(id),
    display_name TEXT NOT NULL DEFAULT 'New supporter' CHECK(length(display_name) BETWEEN 1 AND 80),
    bio TEXT NOT NULL DEFAULT '' CHECK(length(bio) <= 500)
);
INSERT INTO profiles(account_id) SELECT id FROM accounts;

CREATE TABLE artists (
    symbol TEXT PRIMARY KEY REFERENCES markets(symbol),
    owner_id TEXT UNIQUE REFERENCES accounts(id),
    username TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    bio TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL,
    website_url TEXT NOT NULL DEFAULT '',
    music_url TEXT NOT NULL DEFAULT '',
    is_demo INTEGER NOT NULL DEFAULT 0 CHECK(is_demo IN (0,1)),
    registration_json TEXT,
    created_at INTEGER NOT NULL
);
CREATE TABLE follows (
    account_id TEXT NOT NULL REFERENCES accounts(id),
    symbol TEXT NOT NULL REFERENCES artists(symbol),
    created_at INTEGER NOT NULL,
    PRIMARY KEY(account_id,symbol)
);
CREATE INDEX follows_symbol ON follows(symbol);
CREATE TABLE releases (
    id TEXT PRIMARY KEY,
    symbol TEXT NOT NULL REFERENCES artists(symbol),
    title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 120),
    description TEXT NOT NULL CHECK(length(description) <= 1200),
    preview_url TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    idempotency_key TEXT NOT NULL,
    request_json TEXT NOT NULL,
    UNIQUE(symbol,idempotency_key)
);
CREATE INDEX releases_symbol_time ON releases(symbol,created_at DESC);

-- These are new, explicitly labeled demo markets. Existing ECHO/MUSE/NOVA
-- supplies, reserves, holdings and receipts are intentionally untouched.
INSERT INTO markets(symbol,name,genre) VALUES
    ('KINJI','Kinji','Rap'),
    ('KAYTRA','Kaytranada','House'),
    ('LEAN','Yung Lean','Hip Hop'),
    ('TECCA','lil tecca','Hip Hop'),
    ('BLUE','Blue Note','Jazz');
INSERT INTO artists(symbol,username,description,bio,image_url,is_demo,created_at) VALUES
    ('KINJI','@neo_beat','Montreal rapper blending bilingual energy','Demo artist profile from the original MTL showcase. This paper market is not issued or endorsed by the featured artist.','/images/artist_1.webp',1,0),
    ('KAYTRA','@velvet_soul','Montreal producer blending house, hip-hop, soul','Demo artist profile from the original MTL showcase. This paper market is not issued or endorsed by the featured artist.','/images/artist_2.webp',1,0),
    ('LEAN','@city_flow','Cloud rap pioneer, melancholic internet aesthetics','Demo artist profile from the original MTL showcase. This paper market is not issued or endorsed by the featured artist.','/images/artist_3.webp',1,0),
    ('TECCA','@vibe_queen','Melodic hitmaker with youthful, catchy hooks','Demo artist profile from the original MTL showcase. This paper market is not issued or endorsed by the featured artist.','/images/artist_4.webp',1,0),
    ('BLUE','@blue_sax','Smooth jazz fusion in a smoky atmosphere.','Fictional demo artist from the original MTL showcase. All trades use practice funds.','/images/artist_5.webp',1,0);
PRAGMA user_version = 2;
