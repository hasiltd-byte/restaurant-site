import {handleOrderRequest} from '../../../orders-app/next-adapter.mjs';
import {createOrderService} from '../../../orders-app/service.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
const key=Symbol.for('cotta.orders.service');
function service(){return globalThis[key] ||= createOrderService().catch(error=>{delete globalThis[key];throw error})}
async function handle(request){try{return await handleOrderRequest(request,await service())}catch(error){console.error('Orders initialization failed:',error.name);return Response.json({error:'Service temporarily unavailable'},{status:503})}}
export {handle as GET,handle as POST,handle as PATCH,handle as PUT,handle as DELETE};
