const NAMES = ['김 과장','박 대리','최 선배','윤 선배','한서윤'];
const enc = new TextEncoder();
export const VERSION = '1.2.1';
export async function digest(text) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
}
async function key(secret, room, role, epoch=0) {
  const k = await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',k,enc.encode(room+'|'+role+'|'+epoch))),b=>b.toString(16).padStart(2,'0')).join('');
}
async function equal(a,b) { return (await digest(a)) === (await digest(b)); }
export function initialState() {
  return {budget:20000,paused:false,epoch:0,deadline:'화요일 오후 3시',responses:{},changes:[],backup:null};
}
export function compare(restaurants,state) {
  const attending=NAMES.filter(n=>state.responses[n]?.attendance==='yes');
  const missing=NAMES.filter(n=>!state.responses[n]);
  const maxWalk=attending.length?Math.min(...attending.map(n=>state.responses[n].walk)):null;
  const rows=restaurants.map(r=>{
    const matched=[],unknown=[],excluded=[],questions=[];
    if(r.price==null){unknown.push('가격 미확인');questions.push('음료 포함 1인 총액을 식당에 확인');}
    else if(r.price>state.budget)excluded.push('식사 가격부터 예산 초과');
    else if(r.drink_included!==true){unknown.push('음료 포함 총액 미확인');questions.push('음료 포함 1인 총액을 식당에 확인');}
    else matched.push('음료 포함 예산 이내');
    if(maxWalk==null)unknown.push('참석자 도보 상한 미확인');
    else if(r.walk>maxWalk)excluded.push('도보 상한 초과');
    else matched.push(`도보 ${r.walk}분 · 상한 ${maxWalk}분 이내`);
    if(!attending.length)unknown.push('참석자 조건 미확인');
    for(const n of attending){
      const response=state.responses[n];
      if(!response.avoided)unknown.push(`${n}: 피해야 할 재료 미확인`);
      else if(response.avoided!=='없음'){
        if(response.avoided==='새우' && r.handling==='새우 빼고 조리 가능(전화 확인)') matched.push(`${n}: 재료 조건 충족(실습 결정)`);
        else {unknown.push(`${n}: 재료 대응 확인 필요`);questions.push(`${r.name}에 피해야 할 재료 대응 확인`);}
      }
      if(response.preference && response.preference!=='상관없음' && r.menu.includes(response.preference))matched.push(`${n}: 메뉴 취향 일치`);
      if(response.quiet==='yes'){
        if(r.noise==='조용함')matched.push(`${n}: 조용한 곳 취향 일치(필수 아님)`);
        else if(r.noise==='미확인')questions.push('소음 정도 확인(취향, 제외 조건 아님)');
      }
    }
    if(missing.length)unknown.push('미응답자 조건 미확인');
    return {...r,status:excluded.length?'excluded':unknown.length?'pending':'match',matched,unknown:[...new Set(unknown)],excluded,questions:[...new Set(questions)]};
  });
  return {restaurants:rows,missing,max_walk:maxWalk,attendance:attending.length,budget:state.budget};
}
export function noCandidateMessage(result) {
  if(result.restaurants.some(r=>r.status==='match'))return '';
  if(result.restaurants.every(r=>r.status==='excluded'))return '조건에 맞는 후보가 없어요. 예산·도보 상한 또는 식당 자료 중 무엇을 바꿀지 막내가 결정해 주세요. 조건을 자동으로 풀지 않았어요.';
  return '확정 가능한 후보가 없어요. 미확인 정보를 먼저 확인할까요, 예산·도보 상한 또는 식당 자료 중 무엇을 바꿀까요? 조건을 자동으로 풀지 않았어요.';
}
function response(status,data,type='application/json; charset=utf-8') {
  return new Response(type.startsWith('application/json')?JSON.stringify(data):data,{status,headers:{'Content-Type':type,'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"}});
}
function invalid(message,status=400){throw Object.assign(new Error(message),{status});}
function text(v,label,limit=100){if(typeof v!=='string'||v.length>limit)invalid(label+' 입력을 확인해 주세요.');return v.trim();}
export async function api(request,env,restaurants) {
  try {
    if(!env.ADMIN_SECRET || !env.DB) return response(503,{error:'저장 공간이나 관리자 설정을 준비하고 있어요.'});
    const url=new URL(request.url),path=url.pathname.slice(5),room=url.searchParams.get('room')||'main';
    if(!/^[a-zA-Z0-9-]{1,64}$/.test(room))invalid('잘못된 실습 공간이에요.');
    const token=request.headers.get('Authorization')?.replace(/^Bearer /,'')||'';
    if(!/^[a-f0-9]{64}$/.test(token))invalid('화면의 전용 링크로 열어 주세요.',401);
    const adminToken=await key(env.ADMIN_SECRET,room,'admin');
    const admin=await equal(token,adminToken);
    const record=await env.DB.prepare('SELECT state,revision FROM lunch_rooms WHERE id=?').bind(room).first();
    let state=record?JSON.parse(record.state):initialState(),revision=record?.revision??0;
    if(!record){
      if(!admin || room!=='main')invalid('이 실습 공간에 접근할 수 없어요.',403);
      await env.DB.prepare('INSERT OR IGNORE INTO lunch_rooms (id,state,revision) VALUES (?,?,0)').bind(room,JSON.stringify(state)).run();
    }
    let member=null;
    if(!admin){for(const n of NAMES)if(await equal(token,await key(env.ADMIN_SECRET,room,n,state.epoch)))member=n;}
    if(!admin&&!member)invalid('이 링크에 접근할 수 없어요.',403);
    if(state.paused&&!admin)invalid('응답 접수가 중단됐어요. 막내에게 확인해 주세요.',423);
    const dashboard=async()=>({...compare(restaurants,state),members:await Promise.all(NAMES.map(async n=>({name:n,token:await key(env.ADMIN_SECRET,room,n,state.epoch),response:state.responses[n]??null}))),revision,version:VERSION,paused:state.paused,deadline:state.deadline,room,changes:state.changes,can_restore:!!state.backup,no_candidates:noCandidateMessage(compare(restaurants,state)),rule_sources:{budget:'사용자 결정 · 음료 포함',walk:'사용자 결정 · 참석자 중 최단 시간',materials:'식당 샘플 + D 재료 조건 충족 결정'}});
    if(request.method==='GET'){
      if(path==='me'&&member)return response(200,{name:member,response:state.responses[member]??null,budget:state.budget,deadline:state.deadline});
      if(path==='dashboard'&&admin)return response(200,await dashboard());
      if(path==='export'&&admin){const d=await dashboard();return response(200,{...d,members:d.members.map(({token,...m})=>m)});}
      invalid('접근할 수 없는 화면이에요.',403);
    }
    if(request.method!=='POST')invalid('지원하지 않는 요청이에요.',405);
    if(request.headers.get('Origin')!==url.origin)invalid('이 앱 화면에서 다시 시도해 주세요.',403);
    if(Number(request.headers.get('Content-Length'))>8192)invalid('입력이 너무 길어요.',413);
    const reader=request.body?.getReader();let size=0,chunks=[];
    if(!reader)invalid('입력이 필요해요.');
    for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192){await reader.cancel();invalid('입력이 너무 길어요.',413);}chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
    let data;try{data=JSON.parse(new TextDecoder().decode(bytes));}catch{invalid('입력 형식이 올바르지 않아요.');}
    if(!data||typeof data!=='object'||Array.isArray(data))invalid('입력을 확인해 주세요.');
    const save=async(label)=>{
      state.changes=[...state.changes,{time:new Date().toISOString(),action:label}].slice(-30);
      const r=await env.DB.prepare('UPDATE lunch_rooms SET state=?,revision=revision+1 WHERE id=? AND revision=?').bind(JSON.stringify(state),room,revision).run();
      if(r.meta.changes!==1)invalid('다른 응답이 먼저 저장됐어요. 새로고침 후 다시 시도해 주세요.',409);
      return response(200,{message:label,revision:revision+1});
    };
    if(path==='response'&&member){
      if(!['yes','no'].includes(data.attendance))invalid('참석 여부를 골라 주세요.');
      const r={attendance:data.attendance};
      if(r.attendance==='yes'){
        if(!Number.isInteger(data.walk)||data.walk<1||data.walk>60)invalid('도보 시간은 1~60분으로 적어 주세요.');
        Object.assign(r,{walk:data.walk,preference:text(data.preference??'','메뉴'),avoided:text(data.avoided??'','재료'),quiet:data.quiet==='yes'?'yes':'no'});
      }
      state.responses[member]=r;
      return await save('내 응답을 저장했어요.');
    }
    if(!admin)invalid('막내 전용 작업이에요.',403);
    if(path==='settings'){
      if(!Number.isInteger(data.budget)||data.budget<1||data.budget>1000000)invalid('예산 상한을 확인해 주세요.');
      state.backup={budget:state.budget,deadline:state.deadline};state.budget=data.budget;
      return await save('예산 상한 변경');
    }
    if(path==='restore'){
      if(!state.backup)invalid('되돌릴 설정이 없어요.');
      Object.assign(state,state.backup);state.backup=null;return await save('직전 예산·마감 설정 복원(응답 유지)');
    }
    if(path==='pause'){
      if(typeof data.paused!=='boolean')invalid('접수 상태를 확인해 주세요.');
      state.paused=data.paused;return await save(state.paused?'팀원 접수 중단':'팀원 접수 재개');
    }
    if(path==='clear'){
      if(data.confirm!=='이번 주 응답 정리')invalid('응답 정리를 확인해 주세요.');
      state.responses={};state.epoch+=1;state.paused=true;state.changes=[];state.backup=null;
      return await save('이번 주 응답 정리 · 기존 팀원 링크 무효화 · 접수 중단');
    }
    if(path==='rooms'&&room==='main'){
      const id='audit-'+crypto.randomUUID();
      await env.DB.prepare('INSERT INTO lunch_rooms (id,state,revision) VALUES (?,?,0)').bind(id,JSON.stringify(initialState())).run();
      return response(200,{room:id,admin_token:await key(env.ADMIN_SECRET,id,'admin')});
    }
    if(path==='proposal'){
      if(data.revision!==revision)invalid('조건이 바뀌었어요. 새로고침 후 다시 골라 주세요.',409);
      const ids=Array.isArray(data.ids)?data.ids:[data.id];
      if(!ids.length||ids.length>2||new Set(ids).size!==ids.length)invalid('후보를 한두 곳 골라 주세요.');
      const rows=compare(restaurants,state).restaurants;
      const chosen=ids.map(id=>rows.find(r=>r.id===id));
      if(chosen.some(r=>!r||r.status==='excluded'))invalid('제외되지 않은 후보를 골라 주세요.');
      let draft=`김 과장님, 이번 팀 점심 후보를 제안합니다.\n예산은 음료 포함 1인 ${state.budget.toLocaleString('ko-KR')}원 이내입니다.\n`;
      chosen.forEach((r,i)=>{
        draft+=`\n${i+1}순위 ${r.name} · ${r.menu} · 도보 ${r.walk}분\n`;
        draft+=r.price==null?'가격 미확인.\n':`식사 ${r.price.toLocaleString('ko-KR')}원 · 음료 포함 총액 미확인.\n`;
        draft+=r.status==='match'?'필수 조건 확인 완료.\n':'아직 확인할 조건이 있어 확정 전 초안입니다.\n';
        draft+=r.noise==='미확인'?'소음 정도 미확인.\n':`자료상 소음: ${r.noise}.\n`;
      });
      draft+='\n미확인 항목 확인 후 최종 승인 부탁드립니다.\n— 한서윤';
      return response(200,{text:draft,ready:chosen.every(r=>r.status==='match')});
    }
    invalid('작업을 찾지 못했어요.',404);
  }catch(e){return response(e.status||500,{error:e.status?e.message:'처리 중 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.'});}
}
export { key, response };
