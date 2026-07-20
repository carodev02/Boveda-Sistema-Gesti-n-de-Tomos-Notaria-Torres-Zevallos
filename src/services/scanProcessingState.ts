export const processingStageNames = [
  "Lectura del documento",
  "Identificación de campos",
  "Búsqueda de kardex relacionado",
  "Preparación del nombre del archivo",
  "Validación",
] as const;

export function canStartProcessing(input:{phase:string;hasFile:boolean;started:boolean}) {
  return input.phase === "processing" && input.hasFile && !input.started;
}

export type ProcessingStageLabel =
  | "Pendiente"
  | "En proceso"
  | "Completado"
  | "Requiere revisión"
  | "Error"
  | "Pendiente de implementación";

const stageOrder: Record<string, number> = {
  PREPARING: 0,
  READING_PAGES: 0,
  RUNNING_OCR: 0,
  EXTRACTING_FIELDS: 1,
  LINKING_KARDEX: 2,
  GENERATING_FILENAME: 3,
  VALIDATING: 4,
};

export function processingStageLabels(currentStage?: string, status?: string): ProcessingStageLabel[] {
  if (status === "COMPLETED" || currentStage === "COMPLETED") return processingStageNames.map(() => "Completado");
  if (status === "REVIEW_REQUIRED" || currentStage === "REVIEW_REQUIRED") return ["Completado", "Completado", "Completado", "Completado", "Requiere revisión"];
  const current = stageOrder[currentStage ?? ""];
  if (current === undefined) return processingStageNames.map(() => status === "FAILED" ? "Error" : "Pendiente");
  return processingStageNames.map((_, index) => {
    if (index < current) return "Completado";
    if (index === current) return status === "FAILED" ? "Error" : "En proceso";
    return current <= 0 ? "Pendiente de implementación" : "Pendiente";
  });
}

export function processingSummary(currentStage?: string, status?: string) {
  if (status === "FAILED" || status === "CANCELLED") return { title: "Requiere atención", detail: "No se pudo completar el reconocimiento del documento." };
  if (status === "COMPLETED" || status === "REVIEW_REQUIRED" || currentStage === "COMPLETED" || currentStage === "REVIEW_REQUIRED") return { title: "Procesamiento completado", detail: "Los resultados están listos para revisión." };
  if (["EXTRACTING_FIELDS", "LINKING_KARDEX", "GENERATING_FILENAME", "VALIDATING"].includes(currentStage ?? "")) return { title: "Identificando campos", detail: "El sistema está buscando los datos notariales." };
  if (["READING_PAGES", "RUNNING_OCR"].includes(currentStage ?? "")) return { title: "Reconociendo contenido", detail: "El sistema está leyendo todas las páginas del documento." };
  if (status === "UPLOADING") return { title: "Enviando documento", detail: "El documento se está enviando para su lectura." };
  return { title: "Preparando documento", detail: "El documento se está enviando para su lectura." };
}

export function friendlyProcessingError(code?: string) {
  const messages: Record<string, string> = {
    UPLOAD_FAILED: "No se pudo enviar el documento.",
    OCR_START_FAILED: "No se pudo iniciar el reconocimiento.",
    OCR_ENGINE_FAILED: "No se pudo leer el documento.",
    BACKEND_UNAVAILABLE: "No se pudo conectar con el servidor.",
    PROCESSING_JOB_NOT_FOUND: "No se encontró el proceso de lectura.",
    READ_CLEAN_FAILED: "No se pudo leer el PDF preparado.",
  };
  return messages[code ?? ""] ?? "No se pudo completar el reconocimiento del documento.";
}
