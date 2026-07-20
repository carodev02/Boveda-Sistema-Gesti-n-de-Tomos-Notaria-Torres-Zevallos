import { useEffect, useMemo, useRef, useState } from "react";
import { Check, FileArchive, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
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
import { generateNormalizedFilename,normalizePdfFilename } from "../utils/documentFilename";
import {processAcquiredDocument} from "../services/acquiredDocumentProcessing";
import { findOcrField,mergeOcrFieldsIntoReview, ocrProcessingService, reviewTargetsFromOcrFields, type OcrField } from "../services/ocrProcessingService";
import { scanWorkflowStore, useScanWorkflow } from "../services/scanWorkflowStore";
import { canStartProcessing, friendlyProcessingError, processingStageLabels, processingStageNames, processingSummary } from "../services/scanProcessingState";
import { ApiError } from "../services/apiClient";
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
function parseFolioRange(value: string) {
  const match = value.trim().match(/^(\d+)\s*(?:-|–|al)\s*(\d+)$/i);
  if (!match) return undefined;
  const start = Number(match[1]);
  const end = Number(match[2]);
  return start <= end ? { start, end } : undefined;
}
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
const processTrace=(message:string)=>{if(import.meta.env.DEV)console.debug(`[PROCESS] ${message}`)};
const shortId=(value:string)=>`${value.slice(0,8)}…`;

export function DigitalizacionProcess() {
  const navigate = useNavigate();
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
  const [proposedFileName,setProposedFileName]=useState("DOCUMENTO - REVISAR.pdf");
  const [existingFileNames,setExistingFileNames]=useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [applyingName,setApplyingName]=useState(false);
  const [appliedFilename,setAppliedFilename]=useState<string>();
  const [scanInstance, setScanInstance] = useState(0);
  const [processingAttempt, setProcessingAttempt] = useState(0);
  const workflow = useScanWorkflow();
  const processingStartedRef = useRef(false);
  const pollingActiveRef = useRef(false);
  const pollingTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const resultsLoadedRef = useRef(false);
  const reviewTransitionDoneRef = useRef(false);
  const manuallyEditedFieldsRef=useRef(new Set<keyof ReviewValues>());
  const ocrJobAppliedRef=useRef<string|undefined>(undefined);
  const processingEffectMountedRef = useRef(false);
  const phaseRef = useRef<Phase>(phase);
  phaseRef.current = phase;
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
        documentClass:config.documentClass,
        instrumentNumber:review.instrumentNumber,
        existingNames:existingFileNames,
      }),
    [
      config.documentClass,
      review.instrumentNumber,
      review.instrumentType,
      review.kardexNumber,
      review.primaryContractor,
      existingFileNames,
    ],
  );
  useEffect(()=>{void import("../data/repository").then(({getDocuments})=>getDocuments().then(rows=>setExistingFileNames(rows.map(row=>row.fileName))).catch(()=>undefined))},[]);
  useEffect(()=>{setProposedFileName(normalizedName)},[normalizedName]);
  useEffect(()=>{if(phase==='review')processTrace(`[REVIEW] campos mostrados: ${(scanWorkflowStore.get().extractedFields??[]).length}`)},[phase]);
  useEffect(()=>{
    const fields=workflow.extractedFields as OcrField[]|undefined;
    if(!fields?.length||!workflow.ocrJobId||ocrJobAppliedRef.current===workflow.ocrJobId)return;
    setReview(current=>mergeOcrFieldsIntoReview(current,fields,manuallyEditedFieldsRef.current));
    ocrJobAppliedRef.current=workflow.ocrJobId;
  },[workflow.extractedFields,workflow.ocrJobId]);
  useEffect(() => {
    processingEffectMountedRef.current = true;
    const cleanup = () => {
      processingEffectMountedRef.current = false;
      setTimeout(() => {
        if (processingEffectMountedRef.current && phaseRef.current === "processing") return;
        pollingActiveRef.current = false;
        if (pollingTimeoutRef.current) clearTimeout(pollingTimeoutRef.current);
      }, 0);
    };
    if (!canStartProcessing({phase, hasFile:Boolean(file), started:processingStartedRef.current})) return cleanup;
    const initial = scanWorkflowStore.get();
    processTrace("Inicio");
    processTrace(`Store: sessionId=${initial.sessionId ? shortId(initial.sessionId) : "ninguno"}, cleanPdfReady=${initial.cleanPdfReady || Boolean(file)}, uploadId=${initial.uploadId ? shortId(initial.uploadId) : "ninguno"}, documentId=${initial.documentId ? shortId(initial.documentId) : "ninguno"}, ocrJobId=${initial.ocrJobId ? shortId(initial.ocrJobId) : "ninguno"}, uploadStatus=${initial.uploadStatus ?? "ninguno"}, ocrStatus=${initial.ocrStatus ?? "ninguno"}, uploadError=${initial.uploadError ? "sí" : "no"}, ocrError=${initial.ocrError ? "sí" : "no"}`);
    if (initial.sessionId) processTrace("sessionId validado");
    processTrace("cleanPdfReady validado");
    processingStartedRef.current = true;
    pollingActiveRef.current = true;
    void (async () => {
      try {
        scanWorkflowStore.setProcessingProgress({ status: "UPLOADING", currentStage: "PREPARING" });
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30000);
        const acquired = await processAcquiredDocument({sessionId:initial.sessionId,sourceType:initial.sessionId?'CZUR':'MANUAL',state:initial,signal:controller.signal,metadata:{documentClass:config.documentClass,registryTypeId:config.registryTypeId,tomeNumber:config.tomeNumber,folioRangeStart:folioRange?.start,folioRangeEnd:folioRange?.end,year:/^\d{4}$/.test(config.period)?Number(config.period):undefined,bienniumStart:config.period.includes('-')?Number(config.period.slice(0,4)):undefined,bienniumEnd:config.period.includes('-')?Number(config.period.slice(5)):undefined,file}}).finally(()=>clearTimeout(timer));
        const {upload,job}=acquired;
        if (!initial.uploadId) scanWorkflowStore.setUploadResult({ ...upload, status: "COMPLETED" });
        processTrace(`Upload completado: ${shortId(upload.uploadId)}`);
        scanWorkflowStore.setProcessingProgress({ status: "UPLOADED", currentStage: "READING_PAGES", totalPages: "pageCount" in upload ? upload.pageCount : initial.totalPages });
        if (!initial.ocrJobId) scanWorkflowStore.setOcrJob(job.jobId, job.status);
        processTrace(`Job creado: ${shortId(job.jobId)}`);
        scanWorkflowStore.setProcessingProgress({ status: job.status, currentStage: "RUNNING_OCR", totalPages: "pageCount" in upload ? upload.pageCount : initial.totalPages });
        processTrace("Iniciando polling");
        const poll = async () => {
          if (!pollingActiveRef.current) return;
          try {
            const current = await ocrProcessingService.status(job.jobId);
            processTrace(`Estado recibido: ${current.status}${current.currentStage ? ` / ${current.currentStage}` : ""}`);
            scanWorkflowStore.setProcessingProgress(current);
            if (["COMPLETED", "REVIEW_REQUIRED"].includes(current.status)) {
              const results = await ocrProcessingService.results(job.jobId);
              processTrace(`Páginas procesadas: ${results.pages.length}`);
              processTrace(`Campos extraídos: ${results.fields.length}`);
              resultsLoadedRef.current = true;
              scanWorkflowStore.setOcrResults(results, current.status);
              processTrace('Resultados cargados');
              pollingActiveRef.current = false;
              if (!reviewTransitionDoneRef.current) {
                reviewTransitionDoneRef.current = true;
                setPhase("review");
              }
              return;
            }
            if (["FAILED", "CANCELLED"].includes(current.status)) {
              pollingActiveRef.current = false;
              scanWorkflowStore.setProcessingFailure(current.errorCode ?? "OCR_ENGINE_FAILED", current.error ?? undefined);
              return;
            }
            pollingTimeoutRef.current = setTimeout(() => void poll(), 2000);
          } catch (error) {
            pollingActiveRef.current = false;
            const code = error instanceof ApiError && error.status === 404 ? "PROCESSING_JOB_NOT_FOUND" : "BACKEND_UNAVAILABLE";
            const detail = error instanceof Error ? error.message : undefined;
            processTrace(`Error ${code}: ${detail ?? "sin detalle"}`);
            scanWorkflowStore.setProcessingFailure(code, detail);
          }
        };
        void poll();
      } catch (error) {
        pollingActiveRef.current = false;
        const readFailure = error instanceof Error && error.message === "No se pudo leer el PDF preparado.";
        const ocrStartFailure=error instanceof Error&&error.message.startsWith('OCR_START_FAILED:');
        const code = readFailure ? "READ_CLEAN_FAILED" : ocrStartFailure?'OCR_START_FAILED':error instanceof ApiError && error.status >= 500 || error instanceof DOMException && error.name === "AbortError" ? "BACKEND_UNAVAILABLE" : "UPLOAD_FAILED";
        const detail = readFailure ? "No se pudo leer el PDF preparado." : error instanceof Error ? error.message : undefined;
        processTrace(`Error ${code}: ${detail ?? "sin detalle"}`);
        scanWorkflowStore.setUploadError(detail);
        scanWorkflowStore.setProcessingFailure(code, detail);
      }
    })();
    return cleanup;
  }, [config.documentClass, config.folioQuantity, config.period, config.registryTypeId, config.tomeNumber, phase, file, processingAttempt]);
  function clearCurrentScan() {
    pollingActiveRef.current = false;
    if (pollingTimeoutRef.current) clearTimeout(pollingTimeoutRef.current);
    pollingTimeoutRef.current = undefined;
    processingStartedRef.current = false;
    resultsLoadedRef.current = false;
    reviewTransitionDoneRef.current = false;
    manuallyEditedFieldsRef.current.clear();
    ocrJobAppliedRef.current=undefined;
    scanWorkflowStore.resetWorkflow();
    setFile(undefined);
    setPages(0);
    setReview(emptyReview);
    setProcessingStatus("PENDING");
    setSaving(false);
    setAppliedFilename(undefined);
    setMessage("");
    if (fileRef.current) fileRef.current.value = "";
    setScanInstance((value) => value + 1);
  }
  function changeMode(next: Mode) {
    if(scanWorkflowStore.get().acquisitionMode!=='IDLE')return;
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
      scanWorkflowStore.finishAcquisition("FAILED");
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
      scanWorkflowStore.finishAcquisition("FAILED");
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
    scanWorkflowStore.resetProcessingState();
    scanWorkflowStore.setCleanPdfReady(true);
    setFile(clean);
    setProcessingStatus("PROCESSING");
    setMessage("");
    void import("../data/repository").then(({ addAudit }) =>
      addAudit(
        "CLEAN_PDF_GENERATED",
        "Centro de Digitalización",
        "Copia temporal document-clean.pdf",
      ),
    );
    setPhase("processing");
  }
  async function cancelPreview(){
    const state=scanWorkflowStore.get();const source=state.acquisitionMode==='CZUR'?'CZUR':'MANUAL';const sessionId=state.sessionId??state.acquisitionSessionId;
    scanWorkflowStore.finishAcquisition('CANCELLED');scanWorkflowStore.resetWorkflow();clearCurrentScan();setPhase('config');
    let partialFailure=false;
    if(source==='CZUR'&&sessionId){const timeout=new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('CANCEL_TIMEOUT')),4000));try{await Promise.race([czurDesktop.cancelSession(sessionId,true),timeout])}catch{partialFailure=true}}
    await import('../data/repository').then(({addAudit})=>addAudit('DOCUMENT_SCAN_CANCELLED','Centro de Digitalización',`Sesión ${sessionId?.slice(0,8)??'manual'} · Origen ${source} · Control previo`,partialFailure?'Parcial':'Exitoso')).catch(()=>{partialFailure=true});
    if(partialFailure)setMessage('No se pudo cancelar completamente la sesión. Puede restablecerla iniciando un nuevo documento.');
  }
  function retryProcessing() {
    if (workflow.processingErrorCode !== "BACKEND_UNAVAILABLE") scanWorkflowStore.clearOcrJob();
    processingStartedRef.current = false;
    resultsLoadedRef.current = false;
    reviewTransitionDoneRef.current = false;
    setProcessingAttempt((value) => value + 1);
  }
  async function applyProcessedName(){if(!file)return;setApplyingName(true);setMessage('');try{const safeName=normalizePdfFilename(proposedFileName,existingFileNames);const sessionId=scanWorkflowStore.get().sessionId;const finalName=sessionId?await czurDesktop.applyProcessedFilename(sessionId,safeName):safeName;scanWorkflowStore.setProcessedFilename(finalName);setFile(current=>current?new File([current],finalName,{type:'application/pdf',lastModified:current.lastModified}):current);setProposedFileName(finalName);setAppliedFilename(finalName);setMessage(`Nombre aplicado correctamente: ${finalName}`);return finalName}catch{setMessage('No se pudo aplicar el nombre a la copia procesada.');return undefined}finally{setApplyingName(false)}}
  async function confirmDocument() {
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
      const safeName = appliedFilename===proposedFileName?appliedFilename:await applyProcessedName();
      if(!safeName)throw new Error('No se pudo aplicar el nombre a la copia procesada.');
      const processedCopy = new File([file], safeName, {
        type: "application/pdf",
        lastModified: file.lastModified,
      });
      setProposedFileName(safeName);
      const [start, end] = config.period.split("-").map(Number);
      const acto =
        activeLegalActs().find((item) => item.id === review.legalActId)?.name ??
        "";
      const record: DocumentRecord = {
        id: Date.now(),
        // Todo documento confirmado por este flujo es un registro vigente de
        // Gestión Documental; el bienio describe su período, no su origen.
        documentMode: "actual",
        tipo:
          config.documentClass === "REGISTRO_NOTARIAL"
            ? (registryType?.name ?? "Registro notarial")
            : "Minuta",
        ano: end ? undefined : start,
        bienio: end ? config.period : undefined,
        bienniumStart: end ? start : undefined,
        bienniumEnd: end,
        tomo: config.tomeNumber,
        folioRangeStart: folioRange?.start,
        folioRangeEnd: folioRange?.end,
        printedFolio: Number(review.printedFolio) || undefined,
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
        documento: "CONFIRMED",
        ocr: "PROCESSED",
        fileName: safeName,
        fileSize: processedCopy.size,
        file: processedCopy,
        source: "manual",
        processingJobId: workflow.uploadId,
      };
      const saved = await saveDocument(record);
      const acquisition = scanWorkflowStore.get();
      if (acquisition.acquisitionMode === "CZUR" && acquisition.acquisitionSessionId)
        await czurDesktop.completeAcquisition(acquisition.acquisitionSessionId).catch(() => undefined);
      scanWorkflowStore.finishAcquisition("COMPLETED");
      setProcessingStatus("COMPLETED");
      navigate(`/documentos?confirmed=${encodeURIComponent(saved.backendId ?? String(saved.id))}`);
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
          disabled={workflow.acquisitionMode!=="IDLE"}
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
              onCancel={cancelPreview}
              onContinue={acceptCleanPdf}
            />
          )}{" "}
          {phase === "processing" && (
            <Processing
              workflow={workflow}
              pages={pages}
              origin={workflow.originalFilename ? "CZUR" : "PDF manual"}
              config={config}
              onBack={() => {
                const active = workflow.ocrJobId && !["COMPLETED", "REVIEW_REQUIRED", "FAILED", "CANCELLED"].includes(workflow.ocrStatus ?? "");
                if (!active || window.confirm("El reconocimiento sigue activo. Puede volver al Control previo sin perder el proceso.")) setPhase("preview");
              }}
              onRetry={retryProcessing}
            />
          )}{" "}
          {phase === "review" && file && (
            <Review
              config={config}
              values={review}
              setValues={setReview}
              onManualChange={(key,value)=>{manuallyEditedFieldsRef.current.add(key);setReview(current=>({...current,[key]:value}))}}
              normalizedName={normalizedName}
              proposedFileName={proposedFileName}
              setProposedFileName={setProposedFileName}
              pages={pages}
              saving={saving}
              applyingName={applyingName}
              appliedFilename={appliedFilename}
              message={message}
              reviewTargets={reviewTargetsFromOcrFields((workflow.extractedFields ?? []) as OcrField[])}
              ocrFields={(workflow.extractedFields??[]) as OcrField[]}
              onBack={() => setPhase("preview")}
              onConfirm={confirmDocument}
              onApplyName={applyProcessedName}
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
  workflow,
  pages,
  origin,
  config,
  onBack,
  onRetry,
}: {
  workflow: ReturnType<typeof useScanWorkflow>;
  pages: number;
  origin: "CZUR" | "PDF manual";
  config: ScanConfiguration;
  onBack: () => void;
  onRetry: () => void;
}) {
  const summary = processingSummary(workflow.currentStage, workflow.ocrStatus);
  const stageLabels = processingStageLabels(workflow.currentStage, workflow.ocrStatus);
  const terminal = ["COMPLETED", "REVIEW_REQUIRED"].includes(workflow.ocrStatus ?? "");
  const failed = workflow.ocrStatus === "FAILED" || Boolean(workflow.processingErrorCode);
  const folio = config.folioQuantity.trim() || "No indicado";
  return (
    <section className="card processingCard phaseOneProcessing">
      <div className="stepHeading">
        <span>3</span>
        <h2 className="section-title">Procesando</h2>
      </div>
      <p className="processingFile">
        <FileText size={16} />
        document-clean.pdf
      </p>
      <p className="sectionSubtitle">
        {workflow.processedPages !== undefined && workflow.totalPages ? `Procesando página ${Math.min(workflow.processedPages, workflow.totalPages)} de ${workflow.totalPages}` : `${workflow.totalPages ?? pages} páginas`}
        {workflow.progress !== undefined ? ` · ${workflow.progress}%` : ""}
        {` · Origen: ${origin} · ${config.documentClass} · Tomo ${config.tomeNumber || "No aplica"} · Fojas ${folio}`}
      </p>
      <div className={`processingNotice ${failed ? "failed" : terminal ? "completed" : "processing"}`}>
        <b>Estado: {summary.title}</b>
        <span>{failed ? friendlyProcessingError(workflow.processingErrorCode) : summary.detail}</span>
      </div>
      <div className="stageList">
        {processingStageNames.map((stage, index) => (
          <div key={stage}>
            <span />
            <b>{stage}</b>
            <em>{stageLabels[index]}</em>
          </div>
        ))}
      </div>
      <footer className="qualityActions">
        <button className="btn" disabled={terminal} onClick={onBack}>
          Volver al Control previo
        </button>
        {failed && <button className="btn primary" onClick={onRetry}>{workflow.processingErrorCode === "BACKEND_UNAVAILABLE" ? "Reanudar seguimiento" : "Reintentar reconocimiento"}</button>}
      </footer>
    </section>
  );
}
function Review({
  config,
  values,
  setValues,
  onManualChange,
  normalizedName,
  proposedFileName,
  setProposedFileName,
  pages,
  saving,
  applyingName,
  appliedFilename,
  message,
  reviewTargets,
  ocrFields,
  onBack,
  onConfirm,
  onApplyName,
}: {
  config: ScanConfiguration;
  values: ReviewValues;
  setValues: React.Dispatch<React.SetStateAction<ReviewValues>>;
  onManualChange:(key:keyof ReviewValues,value:string)=>void;
  normalizedName: string;
  proposedFileName:string;
  setProposedFileName:(value:string)=>void;
  pages: number;
  saving: boolean;
  applyingName:boolean;
  appliedFilename?:string;
  message: string;
  reviewTargets:Set<keyof ReviewValues>;
  ocrFields:OcrField[];
  onBack: () => void;
  onConfirm: () => void | Promise<void>;
  onApplyName:()=>void|Promise<unknown>;
}) {
  const update = onManualChange;
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
          <div><dt>Clase documental</dt><dd>
            {config.documentClass === "MINUTA" ? "Minuta" : "Registro notarial"}
          </dd></div>
          {config.documentClass === "REGISTRO_NOTARIAL" && (
            <div>
              <dt>Tipo de registro</dt>
              <dd>{registry?.name}</dd>
            </div>
          )}
          <div><dt>Número de tomo</dt><dd>{config.tomeNumber || "No corresponde"}</dd></div>
          <div><dt>Rango de fojas del tomo</dt><dd>{config.folioQuantity || "No corresponde"}</dd></div>
          <div><dt>Año o bienio</dt><dd>{config.period}</dd></div>
          <div><dt>Páginas del PDF</dt><dd>{pages}</dd></div>
        </dl>
      </div>
      <div className="reviewGrid domainReviewGrid">
        {config.documentClass === "REGISTRO_NOTARIAL" ? (
          <RegistryFields values={values} update={update} reviewTargets={reviewTargets} ocrFields={ocrFields}/>
        ) : (
          <MinuteFields values={values} update={update} reviewTargets={reviewTargets} ocrFields={ocrFields}/>
        )}
      </div>
      <div className="normalizedNamePreview">
        <b>Nombre propuesto del archivo</b>
        <input className="field" aria-label="Nombre propuesto del archivo" value={proposedFileName} onChange={event=>setProposedFileName(event.target.value)}/>
        <small>Sugerencia actual: {normalizedName}. El archivo original exportado por CZUR no será renombrado.</small>
      </div>
      {message && <p className="validationError">{message}</p>}
      <footer className="qualityActions">
        <button className="btn" onClick={onBack}>
          Volver
        </button>
        <button className="btn" disabled={applyingName||saving} onClick={onApplyName}>{applyingName?'Aplicando nombre…':'Aplicar nombre a la copia procesada'}</button>
        <button className="btn primary" disabled={saving||applyingName} onClick={onConfirm}>
          {saving ? "Confirmando…" : "Confirmar documento"}
        </button>
      </footer>
      {appliedFilename&&<small>Nombre final aplicado: {appliedFilename}</small>}
    </section>
  );
}
function RegistryFields({
  values,
  update,
  reviewTargets,
  ocrFields,
}: {
  values: ReviewValues;
  update: (key: keyof ReviewValues, value: string) => void;
  reviewTargets:Set<keyof ReviewValues>;
  ocrFields:OcrField[];
}) {
  return (
    <>
      <Field
        label="Número de foja *"
        type="number"
        value={values.printedFolio}
        requiresReview={reviewTargets.has("printedFolio")}
        evidence={findOcrField(ocrFields,"printedFolio")}
        onChange={(value) => update("printedFolio", value)}
      />
      <Field
        label="Número de minuta *"
        value={values.minuteNumber}
        requiresReview={reviewTargets.has("minuteNumber")}
        evidence={findOcrField(ocrFields,"minuteNumber")}
        onChange={(value) => update("minuteNumber", value)}
      />
      <Field
        label="Número de kardex *"
        value={values.kardexNumber}
        requiresReview={reviewTargets.has("kardexNumber")}
        evidence={findOcrField(ocrFields,"kardexNumber")}
        onChange={(value) => update("kardexNumber", value)}
      />
      <Field
        label="Tipo de instrumento *"
        value={values.instrumentType}
        requiresReview={reviewTargets.has("instrumentType")}
        evidence={findOcrField(ocrFields,"instrumentType")}
        placeholder="Escritura, Acta, Poder..."
        onChange={(value) => update("instrumentType", value)}
      />
      <Field
        label="Número de instrumento *"
        value={values.instrumentNumber}
        requiresReview={reviewTargets.has("instrumentNumber")}
        evidence={findOcrField(ocrFields,"instrumentNumber")}
        onChange={(value) => update("instrumentNumber", value)}
      />
      <Field
        label="Contratante principal relacionado *"
        value={values.primaryContractor}
        requiresReview={reviewTargets.has("primaryContractor")}
        evidence={findOcrField(ocrFields,"primaryContractor")}
        onChange={(value) => update("primaryContractor", value)}
      />
      <LegalActField
        value={values.legalActId}
        requiresReview={reviewTargets.has("legalActId")}
        evidence={findOcrField(ocrFields,"legalActId")}
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
  reviewTargets,
  ocrFields,
}: {
  values: ReviewValues;
  update: (key: keyof ReviewValues, value: string) => void;
  reviewTargets:Set<keyof ReviewValues>;
  ocrFields:OcrField[];
}) {
  return (
    <>
      <Field
        label="Número de kardex *"
        value={values.kardexNumber}
        requiresReview={reviewTargets.has("kardexNumber")}
        evidence={findOcrField(ocrFields,"kardexNumber")}
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
        {reviewTargets.has("destinationRegistryTypeId")&&<small className="reviewHint">Requiere revisión</small>}
        <EvidenceAction field={findOcrField(ocrFields,"destinationRegistryTypeId")}/>
      </label>
      <Field
        label="Número del instrumento de destino"
        value={values.destinationInstrumentNumber}
        requiresReview={reviewTargets.has("destinationInstrumentNumber")}
        evidence={findOcrField(ocrFields,"destinationInstrumentNumber")}
        onChange={(value) => update("destinationInstrumentNumber", value)}
      />
      <Field
        label="Número de minuta *"
        value={values.minuteNumber}
        requiresReview={reviewTargets.has("minuteNumber")}
        evidence={findOcrField(ocrFields,"minuteNumber")}
        onChange={(value) => update("minuteNumber", value)}
      />
      <Field
        label="Número de foja *"
        type="number"
        value={values.printedFolio}
        requiresReview={reviewTargets.has("printedFolio")}
        evidence={findOcrField(ocrFields,"printedFolio")}
        onChange={(value) => update("printedFolio", value)}
      />
      <Field
        label="Fecha"
        type="date"
        value={values.documentDate}
        requiresReview={reviewTargets.has("documentDate")}
        evidence={findOcrField(ocrFields,"documentDate")}
        onChange={(value) => update("documentDate", value)}
      />
      <LegalActField
        value={values.legalActId}
        requiresReview={reviewTargets.has("legalActId")}
        evidence={findOcrField(ocrFields,"legalActId")}
        onChange={(value) => update("legalActId", value)}
      />
      <Field
        label="Contratante principal *"
        value={values.primaryContractor}
        requiresReview={reviewTargets.has("primaryContractor")}
        evidence={findOcrField(ocrFields,"primaryContractor")}
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
  requiresReview=false,
  evidence,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  requiresReview?:boolean;
  evidence?:OcrField;
}) {
  return (
    <label>
      {label}
      <input
        className="field"
        type={type}
        value={value}
        placeholder={placeholder??(!value?'No detectado':undefined)}
        onChange={(event) => onChange(event.target.value)}
      />
      {requiresReview&&<small className="reviewHint">Requiere revisión</small>}
      <EvidenceAction field={evidence}/>
    </label>
  );
}
function EvidenceAction({field}:{field?:OcrField}){if(!field?.sourceText)return null;const confidence=(field.confidence??0)<=1?Math.round((field.confidence??0)*100):Math.round(field.confidence??0);return <button type="button" className="manualAction" onClick={()=>window.alert(`Página: ${field.pageNumber??'No indicada'}\nConfianza: ${confidence}%\n\n${field.sourceText}`)}>Ver evidencia</button>}
function LegalActField({
  value,
  onChange,
  requiresReview=false,
  evidence,
}: {
  value: string;
  onChange: (value: string) => void;
  requiresReview?:boolean;
  evidence?:OcrField;
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
      {requiresReview&&<small className="reviewHint">Requiere revisión</small>}
      <EvidenceAction field={evidence}/>
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
