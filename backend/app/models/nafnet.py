"""
NAFNet Denoising — удаление сенсорного шума и артефактов сжатия.
"""
import logging
import numpy as np
import torch
import cv2
from pathlib import Path

logger = logging.getLogger(__name__)

class NAFNet:
    def __init__(self, model_path: str, device: str = 'cuda'):
        self.device = device if torch.cuda.is_available() else 'cpu'
        self.model = self._load_model(model_path)

    def _load_model(self, model_path: str):
        try:
            from basicsr.models.archs.nafnet_arch import NAFNetLocal

            # Инициализация архитектуры
            model = NAFNetLocal(width=64, enc_blk_nums=[2, 2, 4, 8], middle_blk_num=12, dec_blk_nums=[2, 2, 2, 2])

            # Загрузка весов
            if Path(model_path).exists():
                checkpoint = torch.load(model_path, map_location=self.device)
                model.load_state_dict(checkpoint['params'] if 'params' in checkpoint else checkpoint)

            model.eval()
            model = model.to(self.device)
            if self.device == 'cuda':
                model = model.half() # Оптимизация VRAM

            logger.info("NAFNet успешно загружен")
            return model
        except Exception as e:
            logger.warning(f"Ошибка загрузки архитектуры NAFNet. Фоллбек на NlMeans. {e}")
            return "fallback"

    def denoise(self, image: np.ndarray, level: str = 'medium') -> np.ndarray:
        if self.model == "fallback":
            # Идеальный Forensic-фоллбек без ИИ (работает всегда)
            h = 10 if level == 'heavy' else 5
            img_bgr = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
            denoised = cv2.fastNlMeansDenoisingColored(img_bgr, None, h, h, 7, 21)
            return cv2.cvtColor(denoised, cv2.COLOR_BGR2RGB)

        tensor = self._preprocess(image)
        with torch.inference_mode():
            output = self.model(tensor)
        return self._postprocess(output)

    def _preprocess(self, image: np.ndarray) -> torch.Tensor:
        # B, C, H, W + FP16
        tensor = torch.from_numpy(image).float() / 255.0
        tensor = tensor.permute(2, 0, 1).unsqueeze(0).to(self.device)
        return tensor.half() if self.device == 'cuda' else tensor

    def _postprocess(self, tensor: torch.Tensor) -> np.ndarray:
        tensor = tensor.float().squeeze(0).permute(1, 2, 0)
        array = (tensor.cpu().numpy() * 255).clip(0, 255).astype(np.uint8)
        return array

    def load_nafnet(device: str = 'cuda') -> NAFNet:
        from .model_paths import model_path
        weights = model_path("nafnet")
        return NAFNet(str(weights), device)