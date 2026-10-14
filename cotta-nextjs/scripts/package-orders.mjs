import {mkdir,copyFile,cp} from 'node:fs/promises';
const project=new URL('../',import.meta.url),output=new URL('../deliverables/tableflow-orders/',import.meta.url);
await mkdir(output,{recursive:true});
for(const file of ['server.mjs','reservations.mjs','reservations.test.mjs','server.test.mjs','package.json','README.md','Dockerfile','START-TABLEFLOW.cmd','.env.example','.gitignore'])await copyFile(new URL(`orders-app/${file}`,project),new URL(file,output));
await cp(new URL('orders-app/public/',project),new URL('public/',output),{recursive:true});
await cp(new URL('public/images/',project),new URL('public/images/',output),{recursive:true});
await copyFile(new URL('shared/menu.json',project),new URL('menu.json',output));
await copyFile(new URL('SOURCES.md',project),new URL('SOURCES.md',output));
console.log('Standalone app prepared: deliverables/tableflow-orders (no runtime data or credentials).');
