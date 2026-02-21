/**
 * Color Grading Blueprint - Голливудская цветокоррекция
 * 
 * Функции:
 * - LUT (Look-Up Tables) - применение цветовых профилей
 * - Color Wheels - тени/средние/света
 * - Curves - кривые RGB
 * - HSL настройка
 * - Temperature/Tint
 * - Cinema grade presets
 */

export const createColorGradingBlueprint = () => ({
  name: "colorGrading",
  
  init: ({ elements, state, actions }) => {
    // Создаем canvas для обработки
    const colorCanvas = document.createElement('canvas');
    const colorCtx = colorCanvas.getContext('2d', { willReadFrequently: true });
    
    // Состояние цветокоррекции
    state.colorGrading = {
      enabled: false,
      preset: 'none',
      
      // Color Wheels (Lift, Gamma, Gain)
      shadows: { r: 0, g: 0, b: 0 },      // Lift (тени)
      midtones: { r: 0, g: 0, b: 0 },     // Gamma (средние тона)
      highlights: { r: 0, g: 0, b: 0 },   // Gain (света)
      
      // Основные параметры
      exposure: 0,        // -2 до +2
      contrast: 0,        // -100 до +100
      saturation: 0,      // -100 до +100
      temperature: 0,     // -100 до +100 (теплее/холоднее)
      tint: 0,           // -100 до +100 (зелёный/пурпурный)
      
      // HSL
      hue: 0,            // -180 до +180
      
      // Curves (упрощённая версия)
      curvesRGB: {
        blacks: 0,       // Точка чёрного
        shadows: 0,      // Тени
        midtones: 0,     // Средние
        highlights: 0,   // Света  
        whites: 0        // Точка белого
      },
      
      // LUT
      lutData: null,
      lutSize: 33
    };
    
    /**
     * Голливудские пресеты
     */
    const CINEMA_PRESETS = {
      none: { name: 'Без обработки', params: {} },
      
      // Драматические пресеты
      teal_orange: {
        name: 'Teal & Orange (Blockbuster)',
        description: 'Классический голливудский look - холодные тени, тёплые света',
        params: {
          temperature: 15,
          shadows: { r: -10, g: 5, b: 15 },
          highlights: { r: 20, g: 10, b: -10 },
          saturation: 20,
          contrast: 15
        }
      },
      
      cinematic_blue: {
        name: 'Cinematic Blue',
        description: 'Холодный, драматический look для триллеров',
        params: {
          temperature: -25,
          tint: 10,
          shadows: { r: -15, g: -5, b: 20 },
          contrast: 25,
          saturation: -10
        }
      },
      
      warm_sunset: {
        name: 'Warm Sunset',
        description: 'Тёплый закатный свет',
        params: {
          temperature: 40,
          tint: -5,
          highlights: { r: 25, g: 15, b: 0 },
          exposure: 0.3,
          saturation: 15
        }
      },
      
      // Ретро стили
      vintage_film: {
        name: 'Vintage Film',
        description: 'Винтажный плёночный look',
        params: {
          contrast: -15,
          saturation: -20,
          shadows: { r: 10, g: 5, b: 0 },
          curvesRGB: { blacks: 20, whites: -10 }
        }
      },
      
      bleach_bypass: {
        name: 'Bleach Bypass',
        description: 'Отбеленный, высококонтрастный look',
        params: {
          saturation: -40,
          contrast: 35,
          exposure: 0.2
        }
      },
      
      // Современные стили
      modern_teal: {
        name: 'Modern Teal',
        description: 'Современный холодный look',
        params: {
          temperature: -20,
          shadows: { r: -10, g: 0, b: 15 },
          midtones: { r: -5, g: 5, b: 10 },
          saturation: 10,
          contrast: 20
        }
      },
      
      golden_hour: {
        name: 'Golden Hour',
        description: 'Золотой час - мягкий тёплый свет',
        params: {
          temperature: 35,
          tint: -10,
          highlights: { r: 30, g: 20, b: 5 },
          shadows: { r: 10, g: 5, b: -5 },
          exposure: 0.15,
          contrast: -5,
          saturation: 10
        }
      },
      
      // Специфичные жанры
      horror_green: {
        name: 'Horror Green',
        description: 'Зловещий зелёный оттенок для хорроров',
        params: {
          temperature: -10,
          tint: 40,
          shadows: { r: -15, g: 10, b: -10 },
          contrast: 30,
          saturation: -15
        }
      },
      
      sci_fi_blue: {
        name: 'Sci-Fi Blue',
        description: 'Футуристический синий для научной фантастики',
        params: {
          temperature: -35,
          tint: 15,
          midtones: { r: -20, g: 0, b: 25 },
          contrast: 25,
          saturation: 5
        }
      },
      
      noir_bw: {
        name: 'Film Noir',
        description: 'Чёрно-белый нуар с высоким контрастом',
        params: {
          saturation: -100,
          contrast: 40,
          curvesRGB: { blacks: 15, whites: -15 },
          shadows: { r: 0, g: 0, b: 0 }
        }
      }
    };
    
    /**
     * Применить цветокоррекцию к кадру
     */
    const applyColorGrading = (sourceCanvas) => {
      if (!state.colorGrading.enabled) return sourceCanvas;
      
      const width = sourceCanvas.width;
      const height = sourceCanvas.height;
      
      colorCanvas.width = width;
      colorCanvas.height = height;
      
      // Копируем исходный кадр
      colorCtx.drawImage(sourceCanvas, 0, 0);
      
      // Получаем пиксели
      const imageData = colorCtx.getImageData(0, 0, width, height);
      const data = imageData.data;
      
      const cg = state.colorGrading;
      
      // Применяем обработку к каждому пикселю
      for (let i = 0; i < data.length; i += 4) {
        let r = data[i];
        let g = data[i + 1];
        let b = data[i + 2];
        
        // 1. Exposure
        if (cg.exposure !== 0) {
          const mult = Math.pow(2, cg.exposure);
          r *= mult;
          g *= mult;
          b *= mult;
        }
        
        // 2. Temperature & Tint
        if (cg.temperature !== 0) {
          const temp = cg.temperature / 100;
          r += temp * 50;
          b -= temp * 50;
        }
        if (cg.tint !== 0) {
          const tint = cg.tint / 100;
          g += tint * 30;
        }
        
        // 3. Color Wheels (Lift, Gamma, Gain)
        // Shadows (Lift) - влияет больше на тёмные тона
        const shadowFactor = Math.max(0, 1 - (r + g + b) / (255 * 3));
        r += cg.shadows.r * shadowFactor * 2.55;
        g += cg.shadows.g * shadowFactor * 2.55;
        b += cg.shadows.b * shadowFactor * 2.55;
        
        // Midtones (Gamma) - влияет на средние тона
        const midFactor = 1 - Math.abs((r + g + b) / (255 * 3) - 0.5) * 2;
        r += cg.midtones.r * midFactor * 2.55;
        g += cg.midtones.g * midFactor * 2.55;
        b += cg.midtones.b * midFactor * 2.55;
        
        // Highlights (Gain) - влияет на светлые тона
        const highlightFactor = (r + g + b) / (255 * 3);
        r += cg.highlights.r * highlightFactor * 2.55;
        g += cg.highlights.g * highlightFactor * 2.55;
        b += cg.highlights.b * highlightFactor * 2.55;
        
        // 4. Contrast
        if (cg.contrast !== 0) {
          const factor = (259 * (cg.contrast + 255)) / (255 * (259 - cg.contrast));
          r = factor * (r - 128) + 128;
          g = factor * (g - 128) + 128;
          b = factor * (b - 128) + 128;
        }
        
        // 5. Saturation
        if (cg.saturation !== 0) {
          const gray = 0.299 * r + 0.587 * g + 0.114 * b;
          const sat = 1 + cg.saturation / 100;
          r = gray + (r - gray) * sat;
          g = gray + (g - gray) * sat;
          b = gray + (b - gray) * sat;
        }
        
        // 6. Curves (упрощённая версия)
        if (cg.curvesRGB.blacks !== 0) {
          const lift = cg.curvesRGB.blacks * 0.5;
          r += lift;
          g += lift;
          b += lift;
        }
        if (cg.curvesRGB.whites !== 0) {
          const gain = cg.curvesRGB.whites * 0.5;
          const factor = (r + g + b) / (255 * 3);
          r += gain * factor;
          g += gain * factor;
          b += gain * factor;
        }
        
        // Clamp значения
        data[i] = Math.max(0, Math.min(255, r));
        data[i + 1] = Math.max(0, Math.min(255, g));
        data[i + 2] = Math.max(0, Math.min(255, b));
      }
      
      // Записываем обработанные пиксели
      colorCtx.putImageData(imageData, 0, 0);
      
      return colorCanvas;
    };
    
    /**
     * Применить пресет
     */
    const applyPreset = (presetName) => {
      const preset = CINEMA_PRESETS[presetName];
      if (!preset) return;
      
      // Сбросить все параметры
      state.colorGrading = {
        ...state.colorGrading,
        enabled: presetName !== 'none',
        preset: presetName,
        exposure: 0,
        contrast: 0,
        saturation: 0,
        temperature: 0,
        tint: 0,
        hue: 0,
        shadows: { r: 0, g: 0, b: 0 },
        midtones: { r: 0, g: 0, b: 0 },
        highlights: { r: 0, g: 0, b: 0 },
        curvesRGB: { blacks: 0, shadows: 0, midtones: 0, highlights: 0, whites: 0 }
      };
      
      // Применить параметры пресета
      if (preset.params) {
        Object.assign(state.colorGrading, preset.params);
      }
      
      actions.recordLog('color-grading-preset', `Применён пресет: ${preset.name}`, {
        preset: presetName,
        description: preset.description
      });
      
      // Обновить UI
      updateColorGradingUI();
      
      console.log(`[Color Grading] Preset applied: ${preset.name}`);
    };
    
    /**
     * Обновить UI элементы
     */
    const updateColorGradingUI = () => {
      const cg = state.colorGrading;
      
      // Обновить все слайдеры если есть
      const updateSlider = (id, value) => {
        const slider = document.getElementById(id);
        const display = document.getElementById(`${id}-value`);
        if (slider) slider.value = value;
        if (display) display.textContent = value;
      };
      
      updateSlider('cg-exposure', cg.exposure);
      updateSlider('cg-contrast', cg.contrast);
      updateSlider('cg-saturation', cg.saturation);
      updateSlider('cg-temperature', cg.temperature);
      updateSlider('cg-tint', cg.tint);
      
      // Чекбокс включения
      const enableCheckbox = document.getElementById('cg-enable');
      if (enableCheckbox) enableCheckbox.checked = cg.enabled;
      
      // Пресет selector
      const presetSelect = document.getElementById('cg-preset');
      if (presetSelect) presetSelect.value = cg.preset;
    };
    
    /**
     * Экспорт функций для использования другими модулями
     */
    state.colorGradingAPI = {
      apply: applyColorGrading,
      applyPreset,
      getPresets: () => CINEMA_PRESETS,
      isEnabled: () => state.colorGrading.enabled,
      setEnabled: (enabled) => {
        state.colorGrading.enabled = enabled;
        updateColorGradingUI();
      }
    };
    
    console.log('[Color Grading] Blueprint initialized with', Object.keys(CINEMA_PRESETS).length, 'presets');
  }
});
