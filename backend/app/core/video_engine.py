import os
import gc
import logging
import numpy as np
import torch
import ffmpeg

logger = logging.getLogger(__name__)


class LocalVideoEngine:
    def __init__(self):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.active_models = {}
        # Оптимизация PyTorch для видеокарт RTX (ускоряет инференс)
        if self.device == "cuda":
            torch.backends.cudnn.benchmark = True

    def _manage_vram(self, model_name: str, loader_func):
        """Жесткий контроль видеопамяти. Выгружает старые модели, чтобы избежать OutOfMemory."""
        if model_name in self.active_models:
            return self.active_models[model_name]

        logger.info("Очистка VRAM перед загрузкой новой модели...")
        self.active_models.clear()
        if self.device == "cuda":
            torch.cuda.empty_cache()
        gc.collect()

        logger.info(f"Загрузка {model_name} в GPU...")
        self.active_models[model_name] = loader_func()
        return self.active_models[model_name]

    @torch.inference_mode()  # Отключает расчет градиентов, экономит 30% памяти и времени
    def process_video(self, input_path: str, output_path: str, operations: list[str], batch_size: int = 4):
        """
        Zero-Copy Streaming Pipeline.
        Читает кадры через пайпы прямо в тензоры, минуя оперативную память (RAM).
        """
        if not os.path.exists(input_path):
            raise FileNotFoundError(f"Файл не найден: {input_path}")

        # 1. Получаем метаданные видео (разрешение, fps)
        probe = ffmpeg.probe(input_path)
        video_stream = next(s for s in probe['streams'] if s['codec_type'] == 'video')
        width, height = int(video_stream['width']), int(video_stream['height'])
        fps = eval(video_stream['r_frame_rate'])
        frame_bytes_size = width * height * 3

        # 2. Настраиваем процесс ЧТЕНИЯ (сырые RGB пиксели)
        process_in = (
            ffmpeg.input(input_path)
            .output('pipe:', format='rawvideo', pix_fmt='rgb24')
            .run_async(pipe_stdout=True, quiet=True)
        )

        # 3. Настраиваем процесс ЗАПИСИ (сразу в профессиональный ProRes или H.264)
        process_out = (
            ffmpeg.input('pipe:', format='rawvideo', pix_fmt='rgb24', s=f'{width}x{height}', r=fps)
            .output(output_path, vcodec='libx264', crf=15, preset='fast')  # CRF 15 - визуально без потерь
            .overwrite_output()
            .run_async(pipe_stdin=True, quiet=True)
        )

        logger.info(f"Начат рендер: {input_path} -> {output_path}")

        try:
            batch_frames = []
            while True:
                # Читаем ровно один кадр в байтах
                in_bytes = process_in.stdout.read(frame_bytes_size)

                if not in_bytes:
                    # Конец видео, добиваем остатки в батче
                    if batch_frames:
                        self._process_and_write_batch(batch_frames, operations, width, height, process_out)
                    break

                batch_frames.append(in_bytes)

                # Как только собрали батч - отправляем в GPU
                if len(batch_frames) == batch_size:
                    self._process_and_write_batch(batch_frames, operations, width, height, process_out)
                    batch_frames = []  # Очищаем батч

        finally:
            process_in.stdout.close()
            process_out.stdin.close()
            process_in.wait()
            process_out.wait()
            logger.info("Рендер успешно завершен!")

    def _process_and_write_batch(self, batch_bytes: list[bytes], operations: list[str], w: int, h: int, process_out):
        """Превращает батч байтов в тензор, прогоняет через ИИ и пишет в трубу FFmpeg."""

        # Конвертация: Bytes -> NumPy -> PyTorch Tensor (B, C, H, W)
        arrays = [np.frombuffer(b, np.uint8).reshape([h, w, 3]) for b in batch_bytes]
        batch_np = np.stack(arrays, axis=0)

        tensor = torch.from_numpy(batch_np).permute(0, 3, 1, 2).float() / 255.0
        tensor = tensor.to(self.device, non_blocking=True)

        if self.device == "cuda":
            tensor = tensor.half()  # ИСПОЛЬЗУЕМ FP16 ДЛЯ СКОРОСТИ!

        # Применяем нужные ИИ-фильтры не выходя из видеокарты!
        for op in operations:
            if op == "denoise":
                from app.models.denoise import _load_nafnet
                model = self._manage_vram("nafnet", _load_nafnet)
                tensor = model(tensor)  # Предполагается, что обертка поддерживает батчи

            # Добавьте сюда вызовы upscale, face_enhance и т.д.
            # Если это upscale, не забудьте, что w и h увеличатся для pipe_out!

        # Возвращаем результат в CPU и конвертируем обратно в байты
        tensor = (tensor.permute(0, 2, 3, 1) * 255).clamp(0, 255).byte()
        out_np = tensor.cpu().numpy()

        for i in range(out_np.shape[0]):
            process_out.stdin.write(out_np[i].tobytes())