import React, { useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Album, ChevronDown, Disc3, Download, GitBranch, Import, Loader2, Plus, Search, Trash2, Upload } from 'lucide-react';
import './styles.css';

const STORAGE_KEY = 'metal-collection-v1';

const demoAlbums = [
  {
    id: crypto.randomUUID(),
    artist: 'Black Sabbath',
    title: 'Paranoid',
    year: '1970',
    format: 'LP',
    coverUrl: 'https://www.metal-archives.com/images/2/0/8/4/2084.jpg',
    tracks: [
      { number: '01', title: 'War Pigs', length: '7:57' },
      { number: '02', title: 'Paranoid', length: '2:53' },
      { number: '03', title: 'Planet Caravan', length: '4:35' }
    ]
  },
  {
    id: crypto.randomUUID(),
    artist: 'Death',
    title: 'Symbolic',
    year: '1995',
    format: 'CD',
    coverUrl: 'https://www.metal-archives.com/images/6/1/8/618.jpg',
    tracks: [
      { number: '01', title: 'Symbolic', length: '6:32' },
      { number: '02', title: 'Zero Tolerance', length: '4:48' },
      { number: '03', title: 'Empty Words', length: '6:22' }
    ]
  }
];

function readCollection() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : demoAlbums;
  } catch {
    return demoAlbums;
  }
}

