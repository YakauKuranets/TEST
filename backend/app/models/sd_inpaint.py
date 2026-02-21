"""
Patch-based Inpainting на базе Stable Diffusion.
"""
import numpy as np
import torch
from PIL import Image
import cv2
import logging

logger = logging.getLogger(__name__)


class SDInpaint:
    def __init__(self, weights_dir: str, device: str = "cuda"):
        self.device = device if torch.cuda.is_available() else "cpu"
        self.pipe = self._load_model(weights_dir)

    def _load_model(self, weights_dir: str):
        try:
            from diffusers import StableDiffusionInpaintPipeline

            # Загружаем легковесную Inpaint-модель
            pipe = StableDiffusionInpaintPipeline.from_pretrained(
                "runwayml/stable-diffusion-inpainting",
                torch_dtype=torch.float16 if self.device == "cuda" else torch.float32,
                safety_checker=None
            )
            pipe = pipe.to(self.device)
            # Оптимизация памяти для слабых видеокарт
            pipe.enable_attention_slicing()
            logger.info("Stable Diffusion Inpaint готов к работе")
            return pipe
        except Exception as e:
            logger.warning(f"Ошибка загрузки SD Inpaint: {e}")
            return None

    def inpaint(self, image: np.ndarray, mask: np.ndarray,
                prompt: str = "clean, seamless background, high quality") -> np.ndarray:
        if self.pipe is None:
            return image

        h, w = image.shape[:2]
        coords = np.column_stack(np.where(mask > 0))
        if coords.size == 0:
            return image

        # 1. Вырезаем только фрагмент (Patch) с отступом 64px для контекста
        y_min, x_min = coords.min(axis=0)
        y_max, x_max = coords.max(axis=0)
        pad = 64
        x1, y1 = max(0, x_min - pad), max(0, y_min - pad)
        x2, y2 = min(w, x_max + pad), min(h, y_max + pad)

        patch = image[y1:y2, x1:x2]
        patch_mask = mask[y1:y2, x1:x2]
        ph, pw = patch.shape[:2]

        # 2. SD требует размер 512x512
        patch_resized = cv2.resize(patch, (512, 512))
        mask_resized = cv2.resize(patch_mask, (512, 512))

        patch_pil = Image.fromarray(patch_resized)
        mask_pil = Image.fromarray(mask_resized).convert("L")

        # 3. Инференс нейросети
        with torch.inference_mode():
            result_pil = self.pipe(
                prompt=prompt,
                image=patch_pil,
                mask_image=mask_pil,
                num_inference_steps=25
            ).images[0]

        # 4. Возвращаем оригинальный размер и вклеиваем обратно
        result_patch = cv2.resize(np.array(result_pil), (pw, ph))

        final_image = image.copy()
        alpha = (patch_mask > 0).astype(np.float32)[..., np.newaxis]
        final_image[y1:y2, x1:x2] = (result_patch * alpha + patch * (1 - alpha)).astype(np.uint8)

        return final_image

    def load_sd_inpaint(device: str = 'cuda') -> SDInpaint:
        from .model_paths import model_path
        weights = model_path("sd_inpaint")
        return SDInpaint(str(weights), device)