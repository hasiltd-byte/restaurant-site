import {notFound} from 'next/navigation';
import {getOrderService} from '../../../orders-app/runtime.mjs';
import DishDetail from './DishDetail';
export const dynamic='force-dynamic';
async function findDish(id:string){const service=await getOrderService();return (await service.publicMenu()).menu.find((d:{id:string})=>d.id===id)}
export async function generateMetadata({params}:{params:Promise<{id:string}>}){const {id}=await params;const d=await findDish(id);return {title:d?d.name+' · COTTA':'COTTA'}}
export default async function DishPage({params}:{params:Promise<{id:string}>}){const {id}=await params;const dish=await findDish(id);if(!dish)notFound();return <DishDetail dish={dish}/>;}
