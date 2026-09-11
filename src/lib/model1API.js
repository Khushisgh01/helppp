import { MODEL1_FALLBACK_PAIRS, model1SceneLabel, pairForImageId, parseMcqOptions } from './model1Catalog';

const REMOTE_DEFAULT = 'https://satquery-model1-vqa-api.onrender.com';

export function model1ApiBase() {
  const env = import.meta.env.VITE_MODEL1_VQA_API_URL;
  if (env) return String(env).replace(/\/$/, '');
  // Same-origin proxy in Vite (see vite.config.js) — the Render API has no CORS.
  if (import.meta.env.DEV) return '/satquery-model1';
  return REMOTE_DEFAULT;
}

export function model1PlaceholderDataUrl(imageId) {
  const id = imageId || 'scene';
  const label = model1SceneLabel(id);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">
    <rect width="800" height="800" fill="#14141c"/>
    <rect x="24" y="24" width="752" height="752" fill="none" stroke="#D4A843" stroke-opacity="0.35" stroke-width="2"/>
    <text x="400" y="355" fill="#D4A843" font-family="ui-monospace, monospace" font-size="28" text-anchor="middle">${label}</text>
    <text x="400" y="400" fill="#F2EDE6" font-family="ui-monospace, monospace" font-size="18" text-anchor="middle">${id}</text>
    <text x="400" y="445" fill="#F2EDE6" fill-opacity="0.45" font-family="ui-monospace, monospace" font-size="14" text-anchor="middle">Satellite scene</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function model1ImageUrl(imageId) {
  if (!imageId) return '';
  const base = import.meta.env.VITE_MODEL1_IMAGE_BASE_URL;
  if (base) return `${String(base).replace(/\/$/, '')}/${imageId}`;
  return model1PlaceholderDataUrl(imageId);
}

export function resolveModel1ImageId(images = []) {
  const first = images[0];
  if (!first) return null;
  if (first.imageId) return first.imageId;
  const name = first.name || first.file?.name || '';
  const match = String(name).match(/demo_\d+\.png/i);
  return match ? match[0].toLowerCase() : null;
}

let catalogPromise = null;
let lastCatalog = MODEL1_FALLBACK_PAIRS;

function canonicalQuestion(q) {
  return String(q || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export async function fetchModel1Catalog() {
  if (!catalogPromise) {
    catalogPromise = (async () => {
      const res = await fetch(`${model1ApiBase()}/model1/supported`);
      if (!res.ok) throw new Error(`Model 1 catalog failed (${res.status})`);
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) throw new Error('Model 1 catalog was empty');
      lastCatalog = data;
      return data;
    })().catch((err) => {
      catalogPromise = null;
      throw err;
    });
  }
  return catalogPromise;
}

export async function loadModel1Catalog() {
  try {
    return await fetchModel1Catalog();
  } catch {
    return MODEL1_FALLBACK_PAIRS;
  }
}

function formatAnswer(answer, question) {
  const raw = String(answer ?? '').trim();
  if (!raw) return { text: '', matched: false };
  if (/unable to answer/i.test(raw)) {
    return {
      text: 'No confident answer for this scene and question. Try a more specific query or another image.',
      matched: false,
    };
  }
  if (/^yes$/i.test(raw)) return { text: 'Yes.', matched: true };
  if (/^no$/i.test(raw)) return { text: 'No.', matched: true };

  const letterMatch = raw.match(/^\s*(?:option\s*)?([a-d])\s*[).:]?\s*$/i);
  if (letterMatch) {
    const letter = letterMatch[1].toLowerCase();
    const opt = parseMcqOptions(question).find((o) => o.letter === letter);
    if (opt) return { text: `${letter}) ${opt.label}`, matched: true };
    return { text: letter, matched: true };
  }
  return { text: raw, matched: true };
}

function exactQuestionForImage(imageId, question) {
  const pair = pairForImageId(lastCatalog, imageId) || pairForImageId(MODEL1_FALLBACK_PAIRS, imageId);
  if (pair && canonicalQuestion(pair.question) === canonicalQuestion(question)) {
    return pair.question;
  }
  return question;
}

export async function queryModel1Vqa(question, images) {
  const imageId = resolveModel1ImageId(images);
  if (!imageId) {
    return {
      model: 'geochat',
      confidence: 0,
      responseTime: '0.0',
      text: 'Attach a satellite scene, then ask a question about what is in the image.',
      evidence: 'No scene was attached to this query.',
    };
  }

  const t0 = performance.now();
  const res = await fetch(`${model1ApiBase()}/model1/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_id: imageId,
      question: exactQuestionForImage(imageId, question),
    }),
  });
  if (!res.ok) throw new Error(`Model 1 request failed (${res.status})`);
  const data = await res.json();
  const { text, matched } = formatAnswer(data.answer ?? data.text ?? '', question);
  const elapsed = ((performance.now() - t0) / 1000).toFixed(1);

  if (!matched) {
    return {
      model: 'geochat',
      confidence: 0,
      responseTime: elapsed,
      text,
      evidence: `No ground-truth match for ${imageId} + this question.`,
    };
  }

  return {
    model: 'geochat',
    confidence: 100,
    responseTime: elapsed,
    text,
    evidence: `Scene annotation · ${imageId}`,
  };
}
