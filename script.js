/* script.js - versão avançada com menu retrátil, tema, projetor, suíço, tiebreaks, undo e export CSV
   Substitua TODO o seu script.js por este arquivo.
   Criado / adaptado para Roger de Sá - EMEF PE Pacífico Dagostim
*/

const NUM_PLAYERS = 30;
const ROUNDS = 5;
const STORAGE_KEY = "xadrez_emef_advanced_state_v1_final";

// state
let players = [];
let pairings = [];
let matchLog = [];
let currentRound = 0;
let lastSnapshot = null;

// DOM refs
const playersListDiv = document.getElementById("playersList");
const pairingsDiv = document.getElementById("pairings");
const standingsTbody = document.querySelector("#standings tbody");
const currentRoundSpan = document.getElementById("currentRound");
const roundsTotalSpan = document.getElementById("roundsTotal");

const shuffleBtn = document.getElementById("shuffleBtn");
const startBtn = document.getElementById("startBtn");
const nextBtn = document.getElementById("nextBtn");
const undoBtn = document.getElementById("undoBtn");
const resetBtn = document.getElementById("resetBtn");
const exportBtn = document.getElementById("exportBtn");
const themeToggle = document.getElementById("themeToggle");
const projectorBtn = document.getElementById("projectorBtn");
const backupSaveBtn = document.getElementById("backupSaveBtn");
const backupLoadBtn = document.getElementById("backupLoadBtn");

// hamburger / contacts
const hamburgerBtn = document.getElementById("hamburgerBtn");
const contactsMenu = document.getElementById("contactsMenu");
const closeContactsBtn = document.getElementById("closeContactsBtn");

roundsTotalSpan.textContent = ROUNDS;

