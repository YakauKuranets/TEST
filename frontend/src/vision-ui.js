export const drawBoundingBoxes = (canvas, detections = []) => {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#ff3b30';
  ctx.lineWidth = 2;
  ctx.font = '12px Inter, sans-serif';
  detections.forEach((det) => {
    const [x1, y1, x2, y2] = det.bbox || [0, 0, 0, 0];
    const w = Math.max(1, x2 - x1);
    const h = Math.max(1, y2 - y1);
    ctx.strokeRect(x1, y1, w, h);
    ctx.fillText(`${det.class || 'obj'} ${Math.round((det.conf || 0) * 100)}%`, x1 + 2, Math.max(12, y1 - 4));
  });
};

export const scaleCanvasCoordinates = ({ clientX, clientY }, canvasRect, internalSize) => {
  const scaleX = internalSize.width / Math.max(1, canvasRect.width);
  const scaleY = internalSize.height / Math.max(1, canvasRect.height);
  return [
    Math.round((clientX - canvasRect.left) * scaleX),
    Math.round((clientY - canvasRect.top) * scaleY),
  ];
};

export const applyModelLock = (button, available) => {
  if (!button) return;
  if (!available) {
    if (!button.dataset.lockedText) {
      button.dataset.lockedText = button.textContent;
      button.textContent = `🔒 ${button.textContent}`;
    }
    button.disabled = true;
    return;
  }
  button.disabled = false;
  if (button.dataset.lockedText) {
    button.textContent = button.dataset.lockedText;
    delete button.dataset.lockedText;
  }
};

export const withLoadingState = async (button, task, loadingText = 'Обработка...') => {
  const old = button.textContent;
  button.disabled = true;
  button.textContent = loadingText;
  try {
    return await task();
  } finally {
    button.disabled = false;
    button.textContent = old;
  }
};
