/**
 * Keyframes Blueprint - Система ключевых кадров для анимации
 * 
 * Функции:
 * - Ключевые кадры для любого параметра
 * - Интерполяция (linear, ease, bezier)
 * - Анимация позиции, масштаба, поворота, opacity
 * - Групповая анимация
 * - Copy/paste keyframes
 */

export const createKeyframesBlueprint = () => ({
  name: "keyframes",
  
  init: ({ elements, state, actions }) => {
    // Состояние системы ключевых кадров
    state.keyframes = {
      enabled: false,
      tracks: new Map(), // объект/свойство -> массив keyframes
      selectedKeyframe: null,
      clipboard: null, // для copy/paste
      autoKeyframe: false // автосоздание keyframe при изменении
    };
    
    /**
     * Типы интерполяции
     */
    const EASING_FUNCTIONS = {
      linear: (t) => t,
      
      // Ease
      ease: (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
      easeIn: (t) => t * t,
      easeOut: (t) => 1 - Math.pow(1 - t, 2),
      easeInOut: (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
      
      // Cubic
      easeInCubic: (t) => t * t * t,
      easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
      easeInOutCubic: (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
      
      // Quart
      easeInQuart: (t) => t * t * t * t,
      easeOutQuart: (t) => 1 - Math.pow(1 - t, 4),
      easeInOutQuart: (t) => t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2,
      
      // Elastic
      easeInElastic: (t) => {
        const c4 = (2 * Math.PI) / 3;
        return t === 0 ? 0 : t === 1 ? 1 : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4);
      },
      easeOutElastic: (t) => {
        const c4 = (2 * Math.PI) / 3;
        return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
      },
      
      // Bounce
      easeOutBounce: (t) => {
        const n1 = 7.5625;
        const d1 = 2.75;
        if (t < 1 / d1) return n1 * t * t;
        else if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
        else if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
        else return n1 * (t -= 2.625 / d1) * t + 0.984375;
      }
    };
    
    /**
     * Создать или обновить keyframe
     */
    const setKeyframe = (objectId, property, time, value, easing = 'linear') => {
      const trackKey = `${objectId}.${property}`;
      
      if (!state.keyframes.tracks.has(trackKey)) {
        state.keyframes.tracks.set(trackKey, []);
      }
      
      const track = state.keyframes.tracks.get(trackKey);
      
      // Проверить есть ли уже keyframe в этот момент времени
      const existing = track.find(kf => Math.abs(kf.time - time) < 0.001);
      
      if (existing) {
        // Обновить существующий
        existing.value = value;
        existing.easing = easing;
        existing.modifiedAt = Date.now();
      } else {
        // Создать новый
        const keyframe = {
          id: `kf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          time,
          value,
          easing,
          createdAt: Date.now()
        };
        
        track.push(keyframe);
        
        // Сортировать по времени
        track.sort((a, b) => a.time - b.time);
        
        actions.recordLog('keyframe-create', `Создан keyframe: ${property}`, {
          objectId,
          property,
          time,
          value
        });
      }
      
      return track;
    };
    
    /**
     * Удалить keyframe
     */
    const deleteKeyframe = (objectId, property, time) => {
      const trackKey = `${objectId}.${property}`;
      const track = state.keyframes.tracks.get(trackKey);
      
      if (!track) return false;
      
      const index = track.findIndex(kf => Math.abs(kf.time - time) < 0.001);
      if (index === -1) return false;
      
      track.splice(index, 1);
      
      // Если track пустой, удалить его
      if (track.length === 0) {
        state.keyframes.tracks.delete(trackKey);
      }
      
      actions.recordLog('keyframe-delete', `Удалён keyframe: ${property}`, {
        objectId,
        property,
        time
      });
      
      return true;
    };
    
    /**
     * Получить значение с интерполяцией в заданный момент времени
     */
    const getInterpolatedValue = (objectId, property, time) => {
      const trackKey = `${objectId}.${property}`;
      const track = state.keyframes.tracks.get(trackKey);
      
      if (!track || track.length === 0) return null;
      
      // Если только один keyframe
      if (track.length === 1) {
        return track[0].value;
      }
      
      // Найти соседние keyframes
      let keyBefore = null;
      let keyAfter = null;
      
      for (let i = 0; i < track.length; i++) {
        if (track[i].time <= time) {
          keyBefore = track[i];
        }
        if (track[i].time >= time && !keyAfter) {
          keyAfter = track[i];
        }
      }
      
      // Если время до первого keyframe
      if (!keyBefore) return keyAfter.value;
      
      // Если время после последнего keyframe
      if (!keyAfter) return keyBefore.value;
      
      // Если точно на keyframe
      if (Math.abs(keyBefore.time - time) < 0.001) return keyBefore.value;
      if (Math.abs(keyAfter.time - time) < 0.001) return keyAfter.value;
      
      // Интерполяция между keyframes
      const duration = keyAfter.time - keyBefore.time;
      const progress = (time - keyBefore.time) / duration;
      
      // Применить easing
      const easingFunc = EASING_FUNCTIONS[keyBefore.easing] || EASING_FUNCTIONS.linear;
      const easedProgress = easingFunc(progress);
      
      // Интерполяция значения
      return interpolateValue(keyBefore.value, keyAfter.value, easedProgress);
    };
    
    /**
     * Интерполировать значение (работает с числами, объектами, массивами)
     */
    const interpolateValue = (a, b, t) => {
      // Число
      if (typeof a === 'number' && typeof b === 'number') {
        return a + (b - a) * t;
      }
      
      // Объект {x, y, z} и т.д.
      if (typeof a === 'object' && typeof b === 'object' && !Array.isArray(a)) {
        const result = {};
        for (const key in a) {
          if (key in b) {
            result[key] = interpolateValue(a[key], b[key], t);
          }
        }
        return result;
      }
      
      // Массив
      if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
        return a.map((val, i) => interpolateValue(val, b[i], t));
      }
      
      // Дискретное переключение для всего остального
      return t < 0.5 ? a : b;
    };
    
    /**
     * Получить все keyframes для объекта
     */
    const getObjectKeyframes = (objectId) => {
      const result = {};
      
      for (const [trackKey, track] of state.keyframes.tracks.entries()) {
        if (trackKey.startsWith(`${objectId}.`)) {
          const property = trackKey.substring(objectId.length + 1);
          result[property] = track;
        }
      }
      
      return result;
    };
    
    /**
     * Copy/Paste keyframes
     */
    const copyKeyframes = (objectId, property, timeRange = null) => {
      const trackKey = `${objectId}.${property}`;
      const track = state.keyframes.tracks.get(trackKey);
      
      if (!track) return false;
      
      let keyframesToCopy = track;
      
      // Если указан диапазон времени
      if (timeRange) {
        keyframesToCopy = track.filter(kf => 
          kf.time >= timeRange.start && kf.time <= timeRange.end
        );
      }
      
      state.keyframes.clipboard = {
        objectId,
        property,
        keyframes: JSON.parse(JSON.stringify(keyframesToCopy)),
        copiedAt: Date.now()
      };
      
      actions.recordLog('keyframe-copy', `Скопировано keyframes: ${keyframesToCopy.length}`, {
        objectId,
        property,
        count: keyframesToCopy.length
      });
      
      return true;
    };
    
    const pasteKeyframes = (objectId, property, atTime) => {
      if (!state.keyframes.clipboard) return false;
      
      const clipboard = state.keyframes.clipboard;
      const trackKey = `${objectId}.${property}`;
      
      if (!state.keyframes.tracks.has(trackKey)) {
        state.keyframes.tracks.set(trackKey, []);
      }
      
      const track = state.keyframes.tracks.get(trackKey);
      
      // Найти минимальное время в clipboard
      const minTime = Math.min(...clipboard.keyframes.map(kf => kf.time));
      const timeOffset = atTime - minTime;
      
      // Вставить keyframes со смещением
      for (const kf of clipboard.keyframes) {
        const newKeyframe = {
          ...kf,
          id: `kf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          time: kf.time + timeOffset,
          createdAt: Date.now()
        };
        
        track.push(newKeyframe);
      }
      
      // Сортировать
      track.sort((a, b) => a.time - b.time);
      
      actions.recordLog('keyframe-paste', `Вставлено keyframes: ${clipboard.keyframes.length}`, {
        objectId,
        property,
        atTime,
        count: clipboard.keyframes.length
      });
      
      return true;
    };
    
    /**
     * Анимационные пресеты
     */
    const ANIMATION_PRESETS = {
      fadeIn: (objectId, startTime, duration) => {
        setKeyframe(objectId, 'opacity', startTime, 0, 'linear');
        setKeyframe(objectId, 'opacity', startTime + duration, 100, 'easeOut');
      },
      
      fadeOut: (objectId, startTime, duration) => {
        setKeyframe(objectId, 'opacity', startTime, 100, 'linear');
        setKeyframe(objectId, 'opacity', startTime + duration, 0, 'easeIn');
      },
      
      slideInLeft: (objectId, startTime, duration) => {
        setKeyframe(objectId, 'position', startTime, { x: -100, y: 0 }, 'easeOutCubic');
        setKeyframe(objectId, 'position', startTime + duration, { x: 0, y: 0 }, 'easeOutCubic');
        setKeyframe(objectId, 'opacity', startTime, 0, 'linear');
        setKeyframe(objectId, 'opacity', startTime + 0.2, 100, 'linear');
      },
      
      slideInRight: (objectId, startTime, duration) => {
        setKeyframe(objectId, 'position', startTime, { x: 100, y: 0 }, 'easeOutCubic');
        setKeyframe(objectId, 'position', startTime + duration, { x: 0, y: 0 }, 'easeOutCubic');
        setKeyframe(objectId, 'opacity', startTime, 0, 'linear');
        setKeyframe(objectId, 'opacity', startTime + 0.2, 100, 'linear');
      },
      
      zoomIn: (objectId, startTime, duration) => {
        setKeyframe(objectId, 'scale', startTime, 0.5, 'easeOutCubic');
        setKeyframe(objectId, 'scale', startTime + duration, 1.0, 'easeOutCubic');
        setKeyframe(objectId, 'opacity', startTime, 0, 'linear');
        setKeyframe(objectId, 'opacity', startTime + 0.3, 100, 'linear');
      },
      
      bounce: (objectId, startTime, duration) => {
        const bounces = 3;
        const bounceHeight = 50;
        
        for (let i = 0; i <= bounces; i++) {
          const t = startTime + (duration / bounces) * i;
          const height = bounceHeight * Math.pow(0.6, i);
          setKeyframe(objectId, 'position', t, { x: 0, y: -height }, 'easeOutBounce');
        }
      },
      
      spin: (objectId, startTime, duration, rotations = 1) => {
        setKeyframe(objectId, 'rotation', startTime, 0, 'linear');
        setKeyframe(objectId, 'rotation', startTime + duration, 360 * rotations, 'linear');
      },
      
      pulse: (objectId, startTime, duration, pulses = 3) => {
        for (let i = 0; i <= pulses; i++) {
          const t = startTime + (duration / pulses) * i;
          const scale = i % 2 === 0 ? 1.0 : 1.2;
          setKeyframe(objectId, 'scale', t, scale, 'easeInOutCubic');
        }
      }
    };
    
    /**
     * Экспорт API
     */
    state.keyframesAPI = {
      set: setKeyframe,
      delete: deleteKeyframe,
      getValue: getInterpolatedValue,
      getObjectKeyframes,
      copy: copyKeyframes,
      paste: pasteKeyframes,
      
      // Утилиты
      getAllTracks: () => Array.from(state.keyframes.tracks.entries()),
      getTrack: (objectId, property) => state.keyframes.tracks.get(`${objectId}.${property}`),
      clearTrack: (objectId, property) => {
        state.keyframes.tracks.delete(`${objectId}.${property}`);
      },
      clearObject: (objectId) => {
        for (const trackKey of state.keyframes.tracks.keys()) {
          if (trackKey.startsWith(`${objectId}.`)) {
            state.keyframes.tracks.delete(trackKey);
          }
        }
      },
      
      // Пресеты
      applyPreset: (presetName, objectId, startTime, duration, ...args) => {
        const preset = ANIMATION_PRESETS[presetName];
        if (preset) {
          preset(objectId, startTime, duration, ...args);
          return true;
        }
        return false;
      },
      getPresets: () => Object.keys(ANIMATION_PRESETS),
      
      // Easing functions
      getEasings: () => Object.keys(EASING_FUNCTIONS),
      
      isEnabled: () => state.keyframes.enabled,
      setEnabled: (enabled) => {
        state.keyframes.enabled = enabled;
      }
    };
    
    console.log('[Keyframes] Blueprint initialized with', Object.keys(EASING_FUNCTIONS).length, 'easing functions');
  }
});
