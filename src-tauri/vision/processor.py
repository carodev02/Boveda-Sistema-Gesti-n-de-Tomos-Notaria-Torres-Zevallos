"""Procesamiento local de escaneos. No modifica nunca el archivo original de CZUR."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import tempfile
from pathlib import Path

import cv2
import fitz
import numpy as np


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
    output = session / "output" / "document-clean.pdf"
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
    document = fitz.open(source)
    tessdata = Path(__file__).with_name("tessdata")
    environment = os.environ.copy()
    environment["TESSDATA_PREFIX"] = str(tessdata)
    results = []
    with tempfile.TemporaryDirectory(prefix="sigadn-ocr-") as temp:
        for index, page in enumerate(document, start=1):
            image = Path(temp) / f"page-{index:04}.png"
            page.get_pixmap(matrix=fitz.Matrix(3, 3), alpha=False).save(image)
            base = Path(temp) / f"ocr-{index:04}"
            command = ["tesseract", str(image), str(base), "-l", "spa", "--psm", "6", "tsv"]
            completed = subprocess.run(command, env=environment, capture_output=True, text=True)
            if completed.returncode != 0:
                raise RuntimeError(completed.stderr.strip() or "No se pudo ejecutar Tesseract.")
            lines = (base.with_suffix(".tsv")).read_text(encoding="utf-8", errors="replace").splitlines()[1:]
            words = []
            for line in lines:
                columns = line.split("\t")
                if len(columns) < 12 or not columns[11].strip():
                    continue
                try:
                    words.append({"text": columns[11], "confidence": float(columns[10]), "x": int(columns[6]), "y": int(columns[7]), "width": int(columns[8]), "height": int(columns[9])})
                except ValueError:
                    continue
            raw_text = " ".join(word["text"] for word in words)
            results.append({"pageNumber": index, "rawText": raw_text, "normalizedText": " ".join(raw_text.split()), "words": words, "averageConfidence": sum(word["confidence"] for word in words) / len(words) if words else 0, "engine": "tesseract", "language": "spa", "width": page.rect.width, "height": page.rect.height})
    return {"pageCount": len(results), "pages": results}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("preprocess", "recognize", "generate_clean_pdf"))
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--session", required=True, type=Path)
    args = parser.parse_args()
    if args.command == "preprocess":
        result = preprocess(args.source, args.session)
    elif args.command == "recognize":
        result = recognize(args.source, args.session)
    else:
        result = generate_clean_pdf(args.session)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
