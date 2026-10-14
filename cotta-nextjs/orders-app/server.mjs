import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID,randomBytes,createHmac,timingSafeEqual} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,existsSync,statSync,createReadStream} from 'node:fs';
import {join,dirname,resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import QRCode from 'qrcode';
import {createReservations} from './reservations.mjs';
import {loadEnvFile} from 'node:process';
if(existsSync('.env'))loadEnvFile('.env');
const root=dirname(fileURLToPath(import.meta.url));
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const clean=(v,max=100)=>typeof v==='string'?v.trim().slice(0,max):'';
const validNumber=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
const equal=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y)};
export function createOrderServer(options={}){
 const data=resolve(options.dataDir||process.env.ORDERS_DATA_DIR||join(root,'data'));mkdirSync(data,{recursive:true});mkdirSync(join(data,'media'),{recursive:true});
 const db=new DatabaseSync(join(data,'orders.sqlite'));db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
 db.exec(`CREATE TABLE IF NOT EXISTS config(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS visits(id TEXT PRIMARY KEY,table_no INTEGER NOT NULL,party INTEGER NOT NULL,opened_at INTEGER NOT NULL,closed_at INTEGER);
 CREATE UNIQUE INDEX IF NOT EXISTS open_table ON visits(table_no) WHERE closed_at IS NULL;
 CREATE TABLE IF NOT EXISTS diners(id TEXT PRIMARY KEY,token TEXT UNIQUE NOT NULL,visit_id TEXT NOT NULL REFERENCES visits(id),name TEXT NOT NULL,joined_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS orders(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,nonce TEXT UNIQUE NOT NULL,token TEXT NOT NULL,type TEXT NOT NULL,visit_id TEXT,diner_id TEXT,payload TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'new',payment TEXT NOT NULL,created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS availability(id TEXT PRIMARY KEY,available INTEGER NOT NULL DEFAULT 1,video TEXT);`);
 const getConfig=(key,fallback)=>db.prepare('SELECT value FROM config WHERE key=?').get(key)?.value||fallback;
 const setConfig=(key,value)=>db.prepare('INSERT INTO config(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,String(value));
 let secret=getConfig('secret','');if(!secret){secret=randomBytes(32).toString('hex');setConfig('secret',secret)}
 const username=options.username||process.env.ORDERS_USERNAME||'פיצה',password=options.password||process.env.ORDERS_PASSWORD||'123';
 const menuPath=existsSync(join(root,'menu.json'))?join(root,'menu.json'):join(root,'../shared/menu.json');
 const menu=JSON.parse(readFileSync(menuPath,'utf8'));for(const m of menu)db.prepare('INSERT OR IGNORE INTO availability(id) VALUES (?)').run(m.id);
 const tokens=new Map(),rates=new Map();
 function rate(key,limit,window=900000){const now=Date.now(),r=rates.get(key);if(!r||r.until<now){rates.set(key,{until:now+window,count:1});return}if(++r.count>limit)throw fail('יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.',429)}
 function cookie(req){return (req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('tableflow_staff='))?.slice(16)||''}
 function staff(req){const token=cookie(req),session=tokens.get(token);if(!session||session<Date.now())throw fail('יש להתחבר לממשק הניהול.',401);return token}
 function bearer(req){return String(req.headers.authorization||'').replace(/^Bearer /,'')}
 function diner(req,allowClosed=false){const d=db.prepare('SELECT d.*,v.table_no,v.party,v.closed_at,v.opened_at FROM diners d JOIN visits v ON v.id=d.visit_id WHERE d.token=?').get(bearer(req));if(!d)throw fail('יש לסרוק את הקוד שעל השולחן ולהצטרף לביקור.',401);if(!allowClosed&&(d.closed_at||Date.now()-d.opened_at>8*3600000))throw fail('הביקור הסתיים. סרקו שוב את הקוד שעל השולחן.',410);return d}
 const tableKey=n=>createHmac('sha256',secret).update(`table:${n}`).digest('hex').slice(0,32);
 function transaction(fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result}catch(e){db.exec('ROLLBACK');throw e}}
 function publicOrder(o){const p=JSON.parse(o.payload);return {id:o.id,number:o.seq,type:o.type,visitId:o.visit_id,dinerId:o.diner_id,status:o.status,payment:o.payment,createdAt:o.created_at,...p}}
 const allOrders=()=>db.prepare('SELECT * FROM orders ORDER BY seq DESC LIMIT 500').all().map(publicOrder);
 const publicMenu=()=>{const availability=db.prepare('SELECT * FROM availability').all();return {restaurant:getConfig('restaurant','COTTA'),phone:getConfig('phone','035220118'),tableCount:Number(getConfig('tableCount','12')),menu:menu.map(m=>({...m,available:!!availability.find(a=>a.id===m.id)?.available})),videos:Object.fromEntries(availability.filter(a=>a.video).map(a=>[a.id,a.video]))}};
 async function readBody(req,limit=64000,raw=false){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>limit)throw fail('הקובץ או הבקשה גדולים מדי.',413);chunks.push(chunk)}const body=Buffer.concat(chunks);if(raw)return body;try{return JSON.parse(body.toString()||'{}')}catch{throw fail('בקשה לא תקינה.')}}
 function response(res,status,payload){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(payload))}
 const reservations=createReservations({db,getConfig,setConfig,transaction,readBody,response,staff,bearer,rate});
 const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost'),path=url.pathname,method=req.method;
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
  if(['POST','PATCH','DELETE'].includes(method)&&req.headers.origin){const origin=new URL(req.headers.origin).host,host=req.headers['x-forwarded-host']||req.headers.host;if(origin!==host)throw fail('מקור בקשה לא מורשה.',403)}
  if(await reservations.handle(req,res,url))return;
  if(path==='/api/menu'&&method==='GET')return response(res,200,publicMenu());
  if(path==='/api/login'&&method==='POST'){rate(`login:${req.socket.remoteAddress}`,10);const b=await readBody(req);if(!equal(b.username,username)||!equal(b.password,password))throw fail('שם המשתמש או הסיסמה אינם נכונים.',401);const token=randomBytes(32).toString('hex');tokens.set(token,Date.now()+12*3600000);res.setHeader('Set-Cookie',`tableflow_staff=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${req.headers['x-forwarded-proto']==='https'?'; Secure':''}`);return response(res,200,{ok:true})}
  if(path==='/api/logout'&&method==='POST'){tokens.delete(cookie(req));res.setHeader('Set-Cookie','tableflow_staff=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return response(res,200,{ok:true})}
  if(path==='/api/join'&&method==='POST'){
   rate(`join:${req.socket.remoteAddress}`,100);const b=await readBody(req);if(!validNumber(b.table,1,Number(getConfig('tableCount','12')))||!equal(b.key,tableKey(b.table)))throw fail('קוד השולחן אינו תקין. סרקו את הקוד שהמסעדה הנפיקה.',403);const name=clean(b.name,60);if(name.length<2||!validNumber(b.party,1,30))throw fail('מלאו שם ומספר סועדים תקין.');
   const result=transaction(()=>{let v=db.prepare('SELECT * FROM visits WHERE table_no=? AND closed_at IS NULL').get(b.table);if(v&&Date.now()-v.opened_at>8*3600000){const pending=db.prepare("SELECT count(*) AS n FROM orders WHERE visit_id=? AND status NOT IN ('served','cancelled')").get(v.id);if(pending.n)throw fail('יש לבקש מהצוות לסיים את ההזמנות מהביקור הקודם לפני פתיחת ביקור חדש.',409);db.prepare('UPDATE visits SET closed_at=? WHERE id=?').run(Date.now(),v.id);v=null}if(!v){v={id:randomUUID(),table_no:b.table,party:b.party,opened_at:Date.now()};db.prepare('INSERT INTO visits(id,table_no,party,opened_at) VALUES (?,?,?,?)').run(v.id,b.table,b.party,v.opened_at)}
    const d={id:randomUUID(),token:randomBytes(32).toString('hex'),visitId:v.id,name,table:b.table,party:v.party};db.prepare('INSERT INTO diners VALUES (?,?,?,?,?)').run(d.id,d.token,v.id,name,Date.now());return d});
   return response(res,201,result);
  }
  if(path==='/api/session'&&method==='GET'){const d=diner(req);const orders=db.prepare('SELECT * FROM orders WHERE diner_id=? ORDER BY seq DESC').all(d.id).map(publicOrder);return response(res,200,{id:d.id,name:d.name,table:d.table_no,party:d.party,visitId:d.visit_id,orders})}
  if(path==='/api/orders'&&method==='POST'){
   rate(`order:${req.socket.remoteAddress}`,100);const b=await readBody(req);if(typeof b.nonce!=='string'||! /^[a-zA-Z0-9-]{20,100}$/.test(b.nonce))throw fail('מזהה בקשה חסר.');const type=b.type;if(!['dinein','takeaway'].includes(type))throw fail('סוג הזמנה לא תקין.');const d=type==='dinein'?diner(req):null;
   const token=d?.token||clean(b.token,100);if(token.length<32)throw fail('מזהה סועד חסר.');const previous=db.prepare('SELECT * FROM orders WHERE nonce=?').get(b.nonce);if(previous){if(!equal(token,previous.token))throw fail('מזהה בקשה בשימוש.',409);return response(res,200,publicOrder(previous))}
   if(!Array.isArray(b.items)||!b.items.length||b.items.length>40)throw fail('הוסיפו מנות להזמנה.');
   const items=b.items.map(i=>{const m=menu.find(m=>m.id===i.id);if(!m||!validNumber(i.quantity,1,20))throw fail('מנה או כמות אינם תקינים.');if(!db.prepare('SELECT available FROM availability WHERE id=?').get(m.id)?.available)throw fail(`${m.name} אינה זמינה כרגע.`,409);return {id:m.id,name:m.name,price:m.price,quantity:i.quantity,notes:clean(i.notes,300)}});
   const name=d?.name||clean(b.name,60),phone=clean(b.phone,20).replace(/[\s-]/g,'');if(name.length<2)throw fail('נא למלא שם.');if(type==='takeaway'&&!/^0\d{8,9}$/.test(phone))throw fail('מספר טלפון ישראלי לא תקין.');
   const pickup=clean(b.pickup,40);if(type==='takeaway'&&!['בהקדם האפשרי','בעוד 30 דקות','בעוד שעה'].includes(pickup))throw fail('בחרו מועד איסוף.');
   const id=randomUUID(),payload={name,phone:type==='takeaway'?phone:'',pickup,table:d?.table_no||null,party:d?.party||1,items,total:items.reduce((s,i)=>s+i.price*i.quantity,0),notes:clean(b.notes,500)};
   db.prepare('INSERT INTO orders(id,nonce,token,type,visit_id,diner_id,payload,payment,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(id,b.nonce,token,type,d?.visit_id||null,d?.id||null,JSON.stringify(payload),type==='takeaway'?'pending_phone':'at_restaurant',Date.now());return response(res,201,publicOrder(db.prepare('SELECT * FROM orders WHERE id=?').get(id)));
  }
  if(path.startsWith('/api/my-order/')&&method==='GET'){const o=db.prepare('SELECT * FROM orders WHERE id=?').get(path.split('/').pop());if(!o||!equal(bearer(req),o.token))throw fail('הזמנה לא נמצאה.',404);return response(res,200,publicOrder(o))}
  if(path.startsWith('/api/admin')){
   staff(req);
   if(path==='/api/admin/state'&&method==='GET'){const tables=db.prepare('SELECT * FROM visits WHERE closed_at IS NULL ORDER BY table_no').all().map(v=>({id:v.id,table:v.table_no,party:v.party,openedAt:v.opened_at,diners:db.prepare('SELECT id,name FROM diners WHERE visit_id=?').all(v.id)}));return response(res,200,{orders:allOrders(),tables,...publicMenu(),...reservations.state()})}
   if(path==='/api/admin/tables'&&method==='GET'){let base=process.env.ORDERS_PUBLIC_URL||url.searchParams.get('base')||`http://${req.headers.host}`;try{const u=new URL(base);if(!['http:','https:'].includes(u.protocol))throw 0;base=u.href.replace(/\/$/,'')}catch{throw fail('כתובת האתר אינה תקינה.')};const tables=[];for(let n=1;n<=Number(getConfig('tableCount','12'));n++){const link=`${base}/menu?table=${n}&key=${tableKey(n)}`;tables.push({number:n,link,qr:await QRCode.toDataURL(link,{margin:2,width:256,errorCorrectionLevel:'M'})})}return response(res,200,{tables})}
   if(path.startsWith('/api/admin/order/')&&method==='PATCH'){const id=path.split('/').pop(),b=await readBody(req),o=db.prepare('SELECT * FROM orders WHERE id=?').get(id);if(!o)throw fail('הזמנה לא נמצאה.',404);const transitions={new:['preparing','cancelled'],preparing:['ready','cancelled'],ready:['served'],served:[],cancelled:[]};if(b.status){if(!transitions[o.status]?.includes(b.status))throw fail('מעבר סטטוס אינו אפשרי.',409);if(o.type==='takeaway'&&o.payment!=='paid'&&b.status==='preparing')throw fail('יש להסדיר תשלום טלפוני לפני הכנת טייק אווי.',409);db.prepare('UPDATE orders SET status=? WHERE id=? AND status=?').run(b.status,id,o.status)}if(b.payment){if(b.payment!=='paid'||o.type!=='takeaway'||o.status==='cancelled')throw fail('עדכון תשלום לא תקין.');db.prepare('UPDATE orders SET payment=? WHERE id=?').run('paid',id)}return response(res,200,publicOrder(db.prepare('SELECT * FROM orders WHERE id=?').get(id)))}
   if(path.startsWith('/api/admin/table/')&&method==='PATCH'){const n=Number(path.split('/').pop()),b=await readBody(req);const v=db.prepare('SELECT * FROM visits WHERE table_no=? AND closed_at IS NULL').get(n);if(!v)throw fail('השולחן אינו פעיל.',404);if(b.close){const pending=db.prepare("SELECT count(*) AS n FROM orders WHERE visit_id=? AND status NOT IN ('served','cancelled')").get(v.id);if(pending.n)throw fail('יש להשלים או לבטל את ההזמנות הפעילות לפני סגירת השולחן.',409);db.prepare('UPDATE visits SET closed_at=? WHERE id=?').run(Date.now(),v.id)}else if(validNumber(b.party,1,30))db.prepare('UPDATE visits SET party=? WHERE id=?').run(b.party,v.id);else throw fail('מספר סועדים לא תקין.');return response(res,200,{ok:true})}
   if(path.startsWith('/api/admin/menu/')&&method==='PATCH'){const id=path.split('/').pop(),b=await readBody(req);if(!menu.some(m=>m.id===id)||typeof b.available!=='boolean')throw fail('מנה לא תקינה.');db.prepare('UPDATE availability SET available=? WHERE id=?').run(Number(b.available),id);return response(res,200,{ok:true})}
   if(path.startsWith('/api/admin/video/')&&method==='POST'){const id=path.split('/').pop();if(!menu.some(m=>m.id===id))throw fail('מנה לא נמצאה.');const bytes=await readBody(req,20*1024*1024,true);let ext;if(bytes.length>12&&bytes.subarray(4,8).toString()==='ftyp')ext='.mp4';else if(bytes.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3])))ext='.webm';else throw fail('יש להעלות וידאו MP4 או WebM תקין.');const name=randomUUID()+ext;writeFileSync(join(data,'media',name),bytes);db.prepare('UPDATE availability SET video=? WHERE id=?').run('/media/'+name,id);return response(res,201,{video:'/media/'+name})}
   if(path==='/api/admin/settings'&&method==='PATCH'){const b=await readBody(req);if(!validNumber(b.tableCount,1,60)||clean(b.restaurant,60).length<2||!/^0\d{8,9}$/.test(b.phone))throw fail('פרטי עסק לא תקינים.');const active=db.prepare('SELECT max(table_no) AS n FROM visits WHERE closed_at IS NULL').get();if(active.n>b.tableCount)throw fail('סגרו שולחנות פעילים לפני הקטנת מספר השולחנות.',409);reservations.assertTableCount(b.tableCount);for(const key of ['restaurant','phone','tableCount'])setConfig(key,b[key]);return response(res,200,{ok:true})}
   throw fail('פעולה לא נמצאה.',404);
  }
  if(path.startsWith('/api/'))throw fail('פעולה לא נמצאה.',404);
  let file,mime;const mediaMatch=path.match(/^\/media\/([a-f0-9-]+\.(mp4|webm))$/);
  if(mediaMatch){file=join(data,'media',mediaMatch[1]);mime=mediaMatch[2]==='mp4'?'video/mp4':'video/webm'}
  else if(path.startsWith('/images/')){const name=path.split('/').pop();if(!/^[a-z0-9-]+\.(jpg|png|webp)$/.test(name))throw fail('קובץ לא תקין.',404);file=existsSync(join(root,'public/images',name))?join(root,'public/images',name):join(root,'../public/images',name);mime=extname(name)==='.png'?'image/png':'image/jpeg'}
  else if(['/app.js','/booking.js','/style.css'].includes(path)){file=join(root,'public',path.slice(1));mime=path.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8'}
  else if(['/','/menu','/takeaway','/admin','/kitchen'].includes(path)){file=join(root,'public/index.html');mime='text/html; charset=utf-8'}else throw fail('העמוד לא נמצא.',404);
  if(!existsSync(file))throw fail('הקובץ לא נמצא.',404);const size=statSync(file).size;res.setHeader('Content-Type',mime);res.setHeader('Cache-Control',mime.startsWith('text/html')?'no-store':'public, max-age=300');
  if(mediaMatch&&req.headers.range){const range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);if(!range){res.writeHead(416);return res.end()}const start=Number(range[1]),end=range[2]?Math.min(Number(range[2]),size-1):size-1;if(start> end||start>=size){res.writeHead(416,{'Content-Range':`bytes */${size}`});return res.end()}res.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${size}`,'Accept-Ranges':'bytes','Content-Length':end-start+1});return createReadStream(file,{start,end}).pipe(res)}
  res.writeHead(200,{'Content-Length':size});createReadStream(file).pipe(res);
 }catch(e){if(!res.headersSent)response(res,e.status||500,{error:e.status?e.message:'אירעה שגיאה בשרת. נסו שוב.'});else res.end();if(!e.status)console.error(e)}
 });
 server.on('close',()=>db.close());server.database=db;return server;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const server=createOrderServer();const port=Number(process.env.ORDERS_PORT||4100);server.listen(port,'0.0.0.0',()=>console.log(`TableFlow orders: http://localhost:${port} | Staff: /admin | Kitchen: /kitchen`))}
