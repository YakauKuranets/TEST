export const createAiHubBlueprint = () => ({
  name: 'aiHub',
  init: ({ elements }) => {
    const PORT = window.API_PORT || 8000;
    const API_BASE = `http://127.0.0.1:${PORT}/api`;

    const modelContainer = document.getElementById('ai-hub-models');
    const updatesBtn = document.getElementById('check-model-updates');
    const updatesStatus = document.getElementById('model-updates-status');
    const progressEl = document.getElementById('vram-progress') || document.querySelector('.progress-fill');
    const downloadAllBtn = document.getElementById('download-all-models');
    const settingsTabs = Array.from(document.querySelectorAll('.settings-tab'));
    const settingsPanels = Array.from(document.querySelectorAll('.settings-panel'));

    let manifest = {};
    let statusMap = {};

    const showToast = (message, type = 'warning') => {
      let container = document.querySelector('.toast-container');
      if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
      }
      const toast = document.createElement('div');
      toast.className = `toast toast--${type}`;
      toast.textContent = message;
      container.appendChild(toast);
      setTimeout(() => toast.remove(), 3500);
    };

    const safeRequest = async (url, options = {}) => {
      const resp = await fetch(url, options);
      const payload = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(payload?.detail || payload?.error || `${resp.status} ${resp.statusText}`);
      }
      return payload;
    };

    const normalizeModelId = (id) => {
      const aliases = {
        realesrgan: 'realesrgan_x4',
        segment_anything: 'sam2',
        ocr: 'paddle_ocr',
        face_id: 'insightface',
      };
      return aliases[id] || id;
    };

    const updateLocks = () => {
      document.querySelectorAll('[data-requires-model]').forEach((btn) => {
        const modelId = normalizeModelId(btn.getAttribute('data-requires-model'));
        const installed = Boolean(statusMap[modelId] || statusMap[btn.getAttribute('data-requires-model')]);
        if (!installed) {
          if (btn.id === 'ai-sr-apply' && !btn.dataset.lockedText) {
            btn.dataset.lockedText = btn.textContent;
            btn.textContent = `🔒 ${btn.textContent}`;
          }
          btn.classList.add('locked-tool', 'is-locked');
          btn.disabled = true;
          if (!btn._lockedHandler) {
            btn._lockedHandler = (e) => {
              e.preventDefault();
              e.stopImmediatePropagation();
              showToast('Модуль не установлен. Перейдите в настройки', 'warning');
            };
            btn.addEventListener('click', btn._lockedHandler, true);
          }
        } else {
          btn.classList.remove('locked-tool', 'is-locked');
          btn.disabled = false;
          if (btn.id === 'ai-sr-apply' && btn.dataset.lockedText) {
            btn.textContent = btn.dataset.lockedText;
            delete btn.dataset.lockedText;
          }
          if (btn._lockedHandler) {
            btn.removeEventListener('click', btn._lockedHandler, true);
            btn._lockedHandler = null;
          }
        }
      });
    };

    const renderManifest = () => {
      if (!modelContainer) return;
      const sections = Object.entries(manifest);
      if (!sections.length) {
        modelContainer.innerHTML = '<div class="muted">Манифест моделей недоступен</div>';
        return;
      }

      modelContainer.innerHTML = sections.map(([category, models]) => {
        const title = category[0].toUpperCase() + category.slice(1);
        const cards = models.map((m) => {
          const installed = Boolean(statusMap[m.id]);
          return `
            <div class="model-card" data-model-id="${m.id}" data-model-file="${m.file || ''}" data-model-url="${m.url || ''}">
              <div class="model-card__info">
                <div class="model-card__name">${m.name}</div>
                <div class="model-card__meta">${m.desc || ''}</div>
              </div>
              <span class="model-card__state ${installed ? 'model-card__state--active' : 'model-card__state--locked'}">
                ${installed ? 'Status: Installed' : 'Status: Missing 🔒'}
              </span>
              <div class="model-card__actions">
                <button class="btn-ghost btn-xs" data-action="${installed ? 'delete' : 'download'}">${installed ? 'Delete' : 'Download'}</button>
              </div>
            </div>
          `;
        }).join('');
        return `<div class="settings-section"><h3>${title}</h3>${cards}</div>`;
      }).join('');

      modelContainer.querySelectorAll('button[data-action]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const card = btn.closest('.model-card');
          if (!card) return;
          const id = card.dataset.modelId;
          const file = card.dataset.modelFile;
          const url = card.dataset.modelUrl;
          const action = btn.dataset.action;
          try {
            if (action === 'download') {
              if (window.electronAPI?.downloadModel) {
                await window.electronAPI.downloadModel({ id, url, filename: file });
              } else {
                await safeRequest(`${API_BASE}/system/models/${encodeURIComponent(id)}/download`, { method: 'POST' });
              }
              showToast(`Скачивание запущено: ${id}`, 'success');
            } else if (action === 'delete') {
              if (window.electronAPI?.deleteModel) {
                await window.electronAPI.deleteModel({ id, file });
              } else {
                await safeRequest(`${API_BASE}/system/models/${encodeURIComponent(id)}`, { method: 'DELETE' });
              }
              showToast(`Удалено: ${id}`, 'success');
              await refreshStatus();
            }
          } catch (e) {
            showToast(`Ошибка операции: ${e.message}`, 'error');
          }
        });
      });
    };

    const refreshStatus = async () => {
      try {
        if (window.electronAPI?.checkModels) {
          statusMap = await window.electronAPI.checkModels();
        } else {
          statusMap = await safeRequest(`${API_BASE}/system/models-status`);
        }
        updateLocks();
        renderManifest();
      } catch (e) {
        if (modelContainer) modelContainer.innerHTML = `<div class="muted">Ошибка статусов: ${e.message}</div>`;
      }
    };

    const refreshConfig = async () => {
      try {
        manifest = await safeRequest(`${API_BASE}/system/models-config`);
      } catch {
        manifest = {};
      }
      await refreshStatus();
    };

    const checkUpdates = async () => {
      await refreshStatus();
      if (!updatesStatus) return;
      const missing = Object.values(statusMap).filter((v) => !v).length;
      updatesStatus.textContent = missing ? `Отсутствует моделей: ${missing}` : 'Все модели установлены';
    };

    const activateSettingsTab = (tabName) => {
      settingsTabs.forEach((tab) => {
        tab.classList.toggle('is-active', tab.dataset.settingsTab === tabName);
        tab.classList.toggle('active', tab.dataset.settingsTab === tabName);
      });
      settingsPanels.forEach((panel) => {
        panel.classList.toggle('is-active', panel.dataset.settingsPanel === tabName);
        panel.classList.toggle('active', panel.dataset.settingsPanel === tabName);
      });
    };

    settingsTabs.forEach((tab) => tab.addEventListener('click', () => activateSettingsTab(tab.dataset.settingsTab)));
    activateSettingsTab('models');

    updatesBtn?.addEventListener('click', checkUpdates);
    downloadAllBtn?.addEventListener('click', async () => {
      const tasks = Object.entries(manifest).flatMap(([, models]) => models.map((m) => ({ id: m.id, url: m.url, file: m.file })));
      if (window.electronAPI?.downloadAllModels) {
        await window.electronAPI.downloadAllModels(tasks);
        showToast(`Очередь загрузки: ${tasks.length} моделей`, 'success');
      }
    });

    if (window.electronAPI?.onDownloadProgress) {
      window.electronAPI.onDownloadProgress(({ id, percent, speed }) => {
        if (progressEl) {
          const p = Math.max(0, Math.min(100, Number(percent || 0)));
          progressEl.style.width = `${p}%`;
        }
        if (percent >= 100) {
          statusMap[id] = true;
          updateLocks();
          renderManifest();
        }
      });
    }
    if (window.electronAPI?.onModelStatusChanged) {
      window.electronAPI.onModelStatusChanged(({ id, installed }) => {
        statusMap[id] = !!installed;
        updateLocks();
        renderManifest();
      });
    }

    const vramContainer = document.getElementById('vram-monitor-container');
    let sseSource;
    const connectHardwareStream = () => {
      if (sseSource) sseSource.close();
      sseSource = new EventSource(`${API_BASE}/system/hardware-stream`);
      sseSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const used = data.vram_allocated_mb || data.ram_used_mb || 0;
          const total = data.vram_total_mb || data.ram_total_mb || 1;
          const percent = Math.max(0, Math.min(100, (used / total) * 100));
          if (vramContainer) {
            vramContainer.innerHTML = `<div class="vram-header"><span>GPU VRAM (${data.device || 'CPU'})</span><span>${used} / ${total} MB</span></div><div class="vram-bar-bg"><div class="vram-bar-fill" style="width:${percent}%"></div></div>`;
          }
        } catch {}
      };
    };

    connectHardwareStream();
    refreshConfig();
    elements.settingsBtn?.addEventListener('click', refreshConfig);
    document.getElementById('launcher-settings-btn')?.addEventListener('click', refreshConfig);
  }
});
