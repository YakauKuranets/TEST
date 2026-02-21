/**
 * PLAYE Studio Pro — AI Hub Blueprint (Phase 2).
 *
 * Manages:
 * - SSE connection to /api/system/hardware-stream
 * - VRAM bar rendering (green/yellow/red)
 * - Smart locks on toolbar buttons (data-requires-model)
 * - Toast notifications for locked tools
 * - Model cards in AI Hub (settings modal)
 * - Download/Load/Unload actions
 */

export const createAiHubBlueprint = () => ({
  name: "aiHub",
  init: ({ elements, state, actions }) => {
    const PORT = () => window.API_PORT || 8000;
    const API = (p) => `http://127.0.0.1:${PORT()}${p}`;

    // ═══ TOAST SYSTEM ═══
    let toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.className = 'toast-container';
      document.body.appendChild(toastContainer);
    }

    function showToast(message, type = 'warning') {
      const t = document.createElement('div');
      t.className = `toast toast--${type}`;
      t.textContent = message;
      toastContainer.appendChild(t);
      setTimeout(() => t.remove(), 4000);
    }

    // ═══ SMART LOCKS ═══
    function updateLocks(modelStates) {
      document.querySelectorAll('[data-requires-model]').forEach(btn => {
        const modelId = btn.dataset.requiresModel;
        const st = modelStates[modelId] || 'not_installed';

        btn.classList.remove('locked-tool', 'downloading-tool', 'hardware-locked');

        if (st === 'not_installed') {
          btn.classList.add('locked-tool');
        } else if (st === 'downloading') {
          btn.classList.add('downloading-tool');
        } else if (st === 'hardware_locked') {
          btn.classList.add('hardware-locked');
        }
        // 'on_disk' and 'in_vram' = unlocked (no class)
      });
    }

    // Intercept clicks on locked tools
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.locked-tool');
      if (btn) {
        e.preventDefault();
        e.stopPropagation();
        const modelId = btn.dataset.requiresModel || 'unknown';
        showToast(`Требуется загрузка модуля "${modelId}". Откройте Настройки → AI Hub.`, 'warning');
      }
    }, true);

    // ═══ VRAM BAR ═══
    function renderVramBar(metrics) {
      const bar = document.getElementById('vram-bar-fill');
      const label = document.getElementById('vram-bar-label');
      if (!bar || !label) return;

      const pct = metrics.vram_percent || 0;
      const alloc = metrics.vram_allocated_mb || 0;
      const total = metrics.vram_total_mb || 0;

      bar.style.width = `${Math.min(pct, 100)}%`;
      bar.className = 'vram-bar__fill';
      if (pct < 60) bar.classList.add('vram-bar__fill--green');
      else if (pct < 85) bar.classList.add('vram-bar__fill--yellow');
      else bar.classList.add('vram-bar__fill--red');

      if (total > 0) {
        label.textContent = `${alloc.toFixed(0)} / ${total.toFixed(0)} MB (${pct.toFixed(0)}%)`;
      } else {
        label.textContent = metrics.has_cuda ? 'N/A' : 'CPU Only — VRAM N/A';
      }
    }

    // ═══ MODEL CARDS (AI Hub in settings) ═══
    function renderModelCards(models) {
      const container = document.getElementById('ai-hub-models');
      if (!container) return;

      container.innerHTML = '';
      models.forEach(m => {
        const stateClass = {
          'in_vram': 'model-card__state--active',
          'on_disk': 'model-card__state--disk',
          'not_installed': 'model-card__state--missing',
          'downloading': 'model-card__state--downloading',
          'hardware_locked': 'model-card__state--locked',
        }[m.state] || 'model-card__state--missing';

        const stateLabel = {
          'in_vram': '🟢 В памяти',
          'on_disk': '⚪ На диске',
          'not_installed': '🔴 Не скачан',
          'downloading': '🟡 Скачивается',
          'hardware_locked': '🛑 Нет GPU',
        }[m.state] || m.state;

        const card = document.createElement('div');
        card.className = 'model-card';
        card.innerHTML = `
          <div class="model-card__info">
            <div class="model-card__name">${m.name}</div>
            <div class="model-card__meta">${m.description} · ${m.size_human}</div>
            ${m.state === 'downloading' ? `<div class="model-card__progress"><div class="model-card__progress-fill" style="width:${(m.download_progress * 100).toFixed(0)}%"></div></div>` : ''}
          </div>
          <span class="model-card__state ${stateClass}">${stateLabel}</span>
          <div class="model-card__actions">
            ${m.state === 'not_installed' ? `<button class="btn-ghost btn-xs" data-action="download" data-model="${m.id}">☁️ Скачать</button>` : ''}
            ${m.state === 'on_disk' ? `<button class="btn-ghost btn-xs" data-action="load" data-model="${m.id}">🟢 Загрузить</button>` : ''}
            ${m.state === 'in_vram' ? `<button class="btn-ghost btn-xs" data-action="unload" data-model="${m.id}">⏏ Выгрузить</button>` : ''}
            ${m.state !== 'not_installed' && m.state !== 'downloading' && m.state !== 'hardware_locked' ? `<button class="btn-ghost btn-xs" data-action="delete" data-model="${m.id}">🗑</button>` : ''}
          </div>
        `;
        container.appendChild(card);
      });

      // Bind action buttons
      container.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const action = btn.dataset.action;
          const modelId = btn.dataset.model;
          btn.disabled = true;
          try {
            if (action === 'download') {
              await fetch(API(`/api/system/models/${modelId}/download`), { method: 'POST' });
              showToast(`Скачивание ${modelId} начато`, 'success');
            } else if (action === 'load') {
              const r = await fetch(API(`/api/system/models/${modelId}/load`), { method: 'POST' });
              if (r.ok) showToast(`${modelId} загружен в VRAM`, 'success');
              else showToast(`Ошибка загрузки ${modelId}`, 'error');
            } else if (action === 'unload') {
              await fetch(API(`/api/system/models/${modelId}/unload`), { method: 'POST' });
              showToast(`${modelId} выгружен`, 'success');
            } else if (action === 'delete') {
              if (confirm(`Удалить веса ${modelId}?`)) {
                await fetch(API(`/api/system/models/${modelId}`), { method: 'DELETE' });
                showToast(`${modelId} удалён`, 'success');
              }
            }
            // Refresh immediately
            fetchModels();
          } catch (e) {
            showToast(e.message, 'error');
          }
          btn.disabled = false;
        });
      });
    }

    // ═══ FETCH MODELS (REST fallback) ═══
    async function fetchModels() {
      try {
        const r = await fetch(API('/api/system/models'));
        const data = await r.json();
        if (data.models) renderModelCards(data.models);
        if (data.hardware) {
          renderVramBar(data.hardware);
          // Update locks
          const states = {};
          data.models.forEach(m => { states[m.id] = m.state; });
          updateLocks(states);
        }
      } catch { /* API offline */ }
    }

    // ═══ SSE CONNECTION ═══
    let eventSource = null;
    function connectSSE() {
      if (eventSource) eventSource.close();
      try {
        eventSource = new EventSource(API('/api/system/hardware-stream'));
        eventSource.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            renderVramBar(data);
            if (data.models) updateLocks(data.models);
          } catch {}
        };
        eventSource.onerror = () => {
          eventSource.close();
          eventSource = null;
          // Retry in 10s
          setTimeout(connectSSE, 10000);
        };
      } catch {
        setTimeout(connectSSE, 10000);
      }
    }

    // ═══ INIT ═══
    // Initial fetch
    fetchModels();
    // SSE for real-time
    connectSSE();
    // Periodic fallback
    setInterval(fetchModels, 15000);

    // Expose for other blueprints
    if (actions) {
      actions.showToast = showToast;
      actions.fetchModels = fetchModels;
    }
  }
});
