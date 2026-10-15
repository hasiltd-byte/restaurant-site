import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {testDatabase} from './test-database.mjs';
import {createOrderServer} from './server.mjs';
test('catalog CRUD, authenticated photos, live server prices, conflicts, history and durable deletion',async()=>{
 const database=await testDatabase();let server,cookie='';
 async function start(){server=await createOrderServer({mongoUri:database.mongoUri});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))}
 async function stop(){await new Promise(resolve=>server.close(resolve));await server.databaseClosed}
 const origin=()=>`http://127.0.0.1:${server.address().port}`;
 async function call(path,method='GET',body,auth=true){const response=await fetch(origin()+'/api'+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(auth&&cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json(),headers:response.headers}}
 try{await start();assert.equal((await call('/admin/products')).status,401);assert.equal((await call('/admin/images','POST',{})).status,401);
 cookie=(await call('/login','POST',{username:'פיצה',password:'123'})).headers.get('set-cookie').split(';')[0];
 const menu=(await call('/menu')).data.menu;assert.equal(menu.length,21);assert.equal(menu[0].name,'מרגריטה קלאסית');
 const fields={name:'מנה חדשה לבדיקה',en:'FRESH',description:'עגבניות ובזיליקום',price:79.5,category:'pizza',image:'margherita.jpg',tags:['צמחוני'],available:true,illustrative:false,sortOrder:50};
 assert.equal((await call('/admin/products','POST',{...fields,price:-1})).status,400);assert.equal((await call('/admin/products','POST',{...fields,image:'https://evil.invalid/image.svg'})).status,400);
 const created=await call('/admin/products','POST',fields);assert.equal(created.status,201);const id=created.data.product.id;assert.equal((await call('/menu')).data.menu.find(p=>p.id===id).price,79.5);
 const png=await sharp({create:{width:20,height:20,channels:3,background:'#b82c24'}}).png().toBuffer();const photo=await fetch(origin()+'/api/admin/images',{method:'POST',headers:{Cookie:cookie},body:png});assert.equal(photo.status,201);const {url}=await photo.json();const image=await fetch(origin()+url.replace(/^\/order/,''));assert.equal(image.headers.get('content-type'),'image/jpeg');assert.equal((await sharp(Buffer.from(await image.arrayBuffer())).metadata()).format,'jpeg');
 const updated=await call('/admin/products/'+id,'PATCH',{...fields,price:82.25,image:url,revision:0});assert.equal(updated.status,200);assert.equal((await call('/admin/products/'+id,'PATCH',{...fields,revision:0})).status,409);
 const order=await call('/orders','POST',{type:'takeaway',nonce:randomUUID(),token:randomUUID(),name:'Catalog QA',phone:'0501234567',pickup:'בהקדם האפשרי',items:[{id,quantity:2,price:1}]});assert.equal(order.status,201);assert.equal(order.data.total,164.5);
 assert.equal((await call('/admin/products/'+id,'PATCH',{...fields,price:90,revision:1,image:url})).status,200);assert.equal((await call('/admin/state')).data.orders[0].total,164.5);
 assert.equal((await call('/admin/products/'+id,'DELETE',{revision:2})).status,200);assert.ok(!(await call('/menu')).data.menu.some(p=>p.id===id));assert.equal((await call('/admin/products/'+id,'DELETE',{revision:3})).status,404);
 const original=menu[0];assert.equal((await call('/admin/products/'+original.id,'DELETE',{revision:original.revision})).status,200);
 await stop();await start();const after=(await call('/menu')).data.menu;assert.ok(!after.some(p=>[id,original.id].includes(p.id)));assert.equal((await call('/admin/state')).data.orders[0].total,164.5);
 assert.equal((await call('/orders','POST',{type:'takeaway',nonce:randomUUID(),token:randomUUID(),name:'Catalog QA',phone:'0501234567',pickup:'בהקדם האפשרי',items:[{id,quantity:1}]})).status,400);
 }finally{if(server?.listening)await stop();await database.close()}
});
