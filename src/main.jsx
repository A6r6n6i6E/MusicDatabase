import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Search, Plus, Disc3, Upload, Download, ChevronDown, ExternalLink, AlertTriangle, Loader2 } from 'lucide-react';
import './styles.css';

const STORAGE_KEY = 'biblioteka-plyt-discogs-v4-cache';

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadLocalAlbums() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

function saveLocalAlbums(albums) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(albums));
}

async function apiJson(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.message || `Błąd HTTP ${res.status}`);
  return data;
}

async function loadCloudAlbums() {
  return apiJson('/.netlify/functions/collection');
}

async function createCloudAlbum(album) {
  return apiJson('/.netlify/functions/collection', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ album })
  });
}



function PlaceholderCover() {
  return (
    <div className="cover placeholder">
      <Disc3 size={42} />
      <span>brak okładki</span>
    </div>
  );
}

function TrackList({ tracks }) {
  if (!tracks?.length) return <p className="empty-track">Brak tracklisty. Spróbuj dodać album z dokładniejszym tytułem albo uzupełnij utwory ręcznie w eksporcie JSON.</p>;
  return (
    <ol className="tracklist">
      {tracks.map((track, index) => (
        <li key={`${track.position}-${track.title}-${index}`}>
          <span className="track-no">{track.position || index + 1}</span>
          <span className="track-title">{track.title}</span>
          {track.duration ? <span className="duration">{track.duration}</span> : null}
        </li>
      ))}
    </ol>
  );
}

