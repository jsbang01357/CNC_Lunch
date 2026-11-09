import {readFile,mkdir,writeFile} from 'node:fs/promises';
const api=await readFile('worker/api.js','utf8');
const [html,js,css,restaurants]=await Promise.all(['web/index.html','web/app.js','web/style.css','worker/restaurants.json'].map(p=>readFile(p,'utf8')));
const output=api+'\nconst ASSETS='+JSON.stringify({'/':{body:html,type:'text/html; charset=utf-8'},'/admin':{body:html,type:'text/html; charset=utf-8'},'/member':{body:html,type:'text/html; charset=utf-8'},'/app.js':{body:js,type:'text/javascript; charset=utf-8'},'/style.css':{body:css,type:'text/css; charset=utf-8'}})+';\nconst RESTAURANTS='+restaurants+`;\nexport default {async fetch(request,env){const path=new URL(request.url).pathname;if(path.startsWith('/api/'))return api(request,env,RESTAURANTS);const asset=ASSETS[path];if(request.method==='GET'&&asset)return response(200,asset.body,asset.type);return response(404,{error:'화면을 찾지 못했어요.'});}};\n`;
await mkdir('dist/server',{recursive:true});
await writeFile('dist/server/index.js',output);
console.log('Worker와 화면 묶음 생성 완료');
