/**
 * Motion Tracking & Effects Blueprint - Трекинг объектов и система эффектов
 * 
 * Объединённый модуль для:
 * - Motion tracking (трекинг объектов на видео)
 * - Effects library (библиотека эффектов)
 * - Blur, glow, particles, lens flares
 * - Time effects (slow motion, freeze frame)
 */

export const createMotionTrackingAndEffectsBlueprint = () => ({
  name: "motionTrackingAndEffects",
  
  init: ({ elements, state, actions }) => {
    // ============================================================
    // MOTION TRACKING
    // ============================================================
    
    state.motionTracking = {
      enabled: false,
      tracks: [],
      activeTrack: null,
      analyzing: false,
      progress: 0
    };
    
    /**
     * Типы трекинга
     */
    const TRACKING_TYPES = {
      point: {
        name: 'Point Track',
        description: 'Трекинг одной точки',
        icon: '📍'
      },
      planar: {
        name: 'Planar Track',
        description: 'Трекинг плоскости (для замены экранов)',
        icon: '▭'
      },
      '3d-camera': {
        name: '3D Camera Track',
        description: 'Решение камеры в 3D пространстве',
        icon: '📹'
      },
      face: {
        name: 'Face Track',
        description: 'Трекинг лица (для масок)',
        icon: '👤'
      },
      mask: {
        name: 'Mask Track',
        description: 'Трекинг маски (ротоскопинг)',
        icon: '✂️'
      }
    };
    
    /**
     * Создать точку трекинга
     */
    const createTrackPoint = (x, y, frameIndex, type = 'point') => {
      const track = {
        id: `track_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type,
        name: `Track ${state.motionTracking.tracks.length + 1}`,
        startFrame: frameIndex,
        endFrame: null,
        points: [{ frame: frameIndex, x, y, confidence: 1.0 }],
        color: `hsl(${Math.random() * 360}, 70%, 60%)`,
        enabled: true
      };
      
      state.motionTracking.tracks.push(track);
      
      actions.recordLog('motion-track-create', `Создана точка трекинга: ${track.name}`, {
        trackId: track.id,
        type,
        x, y,
        frame: frameIndex
      });
      
      return track;
    };
    
    /**
     * Трекинг вперёд (упрощённая версия - в реальности Lucas-Kanade optical flow)
     */
    const trackForward = async (trackId, toFrame) => {
      const track = state.motionTracking.tracks.find(t => t.id === trackId);
      if (!track) return false;
      
      state.motionTracking.analyzing = true;
      const lastPoint = track.points[track.points.length - 1];
      
      // Симуляция трекинга
      for (let frame = lastPoint.frame + 1; frame <= toFrame; frame++) {
        // В реальности: optical flow, template matching
        const prevPoint = track.points[track.points.length - 1];
        const newPoint = {
          frame,
          x: prevPoint.x + (Math.random() - 0.5) * 2,
          y: prevPoint.y + (Math.random() - 0.5) * 2,
          confidence: 0.9 - (frame - lastPoint.frame) * 0.01
        };
        
        track.points.push(newPoint);
        state.motionTracking.progress = ((frame - lastPoint.frame) / (toFrame - lastPoint.frame)) * 100;
        
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      track.endFrame = toFrame;
      state.motionTracking.analyzing = false;
      
      return true;
    };
    
    /**
     * Получить позицию трека в кадре
     */
    const getTrackPosition = (trackId, frameIndex) => {
      const track = state.motionTracking.tracks.find(t => t.id === trackId);
      if (!track) return null;
      
      // Найти ближайший кадр
      const exactPoint = track.points.find(p => p.frame === frameIndex);
      if (exactPoint) return { x: exactPoint.x, y: exactPoint.y };
      
      // Интерполяция между кадрами
      let prevPoint = null;
      let nextPoint = null;
      
      for (const point of track.points) {
        if (point.frame <= frameIndex) prevPoint = point;
        if (point.frame >= frameIndex && !nextPoint) nextPoint = point;
      }
      
      if (!prevPoint) return nextPoint ? { x: nextPoint.x, y: nextPoint.y } : null;
      if (!nextPoint) return { x: prevPoint.x, y: prevPoint.y };
      
      // Линейная интерполяция
      const t = (frameIndex - prevPoint.frame) / (nextPoint.frame - prevPoint.frame);
      return {
        x: prevPoint.x + (nextPoint.x - prevPoint.x) * t,
        y: prevPoint.y + (nextPoint.y - prevPoint.y) * t
      };
    };
    
    // ============================================================
    // EFFECTS SYSTEM
    // ============================================================
    
    state.effects = {
      library: [],
      applied: new Map(), // objectId -> [effects]
      presets: {}
    };
    
    /**
     * Библиотека эффектов
     */
    const EFFECTS_LIBRARY = {
      // Blur эффекты
      gaussianBlur: {
        name: 'Gaussian Blur',
        category: 'blur',
        icon: '〰️',
        params: {
          radius: { default: 5, min: 0, max: 50, type: 'number' }
        },
        apply: (ctx, imageData, params) => {
          // Упрощённая версия (в реальности - convolution)
          ctx.filter = `blur(${params.radius}px)`;
          return imageData;
        }
      },
      
      motionBlur: {
        name: 'Motion Blur',
        category: 'blur',
        icon: '💨',
        params: {
          angle: { default: 0, min: 0, max: 360, type: 'number' },
          distance: { default: 10, min: 0, max: 100, type: 'number' }
        },
        apply: (ctx, imageData, params) => {
          // Motion blur simulation
          return imageData;
        }
      },
      
      // Glow эффекты
      glow: {
        name: 'Glow',
        category: 'stylize',
        icon: '✨',
        params: {
          intensity: { default: 50, min: 0, max: 100, type: 'number' },
          color: { default: '#ffffff', type: 'color' },
          radius: { default: 20, min: 0, max: 100, type: 'number' }
        },
        apply: (ctx, imageData, params) => {
          ctx.shadowBlur = params.radius;
          ctx.shadowColor = params.color;
          return imageData;
        }
      },
      
      // Sharpen
      sharpen: {
        name: 'Sharpen',
        category: 'enhance',
        icon: '🔪',
        params: {
          amount: { default: 50, min: 0, max: 100, type: 'number' }
        },
        apply: (ctx, imageData, params) => {
          // Unsharp mask
          return imageData;
        }
      },
      
      // Vignette
      vignette: {
        name: 'Vignette',
        category: 'stylize',
        icon: '⭕',
        params: {
          amount: { default: 50, min: 0, max: 100, type: 'number' },
          roundness: { default: 50, min: 0, max: 100, type: 'number' }
        },
        apply: (ctx, imageData, params) => {
          const { width, height } = imageData;
          const gradient = ctx.createRadialGradient(
            width / 2, height / 2, 0,
            width / 2, height / 2, Math.max(width, height) / 2
          );
          
          gradient.addColorStop(0, 'transparent');
          gradient.addColorStop(1, `rgba(0,0,0,${params.amount / 100})`);
          
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, width, height);
          
          return imageData;
        }
      },
      
      // Film Grain
      filmGrain: {
        name: 'Film Grain',
        category: 'stylize',
        icon: '📽️',
        params: {
          amount: { default: 20, min: 0, max: 100, type: 'number' },
          size: { default: 1, min: 1, max: 5, type: 'number' }
        },
        apply: (ctx, imageData, params) => {
          const data = imageData.data;
          const intensity = params.amount * 2.55;
          
          for (let i = 0; i < data.length; i += 4) {
            const noise = (Math.random() - 0.5) * intensity;
            data[i] += noise;
            data[i + 1] += noise;
            data[i + 2] += noise;
          }
          
          return imageData;
        }
      },
      
      // Lens Flare
      lensFlare: {
        name: 'Lens Flare',
        category: 'light',
        icon: '☀️',
        params: {
          x: { default: 50, min: 0, max: 100, type: 'number' },
          y: { default: 50, min: 0, max: 100, type: 'number' },
          intensity: { default: 70, min: 0, max: 100, type: 'number' },
          color: { default: '#ffaa00', type: 'color' }
        },
        apply: (ctx, imageData, params) => {
          const { width, height } = imageData;
          const x = (params.x / 100) * width;
          const y = (params.y / 100) * height;
          
          // Центральная вспышка
          const mainGradient = ctx.createRadialGradient(x, y, 0, x, y, 100);
          mainGradient.addColorStop(0, params.color);
          mainGradient.addColorStop(1, 'transparent');
          
          ctx.globalCompositeOperation = 'screen';
          ctx.fillStyle = mainGradient;
          ctx.globalAlpha = params.intensity / 100;
          ctx.fillRect(0, 0, width, height);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
          
          return imageData;
        }
      },
      
      // Chromatic Aberration
      chromaticAberration: {
        name: 'Chromatic Aberration',
        category: 'distort',
        icon: '🌈',
        params: {
          amount: { default: 3, min: 0, max: 20, type: 'number' }
        },
        apply: (ctx, imageData, params) => {
          // RGB channel shift
          return imageData;
        }
      },
      
      // Time Effects
      freezeFrame: {
        name: 'Freeze Frame',
        category: 'time',
        icon: '❄️',
        params: {
          duration: { default: 2, min: 0.1, max: 10, type: 'number' }
        }
      },
      
      slowMotion: {
        name: 'Slow Motion',
        category: 'time',
        icon: '🐌',
        params: {
          speed: { default: 50, min: 1, max: 100, type: 'number' }
        }
      },
      
      timeRemap: {
        name: 'Time Remap',
        category: 'time',
        icon: '⏱️',
        params: {
          curve: { default: 'linear', type: 'curve' }
        }
      }
    };
    
    /**
     * Применить эффект к кадру
     */
    const applyEffect = (canvas, effectName, params) => {
      const effect = EFFECTS_LIBRARY[effectName];
      if (!effect || !effect.apply) return canvas;
      
      const ctx = canvas.getContext('2d');
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      // Применить эффект
      const result = effect.apply(ctx, imageData, params);
      
      if (result) {
        ctx.putImageData(result, 0, 0);
      }
      
      return canvas;
    };
    
    /**
     * Экспорт API
     */
    state.motionTrackingAPI = {
      createTrack: createTrackPoint,
      trackForward,
      getPosition: getTrackPosition,
      getTracks: () => state.motionTracking.tracks,
      getTrackById: (id) => state.motionTracking.tracks.find(t => t.id === id),
      deleteTrack: (id) => {
        const index = state.motionTracking.tracks.findIndex(t => t.id === id);
        if (index !== -1) {
          state.motionTracking.tracks.splice(index, 1);
          return true;
        }
        return false;
      },
      isEnabled: () => state.motionTracking.enabled,
      setEnabled: (enabled) => {
        state.motionTracking.enabled = enabled;
      }
    };
    
    state.effectsAPI = {
      apply: applyEffect,
      getLibrary: () => EFFECTS_LIBRARY,
      getCategories: () => {
        const categories = new Set();
        for (const effect of Object.values(EFFECTS_LIBRARY)) {
          categories.add(effect.category);
        }
        return Array.from(categories);
      },
      getEffectsByCategory: (category) => {
        return Object.entries(EFFECTS_LIBRARY)
          .filter(([_, effect]) => effect.category === category)
          .map(([name, effect]) => ({ name, ...effect }));
      }
    };
    
    console.log('[Motion Tracking & Effects] Blueprint initialized');
    console.log('  - Tracking types:', Object.keys(TRACKING_TYPES).length);
    console.log('  - Effects:', Object.keys(EFFECTS_LIBRARY).length);
  }
});
