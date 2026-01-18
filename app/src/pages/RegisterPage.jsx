import { useState } from 'react';
import { useArtistProgram } from '../hooks/useArtistProgram';
import { supabase } from '../supabaseClient';
import { useAnchorWallet } from "@solana/wallet-adapter-react";
import Navbar from '../components/Navbar';

export default function RegisterPage() {
    const { registerArtist } = useArtistProgram();
    const wallet = useAnchorWallet();
    const [name, setName] = useState('');
    const [genre, setGenre] = useState('');
    const [bio, setBio] = useState('');
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState('');

    const handleRegister = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMsg('');

        try {
            // 1. Register on Solana
            const { signature, mint } = await registerArtist(name, genre);
            console.log("Solana Registration Success:", signature);
            console.log("New Mint Address:", mint);

            // 2. Save to Supabase (Restored)
            if (wallet) {
                const user = (await supabase.auth.getUser()).data.user;
                const userId = user?.id; // Needed for RLS

                // Upsert profile
                const { data: profile, error: profileError } = await supabase
                    .from('profiles')
                    .upsert({
                        id: userId, // Assuming auth is working
                        wallet_address: wallet.publicKey.toString(),
                        username: name,
                        role: 'artist',
                        bio: bio
                    })
                    .select();

                if (profileError) {
                    console.error("Supabase Profile Error:", profileError);
                } else {
                    // Insert Artist
                    const { error: artistError } = await supabase
                        .from('artists')
                        .insert({
                            artist_id: profile[0].id,
                            mint_address: mint,
                            genre: genre,
                            total_backed: 0
                        });
                    if (artistError) console.error("Supabase Artist Error:", artistError);
                }
            }

            setMsg('Artist Registered Successfully! Check Home Page.');
            setName(''); setGenre(''); setBio('');
        } catch (err) {
            console.error(err);
            setMsg('Registration failed: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ padding: '20px', paddingBottom: '80px', textAlign: 'center' }}>
            <h1>Become an Artist</h1>
            <p>Mint your token and start your community.</p>

            <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '15px', maxWidth: '400px', margin: '0 auto', textAlign: 'left' }}>
                <div>
                    <label>Artist Name</label>
                    <input
                        type="text" value={name} onChange={e => setName(e.target.value)} required
                        style={{ width: '100%', padding: '10px', marginTop: '5px' }}
                    />
                </div>
                <div>
                    <label>Genre</label>
                    <input
                        type="text" value={genre} onChange={e => setGenre(e.target.value)} required
                        style={{ width: '100%', padding: '10px', marginTop: '5px' }}
                    />
                </div>
                <div>
                    <label>Bio</label>
                    <textarea
                        value={bio} onChange={e => setBio(e.target.value)}
                        style={{ width: '100%', padding: '10px', marginTop: '5px' }}
                    />
                </div>

                <button type="submit" disabled={loading} style={{ background: '#000', color: '#fff', padding: '15px', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
                    {loading ? 'Minting Token...' : 'Register Artist'}
                </button>
            </form>

            {msg && <p style={{ marginTop: '20px', color: msg.includes('failed') ? 'red' : 'green' }}>{msg}</p>}

            <Navbar />
        </div>
    );
}
