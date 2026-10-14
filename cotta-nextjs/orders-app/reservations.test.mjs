import {testDatabase} from './test-database.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID,randomBytes} from 'node:crypto';
import {createOrderServer} from './server.mjs';
test('native bookings: approval, overlapping slots, capacity, cancellation, persistence and concurrent managers',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'cotta-booking-test-'));const database=await testDatabase();let s=await createOrderServer({dataDir:dir,mongoUri:database.mongoUri});await new Promise(r=>s.listen(0,'127.0.0.1',r));let root=`http://127.0.0.1:${s.address().port}/api`,cookie;
 async function call(path,method='GET',body,auth=false,token){const r=await fetch(root+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(auth?{Cookie:cookie}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),headers:r.headers}}
 try{
  cookie=(await call('/login','POST',{username:'פיצה',password:'123'})).headers.get('set-cookie').split(';')[0];
  let date=new Date(Date.now()+86400000);while(date.getUTCDay()===0)date=new Date(date.getTime()+86400000);date=date.toISOString().slice(0,10);
  let state=(await call('/admin/state','GET',null,true)).data;const tables=state.bookingConfig.tables.map(t=>({...t,enabled:t.number===1,seats:t.number===1?4:t.seats}));
  assert.equal((await call('/admin/booking-config','PATCH',{duration:90,hours:state.bookingConfig.hours,tables},true)).status,200);
  const availability=()=>call(`/reservations/availability?date=${date}&party=2&area=inside`);assert.equal((await availability()).data.slots.find(s=>s.time==='19:00').available,1);
  function request(time='19:00',party=2,area='inside'){return {nonce:randomUUID(),token:randomBytes(32).toString('hex'),name:'אבי בדיקה',phone:'0501234567',date,time,party,area,notes:'יום הולדת'}}
  const b1=request(),b2=request('19:30'),one=await call('/reservations','POST',b1),two=await call('/reservations','POST',b2);assert.equal(one.status,201);assert.equal(one.data.status,'pending');assert.equal(two.status,201);assert.equal((await call('/reservations','POST',b1)).data.id,one.data.id);assert.equal((await availability()).data.slots.find(s=>s.time==='19:00').available,1);
  assert.equal((await call(`/admin/reservations/${one.data.id}`,'PATCH',{status:'confirmed',table:1})).status,401);
  const [a,b]=await Promise.all([call(`/admin/reservations/${one.data.id}`,'PATCH',{status:'confirmed',table:1},true),call(`/admin/reservations/${two.data.id}`,'PATCH',{status:'confirmed',table:1},true)]);assert.deepEqual([a.status,b.status].sort(),[200,409]);const winner=a.status===200?one:two,winBody=a.status===200?b1:b2;
  const slots=(await availability()).data.slots.map(s=>s.time);assert.ok(!slots.includes('19:00'));assert.ok(!slots.includes('19:30'));assert.ok(slots.includes(a.status===200?'20:30':'21:00'));assert.ok(slots.includes('18:00')=== (a.status!==200));
  assert.equal((await call('/reservations','POST',request('19:00'))).status,409);assert.equal((await call('/reservations','POST',request('19:00',5))).status,409);assert.equal((await call('/reservations','POST',request('19:00',2,'outside'))).status,409);
  assert.equal((await call(`/reservations/${winner.data.id}`,'GET')).status,404);assert.equal((await call(`/reservations/${winner.data.id}`,'GET',null,false,winBody.token)).data.status,'confirmed');
  assert.equal((await call('/admin/booking-config','PATCH',{duration:90,hours:state.bookingConfig.hours,tables:tables.map(t=>({...t,enabled:false}))},true)).status,409);
  assert.equal((await call(`/reservations/${winner.data.id}`,'PATCH',{status:'cancelled'},false,winBody.token)).status,200);assert.equal((await availability()).data.slots.find(s=>s.time==='19:00').available,1);
  const sameStart=await call('/reservations','POST',request('19:00'));assert.equal(sameStart.status,201);assert.equal((await call(`/admin/reservations/${sameStart.data.id}`,'PATCH',{status:'confirmed',table:1},true)).status,200);
  assert.equal((await call(`/admin/reservations/${sameStart.data.id}`,'PATCH',{status:'seated'},true)).status,200);assert.equal((await call(`/admin/reservations/${sameStart.data.id}`,'PATCH',{status:'completed'},true)).status,200);assert.ok(!(await availability()).data.slots.some(s=>s.time==='19:00'));
  assert.equal((await call('/reservations','POST',{...request(),phone:'bad'})).status,400);assert.equal((await call('/reservations','POST',request('19:15'))).status,400);assert.equal((await call('/reservations/availability?date=2026-02-31&party=2')).status,400);assert.equal((await call('/reservations','POST',{...request(),date:'2000-01-01'})).status,400);
  await new Promise(r=>s.close(r));await s.databaseClosed;s=await createOrderServer({dataDir:dir,mongoUri:database.mongoUri});await new Promise(r=>s.listen(0,'127.0.0.1',r));root=`http://127.0.0.1:${s.address().port}/api`;assert.equal((await call(`/reservations/${winner.data.id}`,'GET',null,false,winBody.token)).data.status,'cancelled');assert.ok(!(await availability()).data.slots.some(s=>s.time==='19:00'));
 }finally{await new Promise(r=>s.close(r));await s.databaseClosed;await database.close();rmSync(dir,{recursive:true,force:true})}
});
