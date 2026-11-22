export const maxDuration = 30;

const HOOK = /(secret|never|always|mistake|truth|nobody|biggest|why|how|stop|worst|best|crazy|insane|shocking|actually|imagine|wait)/gi;
const OPEN = /([?]|why|how|stop|never|secret|imagine)/i;

function windows(segs) {
  const out = [];
  for (let i = 0; i < segs.length; i++) {
    let j = i;
    while (j < segs.length - 1 && segs[j].end - segs[i].start < 25) j++;
    const dur = segs[j].end - segs[i].start;
    if (dur < 12 || dur > 60) continue;
    out.push({ start: segs[i].start, end: segs[j].end, text: segs.slice(i, j + 1).map((s) => s.text).join(' ') });
  }
  return out;
}

function score(t) {
  const hooks = (t.match(HOOK) || []).length;
  const q = (t.match(/[?]/g) || []).length;
  const ex = (t.match(/!/g) || []).length;
  const nums = (t.match(/[0-9]+/g) || []).length;
  const open = OPEN.test(t.slice(0, 90)) ? 15 : 0;
  return Math.min(99, Math.round(35 + hooks * 6 + q * 5 + ex * 4 + nums * 3 + open));
}

function pick(list) {
  const out = [];
  for (const c of list.sort((a, b) => b.score - a.score)) {
    if (out.every((o) => c.end <= o.start || c.start >= o.end)) out.push(c);
    if (out.length === 8) break;
  }
  return out;
}

export async function POST(req) {
  const { segments } = await req.json();
  if (!Array.isArray(segments) || !segments.length) return Response.json({ error: 'No captions received.' }, { status: 400 });
  const clips = pick(windows(segments).map((c) => ({ ...c, score: score(c.text), title: '' })));
  let ai = false;
  const key = process.env.ANTHROPIC_API_KEY;
  if (key && clips.length) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
          max_tokens: 1000,
          messages: [{ role: 'user', content: 'Rate each candidate short-video clip 0-99 for viral potential (strong hook, emotion, makes sense alone). Give each a punchy title under 8 words. Reply ONLY with a JSON array like [{"i":0,"score":80,"title":"..."}]. Candidates: ' + clips.map((c, i) => i + ': ' + c.text.slice(0, 500)).join(' || ') }],
        }),
      });
      const d = await r.json();
      const t = d.content?.[0]?.text || '';
      JSON.parse(t.slice(t.indexOf('['), t.lastIndexOf(']') + 1)).forEach((a) => {
        if (clips[a.i]) { clips[a.i].score = a.score; clips[a.i].title = a.title; }
      });
      clips.sort((a, b) => b.score - a.score);
      ai = true;
    } catch {}
  }
  return Response.json({ clips, ai });
}
