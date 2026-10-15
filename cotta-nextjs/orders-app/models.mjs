import mongoose from 'mongoose';
import {randomUUID} from 'node:crypto';
const {Schema}=mongoose;
const int=(min,max)=>({type:Number,required:true,min,...(max===undefined?{}:{max}),validate:Number.isInteger});
const uuid=()=>({type:String,required:true,unique:true});
const options={versionKey:false,id:false,bufferCommands:false};
const identified=fields=>new Schema({_id:{type:String,default:randomUUID},id:uuid(),...fields},options);
export function createModels(connection){
 const config=new Schema({_id:String,key:{type:String,required:true,unique:true},value:{type:String,required:true}},options);
 const visit=identified({table_no:int(1,60),party:int(1,30),opened_at:{type:Number,required:true},closed_at:{type:Number,default:null}});
 visit.index({table_no:1},{unique:true,partialFilterExpression:{closed_at:{$eq:null}}});
 const diner=identified({token:{type:String,required:true,unique:true},visit_id:{type:String,ref:'Visit',required:true,index:true},name:{type:String,required:true,maxlength:60},joined_at:{type:Number,required:true}});
 const item=new Schema({id:{type:String,required:true},name:{type:String,required:true},price:{type:Number,required:true,min:0},quantity:int(1,20),notes:{type:String,default:'',maxlength:300}},{_id:false,...options});
 const payload=new Schema({name:{type:String,required:true,maxlength:60},phone:{type:String,default:''},pickup:{type:String,default:''},table:{type:Number,default:null},party:int(1,30),items:{type:[item],required:true,validate:v=>v.length>0&&v.length<=40},total:{type:Number,required:true,min:0},notes:{type:String,default:'',maxlength:500}},{_id:false,...options});
 const order=identified({seq:{...int(1),unique:true},nonce:{type:String,required:true,unique:true},token:{type:String,required:true},type:{type:String,required:true,enum:['dinein','takeaway']},visit_id:{type:String,ref:'Visit',default:null,index:true},diner_id:{type:String,ref:'Diner',default:null,index:true},payload:{type:payload,required:true},status:{type:String,enum:['new','preparing','ready','served','cancelled'],default:'new'},payment:{type:String,required:true,enum:['pending_phone','paid','at_restaurant']},created_at:{type:Number,required:true}});
 order.index({created_at:-1});
 const availability=new Schema({_id:String,id:uuid(),name:{type:String,maxlength:100},en:{type:String,default:''},description:{type:String,maxlength:1000},price:{type:Number,min:0,max:10000},category:{type:String,enum:['pizza','starter','dessert','drink']},image:String,tags:{type:[String],default:[]},illustrative:{type:Boolean,default:false},deleted:{type:Boolean,default:false},sortOrder:{type:Number,default:0},revision:{type:Number,default:0},available:{type:Boolean,default:true},video:{type:String,default:null}},options);
 const table=new Schema({_id:Number,number:{...int(1,60),unique:true},seats:{...int(1,30),default:4},area:{type:String,enum:['inside','outside','bar'],default:'inside'},enabled:{type:Boolean,default:true}},options);
 const reservation=identified({seq:{...int(1),unique:true},nonce:{type:String,required:true,unique:true},token:{type:String,required:true},name:{type:String,required:true,maxlength:60},phone:{type:String,required:true},date:{type:String,required:true,match:/^\d{4}-\d{2}-\d{2}$/},start:int(0,1439),end:int(30,1440),party:int(1,30),area:{type:String,enum:['any','inside','outside','bar'],required:true},notes:{type:String,default:'',maxlength:500},status:{type:String,enum:['pending','confirmed','declined','cancelled','seated','completed'],default:'pending'},table_no:{type:Number,default:null},created_at:{type:Number,required:true},updated_at:{type:Number,required:true}});
 reservation.index({date:1,table_no:1,status:1,start:1,end:1});reservation.index({created_at:-1});
 const counter=new Schema({_id:String,value:{type:Number,default:0}},options);
 const lock=new Schema({_id:String,version:{type:Number,default:0}},options);
 const staffSession=new Schema({_id:String,token:{type:String,required:true,unique:true},expiresAt:{type:Date,required:true}},options);staffSession.index({expiresAt:1},{expireAfterSeconds:0});
 const videoUpload=new Schema({_id:String,owner:{type:String,required:true},dish:{type:String,required:true},size:{type:Number,required:true},video:String,expiresAt:{type:Date,required:true}},options);videoUpload.index({expiresAt:1},{expireAfterSeconds:0});
 const videoUploadChunk=new Schema({_id:String,uploadId:{type:String,required:true,index:true},index:Number,data:{type:String,required:true},expiresAt:{type:Date,required:true}},options);videoUploadChunk.index({expiresAt:1},{expireAfterSeconds:0});
 const schemas={VideoUpload:videoUpload,VideoUploadChunk:videoUploadChunk,Config:config,Visit:visit,Diner:diner,Order:order,MenuItem:availability,ReservationTable:table,Reservation:reservation,Counter:counter,MutationLock:lock,StaffSession:staffSession};
 return Object.fromEntries(Object.entries(schemas).map(([name,schema])=>[name,connection.models[name]||connection.model(name,schema)]));
}
