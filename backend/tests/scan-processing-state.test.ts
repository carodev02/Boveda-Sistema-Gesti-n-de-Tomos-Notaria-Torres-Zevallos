import { describe, expect, it } from "vitest";
import { canStartProcessing, friendlyProcessingError, processingStageLabels, processingSummary } from "../../src/services/scanProcessingState";

describe("estado real de Procesando", () => {
  it("inicia un PDF manual aunque no exista una sesión nativa", () => {
    expect(canStartProcessing({ phase: "processing", hasFile: true, started: false })).toBe(true);
  });
  it("no completa etapas que el backend todavía no confirmó", () => {
    expect(processingStageLabels("RUNNING_OCR", "OCR_PROCESSING")).toEqual([
      "En proceso",
      "Pendiente de implementación",
      "Pendiente de implementación",
      "Pendiente de implementación",
      "Pendiente de implementación",
    ]);
  });

  it("mapea cada etapa informada por el backend", () => {
    expect(processingStageLabels("EXTRACTING_FIELDS", "PROCESSING")[1]).toBe("En proceso");
    expect(processingStageLabels("LINKING_KARDEX", "PROCESSING")[2]).toBe("En proceso");
    expect(processingStageLabels("GENERATING_FILENAME", "PROCESSING")[3]).toBe("En proceso");
    expect(processingStageLabels("VALIDATING", "PROCESSING")[4]).toBe("En proceso");
  });

  it("marca revisión requerida y estados terminales", () => {
    expect(processingStageLabels("REVIEW_REQUIRED", "REVIEW_REQUIRED")[4]).toBe("Requiere revisión");
    expect(processingStageLabels("COMPLETED", "COMPLETED")).toEqual(Array(5).fill("Completado"));
    expect(processingSummary("COMPLETED", "COMPLETED").title).toBe("Procesamiento completado");
  });

  it("traduce errores técnicos sin exponerlos en pantalla", () => {
    expect(friendlyProcessingError("BACKEND_UNAVAILABLE")).toBe("No se pudo conectar con el servidor.");
    expect(friendlyProcessingError("PROCESSING_JOB_NOT_FOUND")).toBe("No se encontró el proceso de lectura.");
  });
});
