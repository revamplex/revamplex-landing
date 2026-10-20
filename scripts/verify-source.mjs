import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
let pages=0,scripts=0,links=0;const errors=[];
for(const file of fs.readdirSync('.').filter(f=>f.endsWith('.html'))){const html=fs.readFileSync(file,'utf8');let combined='';for(const [i,m]of [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].entries()){
  if(/\bsrc\s*=/.test(m[1]))continue;if(/application\/(?:ld\+)?json/.test(m[1]))continue;try{new vm.Script(m[2],{filename:file+':script-'+i});combined+='\n'+m[2]+'\n';scripts++;}catch(e){errors.push(file+':script-'+i+': '+e.message);}}
  try{new vm.Script(combined,{filename:file});}catch(e){errors.push(file+': combined scripts: '+e.message);}
  for(const m of html.matchAll(/(?:href|src)=["']([^"']+)["']/g)){const url=m[1];if(/^(?:[a-z]+:|#|\/\/|\$|\{|data:)/i.test(url)||url.includes('${'))continue;const local=url.split(/[?#]/)[0];if(!local)continue;if(!fs.existsSync(path.resolve(local)))errors.push(file+': missing '+local);else links++;}pages++;}
for(const dir of ['assets','api','lib'])for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.js'))){const text=fs.readFileSync(path.join(dir,file),'utf8');if(dir==='api'||dir==='lib')continue;try{new vm.Script(text,{filename:path.join(dir,file)});scripts++;}catch(e){errors.push(dir+'/'+file+': '+e.message);}}
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log('Verified '+pages+' HTML pages, '+scripts+' classic scripts, and '+links+' local links.');
