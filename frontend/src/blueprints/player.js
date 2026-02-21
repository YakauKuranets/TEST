export const createPlayerBlueprint = () => ({
  name: "player",
  init: ({ elements, state, actions }) => {
    const canvas = document.getElementById('pro-canvas');
    const ctx = canvas.getContext('2d', { alpha: false });
    const video = elements.video;

    // Функция отрисовки кадра из Python (идеальная точность)
    const fetchExactFrame = async () => {
      if (!state.currentVideoFile || !video.paused) return;

      const time = video.currentTime;
      const path = state.currentVideoFile.path;

      try {
        const resp = await fetch(`http://127.0.0.1:8000/api/video/frame?path=${encodeURIComponent(path)}&timestamp=${time}`);
        const blob = await resp.blob();
        const bitmap = await createImageBitmap(blob);

        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        ctx.drawImage(bitmap, 0, 0);
        actions.recordLog("pro-render", `Точный RAW-кадр на ${time}s`);
      } catch (e) {
        console.warn("Python Frame Server недоступен, фоллбек на видео", e);
      }
    };

    // Плавное воспроизведение через стандартный движок (60 FPS)
    const renderLoop = () => {
      if (!video.paused && !video.ended) {
        if (video.videoWidth > 0) {
          if (canvas.width !== video.videoWidth) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
          }
          ctx.drawImage(video, 0, 0);
        }
        requestAnimationFrame(renderLoop);
      }
    };

    // Привязываем события
    video.addEventListener('play', () => renderLoop());

    // Как только пауза или перемотка — запрашиваем RAW кадр у Python
    video.addEventListener('pause', () => fetchExactFrame());
    video.addEventListener('seeked', () => fetchExactFrame());

    // Управление скоростью
    elements.speedInput.addEventListener("input", actions.updateSpeed);

    // Покадровая перемотка (теперь идеальная)
    elements.frameBack.addEventListener("click", () => {
      video.pause();
      video.currentTime = Math.max(0, video.currentTime - 1 / 30);
    });

    elements.frameForward.addEventListener("click", () => {
      video.pause();
      video.currentTime = Math.min(video.duration, video.currentTime + 1 / 30);
    });

    // Масштабирование (Zoom)
    elements.viewerSurface.addEventListener("wheel", (e) => {
      e.preventDefault();
      const delta = Math.sign(e.deltaY) * -0.1;
      state.zoomLevel = Math.min(10, Math.max(0.1, (state.zoomLevel || 1) + delta));
      canvas.style.transform = `scale(${state.zoomLevel})`;
    });
  },
});