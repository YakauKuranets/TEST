/**
 * PLAYE Studio Pro — AI Hub Blueprint (Phase 2).
 * * Реактивный мониторинг VRAM, SSE стрим аппаратной нагрузки
 * и система "Умных замков" для нескачанных нейросетей.
 */

export const createAiHubBlueprint = () => ({
  name: "aiHub",
  init: ({ elements, state, actions }) => {
    const PORT = window.API_PORT || 8000;
    const API_BASE = `http://127.0.0.1:${PORT}/api`;

    // ═══ 1. СИСТЕМА УВЕДОМЛЕНИЙ (TOAST) ═══
    let toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.className = 'toast-container';
      document.body.appendChild(toastContainer);
    }

    const showToast = (message, type = 'warning') => {
      const t = document.createElement('div');
      t.className = `toast toast--${type}`;
      t.innerHTML = `<span>${type === 'warning' ? '🔒' : '✅'}</span> ${message}`;
      toastContainer.appendChild(t);

      // Плавное исчезновение
      setTimeout(() => {
        t.style.opacity = '0';
        setTimeout(() => t.remove(), 300);
      }, 3500);
    };

    // ═══ 2. УМНЫЕ ЗАМКИ (SMART LOCKS) ═══
    const updateLocks = (modelStates) => {
      document.querySelectorAll('[data-requires-model]').forEach(btn => {
        const modelId = btn.getAttribute('data-requires-model');
        const status = modelStates[modelId] || 'not_installed';

        if (status === 'not_installed' || status === 'downloading') {
          btn.classList.add('locked-tool');

          // Если перехватчик еще не висит, вешаем его на стадии Capture
          if (!btn._lockedHandler) {
            btn._lockedHandler = (e) => {
              e.preventDefault();
              e.stopImmediatePropagation(); // Блокируем вызов родных блюпринтов
              showToast(`Требуется ИИ-модель: ${modelId}. Скачайте её в Настройках.`, 'warning');
            };
            btn.addEventListener('click', btn._lockedHandler, true);
          }
        } else {
          // Если модель скачана — снимаем замок
          btn.classList.remove('locked-tool');
          if (btn._lockedHandler) {
            btn.removeEventListener('click', btn._lockedHandler, true);
            btn._lockedHandler = null;
          }
        }
      });
    };

    // ═══ 3. РЕНДЕР VRAM-БАРА ═══
    const vramContainer = document.getElementById('vram-monitor-container');
    const renderVramBar = (metrics) => {
      if (!vramContainer || !metrics) return;

      // Считаем занятую память
      const used = (metrics.total_memory_mb || 0) - (metrics.free_memory_mb || 0);
      const total = metrics.total_memory_mb || 1;
      const percent = (used / total) * 100;

      let colorClass = 'vram-safe';
      if (percent > 70) colorClass = 'vram-warn';
      if (percent > 90) colorClass = 'vram-critical';

      vramContainer.innerHTML = `
        <div class="vram-header">
          <span>GPU VRAM (${metrics.device_name || 'CPU Mode'})</span>
          <span>${used} / ${total} MB</span>
        </div>
        <div class="vram-bar-bg">
          <div class="vram-bar-fill ${colorClass}" style="width: ${Math.min(percent, 100)}%"></div>
        </div>
        ${percent > 90 ? '<div class="vram-alert">⚠️ Критическая нагрузка. Возможна авто-очистка кэша.</div>' : ''}
      `;
    };

    // ═══ 4. ПОДКЛЮЧЕНИЕ SSE ═══
    let sseSource = null;
    const connectHardwareStream = () => {
      if (sseSource) sseSource.close();

      sseSource = new EventSource(`${API_BASE}/system/hardware-stream`);

      sseSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Отрисовываем VRAM и железо
          renderVramBar(data);

          // Обновляем статусы моделей (замочки)
          if (data.models) {
            updateLocks(data.models);
            state.modelsStatus = data.models; // Синхронизируем с State
          }
        } catch (e) {
          console.error("SSE Parse error:", e);
        }
      };

      sseSource.onerror = () => {
        sseSource.close();
        // Пытаемся переподключиться, если бэкенд перезагружается
        setTimeout(connectHardwareStream, 5000);
      };
    };

    // Запуск стрима
    connectHardwareStream();
  }
});