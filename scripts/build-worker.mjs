import {build} from 'esbuild';
import {readFile,mkdir,cp} from 'node:fs/promises';
const types={'/index.html':'text/html; charset=utf-8','/style.css':'text/css; charset=utf-8','/app.js':'text/javascript; charset=utf-8','/icon.svg':'image/svg+xml','/data/daily.json':'application/json'};
const assets={};for(const [path,type] of Object.entries(types))assets[path]={type,body:await readFile('dist'+path,'utf8')};
await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
await build({entryPoints:['worker/index.js'],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:'dist/server/index.js',define:{__ASSETS__:JSON.stringify(assets)},minify:true});
await cp('.openai/hosting.json','dist/.openai/hosting.json');
console.log('Built Sites Worker');
