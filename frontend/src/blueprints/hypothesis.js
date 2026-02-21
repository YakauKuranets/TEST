const HYPOTHESIS_TEMPLATES = [
  { id: "restore", label: "Face Restore", note: "Артефакты лица / low-light" },
  { id: "superres", label: "Super Resolution", note: "Мелкие детали и номерные зоны" },
  { id: "denoise", label: "Denoise", note: "Шум матрицы / компрессия" },
  { id: "deblur", label: "Deblur", note: "Смаз движения / фокуса" },
  { id: "detect", label: "Detect", note: "Лица / объекты / сцены" },
  { id: "reconstruct3d", label: "3D Reconstruct", note: "Перспектива и глубина сцены" },
];

export const createHypothesisBlueprint = () => ({
  name: "hypothesis",
  init: ({ elements, state, actions }) => {
    if (!elements.hypothesisList || !elements.hypothesisGenerateButton) return;

    const render = () => {
      elements.hypothesisList.innerHTML = "";
      const data = state.hypothesisClips || [];
      if (!data.length) {
        const item = document.createElement("li");
        item.textContent = "Гипотезы ещё не сформированы.";
        elements.hypothesisList.appendChild(item);
        return;
      }
      data.forEach((entry) => {
        const item = document.createElement("li");
        item.textContent = `${entry.timestamp} | ${entry.type} | ${entry.note}`;
        elements.hypothesisList.appendChild(item);
      });
    };

    const selectedTypes = () =>
      Array.from(document.querySelectorAll(".hypothesis-type:checked")).map((el) => el.value);

    elements.hypothesisGenerateButton.addEventListener("click", async () => {
      elements.hypothesisStatus.textContent = "Генерация гипотез...";

      // Try backend AI hypothesis first
      try {
        const port = window.API_PORT || 8000;
        const canvas = document.getElementById('pro-canvas');
        if (canvas && canvas.width > 0) {
          const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
          const fd = new FormData();
          fd.append('file', blob, 'frame.png');
          const resp = await fetch(`http://127.0.0.1:${port}/api/ai/forensic-hypothesis`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file_path: '__current_frame__' })
          });
          if (resp.ok) {
            const data = await resp.json();
            if (data.result?.variants) {
              state.hypothesisClips = data.result.variants.map((v, i) => ({
                id: `hyp-${Date.now()}-${i}`,
                timestamp: new Date().toISOString(),
                type: v.type || 'ai',
                label: v.label || `Вариант ${i + 1}`,
                note: v.description || v.note || 'AI гипотеза',
              }));
              elements.hypothesisStatus.textContent = `AI: ${state.hypothesisClips.length} гипотез`;
              actions.recordLog("hypothesis-generate", "AI-гипотезы сформированы", { count: state.hypothesisClips.length });
              render();
              return;
            }
          }
        }
      } catch (e) { console.warn('[Hypothesis] Backend unavailable, fallback to templates'); }

      // Fallback: template-based generation
      const types = HYPOTHESIS_TEMPLATES.map(t => t.id);

      state.hypothesisClips = types.map((type) => {
        const template = HYPOTHESIS_TEMPLATES.find((entry) => entry.id === type);
        return {
          id: crypto.randomUUID?.() || `hyp-${Date.now()}-${type}`,
          timestamp: new Date().toISOString(),
          type,
          label: template?.label || type,
          note: template?.note || "Пользовательская гипотеза",
        };
      });

      elements.hypothesisStatus.textContent = `Сформировано гипотез: ${state.hypothesisClips.length}`;
      actions.recordLog("hypothesis-generate", "Сформирован список гипотез для клипов", {
        types,
      });
      render();
    });

    elements.hypothesisExportButton?.addEventListener("click", () => {
      const payload = {
        generatedAt: new Date().toISOString(),
        clips: state.hypothesisClips || [],
      };
      actions.downloadJson(payload, "hypothesis-clips");
      actions.recordLog("hypothesis-export", "Экспортирован список гипотез");
    });

    render();
  },
});
