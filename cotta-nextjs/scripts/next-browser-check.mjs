import {spawn} from 'node:child_process';
import {testDatabase} from '../orders-app/test-database.mjs';
const database=await testDatabase();let server;
function run(file,args=[]){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[file,...args],{stdio:'inherit',env:{...process.env,MONGO_URI:database.mongoUri,MONGO_DB_NAME:'cotta_test'}});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(file+' failed: '+code)))})}
try{
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1'],{stdio:'inherit',env:{...process.env,MONGO_URI:database.mongoUri,MONGO_DB_NAME:'cotta_test'}});
 let ready=false;for(let n=0;n<80;n++){try{const r=await fetch('http://127.0.0.1:3000/order/api/menu');if(r.ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,250))}if(!ready)throw Error('Next.js did not become ready');
 await run('scripts/browser-check.mjs');await run('scripts/booking-browser-check.mjs');console.log('Production Next.js browser flows passed using an isolated MongoDB replica set.');
}finally{if(server){const ended=new Promise(r=>server.once('exit',r));server.kill();await ended}await database.close()}
