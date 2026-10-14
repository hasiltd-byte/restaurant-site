// Test-only harness exercising the same Web Request adapter as Next.js.
import http from 'node:http';
import {Readable} from 'node:stream';
import {createOrderService} from './service.mjs';
import {handleOrderRequest} from './next-adapter.mjs';
export async function createOrderServer(options={}){const service=await createOrderService(options);const server=http.createServer(async(req,res)=>{const request=new Request('http://'+req.headers.host+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Readable.toWeb(req),duplex:'half'}:{})});const response=await handleOrderRequest(request,service);res.writeHead(response.status,Object.fromEntries(response.headers));if(response.body)Readable.fromWeb(response.body).pipe(res);else res.end()});server.database=service.database;server.models=service.models;server.on('close',()=>{server.databaseClosed=service.close()});return server}
