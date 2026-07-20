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
from pathlib import Path

import cv2
import fitz
import numpy as np


class OcrFailure(RuntimeError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def ocr_log(message: str) -> None:
    print(f"[OCR] {message}", file=sys.stderr, flush=True)


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
    pages_dir, processed_dir, output_dir = session / "pages", session / "processed", session / "output"
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
    processed = session / "processed"
    output = session / "document-clean.pdf"
    output.parent.mkdir(parents=True, exist_ok=True)
    selected = pages or sorted(processed.glob("page-*.png"))
    if isinstance(selected, list) and selected and isinstance(selected[0], dict):
        selected = [processed / f"page-{int(item['originalPageNumber']):04}.png" for item in selected if not item.get("excluded")]
    images = [fitz.Pixmap(str(path)) for path in selected if Path(path).is_file()]
    if not images:
        raise ValueError("No hay páginas procesadas para generar el PDF.")
    document = fitz.open()
    for image in images:
        page = document.new_page(width=image.width, height=image.height)
        page.insert_image(page.rect, pixmap=image)
        image = None
    document.save(output)
    document.close()
    return {"success": True, "cleanPdf": str(output), "pageCount": len(images)}


def recognize(source: Path, session: Path) -> dict:
    """Run page-by-page Spanish OCR outside React and preserve TSV geometry."""
    session.mkdir(parents=True, exist_ok=True)
    if not source.is_file():
        raise OcrFailure("TEMP_UPLOAD_NOT_FOUND", "No existe la carga temporal.")
    if source.stat().st_size <= 0 or source.read_bytes()[:4] != b"%PDF":
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
    with tempfile.TemporaryDirectory(prefix="sigadn-ocr-") as temp:
        for index, page in enumerate(document, start=1):
            ocr_log(f"Abriendo página {index}")
            ocr_log(f"Procesando página {index} de {document.page_count}")
            image = Path(temp) / f"page-{index:04}.png"
            try:
                pixmap = page.get_pixmap(matrix=fitz.Matrix(3, 3), alpha=False)
                pixmap.save(image)
            except Exception as error:
                raise OcrFailure("PAGE_RENDER_FAILED", f"No se pudo renderizar la página {index}: {error}") from error
            ocr_log("Imagen renderizada")
            rendered = cv2.imread(str(image), cv2.IMREAD_COLOR)
            if rendered is None:
                raise OcrFailure("IMAGE_PREPROCESSING_FAILED", f"No se pudo leer la imagen de la página {index}.")
            gray = cv2.cvtColor(rendered, cv2.COLOR_BGR2GRAY)
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
                        raise OcrFailure("OCR_ENGINE_FAILED", completed.stderr.strip() or "Tesseract terminó con error.")
                    tsv = base.with_suffix(".tsv")
                    if not tsv.is_file():
                        raise OcrFailure("OCR_ENGINE_FAILED", "Tesseract no generó el resultado TSV.")
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
            results.append({"pageNumber": index, "rawText": best["rawText"], "normalizedText": " ".join(best["rawText"].split()), "words": best["words"], "averageConfidence": best["averageConfidence"], "engine": "tesseract", "language": "spa", "width": page.rect.width, "height": page.rect.height, "requiresReview": len(best["rawText"].strip()) < 30 or best["averageConfidence"] < 45, "variant": best["variant"], "psm": best["psm"]})
    return {"pageCount": len(results), "pages": results}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("preprocess", "recognize", "generate_clean_pdf"))
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--session", required=True, type=Path)
    args = parser.parse_args()
    try:
        if args.command == "preprocess":
            result = preprocess(args.source, args.session)
        elif args.command == "recognize":
            result = recognize(args.source, args.session)
        else:
            result = generate_clean_pdf(args.session)
        print(json.dumps(result, ensure_ascii=False))
    except OcrFailure as error:
        print(f"{error.code}: {error}", file=sys.stderr)
        raise SystemExit(2)


if __name__ == "__main__":
    main()
