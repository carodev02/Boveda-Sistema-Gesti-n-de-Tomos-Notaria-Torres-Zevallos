"""Benchmark reproducible del lector híbrido de SIGADN."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import fitz
import ctypes
from ctypes import wintypes


EXPECTED = ("KARDEX 765432", "MINUTA 2468", "FOJA 135", "COMPRAVENTA", "MARIA TORRES ZEVALLOS")


class ProcessMemoryCounters(ctypes.Structure):
    _fields_ = [("cb", wintypes.DWORD), ("PageFaultCount", wintypes.DWORD), ("PeakWorkingSetSize", ctypes.c_size_t), ("WorkingSetSize", ctypes.c_size_t), ("QuotaPeakPagedPoolUsage", ctypes.c_size_t), ("QuotaPagedPoolUsage", ctypes.c_size_t), ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t), ("QuotaNonPagedPoolUsage", ctypes.c_size_t), ("PagefileUsage", ctypes.c_size_t), ("PeakPagefileUsage", ctypes.c_size_t)]


def create_fixture(path: Path, pages: int, scanned: bool = False) -> None:
    document = fitz.open()
    for index in range(1, pages + 1):
        page = document.new_page(width=595, height=842)
        body = (
            f"NOTARIA TORRES ZEVALLOS - PAGINA {index} DE {pages}\n"
            "KARDEX 765432   MINUTA 2468   FOJA 135\n"
            "ESCRITURA PUBLICA - COMPRAVENTA\n"
            "CONTRATANTE: MARIA TORRES ZEVALLOS\n"
            "FECHA: 22/07/2026\n" + ("Texto legal de prueba para validar extracción digital. " * 12)
        )
        page.insert_textbox(fitz.Rect(48, 48, 547, 794), body, fontsize=10)
    if scanned:
        raster = fitz.open()
        for source_page in document:
            pixmap = source_page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
            target = raster.new_page(width=source_page.rect.width, height=source_page.rect.height)
            target.insert_image(target.rect, stream=pixmap.tobytes("jpeg", jpg_quality=82))
        raster.save(path, garbage=4, deflate=True)
        raster.close()
    else:
        document.save(path, garbage=4, deflate=True)
    document.close()


def benchmark(processor: Path, pdf: Path, pages: int, mode: str = "digital") -> dict:
    with tempfile.TemporaryDirectory(prefix="sigadn-benchmark-") as session:
        command = [sys.executable, str(processor), "recognize", "--source", str(pdf), "--session", session]
        started = time.perf_counter()
        stdout_path, stderr_path = Path(session) / "stdout.json", Path(session) / "stderr.log"
        with stdout_path.open("w", encoding="utf-8") as stdout_file, stderr_path.open("w", encoding="utf-8") as stderr_file:
            process = subprocess.Popen(command, stdout=stdout_file, stderr=stderr_file, text=True, encoding="utf-8")
            peak = 0
            process_handle = ctypes.windll.kernel32.OpenProcess(0x0410, False, process.pid)
            while process.poll() is None:
                counters = ProcessMemoryCounters()
                counters.cb = ctypes.sizeof(counters)
                if process_handle and ctypes.windll.psapi.GetProcessMemoryInfo(process_handle, ctypes.byref(counters), ctypes.sizeof(counters)):
                    peak = max(peak, int(counters.PeakWorkingSetSize))
                time.sleep(.02)
            if process_handle:
                ctypes.windll.kernel32.CloseHandle(process_handle)
        stdout, stderr = stdout_path.read_text(encoding="utf-8", errors="replace"), stderr_path.read_text(encoding="utf-8", errors="replace")
        elapsed = time.perf_counter() - started
        if process.returncode:
            raise RuntimeError(stderr[-2000:])
        result = json.loads(stdout)
        combined = " ".join(str(page.get("rawText", "")) for page in result["pages"]).upper()
        detected = sum(value in combined for value in EXPECTED)
        return {
            "mode": mode,
            "pages": pages,
            "elapsedSeconds": round(elapsed, 3),
            "millisecondsPerPage": round(elapsed * 1000 / pages, 2),
            "peakMemoryMb": result.get("metrics", {}).get("peakMemoryMb") or round(peak / 1024 / 1024, 2),
            "digitalPages": result.get("metrics", {}).get("digitalPages"),
            "ocrPages": result.get("metrics", {}).get("ocrPages"),
            "failedPages": result.get("metrics", {}).get("failedPages"),
            "expectedFieldsDetected": detected,
            "expectedFieldsTotal": len(EXPECTED),
            "fieldAccuracyPercent": round(detected / len(EXPECTED) * 100, 1),
        }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pages", nargs="+", type=int, default=[10, 50, 100, 300])
    parser.add_argument("--scanned-pages", type=int, default=0)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    processor = root / "src-tauri" / "vision" / "processor.py"
    output = []
    with tempfile.TemporaryDirectory(prefix="sigadn-fixtures-") as directory:
        for page_count in args.pages:
            pdf = Path(directory) / f"benchmark-{page_count}.pdf"
            create_fixture(pdf, page_count)
            output.append(benchmark(processor, pdf, page_count))
        if args.scanned_pages:
            pdf = Path(directory) / f"benchmark-scanned-{args.scanned_pages}.pdf"
            create_fixture(pdf, args.scanned_pages, scanned=True)
            output.append(benchmark(processor, pdf, args.scanned_pages, "scanned"))
    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