function AlbumCard({ album }) {
  const [open, setOpen] = useState(false);
  const [imageError, setImageError] = useState(false);
  const country = album.country ? ` • ${album.country}` : '';
  const year = album.year || album.released || 'brak roku';

  return (
    <article className="album-card">
      <button className="cover-button" onClick={() => setOpen(!open)} aria-label="Rozwiń album">
        {album.coverUrl && !imageError ? (
          <img className="cover" src={album.coverUrl} alt={`Okładka ${album.title}`} onError={() => setImageError(true)} />
        ) : <PlaceholderCover />}
        <span className="format-pill">{album.mediaFormat || album.formatShort || 'Album'}</span>
      </button>
      <div className="album-body">
        <div className="album-head">
          <div>
            <h3>{album.title}</h3>
            <p>{album.artist} • {year}{country}</p>
          </div>
          <button className="round" onClick={() => setOpen(!open)} aria-label="Rozwiń tracklistę">
            <ChevronDown className={open ? 'rotate' : ''} size={20} />
          </button>
        </div>
        <div className="meta-grid">
          {album.label ? <span>Label: {album.label}</span> : null}
          {album.format ? <span>Format: {album.format}</span> : null}
          {album.genres?.length ? <span>Gatunek: {album.genres.join(', ')}</span> : null}
          {album.styles?.length ? <span>Styl: {album.styles.join(', ')}</span> : null}
        </div>
        {open ? (
          <div className="expanded">
            <TrackList tracks={album.tracks} />
            {album.discogsUrl ? <a className="discogs-link" href={album.discogsUrl} target="_blank" rel="noreferrer">Otwórz w Discogs <ExternalLink size={14} /></a> : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function SuggestInput({ label, value, onChange, placeholder, kind, artist, onPick, required }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    function close(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ kind, q, artist: artist || '' });
        const data = await apiJson(`/.netlify/functions/discogs-suggest?${params.toString()}`, { signal: controller.signal });
        setSuggestions(data.suggestions || []);
        setOpen(Boolean(data.suggestions?.length));
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 280);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, kind, artist]);

  return (
    <label ref={boxRef} className="suggest-label">
      {label}
      <div className="suggest-wrap">
        <input value={value} onChange={(e) => onChange(e.target.value)} onFocus={() => suggestions.length && setOpen(true)} placeholder={placeholder} required={required} />
        {loading ? <Loader2 className="input-spinner" size={16} /> : null}
        {open ? (
          <div className="suggestions">
            {suggestions.map((s) => (
              <button type="button" key={`${s.kind}-${s.id}-${s.label}`} onClick={() => { onPick(s); setOpen(false); }}>
                {s.thumb ? <img src={s.thumb} alt="" /> : <span className="suggest-disc"><Disc3 size={18} /></span>}
                <span>
                  <strong>{s.label}</strong>
                  {s.format ? <small>{s.format}</small> : null}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </label>
  );
}

function AddAlbumForm({ onAdd }) {
  const [form, setForm] = useState({ artist: '', title: '', year: '', mediaFormat: 'CD' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lastDebug, setLastDebug] = useState(null);

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  function pickArtist(s) {
    update('artist', s.artist || s.label || '');
  }

  function pickRelease(s) {
    setForm((prev) => ({
      ...prev,
      artist: s.artist || prev.artist,
      title: s.title || prev.title,
      year: s.year || prev.year
    }));
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setLastDebug(null);
    try {
      const params = new URLSearchParams({ artist: form.artist, title: form.title, year: form.year, format: form.mediaFormat });
      const data = await apiJson(`/.netlify/functions/discogs-search?${params.toString()}`);
      const album = {
        ...data.album,
        id: uid(),
        mediaFormat: form.mediaFormat,
        createdAt: new Date().toISOString()
      };
      await onAdd(album);
      setForm({ artist: '', title: '', year: '', mediaFormat: 'CD' });
    } catch (err) {
      setLastDebug(err);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel form" onSubmit={submit}>
      <div className="panel-title"><Plus size={20} /> Dodaj płytę z Discogs</div>
      <SuggestInput label="Wykonawca" kind="artist" value={form.artist} onChange={(v) => update('artist', v)} onPick={pickArtist} placeholder="np. Metallica" required />
      <SuggestInput label="Tytuł albumu" kind="release" artist={form.artist} value={form.title} onChange={(v) => update('title', v)} onPick={pickRelease} placeholder="np. Metallica" required />
      <div className="two-cols">
        <label>Rok<input value={form.year} onChange={(e) => update('year', e.target.value)} placeholder="1991" /></label>
        <label>Format<select value={form.mediaFormat} onChange={(e) => update('mediaFormat', e.target.value)}><option>CD</option><option>LP</option><option>Vinyl</option><option>Cassette</option><option>Box Set</option><option>Digital</option></select></label>
      </div>
      <button className="primary" disabled={busy}>{busy ? 'Pobieram z Discogs…' : 'Pobierz i dodaj'}</button>
      {error ? <div className="error"><AlertTriangle size={16} /> {error}</div> : null}
      {lastDebug?.code === 'MISSING_DISCOGS_TOKEN' ? <p className="hint">Dodaj DISCOGS_TOKEN do pliku .env lokalnie albo w panelu Netlify.</p> : null}
    </form>
  );
}

function App() {
  const [albums, setAlbums] = useState(loadLocalAlbums);
  const [query, setQuery] = useState('');
  const [format, setFormat] = useState('all');
  const [cloud, setCloud] = useState({ loading: true, enabled: false, message: 'Łączenie z bazą online…' });

  function setAndCache(next) {
    setAlbums(next);
    saveLocalAlbums(next);
  }

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const data = await loadCloudAlbums();
        if (!mounted) return;
        setAndCache(data.albums || []);
        setCloud({ loading: false, enabled: true, message: '' });
      } catch (err) {
        if (!mounted) return;
        setCloud({ loading: false, enabled: false, message: err.message || '' });
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  async function addAlbum(album) {
    if (cloud.enabled) await createCloudAlbum(album);
    setAndCache([album, ...albums]);
  }

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return albums.filter((a) => {
      const text = `${a.artist} ${a.title} ${a.year} ${a.country} ${a.label}`.toLowerCase();
      const matchesQuery = !q || text.includes(q);
      const matchesFormat = format === 'all' || (a.mediaFormat || a.format || '').toLowerCase().includes(format.toLowerCase());
      return matchesQuery && matchesFormat;
    });
  }, [albums, query, format]);

  function exportJson() {
    const blob = new Blob([JSON.stringify(albums, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `biblioteka-plyt-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importJson(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!Array.isArray(parsed)) throw new Error('Plik nie zawiera listy albumów.');
        const imported = parsed.map((a) => ({ ...a, id: a.id || uid(), updatedAt: new Date().toISOString() }));
        if (cloud.enabled) {
          for (const album of imported) await createCloudAlbum(album);
        }
        setAndCache([...imported, ...albums]);
      } catch (err) {
        alert(err.message);
      }
    };
    reader.readAsText(file);
  }

  return (
    <main>
      <section className="hero">
        <div>
          <div className="eyebrow">Prywatna kolekcja CD / LP</div>
          <h1>Biblioteka płyt</h1>
          <p>Nowoczesna baza albumów z okładkami, tracklistami i krajem wydania.</p>
        </div>
        <div className="stats"><strong>{albums.length}</strong><span>albumów w kolekcji</span></div>
      </section>

      <section className="layout">
        <aside>
          <AddAlbumForm onAdd={addAlbum} />
          <div className="panel tools">
            <div className="panel-title">Backup</div>
            <button className="ghost full" onClick={exportJson}><Download size={16} /> Eksport JSON</button>
            <label className="ghost full upload"><Upload size={16} /> Import JSON<input type="file" accept="application/json" onChange={importJson} /></label>
          </div>
        </aside>

        <section className="collection">
          <div className="toolbar">
            <div className="searchbox"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Szukaj po artyście, tytule, roku, kraju…" /></div>
            <select value={format} onChange={(e) => setFormat(e.target.value)}><option value="all">Wszystkie formaty</option><option value="CD">CD</option><option value="LP">LP</option><option value="Vinyl">Vinyl</option><option value="Cassette">Cassette</option></select>
          </div>
          <div className="grid">
            {filtered.map((album) => <AlbumCard key={album.id} album={album} />)}
          </div>
          {!filtered.length ? <div className="empty"><Disc3 size={44} /><h2>Brak albumów</h2><p>Dodaj pierwszą płytę z panelu po lewej stronie.</p></div> : null}
        </section>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
