export const applySplitClip = (compareResultCanvas, value) => {
  const numeric = Math.max(0, Math.min(100, Number(value) || 0));
  compareResultCanvas.style.clipPath = `inset(0 ${100 - numeric}% 0 0)`;
  return compareResultCanvas.style.clipPath;
};

export const renderHeatmapOverlay = async (overlayCanvas, heatmapBase64) => {
  const ctx = overlayCanvas.getContext('2d');
  const prev = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'screen';
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = `data:image/png;base64,${heatmapBase64}`;
  });
  ctx.drawImage(img, 0, 0, overlayCanvas.width, overlayCanvas.height);
  ctx.globalCompositeOperation = prev;
};

export const initSplitView = ({ elements }) => {
  const original = elements.compareOriginalCanvas;
  const result = elements.compareResultCanvas;
  const slider = elements.splitSlider;
  if (!original || !result || !slider) return;

  const syncSize = () => {
    if (!original.width || !original.height) {
      original.width = elements.canvas?.width || 1;
      original.height = elements.canvas?.height || 1;
    }
    result.width = original.width;
    result.height = original.height;
  };

  slider.addEventListener('input', () => {
    syncSize();
    applySplitClip(result, slider.value);
  });

  syncSize();
  applySplitClip(result, slider.value);
};
