const drawComparison = async (canvas, leftSource, rightSource, split) => {
  const toBitmap = async (source) => {
    if (source instanceof File || source instanceof Blob) return createImageBitmap(source);
    if (typeof source === 'string') {
      const img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Не удалось загрузить изображение для сравнения'));
        el.src = source;
      });
      const tmp = document.createElement('canvas');
      tmp.width = img.naturalWidth;
      tmp.height = img.naturalHeight;
      tmp.getContext('2d').drawImage(img, 0, 0);
      return createImageBitmap(tmp);
    }
    throw new Error('Unsupported source type');
  };

  const [leftBitmap, rightBitmap] = await Promise.all([
    toBitmap(leftSource),
    toBitmap(rightSource),
  ]);

  const width = Math.min(leftBitmap.width, rightBitmap.width);
  const height = Math.min(leftBitmap.height, rightBitmap.height);

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  const splitX = Math.floor(width * split);

  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, splitX, height);
  ctx.clip();
  ctx.drawImage(leftBitmap, 0, 0, width, height);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.rect(splitX, 0, width - splitX, height);
  ctx.clip();
  ctx.drawImage(rightBitmap, 0, 0, width, height);
  ctx.restore();

  ctx.strokeStyle = '#22d3ee';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(splitX, 0);
  ctx.lineTo(splitX, height);
  ctx.stroke();
};

export const createCompareBlueprint = () => ({
  name: 'compare',
  init: ({ elements, actions, state }) => {
    if (!elements.compareCanvas) return;

    const redraw = async () => {
      const split = Number.parseFloat(elements.compareSplitInput?.value || '50') / 100;

      const leftFile = elements.compareLeftInput?.files?.[0];
      const rightFile = elements.compareRightInput?.files?.[0];

      const leftSource = leftFile || state.photoOriginalImageDataUrl;
      const rightSource = rightFile || state.photoResultImageDataUrl;

      if (!leftSource || !rightSource) {
        if (elements.compareStatus) elements.compareStatus.textContent = 'Нет пары изображений для сравнения';
        return;
      }

      await drawComparison(elements.compareCanvas, leftSource, rightSource, split);
      if (elements.compareSplitValue) {
        elements.compareSplitValue.textContent = `${Math.round(split * 100)}%`;
      }
      if (elements.compareStatus) {
        elements.compareStatus.textContent = 'Сравнение обновлено.';
      }
    };

    const render = () => {
      redraw().catch(() => {
        if (elements.compareStatus) {
          elements.compareStatus.textContent = 'Не удалось отрисовать сравнение.';
        }
      });
    };

    elements.compareRenderButton?.addEventListener('click', () => {
      render();
      actions.recordLog('compare-render', 'Обновлено side-by-side сравнение кадров');
    });

    elements.compareRenderToolbarButton?.addEventListener('click', () => {
      render();
      actions.recordLog('compare-render', 'Сравнение из панели инструментов');
    });

    elements.compareSplitInput?.addEventListener('input', render);
  },
});
