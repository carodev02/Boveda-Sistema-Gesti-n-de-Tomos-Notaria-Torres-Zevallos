import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadCleanPdfFromSession } from "../../src/services/documentUploadService";
import { ocrProcessingService } from "../../src/services/ocrProcessingService";

afterEach(() => vi.unstubAllGlobals());

describe("recorrido de procesamiento para PDF manual", () => {
  it("sube el PDF limpio, inicia OCR y consulta el primer estado", async () => {
    const responses = [
      { uploadId: "upload-12345678", documentId: "document-12345678", status: "UPLOADED", pageCount: 1 },
      { jobId: "job-12345678", status: "OCR_PROCESSING" },
      { jobId: "job-12345678", status: "OCR_PROCESSING", currentStage: "RUNNING_OCR", processedPages: 0, totalPages: 1 },
    ];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(responses.shift()), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const pdf = new Blob([new TextEncoder().encode("%PDF-1.4\n%%EOF")], { type: "application/pdf" });

    const upload = await uploadCleanPdfFromSession({ file: pdf, documentClass: "MINUTA", tomeNumber: "21", folioRangeStart: 22, folioRangeEnd: 24 });
    const job = await ocrProcessingService.start(upload.uploadId);
    const firstStatus = await ocrProcessingService.status(job.jobId);

    expect(fetchMock.mock.calls.map(call => String(call[0]))).toEqual([
      "/api/documents/uploads/from-scan",
      "/api/documents/upload-12345678/ocr/start",
      "/api/documents/job-12345678/job",
    ]);
    expect((fetchMock.mock.calls[0][1] as RequestInit).body).toBeInstanceOf(Blob);
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({'Content-Type':'application/pdf'});
    expect(upload).toMatchObject({ uploadId: "upload-12345678", pageCount: 1 });
    expect(job).toEqual({ jobId: "job-12345678", status: "OCR_PROCESSING" });
    expect(firstStatus.currentStage).toBe("RUNNING_OCR");
  });
});
