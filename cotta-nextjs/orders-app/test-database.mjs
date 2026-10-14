import {MongoMemoryReplSet} from 'mongodb-memory-server';
import {fileURLToPath} from 'node:url';
export async function testDatabase(){
 // Tests never connect to the user's MONGO_URI.
 const replica=await MongoMemoryReplSet.create({binary:{downloadDir:fileURLToPath(new URL('../.qa/mongodb-binaries/',import.meta.url))},replSet:{count:1,storageEngine:'wiredTiger'}});
 return {mongoUri:replica.getUri('cotta_test'),close:()=>replica.stop()};
}
