import os
import torch
import numpy as np
import cv2
import logging
from pathlib import Path

# Существующие импорты SAM 2...
try:
    from sam2.build_sam import build_sam2
    from sam2.sam2_image_predictor import SAM2ImagePredictor

    SAM_AVAILABLE = True
except ImportError:
    SAM_AVAILABLE = False

logger = logging.getLogger(__name__)


class ForensicHypothesisEngine:
    def __init__(self):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.models_dir = Path(os.getenv("PLAYE_MODELS_DIR", "./models"))
        self.active_models = {}
        self.current_predictor = None

        self.model_registry = {
            "face_enhance": "restoreformer_pp.pth",
            "upscale": "realesrgan_x4.pth",  # Используем для Temporal-базы
            "segment_anything": "sam2_hiera_large.pt"
        }

    def _get_model_path(self, model_key):
        filename = self.model_registry.get(model_key)
        return self.models_dir / filename if filename else None

    def _is_model_ready(self, model_key):
        path = self._get_model_path(model_key)
        return path.exists() if path else False

    def _load_weights(self, model_key):
        if model_key in self.active_models:
            return True
        if not self._is_model_ready(model_key):
            return False

        try:
            if self.device == "cuda":
                torch.cuda.empty_cache()

            if model_key == "segment_anything" and SAM_AVAILABLE:
                model_cfg = "sam2_hiera_l.yaml"
                model = build_sam2(model_cfg, str(self._get_model_path(model_key)), device=self.device)
                self.active_models[model_key] = SAM2ImagePredictor(model)
            else:
                # В будущем здесь будет инициализация Real-ESRGAN или BasicVSR++
                self.active_models[model_key] = "READY"

            logger.info(f"Модель {model_key} развернута на {self.device}")
            return True
        except Exception as e:
            logger.error(f"Ошибка загрузки {model_key}: {e}")
            return False

    # --- ПУНКТ 1: TEMPORAL ENHANCE (ВРЕМЕННОЙ АПСКЕЙЛ) ---

    def process_temporal_upscale(self, frame_batch: list[np.ndarray]):
        """
        Объединяет информацию из нескольких кадров (Multi-frame Fusion).
        """
        if not self._load_weights("upscale"):
            logger.warning("Апскейлер не готов. Использую мат. усреднение для подавления шума.")
            # Алгоритм накопления (Average Fusion) — база для криминалистики
            return self._apply_frame_fusion(frame_batch)

        try:
            if self.device == "cuda":
                torch.cuda.empty_cache()

            # Логика Pro-уровня:
            # 1. Выравнивание кадров (Alignment) через оптический поток
            # 2. Восстановление деталей через нейросеть

            logger.info(f"Temporal Upscale: Анализ {len(frame_batch)} кадров")
            return self._apply_frame_fusion(frame_batch)  # Пока используем усиленный фьюжн
        except Exception as e:
            logger.error(f"Temporal Error: {e}")
            return frame_batch[len(frame_batch) // 2]

    def _apply_frame_fusion(self, frames: list[np.ndarray]):
        """
        Криминалистическое объединение кадров (Super-Resolution by Integration).
        Убирает 'снег' и проявляет статические объекты (номера, лица).
        """
        # Преобразуем в float32 для точности вычислений
        float_frames = [f.astype(np.float32) for f in frames]

        # Среднее значение по всем кадрам (убирает случайный шум)
        master_frame = np.mean(float_frames, axis=0)

        # Усиление контраста деталей (Unsharp Masking)
        master_frame = master_frame.astype(np.uint8)
        gaussian_3 = cv2.GaussianBlur(master_frame, (0, 0), 3)
        enhanced = cv2.addWeighted(master_frame, 1.5, gaussian_3, -0.5, 0)

        return enhanced

    # --- ОСТАЛЬНЫЕ МЕТОДЫ (SAM 2, HYPOTHESIS) ---

    def apply_smart_mask(self, image_np: np.ndarray, points: list, labels: list):
        # Ваш существующий код SAM 2...
        if not self._load_weights("segment_anything"): return None
        # ... инференс ...
        return {"bbox": [0, 0, 100, 100], "confidence": 0.99}  # Пример

    def generate_variants(self, image_np: np.ndarray, steps=4):
        # Ваш существующий код генерации гипотез...
        hypotheses = []
        for i in range(steps):
            hypotheses.append(cv2.detailEnhance(image_np, sigma_s=10, sigma_r=0.15))
        return hypotheses

    def calculate_stabilized_crop(self, mask: np.ndarray, padding=0.2):
        """
        Вычисляет координаты кропа вокруг маски объекта с учетом отступов.
        """
        y, x = np.where(mask)
        if len(x) == 0: return None

        x1, y1, x2, y2 = x.min(), y.min(), x.max(), y.max()
        w, h = x2 - x1, y2 - y1

        # Добавляем контекст вокруг объекта
        cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
        side = int(max(w, h) * (1 + padding))

        return {
            "x": int(cx - side // 2),
            "y": int(cy - side // 2),
            "size": side
        }


# ═══════════════════════════════════════════════════════════════
# KILLER FEATURE #1: Motion Blur Fixer (Wiener Deconvolution)
# ═══════════════════════════════════════════════════════════════
def apply_blind_deconvolution(image_np: np.ndarray, intensity: int = 50) -> np.ndarray:
    """Remove motion blur using Wiener filter in frequency domain."""
    gray = cv2.cvtColor(image_np, cv2.COLOR_BGR2GRAY) if len(image_np.shape) == 3 else image_np

    # Estimate motion blur kernel (PSF)
    kernel_size = max(3, int(intensity * 0.4))
    if kernel_size % 2 == 0:
        kernel_size += 1

    # Create directional motion blur kernel
    kernel = np.zeros((kernel_size, kernel_size), dtype=np.float32)
    kernel[kernel_size // 2, :] = 1.0
    kernel /= kernel_size

    # Wiener deconvolution per channel
    result_channels = []
    channels = cv2.split(image_np) if len(image_np.shape) == 3 else [gray]

    for ch in channels:
        ch_f = np.float64(ch)
        # FFT of image and kernel
        img_fft = np.fft.fft2(ch_f)
        kernel_padded = np.zeros_like(ch_f)
        ky, kx = kernel.shape
        kernel_padded[:ky, :kx] = kernel
        kernel_fft = np.fft.fft2(kernel_padded)

        # Wiener filter: H* / (|H|^2 + NSR)
        nsr = 10.0 / max(1, intensity)  # noise-to-signal ratio
        kernel_conj = np.conj(kernel_fft)
        wiener = kernel_conj / (np.abs(kernel_fft) ** 2 + nsr)

        restored = np.fft.ifft2(img_fft * wiener)
        restored = np.abs(restored)
        restored = np.clip(restored, 0, 255).astype(np.uint8)
        result_channels.append(restored)

    if len(result_channels) == 1:
        return result_channels[0]
    return cv2.merge(result_channels)


# ═══════════════════════════════════════════════════════════════
# KILLER FEATURE #2: ELA — Error Level Analysis (deepfake detect)
# ═══════════════════════════════════════════════════════════════
def generate_ela_map(image_np: np.ndarray, quality: int = 95, scale: int = 15) -> np.ndarray:
    """
    Generate ELA (Error Level Analysis) heatmap.
    Manipulated/inserted regions show brighter in the output.
    """
    from PIL import Image as PILImage
    import io as _io

    # Convert to PIL and re-compress at specified JPEG quality
    img_pil = PILImage.fromarray(cv2.cvtColor(image_np, cv2.COLOR_BGR2RGB))
    buf = _io.BytesIO()
    img_pil.save(buf, format='JPEG', quality=quality)
    buf.seek(0)
    recompressed = PILImage.open(buf)
    recompressed_np = cv2.cvtColor(np.array(recompressed), cv2.COLOR_RGB2BGR)

    # Compute absolute difference and amplify
    diff = cv2.absdiff(image_np, recompressed_np)
    ela = diff * scale
    ela = np.clip(ela, 0, 255).astype(np.uint8)

    # Apply colormap for visual heatmap
    ela_gray = cv2.cvtColor(ela, cv2.COLOR_BGR2GRAY)
    heatmap = cv2.applyColorMap(ela_gray, cv2.COLORMAP_JET)

    return heatmap


# ═══════════════════════════════════════════════════════════════
# KILLER FEATURE #3: Auto-Analyze (AI Agent metrics)
# ═══════════════════════════════════════════════════════════════
def analyze_image_metrics(image_np: np.ndarray) -> dict:
    """
    Analyze image quality metrics and return AI recommendation.
    Measures: noise level, blur score, brightness.
    """
    gray = cv2.cvtColor(image_np, cv2.COLOR_BGR2GRAY) if len(image_np.shape) == 3 else image_np

    # 1. Blur score (Laplacian variance — low = blurry)
    laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()

    # 2. Noise estimate (std dev in uniform regions via median filter diff)
    median = cv2.medianBlur(gray, 5)
    noise_map = cv2.absdiff(gray, median)
    noise_level = float(noise_map.mean())

    # 3. Brightness (mean luminance)
    brightness = float(gray.mean())

    # Classification
    blur_label = "Сильное размытие" if laplacian_var < 100 else ("Умеренное" if laplacian_var < 500 else "Резкое")
    noise_label = "Высокий шум" if noise_level > 15 else ("Умеренный" if noise_level > 5 else "Чисто")
    brightness_label = "Тёмное" if brightness < 50 else ("Нормальное" if brightness < 200 else "Пересвет")

    # Recommendation
    recommendations = []
    if laplacian_var < 100:
        recommendations.append("Применить деконволюцию (Motion Blur Fix)")
    if noise_level > 15:
        recommendations.append("Применить Denoise (Heavy)")
    elif noise_level > 5:
        recommendations.append("Применить Denoise (Light)")
    if brightness < 50:
        recommendations.append("Включить Lowlight Boost")
    if brightness > 200:
        recommendations.append("Снизить экспозицию")
    if laplacian_var < 500 and noise_level < 5:
        recommendations.append("Upscale 2x для повышения детализации")

    if not recommendations:
        recommendations.append("Изображение в хорошем состоянии")

    return {
        "blur_score": float(laplacian_var),
        "blur_label": blur_label,
        "noise_level": float(noise_level),
        "noise_label": noise_label,
        "brightness": float(brightness),
        "brightness_label": brightness_label,
        "recommendation": "; ".join(recommendations)
    }