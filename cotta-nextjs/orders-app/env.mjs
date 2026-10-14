import {existsSync} from 'node:fs';
import {loadEnvFile} from 'node:process';
import {join} from 'node:path';
export function loadEnvironment(){if(process.env.MONGO_URI||process.env.NODE_ENV==='production')return;const file=join(process.cwd(),'.env');if(existsSync(file))loadEnvFile(file)}
