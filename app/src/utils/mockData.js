import { supabase } from '../supabaseClient';

// Mock Data
const MOCK_ARTISTS = [
    {
        id: 1,
        name: "Neon Dreams",
        genre: "Synthwave",
        image: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=2940&auto=format&fit=crop",
        description: "Exploring the retro-future through sound.",
        sharePrice: 0.45,
        supporters: 128,
        mintAddress: "FFmVvCx3FkRiDDysCV9bhWjGbNYXcC37q5GgcdUwZhb2",
        walletAddress: "FFmVvCx3FkRiDDysCV9bhWjGbNYXcC37q5GgcdUwZhb2"
    },
    {
        id: 2,
        name: "Lofi Girl",
        genre: "Lofi / Chill",
        image: "https://images.unsplash.com/photo-1621360841013-c768371e93cf?q=80&w=2848&auto=format&fit=crop",
        description: "Beats to study and relax to.",
        sharePrice: 0.82,
        supporters: 854,
        mintAddress: "FFmVvCx3FkRiDDysCV9bhWjGbNYXcC37q5GgcdUwZhb2",
        walletAddress: "FFmVvCx3FkRiDDysCV9bhWjGbNYXcC37q5GgcdUwZhb2"
    },
    {
        id: 3,
        name: "Electric Youth",
        genre: "Indie Pop",
        image: "https://images.unsplash.com/photo-1493225255756-d9584f8606e9?q=80&w=2940&auto=format&fit=crop",
        description: "Capturing the energy of the night.",
        sharePrice: 0.15,
        supporters: 42,
        mintAddress: "FFmVvCx3FkRiDDysCV9bhWjGbNYXcC37q5GgcdUwZhb2",
        walletAddress: "FFmVvCx3FkRiDDysCV9bhWjGbNYXcC37q5GgcdUwZhb2"
    }
];

const MOCK_USER = {
    username: "DemoFan",
    role: "user",
    avatar_url: "https://via.placeholder.com/150",
    wallet_address: "DemoWalletAddress..."
};

// API Functions
export const fetchArtists = async () => {
    try {
        const { data, error } = await supabase
            .from('artists')
            .select(`
                *,
                profiles (
                    username,
                    avatar_url,
                    bio,
                    wallet_address
                )
            `);

        if (error || !data || data.length === 0) {
            console.warn("Using Mock Data (Supabase empty or error):", error);
            return MOCK_ARTISTS;
        }

        // Transform Supabase data to App format
        return data.map(artist => ({
            id: artist.artist_id,
            name: artist.profiles.username,
            genre: artist.genre,
            image: artist.profiles.avatar_url || 'https://via.placeholder.com/150',
            description: artist.profiles.bio,
            sharePrice: 0.01 + (artist.total_backed * 0.001),
            supporters: artist.total_backed,
            mintAddress: artist.mint_address,
            walletAddress: artist.profiles.wallet_address
        }));

    } catch (e) {
        console.error("Fetch Artists failed:", e);
        return MOCK_ARTISTS;
    }
};

export const fetchUser = async (walletAddress) => {
    return MOCK_USER;
};
