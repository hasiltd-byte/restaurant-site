import {handleOrderRequest} from '../../../orders-app/next-adapter.mjs';
import {getOrderService as service} from '../../../orders-app/runtime.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
async function handle(request){try{return await handleOrderRequest(request,await service())}catch(error){console.error('Orders initialization failed:',error.name);return Response.json({error:'Service temporarily unavailable'},{status:503})}}
export {handle as GET,handle as POST,handle as PATCH,handle as PUT,handle as DELETE};
