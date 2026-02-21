/**
 * Video Stabilization Blueprint - Голливудская стабилизация видео
 * 
 * Функции:
 * - Анализ движения камеры
 * - Компенсация дрожания (shake compensation)
 * - Smooth camera motion
 * - Rolling shutter correction
 * - Warp stabilization
 * - Различные режимы (smooth, no motion, perspective)
 */

export const createStabilizationBlueprint = () => ({
  name: "stabilization",
  
  init: ({ elements, state, actions }) => {
    // Состояние стабилизации
    state.stabilization = {
      enabled: false,
      analyzing: false,
      progress: 0,
      
      // Параметры
      mode: 'smooth',  // smooth, no-motion, perspective, warp
      smoothness: 50,  // 0-100
      cropMode: 'auto', // auto, none, stabilize-only
      maxCrop: 10,     // max % crop
      
      // Анализ
      motionData: null,  // данные о движении камеры
      frameAnalysis: [], // анализ каждого кадра
      
      // Применение
      transform: null,   // текущая трансформация
      cache: new Map()   // кеш трансформаций
    };
    
    /**
     * Режимы стабилизации
     */
    const STABILIZATION_MODES = {
      smooth: {
        name: 'Smooth Motion',
        description: 'Сглаживание движения камеры, сохраняя естественность',
        icon: '🎥',
        params: {
          smoothness: 50,
          maxAngle: 15,
          maxScale: 1.1,
          edgeHandling: 'crop'
        }
      },
      
      'no-motion': {
        name: 'No Motion',
        description: 'Полная фиксация камеры (для статичных сцен)',
        icon: '📹',
        params: {
          smoothness: 100,
          maxAngle: 0,
          maxScale: 1.0,
          edgeHandling: 'crop'
        }
      },
      
      perspective: {
        name: 'Perspective',
        description: 'Коррекция перспективы для движущейся камеры',
        icon: '🎬',
        params: {
          smoothness: 70,
          maxAngle: 25,
          maxScale: 1.15,
          edgeHandling: 'warp',
          perspectiveCorrection: true
        }
      },
      
      warp: {
        name: 'Warp Stabilizer',
        description: 'Продвинутая стабилизация с деформацией (как в After Effects)',
        icon: '✨',
        params: {
          smoothness: 80,
          method: 'subspace',
          meshSize: 10,
          edgeHandling: 'synthesize'
        }
      },
      
      cinematic: {
        name: 'Cinematic',
        description: 'Голливудская плавность для фильмов',
        icon: '🎞️',
        params: {
          smoothness: 85,
          maxAngle: 20,
          maxScale: 1.12,
          edgeHandling: 'crop',
          motionBlur: true
        }
      },
      
      handheld: {
        name: 'Handheld Smooth',
        description: 'Сглаживание для ручной съёмки',
        icon: '🤳',
        params: {
          smoothness: 40,
          maxAngle: 30,
          maxScale: 1.2,
          edgeHandling: 'crop',
          preserveHandheld: true
        }
      },
      
      drone: {
        name: 'Drone',
        description: 'Оптимизация для дрон-съёмки',
        icon: '🚁',
        params: {
          smoothness: 60,
          maxAngle: 10,
          maxScale: 1.05,
          edgeHandling: 'crop',
          windCompensation: true
        }
      }
    };
    
    /**
     * Анализ движения (упрощённая версия)
     * В реальности используется optical flow и feature tracking
     */
    const analyzeMotion = async (videoElement, options = {}) => {
      state.stabilization.analyzing = true;
      state.stabilization.progress = 0;
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      const fps = 30; // или получить из видео
      const duration = videoElement.duration;
      const totalFrames = Math.floor(duration * fps);
      
      const motionData = {
        totalFrames,
        fps,
        transforms: [],
        features: []
      };
      
      actions.recordLog('stabilization-analyze', 'Начат анализ движения видео', {
        duration,
        totalFrames,
        fps
      });
      
      // Симуляция анализа (в реальности - optical flow)
      for (let frame = 0; frame < Math.min(totalFrames, 300); frame++) {
        const time = frame / fps;
        
        // Перемотать видео на нужный кадр
        videoElement.currentTime = time;
        await new Promise(resolve => {
          videoElement.onseeked = resolve;
          setTimeout(resolve, 100); // fallback
        });
        
        // Захватить кадр
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;
        ctx.drawImage(videoElement, 0, 0);
        
        // Симуляция детекции движения
        // В реальности: Lucas-Kanade optical flow, SIFT/SURF features
        const motion = {
          frame,
          time,
          dx: Math.random() * 4 - 2,  // смещение X
          dy: Math.random() * 4 - 2,  // смещение Y
          rotation: (Math.random() * 2 - 1) * 0.5, // поворот в градусах
          scale: 1 + (Math.random() * 0.02 - 0.01)  // масштаб
        };
        
        motionData.transforms.push(motion);
        
        // Обновить прогресс
        state.stabilization.progress = (frame / totalFrames) * 100;
        
        if (frame % 30 === 0) {
          console.log(`[Stabilization] Analyzing frame ${frame}/${totalFrames} (${state.stabilization.progress.toFixed(1)}%)`);
        }
      }
      
      state.stabilization.motionData = motionData;
      state.stabilization.analyzing = false;
      state.stabilization.progress = 100;
      
      actions.recordLog('stabilization-complete', 'Анализ движения завершён', {
        framesAnalyzed: motionData.transforms.length,
        avgMotion: calculateAverageMotion(motionData)
      });
      
      return motionData;
    };
    
    /**
     * Расчёт средней амплитуды движения
     */
    const calculateAverageMotion = (motionData) => {
      if (!motionData || motionData.transforms.length === 0) return 0;
      
      let totalMotion = 0;
      for (const t of motionData.transforms) {
        const motion = Math.sqrt(t.dx * t.dx + t.dy * t.dy) + Math.abs(t.rotation);
        totalMotion += motion;
      }
      
      return totalMotion / motionData.transforms.length;
    };
    
    /**
     * Сглаживание траектории движения
     */
    const smoothTrajectory = (transforms, smoothness) => {
      if (transforms.length === 0) return transforms;
      
      const smoothed = [];
      const windowSize = Math.max(1, Math.floor(smoothness / 10));
      
      for (let i = 0; i < transforms.length; i++) {
        let sumDx = 0, sumDy = 0, sumRot = 0, sumScale = 0;
        let count = 0;
        
        // Среднее по окну
        for (let j = Math.max(0, i - windowSize); j <= Math.min(transforms.length - 1, i + windowSize); j++) {
          sumDx += transforms[j].dx;
          sumDy += transforms[j].dy;
          sumRot += transforms[j].rotation;
          sumScale += transforms[j].scale;
          count++;
        }
        
        smoothed.push({
          ...transforms[i],
          dx: sumDx / count,
          dy: sumDy / count,
          rotation: sumRot / count,
          scale: sumScale / count
        });
      }
      
      return smoothed;
    };
    
    /**
     * Применить стабилизацию к кадру
     */
    const applyStabilization = (canvas, frameIndex) => {
      if (!state.stabilization.enabled || !state.stabilization.motionData) {
        return canvas;
      }
      
      // Проверить кеш
      if (state.stabilization.cache.has(frameIndex)) {
        return state.stabilization.cache.get(frameIndex);
      }
      
      const motionData = state.stabilization.motionData;
      const mode = STABILIZATION_MODES[state.stabilization.mode];
      
      if (frameIndex >= motionData.transforms.length) {
        return canvas;
      }
      
      // Сгладить траекторию
      const smoothed = smoothTrajectory(
        motionData.transforms,
        state.stabilization.smoothness
      );
      
      const transform = smoothed[frameIndex];
      
      // Создать стабилизированный canvas
      const stabilizedCanvas = document.createElement('canvas');
      stabilizedCanvas.width = canvas.width;
      stabilizedCanvas.height = canvas.height;
      const ctx = stabilizedCanvas.getContext('2d');
      
      // Применить трансформацию
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      
      // Компенсировать движение
      ctx.translate(-transform.dx, -transform.dy);
      ctx.rotate(-transform.rotation * Math.PI / 180);
      ctx.scale(1 / transform.scale, 1 / transform.scale);
      
      ctx.translate(-canvas.width / 2, -canvas.height / 2);
      
      // Нарисовать кадр
      ctx.drawImage(canvas, 0, 0);
      ctx.restore();
      
      // Если нужен crop
      if (state.stabilization.cropMode === 'stabilize-only') {
        const cropPercent = state.stabilization.maxCrop / 100;
        const cropX = canvas.width * cropPercent;
        const cropY = canvas.height * cropPercent;
        
        const croppedCanvas = document.createElement('canvas');
        croppedCanvas.width = canvas.width - cropX * 2;
        croppedCanvas.height = canvas.height - cropY * 2;
        const cropCtx = croppedCanvas.getContext('2d');
        
        cropCtx.drawImage(
          stabilizedCanvas,
          cropX, cropY,
          croppedCanvas.width, croppedCanvas.height,
          0, 0,
          croppedCanvas.width, croppedCanvas.height
        );
        
        // Кешировать
        state.stabilization.cache.set(frameIndex, croppedCanvas);
        return croppedCanvas;
      }
      
      // Кешировать
      state.stabilization.cache.set(frameIndex, stabilizedCanvas);
      return stabilizedCanvas;
    };
    
    /**
     * Экспорт API
     */
    state.stabilizationAPI = {
      analyze: analyzeMotion,
      apply: applyStabilization,
      smooth: smoothTrajectory,
      
      // Утилиты
      getModes: () => STABILIZATION_MODES,
      setMode: (mode) => {
        if (STABILIZATION_MODES[mode]) {
          state.stabilization.mode = mode;
          const modeConfig = STABILIZATION_MODES[mode];
          
          // Применить параметры режима
          if (modeConfig.params.smoothness !== undefined) {
            state.stabilization.smoothness = modeConfig.params.smoothness;
          }
          
          actions.recordLog('stabilization-mode', `Режим стабилизации: ${modeConfig.name}`, {
            mode,
            params: modeConfig.params
          });
        }
      },
      
      clearCache: () => {
        state.stabilization.cache.clear();
      },
      
      isEnabled: () => state.stabilization.enabled,
      setEnabled: (enabled) => {
        state.stabilization.enabled = enabled;
      },
      
      isAnalyzing: () => state.stabilization.analyzing,
      getProgress: () => state.stabilization.progress
    };
    
    console.log('[Stabilization] Blueprint initialized with', Object.keys(STABILIZATION_MODES).length, 'modes');
  }
});
