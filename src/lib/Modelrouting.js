/**
 * Which model handles a given turn. Two images => change detection;
 * a Model 1 demo scene (image_id) => VQA lookup; a "where/find/locate"
 * style query => grounding/detection; otherwise the general-purpose VQA path.
 *
 * `images` may be a count (legacy) or the pending-image array.
 */
export function decideModel(query, images, selectedModel) {
  if (selectedModel === 'geochat' || selectedModel === 'grounding' || selectedModel === 'bitcd') {
    return selectedModel;
  }

  const list = Array.isArray(images) ? images : [];
  const imageCount = Array.isArray(images) ? images.length : Number(images) || 0;

  if (imageCount >= 2) return 'bitcd';
  if (list.some((img) => img?.imageId || img?.source === 'model1')) return 'geochat';
  if (/where|find|detect|locate|how many|highlight|show me|point out/i.test(query)) {
    return 'grounding';
  }
  return 'geochat';
}
