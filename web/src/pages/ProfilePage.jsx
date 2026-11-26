import { useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Header from '../components/Header';
import BackgroundVideo from '../components/BackgroundVideo';
import AccountStart from '../components/AccountStart';
import ServiceNotice from '../components/ServiceNotice';
import { useTrading } from '../state/TradingContext';
import { publishRelease, registerArtist, updateProfile } from '../engine';
import './ProfilePage.css';

function textRule(label, max, required = false) {
  return (value) => {
    if (required && !value.trim()) return `Enter ${label}.`;
    if (value.trim().length > max) return `Use ${max} characters or fewer.`;
    return '';
  };
}
function publicUrl(value) {
  if (!value.trim()) return '';
  if (value.trim().length > 512) return 'Use a link with 512 characters or fewer.';
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password)
      return 'Use a public HTTPS link, such as https://example.com.';
    if (
      !url.hostname.includes('.') ||
      url.hostname.endsWith('.local') ||
      url.hostname.endsWith('.localhost') ||
      /^[\d.]+$/.test(url.hostname) ||
      url.hostname.includes(':')
    )
      return 'Use a public website link.';
  } catch {
    return 'Enter a full link starting with https://.';
  }
  return '';
}
const profileRules = {
  display_name: textRule('your display name', 80, true),
  bio: textRule('your bio', 500),
};
const creatorRules = {
  name: textRule('your artist name', 80, true),
  symbol: (value) =>
    /^[A-Z][A-Z0-9]{2,11}$/i.test(value.trim())
      ? ''
      : 'Use 3–12 letters or numbers, starting with a letter.',
  genre: textRule('your genre', 40, true),
  description: textRule('a short description of your sound', 300, true),
  bio: textRule('your biography', 1500),
  website_url: publicUrl,
  music_url: publicUrl,
};
const releaseRules = {
  title: textRule('a release title', 120, true),
  description: textRule('a release update', 1200, true),
  preview_url: publicUrl,
};
function useFields(initial, rules) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  function validate(form, names = Object.keys(rules)) {
    const next = Object.fromEntries(names.map((name) => [name, rules[name](values[name] || '')]));
    setErrors(next);
    const first = names.find((name) => next[name]);
    if (first) form.elements.namedItem(first)?.focus();
    return !first;
  }
  function props(name) {
    return {
      name,
      value: values[name] || '',
      error: errors[name],
      onChange: (event) => {
        const value = event.target.value;
        setValues((old) => ({ ...old, [name]: value }));
        setErrors((old) => ({ ...old, [name]: old[name] ? rules[name](value) : '' }));
      },
    };
  }
  return {
    values,
    setValues,
    errors,
    setErrors,
    validate,
    props,
    body: () =>
      Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.trim()])),
  };
}
function Field({ label, hint, error, multiline = false, ...input }) {
  const id = useId();
  const Control = multiline ? 'textarea' : 'input';
  return (
    <div className="profile-field">
      <label htmlFor={id}>{label}</label>
      <Control
        {...input}
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={
          [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined
        }
      />
      {hint && (
        <small id={`${id}-hint`} className="field-hint">
          {hint}
        </small>
      )}
      {error && (
        <span id={`${id}-error`} className="service-error field-error" aria-live="polite">
          {error}
        </span>
      )}
    </div>
  );
}
function FormError({ children }) {
  return children ? (
    <p role="alert" className="service-error">
      {children}
    </p>
  ) : null;
}
function ProfileEditor({ profile }) {
  const { token, reload } = useTrading();
  const fields = useFields({ display_name: profile.display_name, bio: profile.bio }, profileRules);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const lock = useRef(false);
  async function save(event) {
    event.preventDefault();
    setSaved(false);
    setError('');
    if (lock.current || !fields.validate(event.currentTarget)) return;
    lock.current = true;
    setBusy(true);
    try {
      await updateProfile(token, fields.body());
      reload();
      setSaved(true);
    } catch (failure) {
      setError(failure.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="service-panel">
      <h2>Your profile</h2>
      <form
        className="service-form"
        noValidate
        onSubmit={save}
        onChange={() => {
          setSaved(false);
          setError('');
        }}
      >
        <fieldset disabled={busy}>
          <Field
            label="Display name"
            {...fields.props('display_name')}
            required
            maxLength={80}
            autoComplete="nickname"
          />
          <Field
            label="About you"
            {...fields.props('bio')}
            multiline
            maxLength={500}
            hint="A little about you. Optional."
          />
        </fieldset>
        <FormError>{error}</FormError>
        <button disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button>
      </form>
      {saved && (
        <p role="status" className="service-success">
          Profile saved.
        </p>
      )}
    </section>
  );
}
const creatorSteps = ['Artist identity', 'Story & links', 'Review'];
const creatorFields = [
  ['name', 'symbol', 'genre'],
  ['description', 'bio', 'website_url', 'music_url'],
];
function readDraft(key) {
  try {
    return JSON.parse(sessionStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}
function CreatorRegistration() {
  const { token, reload } = useTrading();
  const pendingKey = `mtl.creator.pending.${token.slice(0, 16)}`;
  const [pending, setPending] = useState(() => readDraft(pendingKey));
  const fields = useFields(
    pending || {
      name: '',
      symbol: '',
      genre: '',
      description: '',
      bio: '',
      website_url: '',
      music_url: '',
    },
    creatorRules,
  );
  const [expanded, setExpanded] = useState(Boolean(pending));
  const [step, setStep] = useState(pending ? 2 : 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);
  const heading = useRef(null);
  const lock = useRef(false);
  function goTo(next) {
    setError('');
    setStep(next);
    requestAnimationFrame(() => heading.current?.focus());
  }
  async function register(event) {
    event.preventDefault();
    if (lock.current) return;
    setError('');
    if (step < 2) {
      if (fields.validate(event.currentTarget, creatorFields[step])) goTo(step + 1);
      return;
    }
    const body = pending || { ...fields.body(), symbol: fields.values.symbol.trim().toUpperCase() };
    lock.current = true;
    setBusy(true);
    try {
      sessionStorage.setItem(pendingKey, JSON.stringify(body));
      setPending(body);
      const result = await registerArtist(token, body);
      sessionStorage.removeItem(pendingKey);
      setPending(null);
      setCreated(result.artist);
      reload();
    } catch (failure) {
      if (failure.status && failure.status < 500) {
        sessionStorage.removeItem(pendingKey);
        setPending(null);
      }
      setError(
        failure.status
          ? failure.message
          : 'We could not confirm whether your profile was created. Check its result to safely continue.',
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (created)
    return (
      <section className="service-panel" role="status">
        <h2>Your artist profile is ready.</h2>
        <p className="service-muted">Share your first release with your listeners.</p>
        <Link to={`/artists/${encodeURIComponent(created.symbol)}`}>View {created.name} →</Link>
      </section>
    );
  return (
    <section className="service-panel">
      <h2>Make space for your sound.</h2>
      <p className="service-muted">
        Introduce yourself, share your sound, and open your paper artist market. No real money
        moves.
      </p>
      {!expanded ? (
        <button
          className="creator-action"
          onClick={() => {
            setExpanded(true);
            requestAnimationFrame(() => heading.current?.focus());
          }}
        >
          Create artist profile
        </button>
      ) : (
        <>
          <ol className="creator-steps" aria-label="Artist profile setup">
            {creatorSteps.map((label, index) => (
              <li key={label} aria-current={index === step ? 'step' : undefined}>
                <span aria-hidden="true">{index + 1}</span>
                <span>{label}</span>
              </li>
            ))}
          </ol>
          <h3 ref={heading} tabIndex={-1} className="creator-step-heading">
            {creatorSteps[step]}
          </h3>
          <p className="service-muted creator-step-copy">
            {
              [
                'Choose how listeners will find you. All three fields are required.',
                'Describe your sound. Your biography and links are optional.',
                'Take a final look. Your token symbol is permanent once your market is created.',
              ][step]
            }
          </p>
          <form
            className="service-form"
            noValidate
            onSubmit={register}
            onChange={() => setError('')}
          >
            {step === 0 && (
              <fieldset disabled={busy}>
                <Field
                  label="Artist name"
                  {...fields.props('name')}
                  required
                  maxLength={80}
                  autoComplete="organization"
                />
                <Field
                  label="Token symbol"
                  {...fields.props('symbol')}
                  required
                  maxLength={12}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="YOURNAME"
                  hint="3–12 letters or numbers, starting with a letter. Saved in uppercase."
                />
                <Field
                  label="Genre"
                  {...fields.props('genre')}
                  required
                  maxLength={40}
                  placeholder="Jazz, house, hip-hop…"
                />
              </fieldset>
            )}
            {step === 1 && (
              <fieldset disabled={busy}>
                <Field
                  label="Short description"
                  {...fields.props('description')}
                  required
                  maxLength={300}
                  multiline
                  hint="The introduction listeners see on your artist card."
                />
                <Field
                  label="Artist biography (optional)"
                  {...fields.props('bio')}
                  multiline
                  maxLength={1500}
                />
                <Field
                  label="Artist website (optional)"
                  {...fields.props('website_url')}
                  type="url"
                  maxLength={512}
                  placeholder="https://…"
                  autoCapitalize="none"
                />
                <Field
                  label="Music link (optional)"
                  {...fields.props('music_url')}
                  type="url"
                  maxLength={512}
                  placeholder="https://…"
                  autoCapitalize="none"
                />
              </fieldset>
            )}
            {step === 2 && (
              <div className="creator-review">
                <div className="creator-review-heading">
                  <div>
                    <h3>{fields.values.name.trim()}</h3>
                    <span className="creator-symbol">
                      {fields.values.symbol.trim().toUpperCase()} · {fields.values.genre.trim()}
                    </span>
                  </div>
                  {!pending && (
                    <button
                      type="button"
                      onClick={() => goTo(0)}
                      disabled={busy}
                      aria-label="Edit artist identity"
                    >
                      Edit
                    </button>
                  )}
                </div>
                <p>{fields.values.description.trim()}</p>
                {fields.values.bio.trim() && (
                  <p className="service-muted">{fields.values.bio.trim()}</p>
                )}
                {(fields.values.website_url || fields.values.music_url) && (
                  <dl className="creator-review-links">
                    {fields.values.website_url && (
                      <>
                        <dt>Website</dt>
                        <dd>{fields.values.website_url.trim()}</dd>
                      </>
                    )}
                    {fields.values.music_url && (
                      <>
                        <dt>Music</dt>
                        <dd>{fields.values.music_url.trim()}</dd>
                      </>
                    )}
                  </dl>
                )}
                {!pending && (
                  <button type="button" onClick={() => goTo(1)} disabled={busy}>
                    Edit story & links
                  </button>
                )}
              </div>
            )}
            {pending && (
              <p className="service-muted" role="status">
                Your submission is saved in this tab. Check its result before making any changes.
              </p>
            )}
            <FormError>{error}</FormError>
            <div className="creator-form-actions">
              {step > 0 && !pending && (
                <button type="button" disabled={busy} onClick={() => goTo(step - 1)}>
                  Back
                </button>
              )}
              <button className={step === 2 ? 'creator-action' : ''} disabled={busy}>
                {busy
                  ? 'Creating…'
                  : step === 0
                    ? 'Continue to story'
                    : step === 1
                      ? 'Review artist profile'
                      : pending
                        ? 'Check artist profile'
                        : 'Create paper artist market'}
              </button>
            </div>
            {step === 2 && (
              <p className="service-muted">
                This creates a public artist profile and a practice market. It does not launch an
                on-chain token.
              </p>
            )}
          </form>
        </>
      )}
    </section>
  );
}
function ReleaseEditor({ artist }) {
  const { token, reload } = useTrading();
  const key = `mtl.release.pending.${token.slice(0, 16)}`;
  const [pending, setPending] = useState(() => readDraft(key));
  const fields = useFields(
    {
      title: pending?.title || '',
      description: pending?.description || '',
      preview_url: pending?.preview_url || '',
    },
    releaseRules,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const lock = useRef(false);
  async function publish(event) {
    event.preventDefault();
    setError('');
    setSaved(false);
    if (lock.current || (!pending && !fields.validate(event.currentTarget))) return;
    lock.current = true;
    setBusy(true);
    const body = pending || { ...fields.body(), idempotency_key: crypto.randomUUID() };
    try {
      sessionStorage.setItem(key, JSON.stringify(body));
      setPending(body);
      await publishRelease(token, artist.symbol, body);
      sessionStorage.removeItem(key);
      setPending(null);
      fields.setValues({ title: '', description: '', preview_url: '' });
      fields.setErrors({});
      setSaved(true);
      reload();
    } catch (failure) {
      if (failure.status && failure.status < 500) {
        sessionStorage.removeItem(key);
        setPending(null);
      }
      setError(
        failure.status
          ? failure.message
          : 'Publication status is unknown. Check the result to retrieve the same release.',
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="service-panel">
      <h2>Share a release</h2>
      <p className="service-muted">Publish to your artist page and your followers’ feeds.</p>
      <Link to={`/artists/${encodeURIComponent(artist.symbol)}`}>View {artist.name} →</Link>
      <form
        className="service-form"
        noValidate
        onSubmit={publish}
        onChange={() => {
          setError('');
          setSaved(false);
        }}
      >
        <fieldset disabled={busy || Boolean(pending)}>
          <Field label="Release title" {...fields.props('title')} required maxLength={120} />
          <Field
            label="Release update"
            {...fields.props('description')}
            required
            maxLength={1200}
            multiline
          />
          <Field
            label="Audio preview URL (optional)"
            {...fields.props('preview_url')}
            type="url"
            maxLength={512}
            placeholder="https://…/preview.mp3"
            autoCapitalize="none"
            hint="Use an HTTPS audio file you have permission to share."
          />
        </fieldset>
        {pending && (
          <p className="service-muted" role="status">
            This release is waiting for confirmation. Check its result before editing or publishing
            again.
          </p>
        )}
        <FormError>{error}</FormError>
        <button disabled={busy}>
          {busy ? 'Publishing…' : pending ? 'Check release result' : 'Publish release'}
        </button>
      </form>
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
