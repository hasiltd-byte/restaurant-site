import {PassThrough,Readable} from 'node:stream';
export async function handleOrderRequest(request,backend){
 try{
 const url=new URL(request.url);url.pathname=url.pathname.replace(/^\/order(?=\/|$)/,'')||'/';
 const req=request.body?Readable.fromWeb(request.body):Readable.from([]);
 req.url=url.pathname+url.search;req.method=request.method;req.headers=Object.fromEntries(request.headers);req.headers.host ||= url.host;req.socket={remoteAddress:req.headers['x-vercel-forwarded-for']||'local'};
 return await new Promise((resolve,reject)=>{
 const res=new PassThrough(),headers=new Headers();let status=200,committed=false;
 res.headersSent=false;res.setHeader=(name,value)=>headers.set(name,String(value));
 res.writeHead=(code,extra={})=>{status=code;for(const [name,value]of Object.entries(extra))headers.set(name,String(value));res.headersSent=true;commit();return res};
 function commit(){if(committed)return;committed=true;resolve(new Response(Readable.toWeb(res),{status,headers}))}
 res.on('error',reject);request.signal.addEventListener('abort',()=>res.destroy(),{once:true});
 backend.handle(req,res).then(()=>{if(!committed)commit()},reject);
 });
 }catch(error){console.error('Orders route failed:',error.name);return Response.json({error:'Service temporarily unavailable'},{status:503})}
}
