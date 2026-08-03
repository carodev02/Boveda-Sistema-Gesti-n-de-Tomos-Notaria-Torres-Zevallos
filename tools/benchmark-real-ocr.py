"""Matriz de rendimiento usando únicamente páginas de documentos notariales reales."""
from __future__ import annotations
import argparse,json,os,subprocess,sys,tempfile,time
from concurrent.futures import ThreadPoolExecutor,as_completed
from pathlib import Path
import fitz

ROOT=Path(__file__).resolve().parents[1]
PROCESSOR=ROOT/'src-tauri'/'vision'/'processor.py'
SOURCES={
 'acta':ROOT/'backend/storage/documents/Actas/2026/tomo-23/b1843966-db19-466b-bb66-f89281f38f9f.pdf',
 'minuta':ROOT/'backend/storage/documents/Minuta/2026/tomo-23/bbd74273-3d3d-475f-a62a-0cced033d919.pdf',
}
EXPECTED={
 'acta':{'kardexNumber':'10131','destinationInstrumentNumber':'629','printedFolio':'636','legalAct':'compraventa','primaryContractor':'JHON JOSE VARGAS HERNANDEZ'},
 'minuta':{'kardexNumber':'10131','destinationInstrumentNumber':'629','printedFolio':'636','legalAct':'compraventa','primaryContractor':'JHON JOSE VARGAS HERNANDEZ'},
}

def compose(source:Path,target:Path,pages:int)->None:
 src=fitz.open(source);out=fitz.open()
 for index in range(pages):out.insert_pdf(src,from_page=index%src.page_count,to_page=index%src.page_count)
 out.save(target,garbage=4,deflate=True);out.close();src.close()

def evaluate(result_path:Path,expected_path:Path)->dict:
 command=[str(ROOT/'backend/node_modules/.bin/tsx.cmd'),'tools/evaluate-ocr-result.ts',str(result_path),str(expected_path)]
 env=os.environ.copy();env.setdefault('DATABASE_URL','postgresql://benchmark:benchmark@localhost:5432/benchmark');env.setdefault('JWT_SECRET','benchmark-only-secret-with-at-least-32-characters')
 completed=subprocess.run(command,cwd=ROOT,env=env,capture_output=True,text=True,encoding='utf-8',check=True)
 return json.loads(completed.stdout)

def run_one(kind:str,pdf:Path,page_workers:int,directory:Path)->dict:
 session=directory/f'session-{kind}-{page_workers}-{time.time_ns()}';result_path=session.with_suffix('.json');expected_path=session.with_suffix('.expected.json')
 env=os.environ.copy();env['OCR_PAGE_WORKERS']=str(page_workers);env['PYTHONUTF8']='1';env.setdefault('TESSERACT_EXECUTABLE',r'C:\Program Files\Tesseract-OCR\tesseract.exe')
 started=time.perf_counter();completed=subprocess.run([sys.executable,str(PROCESSOR),'recognize','--source',str(pdf),'--session',str(session)],env=env,capture_output=True,text=True,encoding='utf-8');elapsed=time.perf_counter()-started
 if completed.returncode:raise RuntimeError(completed.stderr[-3000:])
 result_path.write_text(completed.stdout,encoding='utf-8');expected_path.write_text(json.dumps(EXPECTED[kind]),encoding='utf-8')
 result=json.loads(completed.stdout);quality=evaluate(result_path,expected_path);metrics=result.get('metrics',{})
 return {'kind':kind,'pages':len(result['pages']),'elapsedSeconds':round(elapsed,3),'secondsPerPage':round(elapsed/max(1,len(result['pages'])),3),'peakMemoryMb':metrics.get('peakMemoryMb'),'failedPages':metrics.get('failedPages',0),**quality}

def run_configuration(files:dict[str,Path],job_workers:int,page_workers:int,directory:Path)->dict:
 started=time.perf_counter();items=[]
 if job_workers==1:
  for kind,pdf in files.items():items.append(run_one(kind,pdf,page_workers,directory))
 else:
  with ThreadPoolExecutor(max_workers=job_workers) as pool:
   futures=[pool.submit(run_one,kind,pdf,page_workers,directory) for kind,pdf in files.items()]
   for future in as_completed(futures):items.append(future.result())
 elapsed=time.perf_counter()-started
 return {'jobWorkers':job_workers,'pageWorkers':page_workers,'wallSeconds':round(elapsed,3),'aggregateSecondsPerPage':round(elapsed/sum(item['pages'] for item in items),3),'peakMemoryMbSum':round(sum(item.get('peakMemoryMb') or 0 for item in items),2),'correct':sum(item['correct'] for item in items),'incorrect':sum(item['incorrect'] for item in items),'missing':sum(item['missing'] for item in items),'qrDocuments':sum(bool(item['qrDetected']) for item in items),'failedPages':sum(item['failedPages'] for item in items),'documents':items}

def main()->None:
 parser=argparse.ArgumentParser();parser.add_argument('--pages',nargs='+',type=int,default=[10,50,100]);parser.add_argument('--jobs',nargs='+',type=int,default=[1,2]);parser.add_argument('--page-workers',nargs='+',type=int,default=[1,2,4]);parser.add_argument('--summary',action='store_true');args=parser.parse_args()
 for source in SOURCES.values():
  if not source.is_file():raise FileNotFoundError(source)
 report=[]
 with tempfile.TemporaryDirectory(prefix='sigadn-real-ocr-') as name:
  directory=Path(name)
  for pages in args.pages:
   files={kind:directory/f'{kind}-{pages}.pdf' for kind in SOURCES}
   for kind,target in files.items():compose(SOURCES[kind],target,pages)
   for jobs in args.jobs:
    for page_workers in args.page_workers:
     report.append({'targetPages':pages,**run_configuration(files,jobs,page_workers,directory)})
 if args.summary:
  report=[{key:value for key,value in item.items() if key!='documents'} for item in report]
 print(json.dumps({'sourcePages':{'acta':1,'minuta':32},'compositeTargets':args.pages,'results':report},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
