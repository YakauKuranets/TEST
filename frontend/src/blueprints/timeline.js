const createMarkerElement = (marker, onSelect) => {
  const element = document.createElement("button");
  element.type = "button";
  element.className = "timeline-marker";
  element.title = marker.note || "Маркер"; // Защита от пустого примечания
  element.addEventListener("click", (event) => {
    event.stopPropagation();
    onSelect(marker);
  });
  return element;
};

export const createTimelineBlueprint = () => ({
  name: "timeline",
  init: ({ elements, state, actions }) => {
    // Устанавливаем дефолтное значение зума, если его нет в state
    if (typeof state.timelineZoom === 'undefined') {
      state.timelineZoom = 1;
    }

    const updateTimelineWindow = () => {
      // БЕЗОПАСНЫЙ ПОЛУЧЕНИЕ ДАННЫХ
      const duration = (elements.video && elements.video.duration) || 0;
      const zoom = state.timelineZoom || 1; // Защита от undefined/0
      const windowSize = duration ? Math.max(1, duration / zoom) : 0;
      const currentTime = (elements.video && elements.video.currentTime) || 0;

      let start = 0;
      if (duration && windowSize < duration) {
        start = Math.max(0, Math.min(duration - windowSize, currentTime - windowSize / 2));
      }
      const end = duration ? start + windowSize : 0;

      state.timelineWindow = { start, end, duration };

      // ПРОВЕРКА НАЛИЧИЯ ЭЛЕМЕНТОВ ПЕРЕД МАНИПУЛЯЦИЕЙ
      if (elements.timeline) {
        elements.timeline.min = start;
        elements.timeline.max = end;
        elements.timeline.step = duration ? Math.max(0.01, windowSize / 500) : 0.01;
        elements.timeline.value = currentTime;
      }

      if (elements.timelineCurrent) elements.timelineCurrent.textContent = actions.formatTime(currentTime);
      if (elements.timelineDuration) elements.timelineDuration.textContent = actions.formatTime(duration);

      // ИСПРАВЛЕНИЕ ТОЙ САМОЙ ОШИБКИ toFixed
      if (elements.timelineZoomValue) {
        elements.timelineZoomValue.textContent = `${zoom.toFixed(1)}x`;
      }

      renderMarkers();
    };

    actions.refreshTimeline = updateTimelineWindow;

    const renderMarkers = () => {
      if (!elements.timelineMarkers) return;
      elements.timelineMarkers.innerHTML = "";

      const { start, end } = state.timelineWindow || { start: 0, end: 0 };
      const windowSize = end - start;
      if (!windowSize || !state.markers) return;

      state.markers.forEach((marker) => {
        const element = createMarkerElement(marker, (selected) => {
          if (elements.video) elements.video.currentTime = selected.time;
          updateTimelineWindow();
          if (actions.recordLog) {
            actions.recordLog("timeline-marker", `Переход к маркеру ${selected.timecode}`, {
              time: selected.time,
            });
          }
        });
        const position = ((marker.time - start) / windowSize) * 100;
        element.style.left = `${Math.max(0, Math.min(100, position))}%`;
        elements.timelineMarkers.appendChild(element);
      });
    };

    // Слушатели событий с проверкой
    if (elements.timeline) {
        elements.timeline.addEventListener("input", () => {
          const nextTime = Number.parseFloat(elements.timeline.value);
          if (!Number.isNaN(nextTime) && elements.video) {
            elements.video.currentTime = nextTime;
            updateTimelineWindow();
          }
        });

        elements.timeline.addEventListener("change", () => {
          if (actions.recordLog && elements.video) {
            actions.recordLog(
              "timeline-seek",
              `Переход на ${actions.formatTime(elements.video.currentTime)}`,
              { time: elements.video.currentTime }
            );
          }
        });
    }

    if (elements.timelineZoomIn) {
        elements.timelineZoomIn.addEventListener("click", () => {
          state.timelineZoom = Math.min(10, (state.timelineZoom || 1) + 0.5);
          updateTimelineWindow();
          if (actions.recordLog) {
            actions.recordLog("timeline-zoom", `Увеличение масштаба таймлайна: ${state.timelineZoom.toFixed(1)}x`);
          }
        });
    }

    if (elements.timelineZoomOut) {
        elements.timelineZoomOut.addEventListener("click", () => {
          state.timelineZoom = Math.max(1, (state.timelineZoom || 1) - 0.5);
          updateTimelineWindow();
          if (actions.recordLog) {
            actions.recordLog("timeline-zoom", `Уменьшение масштаба таймлайна: ${state.timelineZoom.toFixed(1)}x`);
          }
        });
    }

    if (elements.video) {
        elements.video.addEventListener("loadedmetadata", updateTimelineWindow);
        elements.video.addEventListener("timeupdate", updateTimelineWindow);
    }

    updateTimelineWindow();
  },
});