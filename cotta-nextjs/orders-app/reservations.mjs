import {randomUUID,timingSafeEqual} from 'node:crypto';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const text=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';
const integer=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
const equal=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y)};
const minute=t=>{if(typeof t!=='string'||!/^\d{2}:\d{2}$/.test(t))return -1;const [h,m]=t.split(':').map(Number);return h<=24&&m<60&&(h<24||m===0)?h*60+m:-1};
const clock=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
const localNow=()=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(p=>[p.type,p.value]));return {date:`${p.year}-${p.month}-${p.day}`,minute:Number(p.hour)*60+Number(p.minute)}};
const defaultHours=['','18:00-24:00','18:00-24:00','18:00-24:00','18:00-24:00','12:00-16:00,18:00-24:00','12:00-16:00,18:00-24:00'];
export function createReservations({db,readBody,response,staff,bearer,rate}){
 async function config(){return {duration:Number(await db.getConfig('bookingDuration','90')),hours:JSON.parse(await db.getConfig('bookingHours',JSON.stringify(defaultHours)))}}
 const tables=async()=>(await db.ensureTables()).map(({number,seats,area,enabled})=>({number,seats,area,enabled:!!enabled}));
 function windows(schedule){if(typeof schedule!=='string'||schedule.length>80)throw fail('שעות הפעילות אינן תקינות.');if(!schedule.trim())return [];const w=schedule.split(',').map(part=>{const a=part.trim().split('-'),start=minute(a[0]),end=minute(a[1]);if(a.length!==2||start<0||start>=1440||end<=start||start%30||end%30)throw fail('הזינו שעות בחצאי שעה, למשל 18:00-24:00.');return [start,end]});let last=-1;for(const [start,end] of w){if(start<last)throw fail('טווחי הפעילות חופפים או אינם מסודרים.');last=end}return w}
 function dateValue(value,checkFuture=true){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw fail('בחרו תאריך תקין.');const d=new Date(value+'T12:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value)throw fail('תאריך לא תקין.');const now=localNow();if(checkFuture&&(value<now.date||d.getTime()-new Date(now.date+'T12:00:00Z').getTime()>90*86400000))throw fail('ניתן להזמין מהיום ועד 90 ימים קדימה.');return d}
 async function available(date,start,end,party,area,exclude=''){
  const busy=await db.find('Reservation',{date,start:{$lt:end},end:{$gt:start},status:{$in:['confirmed','seated','completed']},id:{$ne:exclude}});
  return (await tables()).filter(t=>t.enabled&&t.seats>=party&&(area==='any'||t.area===area)&&!busy.some(b=>b.table_no===t.number));
 }
 async function validateSlot(date,start,end,party,area){const day=dateValue(date).getUTCDay(),now=localNow();if(!integer(party,1,30)||!['any','inside','outside','bar'].includes(area))throw fail('מספר סועדים או אזור ישיבה אינם תקינים.');if(!integer(start,0,1439)||start%30||!integer(end,start+30,1440)||!windows((await config()).hours[day]).some(([a,b])=>start>=a&&end<=b))throw fail('השעה אינה בטווח הפעילות.');if(date===now.date&&start<=now.minute)throw fail('השעה כבר חלפה. בחרו מועד אחר.',409)}
 async function view(r,admin=false){return {id:r.id,number:r.seq,name:r.name,phone:r.phone,date:r.date,time:clock(r.start),endTime:clock(r.end),party:r.party,area:r.area,notes:r.notes,status:r.status,table:r.table_no,createdAt:r.created_at,updatedAt:r.updated_at,...(admin?{availableTables:['pending','confirmed'].includes(r.status)?await available(r.date,r.start,r.end,r.party,r.area,r.id):[]}:{} )}}
 async function state(){const recent=(await db.find('Reservation',{}, {seq:-1},500)).map(r=>r.id),rows=await db.find('Reservation',{$or:[{status:{$in:['pending','confirmed','seated']}},{date:{$gte:localNow().date}},{id:{$in:recent}}]},{created_at:-1});const reservations=[];for(const r of rows)reservations.push(await view(r,true));return {reservations,bookingConfig:{...await config(),tables:await tables()}}}
 const futureFilter=()=>{const now=localNow();return {$or:[{date:{$gt:now.date}},{date:now.date,end:{$gt:now.minute}}]}};
 async function assertTableCount(n){if(await db.one('Reservation',{table_no:{$gt:n},status:{$in:['confirmed','seated']},...futureFilter()}))throw fail('קיימות הזמנות מקום מאושרות לשולחנות שיוסרו.',409)}
 async function handle(req,res,url){const path=url.pathname,method=req.method;
  if(path==='/api/reservations/availability'&&method==='GET'){
   const date=url.searchParams.get('date'),party=Number(url.searchParams.get('party')),area=url.searchParams.get('area')||'any';const day=dateValue(date).getUTCDay();if(!integer(party,1,30)||!['any','inside','outside','bar'].includes(area))throw fail('פרטי ההזמנה אינם תקינים.');const cfg=await config(),now=localNow(),slots=[];
   for(const [a,b] of windows(cfg.hours[day]))for(let start=a;start+cfg.duration<=b;start+=30){if(date===now.date&&start<=now.minute)continue;const count=(await available(date,start,start+cfg.duration,party,area)).length;if(count)slots.push({time:clock(start),available:count})}
   response(res,200,{date,party,area,duration:cfg.duration,slots,areas:[...new Set((await tables()).filter(t=>t.enabled).map(t=>t.area))]});return true;
  }
  if(path==='/api/reservations'&&method==='POST'){
   rate(`reservation:${req.socket.remoteAddress}`,30);const b=await readBody(req),token=text(b.token,100);if(!/^[a-zA-Z0-9-]{20,100}$/.test(b.nonce||'')||! /^[a-f0-9]{64}$/.test(token))throw fail('מזהה בקשה אינו תקין.');
   const name=text(b.name,60),phone=text(b.phone,20).replace(/[\s-]/g,'');if(name.length<2||!/^0\d{8,9}$/.test(phone))throw fail('מלאו שם ומספר טלפון תקין.');const start=minute(b.time);
   const r=await db.transaction(async()=>{const previous=await db.one('Reservation',{nonce:b.nonce});if(previous){if(!equal(token,previous.token))throw fail('מזהה בקשה בשימוש.',409);return previous}const end=start+(await config()).duration;await validateSlot(b.date,start,end,b.party,b.area);if(!(await available(b.date,start,end,b.party,b.area)).length)throw fail('המועד התמלא בינתיים. בחרו שעה אחרת.',409);const now=Date.now();return db.create('Reservation',{id:randomUUID(),seq:await db.nextNumber('reservations'),nonce:b.nonce,token,name,phone,date:b.date,start,end,party:b.party,area:b.area,notes:text(b.notes,500),status:'pending',table_no:null,created_at:now,updated_at:now})});
   response(res,201,await view(r));return true;
  }
  if(path.startsWith('/api/reservations/')&&['GET','PATCH'].includes(method)){
   const id=path.split('/').pop(),token=bearer(req),r=await db.one('Reservation',{id});if(!r||!equal(token,r.token))throw fail('הזמנה לא נמצאה.',404);
   if(method==='PATCH'){const b=await readBody(req);if(b.status!=='cancelled')throw fail('פעולה לא תקינה.');const updated=await db.transaction(async()=>{const current=await db.one('Reservation',{id});if(!['pending','confirmed'].includes(current.status))throw fail('לא ניתן לבטל את ההזמנה במצב הנוכחי.',409);return db.update('Reservation',{id},{$set:{status:'cancelled',updated_at:Date.now()}})});response(res,200,await view(updated))}else response(res,200,await view(r));return true;
  }
  if(path==='/api/admin/reservations'&&method==='GET'){await staff(req);response(res,200,await state());return true}
  if(path.startsWith('/api/admin/reservations/')&&method==='PATCH'){
   await staff(req);const b=await readBody(req),id=path.split('/').pop();const r=await db.transaction(async()=>{const current=await db.one('Reservation',{id});if(!current)throw fail('הזמנה לא נמצאה.',404);const transitions={pending:['confirmed','declined','cancelled'],confirmed:['seated','cancelled'],seated:['completed'],completed:[],declined:[],cancelled:[]};if(!transitions[current.status]?.includes(b.status))throw fail('הזמנה זו כבר עודכנה. רעננו את המסך.',409);let table=current.table_no;if(b.status==='confirmed'){await validateSlot(current.date,current.start,current.end,current.party,current.area);const choices=await available(current.date,current.start,current.end,current.party,current.area,id);table=b.table||choices.sort((a,b)=>a.seats-b.seats||a.number-b.number)[0]?.number;if(!choices.some(t=>t.number===table))throw fail('השולחן כבר תפוס בשעה זו או אינו מתאים להזמנה. בחרו שולחן אחר.',409)}return db.update('Reservation',{id},{$set:{status:b.status,table_no:table,updated_at:Date.now()}})});response(res,200,await view(r,true));return true;
  }
  if(path==='/api/admin/booking-config'&&method==='PATCH'){
   await staff(req);const b=await readBody(req);if(!integer(b.duration,30,180)||b.duration%30||!Array.isArray(b.hours)||b.hours.length!==7)throw fail('משך ישיבה או שעות פעילות אינם תקינים.');b.hours.forEach(windows);
   await db.transaction(async()=>{const existing=await tables();if(!Array.isArray(b.tables)||b.tables.some(t=>!t||typeof t!=='object')||b.tables.length!==existing.length||new Set(b.tables.map(t=>t.number)).size!==existing.length)throw fail('יש להגדיר כל שולחן פעם אחת.');for(const t of b.tables)if(!existing.some(e=>e.number===t.number)||!integer(t.seats,1,30)||!['inside','outside','bar'].includes(t.area)||typeof t.enabled!=='boolean')throw fail('פרטי שולחן אינם תקינים.');const booked=await db.find('Reservation',{...futureFilter(),status:{$in:['confirmed','seated']}});for(const r of booked){const t=b.tables.find(t=>t.number===r.table_no);if(!t?.enabled||t.seats<r.party||(r.area!=='any'&&t.area!==r.area)||!windows(b.hours[dateValue(r.date,false).getUTCDay()]).some(([a,end])=>r.start>=a&&r.end<=end))throw fail('השינוי מתנגש עם הזמנת מקום מאושרת. יש לטפל בה לפני שינוי ההגדרות.',409)}await db.setConfig('bookingDuration',b.duration);await db.setConfig('bookingHours',JSON.stringify(b.hours));for(const t of b.tables)await db.update('ReservationTable',{number:t.number},{$set:{seats:t.seats,area:t.area,enabled:t.enabled}})});
   response(res,200,{ok:true,...await state()});return true;
  }
  return false;
 }
 return {handle,state,assertTableCount};
}
