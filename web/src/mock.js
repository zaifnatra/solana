// Off-chain mock data. Replaces the old Supabase backend.

export const ARTISTS = [
    { id: 'mock-1', name: 'Kinji', username: '@neo_beat', image: '/images/artist_1.png', genre: 'Rap', description: 'Montreal rapper blending bilingual energy', supporters: 1241, sharePrice: 2.5, walletAddress: 'mock-wallet-1' },
    { id: 'mock-2', name: 'Kaytranada', username: '@velvet_soul', image: '/images/artist_2.png', genre: 'House', description: 'Montreal producer blending house, hip-hop, soul', supporters: 892, sharePrice: 1.8, walletAddress: 'mock-wallet-2' },
    { id: 'mock-3', name: 'Yung Lean', username: '@city_flow', image: '/images/artist_3.png', genre: 'Hip Hop', description: 'Cloud rap pioneer, melancholic internet aesthetics', supporters: 3224, sharePrice: 5.0, walletAddress: 'mock-wallet-3' },
    { id: 'mock-4', name: 'lil tecca', username: '@vibe_queen', image: '/images/artist_4.png', genre: 'Hip Hop', description: 'Melodic hitmaker with youthful, catchy hooks', supporters: 453, sharePrice: 0.9, walletAddress: 'mock-wallet-4' },
    { id: 'mock-5', name: 'Blue Note', username: '@blue_sax', image: '/images/artist_5.png', genre: 'Jazz', description: 'Smooth jazz fusion in a smoky atmosphere.', supporters: 1497, sharePrice: 3.2, walletAddress: 'mock-wallet-5' },
];

export const HOLDINGS = [
    { ...ARTISTS[0], balance: 50 },
    { ...ARTISTS[1], balance: 120 },
];

export const PROFILE = {
    first_name: 'Test',
    last_name: 'Creator',
    username: 'test_creator',
    role: 'artist',
    avatar_url: '/images/user_profile.png',
};
