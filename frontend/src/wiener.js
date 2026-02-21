export const renderBase64ToCanvas = (canvas, base64Image) => new Promise((resolve, reject) => {
  const ctx = canvas.getContext('2d');
  const img = new Image();
  img.onload = () => {
    if (!canvas.width || !canvas.height) {
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    resolve();
  };
  img.onerror = () => reject(new Error('Не удалось декодировать результат AI'));
  img.src = `data:image/png;base64,${base64Image}`;
});

export const bindWienerDeblur = ({ elements, state, actions, api }) => {
  const btn = elements.blurFixBtn;
  const lengthEl = elements.blurFixSlider;
  const angleEl = elements.blurFixAngle;
  const canvas = elements.photoCanvas;
  if (!btn || !lengthEl || !angleEl || !canvas) return;

  btn.addEventListener('click', async (e) => {
    const target = e.currentTarget || btn;
    const length = Number(lengthEl.value);
    const angle = Number(angleEl.value);
    const originalText = target.innerText;

    target.disabled = true;
    target.innerText = '⏳ Вычисление...';

    try {
      if (!state.originalPhotoBase64) {
        throw new Error('Сначала загрузите фото в режим Photo');
      }
      const resultBase64 = await api.applyWienerDeblur(state.originalPhotoBase64, length, angle);
      await renderBase64ToCanvas(canvas, resultBase64);
      state.photoResultImageDataUrl = canvas.toDataURL('image/png');
      actions.recordLog('forensic-wiener', `Удаление смаза: длина ${length}px, угол ${angle}°`);
    } catch (error) {
      actions.showToast(`Ошибка деконволюции: ${error.message}`, 'error');
    } finally {
      target.disabled = false;
      target.innerText = originalText;
    }
  });
};
