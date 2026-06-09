import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Search, Plus, Disc3, Upload, Download, ChevronDown, AlertTriangle, Loader2, Edit3, Trash2, Save, X, Image as ImageIcon } from 'lucide-react';
import './styles.css';

const STORAGE_KEY = 'biblioteka-plyt-discogs-v6-cache';

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

async function updateCloudAlbum(album) {
  return apiJson('/.netlify/functions/collection', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: album.id, album })
  });
}

async function deleteCloudAlbum(id) {
  return apiJson(`/.netlify/functions/collection?id=${encodeURIComponent(id)}`, {
    method: 'DELETE'
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
  if (!tracks?.length) return <p className="empty-track">Brak tracklisty. Kliknij „Edytuj”, aby uzupełnić utwory ręcznie.</p>;
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

function tracksToText(tracks = []) {
  return tracks.map((t, i) => `${t.position || i + 1} | ${t.title || ''}${t.duration ? ` | ${t.duration}` : ''}`).join('\n');
}

function textToTracks(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parts = line.split('|').map((p) => p.trim());
      if (parts.length >= 2) return { position: parts[0] || String(index + 1), title: parts[1] || '', duration: parts[2] || '' };
      return { position: String(index + 1), title: line, duration: '' };
    })
    .filter((track) => track.title);
}

function csvToArray(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function EditAlbumForm({ album, onCancel, onSave }) {
  const [draft, setDraft] = useState(() => ({
    ...album,
    genresText: (album.genres || []).join(', '),
    stylesText: (album.styles || []).join(', '),
    tracksText: tracksToText(album.tracks || [])
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const update = (key, value) => setDraft((prev) => ({ ...prev, [key]: value }));

  function handleCoverFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => update('coverUrl', String(reader.result || ''));
    reader.readAsDataURL(file);
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const next = {
        ...album,
        ...draft,
        year: String(draft.year || '').trim(),
        country: String(draft.country || '').trim(),
        artist: String(draft.artist || '').trim(),
        title: String(draft.title || '').trim(),
        mediaFormat: String(draft.mediaFormat || '').trim(),
        coverUrl: String(draft.coverUrl || '').trim(),
        discogsUrl: String(draft.discogsUrl || '').trim(),
        label: String(draft.label || '').trim(),
        format: String(draft.format || '').trim(),
        genres: csvToArray(draft.genresText),
        styles: csvToArray(draft.stylesText),
        tracks: textToTracks(draft.tracksText),
        updatedAt: new Date().toISOString()
      };
      delete next.genresText;
      delete next.stylesText;
      delete next.tracksText;
      await onSave(next);
    } catch (err) {
      setError(err.message || 'Nie udało się zapisać zmian.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="edit-form" onSubmit={submit}>
      <div className="edit-title"><Edit3 size={17} /> Edycja albumu</div>
      <div className="edit-grid two">
        <label>Wykonawca<input value={draft.artist || ''} onChange={(e) => update('artist', e.target.value)} /></label>
        <label>Tytuł<input value={draft.title || ''} onChange={(e) => update('title', e.target.value)} /></label>
      </div>
      <div className="edit-grid three">
        <label>Rok<input value={draft.year || ''} onChange={(e) => update('year', e.target.value)} /></label>
        <label>Kraj<input value={draft.country || ''} onChange={(e) => update('country', e.target.value)} /></label>
        <label>Format kolekcji<input value={draft.mediaFormat || ''} onChange={(e) => update('mediaFormat', e.target.value)} placeholder="CD / LP" /></label>
      </div>
      <label>Adres okładki<input value={draft.coverUrl || ''} onChange={(e) => update('coverUrl', e.target.value)} placeholder="https://... albo wgraj plik poniżej" /></label>
      <label className="ghost upload cover-upload"><ImageIcon size={16} /> Wgraj własną okładkę<input type="file" accept="image/*" onChange={handleCoverFile} /></label>
      <div className="edit-grid two">
        <label>Label<input value={draft.label || ''} onChange={(e) => update('label', e.target.value)} /></label>
        <label>Format Discogs<input value={draft.format || ''} onChange={(e) => update('format', e.target.value)} /></label>
      </div>
      <div className="edit-grid two">
        <label>Gatunki<input value={draft.genresText || ''} onChange={(e) => update('genresText', e.target.value)} placeholder="Heavy Metal, Rock" /></label>
        <label>Style<input value={draft.stylesText || ''} onChange={(e) => update('stylesText', e.target.value)} placeholder="Thrash, Hard Rock" /></label>
      </div>
      <label>Discogs URL<input value={draft.discogsUrl || ''} onChange={(e) => update('discogsUrl', e.target.value)} /></label>
      <label>Tracklista<textarea value={draft.tracksText || ''} onChange={(e) => update('tracksText', e.target.value)} rows={9} placeholder={'1 | Tytuł utworu | 4:32\n2 | Kolejny utwór | 3:58'} /></label>
      {error ? <div className="error"><AlertTriangle size={16} /> {error}</div> : null}
      <div className="edit-actions">
        <button type="button" className="ghost" onClick={onCancel}><X size={16} /> Anuluj</button>
        <button className="primary" disabled={saving}><Save size={16} /> {saving ? 'Zapisuję…' : 'Zapisz zmiany'}</button>
      </div>
    </form>
  );
}

function AlbumCard({ album, onDelete, onUpdate }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [busyDelete, setBusyDelete] = useState(false);
  const country = album.country ? ` • ${album.country}` : '';
  const year = album.year || album.released || 'brak roku';

  async function handleDelete() {
    const ok = window.confirm(`Usunąć album „${album.artist} - ${album.title}”?`);
    if (!ok) return;
    setBusyDelete(true);
    try {
      await onDelete(album.id);
    } finally {
      setBusyDelete(false);
    }
  }

  async function handleSave(next) {
    await onUpdate(next);
    setEditing(false);
    setImageError(false);
  }

  return (
    <article className="album-card">
      <button className="cover-button" onClick={() => setOpen(!open)} aria-label="Rozwiń album">
        {album.coverUrl && !imageError ? (
          <img className="cover" src={album.coverUrl} alt={`Okładka ${album.title}`} onError={() => setImageError(true)} />
        ) : <PlaceholderCover />}
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
          {album.genres?.length ? <span>Gatunek: {album.genres.join(', ')}</span> : null}
          {album.styles?.length ? <span>Styl: {album.styles.join(', ')}</span> : null}
        </div>
        {open ? (
          <div className="expanded">
            {editing ? (
              <EditAlbumForm album={album} onCancel={() => setEditing(false)} onSave={handleSave} />
            ) : (
              <>
                <TrackList tracks={album.tracks} />
                <div className="card-actions">
                  <button className="ghost" onClick={() => setEditing(true)}><Edit3 size={16} /> Edytuj</button>
                  <button className="danger" onClick={handleDelete} disabled={busyDelete}><Trash2 size={16} /> {busyDelete ? 'Usuwam…' : 'Usuń'}</button>
                </div>
              </>
            )}
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
  const [lockedValue, setLockedValue] = useState('');
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
    if (lockedValue && q === lockedValue) {
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      return;
    }
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
  }, [value, kind, artist, lockedValue]);

  function handleChange(next) {
    setLockedValue('');
    onChange(next);
  }

  function handlePick(s) {
    const picked = s.title || s.artist || s.label || '';
    setLockedValue(String(picked).trim());
    setSuggestions([]);
    setOpen(false);
    onPick(s);
  }

  return (
    <label ref={boxRef} className="suggest-label">
      {label}
      <div className="suggest-wrap">
        <input value={value} onChange={(e) => handleChange(e.target.value)} onFocus={() => { if (suggestions.length && value.trim() !== lockedValue) setOpen(true); }} placeholder={placeholder} required={required} />
        {loading ? <Loader2 className="input-spinner" size={16} /> : null}
        {open ? (
          <div className="suggestions">
            {suggestions.map((s) => (
              <button type="button" key={`${s.kind}-${s.id}-${s.label}`} onClick={() => handlePick(s)}>
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

  async function updateAlbum(album) {
    if (cloud.enabled) await updateCloudAlbum(album);
    setAndCache(albums.map((item) => item.id === album.id ? album : item));
  }

  async function removeAlbum(id) {
    if (cloud.enabled) await deleteCloudAlbum(id);
    setAndCache(albums.filter((item) => item.id !== id));
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
            {filtered.map((album) => <AlbumCard key={album.id} album={album} onDelete={removeAlbum} onUpdate={updateAlbum} />)}
          </div>
          {!filtered.length ? <div className="empty"><Disc3 size={44} /><h2>Brak albumów</h2><p>Dodaj pierwszą płytę z panelu po lewej stronie.</p></div> : null}
        </section>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
