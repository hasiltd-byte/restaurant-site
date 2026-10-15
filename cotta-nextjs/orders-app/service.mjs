import {randomUUID,randomBytes,createHmac,timingSafeEqual} from 'node:crypto';
import {readFileSync,existsSync,statSync,createReadStream} from 'node:fs';
import {join,dirname,resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import QRCode from 'qrcode';
import {connectDatabase} from './database.mjs';
import {createReservations} from './reservations.mjs';
import {createProducts,publicProducts} from './products.mjs';
const root=join(process.cwd(),'orders-app');
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const clean=(v,max=100)=>typeof v==='string'?v.trim().slice(0,max):'';
const validNumber=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
const equal=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y)};
export async function createOrderService(options={}){
 const db=await connectDatabase(options);
 try{
 const menuPath=existsSync(join(root,'menu.json'))?join(root,'menu.json'):join(root,'../shared/menu.json');
 const seedMenu=JSON.parse(readFileSync(menuPath,'utf8'));await db.initialize(seedMenu);
 const secret=await db.getConfig('secret',''),username=options.username||process.env.ORDERS_USERNAME||'פיצה',password=options.password||process.env.ORDERS_PASSWORD||'123';
 const rates=new Map();
 function rate(key,limit,window=900000){const now=Date.now(),r=rates.get(key);if(!r||r.until<now){rates.set(key,{until:now+window,count:1});return}if(++r.count>limit)throw fail('יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.',429)}
 function cookie(req){return (req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('tableflow_staff='))?.slice(16)||''}
 async function staff(req){const token=cookie(req),session=await db.one('StaffSession',{token,expiresAt:{$gt:new Date()}});if(!session)throw fail('יש להתחבר לממשק הניהול.',401);return token}
 function bearer(req){return String(req.headers.authorization||'').replace(/^Bearer /,'')}
 async function diner(req,allowClosed=false){const d=await db.one('Diner',{token:bearer(req)}),v=d?await db.one('Visit',{id:d.visit_id}):null;if(!d||!v)throw fail('יש לסרוק את הקוד שעל השולחן ולהצטרף לביקור.',401);if(!allowClosed&&(v.closed_at||Date.now()-v.opened_at>8*3600000))throw fail('הביקור הסתיים. סרקו שוב את הקוד שעל השולחן.',410);return {...d,table_no:v.table_no,party:v.party,closed_at:v.closed_at,opened_at:v.opened_at}}
 const tableKey=n=>createHmac('sha256',secret).update(`table:${n}`).digest('hex').slice(0,32);
 function publicOrder(o){return {id:o.id,number:o.seq,type:o.type,visitId:o.visit_id,dinerId:o.diner_id,status:o.status,payment:o.payment,createdAt:o.created_at,...o.payload}}
 async function publicMenu(){const menu=await publicProducts(db);return {restaurant:await db.getConfig('restaurant','COTTA'),phone:await db.getConfig('phone','035220118'),tableCount:Number(await db.getConfig('tableCount','12')),menu,videos:Object.fromEntries(menu.filter(a=>a.video).map(a=>[a.id,a.video]))}}
 async function readBody(req,limit=64000,raw=false){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>limit)throw fail('הקובץ או הבקשה גדולים מדי.',413);chunks.push(chunk)}const body=Buffer.concat(chunks);if(raw)return body;try{const parsed=JSON.parse(body.toString()||'{}');if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw 0;return parsed}catch{throw fail('בקשה לא תקינה.')}}
 function response(res,status,payload){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(payload))}
 const reservations=createReservations({db,readBody,response,staff,bearer,rate});
 const products=createProducts({db,readBody,response,fail});
 const handle=async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost'),path=url.pathname,method=req.method;const menu=await publicProducts(db);
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
  if(['POST','PUT','PATCH','DELETE'].includes(method)&&req.headers.origin){const origin=new URL(req.headers.origin).host,host=req.headers['x-forwarded-host']||req.headers.host;if(origin!==host)throw fail('מקור בקשה לא מורשה.',403)}
  if(await reservations.handle(req,res,url))return;
  if(path==='/api/menu'&&method==='GET')return response(res,200,await publicMenu());
  if(path==='/api/login'&&method==='POST'){rate(`login:${req.socket.remoteAddress}`,10);const b=await readBody(req);if(!equal(b.username,username)||!equal(b.password,password))throw fail('שם המשתמש או הסיסמה אינם נכונים.',401);const token=randomBytes(32).toString('hex');await db.create('StaffSession',{token,expiresAt:new Date(Date.now()+12*3600000)});res.setHeader('Set-Cookie',`tableflow_staff=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${req.headers['x-forwarded-proto']==='https'?'; Secure':''}`);return response(res,200,{ok:true})}
  if(path==='/api/logout'&&method==='POST'){await db.remove('StaffSession',{token:cookie(req)});res.setHeader('Set-Cookie','tableflow_staff=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return response(res,200,{ok:true})}
  if(path==='/api/join'&&method==='POST'){
   rate(`join:${req.socket.remoteAddress}`,100);const b=await readBody(req),name=clean(b.name,60);if(name.length<2||!validNumber(b.party,1,30))throw fail('מלאו שם ומספר סועדים תקין.');
   const result=await db.transaction(async()=>{
    if(!validNumber(b.table,1,Number(await db.getConfig('tableCount','12')))||!equal(b.key,tableKey(b.table)))throw fail('קוד השולחן אינו תקין. סרקו את הקוד שהמסעדה הנפיקה.',403);
    let v=await db.one('Visit',{table_no:b.table,closed_at:null});
    if(v&&Date.now()-v.opened_at>8*3600000){if(await db.count('Order',{visit_id:v.id,status:{$nin:['served','cancelled']}}))throw fail('יש לבקש מהצוות לסיים את ההזמנות מהביקור הקודם לפני פתיחת ביקור חדש.',409);await db.update('Visit',{id:v.id},{$set:{closed_at:Date.now()}});v=null}
    if(!v)v=await db.create('Visit',{id:randomUUID(),table_no:b.table,party:b.party,opened_at:Date.now(),closed_at:null});
    const d={id:randomUUID(),token:randomBytes(32).toString('hex'),visitId:v.id,name,table:b.table,party:v.party};await db.create('Diner',{id:d.id,token:d.token,visit_id:v.id,name,joined_at:Date.now()});return d;
   });return response(res,201,result);
  }
  if(path==='/api/session'&&method==='GET'){const d=await diner(req);const orders=(await db.find('Order',{diner_id:d.id},{seq:-1})).map(publicOrder);return response(res,200,{id:d.id,name:d.name,table:d.table_no,party:d.party,visitId:d.visit_id,orders})}
  if(path==='/api/orders'&&method==='POST'){
   rate(`order:${req.socket.remoteAddress}`,100);const b=await readBody(req);if(typeof b.nonce!=='string'||! /^[a-zA-Z0-9-]{20,100}$/.test(b.nonce))throw fail('מזהה בקשה חסר.');const type=b.type;if(!['dinein','takeaway'].includes(type))throw fail('סוג הזמנה לא תקין.');
   const result=await db.transaction(async()=>{
    const token=type==='dinein'?bearer(req):clean(b.token,100);if(token.length<32)throw fail('מזהה סועד חסר.');const previous=await db.one('Order',{nonce:b.nonce});if(previous){if(!equal(token,previous.token))throw fail('מזהה בקשה בשימוש.',409);return {order:previous,repeated:true}}
    const d=type==='dinein'?await diner(req):null;
    if(!Array.isArray(b.items)||!b.items.length||b.items.length>40)throw fail('הוסיפו מנות להזמנה.');const items=[];
    for(const i of b.items){if(typeof i?.id!=='string'||! /^[a-z0-9-]{1,100}$/.test(i.id))throw fail('מנה לא תקינה.');const m=await db.one('MenuItem',{id:i?.id,deleted:{$ne:true}});if(!m||!validNumber(i.quantity,1,20))throw fail('מנה או כמות אינם תקינים.');if(!(await db.one('MenuItem',{id:m.id}))?.available)throw fail(`${m.name} אינה זמינה כרגע.`,409);items.push({id:m.id,name:m.name,price:m.price,quantity:i.quantity,notes:clean(i.notes,300)})}
    const name=d?.name||clean(b.name,60),phone=clean(b.phone,20).replace(/[\s-]/g,'');if(name.length<2)throw fail('נא למלא שם.');if(type==='takeaway'&&!/^0\d{8,9}$/.test(phone))throw fail('מספר טלפון ישראלי לא תקין.');const pickup=clean(b.pickup,40);if(type==='takeaway'&&!['בהקדם האפשרי','בעוד 30 דקות','בעוד שעה'].includes(pickup))throw fail('בחרו מועד איסוף.');
    const payload={name,phone:type==='takeaway'?phone:'',pickup,table:d?.table_no||null,party:d?.party||1,items,total:items.reduce((s,i)=>s+Math.round(i.price*100)*i.quantity,0)/100,notes:clean(b.notes,500)};
    const order=await db.create('Order',{id:randomUUID(),seq:await db.nextNumber('orders'),nonce:b.nonce,token,type,visit_id:d?.visit_id||null,diner_id:d?.id||null,payload,status:'new',payment:type==='takeaway'?'pending_phone':'at_restaurant',created_at:Date.now()});return {order,repeated:false};
   });return response(res,result.repeated?200:201,publicOrder(result.order));
  }
  if(path.startsWith('/api/my-order/')&&method==='GET'){const o=await db.one('Order',{id:path.split('/').pop()});if(!o||!equal(bearer(req),o.token))throw fail('הזמנה לא נמצאה.',404);return response(res,200,publicOrder(o))}
  if(path.startsWith('/api/admin')){
   await staff(req);
   if(await products.handle(req,res,path))return;
   if(path==='/api/admin/state'&&method==='GET'){const visits=await db.find('Visit',{closed_at:null},{table_no:1}),tables=[];for(const v of visits){const diners=(await db.find('Diner',{visit_id:v.id})).map(d=>({id:d.id,name:d.name}));tables.push({id:v.id,table:v.table_no,party:v.party,openedAt:v.opened_at,diners})}return response(res,200,{orders:(await db.find('Order',{}, {seq:-1},500)).map(publicOrder),tables,...await publicMenu(),...await reservations.state()})}
   if(path==='/api/admin/tables'&&method==='GET'){let base=process.env.ORDERS_PUBLIC_URL||url.searchParams.get('base')||`${req.headers['x-forwarded-proto']||'http'}://${req.headers.host}/order`;try{const u=new URL(base);if(!['http:','https:'].includes(u.protocol))throw 0;base=u.href.replace(/\/$/,'')}catch{throw fail('כתובת האתר אינה תקינה.')};const tables=[];for(let n=1;n<=Number(await db.getConfig('tableCount','12'));n++){const link=`${base}/menu?table=${n}&key=${tableKey(n)}`;tables.push({number:n,link,qr:await QRCode.toDataURL(link,{margin:2,width:256,errorCorrectionLevel:'M'})})}return response(res,200,{tables})}
   if(path.startsWith('/api/admin/order/')&&method==='PATCH'){
    const id=path.split('/').pop(),b=await readBody(req),updated=await db.transaction(async()=>{
     const o=await db.one('Order',{id});if(!o)throw fail('הזמנה לא נמצאה.',404);const transitions={new:['preparing','cancelled'],preparing:['ready','cancelled'],ready:['served'],served:[],cancelled:[]};const change={};
     if(b.payment){if(b.payment!=='paid'||o.type!=='takeaway'||o.status==='cancelled')throw fail('עדכון תשלום לא תקין.');change.payment='paid'}
     if(b.status){if(!transitions[o.status]?.includes(b.status))throw fail('מעבר סטטוס אינו אפשרי.',409);if(o.type==='takeaway'&&(change.payment||o.payment)!=='paid'&&b.status==='preparing')throw fail('יש להסדיר תשלום טלפוני לפני הכנת טייק אווי.',409);change.status=b.status}
     return Object.keys(change).length?db.update('Order',{id},{$set:change}):o;
    });return response(res,200,publicOrder(updated));
   }
   if(path.startsWith('/api/admin/table/')&&method==='PATCH'){const n=Number(path.split('/').pop()),b=await readBody(req);await db.transaction(async()=>{const v=await db.one('Visit',{table_no:n,closed_at:null});if(!v)throw fail('השולחן אינו פעיל.',404);if(b.close){if(await db.count('Order',{visit_id:v.id,status:{$nin:['served','cancelled']}}))throw fail('יש להשלים או לבטל את ההזמנות הפעילות לפני סגירת השולחן.',409);await db.update('Visit',{id:v.id},{$set:{closed_at:Date.now()}})}else if(validNumber(b.party,1,30))await db.update('Visit',{id:v.id},{$set:{party:b.party}});else throw fail('מספר סועדים לא תקין.')});return response(res,200,{ok:true})}
   if(path.startsWith('/api/admin/menu/')&&method==='PATCH'){const id=path.split('/').pop(),b=await readBody(req);if(!menu.some(m=>m.id===id)||typeof b.available!=='boolean')throw fail('מנה לא תקינה.');await db.transaction(()=>db.update('MenuItem',{id},{$set:{available:b.available},$inc:{revision:1}}));return response(res,200,{ok:true})}
   const uploadMatch=path.match(/^\/api\/admin\/video\/([a-z0-9-]+)\/uploads(?:\/([a-f0-9-]+)(?:\/chunks\/(\d+))?)?$/);
   if(uploadMatch){
    const [,dish,uploadId,index]=uploadMatch,owner=await staff(req),uploads=db.models.VideoUpload,chunks=db.models.VideoUploadChunk;
    if(!menu.some(m=>m.id===dish))throw fail('Unknown dish',404);
    if(!uploadId&&method==='POST'){const b=await readBody(req);if(!validNumber(b.size,13,20*1024*1024))throw fail('Video must be at most 20MB');const id=randomUUID();await uploads.create({_id:id,owner,dish,size:b.size,expiresAt:new Date(Date.now()+3600000)});return response(res,201,{id,chunkSize:1024*1024})}
    const record=await uploads.findOne({_id:uploadId,owner,dish,expiresAt:{$gt:new Date()}}).lean();if(!record)throw fail('Upload expired',404);
    if(index!==undefined&&method==='PUT'){const n=Number(index),count=Math.ceil(record.size/(1024*1024));if(!validNumber(n,0,count-1))throw fail('Invalid chunk');const bytes=await readBody(req,1024*1024,true);if(bytes.length!==Math.min(1024*1024,record.size-n*1024*1024))throw fail('Invalid chunk size');await chunks.updateOne({_id:uploadId+':'+n},{$set:{uploadId,index:n,data:bytes.toString('base64'),expiresAt:record.expiresAt}},{upsert:true});return response(res,200,{ok:true})}
    if(index===undefined&&method==='POST'){return db.transaction(async()=>{const record=await db.one('VideoUpload',{_id:uploadId,owner,dish});if(record.video)return response(res,200,{video:record.video});const count=Math.ceil(record.size/(1024*1024)),parts=[];for(let n=0;n<count;n++){const part=await chunks.findById(uploadId+':'+n).lean();if(!part)throw fail('Missing chunk',409);parts.push(Buffer.from(part.data,'base64'))}const bytes=Buffer.concat(parts);let ext;if(bytes.subarray(4,8).toString()==='ftyp')ext='.mp4';else if(bytes.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3])))ext='.webm';else throw fail('Invalid MP4 / WebM');const name=randomUUID()+ext;await db.storeVideo(name,bytes,ext==='.mp4'?'video/mp4':'video/webm');const video='/media/'+name;await db.update('MenuItem',{id:dish},{$set:{video}});await db.update('VideoUpload',{_id:uploadId},{$set:{video}});return response(res,201,{video})});}
    throw fail('Unknown upload action',404);
   }
   if(path.startsWith('/api/admin/video/')&&method==='POST'){const id=path.split('/').pop();if(!menu.some(m=>m.id===id))throw fail('מנה לא נמצאה.');const bytes=await readBody(req,4*1024*1024,true);let ext;if(bytes.length>12&&bytes.subarray(4,8).toString()==='ftyp')ext='.mp4';else if(bytes.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3])))ext='.webm';else throw fail('יש להעלות וידאו MP4 או WebM תקין.');const name=randomUUID()+ext;await db.storeVideo(name,bytes,ext==='.mp4'?'video/mp4':'video/webm');await db.transaction(()=>db.update('MenuItem',{id},{$set:{video:'/media/'+name}}));return response(res,201,{video:'/media/'+name})}
   if(path==='/api/admin/settings'&&method==='PATCH'){const b=await readBody(req);if(!validNumber(b.tableCount,1,60)||clean(b.restaurant,60).length<2||!/^0\d{8,9}$/.test(b.phone))throw fail('פרטי עסק לא תקינים.');await db.transaction(async()=>{if(await db.one('Visit',{closed_at:null,table_no:{$gt:b.tableCount}}))throw fail('סגרו שולחנות פעילים לפני הקטנת מספר השולחנות.',409);await reservations.assertTableCount(b.tableCount);for(const key of ['restaurant','phone','tableCount'])await db.setConfig(key,b[key]);await db.ensureTables()});return response(res,200,{ok:true})}
   throw fail('פעולה לא נמצאה.',404);
  }
  if(path.startsWith('/api/'))throw fail('פעולה לא נמצאה.',404);
  let file,mime;const mediaMatch=path.match(/^\/media\/([a-f0-9-]+\.(mp4|webm|jpg|png|webp))$/);
  if(mediaMatch){const video=await db.video(mediaMatch[1]);mime=({mp4:'video/mp4',webm:'video/webm',jpg:'image/jpeg',png:'image/png',webp:'image/webp'})[mediaMatch[2]];if(video){const size=video.length;let start=0,end=size-1,status=200;res.setHeader('Content-Type',mime);res.setHeader('Accept-Ranges','bytes');if(req.headers.range){const range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);if(!range){res.writeHead(416,{'Content-Range':`bytes */${size}`});return res.end()}start=Number(range[1]);end=range[2]?Math.min(Number(range[2]),size-1):size-1;if(start>end||start>=size){res.writeHead(416,{'Content-Range':`bytes */${size}`});return res.end()}status=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${size}`)}res.writeHead(status,{'Content-Length':end-start+1,'Cache-Control':'public, max-age=300'});const stream=db.videoStream(video._id,start,end+1);stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());return stream.pipe(res)}throw fail('הקובץ לא נמצא.',404)}
  else if(path.startsWith('/images/')){const name=path.split('/').pop();if(!/^[a-z0-9-]+\.(jpg|png|webp)$/.test(name))throw fail('קובץ לא תקין.',404);file=existsSync(join(root,'public/images',name))?join(root,'public/images',name):join(root,'../public/images',name);mime=extname(name)==='.png'?'image/png':'image/jpeg'}
  else if(['/app.js','/booking.js','/style.css'].includes(path)){file=join(root,'public',path.slice(1));mime=path.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8'}
  else if(['/','/menu','/takeaway','/admin','/kitchen'].includes(path)){file=join(root,'public/index.html');mime='text/html; charset=utf-8'}else throw fail('העמוד לא נמצא.',404);
  if(!existsSync(/* turbopackIgnore: true */ file))throw fail('הקובץ לא נמצא.',404);const size=statSync(/* turbopackIgnore: true */ file).size;res.setHeader('Content-Type',mime);res.setHeader('Cache-Control',mime.startsWith('text/')?'no-store':'public, max-age=300');
  if(mediaMatch&&req.headers.range){const range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);if(!range){res.writeHead(416);return res.end()}const start=Number(range[1]),end=range[2]?Math.min(Number(range[2]),size-1):size-1;if(start>end||start>=size){res.writeHead(416,{'Content-Range':`bytes */${size}`});return res.end()}res.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${size}`,'Accept-Ranges':'bytes','Content-Length':end-start+1});return createReadStream(/* turbopackIgnore: true */ file,{start,end}).pipe(res)}
  res.writeHead(200,{'Content-Length':size});createReadStream(/* turbopackIgnore: true */ file).pipe(res);
 }catch(e){if(!res.headersSent)response(res,e.status||500,{error:e.status?e.message:'אירעה שגיאה בשרת. נסו שוב.'});else res.end();if(!e.status)console.error('Request failed:',e.name||'Error',e.code||'')}
 };
 return {handle,publicMenu,database:db,models:db.models,close:()=>db.close()};
 }catch(error){await db.close().catch(()=>{});throw error}
}
