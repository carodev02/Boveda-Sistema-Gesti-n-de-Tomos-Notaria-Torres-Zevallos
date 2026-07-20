use std::{env,fs,path::PathBuf};

fn main(){
  let env_file=PathBuf::from("../.env");
  println!("cargo:rerun-if-changed={}",env_file.display());
  if let Ok(contents)=fs::read_to_string(env_file){
    for line in contents.lines().map(str::trim).filter(|line|!line.is_empty()&&!line.starts_with('#')){
      if let Some((key,value))=line.split_once('='){
        let key=key.trim();
        if matches!(key,"CZUR_EXPORT_FOLDER"|"VITE_CZUR_EXPORT_FOLDER")&&env::var_os(key).is_none(){println!("cargo:rustc-env={key}={}",value.trim().trim_matches(['\"','\'']))}
      }
    }
  }
  tauri_build::build()
}
