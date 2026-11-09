'use strict';
const app = document.querySelector('#app');
const mode = location.pathname === '/admin' ? 'admin' : 'member';
const token = location.hash.slice(1);
const room = new URLSearchParams(location.search).get('room') || 'main';
let dashboard;
const money = n => n == null ? '미확인' : new Intl.NumberFormat('ko-KR').format(n) + '원';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function notice(message) {
  document.querySelector('#notice').textContent = message;
  clearTimeout(notice.timer);
  notice.timer = setTimeout(() => document.querySelector('#notice').textContent = '', 5000);
}
async function api(path, data) {
  const response = await fetch('/api/' + path + '?room=' + encodeURIComponent(room), {method:data === undefined ? 'GET' : 'POST',
    headers:{'Authorization':'Bearer ' + token, 'Content-Type':'application/json'},
    ...(data === undefined ? {} : {body:JSON.stringify(data)})});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '요청을 마치지 못했어요.');
  return result;
}
function hero(kicker, title, text) {
  return `<section class="hero"><div><p class="eyebrow">${kicker}</p><h1>${title}</h1><p class="intro">${text}</p></div><div class="hero-art" aria-hidden="true"><span>🥢</span><span>🍱</span><span>함께 먹는 수요일</span></div></section>`;
}
async function memberPage() {
  const me = await api('me');
  app.innerHTML = hero('WEDNESDAY LUNCH / TEAM', `${esc(me.name)}님,<br>이번 점심은 어때요?`, '내 조건을 한 번만 남겨 주세요.<br>확인이 필요한 내용은 막내가 따로 챙길게요.') + `
  <div class="member-layout"><section class="panel"><div class="section-head"><div><p class="eyebrow">01 / MY RESPONSE</p><h2>내 점심 조건</h2></div><span class="badge">로그인 없이 입력</span></div>
  <p class="muted">응답 마감: ${esc(me.deadline)}</p><form id="response-form"><fieldset><legend>이번 점심에 참석하나요? <span class="required">필수</span></legend><div class="radio-row"><label><input type="radio" name="attendance" value="yes" required> 함께 먹어요</label><label><input type="radio" name="attendance" value="no"> 이번에는 불참해요</label></div></fieldset>
  <div id="conditions"><label class="field">선호하는 메뉴 <span class="hint">선택 · 취향으로만 참고해요</span><input name="preference" maxlength="100" placeholder="예: 한식 / 상관없음"></label>
  <label class="field">조용한 곳을 선호하나요? <span class="hint">취향 · 후보를 제외하는 조건은 아니에요</span><select name="quiet"><option value="no">상관없음</option><option value="yes">조용한 곳 선호</option></select></label>
  <label class="field">피해야 할 재료 <span class="hint">없으면 ‘없음’ · 빈칸이면 미확인</span><input name="avoided" maxlength="100" placeholder="예: 새우 / 없음"><small>막내 전용 화면에서만 확인해요. 다른 팀원에게 보이지 않아요.</small></label>
  <label class="field">걸어갈 수 있는 시간 <span class="hint">편도 · 필수</span><div class="input-unit"><input name="walk" type="number" min="1" max="60" required placeholder="10"><span>분 이내</span></div></label></div>
  <button class="primary full" type="submit">내 응답 저장하기 <span>↗</span></button><p id="saved" class="saved" role="status"></p></form></section>
  <aside class="panel side-note"><span class="note-icon">🍵</span><h3>점심 약속, 가볍게.</h3><p>예산은 음료를 포함해<br><strong>1인 ${money(me.budget)} 이내</strong>예요.</p><hr><p>이 링크는 내 응답만 열어요.<br>다른 사람에게 전달하지 말아 주세요.</p><p class="muted">가상 자료로 시험하는 점심 도우미예요. 응답은 서버에 저장돼요. 점심 뒤 막내가 그 주 응답을 정리해야 해요.</p></aside></div>`;
  const form = document.querySelector('form');
  const updateAttendance = () => {
    const away = form.elements.attendance.value === 'no';
    document.querySelector('#conditions').hidden = away;
    form.elements.walk.required = !away;
  };
  if (me.response) {
    for (const [key, value] of Object.entries(me.response)) if (form.elements[key]) form.elements[key].value = value;
    document.querySelector('#saved').textContent = '저장된 응답이에요. 바꾸고 다시 저장할 수 있어요.';
  }
  updateAttendance();
  form.addEventListener('change', updateAttendance);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button'); button.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(form)); data.walk = Number(data.walk);
      const result = await api('response', data);
      document.querySelector('#saved').textContent = result.message + ' 같은 링크에서 수정할 수 있어요.';
      notice('저장했어요. 입력 완료. 최종 장소는 막내가 제안해요.');
    } catch (error) { notice(error.message); }
    finally { button.disabled = false; }
  });
}
async function adminPage() {
  dashboard = await api('dashboard');
  const d = dashboard;
  const responded = d.members.filter(m => m.response).length;
  const viable = d.restaurants.filter(r => r.status === 'match').length;
  const pending = d.restaurants.filter(r => r.status === 'pending').length;
  app.innerHTML = hero('WEDNESDAY LUNCH / ORGANIZER', '이번 주 점심,<br>한눈에 정리해요.', '흩어진 조건은 모으고, 모르는 것은 남겨두고.<br>마지막 선택은 서윤님이 해 주세요.') + `
  <div class="overview"><div><span>응답 현황</span><strong>${responded}<small> / 5명</small></strong><p>${d.missing.length ? esc(d.missing.join(' · ')) + ' 미응답' : '모두 응답했어요'}</p></div><div><span>음료 포함 예산</span><strong>${money(d.budget)}</strong><p>1인당 상한 · 총액 확인 후 비교</p></div><div><span>함께 걸을 거리</span><strong>${d.max_walk == null ? '미확인' : d.max_walk + '<small>분 이내</small>'}</strong><p>응답한 참석자의 가장 짧은 시간</p></div><div><span>조건을 확인한 후보</span><strong>${viable}<small>곳</small></strong><p>추가 확인 ${pending}곳 · 확정 전</p></div></div>
  <nav class="section-nav" aria-label="막내 화면 바로가기"><a href="#people">01 팀원 조건</a><a href="#restaurants">02 후보 비교</a><a href="#questions">03 확인할 일</a><a href="#proposal">04 제안문</a><button id="refresh" class="text-button">현황 새로고침 ↻</button></nav>
  <section id="people" class="panel"><div class="section-head"><div><p class="eyebrow">01 / TEAM CONDITIONS</p><h2>누구와 함께 먹나요?</h2></div><span class="badge">막내 전용</span></div><p class="muted">재료 조건은 이 화면에만 표시돼요. 응답이 없으면 임의로 채우지 않아요.</p>
  <div class="table-scroll"><table><thead><tr><th>팀원 / 출처</th><th>참석</th><th>선호 메뉴</th><th>소음 취향</th><th>피해야 할 재료</th><th>도보</th><th>내 입력 화면</th></tr></thead><tbody>${d.members.map(m => {
    const r = m.response; return `<tr><td><strong>${esc(m.name)}</strong><small>${r ? '본인 응답' : '응답 없음'}</small></td><td><span class="tag ${r ? 'green' : 'amber'}">${!r ? '미확인' : r.attendance === 'yes' ? '참석' : '불참'}</span></td><td>${esc(!r ? '미확인' : r.attendance === 'no' ? '—' : r.preference || '미확인')}</td><td>${!r ? '미확인' : r.attendance === 'no' ? '—' : r.quiet === 'yes' ? '조용한 곳(취향)' : '상관없음'}</td><td>${esc(!r ? '미확인' : r.attendance === 'no' ? '—' : r.avoided || '미확인')}</td><td>${!r ? '미확인' : r.attendance === 'no' ? '—' : r.walk + '분'}</td><td><a class="small-link" target="_blank" rel="noreferrer" href="/member?room=${encodeURIComponent(room)}#${esc(m.token)}">개별 입력 ↗</a></td></tr>`;
  }).join('')}</tbody></table></div><p class="caption">로그인 없이 개별 링크로 응답해요. 각 링크는 해당 팀원의 입력만 열어요. 링크 전달은 막내가 직접 해 주세요.</p></section>
  <section id="restaurants"><div class="section-head"><div><p class="eyebrow">02 / RESTAURANT COMPARISON</p><h2>조건부터 보고 골라요.</h2></div><form id="budget-form" class="budget-form"><label for="budget">음료 포함 예산</label><input id="budget" name="budget" type="number" min="1" max="1000000" value="${d.budget}" required><button class="secondary">적용</button></form></div>
  <div class="info-strip">ⓘ 샘플에는 음료 포함 여부가 없어요. 가격을 덧붙이지 않고 총액 미확인으로 남겼어요.</div>
  <div class="restaurant-grid">${d.restaurants.map(r => `<article class="restaurant panel ${r.status}"><div class="card-top"><span class="food-icon">${r.menu === '한식' ? '🍚' : r.menu === '초밥' ? '🍣' : '🍜'}</span><span class="tag ${r.status === 'excluded' ? 'gray' : r.status === 'match' ? 'green' : 'amber'}">${{excluded:'제외',pending:'확인 필요',match:'조건 충족'}[r.status]}</span></div><h3>${esc(r.name)}</h3><p class="restaurant-meta">${esc(r.menu)} <span>·</span> 도보 ${r.walk}분</p><div class="price">${money(r.price)}<small>${r.price == null ? '가격 자료 없음' : '식사 가격 · 음료 포함 미확인'}</small></div>
  <div class="reasons">${r.excluded.map(x => `<p class="excluded-text">× ${esc(x)}</p>`).join('')}${r.matched.map(x => `<p class="matched-text">✓ ${esc(x)}</p>`).join('')}${r.unknown.map(x => `<p class="unknown-text">? ${esc(x)}</p>`).join('')}</div>
  <details><summary>샘플 원자료 보기</summary><dl><dt>새우 사용 메뉴</dt><dd>${esc(r.shrimp)}</dd><dt>재료 대응</dt><dd>${esc(r.handling)}</dd><dt>소음</dt><dd>${esc(r.noise)}</dd><dt>자료 확인일</dt><dd>${esc(r.checked)}</dd></dl></details><button class="${r.status === 'excluded' ? 'secondary' : 'primary'} full choose" data-id="${r.id}" ${r.status === 'excluded' ? 'disabled' : ''}>${r.status === 'excluded' ? '예산·도보 조건에서 제외' : '이 후보로 초안 만들기 ↗'}</button></article>`).join('')}</div>
  ${d.no_candidates ? `<div class="empty" id="no-candidates"><h3>후보를 더 확인해야 해요.</h3><p>${esc(d.no_candidates)}</p></div>` : ''}</section>
  <div class="bottom-grid"><section id="questions" class="panel"><div class="section-head"><div><p class="eyebrow">03 / FOLLOW-UP</p><h2>다음에 확인할 일</h2></div></div><ul class="question-list">${d.missing.map(name => `<li><span class="question-type">팀원</span><div><strong>${esc(name)}</strong><p>참석 여부와 점심 조건 다시 묻기</p></div></li>`).join('')}${d.restaurants.filter(r => r.status !== 'excluded').flatMap(r => r.questions.map(q => `<li><span class="question-type">식당</span><div><strong>${esc(r.name)}</strong><p>${esc(q)}</p></div></li>`)).join('')}${d.members.filter(m => m.response?.attendance === 'yes' && !m.response.avoided).map(m => `<li><span class="question-type">팀원</span><div><strong>${esc(m.name)}</strong><p>피해야 할 재료가 없는지 확인</p></div></li>`).join('')}</ul></section>
  <section id="proposal" class="panel proposal"><p class="eyebrow">04 / PROPOSAL DRAFT</p><h2>결정은 사람이 해요.</h2><p class="muted">후보를 고르면 김 과장에게 보낼 초안이 나와요.<br>개인의 재료 조건은 제안문에 넣지 않아요.</p><label class="field">2순위 후보 <span class="hint">선택한 경우에만 초안에 포함해요</span><select id="second-choice"><option value="">없음</option>${d.restaurants.filter(r=>r.status!=='excluded').map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select></label><label class="sr-only" for="proposal-text">제안문 초안</label><textarea id="proposal-text" rows="9" readonly placeholder="위에서 후보를 골라 주세요."></textarea><button id="copy-proposal" class="secondary full" disabled>제안문 복사</button><p class="caption">미확인 확인 후 직접 전달 · 최종 승인: 김 과장</p></section></div>
  <section class="panel operations"><p class="eyebrow">05 / HANDOFF</p><h2>운영과 인수인계</h2><p class="muted">막내가 후보를 제안하고 김 과장이 최종 승인해요. 자동 발송·투표·예약·결제는 하지 않아요.</p><div class="operation-row"><button id="export-responses" class="secondary">응답 현황 내려받기</button><button id="restore-settings" class="secondary" ${d.can_restore ? '' : 'disabled'}>직전 설정 되돌리기</button><button id="pause-responses" class="secondary">${d.paused ? '응답 접수 재개' : '응답 접수 중단'}</button></div><p class="caption">응답 접수: ${d.paused ? '중단' : '진행'} · 마감: ${esc(d.deadline)} · 버전 ${esc(d.version)}</p><p class="caption">되돌리기는 직전 예산·마감 설정만 복원해요. 응답과 앱 버전 복구는 별도예요.</p><details><summary>변경 기록과 규칙 출처</summary><ul>${d.changes.map(c=>`<li>${esc(c.time)} · ${esc(c.action)}</li>`).join('')}</ul><p>예산: 사용자 결정(음료 포함) · 도보: 사용자 결정(참석자 중 최단 시간) · D 재료: 샘플과 실습 결정</p></details></section><section class="cleanup"><div><strong>점심이 끝났나요?</strong><p>막내가 이번 주 응답을 정리해요. 응답을 지우고 기존 팀원 링크를 무효화하며 접수를 중단해요. 식당 샘플은 유지돼요.</p></div><button id="clear-responses" class="secondary">이번 주 응답 정리</button></section>`;
  document.querySelector('#export-responses').onclick = async () => {
    try { const result=await api('export'); const blob=new Blob([JSON.stringify(result,null,2)],{type:'application/json'}); const href=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=href;a.download='점심_응답현황.json';a.click();URL.revokeObjectURL(href);notice('응답 현황을 내려받았어요.'); } catch(e){notice(e.message);}
  };
  document.querySelector('#restore-settings').onclick = async () => { try{await api('restore',{});await adminPage();notice('직전 설정을 복원했어요. 응답은 유지했어요.');}catch(e){notice(e.message);} };
  document.querySelector('#pause-responses').onclick = async () => { try{await api('pause',{paused:!d.paused});await adminPage();}catch(e){notice(e.message);} };
  document.querySelector('#refresh').onclick = () => adminPage().catch(e => notice(e.message));
  document.querySelectorAll('.section-nav a').forEach(link => link.onclick = event => {
    event.preventDefault();
    document.querySelector(link.getAttribute('href')).scrollIntoView({behavior:'smooth'});
  });
  document.querySelector('#budget-form').onsubmit = async event => {
    event.preventDefault();
    try { await api('settings', {budget:Number(document.querySelector('#budget').value)}); await adminPage(); notice('예산 상한을 적용했어요.'); }
    catch(e) { notice(e.message); }
  };
  document.querySelectorAll('.choose').forEach(button => button.onclick = async () => {
    try {
      const result = await api('proposal', {ids:[button.dataset.id,...[document.querySelector('#second-choice').value].filter(id=>id && id!==button.dataset.id)], revision:d.revision});
      document.querySelector('#proposal-text').value = result.text;
      document.querySelector('#copy-proposal').disabled = false;
      document.querySelector('#proposal').scrollIntoView({behavior:'smooth', block:'center'});
      notice(result.ready ? '제안 초안을 만들었어요. 김 과장 승인 전이에요.' : '미확인 조건이 남은 초안이에요. 확인 후 제안해 주세요.');
    } catch(e) { notice(e.message); }
  });
  document.querySelector('#copy-proposal').onclick = async () => {
    const field = document.querySelector('#proposal-text');
    try { await navigator.clipboard.writeText(field.value); notice('제안문을 복사했어요.'); }
    catch { field.focus(); field.select(); notice('복사 권한이 없어요. 선택된 문장을 직접 복사해 주세요.'); }
  };
  document.querySelector('#clear-responses').onclick = async () => {
    if (!confirm('이번 주 팀원 5명의 저장된 응답을 모두 정리할까요? 기존 팀원 링크도 무효화되고 접수가 중단돼요. 이 작업은 되돌릴 수 없어요.')) return;
    try { const result = await api('clear', {confirm:'이번 주 응답 정리'}); await adminPage(); notice(result.message); }
    catch(e) { notice(e.message); }
  };
}
if (!token) {
  app.innerHTML = hero('PRIVATE FIRST VERSION', '우리 팀의 점심을<br>조금 더 가볍게.', '팀원은 자기 조건만, 막내는 한눈에.<br>전용 링크로 열면 바로 시작할 수 있어요.') + '<section class="panel empty"><h2>전용 링크가 필요해요.</h2><p>막내는 실행 시 만든 관리자 주소로, 팀원은 막내 화면의 개별 입력 링크로 열어 주세요.</p><p class="muted">막내 또는 팀원 전용 링크로 접속해 주세요.</p></section>';
} else {
  (mode === 'admin' ? adminPage() : memberPage()).catch(error => {
    app.innerHTML = '<section class="panel empty"><h1>화면을 열지 못했어요.</h1><p id="error"></p><p>해당 화면의 전용 링크로 다시 열어 주세요.</p></section>';
    document.querySelector('#error').textContent = error.message;
  });
}
