/* ============================================================
   CSIA × Leaders — 2026 Record Room
   순수 JS. GitHub Pages의 JSON을 읽고, 중복/빈 경기를 자동 정리.
   ============================================================ */

/* ---- 데이터 소스 ---- */
const BASE = "https://alex4u-jun.github.io/bs_record/";

/* ---- 시즌 설정 ----
   각 시즌의 데이터는 연도 폴더에 들어있다. (예: 2025/players.json)
   teams: 그 시즌에 존재한 두 팀의 식별자 → 표시이름/색상 매핑.
   첫 번째 팀을 'A'(붉은계열), 두 번째를 'B'(시안계열)로 칠한다.   */
const SEASONS = {
  "2025": {
    label: "2025",
    folder: "2025",
    teams: { "CSIA":    { name:"CSIA",  side:"a" },
             "Leaders": { name:"Leaders", side:"b" } }
  },
  "2026": {
    label: "2026",
    folder: "2026",
    teams: { "Hunters": { name:"헌터스", side:"a" },
             "Leaders": { name:"리더스", side:"b" } }
  }
};
let CURRENT_SEASON = "2026";   // 기본 시즌

function seasonCfg(){ return SEASONS[CURRENT_SEASON]; }
function dataURL(file){ return `${BASE}${seasonCfg().folder}/${file}`; }

/* ---- 전역 상태 ---- */
let PLAYERS = [];      // players.json (누적 스탯)
let MEMBERS = [];      // players_introduce.json (선수 소개)
let GAMES   = [];      // 정리된 경기 메타
let EVENTS  = [];      // 모든 타석 이벤트 (정리 후)
let charts  = {};      // Chart.js 인스턴스 보관 (파괴용)

/* 팀 식별자 → 색상 클래스 / 표시이름 (시즌 설정 기반) */
function teamClass(t){
  const tm = seasonCfg().teams[t];
  return tm ? (tm.side==='a' ? 'csia' : 'leaders') : 'leaders';
}
function teamName(t){
  const tm = seasonCfg().teams[t];
  return tm ? tm.name : (t||'-');
}
function teamColorVar(t){
  return teamClass(t)==='csia' ? 'var(--csia)' : 'var(--leaders)';
}
function teamList(){ return Object.keys(seasonCfg().teams); }

/* ============================================================
   1. 데이터 로딩 + 중복 자동 정리
   ============================================================ */
async function fetchJSON(url){
  try{
    const r = await fetch(url, {cache:'no-store'});
    if(!r.ok) return null;
    return await r.json();
  }catch(e){ return null; }
}

