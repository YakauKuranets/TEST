import torch
import numpy as np

class DenoiseModel:
    def __init__(self, device="cuda"):
        self.device = device
        # Загрузка реальной модели (заглушка для примера)
        self.model = self._load_nafnet()

    def _load_nafnet(self):
        # Здесь ваша логика загрузки .pth файла
        return lambda x: x # Пока просто возвращаем вход

    def __call__(self, tensor: torch.Tensor):
        """
        ВХОД: torch.Tensor (B, C, H, W) в GPU
        ВЫХОД: torch.Tensor (B, C, H, W) в GPU
        """
        with torch.no_grad():
            # Нативная обработка в GPU без выхода в NumPy!
            return self.model(tensor)

def _load_nafnet():
    return DenoiseModel()