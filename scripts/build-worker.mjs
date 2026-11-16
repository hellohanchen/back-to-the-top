import {build} from 'esbuild';
import {readFile,mkdir,cp} from 'node:fs/promises';
const types={'/index.html':'text/html; charset=utf-8','/style.css':'text/css; charset=utf-8','/app.js':'text/javascript; charset=utf-8','/icon.svg':'image/svg+xml','/data/daily.json':'application/json'};
for(const name of ['logo.png','favicon-16.png','favicon-32.png','favicon-180.png','favicon-192.png','favicon-512.png'])types['/'+name]='image/png';
types['/favicon.ico']='image/x-icon';
for(const [name,type] of Object.entries({'challenge.html':'text/html; charset=utf-8','challenge.js':'text/javascript; charset=utf-8','challenge.css':'text/css; charset=utf-8'}))types['/'+name]=type;
types['/favicon.svg']='image/svg+xml';
const assets={};for(const [path,type] of Object.entries(types)){const binary=type==='image/png'||type==='image/x-icon';assets[path]={type,binary,body:(await readFile('dist'+path)).toString(binary?'base64':'utf8')};}
await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
await build({entryPoints:['worker/index.js'],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:'dist/server/index.js',define:{__ASSETS__:JSON.stringify(assets)},minify:true});
await cp('.openai/hosting.json','dist/.openai/hosting.json');
console.log('Built Sites Worker');