async function loadAll(){
  // players / members (시즌 폴더에서)
  PLAYERS = (await fetchJSON(dataURL("players.json"))) || [];
  MEMBERS = (await fetchJSON(dataURL("players_introduce.json"))) || [];

  // game records — 여러 파일을 모아 gameId별로 "가장 타석이 많은 버전"만 채택
  const gameUrls = [1,2,3,4,5,6,7,8,9,10,11,12].map(n => dataURL(`gamerecord_${n}.json`));
  const raw = await Promise.all(gameUrls.map(fetchJSON));
  const bestByGame = {};   // gameId -> {meta, events}
  raw.forEach(file => {
    if(!file || !Array.isArray(file.games)) return;
    const metaMap = {};
    file.games.forEach(g => metaMap[g.gameId] = g);
    const evByGame = {};
    (file.events || []).forEach(e => {
      (evByGame[e.gameId] = evByGame[e.gameId] || []).push(e);
    });
    Object.keys(evByGame).forEach(gid => {
      const evs = evByGame[gid];
      if(evs.length === 0) return;               // 빈 경기 제외
      if(!bestByGame[gid] || evs.length > bestByGame[gid].events.length){
        bestByGame[gid] = { meta: metaMap[gid], events: evs };
      }
    });
  });

  // 정리된 GAMES / EVENTS 구성
  GAMES = Object.values(bestByGame)
    .filter(x => x.meta)
    .map(x => {
      const score = {};
      x.events.forEach(e => {
        score[e.offenseTeam] = (score[e.offenseTeam] || 0) + (e.runScoredDelta || 0);
      });
      return { ...x.meta, events: x.events, score };
    })
    .sort((a,b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  EVENTS = GAMES.flatMap(g => g.events);

  const tnames = teamList().map(teamName).join(' × ');
  document.getElementById('footer').textContent =
    `${tnames.toUpperCase()} · ${seasonCfg().label} · ${GAMES.length}경기 · ${EVENTS.length}타석 기록`;
}

/* ============================================================
   2. 통계 계산 (records.html 기존 공식과 동일: ROE를 AB에 포함)
   ============================================================ */
const S = p => p.stats || {};
const H  = p => (S(p)['1루타']||0)+(S(p)['2루타']||0)+(S(p)['3루타']||0)+(S(p)['홈런']||0);
const AB = p => H(p)+(S(p)['삼진']||0)+(S(p)['내야땅볼']||0)+(S(p)['플라이아웃']||0)+(S(p)['수비 실책']||0);
const TB = p => (S(p)['1루타']||0)+2*(S(p)['2루타']||0)+3*(S(p)['3루타']||0)+4*(S(p)['홈런']||0);
const PA = p => AB(p)+(S(p)['볼넷']||0)+(S(p)['희생플라이']||0);
const AVG = p => AB(p) ? H(p)/AB(p) : 0;
const OBP = p => { const d=AB(p)+(S(p)['볼넷']||0)+(S(p)['희생플라이']||0); return d ? (H(p)+(S(p)['볼넷']||0))/d : 0; };
const SLG = p => AB(p) ? TB(p)/AB(p) : 0;
const OPS = p => OBP(p)+SLG(p);
const ERA = p => (S(p)['이닝']||0) ? (S(p)['자책점']||0)*9/(S(p)['이닝']) : 0;
const WHIP= p => (S(p)['이닝']||0) ? ((S(p)['볼넷']||0)+(S(p)['피안타']||0))/(S(p)['이닝']) : 0;
const WINRATE = p => { const w=S(p)['승리']||0,l=S(p)['패배']||0; return (w+l)?w/(w+l):0; };

const fmt3 = v => v.toFixed(3).replace(/^0/,'');   // .333
const fmt2 = v => v.toFixed(2);

/* ============================================================
   3. 탭 네비게이션
   ============================================================ */
function showView(id){
  document.querySelectorAll('section.view').forEach(s => s.classList.remove('active'));
  document.getElementById('view-'+id).classList.add('active');
  window.scrollTo({top:0, behavior:'smooth'});
}
function setTab(view){
  document.querySelectorAll('#tabs button').forEach(b =>
    b.classList.toggle('active', b.dataset.view === view));
  showView(view);
}
document.getElementById('tabs').addEventListener('click', e => {
  if(e.target.tagName !== 'BUTTON') return;
  setTab(e.target.dataset.view);
});

/* ============================================================
   4. 경기 목록 (스코어보드 카드)
   ============================================================ */
function renderGames(){
  const grid = document.getElementById('gamesGrid');
  if(GAMES.length === 0){
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1;">
      <div style="font-size:38px;margin-bottom:10px;">⚾</div>
      ${seasonCfg().label} 시즌 경기 기록이 아직 없습니다.<br>
      <span style="color:var(--dim);font-size:13px;">첫 경기를 기록하면 여기에 표시됩니다.</span>
    </div>`;
  }
  else {
    grid.innerHTML = GAMES.slice().reverse().map(g => {
      const a = g.awayTeam, h = g.homeTeam;
      const as = g.score[a]||0, hs = g.score[h]||0;
      const aWin = as>hs, hWin = hs>as;
      return `
      <div class="game-card" data-gid="${g.gameId}">
        <div class="gc-date">${g.date.replace(/-/g,'.')}</div>
        <div class="gc-score">
          <div class="gc-team ${aWin?'win':''}">
            <span class="tn ${teamClass(a)}">${teamName(a)}</span>
            <span class="rn">${as}</span>
          </div>
          <span class="gc-vs">vs</span>
          <div class="gc-team ${hWin?'win':''}" style="align-items:flex-end;text-align:right;">
            <span class="tn ${teamClass(h)}">${teamName(h)}</span>
            <span class="rn">${hs}</span>
          </div>
        </div>
        <div class="gc-foot">
          <span>선공 <span class="tag">${teamName(g.firstTeam)||'-'}</span></span>
          <span>${g.events.length}타석 <span class="gc-arrow">→</span></span>
        </div>
      </div>`;
    }).join('');
  }
  // KPI — 시즌의 두 팀 득점 합산
  const totalRuns = GAMES.reduce((s,g)=>{
    return s + teamList().reduce((t,tm)=>t+(g.score[tm]||0),0);
  },0);
  const hr = EVENTS.filter(e=>e.hitterEvent==='홈런').length;
  document.getElementById('gamesKpi').innerHTML = `
    <div class="kpi"><div class="k">경기 수</div><div class="v accent">${GAMES.length}</div></div>
    <div class="kpi"><div class="k">총 타석</div><div class="v">${EVENTS.length}</div></div>
    <div class="kpi"><div class="k">총 득점</div><div class="v">${totalRuns}</div></div>
    <div class="kpi"><div class="k">홈런</div><div class="v">${hr}</div></div>`;
}
document.getElementById('gamesGrid').addEventListener('click', e=>{
  const card = e.target.closest('.game-card');
  if(card) openGameDetail(card.dataset.gid);
});

/* ============================================================
   5. 경기 상세 (스코어보드 + 이닝별 타선 로그)
   ============================================================ */
function resultClass(ev){
  if(ev==='홈런') return 'hr';
  if(['1루타','2루타','3루타'].includes(ev)) return 'hit';
  if(ev==='볼넷'||ev==='사구') return 'walk';
  if(ev==='수비 실책') return 'err';
  return 'out';
}
function openGameDetail(gid){
  const g = GAMES.find(x=>x.gameId===gid);
  if(!g) return;
  const a=g.awayTeam, h=g.homeTeam;

  // 이닝별 득점 라인스코어
  const innings = [...new Set(g.events.map(e=>e.inning))].sort((x,y)=>x-y);
  const lineScore = {}; [a,h].forEach(t=>lineScore[t]={});
  g.events.forEach(e=>{
    lineScore[e.offenseTeam][e.inning] = (lineScore[e.offenseTeam][e.inning]||0) + (e.runScoredDelta||0);
  });
  const lineRow = t => `
    <tr class="${teamClass(t)}">
      <td class="tcell">${teamName(t)}</td>
      ${innings.map(i=>`<td>${lineScore[t][i]!=null?lineScore[t][i]:'·'}</td>`).join('')}
      <td class="total">${g.score[t]||0}</td>
    </tr>`;

  // 이닝/공수별 타석 로그
  const byInning = {};
  g.events.forEach(e=>{
    const key = `${e.inning}_${e.half}`;
    (byInning[key]=byInning[key]||[]).push(e);
  });
  const logHtml = Object.keys(byInning).sort((x,y)=>{
    const [ix,hx]=x.split('_'), [iy,hy]=y.split('_');
    return (+ix - +iy) || (hx==='초'?-1:1) - (hy==='초'?-1:1);
  }).map(key=>{
    const [inning,half]=key.split('_');
    const evs=byInning[key];
    const off = evs[0].offenseTeam;
    return `
      <div class="ab-inning">
        <div class="ih">${inning}회 ${half} · <span class="${teamClass(off)}" style="color:${teamColorVar(off)}">${teamName(off)}</span> 공격</div>
        ${evs.map(e=>{
          const rc = resultClass(e.hitterEvent);
          const rbi = (e.rbiDelta||0)>0 ? `<span class="rbi">+${e.rbiDelta} 타점</span>` : '';
          const run = (e.runScoredDelta||0)>0 ? `<span class="rbi">⚑ ${e.runScoredDelta}득점</span>` : '';
          return `<div class="ab-row">
            <span class="bd">P${e.pitchCountDelta||0}</span>
            <span class="htr">${e.hitterName||'-'}</span>
            <span class="arrow">›</span>
            <span class="res ${rc}">${e.hitterEvent||'-'}</span>
            ${rbi}${run}
          </div>`;
        }).join('')}
      </div>`;
  }).join('');

  const aWin=(g.score[a]||0)>(g.score[h]||0), hWin=(g.score[h]||0)>(g.score[a]||0);
  document.getElementById('gdContent').innerHTML = `
    <div class="section-title">${g.date.replace(/-/g,'.')} · ${teamName(a)} vs ${teamName(h)}</div>
    <div class="gd-scoreboard">
      <table class="gd-line-table">
        <thead><tr><th></th>${innings.map(i=>`<th>${i}</th>`).join('')}<th style="color:var(--accent)">R</th></tr></thead>
        <tbody>${lineRow(a)}${lineRow(h)}</tbody>
      </table>
      <div style="text-align:center;margin-top:14px;font-family:var(--mono);letter-spacing:1px;color:var(--muted);font-size:13px;">
        ${aWin?`<span class="${teamClass(a)}" style="color:${teamColorVar(a)}">${teamName(a)} 승리</span>`
          : hWin?`<span class="${teamClass(h)}" style="color:${teamColorVar(h)}">${teamName(h)} 승리</span>`
          : '무승부'} · 선공 ${teamName(g.firstTeam)||'-'}
      </div>
    </div>
    <div class="panel ab-log">
      <h4 style="font-family:var(--mono);letter-spacing:1px;text-transform:uppercase;color:var(--muted);font-size:13px;margin:0 0 6px;">타석 로그</h4>
      ${logHtml}
    </div>`;
  setTab('games');                 // 탭 표시는 games 유지
  showView('gamedetail');
}
document.getElementById('gdBack').addEventListener('click', ()=>setTab('games'));

/* ============================================================
   6. 타자 / 투수 순위 테이블
   ============================================================ */
const HITTER_STATS = [
  {key:'타율', fn:AVG, fmt:fmt3}, {key:'OPS', fn:OPS, fmt:fmt3},
  {key:'출루율', fn:OBP, fmt:fmt3}, {key:'장타율', fn:SLG, fmt:fmt3},
  {key:'홈런', fn:p=>S(p)['홈런']||0}, {key:'타점', fn:p=>S(p)['타점']||0},
  {key:'안타', fn:H}, {key:'득점', fn:p=>S(p)['득점']||0},
  {key:'도루', fn:p=>S(p)['도루']||0},
];
const PITCHER_STATS = [
  {key:'ERA', fn:ERA, fmt:fmt2, asc:true}, {key:'WHIP', fn:WHIP, fmt:fmt3, asc:true},
  {key:'삼진', fn:p=>S(p)['삼진']||0}, {key:'승리', fn:p=>S(p)['승리']||0},
  {key:'이닝', fn:p=>S(p)['이닝']||0, fmt:v=>v.toFixed(1)},
  {key:'피안타', fn:p=>S(p)['피안타']||0, asc:true},
  {key:'볼넷', fn:p=>S(p)['볼넷']||0, asc:true},
];

let hitterState  = { stat:'타율', team:'all', q:'' };
let pitcherState = { stat:'ERA',  team:'all', q:'' };

function renderChips(containerId, stats, state, rerender){
  document.getElementById(containerId).innerHTML = stats.map(s=>
    `<button class="chip ${s.key===state.stat?'active':''}" data-stat="${s.key}">${s.key}</button>`
  ).join('');
  document.getElementById(containerId).onclick = e=>{
    if(!e.target.classList.contains('chip')) return;
    state.stat = e.target.dataset.stat; rerender();
  };
}

function renderRankTable(tableId, statsDef, state, type){
  const def = statsDef.find(s=>s.key===state.stat);
  const fmt = def.fmt || (v=>v);
  let list = PLAYERS.filter(p=>p.type===type);
  if(state.team!=='all') list = list.filter(p=>p.team===state.team);
  if(state.q) list = list.filter(p=>p.name.toLowerCase().includes(state.q.toLowerCase()));
  // 투수는 이닝 0이면 ERA/WHIP 의미없으니 뒤로
  list = list.map(p=>({p, v:def.fn(p)}));
  const asc = !!def.asc;
  list.sort((x,y)=>{
    // ERA/WHIP 등 asc 정렬 시, 기록 없는(0이닝) 선수는 맨 뒤로
    if(asc && type==='투수'){
      const xi=(S(x.p)['이닝']||0), yi=(S(y.p)['이닝']||0);
      if(!xi && yi) return 1; if(xi && !yi) return -1; if(!xi && !yi) return 0;
    }
    return asc ? x.v-y.v : y.v-x.v;
  });

  const cols = type==='타자'
    ? ['타율','OPS','홈런','타점','안타']
    : ['ERA','WHIP','삼진','승리','이닝'];
  const colFn = {
    '타율':AVG,'OPS':OPS,'홈런':p=>S(p)['홈런']||0,'타점':p=>S(p)['타점']||0,'안타':H,
    'ERA':ERA,'WHIP':WHIP,'삼진':p=>S(p)['삼진']||0,'승리':p=>S(p)['승리']||0,'이닝':p=>S(p)['이닝']||0
  };
  const colFmt = {'타율':fmt3,'OPS':fmt3,'ERA':fmt2,'WHIP':fmt3,'이닝':v=>v.toFixed(1)};

  document.getElementById(tableId).innerHTML = `
    <thead><tr>
      <th style="cursor:default">#</th>
      <th style="cursor:default;text-align:left">선수</th>
      ${cols.map(c=>`<th class="${c===state.stat?'sorted'+(asc?' asc':''):''}" data-stat="${c}">${c}</th>`).join('')}
    </tr></thead>
    <tbody>
      ${list.length===0 ? `<tr><td colspan="${cols.length+2}" class="empty">기록이 없습니다.</td></tr>` :
      list.map((row,i)=>{
        const p=row.p;
        return `<tr>
          <td class="rank">${i+1}</td>
          <td class="name" data-name="${p.name}" data-type="${p.type}">
            <span class="teamdot ${teamClass(p.team)}"></span>${p.name}</td>
          ${cols.map(c=>{
            const fn=colFn[c], f=colFmt[c]||(v=>v);
            const val=f(fn(p));
            return `<td class="${c===state.stat?'hi':''}">${val}</td>`;
          }).join('')}
        </tr>`;
      }).join('')}
    </tbody>`;
  // 헤더 클릭 정렬
  document.getElementById(tableId).querySelectorAll('th[data-stat]').forEach(th=>{
    th.onclick = ()=>{ state.stat = th.dataset.stat; rerenderFor(type); };
  });
  // 이름 클릭 → 선수 상세
  document.getElementById(tableId).querySelectorAll('td.name').forEach(td=>{
    td.onclick = ()=>openPlayerDetail(td.dataset.name, td.dataset.type);
  });
}

function rerenderFor(type){
  if(type==='타자'){
    renderChips('hitterChips', HITTER_STATS, hitterState, ()=>rerenderFor('타자'));
    renderRankTable('hitterTable', HITTER_STATS, hitterState, '타자');
  } else {
    renderChips('pitcherChips', PITCHER_STATS, pitcherState, ()=>rerenderFor('투수'));
    renderRankTable('pitcherTable', PITCHER_STATS, pitcherState, '투수');
  }
}

// 검색 / 팀 필터 바인딩
document.getElementById('hitterSearch').addEventListener('input', e=>{ hitterState.q=e.target.value; rerenderFor('타자'); });
document.getElementById('pitcherSearch').addEventListener('input', e=>{ pitcherState.q=e.target.value; rerenderFor('투수'); });
document.getElementById('hitterTeamSeg').addEventListener('click', e=>{
  if(e.target.tagName!=='BUTTON') return;
  hitterState.team=e.target.dataset.team;
  document.querySelectorAll('#hitterTeamSeg button').forEach(b=>b.classList.toggle('active',b===e.target));
  rerenderFor('타자');
});
document.getElementById('pitcherTeamSeg').addEventListener('click', e=>{
  if(e.target.tagName!=='BUTTON') return;
  pitcherState.team=e.target.dataset.team;
  document.querySelectorAll('#pitcherTeamSeg button').forEach(b=>b.classList.toggle('active',b===e.target));
  rerenderFor('투수');
});

/* MVP 배너 */
function renderMvp(){
  if(PLAYERS.length===0) return;
  const mvp = PLAYERS.reduce((a,c)=>((c.mvpCount||0)>(a.mvpCount||0)?c:a), {mvpCount:0});
  if(!mvp.name || (mvp.mvpCount||0)===0) return;
  const b=document.getElementById('mvpBanner');
  b.style.display='flex';
  b.innerHTML = `
    <div class="mvp-trophy">🏆</div>
    <div class="mvp-info">
      <div class="lbl">시즌 MVP</div>
      <div class="nm">${mvp.name}</div>
      <div class="meta"><span class="teamdot ${teamClass(mvp.team)}"></span>${teamName(mvp.team)} · ${mvp.type} · MVP ${mvp.mvpCount}회</div>
    </div>`;
}

/* ============================================================
   7. 선수 상세 + 경기별 기록 추이 차트
   ============================================================ */
function buildPlayerTimeline(name, type){
  // 이 선수가 등장한 경기들을 시간순으로, 누적 스탯 추이 계산
  const points = [];
  if(type==='타자'){
    let cumH=0, cumAB=0, cumTB=0, cumBB=0, cumSF=0;
    GAMES.forEach(g=>{
      const evs = g.events.filter(e=>e.hitterName===name);
      if(evs.length===0) return;
      let gH=0,gAB=0,gTB=0,gBB=0,gSF=0;
      evs.forEach(e=>{
        const ev=e.hitterEvent;
        if(['1루타','2루타','3루타','홈런'].includes(ev)){
          gH++; gAB++;
          gTB += ev==='1루타'?1:ev==='2루타'?2:ev==='3루타'?3:4;
        } else if(['삼진','내야땅볼','플라이아웃','수비 실책'].includes(ev)){
          gAB++;
        } else if(ev==='볼넷'){ gBB++; }
        else if(ev==='희생플라이'){ gSF++; }
      });
      cumH+=gH; cumAB+=gAB; cumTB+=gTB; cumBB+=gBB; cumSF+=gSF;
      const avg = cumAB?cumH/cumAB:0;
      const obpDen = cumAB+cumBB+cumSF;
      const obp = obpDen?(cumH+cumBB)/obpDen:0;
      const slg = cumAB?cumTB/cumAB:0;
      points.push({ date:g.date, avg, obp, slg, ops:obp+slg, gameAvg: gAB?gH/gAB:0 });
    });
  } else {
    let cumER=0, cumIP=0, cumBB=0, cumHA=0;
    GAMES.forEach(g=>{
      const evs = g.events.filter(e=>e.pitcherName===name);
      if(evs.length===0) return;
      let gER=0,gIP=0,gBB=0,gHA=0,gK=0;
      evs.forEach(e=>{
        gER += e.earnedRunsDelta||0;
        gIP += e.inningsDelta||0;
        if(e.pitcherEvent==='볼넷') gBB++;
        if(e.pitcherEvent==='피안타'||e.pitcherEvent==='피홈런') gHA++;
        if(e.pitcherEvent==='삼진') gK++;
      });
      cumER+=gER; cumIP+=gIP; cumBB+=gBB; cumHA+=gHA;
      const era = cumIP?cumER*9/cumIP:0;
      const whip= cumIP?(cumBB+cumHA)/cumIP:0;
      points.push({ date:g.date, era, whip });
    });
  }
  return points;
}

function makeChart(canvasId, labels, datasets, opts={}){
  const ctx = document.getElementById(canvasId);
  if(!ctx) return;
  if(charts[canvasId]){ charts[canvasId].destroy(); }
  Chart.defaults.color = '#8497b8';
  Chart.defaults.font.family = "'Saira', sans-serif";
  charts[canvasId] = new Chart(ctx, {
    type:'line',
    data:{ labels, datasets },
    options:{
      responsive:true, maintainAspectRatio:false,
      interaction:{ mode:'index', intersect:false },
      plugins:{
        legend:{ labels:{ usePointStyle:true, boxWidth:8, font:{size:12} } },
        tooltip:{
          backgroundColor:'#0b1220', borderColor:'#273a5e', borderWidth:1,
          titleColor:'#ffd23f', padding:10, cornerRadius:8,
        }
      },
      scales:{
        x:{ grid:{ color:'rgba(39,58,94,.35)' }, ticks:{ font:{size:11} } },
        y:{ grid:{ color:'rgba(39,58,94,.35)' }, ticks:{ font:{size:11} }, ...(opts.y||{}) }
      },
      ...opts.root
    }
  });
}

function openPlayerDetail(name, type){
  const p = PLAYERS.find(x=>x.name===name && x.type===type);
  const intro = MEMBERS.find(m=>m.name===name);
  const wrap = document.getElementById('pdContent');
  if(!p){ wrap.innerHTML='<div class="empty">선수 기록을 찾을 수 없습니다.</div>'; showView('playerdetail'); return; }

  const back = (intro && intro.backNumber && intro.backNumber!=='-') ? intro.backNumber : '';
  const pos  = intro ? intro.position : '';

  // 스탯 테이블 행
  let statRows;
  if(type==='타자'){
    statRows = [
      ['타율', fmt3(AVG(p))],['출루율', fmt3(OBP(p))],['장타율', fmt3(SLG(p))],['OPS', fmt3(OPS(p))],
      ['타석', PA(p)],['타수', AB(p)],['안타', H(p)],['홈런', S(p)['홈런']||0],
      ['타점', S(p)['타점']||0],['득점', S(p)['득점']||0],['볼넷', S(p)['볼넷']||0],
      ['삼진', S(p)['삼진']||0],['도루', S(p)['도루']||0],['수비 실책', S(p)['수비 실책']||0],
    ];
  } else {
    statRows = [
      ['ERA', fmt2(ERA(p))],['WHIP', fmt3(WHIP(p))],['이닝', (S(p)['이닝']||0).toFixed(1)],
      ['승', S(p)['승리']||0],['패', S(p)['패배']||0],['세이브', S(p)['세이브']||0],['홀드', S(p)['홀드']||0],
      ['삼진', S(p)['삼진']||0],['볼넷', S(p)['볼넷']||0],['피안타', S(p)['피안타']||0],
      ['피홈런', S(p)['피홈런']||0],['자책점', S(p)['자책점']||0],['투구수', S(p)['투구수']||0],
    ];
  }

  const timeline = buildPlayerTimeline(name, type);

  wrap.innerHTML = `
    <div class="detail-head">
      ${back?`<span class="num">${back}</span>`:''}
      <span class="nm">${p.name}</span>
      <span class="pos"><span class="teamdot ${teamClass(p.team)}"></span>${teamName(p.team)} · ${p.type}${pos?' · '+pos:''}${(p.mvpCount||0)>0?` · 🏆${p.mvpCount}`:''}</span>
    </div>
    <div class="panel" style="margin-top:6px;">
      <div class="table-scroll">
        <table class="rec" style="min-width:auto;">
          <tbody>
            ${(()=>{ // 4열 그리드로 스탯 배치
              let html=''; for(let i=0;i<statRows.length;i+=4){
                const slice=statRows.slice(i,i+4);
                html+='<tr>'+slice.map(([k,v])=>`<td style="text-align:left;color:var(--muted);font-family:var(--mono);font-size:12px;">${k}</td><td class="hi" style="text-align:left;">${v}</td>`).join('')+'</tr>';
              } return html; })()}
          </tbody>
        </table>
      </div>
    </div>
    ${timeline.length>=2 ? `
    <div class="chart-box">
      <h4>경기별 기록 추이 (누적)</h4>
      <div class="chart-canvas-wrap"><canvas id="pdChart"></canvas></div>
    </div>` : `<div class="chart-box"><h4>경기별 기록 추이</h4><div class="empty" style="padding:30px;">추이를 그리려면 2경기 이상의 기록이 필요합니다.${timeline.length===1?' (현재 1경기)':''}</div></div>`}
  `;

  showView('playerdetail');

  // 차트 그리기 (DOM 삽입 후)
  if(timeline.length>=2){
    const labels = timeline.map(t=>t.date.slice(5).replace('-','/'));
    if(type==='타자'){
      makeChart('pdChart', labels, [
        { label:'타율', data:timeline.map(t=>+t.avg.toFixed(3)), borderColor:'#ffd23f', backgroundColor:'rgba(255,210,63,.12)', borderWidth:2.5, tension:.3, fill:true, pointRadius:3 },
        { label:'OPS', data:timeline.map(t=>+t.ops.toFixed(3)), borderColor:'#27d0ff', backgroundColor:'transparent', borderWidth:2, tension:.3, pointRadius:3 },
        { label:'출루율', data:timeline.map(t=>+t.obp.toFixed(3)), borderColor:'#5effb0', backgroundColor:'transparent', borderWidth:1.6, borderDash:[5,4], tension:.3, pointRadius:2 },
      ], { y:{ beginAtZero:true } });
    } else {
      makeChart('pdChart', labels, [
        { label:'ERA', data:timeline.map(t=>+t.era.toFixed(2)), borderColor:'#ff5a3c', backgroundColor:'rgba(255,90,60,.12)', borderWidth:2.5, tension:.3, fill:true, pointRadius:3 },
        { label:'WHIP', data:timeline.map(t=>+t.whip.toFixed(3)), borderColor:'#27d0ff', backgroundColor:'transparent', borderWidth:2, tension:.3, pointRadius:3, yAxisID:'y1' },
      ], { root:{ scales:{
        x:{ grid:{color:'rgba(39,58,94,.35)'} },
        y:{ position:'left', grid:{color:'rgba(39,58,94,.35)'}, title:{display:true,text:'ERA'} },
        y1:{ position:'right', grid:{drawOnChartArea:false}, title:{display:true,text:'WHIP'} }
      }}});
    }
  }
}
document.getElementById('pdBack').addEventListener('click', ()=>history.length>1?history.back():setTab('hitters'));

/* ============================================================
   8. 선수단 (members)
   ============================================================ */
let memberState = { team:'all', q:'' };
function renderMembers(){
  let list = MEMBERS.slice();
  if(memberState.team!=='all') list=list.filter(m=>m.team===memberState.team);
  if(memberState.q) list=list.filter(m=>m.name.includes(memberState.q));
  const grid=document.getElementById('membersGrid');
  if(list.length===0){ grid.innerHTML='<div class="empty">선수가 없습니다.</div>'; return; }
  grid.innerHTML = list.map(m=>{
    const hitter = PLAYERS.find(p=>p.name===m.name && p.type==='타자');
    const sub = hitter ? `타율 ${fmt3(AVG(hitter))} · OPS ${fmt3(OPS(hitter))}` : '기록 없음';
    const cap = m.captain ? ' <span style="color:var(--accent);font-size:12px;">ⓒ 주장</span>' : '';
    return `
    <div class="game-card" data-name="${m.name}" data-has="${hitter?'1':'0'}" style="cursor:${hitter?'pointer':'default'}">
      <div class="gc-score" style="padding:16px;align-items:center;">
        <div style="font-family:var(--display);font-size:40px;color:var(--line2);min-width:54px;">${m.backNumber&&m.backNumber!=='-'?m.backNumber:'–'}</div>
        <div style="flex:1;">
          <div style="font-family:var(--mono);font-weight:700;font-size:19px;">${m.name}${cap}</div>
          <div style="color:var(--muted);font-size:13px;margin-top:2px;">
            <span class="teamdot ${teamClass(m.team)}"></span>${m.team&&m.team!=='-'?teamName(m.team):'미배정'} · ${m.position&&m.position!=='-'?m.position:'포지션 미정'}
          </div>
          <div style="font-family:var(--mono);font-size:12px;color:var(--dim);margin-top:6px;">${sub}</div>
        </div>
      </div>
    </div>`;
  }).join('');
}
document.getElementById('membersGrid').addEventListener('click', e=>{
  const card=e.target.closest('.game-card');
  if(card && card.dataset.has==='1') openPlayerDetail(card.dataset.name,'타자');
});
document.getElementById('memberSearch').addEventListener('input', e=>{ memberState.q=e.target.value; renderMembers(); });
document.getElementById('memberTeamSeg').addEventListener('click', e=>{
  if(e.target.tagName!=='BUTTON') return;
  memberState.team=e.target.dataset.team;
  document.querySelectorAll('#memberTeamSeg button').forEach(b=>b.classList.toggle('active',b===e.target));
  renderMembers();
});


/* ============================================================
   9. 시즌 전환 + 동적 헤더/필터 + 부트스트랩
   ============================================================ */

/* 시즌의 두 팀으로 팀 필터 세그먼트 버튼 다시 그리기 */
function renderTeamSegments(){
  const teams = teamList();
  const html = `<button data-team="all" class="active">전체</button>` +
    teams.map(t=>`<button data-team="${t}">${teamName(t)}</button>`).join('');
  ['hitterTeamSeg','pitcherTeamSeg','memberTeamSeg'].forEach(id=>{
    document.getElementById(id).innerHTML = html;
  });
  // 상태도 전체로 초기화
  hitterState.team='all'; pitcherState.team='all'; memberState.team='all';
}

/* 브랜드 타이틀 (헌터스 × 리더스 / CSIA × LEADERS) */
function renderBrand(){
  const teams = teamList();
  const a=teams[0], b=teams[1];
  document.getElementById('brandTitle').innerHTML =
    `<span class="c">${teamName(a)}</span> <span style="color:var(--dim);font-size:.6em;">×</span> <span class="l">${teamName(b)}</span>`;
}

/* 시즌 전환 토글 */
function renderSeasonSwitch(){
  const sw = document.getElementById('seasonSwitch');
  sw.innerHTML = Object.keys(SEASONS).sort().reverse().map(sk=>
    `<button data-season="${sk}" class="${sk===CURRENT_SEASON?'active':''}">${SEASONS[sk].label}</button>`
  ).join('');
  sw.onclick = async e=>{
    if(e.target.tagName!=='BUTTON') return;
    const sk = e.target.dataset.season;
    if(sk===CURRENT_SEASON) return;
    CURRENT_SEASON = sk;
    await reloadSeason();
  };
}

async function reloadSeason(){
  // 로딩 표시
  document.getElementById('gamesGrid').innerHTML =
    '<div class="loading" style="grid-column:1/-1;"><div class="spinner"></div>데이터를 불러오는 중…</div>';
  renderSeasonSwitch();
  renderBrand();
  renderTeamSegments();
  await loadAll();
  renderGames();
  renderMvp();
  rerenderFor('타자');
  rerenderFor('투수');
  renderMembers();
  setTab('games');
}

(async function init(){
  renderSeasonSwitch();
  renderBrand();
  renderTeamSegments();
  await loadAll();
  renderGames();
  renderMvp();
  rerenderFor('타자');
  rerenderFor('투수');
  renderMembers();
})();
