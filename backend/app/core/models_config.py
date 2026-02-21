"""Centralized AI model manifest for PLAYE Studio Pro."""

from __future__ import annotations

MODELS_MANIFEST = {
    "restoration": [
        {"id": "restoreformer", "name": "RestoreFormer", "file": "restoreformer.pth", "url": "https://github.com/TencentARC/GFPGAN/releases/download/v1.3.4/RestoreFormer.pth", "desc": "Лица высокого качества"},
        {"id": "nafnet", "name": "NAFNet Deblur", "file": "nafnet_gopro.pth", "url": "https://github.com/megvii-research/NAFNet/releases/download/v1.0/NAFNet-GoPro-Width64.pth", "desc": "Удаление смаза"},
        {"id": "realesrgan_x4", "name": "Real-ESRGAN x4", "file": "realesrgan-x4plus.pth", "url": "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth", "desc": "Апскейл 4х"},
        {"id": "codeformer", "name": "CodeFormer", "file": "codeformer.pth", "url": "https://github.com/sczhou/CodeFormer/releases/download/v0.1.0/codeformer.pth", "desc": "Ультра-восстановление"},
    ],
    "analysis": [
        {"id": "sam2", "name": "SAM 2 Large", "file": "sam2_hiera_large.pt", "url": "https://dl.fbaipublicfiles.com/segment_anything_2/072824/sam2_hiera_large.pt", "desc": "Трекинг объектов"},
        {"id": "yolov10", "name": "YOLO v10x", "file": "yolov10x.pt", "url": "https://github.com/THU-MIG/yolov10/releases/download/v1.1/yolov10x.pt", "desc": "Детекция улик"},
        {"id": "depth_anything", "name": "Depth Anything v2", "file": "depth_anything_v2_vitb.pth", "url": "https://huggingface.co/depth-anything/Depth-Anything-V2-Base/resolve/main/depth_anything_v2_vitb.pth", "desc": "3D Глубина сцены"},
        {"id": "segment_anything", "name": "SAM Legacy", "file": "sam_vit_h.pth", "url": "https://dl.fbaipublicfiles.com/segment_anything/sam_vit_h_4b8939.pth", "desc": "Сегментация объектов"},
    ],
    "forensic": [
        {"id": "insightface", "name": "InsightFace", "file": "buffalo_l.zip", "url": "https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_l.zip", "desc": "Идентификация личности"},
        {"id": "ddcolor", "name": "DDColor", "file": "ddcolor_model.pth", "url": "https://modelscope.cn/api/v1/models/damo/cv_ddcolor_image-colorization/repo?Revision=master&FilePath=pytorch_model.pt", "desc": "Колоризация ч/б"},
        {"id": "paddle_ocr", "name": "PaddleOCR v4", "file": "ocr_models.zip", "url": "https://paddleocr.bj.bcebos.com/PP-OCRv4/rus/rus_PP-OCRv4_rec_distill_train.tar", "desc": "Распознавание текста"},
        {"id": "facefusion", "name": "FaceFusion", "file": "facefusion.onnx", "url": "https://github.com/facefusion/facefusion-assets/releases/download/models/facefusion.onnx", "desc": "Сверка лиц"},
    ],
    "video": [
        {"id": "rife", "name": "RIFE 4.22", "file": "rife422.pth", "url": "https://github.com/megvii-research/ECCV2022-RIFE/releases/download/rife/rife422.pth", "desc": "Интерполяция кадров"},
        {"id": "edvr", "name": "EDVR", "file": "edvrm.pth", "url": "https://github.com/xinntao/EDVR/releases/download/v0.1/EDVR_M.pth", "desc": "Видео супер-рез"},
        {"id": "bisenet", "name": "BiSeNet", "file": "bisenet.pth", "url": "https://github.com/zllrunning/face-parsing.PyTorch/releases/download/v1.0/79999_iter.pth", "desc": "Сегментация лица"},
        {"id": "scene3d", "name": "Scene3D", "file": "scene3d.pth", "url": "https://github.com/graphdeco-inria/gaussian-splatting/releases/download/assets/scene3d.pth", "desc": "3D реконструкция"},
    ],
}


def iter_models():
    for category, models in MODELS_MANIFEST.items():
        for model in models:
            yield category, model


import json
from pathlib import Path


def ensure_models_manifest_synced(models_root: str | Path = r"D:\PLAYE\models") -> Path:
    """Create/sync models_manifest.json in models storage for startup health guarantees."""
    root = Path(models_root)
    root.mkdir(parents=True, exist_ok=True)
    manifest_path = root / "models_manifest.json"
    payload = {"models": MODELS_MANIFEST}
    manifest_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest_path
