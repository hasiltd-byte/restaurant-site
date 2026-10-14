// Legacy launcher: one Next.js process only.
import {spawn} from 'node:child_process';
const child=spawn(process.execPath,['node_modules/next/dist/bin/next',process.argv.includes('--production')?'start':'dev','--hostname','0.0.0.0'],{stdio:'inherit'});
child.on('exit',code=>{process.exitCode=code||0});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