function App() {
  const [albums, setAlbums] = useState(readCollection);
  const [query, setQuery] = useState('');
  const [format, setFormat] = useState('all');
  const [openId, setOpenId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const fileRef = useRef(null);

  const [form, setForm] = useState({ artist: '', title: '', year: '', format: 'CD', coverUrl: '' });

  const persist = (next) => {
    setAlbums(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return albums
      .filter((album) => format === 'all' || album.format === format)
      .filter((album) => !q || `${album.artist} ${album.title} ${album.year}`.toLowerCase().includes(q))
      .sort((a, b) => `${a.artist} ${a.year}`.localeCompare(`${b.artist} ${b.year}`));
  }, [albums, query, format]);

  const stats = useMemo(() => ({
    total: albums.length,
    cd: albums.filter(a => a.format === 'CD').length,
    lp: albums.filter(a => a.format === 'LP').length,
    artists: new Set(albums.map(a => a.artist.toLowerCase())).size
  }), [albums]);

  async function addAlbum(event) {
    event.preventDefault();
    if (!form.artist.trim() || !form.title.trim()) {
      setMessage('Podaj przynajmniej wykonawcę i tytuł albumu.');
      return;
    }

    setLoading(true);
    setMessage('Szukam albumu i tracklisty...');
    let imported = null;
    try {
      const url = `/.netlify/functions/album-search?artist=${encodeURIComponent(form.artist)}&title=${encodeURIComponent(form.title)}&year=${encodeURIComponent(form.year)}`;
      const response = await fetch(url);
      const data = await response.json();
      if (response.ok) imported = data;
      else setMessage(data.error || 'Nie znaleziono albumu. Dodaję pustą kartę.');
    } catch {
      setMessage('Funkcja pobierania danych nie jest dostępna lokalnie bez Netlify Dev. Dodaję pustą kartę.');
    }

    const nextAlbum = {
      id: crypto.randomUUID(),
      artist: imported?.artist || form.artist.trim(),
      title: imported?.title || form.title.trim(),
      year: imported?.year || form.year.trim(),
      format: form.format,
      coverUrl: form.coverUrl || imported?.coverUrl || '',
      tracks: imported?.tracks?.length ? imported.tracks : [],
      label: imported?.label || '',
      source: imported?.source || 'manual',
      metalArchivesLink: imported?.metalArchivesLink || ''
    };

    persist([nextAlbum, ...albums]);
    setForm({ artist: '', title: '', year: '', format: 'CD', coverUrl: '' });
    setOpenId(nextAlbum.id);
    setLoading(false);
    setMessage(imported ? 'Album dodany z danymi z Metal Archives.' : 'Album dodany. Tracklistę możesz uzupełnić ręcznie po eksporcie JSON lub rozbudowie formularza.');
  }

  function removeAlbum(id) {
    persist(albums.filter(album => album.id !== id));
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(albums, null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = `metal-collection-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(href);
  }

  async function importJson(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data)) throw new Error('wrong format');
      persist(data);
      setMessage('Zaimportowano kolekcję z pliku JSON.');
    } catch {
      setMessage('Nie udało się zaimportować pliku. Sprawdź, czy to poprawny JSON.');
    }
    event.target.value = '';
  }

  return (
    <main>
      <section className="hero">
        <div className="hero-content">
          <div className="eyebrow"><Disc3 size={18} /> prywatna baza CD / LP</div>
          <h1>Metal Collection</h1>
          <p>Elegancka biblioteka płyt z okładkami, wyszukiwarką i rozwijaną tracklistą pobieraną przez serverless function.</p>
          <div className="hero-actions">
            <a className="ghost" href="https://app.netlify.com/start" target="_blank" rel="noreferrer"><Upload size={17} /> Netlify deploy</a>
            <a className="ghost" href="https://github.com/new" target="_blank" rel="noreferrer"><GitBranch size={17} /> GitHub repo</a>
          </div>
        </div>
        <div className="stats-card">
          <div><strong>{stats.total}</strong><span>albumów</span></div>
          <div><strong>{stats.artists}</strong><span>artystów</span></div>
          <div><strong>{stats.cd}</strong><span>CD</span></div>
          <div><strong>{stats.lp}</strong><span>LP</span></div>
        </div>
      </section>

      <section className="panel add-panel">
        <div className="section-title"><Plus size={20} /><h2>Dodaj płytę</h2></div>
        <form onSubmit={addAlbum} className="album-form">
          <input value={form.artist} onChange={e => setForm({ ...form, artist: e.target.value })} placeholder="Wykonawca, np. Death" />
          <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Tytuł albumu, np. Symbolic" />
          <input value={form.year} onChange={e => setForm({ ...form, year: e.target.value })} placeholder="Rok, np. 1995" inputMode="numeric" />
          <select value={form.format} onChange={e => setForm({ ...form, format: e.target.value })}>
            <option>CD</option>
            <option>LP</option>
            <option>Box</option>
            <option>Digital</option>
          </select>
          <input className="wide" value={form.coverUrl} onChange={e => setForm({ ...form, coverUrl: e.target.value })} placeholder="Opcjonalny URL okładki, gdy chcesz nadpisać automatyczną" />
          <button disabled={loading} type="submit">{loading ? <Loader2 className="spin" size={18} /> : <Plus size={18} />} Dodaj i pobierz tracklistę</button>
        </form>
        {message && <p className="message">{message}</p>}
      </section>

      <section className="toolbar">
        <div className="searchbox"><Search size={18} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Szukaj po artyście, albumie lub roku..." /></div>
        <select value={format} onChange={e => setFormat(e.target.value)}>
          <option value="all">Wszystkie formaty</option>
          <option value="CD">CD</option>
          <option value="LP">LP</option>
          <option value="Box">Box</option>
          <option value="Digital">Digital</option>
        </select>
        <button className="secondary" onClick={exportJson}><Download size={17} /> Eksport</button>
        <button className="secondary" onClick={() => fileRef.current.click()}><Import size={17} /> Import</button>
        <input ref={fileRef} type="file" accept="application/json" hidden onChange={importJson} />
      </section>

      <section className="grid">
        {filtered.map(album => (
          <article key={album.id} className={`album-card ${openId === album.id ? 'open' : ''}`}>
            <button className="cover-button" onClick={() => setOpenId(openId === album.id ? null : album.id)} aria-label={`Otwórz ${album.title}`}>
              {album.coverUrl ? <img src={album.coverUrl} alt={`${album.artist} - ${album.title}`} loading="lazy" /> : <div className="cover-placeholder"><Album size={46} /></div>}
              <span className="format-pill">{album.format}</span>
            </button>
            <div className="album-body">
              <div className="album-head">
                <div>
                  <h3>{album.title}</h3>
                  <p>{album.artist} · {album.year || 'brak roku'}</p>
                </div>
                <button className="icon" onClick={() => setOpenId(openId === album.id ? null : album.id)}><ChevronDown size={20} /></button>
              </div>
              {openId === album.id && (
                <div className="tracks">
                  {album.label && <p className="meta">Label: {album.label}</p>}
                  {album.tracks?.length ? album.tracks.map((track, index) => (
                    <div className="track" key={`${track.number}-${track.title}-${index}`}>
                      <span>{track.number || index + 1}</span>
                      <strong>{track.title}</strong>
                      <em>{track.length}</em>
                    </div>
                  )) : <p className="empty">Brak tracklisty. Spróbuj dokładniejszego tytułu lub dodaj ją ręcznie w JSON.</p>}
                  <button className="delete" onClick={() => removeAlbum(album.id)}><Trash2 size={16} /> Usuń album</button>
                </div>
              )}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
