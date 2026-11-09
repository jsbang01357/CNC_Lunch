import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import worker,{key,compare,noCandidateMessage,initialState} from '../dist/server/index.js';
import {sqliteBinding} from './sqlite-d1.mjs';
const rows=JSON.parse(readFileSync('worker/restaurants.json','utf8'));
const db=new DatabaseSync(':memory:');db.exec(readFileSync('drizzle/0000_lunch_rooms.sql','utf8'));
const DB=sqliteBinding(db);
const env={DB,ADMIN_SECRET:'a'.repeat(64)},origin='http://127.0.0.1:8770';
const admin=await key(env.ADMIN_SECRET,'main','admin'),results=[],requests=[];
async function request(path,token=admin,data,room='main'){
  const start=performance.now();
  const res=await worker.fetch(new Request(origin+'/api/'+path+'?room='+room,{method:data===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,Origin:origin,'Content-Type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)})}),env);
  const body=await res.json();requests.push({path,status:res.status,milliseconds:Number((performance.now()-start).toFixed(2))});return {status:res.status,body};
}
async function test(name,fn){try{await fn();results.push({name,pass:true});console.log('PASS '+name);}catch(e){results.push({name,pass:false,error:e.message});console.log('FAIL '+name+' '+e.message);}}
let d=(await request('dashboard')).body;
for(const m of d.members){if(m.name==='윤 선배')continue;await request('response',m.token,{attendance:'yes',preference:m.name==='김 과장'?'한식':'상관없음',avoided:m.name==='박 대리'?'새우':'없음',walk:m.name==='최 선배'?15:10,quiet:m.name==='김 과장'?'yes':'no'});}
d=(await request('dashboard')).body;
const member=d.members[1].token;
await test('T1 원본 D는 음료 총액 미확인 유지',()=>{assert.equal(d.restaurants[3].price,20000);assert.equal(d.restaurants[3].status,'pending');assert.ok(d.restaurants[3].unknown.includes('음료 포함 총액 미확인'));});
await test('T1 명시한 음료 포함 경계값은 예산 이내',()=>{const s=initialState();s.responses={'김 과장':{attendance:'yes',preference:'한식',avoided:'없음',walk:10}};const r=structuredClone(rows);r[3].drink_included=true;assert.ok(compare(r,s).restaurants[3].matched.includes('음료 포함 예산 이내'));assert.equal(rows[3].drink_included,null);});
await test('T2 가격 미확인 유지',()=>{assert.equal(d.restaurants[2].price,null);assert.ok(d.restaurants[2].unknown.includes('가격 미확인'));});
await test('T3 미확인 후보가 있어도 무엇을 바꿀지 질문',async()=>{await request('settings',admin,{budget:15000});const low=(await request('dashboard')).body;assert.equal(low.budget,15000);assert.ok(low.no_candidates.includes('무엇을 바꿀'));assert.equal(low.restaurants[2].status,'pending');assert.equal(low.restaurants.filter(r=>r.status==='match').length,0);});
await test('Q5 설정 되돌리기와 응답 유지',async()=>{await request('restore',admin,{});const restored=(await request('dashboard')).body;assert.equal(restored.budget,20000);assert.deepEqual(restored.members.map(m=>m.response),d.members.map(m=>m.response));});
d=(await request('dashboard')).body;
await test('T4 A·C 재료 대응 질문',()=>{for(const i of [0,2]){assert.equal(d.restaurants[i].status,'pending');assert.ok(d.restaurants[i].questions.some(q=>q.includes('재료 대응 확인')));}});
await test('T5 윤 선배 미응답 유지',()=>assert.deepEqual(d.missing,['윤 선배']));
await test('조용한 곳 취향 저장 및 필수화 금지',()=>{assert.equal(d.members[0].response.quiet,'yes');assert.ok(!d.restaurants[0].excluded.some(s=>s.includes('소음')));assert.ok(d.restaurants[0].questions.some(s=>s.includes('취향')));});
await test('대표 의견 혼입 없음',()=>assert.ok(!d.members.some(m=>m.name.includes('대표'))));
await test('다른 팀원과 관리자 접근 거부',async()=>{assert.equal((await request('dashboard',member)).status,403);const own=(await request('me',member)).body;assert.equal(own.name,'박 대리');assert.ok(!('members'in own));});
await test('인증 없는 데이터 접근 거부',async()=>assert.equal((await request('dashboard','')).status,401));
await test('두 후보 선택과 제안문 재료 비노출',async()=>{const p=await request('proposal',admin,{ids:['3','0'],revision:d.revision});assert.equal(p.status,200);assert.ok(p.body.text.indexOf('1순위 식당 D')<p.body.text.indexOf('2순위 식당 A'));assert.ok(!p.body.text.includes('박 대리'));assert.ok(!p.body.text.includes('새우'));assert.ok(p.body.text.includes('총액 미확인'));assert.ok(p.body.text.includes('소음 정도 미확인'));});
await test('선택하지 않은 후보 제안문 혼입 없음',async()=>{const p=await request('proposal',admin,{ids:['3'],revision:d.revision});assert.ok(!p.body.text.includes('식당 A'));});
await test('내보내기에 접근 토큰 없음',async()=>{const exp=(await request('export')).body;assert.ok(exp.members.every(m=>!('token'in m)));});
await test('오래된 상태의 제안문 생성 거부',async()=>{await request('settings',admin,{budget:20000});assert.equal((await request('proposal',admin,{ids:['3'],revision:d.revision})).status,409);});
await test('접수 중단과 재개',async()=>{await request('pause',admin,{paused:true});assert.equal((await request('me',member)).status,423);await request('pause',admin,{paused:false});assert.equal((await request('me',member)).status,200);});
await test('잘못된 입력 거부',async()=>{assert.equal((await request('response',member,{attendance:'yes',walk:true})).status,400);});
await test('응답 정리는 확인 문구 필요',async()=>assert.equal((await request('clear',admin,{})).status,400));
await test('응답 정리와 링크 무효화',async()=>{await request('clear',admin,{confirm:'이번 주 응답 정리'});const clean=(await request('dashboard')).body;assert.ok(clean.members.every(m=>m.response===null));assert.ok(clean.paused);assert.notEqual(clean.members[1].token,member);await request('pause',admin,{paused:false});assert.equal((await request('me',member)).status,403);});
await test('실습 공간 데이터 분리',async()=>{const room=(await request('rooms',admin,{})).body;const fresh=await request('dashboard',room.admin_token,undefined,room.room);assert.equal(fresh.status,200);assert.equal(fresh.body.budget,20000);assert.ok(fresh.body.members.every(m=>m.response===null));assert.equal((await request('dashboard',admin,undefined,room.room)).status,403);});
db.close();
const out=new URL('../.runtime/test-results/',import.meta.url);mkdirSync(out,{recursive:true});writeFileSync(new URL('회귀시험.json',out),JSON.stringify({environment:'로컬 Node SQLite로 D1 바인딩 인터페이스를 대체한 Worker 시험',results,requests},null,2));
assert.ok(results.every(r=>r.pass),'회귀 시험 실패');console.log(`${results.length} tests passed`);
