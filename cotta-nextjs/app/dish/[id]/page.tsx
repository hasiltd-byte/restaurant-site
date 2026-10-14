import {notFound} from 'next/navigation';
import dishes from '../../../shared/menu.json';
import DishDetail from './DishDetail';
export function generateStaticParams(){return dishes.map(d=>({id:d.id}))}
export async function generateMetadata({params}:{params:Promise<{id:string}>}){const {id}=await params;const d=dishes.find(x=>x.id===id);return {title:d?`${d.name} · COTTA`:'COTTA'}}
export default async function DishPage({params}:{params:Promise<{id:string}>}){const {id}=await params;const d=dishes.find(x=>x.id===id);if(!d)notFound();return <DishDetail dish={d}/>}
