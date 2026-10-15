import Home from './Home';
import {getOrderService} from '../orders-app/runtime.mjs';
export const dynamic='force-dynamic';
export default async function Page(){const service=await getOrderService();const {menu}=await service.publicMenu();return <Home initialMenu={menu}/>;}
