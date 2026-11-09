import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import worker,{key} from '../dist/server/index.js';
import {sqliteBinding} from './sqlite-d1.mjs';
mkdirSync('.runtime',{recursive:true});
const secretFile='.runtime/admin-secret';
const secret=existsSync(secretFile)?readFileSync(secretFile,'utf8'):randomBytes(32).toString('hex');
writeFileSync(secretFile,secret,{mode:0o600});
const db=new DatabaseSync('.runtime/preview.sqlite3');db.exec(readFileSync('drizzle/0000_lunch_rooms.sql','utf8').replace('CREATE TABLE','CREATE TABLE IF NOT EXISTS'));
const DB=sqliteBinding(db);
const port=Number(process.env.PORT||8770),origin='http://127.0.0.1:'+port;
const server=createServer(async(req,res)=>{try{const chunks=[];let n=0;for await(const chunk of req){n+=chunk.length;if(n>9000){res.writeHead(413).end();return;}chunks.push(chunk);}const request=new Request(origin+req.url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})});const result=await worker.fetch(request,{DB,ADMIN_SECRET:secret});res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));}catch{res.writeHead(500).end('preview error');}});
server.listen(port,'127.0.0.1',async()=>{const adminUrl=origin+'/admin#'+await key(secret,'main','admin');writeFileSync('.runtime/admin-url.txt',adminUrl,{mode:0o600});console.log('점심 도우미 '+origin+'\n막내 화면 '+adminUrl+'\n종료: Ctrl+C · 저장 위치: .runtime/');});
function stop(){server.close(()=>{db.close();process.exit();});}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?'8770 포트가 사용 중입니다. 이미 열린 점심 도우미를 확인하거나 PORT를 바꾸어 실행해 주세요.':error.message);db.close();process.exit(1);});