/* ---------- Storage ---------- */
function saveState(){
  const s = {
    players: players.map(p=>({ id:p.id, name:p.name, pts:p.pts, opponents:p.opponents, playedPairs:[...p.playedPairs], colorHistory:p.colorHistory })),
    pairings: pairings.map(m=>({...m})),
    matchLog: matchLog.map(m=>({...m})),
    currentRound,
    lastSnapshot
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

function loadState(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return false;
  try {
    const s = JSON.parse(raw);
    players = s.players.map(p=>({ id:p.id, name:p.name, pts:p.pts, opponents:p.opponents||[], playedPairs:new Set(p.playedPairs||[]), colorHistory:p.colorHistory||{white:0,black:0} }));
    pairings = s.pairings || [];
    matchLog = s.matchLog || [];
    currentRound = s.currentRound || 0;
    lastSnapshot = s.lastSnapshot || null;
    currentRoundSpan.textContent = currentRound;
    renderPlayers();
    renderStandings();
    renderPairings();
    updateUndoButton();
    if (currentRound > 0) shuffleBtn.disabled = true;
    return true;
  } catch(e){ console.error("loadState error", e); return false; }
}

/* ---------- Init ---------- */
function initPlayers(){
  players = [];
  for (let i=1;i<=NUM_PLAYERS;i++){
    players.push({ id:i, name:`Aluno ${i}`, pts:0, opponents:[], playedPairs:new Set(), colorHistory:{white:0, black:0} });
  }
  pairings = [];
  matchLog = [];
  currentRound = 0;
  lastSnapshot = null;
  currentRoundSpan.textContent = currentRound;
  shuffleBtn.disabled = false;
  nextBtn.disabled = true;
  updateUndoButton();
  renderPlayers();
  renderStandings();
  pairingsDiv.innerHTML = "Aguardando início…";
  saveState();
}

if (!loadState()) initPlayers();

/* ---------- Render players (editable by dblclick) ---------- */
function renderPlayers(){
  playersListDiv.innerHTML = "";
  players.forEach(p=>{
    const row = document.createElement("div");
    row.className = "player-row";

    const left = document.createElement("div");
    left.style.display = "flex"; left.style.alignItems = "center"; left.style.gap = "8px";

    const numSpan = document.createElement("span"); numSpan.className = "num"; numSpan.textContent = p.id;
    const piece = document.createElement("span"); piece.className = "player-icon"; piece.textContent = "♔";
    const nameSpan = document.createElement("span"); nameSpan.className = "player-name-display"; nameSpan.textContent = p.name;
    nameSpan.title = "Duplo clique para editar";
    nameSpan.addEventListener("dblclick", ()=> startEditingName(p.id, nameSpan));

    left.appendChild(numSpan); left.appendChild(piece); left.appendChild(nameSpan);

    const right = document.createElement("div"); right.textContent = p.pts.toFixed(1) + " pts";

    row.appendChild(left); row.appendChild(right);
    playersListDiv.appendChild(row);
  });
}

function startEditingName(playerId, nameSpan){
  const p = players.find(x=>x.id===playerId);
  if (!p) return;
  const input = document.createElement("input");
  input.type = "text"; input.value = p.name; input.className = "player-name-input";
  input.addEventListener("keydown", (e)=>{ if (e.key === "Enter") finishEditingName(playerId, input); if (e.key==="Escape") renderPlayers(); });
  input.addEventListener("blur", ()=> finishEditingName(playerId, input));
  nameSpan.replaceWith(input); input.focus(); input.setSelectionRange(input.value.length, input.value.length);
}

function finishEditingName(playerId, inputEl){
  const newName = (inputEl.value||"").trim() || `Aluno ${playerId}`;
  const p = players.find(x=>x.id===playerId);
  if (p) p.name = newName;
  renderPlayers(); renderPairings(); renderStandings(); saveState();
}

/* ---------- Tiebreaks ---------- */
function computeTiebreaks(){
  // buchholz total & mediano & SB
  players.forEach(p=>{
    const oppPts = (p.opponents||[]).map(id=> (players.find(x=>x.id===id)||{pts:0}).pts );
    p.buchholz = oppPts.reduce((s,x)=>s+x,0);
    if (oppPts.length >= 3){
      const sorted = oppPts.slice().sort((a,b)=>a-b);
      sorted.shift(); sorted.pop();
      p.buchholzMed = sorted.reduce((s,x)=>s+x,0);
    } else p.buchholzMed = p.buchholz;
    // SB
    let sb = 0;
    matchLog.forEach(m=>{
      if (m.a === p.id || m.b === p.id){
        const oppId = (m.a === p.id) ? m.b : m.a;
        const oppPts = (players.find(x=>x.id===oppId)||{pts:0}).pts;
        let score = 0;
        if (m.result === 'D') score = 0.5;
        else if (m.result === 'A' && m.a === p.id) score = 1;
        else if (m.result === 'B' && m.b === p.id) score = 1;
        sb += oppPts * score;
      }
    });
    p.sb = +sb.toFixed(3);
  });
}

function renderStandings(){
  computeTiebreaks();
  const ordered = players.slice().sort((a,b)=>{
    if (b.pts !== a.pts) return b.pts - a.pts;
    if ((b.sb||0) !== (a.sb||0)) return (b.sb||0) - (a.sb||0);
    if ((b.buchholzMed||0) !== (a.buchholzMed||0)) return (b.buchholzMed||0) - (a.buchholzMed||0);
    if ((b.buchholz||0) !== (a.buchholz||0)) return (b.buchholz||0) - (a.buchholz||0);
    return a.id - b.id;
  });
  standingsTbody.innerHTML = "";
  ordered.forEach((p, idx)=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${idx+1}</td><td>${p.id}</td><td>${p.name}</td><td>${p.pts.toFixed(1)}</td><td>${(p.sb||0).toFixed(2)}</td><td>${(p.buchholzMed||0).toFixed(2)}</td><td>${(p.buchholz||0).toFixed(2)}</td><td>${(p.opponents||[]).map((o,i)=>`R${i+1}:${o}`).join(" | ")}</td>`;
    standingsTbody.appendChild(tr);
  });
}

/* ---------- Pairing with color balancing (heuristic) ---------- */
function generatePairings(){
  const ordered = players.slice().sort((a,b)=>{
    if (b.pts !== a.pts) return b.pts - a.pts;
    return a.id - b.id;
  });
  const used = new Set();
  const matches = [];
  for (let i=0;i<ordered.length;i++){
    const A = ordered[i];
    if (used.has(A.id)) continue;
    let found = -1;
    for (let j=i+1;j<ordered.length;j++){
      const B = ordered[j];
      if (used.has(B.id)) continue;
      if (!A.playedPairs.has(B.id)) { found = j; break; }
    }
    if (found === -1){
      for (let j=i+1;j<ordered.length;j++){
        const B = ordered[j];
        if (used.has(B.id)) continue;
        found = j; break;
      }
    }
    if (found === -1) continue;
    const B = ordered[found];
    used.add(A.id); used.add(B.id);

    // decide white assignment heuristically
    const aDef = A.colorHistory.white - A.colorHistory.black;
    const bDef = B.colorHistory.white - B.colorHistory.black;
    let whiteId = A.id;
    if (aDef > bDef) whiteId = B.id;
    // assign provisional color counts
    if (!A.colorHistory) A.colorHistory = {white:0,black:0};
    if (!B.colorHistory) B.colorHistory = {white:0,black:0};
    if (whiteId === A.id){ A.colorHistory.white++; B.colorHistory.black++; }
    else { B.colorHistory.white++; A.colorHistory.black++; }

    matches.push({ a:A.id, b:B.id, whiteId, result:null, observation:"" });
  }
  return matches;
}

/* ---------- Render pairings ---------- */
function renderPairings(){
  pairingsDiv.innerHTML = "";
  if (!pairings || pairings.length === 0){ pairingsDiv.innerHTML = "<p>Sem pareamentos.</p>"; return; }
  pairings.forEach((m, idx)=>{
    const A = players.find(p=>p.id===m.a);
    const B = players.find(p=>p.id===m.b);

    const card = document.createElement("div"); card.className = "match-card";
    const left = document.createElement("div"); left.className = "match-player";
    left.innerHTML = `<span style="font-size:18px">${m.whiteId===A.id? '♔':'♚'}</span><div><div style="font-weight:700">${A.name}${m.whiteId===A.id? ' (Branco)':''}</div><div class="player-meta">Pts: ${A.pts.toFixed(1)}</div></div>`;

    const center = document.createElement("div"); center.className = "match-buttons";
    center.innerHTML = `<button class="btnA">Vitória A</button><button class="btnD">Empate</button><button class="btnB">Vitória B</button>`;
    center.querySelector(".btnA").addEventListener("click", ()=> promptAndApplyResult(idx,'A'));
    center.querySelector(".btnD").addEventListener("click", ()=> promptAndApplyResult(idx,'D'));
    center.querySelector(".btnB").addEventListener("click", ()=> promptAndApplyResult(idx,'B'));

    const right = document.createElement("div"); right.className = "match-player"; right.style.justifyContent="flex-end";
    right.innerHTML = `<div style="text-align:right"><div style="font-weight:700">${B.name}${m.whiteId===B.id? ' (Branco)':''}</div><div class="player-meta">Pts: ${B.pts.toFixed(1)}</div></div><span style="font-size:18px">${m.whiteId===B.id? '♔':'♚'}</span>`;

    left.classList.remove("win","lose","draw"); right.classList.remove("win","lose","draw");
    if (m.result) applyHighlight(left,right,m.result,true);

    card.appendChild(left); card.appendChild(center); card.appendChild(right);
    pairingsDiv.appendChild(card);
  });
}

/* ---------- Highlight helper ---------- */
function applyHighlight(left,right,code,withAnim){
  left.classList.remove("win","lose","draw"); right.classList.remove("win","lose","draw");
  if (code==='A'){ left.classList.add("win"); right.classList.add("lose"); }
  else if (code==='B'){ right.classList.add("win"); left.classList.add("lose"); }
  else { left.classList.add("draw"); right.classList.add("draw"); }
  if (withAnim){ left.classList.add("fade-highlight"); right.classList.add("fade-highlight"); setTimeout(()=>{ left.classList.remove("fade-highlight"); right.classList.remove("fade-highlight"); },450); }
}

/* ---------- Apply result ---------- */
function promptAndApplyResult(idx, code){
  const obs = prompt("Observação (opcional): Xeque-mate / Timeout / Acordo / Lance ilegal / etc.", "");
  applyResult(idx, code, (obs||"").trim());
}

function applyResult(idx, code, observation){
  const m = pairings[idx]; if (!m || m.result) return;
  const A = players.find(p=>p.id===m.a); const B = players.find(p=>p.id===m.b);
  if (code==='A'){ A.pts = +(A.pts + 1).toFixed(2); }
  else if (code==='B'){ B.pts = +(B.pts + 1).toFixed(2); }
  else { A.pts = +(A.pts + 0.5).toFixed(2); B.pts = +(B.pts + 0.5).toFixed(2); }

  A.opponents.push(B.id); B.opponents.push(A.id);
  A.playedPairs.add(B.id); B.playedPairs.add(A.id);

  m.result = code; m.observation = observation || "";
  matchLog.push({ round: currentRound || 1, a:m.a, b:m.b, whiteId:m.whiteId, result:code, observation:m.observation });

  saveState();
  const card = pairingsDiv.children[idx];
  if (card){
    const left = card.querySelector(".match-player:nth-child(1)");
    const right = card.querySelector(".match-player:nth-child(3)");
    applyHighlight(left,right,code,true);
  }
  renderStandings(); renderPlayers();
}

/* ---------- finalize unplayed ---------- */
function finalizeUnplayedAsNone(){
  pairings.forEach(m=>{
    if (!m.result){
      const A = players.find(p=>p.id===m.a); const B = players.find(p=>p.id===m.b);
      A.opponents.push(B.id); B.opponents.push(A.id);
      A.playedPairs.add(B.id); B.playedPairs.add(A.id);
      m.result = 'N'; m.observation = 'Não jogada ao avançar';
      matchLog.push({ round: currentRound || 1, a:m.a, b:m.b, whiteId:m.whiteId, result:'N', observation:m.observation });
    }
  });
  saveState();
}

/* ---------- Snapshots (undo last round) ---------- */
function takeSnapshot(){
  lastSnapshot = {
    players: players.map(p=>({ id:p.id, name:p.name, pts:p.pts, opponents:[...p.opponents], playedPairs:[...p.playedPairs], colorHistory:{...p.colorHistory} })),
    matchLog: matchLog.map(m=>({...m})),
    currentRound
  };
  updateUndoButton(); saveState();
}
function restoreSnapshot(){
  if (!lastSnapshot) return;
  players = lastSnapshot.players.map(p=>({ id:p.id, name:p.name, pts:p.pts, opponents:p.opponents||[], playedPairs:new Set(p.playedPairs||[]), colorHistory:p.colorHistory||{white:0,black:0} }));
  matchLog = lastSnapshot.matchLog.map(m=>({...m}));
  currentRound = lastSnapshot.currentRound || lastSnapshot.currentRound === 0 ? lastSnapshot.currentRound : lastSnapshot.currentRound;
  currentRound = lastSnapshot.currentRound || currentRound;
  currentRoundSpan.textContent = currentRound;
  lastSnapshot = null;
  updateUndoButton();
  pairings = [];
  renderPlayers(); renderStandings(); renderPairings(); saveState();
}
function updateUndoButton(){ undoBtn.disabled = !lastSnapshot; }

/* ---------- Controls ---------- */
startBtn.onclick = () => {
  if (currentRound !== 0) return;
  takeSnapshot();
  currentRound = 1; currentRoundSpan.textContent = currentRound;
  pairings = generatePairings();
  renderPairings();
  nextBtn.disabled = false; shuffleBtn.disabled = true;
  saveState();
};
nextBtn.onclick = () => {
  takeSnapshot();
  finalizeUnplayedAsNone();
  if (currentRound >= ROUNDS){ alert("Torneio finalizado."); return; }
  currentRound++; currentRoundSpan.textContent = currentRound;
  pairings = generatePairings();
  renderPairings();
  saveState();
};
undoBtn.onclick = () => {
  if (!lastSnapshot) return alert("Nada para desfazer.");
  if (!confirm("Deseja realmente desfazer a última rodada?")) return;
  restoreSnapshot();
};
resetBtn.onclick = () => {
  if (!confirm("Deseja zerar TODO o torneio?")) return;
  localStorage.removeItem(STORAGE_KEY);
  initPlayers();
};

/* ---------- Shuffle ---------- */
shuffleBtn.onclick = () => {
  if (currentRound > 0) return alert("Só pode embaralhar antes da 1ª rodada");
  for (let i=players.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [players[i],players[j]]=[players[j],players[i]]; }
  renderPlayers(); renderStandings(); saveState();
};

/* ---------- Theme & Projector ---------- */
function applyStoredTheme(){ const t = localStorage.getItem(STORAGE_KEY + "_theme"); if (t==='dark') document.body.classList.add("dark"); else document.body.classList.remove("dark"); }
applyStoredTheme();
themeToggle.onclick = () => { document.body.classList.toggle("dark"); localStorage.setItem(STORAGE_KEY + "_theme", document.body.classList.contains("dark") ? "dark" : "light"); };

projectorBtn.onclick = () => { document.body.classList.toggle("projector"); };

/* ---------- Export CSV ---------- */
exportBtn.onclick = () => exportCSV();
function exportCSV(){
  const maxR = ROUNDS;
  const header = ["Pos","ID","Nome","Pontos","SB","BuchholzMed","Buchholz","Oponentes"];
  for (let r=1;r<=maxR;r++) header.push(`R${r}`);
  header.push("Observacoes");
  computeTiebreaks();
  const ordered = players.slice().sort((a,b)=>{
    if (b.pts !== a.pts) return b.pts - a.pts;
    if ((b.sb||0) !== (a.sb||0)) return (b.sb||0) - (a.sb||0);
    if ((b.buchholzMed||0) !== (a.buchholzMed||0)) return (b.buchholzMed||0) - (a.buchholzMed||0);
    if ((b.buchholz||0) !== (a.buchholz||0)) return (b.buchholz||0) - (a.buchholz||0);
    return a.id - b.id;
  });
  const map = {}; players.forEach(p=> map[p.id] = { rounds:{}, obs:{} });
  matchLog.forEach(m=>{
    const r = m.round || 0;
    if (m.result === 'A'){ map[m.a].rounds[r] = 'V'; map[m.b].rounds[r] = 'D'; }
    else if (m.result === 'B'){ map[m.a].rounds[r] = 'D'; map[m.b].rounds[r] = 'V'; }
    else if (m.result === 'D'){ map[m.a].rounds[r] = 'E'; map[m.b].rounds[r] = 'E'; }
    else if (m.result === 'N'){ map[m.a].rounds[r] = 'N'; map[m.b].rounds[r] = 'N'; }
    if (m.observation){ map[m.a].obs[r] = (map[m.a].obs[r] ? map[m.a].obs[r] + " | " : "") + m.observation; map[m.b].obs[r] = (map[m.b].obs[r] ? map[m.b].obs[r] + " | " : "") + m.observation; }
  });

  const rows = [];
  ordered.forEach((p, idx)=>{
    const row = [];
    row.push(idx+1); row.push(p.id); row.push(`"${p.name.replace(/"/g,'""')}"`); row.push(p.pts.toFixed(1)); row.push((p.sb||0).toFixed(2));
    row.push((p.buchholzMed||0).toFixed(2)); row.push((p.buchholz||0).toFixed(2)); row.push(`"${(p.opponents||[]).join(" | ")}"`);
    for (let r=1;r<=maxR;r++) row.push(map[p.id].rounds[r] || "");
    const obsArr = []; for (let r=1;r<=maxR;r++) if (map[p.id].obs[r]) obsArr.push(`R${r}:${map[p.id].obs[r]}`);
    row.push(`"${obsArr.join("; ")}"`);
    rows.push(row.join(","));
  });

  const csv = [header.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `xadrez_emef_resultados_round_${currentRound||0}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

/* ---------- Contacts menu handlers ---------- */
if (hamburgerBtn && contactsMenu) {
  hamburgerBtn.addEventListener("click", ()=> contactsMenu.classList.toggle("open"));
}
if (closeContactsBtn) closeContactsBtn.addEventListener("click", ()=> contactsMenu.classList.remove("open"));
document.addEventListener("click", (e)=>{
  if (!contactsMenu) return;
  if (contactsMenu.classList.contains("open")){
    const withinMenu = contactsMenu.contains(e.target) || (hamburgerBtn && hamburgerBtn.contains(e.target));
    if (!withinMenu) contactsMenu.classList.remove("open");
  }
});

/* ---------- Backup (stub) ---------- */
backupSaveBtn.onclick = () => { alert("Backup online não configurado. Informe firebaseConfig para ativar."); };
backupLoadBtn.onclick = () => { alert("Backup online não configurado. Informe firebaseConfig para ativar."); };

/* ---------- initial render ---------- */
renderPlayers(); renderStandings(); renderPairings(); updateUndoButton(); saveState();
