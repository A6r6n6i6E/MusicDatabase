import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Search, Plus, Disc3, Upload, Download, Trash2, RefreshCcw, ChevronDown, ExternalLink, AlertTriangle } from 'lucide-react';
import './styles.css';

const STORAGE_KEY = 'biblioteka-plyt-discogs-v3';

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadAlbums() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveAlbums(albums) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(albums));
}

function PlaceholderCover() {
  return (
    <div className="cover placeholder">
      <Disc3 size={54} />
      <span>brak okładki</span>
    </div>
  );
}

function TrackList({ tracks }) {
  if (!tracks?.length) return <p className="empty-track">Brak tracklisty. Spróbuj odświeżyć dane z Discogs albo dodaj utwory ręcznie w eksporcie JSON.</p>;
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

function AlbumCard({ album, onDelete, onRefresh }) {
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
        <div className="actions-row">
          <button className="ghost" onClick={() => onRefresh(album)}><RefreshCcw size={16} /> Odśwież dane</button>
          <button className="danger" onClick={() => onDelete(album.id)}><Trash2 size={16} /> Usuń</button>
        </div>
      </div>
    </article>
  );
}

function AddAlbumForm({ onAdd }) {
  const [form, setForm] = useState({ artist: '', title: '', year: '', mediaFormat: 'CD' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lastDebug, setLastDebug] = useState(null);

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setLastDebug(null);
    try {
      const params = new URLSearchParams({
        artist: form.artist,
        title: form.title,
        year: form.year,
        format: form.mediaFormat
      });
      const res = await fetch(`/.netlify/functions/discogs-search?${params.toString()}`);
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setLastDebug(data);
        throw new Error(data.message || 'Nie udało się pobrać danych z Discogs.');
      }
      const album = {
        ...data.album,
        id: uid(),
        mediaFormat: form.mediaFormat,
        createdAt: new Date().toISOString()
      };
      onAdd(album);
      setForm({ artist: '', title: '', year: '', mediaFormat: 'CD' });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel form" onSubmit={submit}>
      <div className="panel-title"><Plus size={20} /> Dodaj płytę z Discogs</div>
      <label>Wykonawca<input value={form.artist} onChange={(e) => update('artist', e.target.value)} placeholder="np. Metallica" required /></label>
      <label>Tytuł albumu<input value={form.title} onChange={(e) => update('title', e.target.value)} placeholder="np. Metallica" required /></label>
      <div className="two-cols">
        <label>Rok<input value={form.year} onChange={(e) => update('year', e.target.value)} placeholder="1991" /></label>
        <label>Format<select value={form.mediaFormat} onChange={(e) => update('mediaFormat', e.target.value)}><option>CD</option><option>LP</option><option>Vinyl</option><option>Cassette</option><option>Box Set</option><option>Digital</option></select></label>
      </div>
      <button className="primary" disabled={busy}>{busy ? 'Pobieram z Discogs…' : 'Pobierz i dodaj'}</button>
      {error ? <div className="error"><AlertTriangle size={16} /> {error}</div> : null}
      {lastDebug?.code === 'MISSING_DISCOGS_TOKEN' ? <p className="hint">Dodaj DISCOGS_TOKEN do pliku .env lokalnie albo w panelu Netlify: Site configuration → Environment variables.</p> : null}
    </form>
  );
}

function App() {
  const [albums, setAlbums] = useState(loadAlbums);
  const [query, setQuery] = useState('');
  const [format, setFormat] = useState('all');
  const [refreshing, setRefreshing] = useState('');

  function setAndSave(next) {
    setAlbums(next);
    saveAlbums(next);
  }

  function addAlbum(album) {
    setAndSave([album, ...albums]);
  }

  function deleteAlbum(id) {
    setAndSave(albums.filter((a) => a.id !== id));
  }

  async function refreshAlbum(album) {
    setRefreshing(album.id);
    try {
      const params = new URLSearchParams({ artist: album.artist, title: album.title, year: album.year || '', format: album.mediaFormat || '' });
      const res = await fetch(`/.netlify/functions/discogs-search?${params.toString()}`);
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.message || 'Błąd odświeżania.');
      const updated = { ...album, ...data.album, id: album.id, mediaFormat: album.mediaFormat || data.album.format, updatedAt: new Date().toISOString() };
      setAndSave(albums.map((a) => (a.id === album.id ? updated : a)));
    } catch (err) {
      alert(err.message);
    } finally {
      setRefreshing('');
    }
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

  function importJson(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!Array.isArray(parsed)) throw new Error('Plik nie zawiera listy albumów.');
        setAndSave(parsed.map((a) => ({ ...a, id: a.id || uid() })));
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
          <p>Nowoczesna baza albumów z okładkami, tracklistami i krajem wydania pobieranymi z Discogs.</p>
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
          {refreshing ? <div className="notice">Odświeżam dane z Discogs…</div> : null}
          <div className="grid">
            {filtered.map((album) => <AlbumCard key={album.id} album={album} onDelete={deleteAlbum} onRefresh={refreshAlbum} />)}
          </div>
          {!filtered.length ? <div className="empty"><Disc3 size={44} /><h2>Brak albumów</h2><p>Dodaj pierwszą płytę z panelu po lewej stronie.</p></div> : null}
        </section>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
