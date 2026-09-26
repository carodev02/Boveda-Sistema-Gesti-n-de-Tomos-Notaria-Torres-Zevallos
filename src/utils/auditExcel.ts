import ExcelJS from 'exceljs';
import auditTemplateUrl from '../../MODELO PARA AUDITORIA.xlsx?url';
import type {CentralAuditRecord} from '../services/auditApi';
import {addNotification} from '../services/notifications';

const MIME_XLSX='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function downloadWorkbook(filename:string,data:ExcelJS.Buffer){
  const url=URL.createObjectURL(new Blob([data as BlobPart],{type:MIME_XLSX}));
  const link=document.createElement('a');
  link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);
}

export async function exportAuditExcel(records:CentralAuditRecord[]){
  const response=await fetch(auditTemplateUrl);
  if(!response.ok)throw new Error('No se pudo cargar el formato de auditoría.');
  const workbook=new ExcelJS.Workbook();
  await workbook.xlsx.load(await response.arrayBuffer());
  const sheet=workbook.worksheets[0];
  if(!sheet)throw new Error('El formato de auditoría no contiene una hoja válida.');
  sheet.name='Auditoría';sheet.views=[{state:'frozen',ySplit:2,showGridLines:false}];
  sheet.unMergeCells('A1:I1');sheet.mergeCells('A1:H1');sheet.getColumn(9).hidden=true;
  const widths=[12,13,22,34,17,29,44,15];
  widths.forEach((width,index)=>{sheet.getColumn(index+1).width=width});
  sheet.getRow(1).height=27;sheet.getRow(2).height=25;
  sheet.getRow(1).font={name:'Aptos',size:14,bold:true,color:{argb:'FF1D1D1D'}};
  sheet.getRow(1).alignment={horizontal:'center',vertical:'middle'};
  sheet.getRow(2).font={name:'Aptos',size:10,bold:true,color:{argb:'FF4B3B23'}};
  sheet.getRow(2).alignment={horizontal:'center',vertical:'middle'};
  const border:Partial<ExcelJS.Borders>={top:{style:'thin',color:{argb:'FF000000'}},left:{style:'thin',color:{argb:'FF000000'}},bottom:{style:'thin',color:{argb:'FF000000'}},right:{style:'thin',color:{argb:'FF000000'}}};
  records.forEach((record,index)=>{
    const row=sheet.getRow(index+3);
    const deletionDetail=record.actionCode==='DOCUMENT_DELETED'?[record.document,record.kardex&&`Kardex: ${record.kardex}`,record.documentType&&`Tipo: ${record.documentType}`,record.deletionReason&&`Motivo: ${record.deletionReason}`].filter(Boolean).join(' · '):record.document;
    row.values=[record.date,record.time,record.userFullName,record.email,record.role,record.action,deletionDetail,record.result];
    const lines=Math.max(1,Math.ceil(record.email.length/35),Math.ceil(record.action.length/27),Math.ceil(deletionDetail.length/48));
    row.height=Math.min(72,Math.max(28,18+lines*9));
    row.eachCell({includeEmpty:true},(cell,column)=>{if(column>8)return;cell.font={name:'Aptos',size:10,color:{argb:'FF242424'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:index%2?'FFF8F3EE':'FFFFFFFF'}};cell.border=border;cell.alignment={vertical:'middle',horizontal:[1,2,5,8].includes(column)?'center':'left',wrapText:[4,6,7].includes(column),shrinkToFit:[1,2,3,5,8].includes(column),indent:[3,4,6,7].includes(column)?1:0}});
  });
  const lastRow=Math.max(2,records.length+2);
  sheet.autoFilter={from:'A2',to:`H${lastRow}`};
  sheet.pageSetup={orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,paperSize:9,printArea:`A1:H${lastRow}`,margins:{left:.25,right:.25,top:.5,bottom:.5,header:.2,footer:.2}};
  sheet.headerFooter={oddFooter:'Página &P de &N'};
  const now=new Date();const stamp=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
  downloadWorkbook(`auditoria-ntz-${stamp}.xlsx`,await workbook.xlsx.writeBuffer());
  addNotification('export','Auditoría exportada',`${records.length} evento(s) guardados en Excel.`);
}
