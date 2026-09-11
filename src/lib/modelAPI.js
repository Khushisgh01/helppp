import { decideModel } from './modelRouting';
import { mockGrounding, mockBitCD } from './mockModelData';
import { queryModel1Vqa } from './model1API';

/* ====================================================================
 * modelApi.js — THIS is the file to edit when connecting your real
 * trained models. Nothing in chat.jsx needs to change: it only calls
 * getModelReply(query, images) and expects back one of the three
 * shapes documented below. As long as your real call functions return
 * that shape, the UI, the PDF report, and Supabase persistence all
 * keep working untouched.
 *
 * Wire up models TWO and THREE one at a time: set only the env var for
 * the model that's ready (e.g. VITE_GROUNDING_API_URL) and leave the
 * others unset — this file automatically falls back to the mock for any
 * model whose URL isn't configured. Model 1 (VQA) is always the
 * BigEarthNet lookup API.
 * ==================================================================== */

const GROUNDING_URL = import.meta.env.VITE_GROUNDING_API_URL;
const BITCD_URL = import.meta.env.VITE_BITCD_API_URL;

/**
 * Routes a query to the right model and returns its reply in the
 * shape the rest of the app expects:
 *
 *   { model, confidence, responseTime, text }                              // geochat
 *   { model, confidence, responseTime, text, detections }                  // grounding
 *   { model, confidence, responseTime, text, changeRegions, changePercent } // bitcd
 *
 * where:
 *   model         'geochat' | 'grounding' | 'bitcd'
 *   confidence    number 0-100
 *   responseTime  string, seconds e.g. "1.4"
 *   text          string, the natural-language answer shown in the chat bubble
 *   detections    [{ id, label, confidence, area, top, left, width, height }]
 *                 top/left/width/height are PERCENTAGES (0-100) of image
 *                 dimensions — that's what positions the bounding boxes
 *                 in <ImageStage>. `id` just needs to be unique per reply.
 *   changeRegions [{ id, label, top, left, width, height }] — same bbox
 *                 convention as detections.
 *   changePercent number 0-100, the bitcd model's overall "extent changed" stat
 *
 * `images` is the array of pending images from chat state — each item
 * has { id, url (blob preview), file (raw File object), date }. Use
 * `.file` to upload the actual bytes to your model's endpoint.
 */
export async function getModelReply(query, images, selectedModel) {
  const model = decideModel(query, images, selectedModel);
  if (model === 'grounding') return callGrounding(query, images);
  if (model === 'bitcd') return callBitCD(query, images);
  return queryModel1Vqa(query, images);
}

/* -------------------------------------------------------------------- */
/* Grounding — object detection / localization on a single scene         */
/* -------------------------------------------------------------------- */
async function callGrounding(query, images) {
  if (!GROUNDING_URL) return mockGrounding(query);

  const t0 = performance.now();
  const form = new FormData();
  form.append('query', query);
  if (images[0]?.file) form.append('image', images[0].file);

  const res = await fetch(GROUNDING_URL, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Grounding request failed (${res.status})`);
  const data = await res.json();

  // TODO: map your model's actual response fields onto this shape.
  // Example assumes your API returns:
  //   { summary: string, boxes: [{ label, score, x, y, w, h, area_km2 }] }
  // where x/y/w/h are already percentages of image dimensions (0-100).
  // If your model returns pixel coordinates instead, convert here using
  // the source image's natural width/height before returning.
  const detections = (data.boxes ?? []).map((b, i) => ({
    id: `det-${i}`,
    label: b.label,
    confidence: Math.round((b.score ?? 0) * 100),
    area: b.area_km2 != null ? String(b.area_km2) : undefined,
    top: b.y,
    left: b.x,
    width: b.w,
    height: b.h,
  }));

  return {
    model: 'grounding',
    confidence: detections.length
      ? Math.round(detections.reduce((s, d) => s + d.confidence, 0) / detections.length)
      : 0,
    responseTime: ((performance.now() - t0) / 1000).toFixed(1),
    text: data.summary ?? `Found ${detections.length} object${detections.length === 1 ? '' : 's'}.`,
    detections,
  };
}

/* -------------------------------------------------------------------- */
/* BIT-CD — change detection between two dated scenes                    */
/* -------------------------------------------------------------------- */
async function callBitCD(query, images) {
  if (!BITCD_URL) return mockBitCD(query, images);

  const t0 = performance.now();
  const form = new FormData();
  form.append('query', query);
  if (images[0]?.file) form.append('image_a', images[0].file);
  if (images[1]?.file) form.append('image_b', images[1].file);

  const res = await fetch(BITCD_URL, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`BIT-CD request failed (${res.status})`);
  const data = await res.json();

  // TODO: map your model's actual response fields onto this shape.
  // Example assumes your API returns:
  //   { summary: string, change_percent: number, confidence: number (0-1),
  //     regions: [{ label, x, y, w, h }] }  (x/y/w/h as percentages)
  const changeRegions = (data.regions ?? []).map((r, i) => ({
    id: `chg-${i}`,
    label: r.label,
    top: r.y,
    left: r.x,
    width: r.w,
    height: r.h,
  }));

  return {
    model: 'bitcd',
    confidence: Math.round((data.confidence ?? 0.85) * 100),
    responseTime: ((performance.now() - t0) / 1000).toFixed(1),
    text: data.summary ?? '',
    changeRegions,
    changePercent: data.change_percent,
  };
}