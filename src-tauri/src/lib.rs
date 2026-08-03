use chrono::{DateTime,Utc};
use notify::{EventKind,RecommendedWatcher,RecursiveMode,Watcher};
use serde::{Deserialize,Serialize};
use sha2::{Digest,Sha256};
use std::{collections::{HashMap,HashSet},fs,path::{Path,PathBuf},process::Command,sync::{Arc,Mutex},thread,time::{Duration,SystemTime}};
use tauri::{AppHandle,Emitter,Manager,State,UserAttentionType};
use tauri_plugin_dialog::DialogExt;
use uuid::Uuid;

#[cfg(windows)]
fn hide_command_window(command:&mut Command){
  use std::os::windows::process::CommandExt;
  const CREATE_NO_WINDOW:u32=0x08000000;
  command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn hide_command_window(_command:&mut Command){}

#[tauri::command]
fn get_server_url()->Option<String>{
  for key in ["BOVEDA_SERVER_URL","SERVER_URL"]{
    if let Ok(value)=std::env::var(key){let clean=value.trim().trim_end_matches('/').to_string();if clean.starts_with("http://")||clean.starts_with("https://"){return Some(clean)}}
  }
  let local=std::env::var_os("LOCALAPPDATA")?;
  let file=PathBuf::from(local).join("Boveda-NTZ").join("station.json");
  let value:serde_json::Value=serde_json::from_str(&fs::read_to_string(file).ok()?).ok()?;
  let clean=value.get("serverUrl")?.as_str()?.trim().trim_end_matches('/').to_string();
  (clean.starts_with("http://")||clean.starts_with("https://")).then_some(clean)
}

#[derive(Default)]
struct DesktopState{watcher:Mutex<Option<RecommendedWatcher>>,processed:Arc<Mutex<HashSet<PathBuf>>>,detected:Arc<Mutex<HashMap<String,PathBuf>>>,hashes:Arc<Mutex<HashSet<String>>>,preprocess:Arc<Mutex<()>>,resumed:Mutex<bool>}

#[derive(Clone,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
struct CzurConfiguration{
  executable_path:Option<PathBuf>,export_folder:Option<PathBuf>,temporary_folder:Option<PathBuf>,
  last_checked_at:Option<DateTime<Utc>>,detected_version:Option<String>,launch_type:Option<String>,shortcut_path:Option<PathBuf>,validation_status:Option<String>
}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
struct PublicCzurConfiguration{
  executable_configured:bool,export_folder_configured:bool,temporary_folder_configured:bool,
  executable_display_name:Option<String>,export_folder_display_name:Option<String>,temporary_folder_display_name:Option<String>,
  last_checked_at:Option<DateTime<Utc>>,detected_version:Option<String>,valid:bool,issues:Vec<String>
}
#[derive(Clone,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
struct ScanPage{
  id:String,original_page_number:u32,current_order:u32,width:u32,height:u32,resolution:u32,rotation:i32,excluded:bool,
  original_preview_url:String,processed_preview_url:String,detected_corners:Option<serde_json::Value>,crop_confidence:Option<f32>,
  perspective_applied:bool,requires_manual_review:bool,transformations:Vec<String>
}
#[derive(Clone,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
struct ScanSession{
  id:String,source_type:Option<String>,acquisition_id:Option<String>,document_class:String,registry_type_id:String,#[serde(default)]registry_type:String,tome_number:String,#[serde(default)]period_key:String,#[serde(default)]period_type:String,folio_quantity:u32,#[serde(default)]folio_range_start:Option<u32>,#[serde(default)]folio_range_end:Option<u32>,year:Option<u32>,
  biennium_start:Option<u32>,biennium_end:Option<u32>,started_at:String,czur_opened_at:Option<String>,
  detected_file_path:Option<String>,temporary_copy_path:Option<String>,original_file_name:Option<String>,
  clean_pdf_path:Option<String>,#[serde(default)]clean_pdf_filename:Option<String>,page_count:u32,status:String,error:Option<String>,pages:Vec<ScanPage>
}
#[derive(Clone,Serialize)]
#[serde(rename_all="camelCase")]
struct ScanStatusEvent{session_id:String,status:String,message:String,file:Option<DetectedScanFile>}
#[derive(Clone,Serialize)]
#[serde(rename_all="camelCase")]
struct ScanReadyForPreviewEvent{session_id:String,page_count:u32,filename:String,source_type:String}
#[derive(Clone,Serialize)]
#[serde(rename_all="camelCase")]
struct DetectedScanFile{id:String,display_name:String,size:u64,page_count:u32,detected_at:String,kind:String}
#[derive(Clone,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
struct ScanInboxItem{id:String,session_id:String,source_filename:String,source_size:u64,source_modified_at:String,sha256:String,detected_at:String,status:String,retry_count:u32,page_count:u32,error:Option<String>,#[serde(default)]delete_source:bool}
#[derive(Clone,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
struct ScanProcessingQueueItem{session_id:String,inbox_item_id:String,priority:u32,status:String,created_at:String,started_at:Option<String>,completed_at:Option<String>,error:Option<String>}

fn config_path(app:&AppHandle)->Result<PathBuf,String>{app.path().app_config_dir().map(|path|path.join("czur-station.json")).map_err(|error|error.to_string())}
fn sessions_dir(app:&AppHandle)->Result<PathBuf,String>{app.path().app_data_dir().map(|path|path.join("SIGADN").join("scans")).map_err(|error|error.to_string())}
fn scan_dir(app:&AppHandle,id:&str)->Result<PathBuf,String>{Ok(sessions_dir(app)?.join(id))}
fn sanitize_config(mut config:CzurConfiguration)->CzurConfiguration{if config.executable_path.as_deref().is_some_and(|path|!validate_executable(path)){config.executable_path=None}if config.export_folder.as_deref().is_some_and(|path|!path.is_dir()||dangerous_folder(path)){config.export_folder=None}config}
fn read_config(app:&AppHandle)->CzurConfiguration{sanitize_config(config_path(app).ok().and_then(|path|fs::read(path).ok()).and_then(|bytes|serde_json::from_slice(&bytes).ok()).unwrap_or_default())}
fn save_config(app:&AppHandle,config:&CzurConfiguration)->Result<(),String>{let path=config_path(app)?;if let Some(parent)=path.parent(){fs::create_dir_all(parent).map_err(|error|error.to_string())?}fs::write(path,serde_json::to_vec_pretty(config).map_err(|error|error.to_string())?).map_err(|error|error.to_string())}
fn safe_display(path:&Path)->Option<String>{path.file_name().map(|name|name.to_string_lossy().to_string())}
fn validate_executable(path:&Path)->bool{let name=path.file_name().map(|n|n.to_string_lossy().to_lowercase()).unwrap_or_default();path.is_file()&&path.extension().is_some_and(|ext|ext.eq_ignore_ascii_case("exe"))&&name.contains("czur")&&!(["setup","installer","install","uninstall","updater","update","unins"].iter().any(|bad|name.contains(bad)))}
fn allowed_scan_file(path:&Path)->bool{path.extension().is_some_and(|extension|extension.eq_ignore_ascii_case("pdf"))&&!path.file_name().is_some_and(|name|{let value=name.to_string_lossy().to_lowercase();value.starts_with('.')||value.contains("~$")})}
fn dangerous_folder(path:&Path)->bool{let value=path.to_string_lossy().to_lowercase();["c:\\windows","c:\\program files","c:\\program files (x86)"].iter().any(|root|value.trim_end_matches('\\')==*root)}
fn public_config(config:&CzurConfiguration)->PublicCzurConfiguration{let mut issues=Vec::new();if !config.executable_path.as_deref().is_some_and(validate_executable){issues.push("CZUR Scanner no fue detectado.".into())}if !config.export_folder.as_deref().is_some_and(|path|path.is_dir()&&!dangerous_folder(path)){issues.push("La carpeta de exportación no está configurada o no es segura.".into())}if !config.temporary_folder.as_deref().is_some_and(|path|path.is_dir()||fs::create_dir_all(path).is_ok()){issues.push("La carpeta temporal no está disponible.".into())}PublicCzurConfiguration{executable_configured:config.executable_path.is_some(),export_folder_configured:config.export_folder.is_some(),temporary_folder_configured:config.temporary_folder.is_some(),executable_display_name:config.executable_path.as_deref().and_then(safe_display),export_folder_display_name:config.export_folder.as_deref().and_then(safe_display),temporary_folder_display_name:config.temporary_folder.as_deref().and_then(safe_display),last_checked_at:config.last_checked_at,detected_version:config.detected_version.clone(),valid:issues.is_empty(),issues}}
fn resolve_shortcut(path:&Path)->Option<PathBuf>{let script=format!("$s=(New-Object -ComObject WScript.Shell).CreateShortcut('{}');$s.TargetPath",path.display().to_string().replace("'","''"));let output=Command::new("powershell").args(["-NoProfile","-NonInteractive","-Command",&script]).output().ok()?;let target=String::from_utf8_lossy(&output.stdout).trim().to_string();let candidate=PathBuf::from(target);candidate.is_file().then_some(candidate)}
fn find_czur()->Option<PathBuf>{let mut candidates=Vec::new();for root in [std::env::var_os("ProgramFiles"),std::env::var_os("ProgramFiles(x86)")].into_iter().flatten(){for entry in walkdir::WalkDir::new(root).max_depth(5).into_iter().filter_map(Result::ok){let path=entry.path();if validate_executable(path){candidates.push(path.to_path_buf())}}}for folder in [std::env::var("PUBLIC").ok().map(|v|PathBuf::from(v).join("Desktop")),std::env::var("USERPROFILE").ok().map(|v|PathBuf::from(v).join("Desktop"))].into_iter().flatten(){if let Ok(entries)=fs::read_dir(folder){for entry in entries.flatten(){let path=entry.path();if path.extension().is_some_and(|e|e.eq_ignore_ascii_case("lnk"))&&path.file_stem().is_some_and(|n|n.to_string_lossy().to_lowercase().contains("czur")){if let Some(target)=resolve_shortcut(&path){if validate_executable(&target){return Some(target)}}}}}}candidates.into_iter().next()}
fn find_czur_export_folder()->Option<PathBuf>{
  for search in ["CZUR","ExportPath","SavePath","OutputPath"]{
    let output=Command::new("reg").args(["query",r"HKCU\Software","/s","/f",search]).output().ok()?;
    for line in String::from_utf8_lossy(&output.stdout).lines(){
      let value=line.split("REG_SZ").nth(1).or_else(||line.split("REG_EXPAND_SZ").nth(1)).map(str::trim);
      if let Some(value)=value{let expanded=std::env::vars().fold(value.to_string(),|text,(key,value)|text.replace(&format!("%{key}%"),&value));let path=PathBuf::from(expanded);if path.is_dir()&&!dangerous_folder(&path){return Some(path)}}
    }
  }
  None
}
fn page_count(path:&Path)->Result<u32,String>{let document=lopdf::Document::load(path).map_err(|error|error.to_string())?;let count=document.get_pages().len() as u32;if count==0{Err("El PDF no contiene páginas.".into())}else{Ok(count)}}
fn stable_pdf(path:&Path)->Result<(u64,u32),String>{let mut previous:Option<(u64,SystemTime)>=None;let mut stable_checks=0;for _ in 0..12{let metadata=fs::metadata(path).map_err(|error|error.to_string())?;let current=(metadata.len(),metadata.modified().map_err(|error|error.to_string())?);if current.0>0&&previous==Some(current){stable_checks+=1;if stable_checks>=2{let _file=fs::OpenOptions::new().read(true).write(true).open(path).map_err(|_|"El PDF sigue bloqueado por CZUR.".to_string())?;return Ok((current.0,page_count(path)?))}}else{stable_checks=0}previous=Some(current);thread::sleep(Duration::from_millis(750))}Err("El archivo todavía se está escribiendo.".into())}
fn sha256_file(path:&Path)->Result<String,String>{use std::io::Read;let mut file=fs::File::open(path).map_err(|error|error.to_string())?;let mut hash=Sha256::new();let mut buffer=[0u8;64*1024];loop{let read=file.read(&mut buffer).map_err(|error|error.to_string())?;if read==0{break}hash.update(&buffer[..read])}Ok(format!("{:x}",hash.finalize()))}
fn session_path(app:&AppHandle,id:&str)->Result<PathBuf,String>{Ok(scan_dir(app,id)?.join("session.json"))}
fn inbox_path(app:&AppHandle,id:&str)->Result<PathBuf,String>{Ok(scan_dir(app,id)?.join("metadata.json"))}
fn save_inbox(app:&AppHandle,item:&ScanInboxItem)->Result<(),String>{let path=inbox_path(app,&item.session_id)?;if let Some(parent)=path.parent(){fs::create_dir_all(parent).map_err(|error|error.to_string())?}fs::write(path,serde_json::to_vec_pretty(item).map_err(|error|error.to_string())?).map_err(|error|error.to_string())}
fn save_queue_item(app:&AppHandle,item:&ScanProcessingQueueItem)->Result<(),String>{let path=scan_dir(app,&item.session_id)?.join("queue.json");fs::write(path,serde_json::to_vec_pretty(item).map_err(|error|error.to_string())?).map_err(|error|error.to_string())}
fn read_inbox(app:&AppHandle,id:&str)->Result<ScanInboxItem,String>{serde_json::from_slice(&fs::read(inbox_path(app,id)?).map_err(|error|error.to_string())?).map_err(|error|error.to_string())}
fn save_session(app:&AppHandle,session:&ScanSession)->Result<(),String>{let path=session_path(app,&session.id)?;if let Some(parent)=path.parent(){fs::create_dir_all(parent).map_err(|error|error.to_string())?}fs::write(path,serde_json::to_vec_pretty(session).map_err(|error|error.to_string())?).map_err(|error|error.to_string())}
fn set_acquisition_sessions_status(app:&AppHandle,acquisition_id:&str,status:&str){let Ok(root)=sessions_dir(app)else{return};let Ok(entries)=fs::read_dir(root)else{return};for entry in entries.flatten(){let path=entry.path().join("session.json");let Ok(bytes)=fs::read(&path)else{continue};let Ok(mut session)=serde_json::from_slice::<ScanSession>(&bytes)else{continue};if session.id==acquisition_id||session.acquisition_id.as_deref()==Some(acquisition_id){session.status=status.into();let _=save_session(app,&session);}}}
fn cancel_acquisition_sessions(app:&AppHandle,acquisition_id:&str){set_acquisition_sessions_status(app,acquisition_id,"CANCELLED")}
fn vision_dir(app:&AppHandle)->Result<PathBuf,String>{let resource=app.path().resource_dir().map_err(|error|error.to_string())?.join("vision");if resource.is_dir(){return Ok(resource)}let development=PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("vision");if development.is_dir(){return Ok(development)}Err("VISION_NOT_FOUND: no existe el directorio vision".into())}
fn python_path(app:&AppHandle)->Result<PathBuf,String>{let vision=vision_dir(app)?;let candidates=[vision.join("runtime/python.exe"),vision.join(".venv/Scripts/python.exe"),vision.join(".venv/bin/python")];candidates.into_iter().find(|path|path.is_file()).ok_or_else(||format!("PYTHON_RUNTIME_NOT_FOUND: no existe el motor incluido en {}",vision.display()))}
fn script_path(app:&AppHandle)->Result<PathBuf,String>{let script=vision_dir(app)?.join("processor.py");if script.is_file(){Ok(script)}else{Err(format!("PROCESSOR_NOT_FOUND: no existe {}",script.display()))}}
fn python_command(app:&AppHandle)->Result<Command,String>{let vision=vision_dir(app)?;let mut command=Command::new(python_path(app)?);hide_command_window(&mut command);let runtime=vision.join("runtime");if runtime.is_dir(){command.env("PYTHONHOME",&runtime).env("PYTHONPATH",vision.join(".venv/Lib/site-packages"));}Ok(command)}
fn run_processor(app:&AppHandle,source:&Path,session_dir:&Path)->Result<serde_json::Value,String>{let script=script_path(app)?;let output=python_command(app)?.args([script.to_string_lossy().as_ref(),"preprocess","--source",source.to_string_lossy().as_ref(),"--session",session_dir.to_string_lossy().as_ref()]).output().map_err(|error|format!("PYTHON_NOT_FOUND: {error}"))?;if !output.status.success(){return Err(format!("PYTHON_PROCESS_FAILED: {}",String::from_utf8_lossy(&output.stderr)))}serde_json::from_slice(&output.stdout).map_err(|error|format!("PYTHON_INVALID_JSON: {error}"))}
fn run_clean_pdf(app:&AppHandle,session_dir:&Path)->Result<serde_json::Value,String>{let script=script_path(app)?;let output=python_command(app)?.args([script.to_string_lossy().as_ref(),"generate_clean_pdf","--source",session_dir.join("original.pdf").to_string_lossy().as_ref(),"--session",session_dir.to_string_lossy().as_ref()]).output().map_err(|error|format!("PYTHON_NOT_FOUND: {error}"))?;if !output.status.success(){return Err(format!("CLEAN_PDF_FAILED: {}",String::from_utf8_lossy(&output.stderr)))}serde_json::from_slice(&output.stdout).map_err(|error|format!("PYTHON_INVALID_JSON: {error}"))}

#[tauri::command] fn get_czur_configuration(app:AppHandle)->PublicCzurConfiguration{let config=read_config(&app);let _=save_config(&app,&config);public_config(&config)}
#[tauri::command] fn reset_czur_configuration(app:AppHandle)->Result<PublicCzurConfiguration,String>{let mut config=read_config(&app);config.executable_path=None;config.export_folder=None;config.detected_version=None;config.last_checked_at=None;save_config(&app,&config)?;Ok(public_config(&config))}
#[tauri::command] fn validate_czur_configuration(app:AppHandle)->Result<PublicCzurConfiguration,String>{let mut config=read_config(&app);config.last_checked_at=Some(Utc::now());save_config(&app,&config)?;Ok(public_config(&config))}
#[tauri::command] fn detect_czur_scanner(app:AppHandle)->Result<PublicCzurConfiguration,String>{let mut config=read_config(&app);if !config.executable_path.as_deref().is_some_and(validate_executable){config.executable_path=find_czur()}if config.temporary_folder.is_none(){config.temporary_folder=Some(sessions_dir(&app)?)}config.last_checked_at=Some(Utc::now());save_config(&app,&config)?;Ok(public_config(&config))}
#[tauri::command] fn detect_czur_export_folder(app:AppHandle)->Result<PublicCzurConfiguration,String>{let mut config=read_config(&app);if !config.export_folder.as_deref().is_some_and(|path|path.is_dir()&&!dangerous_folder(path)){config.export_folder=find_czur_export_folder()}if config.export_folder.is_none(){return Err("No se pudo detectar automáticamente. Seleccione la carpeta que CZUR ya usa al presionar PDF.".into())}config.last_checked_at=Some(Utc::now());save_config(&app,&config)?;Ok(public_config(&config))}
#[tauri::command] fn configure_czur_executable(app:AppHandle)->Result<PublicCzurConfiguration,String>{let selected=app.dialog().file().add_filter("CZUR Scanner",&["exe"]).blocking_pick_file().and_then(|value|value.as_path().map(PathBuf::from)).ok_or("Selección cancelada.")?;if !validate_executable(&selected){return Err("La aplicación seleccionada no corresponde a CZUR.".into())}let mut config=read_config(&app);config.executable_path=Some(selected);config.last_checked_at=Some(Utc::now());save_config(&app,&config)?;Ok(public_config(&config))}
#[tauri::command] fn configure_czur_export_folder(app:AppHandle)->Result<PublicCzurConfiguration,String>{let selected=app.dialog().file().blocking_pick_folder().and_then(|value|value.as_path().map(PathBuf::from)).ok_or("Selección cancelada.")?;if dangerous_folder(&selected){return Err("No se permite usar una carpeta crítica del sistema.".into())}fs::read_dir(&selected).map_err(|_|"La carpeta no se puede leer.")?;let mut config=read_config(&app);config.export_folder=Some(selected);config.last_checked_at=Some(Utc::now());save_config(&app,&config)?;Ok(public_config(&config))}
#[tauri::command] fn test_czur_export_folder(app:AppHandle)->Result<PublicCzurConfiguration,String>{let mut config=read_config(&app);let folder=config.export_folder.as_ref().filter(|path|path.is_dir()&&!dangerous_folder(path)).ok_or("La carpeta habitual de CZUR no está configurada.")?;fs::read_dir(folder).map_err(|_|"SIGADN no puede leer la carpeta configurada.")?;let mut watcher=notify::recommended_watcher(|_:Result<notify::Event,notify::Error>|{}).map_err(|error|error.to_string())?;watcher.watch(folder,RecursiveMode::Recursive).map_err(|error|format!("No se puede vigilar la carpeta: {error}"))?;config.last_checked_at=Some(Utc::now());save_config(&app,&config)?;Ok(public_config(&config))}
#[tauri::command] fn open_czur_scanner(app:AppHandle)->Result<serde_json::Value,String>{let config=read_config(&app);let executable=config.executable_path.filter(|path|validate_executable(path)).ok_or("CZUR Scanner no fue detectado.")?;Command::new(executable).spawn().map_err(|error|error.to_string())?;Ok(serde_json::json!({"openedAt":Utc::now()}))}
#[tauri::command]
fn open_external_url(url:String)->Result<(),String>{
  let clean=url.trim();
  if clean.len()>2048||clean.chars().any(char::is_control)||!(clean.starts_with("https://")||clean.starts_with("http://")){return Err("EXTERNAL_URL_INVALID".into())}
  #[cfg(target_os="windows")]
  let result=Command::new("rundll32").args(["url.dll,FileProtocolHandler",clean]).spawn();
  #[cfg(target_os="macos")]
  let result=Command::new("open").arg(clean).spawn();
  #[cfg(all(unix,not(target_os="macos")))]
  let result=Command::new("xdg-open").arg(clean).spawn();
  result.map(|_|()).map_err(|error|format!("EXTERNAL_URL_OPEN_FAILED: {error}"))
}
#[tauri::command]
fn start_scan_session(app:AppHandle,state:State<DesktopState>,mut session:ScanSession)->Result<ScanSession,String>{
  let config=read_config(&app);
  let folder=config.export_folder.ok_or("La carpeta habitual de CZUR debe configurarse una vez en Configuración → Integración CZUR.")?;
  let started_at=DateTime::parse_from_rfc3339(&session.started_at).map_err(|_|"SCAN_STARTED_AT_INVALID")?.with_timezone(&Utc);
  let baseline:HashSet<PathBuf>=walkdir::WalkDir::new(&folder).into_iter().filter_map(Result::ok).map(|entry|entry.into_path()).filter(|path|allowed_scan_file(path)).collect();
  if session.acquisition_id.is_none(){session.acquisition_id=Some(session.id.clone())}
  session.status="WAITING_FOR_SCAN".into();
  save_session(&app,&session)?;
  if let Ok(mut files)=state.detected.lock(){files.clear()}
  if let Ok(mut hashes)=state.hashes.lock(){hashes.clear()}
  let template=session.clone();
  let emitted_app=app.clone();
  let processed=state.processed.clone();
  let detected=state.detected.clone();
  let hashes=state.hashes.clone();
  let mut watcher=notify::recommended_watcher(move|event:Result<notify::Event,notify::Error>|{
    if let Ok(event)=event{
      if !matches!(event.kind,EventKind::Create(_)|EventKind::Modify(_)){return}
      eprintln!("[CZUR] Evento de archivo recibido");
      for path in event.paths{
        if !allowed_scan_file(&path)||baseline.contains(&path){continue}
        let is_new=fs::metadata(&path).and_then(|metadata|metadata.modified()).ok().map(DateTime::<Utc>::from).is_some_and(|modified|modified>started_at);
        if !is_new{continue}
        let reserved=processed.lock().is_ok_and(|mut set|set.insert(path.clone()));
        if !reserved{continue}
        let app=emitted_app.clone();let processed=processed.clone();let detected=detected.clone();let hashes=hashes.clone();let template=template.clone();
        thread::spawn(move||{
          eprintln!("[CZUR] PDF candidato detectado");eprintln!("[CZUR] Esperando estabilidad");
          if let Ok((size,pages))=stable_pdf(&path){
            eprintln!("[CZUR] PDF estable");
            let Ok(hash)=sha256_file(&path)else{if let Ok(mut set)=processed.lock(){set.remove(&path);}return};
            let child_id=Uuid::new_v4().to_string();
            let modified=fs::metadata(&path).and_then(|metadata|metadata.modified()).ok().map(DateTime::<Utc>::from).unwrap_or_else(Utc::now).to_rfc3339();
            let mut item=ScanInboxItem{id:Uuid::new_v4().to_string(),session_id:child_id.clone(),source_filename:path.file_name().unwrap_or_default().to_string_lossy().to_string(),source_size:size,source_modified_at:modified,sha256:hash.clone(),detected_at:Utc::now().to_rfc3339(),status:"DETECTED".into(),retry_count:0,page_count:pages,error:None,delete_source:false};
            let duplicate=hashes.lock().is_ok_and(|mut values|!values.insert(hash));
            if duplicate{item.status="DUPLICATE".into();let _=save_inbox(&app,&item);if let Ok(mut set)=processed.lock(){set.remove(&path);}return}
            let mut child=template;child.id=child_id.clone();child.started_at=Utc::now().to_rfc3339();child.status="FILE_DETECTED".into();child.pages.clear();child.page_count=0;child.original_file_name=Some(item.source_filename.clone());
            let queue=ScanProcessingQueueItem{session_id:child_id.clone(),inbox_item_id:item.id.clone(),priority:100,status:"PENDING".into(),created_at:Utc::now().to_rfc3339(),started_at:None,completed_at:None,error:None};
            if save_session(&app,&child).is_err()||save_inbox(&app,&item).is_err()||save_queue_item(&app,&queue).is_err(){if let Ok(mut set)=processed.lock(){set.remove(&path);}return}
            let file_id=Uuid::new_v4().to_string();
            if let Ok(mut files)=detected.lock(){files.insert(file_id.clone(),path.clone());}
            let file=DetectedScanFile{id:file_id,display_name:item.source_filename,size,page_count:pages,detected_at:item.detected_at,kind:"PDF".into()};
            let _=app.emit("scan-session-status",ScanStatusEvent{session_id:child_id,status:"SCAN_DETECTED".into(),message:"PDF registrado en la bandeja.".into(),file:Some(file)});
            return
          }
          if let Ok(mut set)=processed.lock(){set.remove(&path);}
        });
      }
    }
  }).map_err(|error|error.to_string())?;
  watcher.watch(&folder,RecursiveMode::Recursive).map_err(|error|error.to_string())?;
  *state.watcher.lock().map_err(|_|"No se pudo iniciar la vigilancia.")?=Some(watcher);
  eprintln!("[CZUR] Watcher iniciado");eprintln!("[CZUR] Carpeta válida");eprintln!("[CZUR] Esperando archivos posteriores a startedAt");
  Ok(session)
}
#[tauri::command]
fn select_scan_file(app:AppHandle,state:State<DesktopState>,session_id:String,file_id:String)->Result<ScanSession,String>{
  eprintln!("[CZUR] Ingesta iniciada");
  let source=state.detected.lock().map_err(|_|"No se pudo resolver el archivo detectado.")?.remove(&file_id).ok_or("El archivo detectado ya no está disponible.")?;
  let mut item=read_inbox(&app,&session_id)?;
  let mut queue_item=ScanProcessingQueueItem{session_id:session_id.clone(),inbox_item_id:item.id.clone(),priority:100,status:"PENDING".into(),created_at:item.detected_at.clone(),started_at:None,completed_at:None,error:None};
  let outcome=(||->Result<ScanSession,String>{
    if !allowed_scan_file(&source)||!source.is_file(){return Err("PDF_INVALID: el archivo detectado no es válido.".into())}
    let session_file=session_path(&app,&session_id)?;
    let mut session:ScanSession=serde_json::from_slice(&fs::read(&session_file).map_err(|error|error.to_string())?).map_err(|error|error.to_string())?;
    let base=scan_dir(&app,&session_id)?;let pages=base.join("pages");let output=base.join("output");
    for dir in [&pages.join("original"),&pages.join("processed"),&output,&base.join("logs")]{fs::create_dir_all(dir).map_err(|error|format!("TEMP_COPY_FAILED: {error}"))?}
    let copied=base.join("original.pdf");let already_copied=["COPIED","PROCESSING"].contains(&item.status.as_str())&&copied.is_file();
    if !already_copied{item.status="COPYING".into();save_inbox(&app,&item)?;fs::copy(&source,&copied).map_err(|error|format!("TEMP_COPY_FAILED: {error}"))?;}
    let copied_size=fs::metadata(&copied).map_err(|error|error.to_string())?.len();let copied_hash=sha256_file(&copied)?;let copied_pages=page_count(&copied)?;
    if copied_size!=item.source_size||copied_hash!=item.sha256||copied_pages!=item.page_count{return Err("TEMP_COPY_VERIFICATION_FAILED".into())}
    item.status="COPIED".into();save_inbox(&app,&item)?;
    if item.delete_source&&!already_copied{fs::remove_file(&source).map_err(|error|format!("INBOX_RELEASE_FAILED: {error}"))?;}
    if let Ok(mut paths)=state.processed.lock(){paths.remove(&source);}
    let _gate=state.preprocess.lock().map_err(|_|"No se pudo reservar el preprocesador.")?;
    item.status="PROCESSING".into();queue_item.status="PROCESSING".into();queue_item.started_at=Some(Utc::now().to_rfc3339());save_inbox(&app,&item)?;save_queue_item(&app,&queue_item)?;
    let _=app.emit("scan-session-status",ScanStatusEvent{session_id:session_id.clone(),status:"PREPARING_PAGES".into(),message:"Preparando documento en la cola…".into(),file:None});
    let result=run_processor(&app,&copied,&base)?;
    session.detected_file_path=None;session.temporary_copy_path=Some(copied.to_string_lossy().to_string());session.original_file_name=Some(item.source_filename.clone());session.page_count=result.get("pageCount").and_then(serde_json::Value::as_u64).unwrap_or(0) as u32;session.pages=serde_json::from_value(result.get("pages").cloned().unwrap_or_default()).map_err(|error|format!("PDF_RENDER_FAILED: {error}"))?;session.status="READY_FOR_REVIEW".into();session.error=None;save_session(&app,&session)?;
    item.status="READY_FOR_REVIEW".into();item.page_count=session.page_count;queue_item.status="READY_FOR_REVIEW".into();queue_item.completed_at=Some(Utc::now().to_rfc3339());save_inbox(&app,&item)?;save_queue_item(&app,&queue_item)?;
    eprintln!("[CZUR] Preparación completada");let ready=ScanStatusEvent{session_id:session_id.clone(),status:"READY_FOR_REVIEW".into(),message:"Documento listo para revisar.".into(),file:None};let _=app.emit("scan-session-status",ready);let preview=ScanReadyForPreviewEvent{session_id:session_id.clone(),page_count:session.page_count,filename:session.original_file_name.clone().unwrap_or_else(||"documento.pdf".into()),source_type:session.source_type.clone().unwrap_or_else(||"CZUR".into())};let _=app.emit("SCAN_READY_FOR_PREVIEW",preview);eprintln!("[CZUR] Evento emitido");
    if let Some(window)=app.get_webview_window("main"){let _=window.show();let _=window.unminimize();let _=window.request_user_attention(Some(UserAttentionType::Informational));let _=window.set_focus();}
    Ok(session)
  })();
  if let Err(error)=&outcome{item.status="FAILED".into();item.retry_count+=1;item.error=Some(error.clone());queue_item.status="FAILED".into();queue_item.error=Some(error.clone());queue_item.completed_at=Some(Utc::now().to_rfc3339());let _=save_inbox(&app,&item);let _=save_queue_item(&app,&queue_item);if let Ok(mut paths)=state.processed.lock(){paths.remove(&source);}if let Ok(mut hashes)=state.hashes.lock(){hashes.remove(&item.sha256);}}
  outcome
}
#[tauri::command] fn select_manual_scan_file(app:AppHandle,state:State<DesktopState>,session:ScanSession)->Result<ScanSession,String>{save_session(&app,&session)?;let selected=app.dialog().file().add_filter("PDF",&["pdf"]).blocking_pick_file().and_then(|value|value.as_path().map(PathBuf::from)).ok_or("Selección cancelada.")?;if !selected.is_file()||!selected.extension().is_some_and(|ext|ext.eq_ignore_ascii_case("pdf")){return Err("PDF_INVALID: seleccione un PDF válido.".into())}let metadata=fs::metadata(&selected).map_err(|error|error.to_string())?;let item=ScanInboxItem{id:Uuid::new_v4().to_string(),session_id:session.id.clone(),source_filename:selected.file_name().unwrap_or_default().to_string_lossy().to_string(),source_size:metadata.len(),source_modified_at:metadata.modified().ok().map(DateTime::<Utc>::from).unwrap_or_else(Utc::now).to_rfc3339(),sha256:sha256_file(&selected)?,detected_at:Utc::now().to_rfc3339(),status:"DETECTED".into(),retry_count:0,page_count:page_count(&selected)?,error:None,delete_source:false};save_inbox(&app,&item)?;let file_id=Uuid::new_v4().to_string();state.detected.lock().map_err(|_|"No se pudo registrar el archivo seleccionado.")?.insert(file_id.clone(),selected);select_scan_file(app,state,session.id,file_id)}
#[tauri::command] fn read_scan_asset(app:AppHandle,session_id:String,page_id:String,variant:String)->Result<Vec<u8>,String>{if variant!="original"&&variant!="processed"{return Err("ASSET_VARIANT_INVALID".into())}let session:ScanSession=serde_json::from_slice(&fs::read(session_path(&app,&session_id)?).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;let page=session.pages.iter().find(|p|p.id==page_id).ok_or("PAGE_NOT_FOUND")?;let base=scan_dir(&app,&session_id)?;let path=base.join("pages").join(&variant).join(format!("page-{:04}.png",page.original_page_number));let canonical_base=fs::canonicalize(&base).map_err(|e|e.to_string())?;let canonical=fs::canonicalize(&path).map_err(|e|e.to_string())?;if !canonical.starts_with(&canonical_base){return Err("ASSET_PATH_INVALID".into())}fs::read(canonical).map_err(|e|e.to_string())}
#[tauri::command] fn read_scan_original(app:AppHandle,session_id:String)->Result<Vec<u8>,String>{let base=scan_dir(&app,&session_id)?;let path=base.join("original.pdf");let canonical_base=fs::canonicalize(&base).map_err(|e|e.to_string())?;let canonical=fs::canonicalize(&path).map_err(|_|"SCAN_ORIGINAL_NOT_FOUND".to_string())?;if !canonical.starts_with(&canonical_base){return Err("SCAN_ORIGINAL_OUTSIDE_TEMP_DIRECTORY".into())}fs::read(canonical).map_err(|e|e.to_string())}
#[tauri::command] fn get_scan_session(app:AppHandle,session_id:String)->Result<ScanSession,String>{serde_json::from_slice(&fs::read(session_path(&app,&session_id)?).map_err(|_|"SCAN_SESSION_NOT_FOUND".to_string())?).map_err(|e|e.to_string())}
#[tauri::command] fn store_clean_pdf(app:AppHandle,session_id:String,bytes:Vec<u8>)->Result<ScanSession,String>{if bytes.is_empty(){return Err("CLEAN_PDF_EMPTY".into())}let session_file=session_path(&app,&session_id)?;let mut session:ScanSession=serde_json::from_slice(&fs::read(&session_file).map_err(|_|"SCAN_SESSION_NOT_FOUND".to_string())?).map_err(|e|e.to_string())?;let output=scan_dir(&app,&session_id)?.join("output");fs::create_dir_all(&output).map_err(|e|format!("CLEAN_PDF_DIRECTORY_FAILED: {e}"))?;let target=output.join("document-clean.pdf");fs::write(&target,bytes).map_err(|e|format!("CLEAN_PDF_WRITE_FAILED: {e}"))?;session.page_count=page_count(&target)?;session.clean_pdf_path=Some(target.to_string_lossy().to_string());session.clean_pdf_filename=Some("document-clean.pdf".into());save_session(&app,&session)?;Ok(session)}
#[tauri::command] fn update_scan_pages(app:AppHandle,session_id:String,pages:Vec<ScanPage>)->Result<ScanSession,String>{let path=session_path(&app,&session_id)?;let mut session:ScanSession=serde_json::from_slice(&fs::read(path).map_err(|error|error.to_string())?).map_err(|error|error.to_string())?;session.pages=pages;save_session(&app,&session)?;Ok(session)}
#[tauri::command] fn rotate_scan_page(app:AppHandle,session_id:String,page_id:String,degrees:i32)->Result<ScanSession,String>{let path=session_path(&app,&session_id)?;let mut session:ScanSession=serde_json::from_slice(&fs::read(path).map_err(|error|error.to_string())?).map_err(|error|error.to_string())?;if let Some(page)=session.pages.iter_mut().find(|page|page.id==page_id){page.rotation=(page.rotation+degrees).rem_euclid(360);page.transformations.push(format!("ROTATE_{degrees}"))}save_session(&app,&session)?;Ok(session)}
#[tauri::command] fn adjust_scan_page_corners(_app:AppHandle,_session_id:String,_page_id:String,_corners:serde_json::Value)->Result<ScanSession,String>{Err("El ajuste de perspectiva requiere el servicio local OpenCV.".into())}
#[tauri::command] fn use_original_scan_page(app:AppHandle,session_id:String,page_id:String)->Result<ScanSession,String>{rotate_scan_page(app,session_id,page_id,0)}
#[tauri::command] fn redetect_scan_page(_app:AppHandle,_session_id:String,_page_id:String)->Result<ScanSession,String>{Err("La redetección requiere el servicio local OpenCV.".into())}
#[tauri::command] fn generate_clean_pdf(app:AppHandle,session_id:String)->Result<ScanSession,String>{let path=session_path(&app,&session_id)?;let mut session:ScanSession=serde_json::from_slice(&fs::read(&path).map_err(|error|error.to_string())?).map_err(|error|error.to_string())?;let base=scan_dir(&app,&session_id)?;let result=run_clean_pdf(&app,&base)?;session.clean_pdf_path=result.get("cleanPdf").and_then(serde_json::Value::as_str).map(String::from);session.status="READY_FOR_REVIEW".into();save_session(&app,&session)?;Ok(session)}
#[tauri::command] fn cancel_scan_session(app:AppHandle,state:State<DesktopState>,session_id:String,remove_temporary:bool)->Result<(),String>{*state.watcher.lock().map_err(|_|"No se pudo detener la vigilancia.")?=None;cancel_acquisition_sessions(&app,&session_id);if let Ok(bytes)=fs::read(session_path(&app,&session_id)?){if let Ok(mut session)=serde_json::from_slice::<ScanSession>(&bytes){session.status="CANCELLED".into();let _=save_session(&app,&session);}}if let Ok(mut files)=state.detected.lock(){files.clear()}if let Ok(mut paths)=state.processed.lock(){paths.clear()}if remove_temporary{let path=scan_dir(&app,&session_id)?;if path.exists(){fs::remove_dir_all(path).map_err(|error|error.to_string())?}}Ok(())}
#[tauri::command] fn complete_scan_acquisition(app:AppHandle,state:State<DesktopState>,session_id:String)->Result<(),String>{*state.watcher.lock().map_err(|_|"No se pudo cerrar la adquisición.")?=None;set_acquisition_sessions_status(&app,&session_id,"COMPLETED");Ok(())}
#[tauri::command] fn recover_scan_sessions(app:AppHandle)->Result<Vec<ScanSession>,String>{let root=sessions_dir(&app)?;if !root.exists(){return Ok(Vec::new())}let mut sessions=Vec::new();for entry in fs::read_dir(root).map_err(|error|error.to_string())?.flatten(){let path=entry.path().join("session.json");if let Ok(bytes)=fs::read(path){if let Ok(session)=serde_json::from_slice::<ScanSession>(&bytes){if !["CANCELLED","FAILED"].contains(&session.status.as_str()){sessions.push(session)}}}}Ok(sessions)}
#[tauri::command] fn list_scan_sessions(app:AppHandle,offset:usize,limit:usize)->Result<Vec<ScanSession>,String>{let root=sessions_dir(&app)?;if !root.exists(){return Ok(Vec::new())}let mut paths=fs::read_dir(root).map_err(|error|error.to_string())?.flatten().map(|entry|entry.path().join("session.json")).filter(|path|path.is_file()).collect::<Vec<_>>();paths.sort_by_key(|path|std::cmp::Reverse(fs::metadata(path).and_then(|value|value.modified()).unwrap_or(SystemTime::UNIX_EPOCH)));Ok(paths.into_iter().skip(offset).take(limit.clamp(1,100)).filter_map(|path|fs::read(path).ok()).filter_map(|bytes|serde_json::from_slice::<ScanSession>(&bytes).ok()).filter(|session|!["CANCELLED","FAILED"].contains(&session.status.as_str())).collect())}
#[tauri::command] fn resume_scan_queue(app:AppHandle,state:State<DesktopState>)->Result<usize,String>{let mut guard=state.resumed.lock().map_err(|_|"No se pudo recuperar la cola.")?;if *guard{return Ok(0)}*guard=true;drop(guard);let config=read_config(&app);let inbox=config.export_folder;let root=sessions_dir(&app)?;if !root.exists(){return Ok(0)}let mut resumed=0;for entry in fs::read_dir(root).map_err(|error|error.to_string())?.flatten(){let Ok(mut item)=read_inbox(&app,&entry.file_name().to_string_lossy())else{continue};if item.status=="READY_FOR_REVIEW"||item.status=="DUPLICATE"{continue}let source=if ["COPIED","PROCESSING"].contains(&item.status.as_str()){item.delete_source=false;scan_dir(&app,&item.session_id)?.join("original.pdf")}else{let Some(folder)=inbox.as_ref()else{continue};folder.join(&item.source_filename)};if !source.is_file(){continue}let file_id=Uuid::new_v4().to_string();state.detected.lock().map_err(|_|"No se pudo recuperar la cola.")?.insert(file_id.clone(),source);save_inbox(&app,&item)?;let file=DetectedScanFile{id:file_id,display_name:item.source_filename.clone(),size:item.source_size,page_count:item.page_count,detected_at:item.detected_at.clone(),kind:"PDF".into()};let _=app.emit("scan-session-status",ScanStatusEvent{session_id:item.session_id,status:"SCAN_DETECTED".into(),message:"Trabajo recuperado después del reinicio.".into(),file:Some(file)});resumed+=1}Ok(resumed)}
#[tauri::command] fn retry_scan_session(app:AppHandle,state:State<DesktopState>,session_id:String)->Result<(),String>{let mut item=read_inbox(&app,&session_id)?;let source=if scan_dir(&app,&session_id)?.join("original.pdf").is_file(){item.delete_source=false;scan_dir(&app,&session_id)?.join("original.pdf")}else{read_config(&app).export_folder.ok_or("La bandeja CZUR no está configurada.")?.join(&item.source_filename)};if !source.is_file(){return Err("El PDF original ya no está disponible para reintentar.".into())}item.status="DETECTED".into();item.error=None;save_inbox(&app,&item)?;let file_id=Uuid::new_v4().to_string();state.detected.lock().map_err(|_|"No se pudo reintentar.")?.insert(file_id.clone(),source);let file=DetectedScanFile{id:file_id,display_name:item.source_filename,size:item.source_size,page_count:item.page_count,detected_at:Utc::now().to_rfc3339(),kind:"PDF".into()};let _=app.emit("scan-session-status",ScanStatusEvent{session_id,status:"SCAN_DETECTED".into(),message:"Reintento agregado a la cola.".into(),file:Some(file)});Ok(())}

#[tauri::command] fn read_clean_pdf(app:AppHandle,session_id:String)->Result<Vec<u8>,String>{let session:ScanSession=serde_json::from_slice(&fs::read(session_path(&app,&session_id)?).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;let path=session.clean_pdf_path.ok_or("CLEAN_PDF_NOT_FOUND")?;let canonical=fs::canonicalize(&path).map_err(|_|"CLEAN_PDF_NOT_FOUND".to_string())?;let base=fs::canonicalize(scan_dir(&app,&session_id)?).map_err(|e|e.to_string())?;if !canonical.starts_with(&base){return Err("CLEAN_PDF_OUTSIDE_TEMP_DIRECTORY".into())}fs::read(canonical).map_err(|e|e.to_string())}
fn safe_pdf_filename(value:&str)->String{let stem=value.trim().trim_end_matches(".pdf").chars().map(|ch|if ch<' '||r#"<>:"/\|?*"#.contains(ch){' '}else{ch}).collect::<String>().split_whitespace().collect::<Vec<_>>().join(" ");let stem=stem.trim_end_matches(['.',' ']);let safe=if stem.is_empty(){"DOCUMENTO - REVISAR"}else{stem};format!("{}.pdf",safe.chars().take(175).collect::<String>())}
#[tauri::command] fn apply_processed_filename(app:AppHandle,session_id:String,proposed_filename:String)->Result<String,String>{if session_id.trim().is_empty(){return Err("SCAN_SESSION_REQUIRED".into())}let session_file=session_path(&app,&session_id)?;let mut session:ScanSession=serde_json::from_slice(&fs::read(&session_file).map_err(|_|"SCAN_SESSION_NOT_FOUND".to_string())?).map_err(|e|e.to_string())?;let source=PathBuf::from(session.clean_pdf_path.clone().ok_or("CLEAN_PDF_NOT_FOUND")?);let base=fs::canonicalize(scan_dir(&app,&session_id)?).map_err(|e|e.to_string())?;let canonical=fs::canonicalize(&source).map_err(|_|"CLEAN_PDF_NOT_FOUND".to_string())?;if !canonical.starts_with(&base){return Err("CLEAN_PDF_OUTSIDE_TEMP_DIRECTORY".into())}page_count(&canonical)?;let desired=safe_pdf_filename(&proposed_filename);let mut target=base.join(&desired);let mut correlation=2;while target.exists()&&target!=canonical{let stem=desired.trim_end_matches(".pdf");target=base.join(format!("{stem} ({correlation}).pdf"));correlation+=1}if target!=canonical{fs::rename(&canonical,&target).map_err(|e|format!("CLEAN_PDF_RENAME_FAILED: {e}"))?}page_count(&target)?;let final_name=target.file_name().unwrap_or_default().to_string_lossy().to_string();session.clean_pdf_path=Some(target.to_string_lossy().to_string());session.clean_pdf_filename=Some(final_name.clone());save_session(&app,&session)?;Ok(final_name)}
#[cfg_attr(mobile,tauri::mobile_entry_point)]
pub fn run(){tauri::Builder::default().plugin(tauri_plugin_http::init()).manage(DesktopState::default()).plugin(tauri_plugin_dialog::init()).invoke_handler(tauri::generate_handler![get_server_url,get_czur_configuration,reset_czur_configuration,validate_czur_configuration,detect_czur_scanner,detect_czur_export_folder,configure_czur_executable,configure_czur_export_folder,test_czur_export_folder,open_czur_scanner,open_external_url,start_scan_session,select_scan_file,select_manual_scan_file,read_scan_asset,read_scan_original,get_scan_session,store_clean_pdf,read_clean_pdf,apply_processed_filename,update_scan_pages,rotate_scan_page,adjust_scan_page_corners,use_original_scan_page,redetect_scan_page,generate_clean_pdf,cancel_scan_session,complete_scan_acquisition,recover_scan_sessions,list_scan_sessions,resume_scan_queue,retry_scan_session]).run(tauri::generate_context!()).expect("error al iniciar SIGADN Desktop")}

#[cfg(test)]
mod tests{
  use super::*;
  #[test] fn only_pdf_scan_extensions_are_allowed(){assert!(allowed_scan_file(Path::new("scan.PDF")));assert!(!allowed_scan_file(Path::new("page.tiff")));assert!(!allowed_scan_file(Path::new("malware.exe")));assert!(!allowed_scan_file(Path::new("partial.pdf.tmp")))}
  #[test] fn system_roots_are_rejected(){assert!(dangerous_folder(Path::new(r"C:\Windows")));assert!(dangerous_folder(Path::new(r"C:\Program Files")));assert!(!dangerous_folder(Path::new(r"C:\SIGADN\EntradaCZUR")))}
  #[test] fn streaming_hash_detects_duplicate_content(){let root=std::env::temp_dir().join(format!("sigadn-hash-{}",Uuid::new_v4()));fs::create_dir_all(&root).unwrap();let first=root.join("scan.pdf");let second=root.join("otro-nombre.pdf");fs::write(&first,b"mismo pdf").unwrap();fs::write(&second,b"mismo pdf").unwrap();assert_eq!(sha256_file(&first).unwrap(),sha256_file(&second).unwrap());fs::remove_dir_all(root).unwrap()}
  #[test] fn processed_pdf_name_is_sanitized(){assert_eq!(safe_pdf_filename(" K-41245<>.pdf "),"K-41245.pdf");assert_eq!(safe_pdf_filename(""),"DOCUMENTO - REVISAR.pdf")}
  #[test] fn inbox_metadata_round_trips(){let item=ScanInboxItem{id:"i".into(),session_id:"s".into(),source_filename:"scan.pdf".into(),source_size:10,source_modified_at:"now".into(),sha256:"abc".into(),detected_at:"now".into(),status:"DETECTED".into(),retry_count:0,page_count:1,error:None,delete_source:true};let json=serde_json::to_string(&item).unwrap();let restored:ScanInboxItem=serde_json::from_str(&json).unwrap();assert_eq!(restored.status,"DETECTED");assert!(restored.delete_source)}
}
