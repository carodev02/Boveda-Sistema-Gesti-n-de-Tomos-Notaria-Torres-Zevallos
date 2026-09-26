export type AppNotificationKind='export'|'password'|'delete'|'info';
export type AppNotification={id:string;kind:AppNotificationKind;title:string;detail:string;createdAt:string;read:boolean};

const STORAGE_KEY='sigadn-notifications';
export const NOTIFICATION_EVENT='sigadn:notification';

export function getNotifications(){
  try{return (JSON.parse(localStorage.getItem(STORAGE_KEY)??'[]') as AppNotification[]).slice(0,30)}catch{return []}
}

function save(items:AppNotification[]){localStorage.setItem(STORAGE_KEY,JSON.stringify(items.slice(0,30)))}

export function addNotification(kind:AppNotificationKind,title:string,detail:string){
  const item:AppNotification={id:crypto.randomUUID(),kind,title,detail,createdAt:new Date().toISOString(),read:false};
  save([item,...getNotifications()]);
  window.dispatchEvent(new CustomEvent<AppNotification>(NOTIFICATION_EVENT,{detail:item}));
}

export function markNotificationsRead(){
  const items=getNotifications().map(item=>({...item,read:true}));save(items);return items;
}

export function clearNotifications(){save([]);window.dispatchEvent(new Event(NOTIFICATION_EVENT))}
