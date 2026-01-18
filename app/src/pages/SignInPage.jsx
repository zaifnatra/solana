import { useState } from 'react'
import { supabase } from '../supabaseClient'
import './SignInPage.css'
import loginBg from '../assets/signinpicture.jpeg'

export default function SignInPage({ onLoginSuccess }) {
    const [email, setEmail] = useState('demo@example.com')
    const [password, setPassword] = useState('password123')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)

    // State to toggle between Sign In and Sign Up modes if desired, 
    // but for now we stick to the main "Log In" view with a link.
    const [isSignUp, setIsSignUp] = useState(false)

    const handleGoogleLogin = async () => {
        try {
            setLoading(true)
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
            })
            if (error) throw error
        } catch (error) {
            setError(error.message)
        } finally {
            setLoading(false)
        }
    }

    const handleEmailAuth = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        // DEMO BYPASS: Check for hardcoded credentials
        if (email === 'demo@example.com' && password === 'password123') {
            setTimeout(() => {
                setLoading(false)
                if (onLoginSuccess) {
                    onLoginSuccess({
                        user: { id: 'demo-user', email: 'demo@example.com' },
                        access_token: 'demo-token'
                    })
                }
            }, 1000) // Fake network delay
            return
        }

        try {
            if (isSignUp) {
                const { data, error } = await supabase.auth.signUp({
                    email,
                    password,
                })
                if (error) throw error
                alert('Check your email for the login link!')
            } else {
                const { data, error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                })
                if (error) throw error
                if (data.session && onLoginSuccess) {
                    onLoginSuccess(data.session)
                }
            }
        } catch (error) {
            setError(error.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="signin-container">
            {/* Left Side - Image */}
            <div className="signin-left">
                <img src={loginBg} alt="Login Visual" className="signin-bg-image" />
                <div style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'linear-gradient(to right, rgba(0,0,0,0.1), rgba(0,0,0,0))'
                }}></div>
            </div>

            {/* Right Side - Form */}
            <div className="signin-right">
                <div className="signin-form-container">
                    <div className="signin-header">
                        <h1 className="signin-title">
                            {isSignUp ? 'Create an account' : 'Welcome Back'}
                        </h1>
                        <p className="signin-subtitle">
                            {isSignUp ? 'Enter your details to sign up.' : 'Enter your credentials to access your account.'}
                        </p>
                    </div>

                    <div className="social-buttons">
                        <button className="social-btn" onClick={handleGoogleLogin} disabled={loading}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z" fill="#FBBC05" />
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                            </svg>
                            Google
                        </button>
                        {/* Apple button removed as requested */}
                    </div>

                    <div className="divider">OR CONTINUE WITH</div>

                    <form onSubmit={handleEmailAuth}>
                        <div className="form-group">
                            <label className="form-label">Email</label>
                            <input
                                type="email"
                                className="form-input"
                                placeholder="m@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>

                        <div className="form-group">
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                <label className="form-label" style={{ marginBottom: 0 }}>Password</label>
                                {!isSignUp && <a href="#" className="forgot-password">Forgot password?</a>}
                            </div>
                            <input
                                type="password"
                                className="form-input"
                                placeholder=""
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                autoComplete="current-password"
                            />
                        </div>

                        {error && <p style={{ color: 'red', marginBottom: '1rem', fontSize: '0.9rem' }}>{error}</p>}

                        <button type="submit" className="submit-btn" disabled={loading}>
                            {loading ? 'Processing...' : (isSignUp ? 'Sign Up' : 'Log In')}
                        </button>
                    </form>

                    <p className="signup-link">
                        {isSignUp ? "Already have an account?" : "Don't have an account?"}
                        <a href="#" onClick={(e) => { e.preventDefault(); setIsSignUp(!isSignUp); setError(null); }}>
                            {isSignUp ? 'Log in' : 'Sign up'}
                        </a>
                    </p>
                </div>
            </div>
        </div>
    )
}
