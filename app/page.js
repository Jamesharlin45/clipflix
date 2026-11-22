'use client';
import { useRef, useState } from 'react';

const RES = { '1080p': [1080, 1920], '2K': [1440, 2560], '4K': [2160, 3840] };
const NL = String.fromCharCode(10);
const TS = /((?:[0-9]+:)?[0-9]+:[0-9]+[.,][0-9]+) *--> *((?:[0-9]+:)?[0-9]+:[0-9]+[.,][0-9]+)/;
const sec = (s) => {
  const p = s.replace(',', '.').split(':').map(Number);
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
};
const fmt = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

function parseCaptions(txt) {
  const segs = [];
  let cur = null;
  for (const raw of txt.split(NL)) {
    const l = raw.trim();
    const m = l.match(TS);
    if (m) { cur = { start: sec(m[1]), end: sec(m[2]), text: '' }; segs.push(cur); }
    else if (!l) cur = null;
    else if (cur && !/^[0-9]+$/.test(l)) cur.text += (cur.text ? ' ' : '') + l.replace(/<[^>]+>/g, '');
  }
  return segs.filter((s) => s.text);
}

function wrap(ctx, text, maxW) {
  const out = [];
  let line = '';
  for (const w of text.split(' ')) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  return out;
}

export default function Home() {
  const vref = useRef(null);
  const [src, setSrc] = useState('');
  const [segs, setSegs] = useState([]);
  const [clips, setClips] = useState([]);
  const [res, setRes] = useState('1080p');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(null);
  const [prog, setProg] = useState(0);
  const [ai, setAi] = useState(false);

  const onVideo = (e) => { const f = e.target.files[0]; if (f) setSrc(URL.createObjectURL(f)); };

  const onCaptions = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const s = parseCaptions(await f.text());
    setSegs(s);
    setClips([]);
    setMsg(s.length ? s.length + ' caption lines loaded.' : 'No timestamps found. Use an .srt or .vtt file.');
  };

  const find = async () => {
    setMsg('Finding moments...');
    try {
      const r = await fetch('/api/analyze', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ segments: segs }) });
      const d = await r.json();
      if (!r.ok) return setMsg(d.error || 'Analysis failed.');
      setClips(d.clips);
      setAi(d.ai);
      setMsg(d.clips.length ? '' : 'No moments found. Clips need 12 to 60 seconds of continuous speech.');
    } catch { setMsg('Analysis failed. Try again.'); }
  };

  const preview = (c) => { const v = vref.current; if (!v) return; v.currentTime = c.start; v.play(); };

  const exportClip = async (c, i) => {
    const v = vref.current;
    if (!v || !src) return setMsg('Add a video first.');
    if (!window.MediaRecorder || !v.captureStream) return setMsg('Export needs Chrome, Edge or Firefox.');
    try {
      const [W, H] = RES[res];
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d');
      setBusy(i); setProg(0); v.pause();
      if (Math.abs(v.currentTime - c.start) > 0.05) await new Promise((r) => { v.onseeked = r; v.currentTime = c.start; });
      const stream = cv.captureStream(30);
      v.captureStream().getAudioTracks().forEach((t) => stream.addTrack(t));
      const mime = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: W >= 2160 ? 35e6 : W >= 1440 ? 16e6 : 8e6 });
      const chunks = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const stopped = new Promise((r) => (rec.onstop = r));
      const caps = segs.filter((s) => s.end > c.start && s.start < c.end);
      const k = Math.max(W / v.videoWidth, H / v.videoHeight);
      const dw = v.videoWidth * k, dh = v.videoHeight * k;
      ctx.textAlign = 'center';
      ctx.lineJoin = 'round';
      const draw = () => {
        ctx.drawImage(v, (W - dw) / 2, (H - dh) / 2, dw, dh);
        const cur = caps.find((s) => v.currentTime >= s.start && v.currentTime < s.end);
        if (!cur) return;
        ctx.font = '800 ' + W * 0.065 + 'px system-ui, sans-serif';
        ctx.lineWidth = W * 0.014; ctx.strokeStyle = '#000'; ctx.fillStyle = '#fff';
        wrap(ctx, cur.text, W * 0.84).forEach((ln, n, a) => {
          const y = H * 0.76 + (n - a.length / 2) * W * 0.08;
          ctx.strokeText(ln, W / 2, y);
          ctx.fillText(ln, W / 2, y);
        });
      };
      rec.start();
      await v.play();
      await new Promise((done) => {
        const tick = () => {
          draw();
          setProg((v.currentTime - c.start) / (c.end - c.start));
          if (v.currentTime >= c.end || v.ended) done(); else requestAnimationFrame(tick);
        };
        tick();
      });
      v.pause(); rec.stop(); await stopped;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(chunks, { type: mime }));
      a.download = 'clipflix-' + (i + 1) + '-' + res + (mime.includes('mp4') ? '.mp4' : '.webm');
      a.click();
    } catch { setMsg('Export failed. Try a smaller size.'); }
    setBusy(null); setProg(0);
  };

  return (
    <main>
      <header>
        <h1>ClipFlix</h1>
        <p className='sub'>Long video in, viral shorts out. Everything runs in your browser.</p>
      </header>
      <section>
        <div className='frame'>{src ? <video ref={vref} src={src} playsInline controls /> : <p>Your video appears here, cropped to 9:16</p>}</div>
      </section>
      <section className='steps'>
        <label className='step'><b>1. Add your video</b><input type='file' accept='video/*' onChange={onVideo} /></label>
        <label className='step'><b>2. Add its captions (.srt or .vtt)</b><input type='file' accept='.srt,.vtt' onChange={onCaptions} /></label>
        <div className='row'>
          <button onClick={find} disabled={!segs.length}>Find viral moments</button>
          <label className='row'>Export size <select value={res} onChange={(e) => setRes(e.target.value)}>{Object.keys(RES).map((k) => <option key={k}>{k}</option>)}</select></label>
        </div>
        {msg && <p className='msg'>{msg}</p>}
        {clips.length > 0 && <p className='sub'>{ai ? 'Ranked by Claude.' : 'Ranked by keyword score. Add ANTHROPIC_API_KEY in Vercel for AI ranking.'}</p>}
        {clips.map((c, i) => (
          <article className='clip' key={i}>
            <h3>{c.title || c.text.slice(0, 70) + '...'}</h3>
            <p>{fmt(c.start)} to {fmt(c.end)}, {Math.round(c.end - c.start)}s, score {c.score}</p>
            <div className='bar'><i style={{ width: c.score + '%' }} /></div>
            <div className='row'>
              <button className='alt' onClick={() => preview(c)}>Preview</button>
              <button onClick={() => exportClip(c, i)} disabled={busy !== null}>{busy === i ? 'Exporting ' + Math.round(prog * 100) + '%' : 'Export ' + res}</button>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
