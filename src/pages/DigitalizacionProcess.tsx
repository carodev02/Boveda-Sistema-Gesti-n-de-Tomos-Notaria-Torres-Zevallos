import { useEffect, useMemo, useRef, useState } from "react";
import { Check, FileArchive, FileText } from "lucide-react";
import * as pdfjs from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { ContractorConflictAlert } from "../components/ContractorConflictAlert";
import { ExistingImports } from "../components/ExistingImports";
import { ScanAcquisition } from "../components/ScanAcquisition";
import { ScanControlPreview } from "../components/ScanControlPreview";
import {
  activeLegalActs,
  activeRegistryTypes,
  registryTypeById,
} from "../data/documentCatalogs";
import { saveDocument, type DocumentRecord } from "../data/repository";
import type {
  DocumentClass,
  ProcessingStatus,
  ReviewValues,
  ScanConfiguration,
  ScanSession,
} from "../domain/document-domain";
import { generateNormalizedFilename } from "../utils/documentFilename";
import { uploadCleanPdfFromSession } from "../services/documentUploadService";
import { ocrProcessingService } from "../services/ocrProcessingService";
import { scanWorkflowStore, useScanWorkflow } from "../services/scanWorkflowStore";
import { czurDesktop } from "../services/czurDesktop";
import "./digitalizacion.css";
import "../styles/digitalization-workflow.css";

