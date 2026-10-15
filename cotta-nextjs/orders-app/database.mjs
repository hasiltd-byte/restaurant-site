import mongoose from 'mongoose';
import {AsyncLocalStorage} from 'node:async_hooks';
import {randomBytes} from 'node:crypto';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createModels} from './models.mjs';
import {loadEnvironment} from './env.mjs';
loadEnvironment();
export async function connectDatabase(options={}){
 const uri=options.mongoUri||process.env.MONGO_URI;
 if(!uri)throw Error('MONGO_URI is required. Set it in the workspace .env, project .env, or environment.');
 const connection=mongoose.createConnection(uri,{serverSelectionTimeoutMS:10000,...(options.dbName||process.env.MONGO_DB_NAME?{dbName:options.dbName||process.env.MONGO_DB_NAME}:{}),maxPoolSize:10});
 try{
  await connection.asPromise();const hello=await connection.db.admin().command({hello:1});
  if(!hello.setName&&hello.msg!=='isdbgrid')throw Error('MongoDB must be a replica set (such as Atlas) to preserve atomic bookings and orders.');
  const models=createModels(connection);await Promise.all(Object.values(models).map(m=>m.init()));
  await models.MutationLock.updateOne({_id:'state'},{$setOnInsert:{version:0}},{upsert:true});
  const context=new AsyncLocalStorage(),bucket=new mongoose.mongo.GridFSBucket(connection.db,{bucketName:'dishVideos'});
  const opts=()=>context.getStore()?{session:context.getStore()}:{};
  const db={connection,models,
   find(name,filter={},sort,limit){let q=models[name].find(filter,null,opts()).lean();if(sort)q=q.sort(sort);if(limit)q=q.limit(limit);return q.exec()},
   one(name,filter={}){return models[name].findOne(filter,null,opts()).lean().exec()},
   count(name,filter={}){return models[name].countDocuments(filter,opts()).exec()},
   async create(name,row){const _id=row._id??row.id??row.key??row.number??row.token;const [d]=await models[name].create([{...row,...(_id!==undefined?{_id}:{})}],opts());return d.toObject()},
   update(name,filter,update,extra={}){return models[name].findOneAndUpdate(filter,update,{...opts(),returnDocument:'after',runValidators:true,...extra}).lean().exec()},
   remove(name,filter){return models[name].deleteOne(filter,opts()).exec()},
   async getConfig(key,fallback){return (await db.one('Config',{key}))?.value||fallback},
   async setConfig(key,value){return db.update('Config',{_id:key},{$set:{key,value:String(value)}},{upsert:true})},
   async nextNumber(name){return (await db.update('Counter',{_id:name},{$inc:{value:1}},{upsert:true})).value},
   async transaction(fn){if(context.getStore())return fn();return connection.transaction(async session=>{
    // All invariant-changing writes acquire the same transactional document.
    // This prevents MongoDB snapshot write skew for overlapping reservations.
    await models.MutationLock.updateOne({_id:'state'},{$inc:{version:1}},{session});
    return context.run(session,fn);
   },{readConcern:{level:'snapshot'},writeConcern:{w:'majority'},maxCommitTimeMS:10000})},
   async initialize(menu){await db.transaction(async()=>{if(!await db.one('Config',{key:'secret'}))await db.setConfig('secret',randomBytes(32).toString('hex'));for(const [index,item] of menu.entries()){await db.update('MenuItem',{_id:item.id},{$setOnInsert:{id:item.id,available:true,video:null}},{upsert:true});if(!(await db.one('MenuItem',{id:item.id}))?.name)await db.update('MenuItem',{id:item.id},{$set:{...item,sortOrder:index}});}await db.ensureTables()})},
   async ensureTables(){const count=Number(await db.getConfig('tableCount','12'));const rows=await db.find('ReservationTable',{number:{$lte:count}},{number:1});if(rows.length===count)return rows;for(let number=1;number<=count;number++)await db.update('ReservationTable',{_id:number},{$setOnInsert:{number,seats:4,area:'inside',enabled:true}},{upsert:true});return db.find('ReservationTable',{number:{$lte:count}},{number:1})},
   async storeVideo(name,bytes,contentType){const stream=bucket.openUploadStream(name,{metadata:{contentType}});await pipeline(Readable.from([bytes]),stream);return stream.id},
   async video(name){return bucket.find({filename:name}).next()},
   videoStream(id,start=0,end){return bucket.openDownloadStream(id,{start,...(end===undefined?{}:{end})})},
   close(){return connection.close()},
  };
  return db;
 }catch(error){await connection.close().catch(()=>{});throw error}
}
