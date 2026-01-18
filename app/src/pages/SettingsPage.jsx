import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Header from '../components/Header';
import bgVideo from '../assets/fishglitch.1.mov'; // Consistent background
import './SettingsPage.css';

export default function SettingsPage() {
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(false);

    // PFP State
    const [avatarUrl, setAvatarUrl] = useState(null);
    const [uploading, setUploading] = useState(false);

    // Password State
    const [newPassword, setNewPassword] = useState('');
    const [passwordMsg, setPasswordMsg] = useState('');

    useEffect(() => {
        getProfile();
    }, []);

    const getProfile = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                setUser(user);
                // Fetch profile for avatar
                const { data } = await supabase
                    .from('profiles')
                    .select('avatar_url')
                    .eq('id', user.id)
                    .single();
                if (data) setAvatarUrl(data.avatar_url);
            }
        } catch (error) {
            console.error('Error loading user:', error);
        }
    };

    // 1. Upload Avatar
    const handleAvatarUpload = async (event) => {
        try {
            setUploading(true);
            if (!event.target.files || event.target.files.length === 0) {
                throw new Error('You must select an image to upload.');
            }

            const file = event.target.files[0];
            const fileExt = file.name.split('.').pop();
            const fileName = `${user.id}-${Math.random()}.${fileExt}`;
            const filePath = `${fileName}`;

            let { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('avatars')
                .getPublicUrl(filePath);

            setAvatarUrl(publicUrl);

            // Update Profile
            await supabase
                .from('profiles')
                .update({ avatar_url: publicUrl })
                .eq('id', user.id);

        } catch (error) {
            alert(error.message);
        } finally {
            setUploading(false);
        }
    };

    // 2. Change Password
    const handlePasswordChange = async () => {
        if (newPassword.length < 6) {
            setPasswordMsg('Password must be at least 6 characters.');
            return;
        }
        setLoading(true);
        try {
            const { error } = await supabase.auth.updateUser({ password: newPassword });
            if (error) throw error;
            setPasswordMsg('Password updated successfully!');
            setNewPassword('');
        } catch (error) {
            setPasswordMsg('Error: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    // 3. Delete Account
    const handleDeleteAccount = async () => {
        if (!confirm("Are you sure? This effectively deletes your account data.")) return;

        setLoading(true);
        try {
            // Delete from profiles (optional if you want to double tap)
            await supabase.from('profiles').delete().eq('id', user.id);

            // Sign out
            await supabase.auth.signOut();
            navigate('/');
        } catch (error) {
            alert('Error deleting account: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="settings-container">
            <video autoPlay loop muted playsInline className="app-bg-video">
                <source src={bgVideo} type="video/mp4" />
            </video>

            <Header title="Settings" />

            <div className="settings-card">
                {/* 1. Profile Picture */}
                <div className="settings-section">
                    <div className="section-title">🖼️ Change Profile Picture</div>
                    <div className="settings-avatar-wrapper">
                        {avatarUrl ? (
                            <img src={avatarUrl} alt="Avatar" className="settings-avatar" />
                        ) : (
                            <div className="settings-avatar" style={{ background: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>👤</div>
                        )}
                        <label className="upload-btn-label">
                            {uploading ? 'Uploading...' : 'Upload New Image'}
                            <input
                                type="file"
                                hidden
                                accept="image/*"
                                onChange={handleAvatarUpload}
                                disabled={uploading}
                            />
                        </label>
                    </div>
                </div>

                {/* 2. Password */}
                <div className="settings-section">
                    <div className="section-title">🔒 Change Password</div>
                    <input
                        type="password"
                        className="settings-input"
                        placeholder="New Password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                    />
                    <button className="save-btn" onClick={handlePasswordChange} disabled={loading}>
                        {loading ? 'Updating...' : 'Update Password'}
                    </button>
                    {passwordMsg && <p style={{ marginTop: '10px', color: passwordMsg.includes('Error') ? 'red' : '#4ade80', fontSize: '0.9rem' }}>{passwordMsg}</p>}
                </div>

                {/* 3. Danger Zone */}
                <div className="settings-section">
                    <div className="section-title" style={{ color: '#ef4444' }}>⚠️ Danger Zone</div>
                    <button className="delete-account-btn" onClick={handleDeleteAccount} disabled={loading}>
                        Delete Account
                    </button>
                    <p style={{ marginTop: '10px', color: '#888', fontSize: '0.8rem' }}>
                        This will delete your profile data and sign you out.
                    </p>
                </div>
            </div>

            <Navbar />
        </div>
    );
}