type Mode = "scan" | "existing";
type Phase = "config" | "preview" | "processing" | "review" | "archived";
const emptyReview: ReviewValues = {
  kardexNumber: "",
  minuteNumber: "",
  printedFolio: "",
  instrumentType: "",
  instrumentNumber: "",
  destinationRegistryTypeId: "",
  destinationInstrumentNumber: "",
  documentDate: "",
  legalActId: "",
  primaryContractor: "",
  qrUrl: "",
};
const processingStages = [
  "Lectura del documento",
  "Identificación de campos",
  "Búsqueda de kardex relacionado",
  "Preparación del nombre del archivo",
  "Validación",
];
const PROCESS_STATUS_LABELS: Record<ProcessingStatus, string> = {
  COMPLETED: "PDF preparado",
  PENDING: "Pendiente",
  PROCESSING: "En proceso",
  FAILED: "Error",
};
const PROCESS_STAGE_LABELS: Record<ProcessingStatus, string> = {
  COMPLETED: "Completado",
  PENDING: "Pendiente",
  PROCESSING: "En proceso",
  FAILED: "Error",
};
function parseFolioRange(value: string) {
  const match = value.trim().match(/^(\d+)\s*(?:-|–|al)\s*(\d+)$/i);
  if (!match) return undefined;
  const start = Number(match[1]);
  const end = Number(match[2]);
  return start <= end ? { start, end } : undefined;
}
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export function DigitalizacionProcess() {
  const [mode, setMode] = useState<Mode>("scan");
  const [phase, setPhase] = useState<Phase>("config");
  const [config, setConfig] = useState<ScanConfiguration>({
    documentClass: "MINUTA",
    registryTypeId: "",
    tomeNumber: "",
    folioQuantity: "",
    period: String(new Date().getFullYear()),
  });
  const [file, setFile] = useState<File>();
  const [pages, setPages] = useState(0);
  const [message, setMessage] = useState("");
  const [processingStatus, setProcessingStatus] =
    useState<ProcessingStatus>("PENDING");
  const [review, setReview] = useState<ReviewValues>(emptyReview);
  const [saving, setSaving] = useState(false);
  const [scanInstance, setScanInstance] = useState(0);
  const workflow = useScanWorkflow();
  const processingStartedRef = useRef(false);
  const pollingActiveRef = useRef(false);
  const pollingTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const resultsLoadedRef = useRef(false);
  const reviewTransitionDoneRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const registryType = registryTypeById(config.registryTypeId);
  const periodValid =
    /^\d{4}(?:-\d{4})?$/.test(config.period) &&
    (!config.period.includes("-") ||
      Number(config.period.slice(0, 4)) <= Number(config.period.slice(5)));
  const tomeValid =
    Boolean(config.tomeNumber.trim()) ||
    Boolean(registryType && !registryType.tomeRequired);
  const folioRange = parseFolioRange(config.folioQuantity);
  const configReady = Boolean(
    config.documentClass &&
    folioRange &&
    periodValid &&
    tomeValid &&
    (config.documentClass === "MINUTA" || config.registryTypeId),
  );
  const normalizedName = useMemo(
    () =>
      generateNormalizedFilename({
        contractor: review.primaryContractor,
        kardexNumber: review.kardexNumber,
        documentLabel:
          config.documentClass === "MINUTA"
            ? "MINUTA"
            : review.instrumentType || "INSTRUMENTO",
        documentNumber:
          config.documentClass === "MINUTA" ? "" : review.instrumentNumber,
      }),
    [
      config.documentClass,
      review.instrumentNumber,
      review.instrumentType,
      review.kardexNumber,
      review.primaryContractor,
    ],
  );
  useEffect(() => { if (phase !== "processing" || !workflow.sessionId || !workflow.cleanPdfReady || processingStartedRef.current) return; processingStartedRef.current = true; pollingActiveRef.current = true; void (async () => { try { const upload = workflow.uploadId ? { uploadId: workflow.uploadId, documentId: workflow.documentId, status: workflow.uploadStatus ?? "READY_FOR_OCR" } : await uploadCleanPdfFromSession({ sessionId: workflow.sessionId!, documentClass: config.documentClass, registryTypeId: config.registryTypeId, tomeNumber: config.tomeNumber }); if (!workflow.uploadId) scanWorkflowStore.setUploadResult({ uploadId: upload.uploadId, documentId: upload.documentId, status: upload.status }); const job = workflow.ocrJobId ? { jobId: workflow.ocrJobId, status: workflow.ocrStatus ?? "QUEUED" } : await ocrProcessingService.start(upload.uploadId); if (!workflow.ocrJobId) scanWorkflowStore.setOcrJob(job.jobId, job.status); const poll = async () => { if (!pollingActiveRef.current) return; try { const current = await ocrProcessingService.status(job.jobId); if (["COMPLETED", "REVIEW_REQUIRED"].includes(current.status)) { if (!resultsLoadedRef.current) { resultsLoadedRef.current = true; scanWorkflowStore.setOcrResults(await ocrProcessingService.results(job.jobId)); } pollingActiveRef.current = false; setMessage("Reconocimiento completado"); if (!reviewTransitionDoneRef.current) { reviewTransitionDoneRef.current = true; setPhase("review"); } return; } if (["FAILED", "CANCELLED"].includes(current.status)) { pollingActiveRef.current = false; setMessage(current.status === "CANCELLED" ? "El procesamiento fue cancelado." : "No se pudo leer el documento."); return; } setMessage(current.status === "QUEUED" ? "Documento en espera de procesamiento" : `${current.processedPages ?? 0} / ${current.totalPages ?? 0} páginas`); pollingTimeoutRef.current = setTimeout(() => void poll(), 2000); } catch { setMessage("Reconectando con el procesamiento"); pollingTimeoutRef.current = setTimeout(() => void poll(), 3000); } }; void poll(); } catch (error) { pollingActiveRef.current = false; scanWorkflowStore.setUploadError(error instanceof Error ? error.message : "No se pudo procesar el documento."); setMessage("No se pudo procesar el documento."); } })(); return () => { pollingActiveRef.current = false; if (pollingTimeoutRef.current) clearTimeout(pollingTimeoutRef.current); }; }, [config.documentClass, config.registryTypeId, config.tomeNumber, phase, workflow.cleanPdfReady, workflow.ocrJobId, workflow.sessionId, workflow.uploadId]);
  function clearCurrentScan() {
    pollingActiveRef.current = false;
    if (pollingTimeoutRef.current) clearTimeout(pollingTimeoutRef.current);
    pollingTimeoutRef.current = undefined;
    processingStartedRef.current = false;
    resultsLoadedRef.current = false;
    reviewTransitionDoneRef.current = false;
    scanWorkflowStore.resetWorkflow();
    setFile(undefined);
    setPages(0);
    setReview(emptyReview);
    setProcessingStatus("PENDING");
    setSaving(false);
    setMessage("");
    if (fileRef.current) fileRef.current.value = "";
    setScanInstance((value) => value + 1);
  }
  function changeMode(next: Mode) {
    clearCurrentScan();
    setMode(next);
    setPhase("config");
  }
  async function selectPdf(selected?: File) {
    if (!selected) return;
    if (
      selected.type !== "application/pdf" &&
      !selected.name.toLowerCase().endsWith(".pdf")
    ) {
      setMessage("Solo se permiten archivos PDF.");
      return;
    }
    scanWorkflowStore.resetWorkflow();
    processingStartedRef.current = false;
    resultsLoadedRef.current = false;
    reviewTransitionDoneRef.current = false;
    setFile(selected);
    setMessage("");
    try {
      const bytes = new Uint8Array(await selected.arrayBuffer());
      const pdf = await pdfjs.getDocument({ data: bytes }).promise;
      setPages(pdf.numPages);
      setPhase("preview");
    } catch {
      setFile(undefined);
      setMessage("No se pudo abrir el PDF seleccionado.");
    }
  }
  async function receiveNativeSession(session: ScanSession) {
    scanWorkflowStore.setConfiguration(config);
    scanWorkflowStore.setSession(session);
    setMessage(session.error ?? "Sesión recibida desde SIGADN Desktop.");
    if (session.status === "READY_FOR_REVIEW") {
      try {
        const bytes = await czurDesktop.readOriginal(session.id);
        setFile(new File([new Uint8Array(bytes)], session.originalFileName ?? "scan-original.pdf", {type:"application/pdf"}));
        setPages(session.pageCount);
        setPhase("preview");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "No se pudo cargar la vista previa del PDF.");
      }
    }
  }
  function acceptCleanPdf(clean: File) {
    setFile(clean);
    setProcessingStatus("COMPLETED");
    setMessage(
      "PDF preparado correctamente. El reconocimiento documental se integrará en la siguiente fase.",
    );
    void import("../data/repository").then(({ addAudit }) =>
      addAudit(
        "CLEAN_PDF_GENERATED",
        "Centro de Digitalización",
        "Copia temporal document-clean.pdf",
      ),
    );
    setPhase("processing");
  }
  function openReview() {
    setReview(emptyReview);
    setPhase("review");
  }
  async function archiveDocument() {
    if (!file) return;
    const required = [
      review.kardexNumber,
      review.minuteNumber,
      review.printedFolio,
      review.legalActId,
      review.primaryContractor,
    ];
    if (config.documentClass === "REGISTRO_NOTARIAL")
      required.push(review.instrumentType, review.instrumentNumber);
    else required.push(review.destinationRegistryTypeId);
    if (required.some((value) => !String(value).trim())) {
      setMessage("Complete los campos obligatorios de la revisión mínima.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const [start, end] = config.period.split("-").map(Number);
      const acto =
        activeLegalActs().find((item) => item.id === review.legalActId)?.name ??
        "";
      const record: DocumentRecord = {
        id: Date.now(),
        documentMode: end ? "historico" : "actual",
        tipo:
          config.documentClass === "REGISTRO_NOTARIAL"
            ? (registryType?.name ?? "Registro notarial")
            : "Minuta",
        ano: end ? undefined : start,
        bienio: end ? config.period : undefined,
        tomo: config.tomeNumber,
        fojaInicial: Number(review.printedFolio) || undefined,
        fojaFinal: undefined,
        numeroMinuta: review.minuteNumber,
        actoJuridico: acto,
        kardex: review.kardexNumber,
        escritura:
          config.documentClass === "REGISTRO_NOTARIAL"
            ? review.instrumentNumber
            : review.destinationInstrumentNumber,
        contratantes: [review.primaryContractor],
        observaciones: "",
        fecha: review.documentDate,
        fechaRegistro: new Date().toLocaleDateString("es-PE"),
        cantidadPaginas: pages,
        documento: "En revisión",
        ocr: "Pendiente de integración",
        fileName: file.name,
        fileSize: file.size,
        file,
        source: "manual",
      };
      await saveDocument(record);
      setProcessingStatus("COMPLETED");
      setPhase("archived");
    } catch (error) {
      setProcessingStatus("FAILED");
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo archivar el documento.",
      );
    } finally {
      setSaving(false);
    }
  }
  function resetScan() {
    clearCurrentScan();
    setPhase("config");
  }
  return (
    <div className="page-content digitPage">
      <WorkflowSteps phase={phase} mode={mode} />
      <div
        className="documentMode centerMode"
        role="group"
        aria-label="Modalidad del Centro de Digitalización"
      >
        <button
          className={mode === "scan" ? "active" : ""}
          onClick={() => changeMode("scan")}
        >
          Escanear documento
        </button>
        <button
          className={mode === "existing" ? "active" : ""}
          onClick={() => changeMode("existing")}
        >
          Archivos existentes
        </button>
      </div>
      {mode === "existing" ? (
        <ExistingImports />
      ) : (
        <>
          {phase === "config" && (
            <>
              <Configuration
                config={config}
                setConfig={setConfig}
                periodValid={periodValid}
              />
              <ScanAcquisition
                key={scanInstance}
                config={config}
                ready={configReady}
                fileRef={fileRef}
                onManualFile={selectPdf}
                onSession={receiveNativeSession}
              />
            </>
          )}{" "}
          {phase === "preview" && file && (
            <ScanControlPreview
              file={file}
              pages={pages}
              onBack={() => setPhase("config")}
              onContinue={acceptCleanPdf}
            />
          )}{" "}
          {phase === "processing" && (
            <Processing
              file={file}
              status={processingStatus}
              message={message}
              onBack={() => setPhase("preview")}
              onContinue={openReview}
            />
          )}{" "}
          {phase === "review" && file && (
            <Review
              config={config}
              values={review}
              setValues={setReview}
              normalizedName={normalizedName}
              pages={pages}
              saving={saving}
              message={message}
              onBack={() => setPhase("preview")}
              onArchive={archiveDocument}
            />
          )}{" "}
          {phase === "archived" && (
            <Archived name={normalizedName} onReset={resetScan} />
          )}
        </>
      )}
    </div>
  );
}

