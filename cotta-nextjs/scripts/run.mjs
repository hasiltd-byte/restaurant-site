import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {existsSync} from 'node:fs';
import {loadEnvFile} from 'node:process';
if(existsSync('.env'))loadEnvFile('.env');
const root=fileURLToPath(new URL('../',import.meta.url));
const workers=[spawn(process.execPath,['orders-app/server.mjs'],{cwd:root,stdio:'inherit'}),spawn(process.execPath,['node_modules/next/dist/bin/next',process.argv.includes('--production')?'start':'dev','--hostname','0.0.0.0'],{cwd:root,stdio:'inherit'})];
let stopping=false;function stop(code=0){if(stopping)return;stopping=true;workers.forEach(p=>p.kill());process.exitCode=code;}
workers.forEach(p=>{p.on('error',e=>{console.error(e);stop(1)});p.on('exit',code=>stop(code||0))});process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
