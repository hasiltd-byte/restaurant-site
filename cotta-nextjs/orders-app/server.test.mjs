import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createOrderServer} from './server.mjs';
import {randomUUID} from 'node:crypto';
test('real shared orders: auth, table visits, pricing, idempotency, kitchen, takeaway and persistence',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'tableflow-test-'));let server=createOrderServer({dataDir:dir});await new Promise(r=>server.listen(0,'127.0.0.1',r));let url=`http://127.0.0.1:${server.address().port}`,cookie='';
 async function call(path,method='GET',body,token,staff=false){const r=await fetch(url+'/api'+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{}),...(staff?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),headers:r.headers}}
 try{
  assert.equal((await call('/admin/state')).status,401);
  assert.equal((await call('/login','POST',{username:'פיצה',password:'wrong'})).status,401);
  const login=await call('/login','POST',{username:'פיצה',password:'123'});assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];assert.match(login.headers.get('set-cookie'),/HttpOnly/);
  const qr=await call('/admin/tables?base='+encodeURIComponent('https://example.com/order'),'GET',null,null,true);assert.equal(qr.status,200);assert.equal(qr.data.tables.length,12);assert.notEqual(qr.data.tables[0].link,qr.data.tables[1].link);assert.match(qr.data.tables[0].qr,/^data:image\/png;base64,/);
  const link=new URL(qr.data.tables[0].link),key=link.searchParams.get('key');assert.equal((await call('/join','POST',{table:1,key:'bad',name:'אבי',party:3})).status,403);
  const a=(await call('/join','POST',{table:1,key,name:'אבי',party:3})).data,b=(await call('/join','POST',{table:1,key,name:'דנה',party:3})).data;assert.notEqual(a.id,b.id);assert.equal(a.visitId,b.visitId);
  const body={type:'dinein',nonce:randomUUID(),items:[{id:'margherita',quantity:2,price:1,notes:'בלי בזיליקום'},{id:'cola',quantity:1}],notes:'לחלוקה'};
  const o=await call('/orders','POST',body,a.token);assert.equal(o.status,201);assert.equal(o.data.total,158);assert.equal(o.data.table,1);assert.equal(o.data.name,'אבי');assert.equal(o.data.party,3);assert.equal(o.data.token,undefined);
  const retry=await call('/orders','POST',body,a.token);assert.equal(retry.data.id,o.data.id);assert.equal(retry.status,200);assert.equal((await call('/orders','POST',body,b.token)).status,409);
  assert.equal((await call('/session','GET',null,b.token)).data.orders.length,0);assert.equal((await call('/session','GET',null,a.token)).data.orders.length,1);
  assert.equal((await call(`/my-order/${o.data.id}`,'GET',null,b.token)).status,404);
  const admin=(await call('/admin/state','GET',null,null,true)).data;assert.equal(admin.orders.length,1);assert.equal(admin.tables[0].diners.length,2);
  assert.equal((await call('/admin/table/1','PATCH',{close:true},null,true)).status,409);
  assert.equal((await call(`/admin/order/${o.data.id}`,'PATCH',{status:'ready'},null,true)).status,409);
  for(const status of ['preparing','ready','served'])assert.equal((await call(`/admin/order/${o.data.id}`,'PATCH',{status},null,true)).status,200);
  assert.equal((await call('/admin/table/1','PATCH',{close:true},null,true)).status,200);assert.equal((await call('/session','GET',null,a.token)).status,410);
  const next=(await call('/join','POST',{table:1,key,name:'נועה',party:2})).data;assert.notEqual(next.visitId,a.visitId);
  assert.equal((await call('/admin/menu/margherita','PATCH',{available:false},null,true)).status,200);assert.equal((await call('/orders','POST',{...body,nonce:randomUUID()},next.token)).status,409);await call('/admin/menu/margherita','PATCH',{available:true},null,true);
  const take={type:'takeaway',nonce:randomUUID(),token:randomUUID(),name:'משה',phone:'0501234567',pickup:'בעוד 30 דקות',items:[{id:'margherita',quantity:1}]};const to=await call('/orders','POST',take);assert.equal(to.status,201);assert.equal(to.data.payment,'pending_phone');assert.equal((await call(`/admin/order/${to.data.id}`,'PATCH',{status:'preparing'},null,true)).status,409);assert.equal((await call(`/admin/order/${to.data.id}`,'PATCH',{payment:'paid'},null,true)).status,200);assert.equal((await call(`/admin/order/${to.data.id}`,'PATCH',{status:'preparing'},null,true)).status,200);
  assert.equal((await call('/orders','POST',{...take,nonce:randomUUID(),phone:'123'})).status,400);assert.equal((await call('/orders','POST',{...take,nonce:randomUUID(),items:[{id:'margherita',quantity:-1}]})).status,400);
  const badOrigin=await fetch(url+'/api/orders',{method:'POST',headers:{Origin:'https://malicious.example','Content-Type':'application/json'},body:JSON.stringify(take)});assert.equal(badOrigin.status,403);
  const pendingVisitOrder=await call('/orders','POST',{...body,nonce:randomUUID()},next.token);assert.equal(pendingVisitOrder.status,201);server.database.prepare('UPDATE visits SET opened_at=? WHERE id=?').run(Date.now()-9*3600000,next.visitId);assert.equal((await call('/session','GET',null,next.token)).status,410);assert.equal((await call('/join','POST',{table:1,key,name:'רותם',party:2})).status,409);assert.equal((await call(`/admin/order/${pendingVisitOrder.data.id}`,'PATCH',{status:'cancelled'},null,true)).status,200);const fresh=(await call('/join','POST',{table:1,key,name:'רותם',party:2})).data;assert.notEqual(fresh.visitId,next.visitId);
  await new Promise(r=>server.close(r));server=createOrderServer({dataDir:dir});await new Promise(r=>server.listen(0,'127.0.0.1',r));url=`http://127.0.0.1:${server.address().port}`;const restored=await call(`/my-order/${to.data.id}`,'GET',null,take.token);assert.equal(restored.status,200);assert.equal(restored.data.payment,'paid');assert.equal(restored.data.total,72);
 }finally{await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true})}
});
