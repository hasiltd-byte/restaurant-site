import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
export async function publicProducts(db){const rows=await db.find('MenuItem',{deleted:{$ne:true},name:{$exists:true}},{sortOrder:1,id:1});return rows.map(({_id,deleted,...row})=>row)}
export function createProducts({db,readBody,response,fail}){
 function content(b){
  if(typeof b.name!=='string'||b.name.trim().length<2||b.name.length>100)throw fail('שם המנה חייב להכיל 2–100 תווים.');
  if(typeof b.description!=='string'||b.description.length>1000)throw fail('תיאור המנה ארוך מדי.');
  if(typeof b.en!=='string'||b.en.length>100)throw fail('כותרת המשנה ארוכה מדי.');
  if(typeof b.price!=='number'||!Number.isFinite(b.price)||b.price<0||b.price>10000||Math.abs(b.price*100-Math.round(b.price*100))>0.000001)throw fail('הזינו מחיר תקין בשקלים, עם עד שתי ספרות אחרי הנקודה.');
  if(!['pizza','starter','dessert','drink'].includes(b.category))throw fail('בחרו קטגוריה תקינה.');
  if(typeof b.image!=='string'||! /^(?:[a-z0-9-]+\.(?:jpg|png|webp)|\/images\/[a-z0-9-]+\.(?:jpg|png|webp)|\/order\/media\/[a-f0-9-]+\.jpg)$/.test(b.image))throw fail('העלו תמונה או בחרו אחת מהתמונות הקיימות.');
  if(!Array.isArray(b.tags)||b.tags.length>8||b.tags.some(t=>typeof t!=='string'||t.length>40))throw fail('אפשר להוסיף עד 8 תגיות קצרות.');
  if(typeof b.available!=='boolean'||typeof b.illustrative!=='boolean'||!Number.isInteger(b.sortOrder)||b.sortOrder<0||b.sortOrder>9999)throw fail('פרטי התצוגה אינם תקינים.');
  return {name:b.name.trim(),en:b.en.trim(),description:b.description.trim(),price:b.price,category:b.category,image:b.image,tags:b.tags.map(t=>t.trim()).filter(Boolean),available:b.available,illustrative:b.illustrative,sortOrder:b.sortOrder};
 }
 return {async handle(req,res,path){
  if(path==='/api/admin/products'&&req.method==='GET'){response(res,200,{products:await publicProducts(db)});return true}
  if(path==='/api/admin/images'&&req.method==='POST'){
   const bytes=await readBody(req,3*1024*1024,true);let image;
   try{const processor=sharp(bytes,{limitInputPixels:40_000_000,animated:false});const meta=await processor.metadata();if(!['jpeg','png','webp'].includes(meta.format))throw Error();image=await processor.rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).jpeg({quality:85,mozjpeg:true}).toBuffer()}catch{throw fail('העלו קובץ תמונה תקין מסוג JPG, PNG או WebP, עד 3MB.')}
   const filename=randomUUID()+'.jpg';await db.storeVideo(filename,image,'image/jpeg');response(res,201,{url:'/order/media/'+filename});return true;
  }
  if(path==='/api/admin/products'&&req.method==='POST'){const b=await readBody(req),fields=content(b);const product=await db.transaction(()=>db.create('MenuItem',{id:'dish-'+randomUUID(),...fields,revision:0,deleted:false,video:null}));response(res,201,{product});return true}
  const match=path.match(/^\/api\/admin\/products\/([a-z0-9-]+)$/);if(!match)return false;
  if(!['PATCH','DELETE'].includes(req.method))throw fail('פעולה לא נמצאה.',404);
  const b=await readBody(req);if(!Number.isInteger(b.revision)||b.revision<0)throw fail('יש לרענן את המנה לפני השמירה.',409);
  const fields=req.method==='PATCH'?content(b):{deleted:true,available:false};
  const product=await db.transaction(async()=>{const existing=await db.one('MenuItem',{id:match[1],deleted:{$ne:true}});if(!existing)throw fail('המנה לא נמצאה.',404);if(existing.revision!==b.revision)throw fail('המנה השתנתה מאז פתיחת הטופס. רעננו את הרשימה ונסו שוב.',409);return db.update('MenuItem',{id:match[1]},{$set:fields,$inc:{revision:1}})});
  response(res,200,req.method==='DELETE'?{ok:true}:{product});return true;
 }};
}
