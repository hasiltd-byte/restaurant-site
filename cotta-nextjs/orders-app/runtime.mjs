import {createOrderService} from './service.mjs';
const key=Symbol.for('cotta.orders.service');
export function getOrderService(){return globalThis[key] ||= createOrderService().catch(error=>{delete globalThis[key];throw error})}
