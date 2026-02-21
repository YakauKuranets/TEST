/**
 * Advanced Timeline Blueprint - Профессиональный многослойный таймлайн
 * 
 * Функции:
 * - Многослойный монтаж (video, audio, effects layers)
 * - Drag & drop клипов
 * - Trim, split, ripple edit
 * - Transitions между клипами
 * - Zoom и навигация по таймлайну
 * - Snap to markers
 */

export const createAdvancedTimelineBlueprint = () => ({
  name: "advancedTimeline",
  
  init: ({ elements, state, actions }) => {
    // Состояние расширенного таймлайна
    state.advancedTimeline = {
      enabled: false,
      layers: [],
      clips: [],
      zoom: 1.0,
      currentTime: 0,
      duration: 0,
      snap: true,
      snapThreshold: 0.1, // секунды
      
      // Активные слои
      selectedLayer: null,
      selectedClip: null,
      
      // Режимы редактирования
      editMode: 'select', // select, trim, split, slip, slide
      
      // Воспроизведение
      playing: false,
      loop: false
    };
    
    /**
     * Типы слоёв
     */
    const LAYER_TYPES = {
      VIDEO: {
        name: 'Video',
        color: '#4299e1',
        icon: '🎬',
        canContain: ['video', 'image']
      },
      AUDIO: {
        name: 'Audio',
        color: '#48bb78',
        icon: '🎵',
        canContain: ['audio']
      },
      EFFECTS: {
        name: 'Effects',
        color: '#ed8936',
        icon: '✨',
        canContain: ['effect', 'filter', 'adjustment']
      },
      TEXT: {
        name: 'Text/Graphics',
        color: '#9f7aea',
        icon: '📝',
        canContain: ['text', 'shape', 'graphic']
      },
      ADJUSTMENT: {
        name: 'Adjustment Layer',
        color: '#f56565',
        icon: '🎨',
        canContain: ['color-grading', 'lut']
      }
    };
    
    /**
     * Создать слой
     */
    const createLayer = (type = 'VIDEO', name = null) => {
      const layerType = LAYER_TYPES[type] || LAYER_TYPES.VIDEO;
      const layer = {
        id: `layer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type,
        name: name || `${layerType.name} ${state.advancedTimeline.layers.length + 1}`,
        enabled: true,
        locked: false,
        solo: false,
        muted: false,
        opacity: 100,
        blendMode: 'normal',
        clips: [],
        color: layerType.color,
        icon: layerType.icon,
        height: 60, // высота в px
        expanded: true
      };
      
      state.advancedTimeline.layers.push(layer);
      
      actions.recordLog('timeline-layer-create', `Создан слой: ${layer.name}`, {
        layerId: layer.id,
        type
      });
      
      return layer;
    };
    
    /**
     * Добавить клип на слой
     */
    const addClipToLayer = (layerId, clipData) => {
      const layer = state.advancedTimeline.layers.find(l => l.id === layerId);
      if (!layer) {
        console.error('[Timeline] Layer not found:', layerId);
        return null;
      }
      
      const clip = {
        id: `clip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        layerId,
        
        // Тайминги (в секундах)
        startTime: clipData.startTime || 0,
        duration: clipData.duration || 5,
        
        // Связь с источником
        sourceFile: clipData.file,
        sourceType: clipData.type || 'video', // video, audio, image
        
        // Для видео/аудио
        sourceStart: clipData.sourceStart || 0, // откуда начинается в источнике
        sourceEnd: clipData.sourceEnd || null,
        
        // Трансформации
        scale: 1.0,
        rotation: 0,
        position: { x: 0, y: 0 },
        opacity: 100,
        
        // Эффекты
        effects: [],
        
        // Transitions
        transitionIn: null,
        transitionOut: null,
        
        // Метаданные
        name: clipData.name || clipData.file?.name || 'Unnamed',
        color: clipData.color || layer.color,
        locked: false,
        enabled: true,
        
        // Кеширование
        thumbnail: null
      };
      
      layer.clips.push(clip);
      state.advancedTimeline.clips.push(clip);
      
      // Обновить длительность таймлайна
      const clipEnd = clip.startTime + clip.duration;
      if (clipEnd > state.advancedTimeline.duration) {
        state.advancedTimeline.duration = clipEnd;
      }
      
      actions.recordLog('timeline-clip-add', `Добавлен клип: ${clip.name}`, {
        clipId: clip.id,
        layerId,
        startTime: clip.startTime,
        duration: clip.duration
      });
      
      return clip;
    };
    
    /**
     * Операции редактирования
     */
    const TimelineOperations = {
      /**
       * Обрезать клип (Trim)
       */
      trimClip(clipId, newStart, newDuration) {
        const clip = state.advancedTimeline.clips.find(c => c.id === clipId);
        if (!clip || clip.locked) return false;
        
        const oldStart = clip.startTime;
        const oldDuration = clip.duration;
        
        clip.startTime = newStart;
        clip.duration = newDuration;
        
        actions.recordLog('timeline-trim', `Обрезан клип: ${clip.name}`, {
          clipId,
          oldStart,
          oldDuration,
          newStart,
          newDuration
        });
        
        return true;
      },
      
      /**
       * Разрезать клип (Split)
       */
      splitClip(clipId, splitTime) {
        const clip = state.advancedTimeline.clips.find(c => c.id === clipId);
        if (!clip || clip.locked) return null;
        
        // Проверить что время внутри клипа
        if (splitTime <= clip.startTime || splitTime >= clip.startTime + clip.duration) {
          return null;
        }
        
        const layer = state.advancedTimeline.layers.find(l => l.id === clip.layerId);
        
        // Создать второй клип
        const clip2Duration = clip.startTime + clip.duration - splitTime;
        const clip1Duration = splitTime - clip.startTime;
        
        const newClip = {
          ...clip,
          id: `clip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          startTime: splitTime,
          duration: clip2Duration,
          sourceStart: clip.sourceStart + clip1Duration,
          name: `${clip.name} (2)`
        };
        
        // Обновить первый клип
        clip.duration = clip1Duration;
        
        // Добавить второй клип
        layer.clips.push(newClip);
        state.advancedTimeline.clips.push(newClip);
        
        actions.recordLog('timeline-split', `Разрезан клип: ${clip.name}`, {
          originalClipId: clipId,
          newClipId: newClip.id,
          splitTime
        });
        
        return newClip;
      },
      
      /**
       * Ripple Edit - сдвинуть все клипы после
       */
      rippleEdit(clipId, deltaTime) {
        const clip = state.advancedTimeline.clips.find(c => c.id === clipId);
        if (!clip) return false;
        
        const clipEndTime = clip.startTime + clip.duration;
        
        // Найти все клипы после этого
        state.advancedTimeline.clips.forEach(c => {
          if (c.startTime >= clipEndTime && c.layerId === clip.layerId) {
            c.startTime += deltaTime;
          }
        });
        
        actions.recordLog('timeline-ripple', 'Ripple edit', {
          clipId,
          deltaTime
        });
        
        return true;
      },
      
      /**
       * Удалить клип
       */
      deleteClip(clipId) {
        const clipIndex = state.advancedTimeline.clips.findIndex(c => c.id === clipId);
        if (clipIndex === -1) return false;
        
        const clip = state.advancedTimeline.clips[clipIndex];
        if (clip.locked) return false;
        
        // Удалить из массива клипов
        state.advancedTimeline.clips.splice(clipIndex, 1);
        
        // Удалить из слоя
        const layer = state.advancedTimeline.layers.find(l => l.id === clip.layerId);
        if (layer) {
          const layerClipIndex = layer.clips.findIndex(c => c.id === clipId);
          if (layerClipIndex !== -1) {
            layer.clips.splice(layerClipIndex, 1);
          }
        }
        
        actions.recordLog('timeline-delete', `Удалён клип: ${clip.name}`, {
          clipId
        });
        
        return true;
      },
      
      /**
       * Добавить transition
       */
      addTransition(clipId, type, position = 'out', duration = 1.0) {
        const clip = state.advancedTimeline.clips.find(c => c.id === clipId);
        if (!clip) return false;
        
        const transition = {
          type, // fade, dissolve, wipe, slide, etc.
          duration,
          easing: 'ease-in-out',
          params: {}
        };
        
        if (position === 'in') {
          clip.transitionIn = transition;
        } else {
          clip.transitionOut = transition;
        }
        
        actions.recordLog('timeline-transition', `Добавлен переход: ${type}`, {
          clipId,
          position,
          duration
        });
        
        return true;
      }
    };
    
    /**
     * Snap к маркерам и другим клипам
     */
    const snapToGrid = (time) => {
      if (!state.advancedTimeline.snap) return time;
      
      const threshold = state.advancedTimeline.snapThreshold;
      
      // Snap к маркерам
      if (state.markers) {
        for (const marker of state.markers) {
          if (Math.abs(marker.time - time) < threshold) {
            return marker.time;
          }
        }
      }
      
      // Snap к краям других клипов
      for (const clip of state.advancedTimeline.clips) {
        const clipStart = clip.startTime;
        const clipEnd = clip.startTime + clip.duration;
        
        if (Math.abs(clipStart - time) < threshold) {
          return clipStart;
        }
        if (Math.abs(clipEnd - time) < threshold) {
          return clipEnd;
        }
      }
      
      return time;
    };
    
    /**
     * Рендер таймлайна в текущий момент времени
     */
    const renderTimelineFrame = (time) => {
      // Найти все активные клипы в данный момент времени
      const activeClips = state.advancedTimeline.clips.filter(clip => {
        const layer = state.advancedTimeline.layers.find(l => l.id === clip.layerId);
        if (!layer || !layer.enabled || !clip.enabled) return false;
        
        return time >= clip.startTime && time < clip.startTime + clip.duration;
      });
      
      // Сортировать по слоям (нижние слои первыми)
      activeClips.sort((a, b) => {
        const layerIndexA = state.advancedTimeline.layers.findIndex(l => l.id === a.layerId);
        const layerIndexB = state.advancedTimeline.layers.findIndex(l => l.id === b.layerId);
        return layerIndexA - layerIndexB;
      });
      
      return activeClips;
    };
    
    /**
     * Переходы (Transitions)
     */
    const TRANSITIONS = {
      fade: (progress) => progress,
      dissolve: (progress) => progress,
      
      wipe_left: (progress) => progress,
      wipe_right: (progress) => 1 - progress,
      wipe_up: (progress) => progress,
      wipe_down: (progress) => 1 - progress,
      
      slide_left: (progress) => Math.pow(progress, 2),
      slide_right: (progress) => Math.pow(1 - progress, 2),
      
      zoom_in: (progress) => 1 - Math.pow(1 - progress, 3),
      zoom_out: (progress) => Math.pow(progress, 3),
      
      cross_dissolve: (progress) => {
        // S-curve для smooth перехода
        return progress < 0.5 
          ? 2 * progress * progress 
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      }
    };
    
    /**
     * Экспорт API
     */
    state.advancedTimelineAPI = {
      createLayer,
      addClipToLayer,
      operations: TimelineOperations,
      snapToGrid,
      renderFrame: renderTimelineFrame,
      getTransitions: () => TRANSITIONS,
      
      // Утилиты
      getLayers: () => state.advancedTimeline.layers,
      getClips: () => state.advancedTimeline.clips,
      getClipById: (id) => state.advancedTimeline.clips.find(c => c.id === id),
      getLayerById: (id) => state.advancedTimeline.layers.find(l => l.id === id),
      
      // Воспроизведение
      setPlaybackTime: (time) => {
        state.advancedTimeline.currentTime = time;
      },
      isEnabled: () => state.advancedTimeline.enabled,
      setEnabled: (enabled) => {
        state.advancedTimeline.enabled = enabled;
      }
    };
    
    // Создать стандартные слои по умолчанию
    if (state.advancedTimeline.layers.length === 0) {
      createLayer('VIDEO', 'Video Track 1');
      createLayer('AUDIO', 'Audio Track 1');
      createLayer('EFFECTS', 'Effects & Filters');
    }
    
    console.log('[Advanced Timeline] Blueprint initialized with', state.advancedTimeline.layers.length, 'layers');
  }
});
