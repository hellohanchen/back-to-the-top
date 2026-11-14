import {createHash} from 'node:crypto';
import { build } from 'esbuild';
import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('public', 'dist', { recursive: true });
await build({ entryPoints: ['src/app.js'], bundle: true, minify: true, outfile: 'dist/app.js', target: ['es2020'] });
console.log('Built dist/');

let html=await readFile('dist/index.html','utf8');
for(const file of ['app.js','style.css','icon.svg']){const hash=createHash('sha256').update(await readFile('dist/'+file)).digest('hex').slice(0,12);html=html.replaceAll('/'+file,'/'+file+'?v='+hash);}
await writeFile('dist/index.html',html);
