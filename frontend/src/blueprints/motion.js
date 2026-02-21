export const createMotionBlueprint = () => ({
  name: "motion",
  init: ({ elements, state, actions }) => {

    // --- НОВЫЙ КОД ЗАПУСКА ВИДЕО (ZERO-COPY) ---
    const initVideoTemporalPipeline = () => {
      if (!elements.temporalDenoiseButton) return;

      elements.temporalDenoiseButton.addEventListener('click', async () => {
        if (!state.currentVideoFile) {
          actions.recordLog('temporal-denoise', 'Файл не выбран');
          alert('Пожалуйста, выберите видео-файл из списка слева.');
          return;
        }

        // МАГИЯ ELECTRON: Получаем абсолютный путь к файлу на диске!
        const inputPath = state.currentVideoFile.path;
        if (!inputPath) {
          alert("Ошибка: Не удалось получить путь к файлу. Убедитесь, что запускаете приложение через Electron, а не просто в браузере.");
          return;
        }

        // Автоматически генерируем путь для сохранения в ту же папку
        const outputPath = inputPath.replace(/(\.[^\.]+)$/, '_processed$1');

        elements.temporalDenoiseButton.disabled = true;

        try {
          // Отправляем только пути (JSON), никаких тяжелых Base64 или FormData!
          const payload = {
            file_path: inputPath,
            output_path: outputPath,
            operations: ['denoise'], // Сюда потом можно добавить 'upscale'
            fps: parseFloat(elements.fpsPicker?.value || '30.0')
          };

          const resp = await fetch('http://127.0.0.1:8000/api/job/video/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

          actions.recordLog('render-start', `Начат рендер в файл: ${outputPath}`);

          // Показываем пользователю, что процесс пошел
          alert(`✅ Рендер успешно запущен!\n\nОригинал: ${inputPath}\nРезультат будет сохранен здесь:\n${outputPath}\n\nПожалуйста, посмотрите прогресс обработки в терминале (консоли), где запущен Python.`);

        } catch (err) {
          actions.recordLog('temporal-denoise-error', err.message);
          alert("❌ Ошибка запуска: " + err.message);
        } finally {
          // Через 3 секунды снова делаем кнопку активной
          setTimeout(() => { elements.temporalDenoiseButton.disabled = false; }, 3000);
        }
      });
    };

    // --- СТАРЫЙ КОД ДЕТЕКТОРА ДВИЖЕНИЯ (Оставляем для работы интерфейса) ---
    const getSensitivity = () => Number.parseFloat(elements.motionSensitivity?.value) || 50;
    const getCooldown = () => Number.parseFloat(elements.motionCooldown?.value) || 1.0;

    const syncRangeValue = (input, display) => {
      if (input && display) display.textContent = input.value;
    };

    if (elements.motionStart && elements.motionStop) {
        elements.motionStart.addEventListener('click', () => {
          state.motionDetectionActive = true;
          elements.motionStart.disabled = true;
          elements.motionStop.disabled = false;
          if (elements.motionIndicator) elements.motionIndicator.classList.remove('active');
          actions.recordLog('motion-start', 'Запуск детектора движения');
        });

        elements.motionStop.addEventListener('click', () => {
          state.motionDetectionActive = false;
          elements.motionStart.disabled = false;
          elements.motionStop.disabled = true;
          if (elements.motionIndicator) elements.motionIndicator.classList.remove('active');
          actions.recordLog('motion-stop', 'Остановка детектора движения');
        });
    }

    if (elements.motionSensitivity && elements.motionSensitivityValue) {
        syncRangeValue(elements.motionSensitivity, elements.motionSensitivityValue);
        elements.motionSensitivity.addEventListener('input', () => syncRangeValue(elements.motionSensitivity, elements.motionSensitivityValue));
        elements.motionSensitivity.addEventListener('change', () => actions.recordLog('motion-sensitivity', 'Чувствительность детектора', { value: getSensitivity() }));
    }

    if (elements.motionCooldown && elements.motionCooldownValue) {
        syncRangeValue(elements.motionCooldown, elements.motionCooldownValue);
        elements.motionCooldown.addEventListener('input', () => syncRangeValue(elements.motionCooldown, elements.motionCooldownValue));
        elements.motionCooldown.addEventListener('change', () => actions.recordLog('motion-cooldown', 'Интервал маркеров', { value: getCooldown() }));
    }

    // Инициализируем наш новый быстрый пайплайн
    initVideoTemporalPipeline();
  },
});