export const createPlaylistBlueprint = () => ({
  name: "playlist",
  init: ({ elements, state, actions }) => {
    const setVideoSource = (file) => {
      const url = URL.createObjectURL(file);
      elements.video.src = url;
      elements.video.dataset.filename = file.name;
      elements.video.load();
      actions.resetZoom();
      state.clipIn = null;
      state.clipOut = null;
      elements.clipInValue.textContent = actions.formatTime(state.clipIn);
      elements.clipOutValue.textContent = actions.formatTime(state.clipOut);
      actions.recordLog("video-select", `Выбран файл: ${file.name}`, {
        name: file.name,
        size: file.size,
        hash: file.hash || "—",
      });
    };

    const formatFileSize = (bytes) => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    };

    const addToPlaylist = async (file) => {
      const item = document.createElement("li");
      
      // Создать элементы для отображения информации
      const nameSpan = document.createElement("span");
      nameSpan.className = "playlist-item-name";
      nameSpan.textContent = file.name;
      
      const sizeSpan = document.createElement("span");
      sizeSpan.className = "playlist-item-size";
      sizeSpan.textContent = formatFileSize(file.size);
      
      const statusSpan = document.createElement("span");
      statusSpan.className = "playlist-item-status";
      statusSpan.textContent = "⏳ Обработка...";
      
      item.appendChild(nameSpan);
      item.appendChild(sizeSpan);
      item.appendChild(statusSpan);
      elements.playlist.appendChild(item);
      
      // Порог размера файла для хеширования (500 MB)
      const HASH_SIZE_LIMIT = 500 * 1024 * 1024;
      let hash = "—";
      
      try {
        if (file.size < HASH_SIZE_LIMIT) {
          // Хешировать небольшие файлы
          statusSpan.textContent = "🔒 Хеширование...";
          hash = await actions.hashFile(file);
          file.hash = hash;
          
          actions.recordLog("file-hash", `Хэш SHA-256 рассчитан для ${file.name}`, {
            name: file.name,
            hash,
            size: file.size
          });
          
          statusSpan.textContent = "✅ Готов";
        } else {
          // Пропустить хеширование для больших файлов
          const sizeMB = (file.size / 1024 / 1024).toFixed(2);
          console.log(`Файл ${file.name} слишком большой для хеширования (${sizeMB} MB > 500 MB)`);
          
          file.hash = hash;
          
          actions.recordLog("file-skip-hash", `Хеширование пропущено для большого файла ${file.name}`, {
            name: file.name,
            size: file.size,
            reason: "Файл > 500 MB"
          });
          
          statusSpan.textContent = "⚠️ Без хеша";
          statusSpan.title = "Файл слишком большой для хеширования";
        }
      } catch (err) {
        console.error('Ошибка при обработке файла:', err);
        statusSpan.textContent = "❌ Ошибка";
        statusSpan.title = err.message;
        file.hash = hash;
      }
      
      // Добавить в список импортированных файлов
      state.importedFiles.push({
        name: file.name,
        size: file.size,
        type: file.type,
        hash,
      });
      
      // Обработчик клика на файл
      item.addEventListener("click", () => {
        document.querySelectorAll(".playlist li").forEach((node) => {
          node.classList.remove("active");
        });
        item.classList.add("active");
        setVideoSource(file);
      });
      
      // Автоматически выбрать первый файл
      if (!elements.video.src) {
        item.click();
      }
    };

    elements.fileInput.addEventListener("change", (event) => {
      const files = Array.from(event.target.files || []);
      if (files.length) {
        actions.recordLog("video-import", `Импортировано файлов: ${files.length}`, {
          files: files.map((file) => ({
            name: file.name,
            size: file.size,
            type: file.type,
          })),
        });
      }
      files.forEach((file) => {
        addToPlaylist(file);
      });
      elements.fileInput.value = "";
    });
  },
});
