"""
Боевой модуль Real-ESRGAN для Super-Resolution (x2, x4, x8).
"""
import logging
import numpy as np
import torch
import cv2
from pathlib import Path

logger = logging.getLogger(__name__)

class RealESRGAN:
    def __init__(self, model_path: str, device: str = 'cuda'):
        self.device = device if torch.cuda.is_available() else 'cpu'
        self.model = self._load_model(model_path)

    def _load_model(self, model_path: str):
        try:
            from basicsr.archs.rrdbnet_arch import RRDBNet
            from realesrgan import RealESRGANer

            # Инициализируем архитектуру RRDBNet
            model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=4)

            upscaler = RealESRGANer(
                scale=4,
                model_path=model_path,
                model=model,
                tile=512, # Разбиваем на тайлы, чтобы не словить OOM на 4K
                tile_pad=10,
                pre_pad=0,
                half=(self.device == 'cuda'), # FP16 для ускорения в 2 раза
                device=self.device,
            )
            logger.info(f"Real-ESRGAN успешно загружен в {self.device.upper()}")
            return upscaler
        except Exception as e:
            logger.error(f"Ошибка загрузки Real-ESRGAN: {e}")
            return None

    def upscale(self, image: np.ndarray, scale: int = 2) -> np.ndarray:
        if self.model is None:
            logger.warning("Модель не загружена. Возврат исходника.")
            return image

        try:
            # Модель работает с BGR форматом (OpenCV)
            img_bgr = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)

            with torch.inference_mode():
                output_bgr, _ = self.model.enhance(img_bgr, outscale=scale)

            return cv2.cvtColor(output_bgr, cv2.COLOR_BGR2RGB)
        except Exception as e:
            logger.error(f"Сбой при апскейле: {e}")
            return image

    def load_realesrgan(device: str = 'cuda') -> RealESRGAN:
        from .model_paths import model_path
        weights = model_path("realesrgan")
        return RealESRGAN(str(weights), device)