function WorkflowSteps({ phase, mode }: { phase: Phase; mode: Mode }) {
  const active =
    mode === "existing"
      ? 0
      : { config: 0, preview: 1, processing: 2, review: 3, archived: 4 }[phase];
  return (
    <div className="workflowSteps">
      {[
        "Configuración mínima",
        "Control previo",
        "Procesando",
        "Revisión mínima",
        "Archivado",
      ].map((label, index) => (
        <div
          className={index < active ? "done" : index === active ? "active" : ""}
          key={label}
        >
          <span>{index < active ? <Check size={13} /> : index + 1}</span>
          <b>{label}</b>
        </div>
      ))}
    </div>
  );
}
function Configuration({
  config,
  setConfig,
  periodValid,
}: {
  config: ScanConfiguration;
  setConfig: React.Dispatch<React.SetStateAction<ScanConfiguration>>;
  periodValid: boolean;
}) {
  const registry = registryTypeById(config.registryTypeId);
  return (
    <section className="card config phaseOneConfig">
      <div className="stepHeading">
        <span>1</span>
        <h2 className="section-title">Configuración mínima</h2>
      </div>
      <div className="configGrid phaseOneGrid">
        <label>
          Clase documental *
          <select
            className="field"
            value={config.documentClass}
            onChange={(event) =>
              setConfig((value) => ({
                ...value,
                documentClass: event.target.value as DocumentClass,
                registryTypeId:
                  event.target.value === "MINUTA" ? "" : value.registryTypeId,
              }))
            }
          >
            <option value="MINUTA">Minuta</option>
            <option value="REGISTRO_NOTARIAL">Registro notarial</option>
          </select>
        </label>
        {config.documentClass === "REGISTRO_NOTARIAL" && (
          <label>
            Tipo de registro *
            <select
              className="field"
              value={config.registryTypeId}
              onChange={(event) =>
                setConfig((value) => ({
                  ...value,
                  registryTypeId: event.target.value,
                }))
              }
            >
              <option value="">Seleccionar...</option>
              {activeRegistryTypes().map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Número de tomo {registry?.tomeRequired === false ? "(opcional)" : "*"}
          <input
            className="field"
            value={config.tomeNumber}
            onChange={(event) =>
              setConfig((value) => ({
                ...value,
                tomeNumber: event.target.value,
              }))
            }
          />
        </label>
        <label>
          Rango de fojas del tomo *
          <input
            className="field"
            type="text"
            placeholder="11-22"
            value={config.folioQuantity}
            onChange={(event) =>
              setConfig((value) => ({
                ...value,
                folioQuantity: event.target.value,
                folioRangeStart: parseFolioRange(event.target.value)?.start,
                folioRangeEnd: parseFolioRange(event.target.value)?.end,
              }))
            }
          />
          <small>Ingrese el rango donde se ubican los documentos en el tomo.</small>
        </label>
        <label>
          Año o bienio *
          <input
            className={`field ${config.period && !periodValid ? "invalidField" : ""}`}
            value={config.period}
            placeholder="1995 o 1994-1995"
            onChange={(event) =>
              setConfig((value) => ({ ...value, period: event.target.value }))
            }
          />
        </label>
      </div>
    </section>
  );
}
function Processing({
  file,
  status,
  message,
  onBack,
  onContinue,
}: {
  file?: File;
  status: ProcessingStatus;
  message: string;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <section className="card processingCard phaseOneProcessing">
      <div className="stepHeading">
        <span>3</span>
        <h2 className="section-title">Procesando</h2>
      </div>
      <p className="processingFile">
        <FileText size={16} />
        {file?.name}
      </p>
      <div className={`processingNotice ${status.toLowerCase()}`}>
              <b>Estado: {PROCESS_STATUS_LABELS[status]}</b>
        <span>
          {message ||
            "PDF preparado correctamente. El reconocimiento documental se integrará en la siguiente fase."}
        </span>
      </div>
      <div className="stageList">
        {processingStages.map((stage) => (
          <div key={stage}>
            <span />
            <b>{stage}</b>
              <em>{PROCESS_STAGE_LABELS[status]}</em>
          </div>
        ))}
      </div>
      <footer className="qualityActions">
        <button className="btn" onClick={onBack}>
          Volver al Control previo
        </button>
        <button className="btn primary" disabled onClick={onContinue}>
          Reconocimiento pendiente
        </button>
      </footer>
    </section>
  );
}
function Review({
  config,
  values,
  setValues,
  normalizedName,
  pages,
  saving,
  message,
  onBack,
  onArchive,
}: {
  config: ScanConfiguration;
  values: ReviewValues;
  setValues: React.Dispatch<React.SetStateAction<ReviewValues>>;
  normalizedName: string;
  pages: number;
  saving: boolean;
  message: string;
  onBack: () => void;
  onArchive: () => void;
}) {
  const update = (key: keyof ReviewValues, value: string) =>
    setValues((current) => ({ ...current, [key]: value }));
  const registry = registryTypeById(config.registryTypeId);
  return (
    <section className="card validationCard phaseOneReview">
      <div className="stepHeading">
        <span>4</span>
        <div>
          <h2 className="section-title">Revisión mínima</h2>
          <p className="sectionSubtitle">
            Complete únicamente los datos requeridos para relacionar y archivar
            el documento.
          </p>
        </div>
      </div>
      <ContractorConflictAlert candidates={[]} />
      <div className="locationCard">
        <b>Ubicación documental</b>
        <dl>
          <dt>Clase documental</dt>
          <dd>
            {config.documentClass === "MINUTA" ? "Minuta" : "Registro notarial"}
          </dd>
          {config.documentClass === "REGISTRO_NOTARIAL" && (
            <>
              <dt>Tipo de registro</dt>
              <dd>{registry?.name}</dd>
            </>
          )}
          <dt>Número de tomo</dt>
          <dd>{config.tomeNumber || "No corresponde"}</dd>
          <dt>Rango de fojas del tomo</dt>
          <dd>{config.folioQuantity}</dd>
          <dt>Año o bienio</dt>
          <dd>{config.period}</dd>
          <dt>Páginas del PDF</dt>
          <dd>{pages}</dd>
        </dl>
      </div>
      <div className="reviewGrid domainReviewGrid">
        {config.documentClass === "REGISTRO_NOTARIAL" ? (
          <RegistryFields values={values} update={update} />
        ) : (
          <MinuteFields values={values} update={update} />
        )}
      </div>
      <div className="normalizedNamePreview">
        <b>Nombre normalizado futuro</b>
        <span>{normalizedName}</span>
        <small>El archivo original no será renombrado en esta fase.</small>
      </div>
      {message && <p className="validationError">{message}</p>}
      <footer className="qualityActions">
        <button className="btn" onClick={onBack}>
          Volver
        </button>
        <button className="btn primary" disabled={saving} onClick={onArchive}>
          {saving ? "Archivando…" : "Archivar documento"}
        </button>
      </footer>
    </section>
  );
}
function RegistryFields({
  values,
  update,
}: {
  values: ReviewValues;
  update: (key: keyof ReviewValues, value: string) => void;
}) {
  return (
    <>
      <Field
        label="Número de foja *"
        type="number"
        value={values.printedFolio}
        onChange={(value) => update("printedFolio", value)}
      />
      <Field
        label="Número de minuta *"
        value={values.minuteNumber}
        onChange={(value) => update("minuteNumber", value)}
      />
      <Field
        label="Número de kardex *"
        value={values.kardexNumber}
        onChange={(value) => update("kardexNumber", value)}
      />
      <Field
        label="Tipo de instrumento *"
        value={values.instrumentType}
        placeholder="Escritura, Acta, Poder..."
        onChange={(value) => update("instrumentType", value)}
      />
      <Field
        label="Número de instrumento *"
        value={values.instrumentNumber}
        onChange={(value) => update("instrumentNumber", value)}
      />
      <Field
        label="Contratante principal relacionado *"
        value={values.primaryContractor}
        onChange={(value) => update("primaryContractor", value)}
      />
      <LegalActField
        value={values.legalActId}
        onChange={(value) => update("legalActId", value)}
      />
      {values.qrUrl && (
        <Field
          label="URL de QR"
          type="url"
          value={values.qrUrl}
          onChange={(value) => update("qrUrl", value)}
        />
      )}
      <button
        className="manualAction qrAction"
        type="button"
        onClick={() => update("qrUrl", values.qrUrl ? "" : "https://")}
      >
        {values.qrUrl ? "Quitar URL de QR" : "Agregar URL de QR"}
      </button>
    </>
  );
}
function MinuteFields({
  values,
  update,
}: {
  values: ReviewValues;
  update: (key: keyof ReviewValues, value: string) => void;
}) {
  return (
    <>
      <Field
        label="Número de kardex *"
        value={values.kardexNumber}
        onChange={(value) => update("kardexNumber", value)}
      />
      <label>
        Tipo de registro de destino *
        <select
          className="field"
          value={values.destinationRegistryTypeId}
          onChange={(event) =>
            update("destinationRegistryTypeId", event.target.value)
          }
        >
          <option value="">Seleccionar...</option>
          {activeRegistryTypes().map((item) => (
            <option value={item.id} key={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <Field
        label="Número del instrumento de destino"
        value={values.destinationInstrumentNumber}
        onChange={(value) => update("destinationInstrumentNumber", value)}
      />
      <Field
        label="Número de minuta *"
        value={values.minuteNumber}
        onChange={(value) => update("minuteNumber", value)}
      />
      <Field
        label="Número de foja *"
        type="number"
        value={values.printedFolio}
        onChange={(value) => update("printedFolio", value)}
      />
      <Field
        label="Fecha"
        type="date"
        value={values.documentDate}
        onChange={(value) => update("documentDate", value)}
      />
      <LegalActField
        value={values.legalActId}
        onChange={(value) => update("legalActId", value)}
      />
      <Field
        label="Contratante principal *"
        value={values.primaryContractor}
        onChange={(value) => update("primaryContractor", value)}
      />
    </>
  );
}
function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label>
      {label}
      <input
        className="field"
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
function LegalActField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      Acto jurídico *
      <select
        className="field"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Seleccionar...</option>
        {activeLegalActs().map((item) => (
          <option value={item.id} key={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </label>
  );
}
function Archived({ name, onReset }: { name: string; onReset: () => void }) {
  return (
    <section className="card archivedCard">
      <FileArchive size={38} />
      <h2>Documento archivado</h2>
      <p>{name}</p>
      <button className="btn primary" onClick={onReset}>
        Digitalizar otro documento
      </button>
    </section>
  );
}
