const loadImageBitmap = async (file) => {
  if ("createImageBitmap" in window) {
    return createImageBitmap(file);
  }

  return await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Не удалось загрузить изображение"));
    image.src = URL.createObjectURL(file);
  });
};

export const createPhotoBlueprint = () => ({
  name: "photo",
  init: ({ elements, actions, state }) => {
    if (!elements.photoSourceInput || !elements.photoBlendButton || !elements.photoCanvas) return;

    const canvas = elements.photoCanvas;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const setStatus = (text) => {
      if (elements.photoStatus) {
        elements.photoStatus.textContent = text;
      }
    };

    const onFileSelect = async () => {
      const file = elements.photoSourceInput.files?.[0];
      if (!file) return;

      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
        reader.readAsDataURL(file);
      });

      await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          canvas.style.display = "block";
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          state.photoOriginalImageDataUrl = dataUrl;
          state.photoResultImageDataUrl = dataUrl;
          if (canvas.width > 0) {
            setStatus(`Загружено: ${file.name} (${canvas.width}×${canvas.height})`);
          }
          resolve();
        };
        img.onerror = () => reject(new Error("Не удалось декодировать изображение"));
        img.src = dataUrl;
      });
    };

    const blendPhotos = async () => {
      const files = Array.from(elements.photoSourceInput.files || []);
      if (!files.length) {
        setStatus("Выберите минимум 1 изображение.");
        return;
      }

      const bitmaps = await Promise.all(files.map((file) => loadImageBitmap(file)));
      const width = Math.min(...bitmaps.map((bitmap) => bitmap.width));
      const height = Math.min(...bitmaps.map((bitmap) => bitmap.height));

      canvas.width = width;
      canvas.height = height;
      canvas.style.display = "block";

      const accumulator = new Float32Array(width * height * 4);

      bitmaps.forEach((bitmap) => {
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(bitmap, 0, 0, width, height);
        const data = ctx.getImageData(0, 0, width, height).data;
        for (let i = 0; i < data.length; i += 1) {
          accumulator[i] += data[i];
        }
      });

      const output = ctx.createImageData(width, height);
      for (let i = 0; i < output.data.length; i += 1) {
        output.data[i] = Math.round(accumulator[i] / bitmaps.length);
      }
      ctx.putImageData(output, 0, 0);

      state.photoResultImageDataUrl = canvas.toDataURL("image/png");

      setStatus(`Готово: объединено ${files.length} кадров (${width}×${height}).`);
      actions.recordLog("photo-reconstruct", "Собрана реконструкция из набора кадров", {
        sources: files.map((file) => file.name),
        width,
        height,
      });
    };

    elements.photoSourceInput.addEventListener("change", () => {
      onFileSelect().catch((error) => setStatus(error.message || "Ошибка загрузки фото"));
    });

    elements.photoBlendButton.addEventListener("click", () => {
      blendPhotos().catch((error) => {
        setStatus(error.message || "Ошибка реконструкции фото.");
      });
    });

    elements.photoDownloadButton?.addEventListener("click", () => {
      if (!canvas.width || !canvas.height) {
        setStatus("Сначала соберите реконструкцию.");
        return;
      }
      const link = document.createElement("a");
      link.download = `photo-reconstruct-${Date.now()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      actions.recordLog("photo-download", "Скачана реконструкция кадра");
    });
  },
});
