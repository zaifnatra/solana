import { useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Header from '../components/Header';
import BackgroundVideo from '../components/BackgroundVideo';
import AccountStart from '../components/AccountStart';
import ServiceNotice from '../components/ServiceNotice';
import { useTrading } from '../state/TradingContext';
import { publishRelease, registerArtist, updateProfile } from '../engine';
import './ProfilePage.css';

function ProfileEditor({ profile }) {
  const { token, reload } = useTrading();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSaved(false);
    const form = new FormData(event.currentTarget);
    try {
      await updateProfile(token, {
        display_name: form.get('display_name').trim(),
        bio: form.get('bio').trim(),
      });
      reload();
      setSaved(true);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="service-panel">
      <h2>Your profile</h2>
      <form className="service-form" onSubmit={save}>
        <label>
          Display name
          <input
            name="display_name"
            required
            maxLength="80"
            defaultValue={profile.display_name}
            autoComplete="nickname"
          />
        </label>
        <label>
          About you
          <textarea name="bio" maxLength="500" defaultValue={profile.bio} />
        </label>
        <button disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button>
      </form>
      {error && (
        <p role="alert" className="service-error">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="service-success">
          Profile saved.
        </p>
      )}
    </section>
  );
}
function CreatorRegistration() {
  const { token, reload } = useTrading();
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function register(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries([...form.entries()].map(([key, value]) => [key, value.trim()]));
    body.symbol = body.symbol.toUpperCase();
    try {
      await registerArtist(token, body);
      reload();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="service-panel">
      <h2>Make space for your sound.</h2>
      <p className="service-muted">
        Create your artist profile and a paper token market. You can publish releases and build a
        following. This does not launch an on-chain token.
      </p>
      {!expanded ? (
        <button className="creator-action" onClick={() => setExpanded(true)}>
          Create artist profile
        </button>
      ) : (
        <form className="service-form" onSubmit={register}>
          <label>
            Artist name
            <input name="name" required maxLength="80" />
          </label>
          <label>
            Token symbol
            <input
              name="symbol"
              required
              pattern="[A-Za-z][A-Za-z0-9]{2,11}"
              minLength="3"
              maxLength="12"
              placeholder="YOURNAME"
              title="3–12 letters or numbers, starting with a letter"
            />
          </label>
          <label>
            Genre
            <input name="genre" required maxLength="40" placeholder="Jazz, house, hip-hop…" />
          </label>
          <label>
            Short description
            <input name="description" required maxLength="300" />
          </label>
          <label>
            Artist biography
            <textarea name="bio" maxLength="1500" />
          </label>
          <label>
            Artist website (optional)
            <input
              name="website_url"
              type="url"
              pattern="https://.*"
              placeholder="https://…"
              maxLength="512"
            />
          </label>
          <label>
            Music link (optional)
            <input
              name="music_url"
              type="url"
              pattern="https://.*"
              placeholder="https://…"
              maxLength="512"
            />
          </label>
          <button className="creator-action" disabled={busy}>
            {busy ? 'Creating…' : 'Create paper artist market'}
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="service-error">
          {error}
        </p>
      )}
    </section>
  );
}
function ReleaseEditor({ artist }) {
  const { token, reload } = useTrading();
  const key = `mtl.release.pending.${token.slice(0, 16)}`;
  const [pending, setPending] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem(key) || 'null');
    } catch {
      return null;
    }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  async function publish(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSaved(false);
    const form = event.currentTarget;
    const data = new FormData(form);
    const body = pending || {
      title: data.get('title').trim(),
      description: data.get('description').trim(),
      preview_url: data.get('preview_url').trim(),
      idempotency_key: crypto.randomUUID(),
    };
    try {
      sessionStorage.setItem(key, JSON.stringify(body));
      setPending(body);
      await publishRelease(token, artist.symbol, body);
      sessionStorage.removeItem(key);
      setPending(null);
      setSaved(true);
      form.reset();
      reload();
    } catch (failure) {
      if (failure.status && failure.status < 500) {
        sessionStorage.removeItem(key);
        setPending(null);
      }
      setError(
        failure.status
          ? failure.message
          : 'Publication status is unknown. Retry to retrieve the same release.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="service-panel">
      <h2>Share a release</h2>
      <p className="service-muted">Publish to your artist page and your followers’ feeds.</p>
      <Link to={`/artists/${encodeURIComponent(artist.symbol)}`}>View {artist.name} →</Link>
      <form className="service-form" onSubmit={publish}>
        <fieldset disabled={busy || Boolean(pending)}>
          <label>
            Release title
            <input name="title" required maxLength="120" defaultValue={pending?.title || ''} />
          </label>
          <label>
            Release update
            <textarea
              name="description"
              required
              maxLength="1200"
              defaultValue={pending?.description || ''}
            />
          </label>
          <label>
            Audio preview URL (optional)
            <input
              name="preview_url"
              type="url"
              pattern="https://.*"
              maxLength="512"
              placeholder="https://…/preview.mp3"
              defaultValue={pending?.preview_url || ''}
            />
          </label>
        </fieldset>
        <p className="service-muted">
          Use an HTTPS audio file you have permission to share. No file is uploaded by this form.
        </p>
        <button disabled={busy}>
          {busy ? 'Publishing…' : pending ? 'Check release result' : 'Publish release'}
        </button>
      </form>
      {error && (
        <p role="alert" className="service-error">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="service-success">
          Release published.
        </p>
      )}
    </section>
  );
}
export default function ProfilePage() {
  const { token, profile, ownArtist, loading } = useTrading();
  return (
    <div className="service-page">
      <BackgroundVideo />
      <div className="service-content">
        <Header title="My Collection" />
        <ServiceNotice />
        <main className="service-column">
          <section className="profile-intro">
            <img src="/images/user_profile.webp" width="80" height="80" alt="Profile" />
            <h2>{profile?.display_name || 'Your collection, your community.'}</h2>
            <p className="service-muted">
              {ownArtist ? `Artist · ${ownArtist.symbol}` : 'Back the artists you believe in.'}
            </p>
          </section>
          {!token ? (
            <AccountStart />
          ) : !profile ? (
            <p role="status" className="service-muted">
              {loading
                ? 'Loading profile…'
                : 'Waiting for your profile. Reconnect if the service is unavailable.'}
            </p>
          ) : (
            <>
              <ProfileEditor key={token} profile={profile} />
              {ownArtist ? (
                <ReleaseEditor key={ownArtist.symbol} artist={ownArtist} />
              ) : (
                <CreatorRegistration />
              )}
            </>
          )}
        </main>
        <Navbar />
      </div>
    </div>
  );
}
