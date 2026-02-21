import numpy as np
import torch
from PIL import Image
import cv2

class SDInpaint:
    def __init__(self, weights_dir, device="cuda"):
        self.device = device
        # Заглушка загрузки (в реальности здесь будет StableDiffusionInpaintPipeline)
        self.pipe = None 

    def inpaint(self, image: np.ndarray, mask: np.ndarray, prompt: str = "clean background"):
        """
        Профессиональный Patch-based Inpainting.
        Не сжимает всё фото, а работает только с зоной маски.
        """
        h, w = image.shape[:2]
        
        # 1. Находим границы маски (Bounding Box)
        coords = np.column_stack(np.where(mask > 0))
        if coords.size == 0:
            return image
            
        y_min, x_min = coords.min(axis=0)
        y_max, x_max = coords.max(axis=0)
        
        # 2. Делаем запас (padding) 64 пикселя, чтобы нейросеть видела контекст вокруг
        pad = 64
        x1 = max(0, x_min - pad)
        y1 = max(0, y_min - pad)
        x2 = min(w, x_max + pad)
        y2 = min(h, y_max + pad)
        
        # 3. Вырезаем только фрагмент (Patch)
        patch = image[y1:y2, x1:x2]
        patch_mask = mask[y1:y2, x1:x2]
        
        # Запоминаем оригинальный размер патча
        ph, pw = patch.shape[:2]
        
        # 4. Только ПАТЧ сжимаем до 512 для нейросети
        patch_resized = cv2.resize(patch, (512, 512))
        mask_resized = cv2.resize(patch_mask, (512, 512))
        
        # --- Здесь происходит магия нейросети ---
        # В реальности: result_patch = self.pipe(prompt, image=patch_resized, mask=mask_resized)
        # Пока используем заглушку (OpenCV Telea) для теста скорости
        result_patch = cv2.inpaint(patch_resized, mask_resized, 3, cv2.INPAINT_TELEA)
        # ---------------------------------------
        
        # 5. Возвращаем патч к исходному размеру
        result_patch = cv2.resize(result_patch, (pw, ph))
        
        # 6. Аккуратно вклеиваем обработанный кусок обратно в 4K оригинал
        final_image = image.copy()
        final_image[y1:y2, x1:x2] = result_patch
        
        return final_image