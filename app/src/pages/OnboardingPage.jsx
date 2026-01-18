import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import './OnboardingPage.css'
import loginBg from '../assets/movieout.2.mov'

const ART_TYPES = [
    { id: 'music', label: 'Music', icon: '🎵' },
    { id: 'visual', label: 'Visual Art', icon: '🎨' },
    { id: 'performing', label: 'Performing', icon: '🎭' },
    { id: 'digital', label: 'Digital Art', icon: '💻' }
]

const GENRES_BY_TYPE = {
    music: ['Electronic', 'Hip Hop', 'Rock', 'Jazz', 'Classical', 'R&B', 'Indie', 'Pop', 'Metal'],
    visual: ['Painting', 'Photography', 'Sculpture', 'Illustration', 'Graffiti', 'Fine Art'],
    performing: ['Theatre', 'Dance', 'Comedy', 'Spoken Word'],
    digital: ['3D Modeling', 'AI Art', 'Pixel Art', 'Animation', 'NFTs']
}

export default function OnboardingPage({ onComplete, session }) {
    const navigate = useNavigate()
    const [step, setStep] = useState(1)
    const [loading, setLoading] = useState(false)
    const [user, setUser] = useState(null)
    const [role, setRole] = useState('user') // 'user' (Fan) or 'artist' (Creator)

    // Form State
    const [firstName, setFirstName] = useState('')
    const [lastName, setLastName] = useState('')
    const [username, setUsername] = useState('')
    const [avatarFile, setAvatarFile] = useState(null)
    const [avatarPreview, setAvatarPreview] = useState(null)

    const [selectedArtTypes, setSelectedArtTypes] = useState([])
    const [selectedGenres, setSelectedGenres] = useState([]) // Flat array of genre strings

    useEffect(() => {
        if (session && session.user) {
            setUser(session.user)
            if (!username && session.user.email) {
                setUsername(session.user.email.split('@')[0])
            }
            return;
        }

        // fetch current user
        supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
            if (!currentSession) {
                navigate('/') // Redirect to login if no session
            } else {
                setUser(currentSession.user)
                // Pre-fill username from email if empty
                if (!username && currentSession.user.email) {
                    setUsername(currentSession.user.email.split('@')[0])
                }
            }
        })
    }, [navigate, session])

    const handleAvatarChange = (e) => {
        const file = e.target.files[0]
        if (file) {
            setAvatarFile(file)
            const reader = new FileReader()
            reader.onloadend = () => {
                setAvatarPreview(reader.result)
            }
            reader.readAsDataURL(file)
        }
    }

    const toggleArtType = (id) => {
        if (selectedArtTypes.includes(id)) {
            setSelectedArtTypes(selectedArtTypes.filter(type => type !== id))
        } else {
            setSelectedArtTypes([...selectedArtTypes, id])
        }
    }

    const toggleGenre = (genre) => {
        if (selectedGenres.includes(genre)) {
            setSelectedGenres(selectedGenres.filter(g => g !== genre))
        } else {
            setSelectedGenres([...selectedGenres, genre])
        }
    }

    // STEPS NAVIGATION
    const handleNext = async () => {
        if (step === 1) {
            // Role selected via buttons, just move next
            setStep(2)
        } else if (step === 2) {
            // Validate Profile (Old Step 1)
            if (!username) return alert('Username is required!')
            setStep(3)
        } else if (step === 3) {
            // Validate Art Types (Old Step 2)
            if (selectedArtTypes.length === 0) return alert('Please select at least one art type!')
            setStep(4)
        }
    }

    const handleFinish = async () => {
        if (selectedGenres.length === 0) return alert('Select at least one genre!')

        setLoading(true)
        let avatarUrl = null

        try {
            // 1. Upload Avatar if exists
            if (avatarFile) {
                try {
                    const fileExt = avatarFile.name.split('.').pop()
                    const fileName = `${user.id}-${Math.random()}.${fileExt}`
                    const { error: uploadError } = await supabase.storage
                        .from('avatars')
                        .upload(fileName, avatarFile)

                    if (uploadError) throw uploadError

                    // Get Public URL
                    const { data: { publicUrl } } = supabase.storage
                        .from('avatars')
                        .getPublicUrl(fileName)

                    avatarUrl = publicUrl
                } catch (uploadErr) {
                    console.error("Upload error:", uploadErr)
                    alert(`Warning: Profile picture could not be uploaded (${uploadErr.message}). Saving profile without it.`)
                }
            }

            // 2. Update Profile
            if (user.isMock) {
                console.log("MOCK MODE: Skipping Supabase DB save.");
                await new Promise(resolve => setTimeout(resolve, 1000)); // Fake delay
                if (onComplete) onComplete()
                navigate('/')
                return;
            }

            try {
                const updates = {
                    id: user.id,
                    username,
                    first_name: firstName,
                    last_name: lastName,
                    art_types: selectedArtTypes,
                    genres: selectedGenres,
                    role: role, // Save the selected role
                    onboarding_completed: true,
                    updated_at: new Date().toISOString(),
                }
                if (avatarUrl) updates.avatar_url = avatarUrl

                console.log("Attempting to update profile with:", updates);

                const { data: updateData, error: updateError } = await supabase
                    .from('profiles')
                    .upsert(updates)
                    .select()

                if (updateError) throw updateError

                if (onComplete) onComplete()
                navigate('/')
            } catch (updateErr) {
                console.error("Profile update error:", updateErr)
                throw new Error(`Profile Save Failed: ${updateErr.message}`)
            }

        } catch (error) {
            alert(error.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="onboarding-container">
            <video autoPlay loop muted playsInline className="onboarding-bg-video">
                <source src={loginBg} type="video/mp4" />
            </video>

            <div className="onboarding-card">
                {/* Step Indicators */}
                <div className="step-indicator">
                    <div className={`step-dot ${step >= 1 ? 'active' : ''} ${step > 1 ? 'completed' : ''}`}></div>
                    <div className={`step-dot ${step >= 2 ? 'active' : ''} ${step > 2 ? 'completed' : ''}`}></div>
                    <div className={`step-dot ${step >= 3 ? 'active' : ''} ${step > 3 ? 'completed' : ''}`}></div>
                    <div className={`step-dot ${step >= 4 ? 'active' : ''} ${step > 4 ? 'completed' : ''}`}></div>
                </div>

                {/* STEP 1: ROLE SELECTION */}
                {step === 1 && (
                    <>
                        <h2 className="onboarding-title">Who are you?</h2>
                        <p className="onboarding-subtitle">Choose how you want to use the platform.</p>

                        <div className="selection-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                            <div
                                className={`selection-card ${role === 'artist' ? 'selected' : ''}`}
                                onClick={() => setRole('artist')}
                                style={{ padding: '30px 15px' }}
                            >
                                <span className="card-icon" style={{ fontSize: '3rem' }}>🎨</span>
                                <span className="card-label" style={{ fontSize: '1.2rem', marginTop: '10px' }}>Creator</span>
                                <p style={{ fontSize: '0.8rem', color: '#aaa', marginTop: '5px' }}>I make art/music</p>
                            </div>
                            <div
                                className={`selection-card ${role === 'user' ? 'selected' : ''}`}
                                onClick={() => setRole('user')}
                                style={{ padding: '30px 15px' }}
                            >
                                <span className="card-icon" style={{ fontSize: '3rem' }}>🎧</span>
                                <span className="card-label" style={{ fontSize: '1.2rem', marginTop: '10px' }}>Fan</span>
                                <p style={{ fontSize: '0.8rem', color: '#aaa', marginTop: '5px' }}>I want to discover</p>
                            </div>
                        </div>

                        <div className="nav-buttons" style={{ justifyContent: 'flex-end' }}>
                            <button className="btn-primary" onClick={handleNext}>Next</button>
                        </div>
                    </>
                )}

                {/* STEP 2: PROFILE DETAILS (Old Step 1) */}
                {step === 2 && (
                    <>
                        <h2 className="onboarding-title">Personalize Your Profile</h2>
                        <p className="onboarding-subtitle">Let's get to know you better.</p>

                        <div className="form-group">
                            <label className="avatar-upload">
                                <input
                                    type="file"
                                    hidden
                                    accept="image/*"
                                    onChange={handleAvatarChange}
                                />
                                {avatarPreview ? (
                                    <img
                                        src={avatarPreview}
                                        alt="Avatar"
                                        className="avatar-preview"
                                        onError={(e) => {
                                            setAvatarPreview(null);
                                            alert("Could not display this image file. Try another one.");
                                        }}
                                    />
                                ) : (
                                    <div className="avatar-placeholder">
                                        <span className="upload-icon">+</span>
                                    </div>
                                )}
                            </label>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Username</label>
                            <input
                                className="form-input"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="@username"
                            />
                        </div>

                        <div className="selection-grid">
                            <div className="form-group">
                                <label className="form-label">First Name</label>
                                <input
                                    className="form-input"
                                    value={firstName}
                                    onChange={(e) => setFirstName(e.target.value)}
                                    placeholder="John"
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Last Name</label>
                                <input
                                    className="form-input"
                                    value={lastName}
                                    onChange={(e) => setLastName(e.target.value)}
                                    placeholder="Doe"
                                />
                            </div>
                        </div>

                        <div className="nav-buttons">
                            <button className="btn-secondary" onClick={() => setStep(1)}>Back</button>
                            <button className="btn-primary" onClick={handleNext}>Next</button>
                        </div>
                    </>
                )}

                {/* STEP 3: ART TYPES (Old Step 2) */}
                {step === 3 && (
                    <>
                        <h2 className="onboarding-title">{role === 'artist' ? "What do you create?" : "What do you like?"}</h2>
                        <p className="onboarding-subtitle">Select the art forms you are interested in.</p>

                        <div className="selection-grid">
                            {ART_TYPES.map(type => (
                                <div
                                    key={type.id}
                                    className={`selection-card ${selectedArtTypes.includes(type.id) ? 'selected' : ''}`}
                                    onClick={() => toggleArtType(type.id)}
                                >
                                    <span className="card-icon">{type.icon}</span>
                                    <span className="card-label">{type.label}</span>
                                </div>
                            ))}
                        </div>

                        <div className="nav-buttons">
                            <button className="btn-secondary" onClick={() => setStep(2)}>Back</button>
                            <button className="btn-primary" onClick={handleNext}>Next</button>
                        </div>
                    </>
                )}

                {/* STEP 4: GENRES (Old Step 3) */}
                {step === 4 && (
                    <>
                        <h2 className="onboarding-title">Your Vibe</h2>
                        <p className="onboarding-subtitle">Pick the genres that speak to you.</p>

                        <div style={{ width: '100%', maxHeight: '400px', overflowY: 'auto', paddingRight: '10px' }}>
                            {selectedArtTypes.map(typeId => {
                                const typeLabel = ART_TYPES.find(t => t.id === typeId)?.label
                                const genres = GENRES_BY_TYPE[typeId] || []
                                if (genres.length === 0) return null

                                return (
                                    <div key={typeId} className="genre-section">
                                        <div className="genre-section-title">{typeLabel}</div>
                                        <div className="genre-cloud">
                                            {genres.map(genre => (
                                                <div
                                                    key={genre}
                                                    className={`genre-pill ${selectedGenres.includes(genre) ? 'selected' : ''}`}
                                                    onClick={() => toggleGenre(genre)}
                                                >
                                                    {genre}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        <div className="nav-buttons">
                            <button className="btn-secondary" onClick={() => setStep(3)}>Back</button>
                            <button className="btn-primary" onClick={handleFinish} disabled={loading}>
                                {loading ? 'Saving...' : 'Finish'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
