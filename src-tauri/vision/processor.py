"""Procesamiento local de escaneos. No modifica nunca el archivo original de CZUR."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import ctypes
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urlparse

import cv2
import fitz
import numpy as np


class OcrFailure(RuntimeError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def ocr_log(message: str) -> None:
    print(f"[OCR] {message}", file=sys.stderr, flush=True)


def progress_log(processed: int, total: int, started_at: float, failed: int = 0,
                 timed_processed: int | None = None, timed_total: int | None = None,
                 timed_started_at: float | None = None) -> None:
    elapsed = max(0.001, time.perf_counter() - started_at)
    measured_pages = processed if timed_processed is None else timed_processed
    measured_total = total if timed_total is None else timed_total
    measured_elapsed = max(0.001, time.perf_counter() - (timed_started_at or started_at))
    remaining = max(0, measured_total - measured_pages)
    estimate = round((measured_elapsed / measured_pages) * remaining, 1) if measured_pages else 0
    payload = {"processedPages": processed, "totalPages": total, "progress": round(processed / max(1, total) * 100), "elapsedSeconds": round(elapsed, 1), "estimatedSecondsRemaining": estimate, "failedPages": failed}
    print("PROGRESS " + json.dumps(payload), file=sys.stderr, flush=True)


def peak_memory_mb() -> float | None:
    if os.name != "nt":
        return None
    try:
        measured = subprocess.check_output(["powershell", "-NoProfile", "-Command", f"(Get-Process -Id {os.getpid()}).PeakWorkingSet64"], text=True, timeout=5)
        return round(int(measured.strip()) / 1024 / 1024, 2)
    except (OSError, ValueError, subprocess.SubprocessError):
        pass
    class Counters(ctypes.Structure):
        _fields_ = [("cb", ctypes.c_ulong), ("faults", ctypes.c_ulong), ("peak", ctypes.c_size_t), ("working", ctypes.c_size_t), ("quota_peak_paged", ctypes.c_size_t), ("quota_paged", ctypes.c_size_t), ("quota_peak_nonpaged", ctypes.c_size_t), ("quota_nonpaged", ctypes.c_size_t), ("pagefile", ctypes.c_size_t), ("peak_pagefile", ctypes.c_size_t)]
    counters = Counters()
    counters.cb = ctypes.sizeof(counters)
    if ctypes.windll.psapi.GetProcessMemoryInfo(ctypes.windll.kernel32.GetCurrentProcess(), ctypes.byref(counters), counters.cb):
        return round(counters.peak / 1024 / 1024, 2)
    return None


def has_pdf_signature(source: Path) -> bool:
    """Validate the header without loading a potentially very large PDF into RAM."""
    try:
        with source.open("rb") as handle:
            return handle.read(4) == b"%PDF"
    except OSError:
        return False


def valid_qr_url(value: str) -> str | None:
    """Extract and validate an explicit HTTP(S) URL without inventing a destination."""
    try:
        match = re.search(r"https?://[^\s<>\"']+", value.strip(), re.IGNORECASE)
        if not match:
            return None
        candidate = match.group(0).rstrip("),.;")
        parsed = urlparse(candidate)
        return candidate if parsed.scheme.lower() in ("http", "https") and bool(parsed.netloc) else None
    except ValueError:
        return None


def _qr_points_in_original(points: np.ndarray, rotation: int, width: int, height: int,
                           offset_x: float, offset_y: float, scale: float) -> np.ndarray:
    points = points.reshape(-1, 2).astype("float32")
    rotated = np.column_stack((points[:, 0] / scale + offset_x, points[:, 1] / scale + offset_y))
    x, y = rotated[:, 0], rotated[:, 1]
    if rotation == 90:
        return np.column_stack((y, height - 1 - x))
    if rotation == 180:
        return np.column_stack((width - 1 - x, height - 1 - y))
    if rotation == 270:
        return np.column_stack((width - 1 - y, x))
    return rotated


def detect_qr_codes(image: np.ndarray, page_number: int) -> list[dict]:
    """Decode QR at document resolution, including codes printed sideways."""
    detector = cv2.QRCodeDetector()
    height, width = image.shape[:2]
    rotations = [
        (0, image),
        (90, cv2.rotate(image, cv2.ROTATE_90_CLOCKWISE)),
        (180, cv2.rotate(image, cv2.ROTATE_180)),
        (270, cv2.rotate(image, cv2.ROTATE_90_COUNTERCLOCKWISE)),
    ]

    def decode(candidate: np.ndarray) -> list[tuple[str, np.ndarray]]:
        decoded: list[tuple[str, np.ndarray]] = []
        try:
            ok, values, points, _ = detector.detectAndDecodeMulti(candidate)
            if ok and points is not None:
                decoded.extend((str(value).strip(), np.asarray(box)) for value, box in zip(values, points) if str(value).strip())
        except (cv2.error, ValueError):
            pass
        if decoded:
            return decoded
        try:
            value, points, _ = detector.detectAndDecode(candidate)
            if str(value).strip() and points is not None:
                decoded.append((str(value).strip(), np.asarray(points)))
        except cv2.error:
            pass
        return decoded

    variants: list[tuple[str, int, np.ndarray]] = [
        ("color", rotation, candidate) for rotation, candidate in rotations
    ]
    variants.extend(
        ("gray", rotation, cv2.cvtColor(candidate, cv2.COLOR_BGR2GRAY))
        for rotation, candidate in rotations
    )
    for variant, rotation, candidate in variants:
        decoded = decode(candidate)
        if not decoded:
            continue
        detections = []
        for raw_value, points in decoded:
            original_points = _qr_points_in_original(points, rotation, width, height, 0, 0, 1)
            min_x, min_y = np.maximum(original_points.min(axis=0), 0)
            max_x, max_y = np.minimum(original_points.max(axis=0), (width - 1, height - 1))
            qr_url = valid_qr_url(raw_value)
            detections.append({"qrDetected": True, "qrRawValue": raw_value, "qrUrl": qr_url, "pageNumber": page_number, "boundingBox": {"x": float(min_x), "y": float(min_y), "width": float(max_x - min_x), "height": float(max_y - min_y)}, "requiresReview": qr_url is None, "decoder": "opencv-qrcode", "variant": f"full/{variant}/rotation-{rotation}"})
        return detections
    return []


def _detect_qr_pdf_page(source: Path, page_number: int) -> list[dict]:
    """Render a text-bearing PDF page because it can still contain a QR image."""
    document = fitz.open(source)
    try:
        page = document.load_page(page_number - 1)
        zoom = 2.8
        longest = max(page.rect.width, page.rect.height) * zoom
        if longest > 3000:
            zoom *= 3000 / longest
        pixmap = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
        image = np.frombuffer(pixmap.samples, dtype=np.uint8).reshape(pixmap.height, pixmap.width, pixmap.n)
        image = cv2.cvtColor(image, cv2.COLOR_RGBA2BGR if pixmap.n == 4 else cv2.COLOR_RGB2BGR)
        return detect_qr_codes(image, page_number)
    finally:
        document.close()


def ordered_points(points: np.ndarray) -> np.ndarray:
    points = points.astype("float32")
    result = np.zeros((4, 2), dtype="float32")
    sums = points.sum(axis=1)
    differences = np.diff(points, axis=1).reshape(-1)
    result[0], result[2] = points[np.argmin(sums)], points[np.argmax(sums)]
    result[1], result[3] = points[np.argmin(differences)], points[np.argmax(differences)]
    return result


def detect_sheet(image: np.ndarray) -> tuple[np.ndarray | None, float]:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    _, mask = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    image_area = image.shape[0] * image.shape[1]
    for contour in sorted(contours, key=cv2.contourArea, reverse=True):
        area_ratio = cv2.contourArea(contour) / image_area
        if area_ratio < 0.20:
            break
        perimeter = cv2.arcLength(contour, True)
        polygon = cv2.approxPolyDP(contour, 0.02 * perimeter, True)
        if len(polygon) == 4:
            confidence = min(0.99, area_ratio * 1.12)
            return ordered_points(polygon.reshape(4, 2)), confidence
    return None, 0.0


def perspective(image: np.ndarray, corners: np.ndarray) -> np.ndarray:
    tl, tr, br, bl = ordered_points(corners)
    width = int(max(np.linalg.norm(br - bl), np.linalg.norm(tr - tl)))
    height = int(max(np.linalg.norm(tr - br), np.linalg.norm(tl - bl)))
    if width < 32 or height < 32:
        raise ValueError("Las esquinas no forman una página válida.")
    destination = np.array([[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]], dtype="float32")
    return cv2.warpPerspective(image, cv2.getPerspectiveTransform(ordered_points(corners), destination), (width, height), borderValue=(255, 255, 255))


def normalized(corners: np.ndarray, width: int, height: int) -> dict:
    values = corners / np.array([width, height], dtype="float32")
    names = ("topLeft", "topRight", "bottomRight", "bottomLeft")
    return {name: {"x": float(point[0]), "y": float(point[1])} for name, point in zip(names, values)}


def preprocess(source: Path, session: Path) -> dict:
    pages_dir, processed_dir, output_dir = session / "pages" / "original", session / "pages" / "processed", session / "output"
    for directory in (pages_dir, processed_dir, output_dir):
        directory.mkdir(parents=True, exist_ok=True)
    document = fitz.open(source)
    pages = []
    matrix = fitz.Matrix(2.5, 2.5)
    for index, pdf_page in enumerate(document):
        pixmap = pdf_page.get_pixmap(matrix=matrix, alpha=False)
        original = pages_dir / f"page-{index + 1:04}.png"
        pixmap.save(original)
        image = cv2.imread(str(original), cv2.IMREAD_COLOR)
        corners, confidence = detect_sheet(image)
        requires_review = corners is None or confidence < 0.70
        clean = image if requires_review else perspective(image, corners)
        processed = processed_dir / f"page-{index + 1:04}.png"
        cv2.imwrite(str(processed), clean, [cv2.IMWRITE_PNG_COMPRESSION, 2])
        height, width = image.shape[:2]
        pages.append({
            "id": f"page-{index + 1}", "originalPageNumber": index + 1, "currentOrder": index,
            "width": int(clean.shape[1]), "height": int(clean.shape[0]), "resolution": 300,
            "rotation": 0, "excluded": False, "originalPreviewUrl": str(original),
            "processedPreviewUrl": str(processed),
            "detectedCorners": normalized(corners, width, height) if corners is not None else None,
            "cropConfidence": confidence, "perspectiveApplied": not requires_review,
            "requiresManualReview": requires_review,
            "transformations": ["AUTO_PERSPECTIVE"] if not requires_review else []
        })
    return {"pageCount": len(pages), "pages": pages}

def generate_clean_pdf(session: Path, pages: list[dict] | None = None) -> dict:
    processed = session / "pages" / "processed"
    output = session / "output" / "document-clean.pdf"
    output.parent.mkdir(parents=True, exist_ok=True)
    selected = pages or sorted(processed.glob("page-*.png"))
    if isinstance(selected, list) and selected and isinstance(selected[0], dict):
        selected = [processed / f"page-{int(item['originalPageNumber']):04}.png" for item in selected if not item.get("excluded")]
    selected = [Path(item) for item in selected if Path(item).is_file()]
    if not selected:
        raise ValueError("No hay páginas procesadas para generar el PDF.")
    document = fitz.open()
    for image_path in selected:
        image = fitz.Pixmap(str(image_path))
        page = document.new_page(width=image.width, height=image.height)
        page.insert_image(page.rect, pixmap=image)
        del image
    document.save(output, garbage=3, deflate=True)
    document.close()
    return {"success": True, "cleanPdf": str(output), "pageCount": len(selected)}


def recognize(source: Path, session: Path) -> dict:
    """Run page-by-page Spanish OCR outside React and preserve TSV geometry."""
    session.mkdir(parents=True, exist_ok=True)
    if not source.is_file():
        raise OcrFailure("TEMP_UPLOAD_NOT_FOUND", "No existe la carga temporal.")
    if source.stat().st_size <= 0 or not has_pdf_signature(source):
        raise OcrFailure("PDF_OPEN_FAILED", "La carga temporal no contiene un PDF válido.")
    ocr_log("PDF encontrado")
    ocr_log(f"Tamaño válido: {source.stat().st_size} bytes")
    try:
        document = fitz.open(source)
    except Exception as error:
        raise OcrFailure("PDF_OPEN_FAILED", f"PyMuPDF no pudo abrir el PDF: {error}") from error
    if document.page_count < 1:
        raise OcrFailure("PDF_OPEN_FAILED", "El PDF no contiene páginas.")
    ocr_log(f"Páginas: {document.page_count}")
    tessdata = Path(__file__).with_name("tessdata")
    if not (tessdata / "spa.traineddata").is_file():
        raise OcrFailure("TESSDATA_SPA_MISSING", "No está disponible el idioma español.")
    executable = os.environ.get("TESSERACT_EXECUTABLE") or shutil.which("tesseract")
    if not executable or not Path(executable).is_file():
        raise OcrFailure("TESSERACT_NOT_FOUND", "No se encontró el ejecutable de Tesseract.")
    environment = os.environ.copy()
    environment["TESSDATA_PREFIX"] = str(tessdata)
    results = []
    qr_codes = []
    with tempfile.TemporaryDirectory(prefix="sigadn-ocr-") as temp:
        for index, page in enumerate(document, start=1):
            ocr_log(f"Abriendo página {index}")
            ocr_log(f"Procesando página {index} de {document.page_count}")
            embedded_text = page.get_text("text").strip()
            if len(embedded_text) >= 80:
                page_qr_codes = _detect_qr_pdf_page(source, index)
                qr_codes.extend(page_qr_codes)
                results.append({"pageNumber": index, "rawText": embedded_text, "normalizedText": embedded_text, "words": [], "averageConfidence": 100, "engine": "pdf-text", "language": "spa", "requiresReview": False, "qrCodes": page_qr_codes})
                ocr_log(f"Página {index}: texto PDF existente conservado")
                continue
            image = Path(temp) / f"page-{index:04}.png"
            try:
                pixmap = page.get_pixmap(matrix=fitz.Matrix(3, 3), alpha=False)
                pixmap.save(image)
            except Exception as error:
                ocr_log(f"Página {index} requiere revisión: no se pudo renderizar")
                results.append({"pageNumber": index, "rawText": "", "normalizedText": "", "words": [], "averageConfidence": 0, "engine": "tesseract", "language": "spa", "requiresReview": True, "errorCode": "PAGE_RENDER_FAILED"})
                continue
            ocr_log("Imagen renderizada")
            rendered = cv2.imread(str(image), cv2.IMREAD_COLOR)
            if rendered is None:
                ocr_log(f"Página {index} requiere revisión: imagen no disponible")
                results.append({"pageNumber": index, "rawText": "", "normalizedText": "", "words": [], "averageConfidence": 0, "engine": "tesseract", "language": "spa", "requiresReview": True, "errorCode": "IMAGE_PREPROCESSING_FAILED"})
                continue
            gray = cv2.cvtColor(rendered, cv2.COLOR_BGR2GRAY)
            page_qr_codes = detect_qr_codes(rendered, index)
            qr_codes.extend(page_qr_codes)
            if page_qr_codes:
                ocr_log(f"QR decodificado en página {index}: {len(page_qr_codes)}")
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)
            adaptive = cv2.adaptiveThreshold(clahe, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 15)
            variants = [("original", rendered), ("grises", gray), ("clahe", clahe), ("adaptativa", adaptive)]
            ocr_log("Preprocesamiento completado")
            candidates = []
            for variant_index, (variant_name, variant) in enumerate(variants):
                if variant_index > 0 and candidates and len(candidates[0]["rawText"]) >= 80 and candidates[0]["averageConfidence"] >= 55:
                    break
                variant_path = Path(temp) / f"page-{index:04}-{variant_name}.png"
                cv2.imwrite(str(variant_path), variant)
                for psm in ([6] if variant_index == 0 else [3, 4, 6, 11]):
                    base = Path(temp) / f"ocr-{index:04}-{variant_name}-{psm}"
                    ocr_log(f"Tesseract iniciado: {variant_name}, PSM {psm}")
                    completed = subprocess.run([executable, str(variant_path), str(base), "-l", "spa", "--psm", str(psm), "-c", "tessedit_create_tsv=1"], env=environment, capture_output=True, text=True)
                    if completed.returncode != 0:
                        ocr_log(f"Variante fallida en página {index}: {variant_name}, PSM {psm}")
                        continue
                    tsv = base.with_suffix(".tsv")
                    if not tsv.is_file():
                        continue
                    words = []
                    for line in tsv.read_text(encoding="utf-8", errors="replace").splitlines()[1:]:
                        columns = line.split("\t")
                        if len(columns) < 12 or not columns[11].strip():
                            continue
                        try:
                            words.append({"text": columns[11], "confidence": float(columns[10]), "x": int(columns[6]), "y": int(columns[7]), "width": int(columns[8]), "height": int(columns[9])})
                        except ValueError:
                            continue
                    raw_text = " ".join(word["text"] for word in words)
                    confidence = sum(word["confidence"] for word in words) / len(words) if words else 0
                    labels = sum(label in raw_text.lower() for label in ("kardex", "minuta", "escritura", "notario", "foja"))
                    candidates.append({"rawText": raw_text, "words": words, "averageConfidence": confidence, "score": len(raw_text) + confidence * 2 + labels * 50, "variant": variant_name, "psm": psm})
            if not candidates:
                results.append({"pageNumber": index, "rawText": "", "normalizedText": "", "words": [], "averageConfidence": 0, "engine": "tesseract", "language": "spa", "requiresReview": True, "errorCode": "OCR_PAGE_EMPTY", "qrCodes": page_qr_codes})
                continue
            best = max(candidates, key=lambda item: item["score"])
            # El Kardex impreso suele estar aislado en el encabezado. Una lectura global
            # con alta confianza puede omitirlo aunque lea bien el cuerpo mecanografiado.
            page_mask = cv2.threshold(gray, 100, 255, cv2.THRESH_BINARY)[1]
            contours, _ = cv2.findContours(page_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if contours:
                px, py, pw, ph = cv2.boundingRect(max(contours, key=cv2.contourArea))
                sheet = rendered[py:py + ph, px:px + pw]
                serial_roi = sheet[int(ph * .02):int(ph * .17), int(pw * .08):int(pw * .47)]
                serial_path = Path(temp) / f"page-{index:04}-kardex.png"
                cv2.imwrite(str(serial_path), cv2.resize(serial_roi, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC))
                serial_base = Path(temp) / f"ocr-{index:04}-kardex"
                serial_run = subprocess.run([executable, str(serial_path), str(serial_base), "-l", "spa", "--psm", "11", "-c", "tessedit_create_txt=1"], env=environment, capture_output=True, text=True)
                serial_text = serial_base.with_suffix(".txt").read_text(encoding="utf-8", errors="replace") if serial_run.returncode == 0 and serial_base.with_suffix(".txt").is_file() else ""
                serial_candidates = re.findall(r"(?<!\d)\d{4,8}(?!\d)", serial_text.replace(" ", ""))
                if serial_candidates:
                    best["rawText"] += f"\nKARDEX_HEADER {serial_candidates[0]}"
                    ocr_log(f"Kardex de encabezado detectado: {serial_candidates[0]}")
                minute_roi = sheet[int(ph * .038):int(ph * .073), int(pw * .545):int(pw * .615)]
                minute_roi = cv2.resize(minute_roi, None, fx=5, fy=5, interpolation=cv2.INTER_CUBIC)
                minute_lab = cv2.cvtColor(minute_roi, cv2.COLOR_BGR2LAB)[:, :, 1]
                minute_mask = cv2.copyMakeBorder(255 - cv2.inRange(minute_lab, 135, 255), 40, 40, 40, 40, cv2.BORDER_CONSTANT, value=255)
                minute_path = Path(temp) / f"page-{index:04}-minute.png"
                cv2.imwrite(str(minute_path), minute_mask)
                minute_reads = []
                for minute_psm in (6, 7, 10, 11):
                    minute_base = Path(temp) / f"ocr-{index:04}-minute-{minute_psm}"
                    minute_run = subprocess.run([executable, str(minute_path), str(minute_base), "-l", "spa", "--psm", str(minute_psm), "-c", "tessedit_char_whitelist=0123456789", "-c", "tessedit_create_txt=1"], env=environment, capture_output=True, text=True)
                    minute_text = minute_base.with_suffix(".txt").read_text(encoding="utf-8", errors="replace") if minute_run.returncode == 0 and minute_base.with_suffix(".txt").is_file() else ""
                    minute_reads.extend(re.findall(r"\d{2,6}", minute_text))
                if minute_reads:
                    minute_number = max(set(minute_reads), key=minute_reads.count)
                    if minute_reads.count(minute_number) >= 2:
                        best["rawText"] += f"\nMINUTE_HEADER {minute_number}"
                        ocr_log(f"Minuta de encabezado detectada por consenso: {minute_number}")
            ocr_log(f"Resultado recibido: variante {best['variant']}, PSM {best['psm']}, confianza {best['averageConfidence']:.1f}")
            results.append({"pageNumber": index, "rawText": best["rawText"], "normalizedText": " ".join(best["rawText"].split()), "words": best["words"], "averageConfidence": best["averageConfidence"], "engine": "tesseract", "language": "spa", "width": page.rect.width, "height": page.rect.height, "requiresReview": len(best["rawText"].strip()) < 30 or best["averageConfidence"] < 45, "variant": best["variant"], "psm": best["psm"], "qrCodes": page_qr_codes})
    if not any(item.get("rawText", "").strip() for item in results):
        raise OcrFailure("OCR_RESULT_EMPTY", "Ninguna página produjo texto OCR utilizable.")
    return {"pageCount": len(results), "pages": results, "qrCodes": qr_codes}


def _useful_digital_text(text: str) -> bool:
    compact = " ".join(text.split())
    if len(compact) < int(os.environ.get("OCR_DIGITAL_TEXT_MIN", "80")):
        return False
    meaningful = sum(character.isalpha() or character.isdigit() for character in compact)
    return meaningful / max(1, len(compact)) >= .45


def _tesseract_candidate(executable: str, environment: dict, image: np.ndarray, base: Path,
                         variant: str, psm: int) -> dict | None:
    image_path = base.with_suffix(".png")
    cv2.imwrite(str(image_path), image, [cv2.IMWRITE_PNG_COMPRESSION, 1])
    output = base.parent / f"{base.name}-{variant}-{psm}"
    completed = subprocess.run([executable, str(image_path), str(output), "-l", "spa", "--psm", str(psm), "-c", "tessedit_create_tsv=1"], env=environment, capture_output=True, text=True, timeout=180)
    tsv = output.with_suffix(".tsv")
    if completed.returncode != 0 or not tsv.is_file():
        return None
    words = []
    for line in tsv.read_text(encoding="utf-8", errors="replace").splitlines()[1:]:
        columns = line.split("\t")
        if len(columns) < 12 or not columns[11].strip():
            continue
        try:
            words.append({"text": columns[11], "confidence": float(columns[10]), "x": int(columns[6]), "y": int(columns[7]), "width": int(columns[8]), "height": int(columns[9])})
        except ValueError:
            continue
    raw_text = " ".join(word["text"] for word in words)
    confidence = sum(word["confidence"] for word in words) / len(words) if words else 0
    labels = sum(label in raw_text.lower() for label in ("kardex", "minuta", "escritura", "notario", "foja"))
    return {"rawText": raw_text, "words": words, "averageConfidence": confidence, "score": len(raw_text) + confidence * 2 + labels * 50, "variant": variant, "psm": psm}


def _recognize_scanned_page(source: Path, page_number: int, executable: str, environment: dict,
                            temp: Path, directed: bool) -> tuple[dict, list[dict]]:
    document = fitz.open(source)
    page = document.load_page(page_number - 1)
    page_width, page_height = float(page.rect.width), float(page.rect.height)
    # 2.8 x 72 ~= 202 DPI. Bound the longest edge to protect RAM on atypical pages.
    zoom = 2.8
    longest = max(page.rect.width, page.rect.height) * zoom
    if longest > 3000:
        zoom *= 3000 / longest
    pixmap = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
    image = np.frombuffer(pixmap.samples, dtype=np.uint8).reshape(pixmap.height, pixmap.width, pixmap.n)
    if pixmap.n == 4:
        image = cv2.cvtColor(image, cv2.COLOR_RGBA2BGR)
    else:
        image = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
    document.close()
    qr_codes = detect_qr_codes(image, page_number)
    page_dir = temp / f"page-{page_number:04}"
    page_dir.mkdir(parents=True, exist_ok=True)
    # Fast pass first. Heavy variants are conditional, never unconditional.
    quick = _tesseract_candidate(executable, environment, image, page_dir / "quick", "original", 6)
    candidates = [quick] if quick else []
    if not quick or len(quick["rawText"]) < 50 or quick["averageConfidence"] < 42:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        gray_candidate = _tesseract_candidate(executable, environment, gray, page_dir / "gray", "gray", 3)
        if gray_candidate:
            candidates.append(gray_candidate)
        current = max(candidates, key=lambda item: item["score"]) if candidates else None
        if not current or len(current["rawText"]) < 25 or current["averageConfidence"] < 28:
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)
            clahe_candidate = _tesseract_candidate(executable, environment, clahe, page_dir / "clahe", "clahe", 6)
            if clahe_candidate:
                candidates.append(clahe_candidate)
    if not candidates:
        return ({"pageNumber": page_number, "rawText": "", "normalizedText": "", "words": [], "averageConfidence": 0, "engine": "tesseract", "language": "spa", "requiresReview": True, "errorCode": "OCR_PAGE_EMPTY"}, qr_codes)
    best = max(candidates, key=lambda item: item["score"])
    # Directed header OCR only where notarial fields are most likely or the fast pass was weak.
    if directed and len(best["rawText"]) < 40 and best["averageConfidence"] < 35:
        height, width = image.shape[:2]
        header = image[:max(1, int(height * .22)), :]
        header = cv2.resize(header, None, fx=1.6, fy=1.6, interpolation=cv2.INTER_CUBIC)
        header_candidate = _tesseract_candidate(executable, environment, header, page_dir / "header", "header", 11)
        if header_candidate and header_candidate["rawText"]:
            best["rawText"] += "\n" + header_candidate["rawText"]
    return ({"pageNumber": page_number, "rawText": best["rawText"], "normalizedText": " ".join(best["rawText"].split()), "words": best["words"], "averageConfidence": best["averageConfidence"], "engine": "tesseract-adaptive", "language": "spa", "width": page_width, "height": page_height, "requiresReview": len(best["rawText"].strip()) < 30 or best["averageConfidence"] < 45, "variant": best["variant"], "psm": best["psm"]}, qr_codes)


def recognize_hybrid(source: Path, session: Path) -> dict:
    started_at = time.perf_counter()
    session.mkdir(parents=True, exist_ok=True)
    if not source.is_file() or source.stat().st_size <= 0 or not has_pdf_signature(source):
        raise OcrFailure("PDF_OPEN_FAILED", "La carga temporal no contiene un PDF válido.")
    document = fitz.open(source)
    total = document.page_count
    if total < 1:
        raise OcrFailure("PDF_OPEN_FAILED", "El PDF no contiene páginas.")
    digital_pages, scanned_pages, digital_page_numbers = [], [], []
    for index in range(total):
        text = document.load_page(index).get_text("text")
        if _useful_digital_text(text):
            digital_pages.append({"pageNumber": index + 1, "rawText": text, "normalizedText": " ".join(text.split()), "words": [], "averageConfidence": 100, "engine": "pymupdf-digital", "language": "spa", "requiresReview": False})
            digital_page_numbers.append(index + 1)
        else:
            scanned_pages.append(index + 1)
    document.close()
    executable = os.environ.get("TESSERACT_EXECUTABLE") or shutil.which("tesseract")
    if scanned_pages and (not executable or not Path(executable).is_file()):
        raise OcrFailure("TESSERACT_NOT_FOUND", "No se encontró el ejecutable de Tesseract.")
    environment = os.environ.copy()
    environment.setdefault("OMP_THREAD_LIMIT", "1")
    bundled_tessdata = Path(__file__).with_name("tessdata")
    # Desktop builds can bundle their own Spanish language data, while the
    # Docker image installs it in Tesseract's system directory. Pointing
    # TESSDATA_PREFIX at a non-existent bundled directory makes every OCR
    # attempt fail even though tesseract-ocr-spa is installed in the image.
    if (bundled_tessdata / "spa.traineddata").is_file():
        environment["TESSDATA_PREFIX"] = str(bundled_tessdata)
    else:
        environment.pop("TESSDATA_PREFIX", None)
    results = list(digital_pages)
    qr_codes: list[dict] = []
    if digital_page_numbers:
        qr_workers = max(1, min(2, len(digital_page_numbers)))
        with ThreadPoolExecutor(max_workers=qr_workers, thread_name_prefix="qr-page") as qr_executor:
            qr_futures = {qr_executor.submit(_detect_qr_pdf_page, source, number): number for number in digital_page_numbers}
            for qr_future in as_completed(qr_futures):
                try:
                    qr_codes.extend(qr_future.result())
                except Exception as error:
                    ocr_log(f"QR no legible en página {qr_futures[qr_future]}: {error}")
    processed, failed = len(digital_pages), 0
    progress_log(processed, total, started_at)
    workers = max(1, min(int(os.environ.get("OCR_PAGE_WORKERS", "0")) or max(1, (os.cpu_count() or 2) // 2), 4, len(scanned_pages) or 1))
    # First pages are submitted first for early notarial-field availability.
    ordered = sorted(scanned_pages, key=lambda number: (number > 3, number))
    ocr_started_at = time.perf_counter()
    ocr_processed = 0
    with tempfile.TemporaryDirectory(prefix="sigadn-hybrid-") as temp_name:
        temp = Path(temp_name)
        with ThreadPoolExecutor(max_workers=workers, thread_name_prefix="ocr-page") as executor:
            futures = {executor.submit(_recognize_scanned_page, source, number, str(executable), environment, temp, number <= 3): number for number in ordered}
            for future in as_completed(futures):
                number = futures[future]
                try:
                    page, detected = future.result()
                    results.append(page)
                    qr_codes.extend(detected)
                    if page.get("errorCode"):
                        failed += 1
                except Exception as error:
                    failed += 1
                    results.append({"pageNumber": number, "rawText": "", "normalizedText": "", "words": [], "averageConfidence": 0, "engine": "tesseract-adaptive", "language": "spa", "requiresReview": True, "errorCode": "OCR_PAGE_FAILED", "error": str(error)[:300]})
                processed += 1
                ocr_processed += 1
                progress_log(processed, total, started_at, failed, ocr_processed, len(scanned_pages), ocr_started_at)
    results.sort(key=lambda item: item["pageNumber"])
    qr_codes.sort(key=lambda item: (int(item.get("pageNumber", 0)), str(item.get("qrRawValue", ""))))
    if not any(item.get("rawText", "").strip() for item in results):
        raise OcrFailure("OCR_RESULT_EMPTY", "Ninguna página produjo texto utilizable.")
    elapsed = time.perf_counter() - started_at
    return {"pageCount": total, "pages": results, "qrCodes": qr_codes, "metrics": {"elapsedSeconds": round(elapsed, 3), "secondsPerPage": round(elapsed / total, 3), "peakMemoryMb": peak_memory_mb(), "digitalPages": len(digital_pages), "ocrPages": len(scanned_pages), "failedPages": failed, "workers": workers}}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("preprocess", "recognize", "generate_clean_pdf"))
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--session", required=True, type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    try:
        if args.command == "preprocess":
            result = preprocess(args.source, args.session)
        elif args.command == "recognize":
            result = recognize_hybrid(args.source, args.session)
        else:
            result = generate_clean_pdf(args.session)
        serialized = json.dumps(result, ensure_ascii=False)
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(serialized, encoding="utf-8")
        else:
            print(serialized)
    except OcrFailure as error:
        print(f"{error.code}: {error}", file=sys.stderr)
        raise SystemExit(2)


if __name__ == "__main__":
    main()
