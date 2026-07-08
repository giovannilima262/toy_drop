'use strict';
/* Toy Drop — merge-física (estilo Suika) com Kenney Toy Brick Pack.
   Layout: cenário background.png; jogo encaixado no painel azul; HUD do mockup
   (barra superior, próximas peças no topo do painel, contador de peças marcadas embaixo). */

const BASE_W = 1024, BASE_H = 1536;   // proporção do cenário (2:3), letterbox
const W = 480, H = 828;               // resolução lógica da área de jogo (casa com o painel 0.579)
const INNER_L = 0, INNER_W = 480, INNER_R = INNER_L + INNER_W;  // sem margem lateral — peças encostam nas bordas
const FLOOR_Y = 818;                  // chão quase colado no fundo do painel
const DANGER_Y = 210, SPAWN_Y = 150;
const STUD = 8;               // altura real do pino nos sprites
const GRID = 32;              // passo real do pino (t1 = 1 pino de 32px)
const MERGE_WINDOW = 1400;
const NEXT_DELAY = 500;
const MAX_TIER = 7, CELEBRATE_PTS = 400;

function getSpawnPool(){
  if(level <= 5)  return [1,1,1,1,2,2,2,3,3];            // fácil: tier 1-3
  if(level <= 10) return [1,1,2,2,2,3,3,3,4];             // médio: tier 1-4
  if(level <= 15) return [1,2,2,3,3,3,4,4,5];             // difícil: tier 1-5
  return [2,3,3,4,4,5,5,6];                                // extremo: tier 2-6 (pretas!)
}

const PIECES = [null,
  { img:'t1', w:32,  h:22, color:'#FF5859', pts:0  },
  { img:'t2', w:32,  h:36, color:'#FFCC2F', pts:4  },
  { img:'t3', w:64,  h:36, color:'#1695ED', pts:10 },
  { img:'t4', w:64,  h:64, color:'#56C46D', pts:20 },
  { img:'t5', w:128, h:36, color:'#ECECEC', pts:35 },
  { img:'t6', w:128, h:64, color:'#24242A', pts:60 },
  { img:'t7', w:192, h:64, color:'#FFB733', pts:100 }
];
const CONFETTI = ['#FF5859','#FFCC2F','#1695ED','#56C46D','#ECECEC','#FFB733'];


/* ---------- Storage (CrazyGames cloud → localStorage fallback) ---------- */
const ST = {
  _prefix: 'toydrop_',
  _loading: true,
  _queue: [],
  async _init(){
    try {
      if(window.CrazyGames?.SDK?.data?.get){
        // Carrega dados salvos na nuvem CrazyGames
        const keys = ['best','chars','gems','bestLevel','lang','mute','musicMute'];
        const vals = await window.CrazyGames.SDK.data.get(keys);
        for(const k of keys){
          if(vals[k] !== undefined && vals[k] !== null){
            localStorage.setItem(this._prefix+k, vals[k]);
          }
        }
      }
    } catch(e) {}
    this._loading = false;
    for(const fn of this._queue) fn();
    this._queue = [];
  },
  get(key){
    const raw = localStorage.getItem(this._prefix+key);
    if(raw === null) return null;
    return raw;
  },
  set(key, val){
    localStorage.setItem(this._prefix+key, String(val));
    this._sync(key, val);
  },
  _sync(key, val){
    if(this._loading){ this._queue.push(()=>this._sync(key,val)); return; }
    try {
      window.CrazyGames?.SDK?.data?.set({ [key]: val });
    } catch(e) {}
  }
};
ST._init();

/* ---------- Tradução EN/PT ---------- */
let lang = ST.get('lang') || '';
function detectLang(){
  if(!lang){
    try {
      const loc = window.CrazyGames?.SDK?.user?.getUser?.()?.locale;
      if(loc){ lang = loc.startsWith('pt')?'pt':'en'; return; }
    } catch(e) {}
    lang = (navigator.language && navigator.language.startsWith('pt')) ? 'pt' : 'en';
  }
}
detectLang();
function toggleLang(){
  lang = (lang==='pt') ? 'en' : 'pt';
  ST.set('lang', lang);
  // Atualiza o toggle imediatamente
  const p = document.getElementById('langPt');
  const e = document.getElementById('langEn');
  if(p) p.classList.toggle('active', lang==='pt');
  if(e) e.classList.toggle('active', lang==='en');
  syncHTML();
  syncScore();
}
const TX = {
  next:     { pt:"PRÓXIMAS", en:"NEXT" },
  level:    { pt:"NÍVEL", en:"LEVEL" },
  subtitle: { pt:"junte blocos iguais!", en:"merge matching blocks!" },
  sRecord:  { pt:"RECORDE", en:"RECORD" },
  sPieces:  { pt:"PEÇAS", en:"PIECES" },
  sMaxLvl:  { pt:"NÍVEL MÁX", en:"MAX LEVEL" },
  ctrlMouse:{ pt:"arraste para mirar<br>solte para largar", en:"drag to aim<br>release to drop" },
  ctrlKey:  { pt:"← → mover<br>espaço soltar", en:"← → move<br>space to drop" },
  paused:   { pt:"PAUSADO", en:"PAUSED" },
  resume:   { pt:"Continuar", en:"Resume" },
  restart:  { pt:"Reiniciar", en:"Restart" },
  sfxOn:    { pt:"Efeitos Lig.", en:"SFX On" },
  sfxOff:   { pt:"Efeitos Desl.", en:"SFX Off" },
  musicOn:  { pt:"Música Lig.", en:"Music On" },
  musicOff: { pt:"Música Desl.", en:"Music Off" },
  tips:     { pt:"arraste para mirar · solte para largar<br>junte blocos iguais para fundir!", en:"drag to aim · release to drop<br>merge matching blocks!" },
  gameOver: { pt:"FIM DE JOGO", en:"GAME OVER" },
  newRecord:{ pt:"NOVO RECORDE!", en:"NEW RECORD!" },
  pts:      { pt:"pts", en:"pts" },
  continue: { pt:"Continuar", en:"Continue" },
  playAgain:{ pt:"Jogar de Novo", en:"Play Again" },
  congrats: { pt:"PARABÉNS!", en:"CONGRATULATIONS!" },
  boardClear:{ pt:"Tabuleiro Limpo!", en:"Board Cleared!" },
  bonus:    { pt:"bônus", en:"bonus" },
  tapCont:  { pt:"toque para continuar", en:"tap to continue" },
  adTitle:  { pt:"anúncio", en:"ad" },
  shake:    { pt:"CHACOALHAR", en:"SHAKE" },
  storeSoon:{ pt:"loja em breve", en:"shop coming soon" },
};
function T(key){ return (TX[key]&&TX[key][lang]) || TX[key]?.pt || key; }
function syncHTML(){
  // Start screen labels
  const labels = document.querySelectorAll('.ss-label');
  if(labels[0]) labels[0].textContent = T('sRecord');
  if(labels[1]) labels[1].textContent = T('sPieces');
  if(labels[2]) labels[2].textContent = T('sMaxLvl');
  // Subtitle
  const sub = document.querySelector('#startOverlay .sub');
  if(sub) sub.textContent = T('subtitle');
  // Controls
  const ctrlSpans = document.querySelectorAll('.ctrl-group span');
  if(ctrlSpans[0]) ctrlSpans[0].innerHTML = T('ctrlMouse');
  if(ctrlSpans[1]) ctrlSpans[1].innerHTML = T('ctrlKey');
  // Level pill
  const lvl = document.querySelector('#lvlPill');
  if(lvl) lvl.childNodes[0].textContent = T('level')+' ';
  // Shake button
  const shakeLabel = document.getElementById('shakeLabel');
  if(shakeLabel) shakeLabel.textContent = T('shake');
  // Lang toggle
  const langPt = document.getElementById('langPt');
  const langEn = document.getElementById('langEn');
  if(langPt) langPt.classList.toggle('active', lang==='pt');
  if(langEn) langEn.classList.toggle('active', lang==='en');
}

/* ---------- Integração CrazyGames ---------- */
const CG = ()=> window.CrazyGames?.SDK;
const SDK = {
  init(){
    try { CG()?.init(); } catch(e) {}
  },
  gameplayStart(){
    try { CG()?.game?.gameplayStart(); } catch(e) {}
  },
  gameplayStop(){
    try { CG()?.game?.gameplayStop(); } catch(e) {}
  },
  happytime(){
    try { CG()?.game?.happytime(); } catch(e) {}
  },
  midgame(cb){
    // TODO: trocar por ad real quando aprovarem monetização
    // if(!CG()){ cb?.(); return; }
    // CG().ad?.requestAd('midgame', { callbacks: { adFinished: ()=> cb?.(), adError: ()=> cb?.() } });
    cb?.();
  },
  rewarded(cb){
    // TODO: trocar por ad real quando aprovarem monetização
    // if(!CG()){ cb?.(); return; }
    // CG().ad?.requestAd('rewarded', { callbacks: { adFinished: ()=> cb?.(), adError: ()=> cb?.() } });
    cb?.();
  }
};

/* ---------- Assets ---------- */
const IMG_NAMES = ['t1','t2','t3','t4','t5','t6','t7','dirt_top','char_a','char_b','char_c','char_d','char_e'];
const IMGS = {};
function loadImages(){
  return Promise.all(IMG_NAMES.map(n => new Promise((res,rej)=>{
    const i = new Image();
    i.onload = ()=>{ IMGS[n]=i; res(); };
    i.onerror = ()=>rej(new Error('falha ao carregar '+n));
    i.src = 'assets/'+n+'.png';
  })));
}

/* ---------- Áudio ---------- */
let AC = null, muted = ST.get('mute')==='1';
let musicMuted = ST.get('musicMute')==='1';

/* ---------- BGM (Web Audio API — crossfade loop sem corte) ---------- */
let bgmBuffer = null, _bgmLoading = null, _bgmNodes = [], _bgmTimer = null;
function loadBgm(){
  if(bgmBuffer) return Promise.resolve();
  if(_bgmLoading) return _bgmLoading;
  if(!AC) return Promise.reject('no AC');
  _bgmLoading = fetch('assets/toy.mp3')
    .then(r => { if(!r.ok) throw new Error('bgm fetch failed'); return r.arrayBuffer(); })
    .then(arr => AC.decodeAudioData(arr))
    .then(buf => { bgmBuffer = buf; _bgmLoading = null; })
    .catch(e => { console.warn('bgm:', e.message); _bgmLoading = null; });
  return _bgmLoading;
}
function _scheduleBgmIteration(when){
  if(!AC || !bgmBuffer) return;
  const dur = bgmBuffer.duration;
  const fade = Math.min(2.2, dur * 0.08);        // ~8% da duração, máx 2.2s
  const overlap = fade * 0.55;                     // sobreposição entre iterações

  const src = AC.createBufferSource();
  src.buffer = bgmBuffer;
  const gain = AC.createGain();

  // Envelope: fade-in → sustain → fade-out
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(0.08, when + fade);
  gain.gain.setValueAtTime(0.08, when + dur - fade);
  gain.gain.linearRampToValueAtTime(0, when + dur);

  gain.connect(AC.destination);
  src.connect(gain);
  src.start(when);
  src.stop(when + dur + 0.3);

  // Track pra cleanup
  const entry = {src, gain};
  _bgmNodes.push(entry);
  src.onended = () => { entry.done = true; _bgmNodes = _bgmNodes.filter(n => !n.done); };

  // Agenda a próxima iteração antes desta acabar
  const nextWhen = when + dur - overlap;
  const scheduleIn = Math.max(120, (when + dur - fade * 2.5 - AC.currentTime) * 1000);
  clearTimeout(_bgmTimer);
  _bgmTimer = setTimeout(() => { _bgmTimer = null; _scheduleBgmIteration(nextWhen); }, scheduleIn);
}
function startBgm(){
  if(!AC || !bgmBuffer || musicMuted) return;
  stopBgm();
  if(AC.state==='suspended') AC.resume();
  _scheduleBgmIteration(AC.currentTime + 0.15);
}
function stopBgm(){
  if(_bgmTimer){ clearTimeout(_bgmTimer); _bgmTimer = null; }
  for(const n of _bgmNodes){
    try { n.gain.gain.cancelScheduledValues(0); } catch(e) {}
    try { n.src.stop(); } catch(e) {}
    n.src.disconnect(); n.gain.disconnect();
  }
  _bgmNodes = [];
}
function audioInit(){
  if(!AC){ try{ AC = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} }
  if(AC && AC.state==='suspended') AC.resume();
  if(!bgmBuffer && AC) loadBgm().then(()=>{ if(!musicMuted) startBgm(); });
  else if(!musicMuted && !_bgmNodes.length) startBgm();
}
function tone(f,d,type,g,slide,delay){
  if(muted || !AC) return;
  const o=AC.createOscillator(), v=AC.createGain(), t=AC.currentTime+(delay||0);
  o.type=type||'sine'; o.frequency.setValueAtTime(f,t);
  if(slide) o.frequency.exponentialRampToValueAtTime(f*slide, t+d);
  v.gain.setValueAtTime(g||.12,t); v.gain.exponentialRampToValueAtTime(.0001,t+d);
  o.connect(v); v.connect(AC.destination); o.start(t); o.stop(t+d);
}
const sDrop   = ()=>tone(150,.06,'square',.05);
const sMerge  = t=>{ tone(240*Math.pow(1.14,t),.16,'sine',.14,1.35); tone(480*Math.pow(1.14,t),.1,'triangle',.07,1.5,.03); };
const sClick  = ()=>{ tone(1500,.025,'square',.05); tone(650,.04,'square',.045,.7,.014); };
const sTick   = ()=>tone(1250,.015,'sine',.028);
const sUnsnap = ()=>tone(420,.05,'square',.035,.6);
const sHold   = ()=>{ tone(660,.06,'sine',.06,1.4); tone(990,.05,'sine',.04,1.3,.05); };
const sThud   = ()=>tone(190,.09,'sine',.06,.62);
const sWarpUp = ()=>tone(280,.14,'sine',.10,2.0);
const sGoal   = ()=>[659,880,1319].forEach((f,i)=>setTimeout(()=>tone(f,.14,'triangle',.1),i*70));
const sOver   = ()=>tone(320,.5,'sawtooth',.08,.4);
const sParty  = ()=>[523,659,784,1047].forEach((f,i)=>setTimeout(()=>tone(f,.18,'triangle',.12),i*90));

/* samples (Kenney interface sounds) */
const aDrop = new Audio('assets/sfx_drop.ogg');   aDrop.preload='auto'; aDrop.volume=.2;
const aBtn  = new Audio('assets/sfx_button.ogg');  aBtn.preload='auto'; aBtn.volume=.45;
function sfx(el){ if(muted) return; try{ const n=el.cloneNode(); n.volume=el.volume; n.play(); }catch(e){} }

/* ---------- Matter ---------- */
const { Engine, Bodies, Body, Composite, Events } = Matter;
const engine = Engine.create();
engine.gravity.scale = 0.003;    // gravidade 3× mais rápida — queda mais "juicy"
engine.positionIterations = 10;
engine.velocityIterations = 8;

Composite.add(engine.world, [
  Bodies.rectangle((INNER_L+INNER_R)/2, FLOOR_Y+34, INNER_W+200, 80, { isStatic:true }),  // chão mais grosso
  Bodies.rectangle(INNER_L-16, H/2, 32, H*2, { isStatic:true }),    // parede esquerda mais grossa
  Bodies.rectangle(INNER_R+16, H/2, 32, H*2, { isStatic:true }),    // parede direita mais grossa
  Bodies.rectangle((INNER_L+INNER_R)/2, H+20, INNER_W+300, 40, { isStatic:true })  // piso extra de segurança
]);

/* ---------- Estado ---------- */
let state = 'idle';   // 'idle' → tela inicial, 'play' → jogando
let pieces = [];
let cur = null, queue = [], stash = null, holdUsed = false;
let heldX = W/2, heldDrawX = W/2, heldSince = 0, nextAt = 0, drops = 0;
let score = 0, best = +(ST.get('best')||0);
let gems = +(ST.get('gems')||0);
let charsCollected = +(ST.get('chars')||0);   // peças especiais acumuladas (tier-7 merges)
let bestLevel = +(ST.get('bestLevel')||1);    // maior nível alcançado
let continueUsed = false;   // já usou o continue nesta partida?
let level = 1;              // nível atual (incrementa a cada tabuleiro limpo)
let combo = 0, lastMergeAt = -9e9;
let discovered = [true,true,false,false,false,false,false,false];
let goalTotal = 0, goalLeft = 0, goalDone = false;   // objetivo: mesclar todas as peças marcadas do castelo
let goalCelebUntil = 0;   // timestamp até quando mostrar a comemoração de tabuleiro limpo
let _lastGoalBonus = 0;   // bônus em pontos do último tabuleiro limpo (pra mostrar no overlay)
let dangerT = 0, usedShake = false;
let particles = [], popups = [], chars = [], rings = [], fxConf = [];
let pendingMerges = [];
const PANEL = { l:0.2315, t:0.193, w:0.537, h:0.616 };  // painel em % do stage (centrado)
let camShake = 0, timeScale = 1, targetTS = 1;
let gameClock = 0;   // tempo de simulação (soma dt por frame jogado): base do envelhecimento de perigo
let winDismissTimer = null;   // timer do modal de vitória

function randTier(){ const p = getSpawnPool(); return p[(Math.random()*p.length)|0]; }
const eob = q => 1 + 2.70158*Math.pow(q-1,3) + 1.70158*Math.pow(q-1,2);

function gridX(tier, x){
  const w = PIECES[tier].w;
  const kMax = (INNER_W-w)/GRID;
  const k = Math.max(0, Math.min(kMax, Math.round((x-INNER_L-w/2)/GRID)));
  return INNER_L + w/2 + k*GRID;
}
function xOverlap(l1,r1,l2,r2){ return Math.min(r1,r2)-Math.max(l1,l2); }

function spawnBody(tier, x, y, popIn){
  const p = PIECES[tier];
  const b = Bodies.rectangle(x, y, p.w, p.h-STUD, { friction:.6, restitution:.02 });
  b.plugin.tier = tier;
  b.plugin.born = performance.now();
  b.plugin.bornT = gameClock;
  b.plugin.restT = 0;
  if(popIn) b.plugin.pop = performance.now();
  Composite.add(engine.world, b);
  pieces.push(b);
  return b;
}
function removeBody(b){
  b.plugin.dead = true;
  Composite.remove(engine.world, b);
  pieces = pieces.filter(x=>x!==b);
}

/* ---------- Encaixe LEGO ---------- */
function supportTop(self, cx, w){   // superfície de apoio ABAIXO da peça em queda — nunca "sobe" pro topo passando por peças de cima
  let top = FLOOR_Y;
  const l = cx-w/2, r = cx+w/2;
  const refY = self ? self.position.y : -Infinity;
  for(const o of pieces){
    if(o===self || !o.plugin.snapped) continue;
    if(o.bounds.min.y <= refY) continue;   // ignora peças cujo topo está acima do centro da que cai (só apoia no que está embaixo)
    if(xOverlap(l,r,o.bounds.min.x,o.bounds.max.x) >= 8)
      top = Math.min(top, o.bounds.min.y);
  }
  return top;
}
function fits(self, cx, ny, w, bh){
  const l=cx-w/2+2, r=cx+w/2-2, t=ny-bh/2+2, bo=ny+bh/2-2;
  for(const o of pieces){
    if(o===self || o.plugin.dead || !o.plugin.snapped) continue;
    if(xOverlap(l,r,o.bounds.min.x,o.bounds.max.x)>0 &&
       Math.min(bo,o.bounds.max.y)-Math.max(t,o.bounds.min.y)>0) return false;
  }
  return true;
}
function restYInColumn(cx, w, bh, self, refY){   // onde a peça pousa caindo RETO a partir de refY: apoio mais alto que esteja abaixo de refY (a peça fixa logo abaixo, ou o chão) — não mergulha pra vãos sob peças nem sobe pra vãos acima
  let top = FLOOR_Y;
  const l = cx-w/2, r = cx+w/2;
  for(const o of pieces){
    if(o===self || o.plugin.dead || !o.plugin.snapped) continue;
    if(o.bounds.min.y <= refY) continue;   // ignora peças cujo topo está acima da referência (a peça em queda não passa por elas)
    if(xOverlap(l, r, o.bounds.min.x, o.bounds.max.x) >= 8) top = Math.min(top, o.bounds.min.y);
  }
  const ny = top - bh/2;                    // descansa no topo do apoio imediatamente abaixo
  return fits(self, cx, ny, w, bh) ? ny : null;
}
function nearestFit(tier, fromX, refY, self, maxDist){   // coluna mais próxima de fromX onde a peça pousa (caindo reto de refY) sem conflito
  const p = PIECES[tier], bh = p.h-STUD;
  let best = null, bestD = 1e9;
  const kMax = (INNER_W-p.w)/GRID;
  for(let k=0;k<=kMax;k++){
    const cx = INNER_L + p.w/2 + k*GRID;
    if(maxDist!=null && Math.abs(cx-fromX) > maxDist) continue;   // nada de vaga longe (evita teleporte)
    const ny = restYInColumn(cx, p.w, bh, self, refY);
    if(ny!=null){ const d = Math.abs(cx-fromX); if(d<bestD){ bestD=d; best={cx,ny}; } }
  }
  return best;
}
function forcePlace(b){   // failsafe: peça sem se posicionar há muito tempo → vaga próxima que caiba; sem vaga nos arredores, volta pro topo e cai de novo
  const p = PIECES[b.plugin.tier], bh = p.h-STUD;
  const nf = nearestFit(b.plugin.tier, b.position.x, b.position.y, b, GRID*4);   // só vagas perto (evita teleporte)
  if(!nf){
    // ── warp de volta pro topo com juice ──
    const tier = b.plugin.tier, color = PIECES[tier].color;
    // poof ring no ponto atual
    rings.push({x:b.position.x, y:b.position.y, w:p.w, h:bh, t0:performance.now()});
    // partículas da cor da peça + brancas
    burst(b.position.x, b.position.y, color, 18);
    burst(b.position.x, b.position.y, '#FFFFFF', 10);
    // 3 estrelinhas piscando no rastro
    for(let i=0;i<3;i++) particles.push({
      x:b.position.x+(Math.random()-.5)*p.w, y:b.position.y-(Math.random()-.5)*bh,
      vx:(Math.random()-.5)*4, vy:-4-Math.random()*6, life:.9, color:'#FFEE88',
      size:4+Math.random()*5, rot:0, vr:(Math.random()-.5)*.3
    });
    camShake = Math.max(camShake, 4);
    sWarpUp();
    // reposiciona no topo com animação de pop-in
    Body.setPosition(b, {x:gridX(tier, b.position.x), y:SPAWN_Y});
    Body.setVelocity(b, {x:0, y:3});
    Body.setAngle(b, 0); Body.setAngularVelocity(b, 0);
    b.isSensor = false; b.plugin.guided = undefined;
    b.plugin.aliveT = 0; b.plugin.restT = 0; b.plugin.releases = 0; b.plugin.pops = 0;
    b.plugin.pop = performance.now();   // animação de pop-in (scale-in)
    return;
  }
  const cx = nf.cx, ny = nf.ny;
  Body.setPosition(b, {x:cx, y:ny});
  Body.setAngle(b, 0); Body.setVelocity(b, {x:0,y:0}); Body.setAngularVelocity(b, 0);
  Body.setStatic(b, true);
  b.positionImpulse.x = 0; b.positionImpulse.y = 0;   // Matter aplica impulso residual até em corpo estático (postSolvePosition) — zera p/ peça não deslizar depois de encaixada
  b.isSensor = false;
  b.plugin.snapped = true; b.plugin.guided = undefined;
  b.plugin.releases = 0; b.plugin.pops = 0; b.plugin.aliveT = 0;
  b.plugin.land = performance.now();
  rings.push({x:cx, y:ny, w:p.w, h:bh, t0:performance.now()});
  camShake = Math.max(camShake, 2);
  sClick();
  adjacencyCheck(b);
}
function trySnap(b, tol){
  tol = tol || 26;
  const p = PIECES[b.plugin.tier], bh = p.h-STUD;
  let cx = 0, ny = 0, ok = false, bestD = 1e9;
  const anchorTop = supportTop(b, b.position.x, p.w);   // topo do apoio diretamente sob a peça solta = "ponto zero" (a peça conectada abaixo dela, ou o chão)
  for(const off of [0,-1,1,-2,2]){                 // vaga mais próxima de b.x (sem viés p/ direita)
    const tx = gridX(b.plugin.tier, b.position.x + off*GRID);
    const top = supportTop(b, tx, p.w);
    if(top > anchorTop + 2) continue;              // nunca descansar MAIS BAIXO que a peça de baixo — encaixa SOBRE ela, não escorrega pra coluna vizinha/chão
    const ty = top - bh/2;
    if(Math.abs(ty-b.position.y) > tol || Math.abs(tx-b.position.x) > p.w/2+GRID*0.8) continue;
    if(fits(b, tx, ty, p.w, bh)){ const d = Math.abs(tx-b.position.x); if(d<bestD){ bestD=d; cx=tx; ny=ty; ok=true; } }
  }
  // Se nenhuma vaga próxima couber → procura só nos arredores (±4 pinos)
  if(!ok){
    const nf = nearestFit(b.plugin.tier, b.position.x, b.position.y, b, GRID*4);
    if(nf){ cx = nf.cx; ny = nf.ny; ok = true; }
  }
  // Sem vaga nos arredores: não força encaixe nem teleporta — deixa a física agir;
  // se passar o tempo sem se posicionar, o failsafe (forcePlace) manda pro topo
  if(!ok){
    if(b.isStatic) Body.setStatic(b, false);
    b.plugin.snapped = false;
    b.plugin.restT = 0;
    return;
  }
  // Trava: nunca encaixar abaixo do chão
  if(ny + bh/2 > FLOOR_Y) ny = FLOOR_Y - bh/2;
  // Arredonda p/ evitar imprecisão de floating point no encaixe
  cx = Math.round(cx); ny = Math.round(ny);
  const quiet = b.plugin.unsnapAt && performance.now()-b.plugin.unsnapAt < 900 &&
                Math.abs(cx-b.plugin.prevX) < 5 && Math.abs(ny-b.plugin.prevY) < 8;
  Body.setPosition(b, {x:cx, y:ny});
  Body.setAngle(b, 0);
  Body.setVelocity(b, {x:0, y:0});
  Body.setAngularVelocity(b, 0);
  Body.setStatic(b, true);
  b.positionImpulse.x = 0; b.positionImpulse.y = 0;   // idem forcePlace: sem isso o resíduo do solver arrasta a peça estática p/ fora da área
  b.plugin.snapped = true;
  b.plugin.unsnapAt = 0;
  b.plugin.guided = undefined;
  b.plugin.releases = 0; b.plugin.pops = 0; b.plugin.aliveT = 0;
  if(!quiet){
    b.plugin.land = performance.now();
    rings.push({x:cx, y:ny, w:p.w, h:bh, t0:performance.now()});
    for(const s of [-1,1]) for(let i=0;i<3;i++) particles.push({
      x:cx+s*p.w/2, y:ny+bh/2, vx:s*(1+Math.random()*2), vy:-Math.random()*1.5,
      life:.6, color:'#DDE7EF', size:2+Math.random()*3, rot:0, vr:0
    });
    camShake = Math.max(camShake, 1.4);
    sClick();
  }
  adjacencyCheck(b);
}
function adjacencyCheck(b){
  for(const o of pieces){
    if(o===b || o.plugin.dead || !o.plugin.snapped || o.plugin.tier!==b.plugin.tier) continue;
    if(b.plugin.initial && o.plugin.initial) continue;   // peças iniciais não mergem entre si
    if(xOverlap(b.bounds.min.x-7,b.bounds.max.x+7,o.bounds.min.x,o.bounds.max.x)>0 &&
       Math.min(b.bounds.max.y+7,o.bounds.max.y)-Math.max(b.bounds.min.y-7,o.bounds.min.y)>0){
      pendingMerges.push([b,o]); break;
    }
  }
}
function compact(){
  const snapped = pieces.filter(b=>b.plugin.snapped).sort((a,b)=>b.bounds.max.y-a.bounds.max.y);
  for(const b of snapped){
    if(b.plugin.dead) continue;
    const p = PIECES[b.plugin.tier], bh = p.h-STUD;
    let top = FLOOR_Y;
    for(const o of pieces){
      if(o===b || o.plugin.dead || !o.plugin.snapped) continue;
      if(o.bounds.min.y >= b.bounds.max.y-2 &&
         xOverlap(b.bounds.min.x,b.bounds.max.x,o.bounds.min.x,o.bounds.max.x) >= 10)
        top = Math.min(top, o.bounds.min.y);
    }
    const ny = top - bh/2;
    if(ny - b.position.y > 0.5){
      let blocked = false;
      for(const o of pieces){
        if(o===b || o.plugin.dead || o.plugin.snapped) continue;
        if(xOverlap(b.bounds.min.x+2,b.bounds.max.x-2,o.bounds.min.x,o.bounds.max.x)>0 &&
           o.bounds.max.y > b.bounds.max.y-2 && o.bounds.min.y < top+2){ blocked = true; break; }
      }
      if(!blocked){
        Body.setPosition(b, {x:b.position.x, y:ny});
        adjacencyCheck(b);
      }
    }
  }
}
/* ---------- Micro explosão em sobreposições ---------- */
// Detecta peças snapped sobrepostas e aplica uma micro explosão
// que empurra as peças ao redor, usando física p/ reposicionar.
let lastMicroBurst = 0;
function microBurst(now){
  if(now - lastMicroBurst < 800) return;  // cooldown: não explode todo frame

  for(const b of pieces){
    if(!b.plugin.snapped || b.plugin.dead) continue;
    for(const o of pieces){
      if(o===b || o.plugin.dead || !o.plugin.snapped) continue;
      const xOv = xOverlap(b.bounds.min.x, b.bounds.max.x, o.bounds.min.x, o.bounds.max.x);
      if(xOv <= 3) continue;
      const yOv = Math.min(b.bounds.max.y, o.bounds.max.y) - Math.max(b.bounds.min.y, o.bounds.min.y);
      if(yOv <= 3) continue;

      // Micro explosão no ponto médio da sobreposição
      const mx = (b.position.x + o.position.x) / 2;
      const my = (b.position.y + o.position.y) / 2;

      // Dessolta as duas peças e peças próximas
      for(const p of pieces){
        if(p.plugin.dead || !p.plugin.snapped) continue;
        const dist = Math.hypot(p.position.x - mx, p.position.y - my);
        if(dist < 120){
          unsnap(p);
          const force = (1 - dist/120) * 10;
          const angle = Math.atan2(p.position.y - my, p.position.x - mx);
          Body.setVelocity(p, {
            x: Math.cos(angle) * force + (Math.random()-.5)*4,
            y: Math.sin(angle) * force - 4 - Math.random()*3
          });
        }
      }

      // Efeito visual
      burst(mx, my, '#FF8833', 12);
      camShake = Math.max(camShake, 3);
      sUnsnap();
      lastMicroBurst = now;
      return;  // uma explosão por frame
    }
  }
}

function unstick(dt){
  for(const b of pieces){
    if(b.plugin.snapped || b.plugin.dead) continue;
    if(Math.abs(Math.sin(b.angle*2)) > .25){ b.plugin.stuckT = 0; continue; }
    let pen = null;
    for(const o of pieces){
      if(o===b || o.plugin.dead || !o.plugin.snapped) continue;
      if(xOverlap(b.bounds.min.x,b.bounds.max.x,o.bounds.min.x,o.bounds.max.x) > 4 &&
         Math.min(b.bounds.max.y,o.bounds.max.y)-Math.max(b.bounds.min.y,o.bounds.min.y) > 4){ pen = o; break; }
    }
    if(!pen){ b.plugin.stuckT = 0; continue; }
    b.plugin.stuckT = (b.plugin.stuckT||0)+dt;
    if(b.plugin.stuckT > 250){
      b.plugin.stuckT = 0;
      b.plugin.pops = (b.plugin.pops||0)+1;
      if(b.plugin.pops > 5){ unsnap(pen, 3); b.plugin.pops = 0; }
      else {
        b.plugin.guided = undefined;
        const dir = Math.sign(b.position.x-pen.position.x) || (b.position.x<(INNER_L+INNER_R)/2?-1:1);
        Body.setVelocity(b, {x:dir*(3+Math.random()*2), y:-6-Math.random()*2});
        burst(b.position.x, b.position.y, '#FFFFFF', 8);
      }
    }
  }
}
function popRoom(nb){
  let cx = 0, n = 0;
  for(const o of pieces){
    if(o===nb || o.plugin.dead || !o.plugin.snapped) continue;
    if(xOverlap(nb.bounds.min.x,nb.bounds.max.x,o.bounds.min.x,o.bounds.max.x) > 4 &&
       Math.min(nb.bounds.max.y,o.bounds.max.y)-Math.max(nb.bounds.min.y,o.bounds.min.y) > 4){
      cx += o.position.x; n++;
    }
  }
  if(!n) return;
  const dir = Math.sign(nb.position.x - cx/n) || (nb.position.x < (INNER_L+INNER_R)/2 ? -1 : 1);
  Body.setVelocity(nb, {x:dir*(2.5+Math.random()*2), y:-7-Math.random()*3});
  Body.setAngularVelocity(nb, dir*.1);
  for(const o of pieces){
    if(o===nb || o.plugin.dead || o.plugin.snapped) continue;
    const d = Math.hypot(o.position.x-nb.position.x, o.position.y-nb.position.y);
    if(d < 120){
      const ux=(o.position.x-nb.position.x)/(d||1), uy=(o.position.y-nb.position.y)/(d||1);
      Body.setVelocity(o, {x:o.velocity.x+ux*4, y:o.velocity.y+uy*4-3});
    }
  }
  camShake = Math.max(camShake, 5);
  burst(nb.position.x, nb.position.y, '#FFFFFF', 14);
  sUnsnap();
}
function unsnap(b, nudge){
  if(!b.plugin.snapped) return;
  Body.setStatic(b, false);
  b.plugin.snapped = false;
  b.plugin.restT = 0;
  b.plugin.aliveT = 0;
  b.plugin.limboT = 0;
  b.plugin.stuckT = 0;
  b.plugin.unsnapAt = performance.now();
  b.plugin.prevX = b.position.x; b.plugin.prevY = b.position.y;
  if(nudge) Body.setVelocity(b, {x:(Math.random()-.5)*nudge, y:-Math.random()*nudge*.6});
}
function supportCascade(){
  let changed = true, any = false;
  while(changed){
    changed = false;
    for(const b of pieces){
      if(!b.plugin.snapped) continue;
      const bot = b.bounds.max.y;
      if(bot >= FLOOR_Y-6) continue;
      let ok = false;
      for(const o of pieces){
        if(o===b || !o.plugin.snapped) continue;
        if(o.bounds.min.y > bot-4 && o.bounds.min.y < bot+12 &&
           xOverlap(b.bounds.min.x,b.bounds.max.x,o.bounds.min.x,o.bounds.max.x) >= 10){ ok = true; break; }
      }
      if(!ok){ unsnap(b, 1.2); changed = true; any = true; }
    }
  }
  if(any) sUnsnap();
}

/* ---------- Fusões ---------- */
function doMerge(a,b){
  if(state!=='play') return;
  const t = a.plugin && a.plugin.tier;
  if(!t || !b.plugin || b.plugin.tier!==t) return;
  if(a.plugin.dead || b.plugin.dead) return;
  const mx=(a.position.x+b.position.x)/2, my=(a.position.y+b.position.y)/2;
  removeBody(a); removeBody(b);

  const now = performance.now();
  combo = (gameClock-lastMergeAt < MERGE_WINDOW) ? combo+1 : 1;
  lastMergeAt = gameClock;
  const mult = Math.min(1+(combo-1)*.5, 4);
  // Peças iniciais (marcadas) valem 100%; spawnadas valem 50% — incentiva focar no objetivo
  const scoreMul = (a.plugin.initial || b.plugin.initial) ? 1 : 0.5;
  // Pontos caem conforme o objetivo diminui — pressiona a limpar o tabuleiro
  const goalMul = goalTotal > 0 ? 0.2 + 0.8 * (goalLeft / goalTotal) : 1;

  if(t === MAX_TIER){
    addScore(Math.round(CELEBRATE_PTS*mult*scoreMul*goalMul), mx, my);
    celebrate(mx, my);
  } else {
    const nt = t+1, np = PIECES[nt], nbh = np.h-STUD;
    const bot = Math.min(Math.max(a.bounds.max.y, b.bounds.max.y), FLOOR_Y);
    const ny0 = bot-nbh/2, base = gridX(nt, mx);
    let nx = base, ny = ny0, ok = fits(null, base, ny0, np.w, nbh);
    if(!ok){                                    // base ocupada: só a vizinha IMEDIATA mais próxima (±1 pino)
      let bestD = 1e9;
      for(const off of [-1,1]){
        const tx = gridX(nt, base + off*GRID);
        if(tx!==base && fits(null, tx, ny0, np.w, nbh)){ const d = Math.abs(tx-mx); if(d<bestD){ bestD=d; nx=tx; ok=true; } }
      }
    }
    if(!ok){                                    // sem vaga imediata: vaga mais próxima nos arredores (±4 pinos), apoiada logo abaixo do ponto do merge
      const nf = nearestFit(nt, mx, ny0, null, GRID*4);
      if(nf){ nx = nf.cx; ny = nf.ny; ok = true; }
    }
    if(!ok){                                    // nada nos arredores: nasce solta no ponto do merge; física acomoda, e se o tempo passar o failsafe manda pro topo
      nx = Math.max(INNER_L+np.w/2, Math.min(INNER_R-np.w/2, mx));
      ny = ny0;
    }
    const nb = spawnBody(nt, nx, ny, true);
    Body.setVelocity(nb, {x:0, y:-1.5});
    setTimeout(() => { if(!nb.plugin.dead) popRoom(nb); }, NEXT_DELAY);
    discovered[nt] = true;
    addScore(Math.round(PIECES[nt].pts*mult*scoreMul*goalMul), mx, my);
    burst(mx, my, PIECES[nt].color, 16);
    camShake = Math.max(camShake, 3);
    sMerge(nt);
  }
  if(combo>1){
    const cc = [
      {fill:'#FFE88C', stroke:'#B87613'},  // ×2 dourado claro
      {fill:'#FFCC2F', stroke:'#B8860B'},  // ×3 amarelo ouro
      {fill:'#FF9F40', stroke:'#C04000'},  // ×4 laranja
      {fill:'#FF6B6B', stroke:'#B02030'},  // ×5 vermelho
      {fill:'#FF4FA3', stroke:'#9B1060'},  // ×6 rosa
      {fill:'#E040FB', stroke:'#6B1080'},  // ×7+ roxo
    ];
    const ci = Math.min(combo-2, 5);
    const sz = 28 + Math.min(combo, 8) * 3.5;
    spawnPopText({x:mx, y:my-46, text:'×'+combo, kind:'combo', life:1.6 + combo*0.06,
      size:sz, color:cc[ci].fill, stroke:cc[ci].stroke,
      vx:(Math.random()<.5?-1:1)*(2.5 + Math.random()*2.5 + combo*.5),
      vy:-8 - Math.min(combo,8)*.8, vr:(Math.random()-.5)*.03});
    if(combo>=3) burstFx(mx, my-30, cc[ci].fill, 8 + combo*3);
    if(combo>=5){ camShake = Math.max(camShake, combo*0.7); targetTS = Math.max(.3, .9 - combo*.08); setTimeout(()=>{ targetTS = 1; }, 300); }
  }
  checkGoal();
  supportCascade();
}
function processMerges(){
  while(pendingMerges.length){
    const [a,b] = pendingMerges.shift();
    doMerge(a,b);
  }
}
Events.on(engine,'collisionStart', onCollide);
Events.on(engine,'collisionActive', onCollide);
function onCollide(e){
  for(const pair of e.pairs){
    const a=pair.bodyA, b=pair.bodyB;
    if(a.plugin && b.plugin && a.plugin.tier && a.plugin.tier===b.plugin.tier && !a.plugin.dead && !b.plugin.dead){
      if(a.plugin.initial && b.plugin.initial) continue;   // peças iniciais não mergem entre si
      if(a.isSensor || b.isSensor) continue;                // não mescla durante queda guiada — só após encaixar
      pendingMerges.push([a,b]);
    }
  }
}

function addScore(pts, x, y){
  if(pts<=0) return;
  score += pts; syncScore();
  spawnPopText({x, y:y-20, text:'+'+pts, kind:'score', size:22, color:'#FFFFFF',
    vx:(Math.random()-.5)*9, vy:-6 - Math.random()*3});
  if(score>best){ best=score; ST.set('best', best); }
}
function spawnPopText(o){   // texto que explode no ponto da ação, cai e quica nas peças/chão do painel
  popups.push(Object.assign({life:1.3, bounces:0, rot:(Math.random()-.5)*.2,
    vr:(Math.random()-.5)*.016, grav:.34, t0:performance.now()}, o));
}
function pileTopAt(x, hw){   // topo da pilha encaixada sob a faixa [x-hw, x+hw] (ou o chão do painel)
  let top = FLOOR_Y;
  for(const b of pieces){
    if(b.plugin.dead || !b.plugin.snapped) continue;
    if(b.bounds.max.x > x-hw && b.bounds.min.x < x+hw) top = Math.min(top, b.bounds.min.y);
  }
  return top;
}
function burst(x,y,color,n){
  for(let i=0;i<n;i++) particles.push({
    x, y, vx:(Math.random()-.5)*7, vy:-2-Math.random()*5,
    life:1, color, size:3+Math.random()*4, rot:Math.random()*6, vr:(Math.random()-.5)*.4
  });
}
function burstFx(x,y,color,n){   // confete da comemoração: vive na camada FX (sem recorte, voa pra fora)
  for(let i=0;i<n;i++) fxConf.push({
    x, y, vx:(Math.random()-.5)*17, vy:-7-Math.random()*15,
    life:1, color, size:4+Math.random()*8, rot:Math.random()*6, vr:(Math.random()-.5)*.5
  });
}
function celebrate(x,y){
  const c = 'char_'+'abcde'[(Math.random()*5)|0];
  chars.push({img:c, x, y:y-20, vx:(Math.random()-.5)*6, vy:-22, rot:0, vr:(Math.random()-.5)*.3, y0:y, bounces:0, squashT:0});
  for(let i=0;i<100;i++) burstFx(x+(Math.random()-.5)*120, y+(Math.random()-.5)*50, CONFETTI[i%6], 1);
  discovered[MAX_TIER] = true;
  gems += 50; charsCollected++;
  ST.set('gems', gems);
  ST.set('chars', charsCollected);
  syncScore();
  camShake = Math.max(camShake, 8);
  targetTS = .42;
  setTimeout(()=>{ targetTS = 1; }, 620);
  sParty();
  SDK.happytime();
}

/* ---------- Objetivo: mesclar todas as peças marcadas do castelo ---------- */
function countMarked(){ let n = 0; for(const b of pieces) if(b.plugin.initial && !b.plugin.dead) n++; return n; }
function resetGoal(){ goalTotal = countMarked(); goalLeft = goalTotal; goalDone = false; buildGoalTray(); }
function checkGoal(){
  if(goalDone) return;
  const left = countMarked();
  if(left !== goalLeft){ goalLeft = left; syncGoal(); }
  if(goalLeft === 0 && goalTotal > 0){
    goalDone = true;
    gems += 50; ST.set('gems', gems);
    const bonus = Math.max(100, Math.round(score * 0.2));  // bônus de 20% do score, mín 100
    score += bonus; _lastGoalBonus = bonus;
    if(score>best){ best=score; ST.set('best', best); }
    syncScore();
    const now = performance.now();
    goalCelebUntil = now + 5000;   // 5 segundos de comemoração
    // Efeito dramático: slow-motion + tremor
    targetTS = .35; camShake = Math.max(camShake, 10);
    setTimeout(()=>{ targetTS = 1; }, 800);
    // Primeira onda de confete
    for(let i=0;i<150;i++) burstFx(W/2+(Math.random()-.5)*300, DANGER_Y+140+(Math.random()-.5)*60, CONFETTI[i%6], 1);
    // Segunda onda de confete com atraso
    setTimeout(()=>{
      for(let i=0;i<100;i++) burstFx(W/2+(Math.random()-.5)*320, DANGER_Y+120+(Math.random()-.5)*80, CONFETTI[i%6], 1);
    }, 400);
    // Terceira onda
    setTimeout(()=>{
      for(let i=0;i<80;i++) burstFx(W/2+(Math.random()-.5)*340, DANGER_Y+130+(Math.random()-.5)*70, CONFETTI[i%6], 1);
    }, 900);
    sGoal();
    showWinOverlay();
  }
}
function nextBoard(){   // novo castelo de peças marcadas — score e gemas ficam
  for(const b of [...pieces]) removeBody(b);
  pendingMerges = [];
  level++;
  if(level > bestLevel){ bestLevel = level; ST.set('bestLevel', bestLevel); }
  if($('lvlNum')) $('lvlNum').textContent = level;
  setupInitialBoard();
  animateInitialBoard();
  resetGoal();
}

/* ---------- HUD ---------- */
const $ = id=>document.getElementById(id);
function imgSrc(t){ return 'assets/'+PIECES[t].img+'.png'; }
let _prevScore = 0, _prevChars = 0;
function bustPill(el, cls){ if(!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
function syncScore(){
  $('score').textContent = score.toLocaleString('pt-BR');
  if(score !== _prevScore){ bustPill($('score').parentElement, 'bust'); _prevScore = score; }
  if($('charsCount')){
    $('charsCount').textContent = charsCollected.toLocaleString('pt-BR');
    if(charsCollected !== _prevChars){ bustPill($('charsCount').parentElement, 'bust-char'); _prevChars = charsCollected; }
  }
}
function markedByTier(){
  const per = [0,0,0,0,0,0,0,0];
  for(const b of pieces) if(b.plugin.initial && !b.plugin.dead) per[b.plugin.tier]++;
  return per;
}
let goalSlots = [];   // barra inferior: sprite da peça + badge com quantas marcadas faltam daquele tipo
function buildGoalTray(){
  const tray = $('tray'); tray.innerHTML = '';
  goalSlots = [];
  const per = markedByTier();
  let idx = 0;
  for(let t=1; t<=MAX_TIER; t++){
    if(!per[t]) continue;
    const slot = document.createElement('div'); slot.className = 'gslot';
    const delay = (0.35 + idx*0.09).toFixed(2)+'s';
    slot.style.animationDelay = delay;
    const im = document.createElement('img'); im.src = imgSrc(t);
    im.style.animationDelay = delay;
    const bd = document.createElement('b'); bd.textContent = per[t];
    slot.appendChild(im); slot.appendChild(bd); tray.appendChild(slot);
    goalSlots.push({tier:t, slot, bd});
    idx++;
  }
}
function syncGoal(){
  const per = markedByTier();
  for(const s of goalSlots){
    const n = per[s.tier];
    const wasDone = s.slot.classList.contains('done');
    s.bd.textContent = n>0 ? n : '✓';
    s.slot.classList.toggle('done', n===0);
    // Acabou de completar → re-trigger animação + faíscas
    if(!wasDone && n===0){
      // Re-aplica a classe pra re-disparar a animação CSS
      s.slot.classList.remove('done');
      void s.slot.offsetWidth;   // força reflow
      s.slot.classList.add('done');
      // Faíscas verdes na região da bandeja (centro inferior do canvas)
      const tx = W/2 + (Math.random()-.5)*80;
      const ty = FLOOR_Y + 30;
      for(let i=0;i<14;i++) fxConf.push({
        x:tx+(Math.random()-.5)*40, y:ty-Math.random()*20,
        vx:(Math.random()-.5)*8, vy:-4-Math.random()*8,
        life:.8, color:i%2?'#37c463':'#FFEE88',
        size:3+Math.random()*5, rot:Math.random()*6, vr:(Math.random()-.5)*.5
      });
      sTick();
    }
  }
}

/* ---------- Fila / HOLD ---------- */
function refillQueue(){ while(queue.length < 3) queue.push(randTier()); }
function takeNext(){ const t = queue.shift(); refillQueue(); return t; }   // fila é desenhada no topo do painel (drawScene)
function newCurrent(){
  cur = takeNext();
  holdUsed = false;
  heldX = gridX(cur, heldDrawX);
  heldSince = performance.now();
}
function doHold(){
  if(!cur || holdUsed || state!=='play') return;
  if(stash===null){ stash = cur; cur = takeNext(); }
  else { const t = cur; cur = stash; stash = t; }
  holdUsed = true;
  heldX = gridX(cur, heldDrawX);
  heldSince = performance.now();
  sHold();
}

/* ---------- Input ---------- */
const stage = document.getElementById('stage');
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const fxCanvas = document.getElementById('fx');
const fctx = fxCanvas.getContext('2d');

function gameX(e){
  const r = canvas.getBoundingClientRect();
  return (e.clientX - r.left) * W / r.width;
}
function setHeldX(x){
  if(!cur) return;
  const nx = gridX(cur, x);
  if(nx!==heldX){ heldX = nx; sTick(); }
}
canvas.addEventListener('pointermove', e=>{ setHeldX(gameX(e)); });
canvas.addEventListener('pointerdown', e=>{
  audioInit();
  if(state==='paused'){ resume(); return; }
  if(state==='play') setHeldX(gameX(e));
});
canvas.addEventListener('pointerup', e=>{
  if(state!=='play' || !cur) return;
  setHeldX(gameX(e));
  dropCur();
});
window.addEventListener('keydown', e=>{
  if(state!=='play') return;
  if(e.key==='ArrowLeft')  setHeldX(heldX-GRID);
  if(e.key==='ArrowRight') setHeldX(heldX+GRID);
  if(e.key===' '||e.key==='Enter'){ e.preventDefault(); if(cur) dropCur(); }
});
function dropCur(){
  const b = spawnBody(cur, heldX, SPAWN_Y);
  b.plugin.guided = heldX;
  b.isSensor = true;
  Body.setVelocity(b, {x:0, y:6});   // impulso inicial pra baixo — queda mais rápida e satisfatória
  cur = null; drops++;
  nextAt = performance.now()+NEXT_DELAY;
  sfx(aDrop);
}

/* ---------- Overlays ---------- */
const overlay = $('overlay');
function showOverlay(html){ overlay.classList.remove('hiding'); overlay.innerHTML = '<div class="card2">'+html+'</div>'; overlay.style.display='flex'; }
function hideOverlay(){
  overlay.classList.add('hiding');
  setTimeout(()=>{ overlay.style.display='none'; overlay.classList.remove('hiding'); }, 350);
}

function doContinue(){
  if(!continueUsed && charsCollected >= 5 && state==='over'){
    charsCollected -= 5;
    ST.set('chars', charsCollected);
    syncScore();

    // Remove as 3 camadas do topo da pilha
    const snapped = pieces.filter(b=>b.plugin.snapped && !b.plugin.dead);
    snapped.sort((a,b)=>a.bounds.min.y - b.bounds.min.y);  // mais alto primeiro
    const layers = [];
    for(const b of snapped){
      let placed = false;
      for(const layer of layers){
        if(Math.abs(b.bounds.min.y - layer[0].bounds.min.y) < 24){ layer.push(b); placed = true; break; }
      }
      if(!placed) layers.push([b]);
    }
    const toRemove = layers.slice(0, 5).flat();
    for(const b of toRemove){
      const p = PIECES[b.plugin.tier];
      burst(b.position.x, b.position.y, p.color, 18);
      burst(b.position.x, b.position.y, '#FFFFFF', 12);
      rings.push({x:b.position.x, y:b.position.y, w:p.w, h:p.h-STUD, t0:performance.now()});
      removeBody(b);
    }

    dangerT = 0; continueUsed = true;
    camShake = Math.max(camShake, 6); targetTS = .55;
    setTimeout(()=>{ targetTS = 1; }, 500);
    sWarpUp();

    hideOverlay(); state = 'play'; setPauseIcon('ico-pause');
    SDK.gameplayStart();
  }
}
function doGameOver(){
  if(state!=='play') return;
  TD.lastOver = {score, dangerT:Math.round(dangerT), charsCollected,
    pecas: pieces.map(b=>({t:b.plugin.tier, x:Math.round(b.position.x), y:Math.round(b.position.y), minY:Math.round(b.bounds.min.y), snap:!!b.plugin.snapped}))};
  state = 'over'; SDK.gameplayStop(); sOver(); camShake = 6;
  const rec = score>=best && score>0;
  const canContinue = !continueUsed && charsCollected >= 5;
  const chars = ['a','b','c','d'];
  overlay.innerHTML =
    '<div class="pause-wrap">'+
      '<div class="pause-card">'+
        '<h1>'+(rec?T('newRecord'):T('gameOver'))+'</h1>'+
        (rec?'<div class="go-record">🏆 '+best.toLocaleString('pt-BR')+' '+T('pts')+'</div>':'')+
        '<div class="go-score">'+score.toLocaleString('pt-BR')+'</div>'+
        '<div class="go-stats">'+
          '<span class="go-stat"><svg class="ico-svg filled"><use href="#ico-star"/></svg> '+best.toLocaleString('pt-BR')+'</span>'+
          '<span class="go-stat"><img src="assets/char_a.png" class="go-char" alt=""> '+charsCollected.toLocaleString('pt-BR')+'</span>'+
        '</div>'+
        '<div class="btn-row">'+
          (canContinue?'<button class="btn continue-btn" id="continueBtn"><img src="assets/char_a.png" class="btn-char" alt=""> '+T('continue')+' -5</button>':'')+
          '<button class="btn play-btn" id="againBtn"><svg class="ico-svg"><use href="#ico-restart"/></svg> '+T('playAgain')+'</button>'+
        '</div>'+
      '</div>'+
      chars.map((c,i)=>'<span class="pause-char pc'+(i+1)+'"><img src="assets/char_'+c+'.png" alt=""></span>').join('')+
    '</div>';
  overlay.classList.remove('hiding');
  overlay.style.display='flex';
  if(canContinue) $('continueBtn').addEventListener('click', doContinue);
  $('againBtn').addEventListener('click', ()=>{ SDK.midgame(restart); });
}
function pause(){
  if(state!=='play' || goalDone) return;  // não pausa durante celebração de vitória
  state = 'paused';
  setPauseIcon('ico-play');
  const sndLabel = muted ? T('sfxOff') : T('sfxOn');
  const musLabel = musicMuted ? T('musicOff') : T('musicOn');
  const chars = ['a','b','c','d'];
  overlay.innerHTML =
    '<div class="pause-wrap">'+
      '<div class="pause-card">'+
        '<h1>'+T('paused')+'</h1>'+
        '<div class="btn-row">'+
          '<button class="btn play-btn" id="resumeBtn"><svg class="ico-svg"><use href="#ico-play"/></svg> '+T('resume')+'</button>'+
          '<button class="btn restart-btn" id="restartBtn"><svg class="ico-svg"><use href="#ico-restart"/></svg> '+T('restart')+'</button>'+
          '<button class="btn sound-btn" id="muteSfxBtn"><svg class="ico-svg"><use href="#'+(muted?'ico-speaker-mute':'ico-speaker')+'"/></svg> '+sndLabel+'</button>'+
          '<button class="btn music-btn" id="muteMusicBtn"><svg class="ico-svg"><use href="#ico-music"/></svg> '+musLabel+'</button>'+
        '</div>'+
        '<div class="tips">'+T('tips')+'</div>'+
      '</div>'+
      chars.map((c,i)=>'<span class="pause-char pc'+(i+1)+'"><img src="assets/char_'+c+'.png" alt=""></span>').join('')+
    '</div>';
  overlay.classList.remove('hiding');
  overlay.style.display='flex';
  $('resumeBtn').addEventListener('click', resume);
  $('muteSfxBtn').addEventListener('click', ()=>{
    muted=!muted; ST.set('mute', muted?'1':'0');
    const label = muted ? T('sfxOff') : T('sfxOn');
    const icon = muted ? 'ico-speaker-mute' : 'ico-speaker';
    $('muteSfxBtn').innerHTML = '<svg class="ico-svg"><use href="#'+icon+'"/></svg> '+label;
  });
  $('muteMusicBtn').addEventListener('click', ()=>{
    musicMuted=!musicMuted; ST.set('musicMute', musicMuted?'1':'0');
    const label = musicMuted ? T('musicOff') : T('musicOn');
    $('muteMusicBtn').innerHTML = '<svg class="ico-svg"><use href="#ico-music"/></svg> '+label;
    if(musicMuted) stopBgm();
    else startBgm();
  });
  $('restartBtn').addEventListener('click', ()=>{ hideOverlay(); restart(); });
}
function resume(){ if(state==='paused'){ hideOverlay(); state='play'; setPauseIcon('ico-pause'); } }
function setPauseIcon(id){ const u=$('pauseBtn').querySelector('use'); if(u) u.setAttribute('href','#'+id); }
function showWinOverlay(){
  if(state!=='play') return;
  const chars = ['a','b','d','e'];
  overlay.innerHTML =
    '<div class="win-wrap">'+
      '<div class="win-card">'+
        '<h1>'+T('congrats')+'</h1>'+
        '<div class="wsub">'+T('boardClear')+'</div>'+
        '<div class="wscore">'+score.toLocaleString('pt-BR')+'</div>'+
        '<div class="wbonus">+'+_lastGoalBonus.toLocaleString('pt-BR')+' '+T('bonus')+'</div>'+
        '<div class="whint">'+T('tapCont')+'</div>'+
      '</div>'+
      chars.map((c,i)=>'<span class="win-char wc'+(i+1)+'"><img src="assets/char_'+c+'.png" alt=""></span>').join('')+
    '</div>';
  overlay.classList.remove('hiding');
  overlay.style.display='flex';
  let dismissed = false;
  const dismiss = ()=>{
    if(dismissed) return;
    dismissed = true;
    overlay.onclick = null;
    // Anima a saída, depois avança
    overlay.classList.add('hiding');
    setTimeout(()=>{
      overlay.style.display='none';
      overlay.classList.remove('hiding');
      if(state!=='over') nextBoard();
    }, 350);
  };
  overlay.onclick = (e)=>{
    if(e.target === overlay || e.target.closest('.win-wrap')) dismiss();
  };
}
function restart(){
  for(const b of [...pieces]) removeBody(b);
  particles=[]; popups=[]; chars=[]; rings=[]; fxConf=[]; pendingMerges=[];
  score=0; _prevScore=0; combo=0; drops=0; dangerT=0; continueUsed=false; level=1; usedShake=false; camShake=0; targetTS=1; timeScale=1; gameClock=0; goalCelebUntil=0;
  if($('lvlNum')) $('lvlNum').textContent = '1';
  if(winDismissTimer){ clearTimeout(winDismissTimer); winDismissTimer = null; }
  stash=null; holdUsed=false;
  discovered = [true,true,false,false,false,false,false,false];
  queue = []; refillQueue(); newCurrent();
  heldDrawX = heldX;
  syncScore();
  setupInitialBoard();
  resetGoal();
  hideOverlay(); state = 'play'; setPauseIcon('ico-pause'); SDK.gameplayStart();
  animateInitialBoard();
}
document.addEventListener('visibilitychange', ()=>{ if(document.hidden && !goalDone) pause(); });

document.addEventListener('pointerdown', e=>{   // clique em qualquer botão do layout
  if(e.target.closest('button')){ audioInit(); sfx(aBtn); }
}, true);
$('pauseBtn').addEventListener('click', ()=>{ if(state==='paused') resume(); else pause(); });
$('shakeBtn').addEventListener('click', ()=>{
  if(usedShake || state!=='play') return;
  shake(); usedShake = true;
});
function shake(){
  for(const b of pieces){
    unsnap(b);
    Body.setVelocity(b, {x:(Math.random()-.5)*11, y:-6-Math.random()*5});
    Body.setAngularVelocity(b, (Math.random()-.5)*.35);
  }
  camShake = 10;
  burst(W/2, FLOOR_Y-140, '#FFFFFF', 24);
  sUnsnap(); setTimeout(sUnsnap, 60);
}

/* ---------- Perigo / game over ---------- */
function dangerCheck(dt){
  let hot = false, warn = false;
  for(const b of pieces){
    if(!b.plugin.snapped) continue;
    if(b.bounds.min.y < DANGER_Y+90) warn = true;
    if(b.bounds.min.y < DANGER_Y && gameClock-b.plugin.bornT>1800) hot = true;
  }
  dangerT = hot ? dangerT+dt : Math.max(0, dangerT-dt*2);
  if(dangerT > 1400){
    const culpado = pieces.find(b=>b.plugin.snapped && b.bounds.min.y < DANGER_Y);
    if(culpado) doGameOver(); else dangerT = 0;
  }
  return warn;
}

/* ---------- Render ---------- */
function tile(img, x, y, s){ ctx.drawImage(IMGS[img], x, y, s, s); }

function drawBase(){   // base de terra: blocos dirt_top alinhados ao grid
  const topY = FLOOR_Y;
  for(let lx=INNER_L; lx<INNER_R; lx+=64)                           // 7 blocos dirt_top alinhados ao grid
    ctx.drawImage(IMGS.dirt_top, lx, topY-10, 66, 66);
}

function drawSpark(c, x, y, s, a, color){   // estrelinha de 4 pontas
  c.save(); c.translate(x, y); c.globalAlpha = a; c.fillStyle = color || '#FFFFFF';
  c.beginPath(); c.moveTo(0,-s);
  c.quadraticCurveTo(s*.18,-s*.18, s,0); c.quadraticCurveTo(s*.18,s*.18, 0,s);
  c.quadraticCurveTo(-s*.18,s*.18, -s,0); c.quadraticCurveTo(-s*.18,-s*.18, 0,-s);
  c.closePath(); c.fill(); c.restore();
}
function blisterPath(c, w, bh){   // contorno da peça COM os pinos (coords locais do drawPiece), cantos arredondados
  const L=-w/2, R=w/2, T=-bh, n=Math.round(w/GRID), sw=19.5, sh=STUD, r=4, r2=2.6;
  c.beginPath();
  c.moveTo(L, -r);
  c.lineTo(L, T+r); c.arcTo(L, T, L+r, T, r);
  for(let k=0;k<n;k++){   // sobe e desce cada pino (medido dos sprites: 19.5px a cada 32)
    const a=L+16+k*GRID-sw/2, b2=a+sw;
    c.lineTo(a-r2, T); c.arcTo(a, T, a, T-r2, r2);
    c.lineTo(a, T-sh+r2); c.arcTo(a, T-sh, a+r2, T-sh, r2);
    c.lineTo(b2-r2, T-sh); c.arcTo(b2, T-sh, b2, T-sh+r2, r2);
    c.lineTo(b2, T-r2); c.arcTo(b2, T, b2+r2, T, r2);
  }
  c.lineTo(R-r, T); c.arcTo(R, T, R, T+r, r);
  c.lineTo(R, -r); c.arcTo(R, 0, R-r, 0, r);
  c.lineTo(L+r, 0); c.arcTo(L, 0, L, -r, r);
  c.closePath();
}
function drawPiece(b, now){
  const p = PIECES[b.plugin.tier], bh = p.h-STUD;
  let sx = 1, sy = 1;
  if(b.plugin.land){
    const t = now-b.plugin.land;
    if(t<240){ const q=t/240, e=Math.sin(q*Math.PI)*(1-q); sx=1+0.16*e; sy=1-0.24*e; }
  }
  let flash = 0;
  if(b.plugin.pop){
    const t = now-b.plugin.pop;
    if(t<280){ const q=t/280; const s=Math.max(0, eob(q)); sx*=s; sy*=s; if(!b.plugin.initial) flash=Math.max(0,.5*(1-t/110)); }
    else b.plugin.pop = 0;
  }
  ctx.save();
  ctx.translate(b.position.x, b.position.y);
  ctx.rotate(b.angle);
  ctx.translate(0, bh/2);
  ctx.scale(sx, sy);
  ctx.drawImage(IMGS[p.img], -p.w/2, -p.h, p.w, p.h);
  if(flash>0){
    ctx.globalAlpha = flash;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.roundRect(-p.w/2, -p.h, p.w, p.h, 4); ctx.fill();
    ctx.globalAlpha = 1;
  }
  // Peças iniciais: embaladas em plástico (blister moldado, com os pinos) — mesclar "liberta" o brinquedo
  if(b.plugin.initial && !b.plugin.pop){
    ctx.save();
    blisterPath(ctx, p.w, bh);
    ctx.clip();   // tudo abaixo pinta a peça INTEIRA, pinos inclusos — sem pixel de fora
    const g = ctx.createLinearGradient(-p.w/2, -p.h, p.w/2, 0);   // varredura diagonal do plástico
    g.addColorStop(0,'rgba(255,255,255,.32)'); g.addColorStop(.32,'rgba(255,255,255,.07)');
    g.addColorStop(.52,'rgba(255,255,255,.26)'); g.addColorStop(.72,'rgba(255,255,255,.05)');
    g.addColorStop(1,'rgba(255,255,255,.15)');
    ctx.fillStyle = g; ctx.fillRect(-p.w/2, -p.h, p.w, p.h);
    const rg = ctx.createRadialGradient(-p.w/2+6, -bh+5, 0, -p.w/2+6, -bh+5, Math.min(26, p.w*.5));   // bolha de luz
    rg.addColorStop(0,'rgba(255,255,255,.28)'); rg.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle = rg; ctx.fillRect(-p.w/2, -p.h, p.w, p.h);
    ctx.fillStyle = 'rgba(255,255,255,.32)';   // brilho no topo de cada pino
    for(let k=0;k<Math.round(p.w/GRID);k++){
      ctx.beginPath(); ctx.ellipse(-p.w/2+16+k*GRID, -p.h+2.1, 7, 1.6, 0, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();
    ctx.lineJoin = 'round';
    blisterPath(ctx, p.w, bh);   // parede do plástico contornando corpo + pinos
    ctx.lineWidth = Math.min(2.4, bh*.15); ctx.strokeStyle = 'rgba(205,235,255,.45)'; ctx.stroke();
    ctx.lineWidth = .9; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.stroke();   // fio de luz
    const tw = .5+.5*Math.sin(now/650 + b.position.x*.13 + b.position.y*.09);   // cintila defasado por peça
    const ss = Math.min(6, bh*.32);
    // Peça branca (tier 5): dourado forte p/ contrastar; outras: branco ↔ dourado suave
    const sparkColor = b.plugin.tier === 5 ? '#FFD54A' :
      'rgb(255,'+Math.round(255-16*(tw*tw*(3-2*tw)))+','+Math.round(255-70*(tw*tw*(3-2*tw)))+')';
    drawSpark(ctx, p.w/2 - ss - 2.5, -bh + ss + 2.5, ss*(.6+.5*tw), .3+.65*tw, sparkColor);
  }
  ctx.restore();
}

function drawScene(warn, now){
  ctx.clearRect(0,0,W,H);
  ctx.save();
  const cr = 30;   // raio só nos cantos superiores — base reta
ctx.beginPath();
ctx.moveTo(0, H);
ctx.lineTo(0, cr);
ctx.arcTo(0, 0, cr, 0, cr);
ctx.lineTo(W - cr, 0);
ctx.arcTo(W, 0, W, cr, cr);
ctx.lineTo(W, H);
ctx.closePath();
ctx.clip();

  const dx = (Math.random()-.5)*2*camShake, dy = (Math.random()-.5)*2*camShake;
  ctx.save();
  ctx.translate(dx, dy);

  drawBase();

  for(const b of [...pieces].sort((a,b)=>b.position.y-a.position.y)) drawPiece(b, now);

  // rings movidos pro renderFX (sem recorte)

  if(cur && state==='play'){
    const p = PIECES[cur], bh = p.h-STUD;
    heldDrawX += (heldX-heldDrawX)*.45;
    const bob = Math.sin(now/280)*3;
    let top = FLOOR_Y;
    for(const b of pieces)
      if(b.plugin.snapped && xOverlap(heldX-p.w/2, heldX+p.w/2, b.bounds.min.x, b.bounds.max.x) >= 8)
        top = Math.min(top, b.bounds.min.y);
    const gy = top - bh/2;

    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.5;
    ctx.setLineDash([3,9]);
    ctx.beginPath(); ctx.moveTo(heldDrawX, SPAWN_Y+bob+p.h/2+4); ctx.lineTo(heldDrawX, gy-bh/2-4); ctx.stroke();
    ctx.setLineDash([]);

    ctx.globalAlpha = .3;
    ctx.drawImage(IMGS[p.img], heldX-p.w/2, gy+bh/2-p.h, p.w, p.h);
    ctx.globalAlpha = .55;
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(heldX-p.w/2, gy-bh/2, p.w, bh, 3); ctx.stroke();
    ctx.globalAlpha = 1;

    let hs = 1;
    if(now-heldSince<200) hs = Math.max(.5,.5+.5*eob((now-heldSince)/200));
    ctx.save();
    ctx.translate(heldDrawX, SPAWN_Y+bob);
    ctx.scale(hs,hs);
    ctx.drawImage(IMGS[p.img], -p.w/2, -p.h/2, p.w, p.h);
    ctx.restore();
  }

  if(warn && state==='play'){
    ctx.strokeStyle = 'rgba(255,88,89,'+(0.45+0.4*Math.sin(now/130))+')';
    ctx.lineWidth = 3; ctx.setLineDash([8,8]);
    ctx.beginPath(); ctx.moveTo(INNER_L, DANGER_Y); ctx.lineTo(INNER_R, DANGER_Y); ctx.stroke();
    ctx.setLineDash([]);
  }

  for(const p of particles){
    ctx.save();
    ctx.globalAlpha = Math.max(0,p.life);
    ctx.translate(p.x,p.y); ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size);
    ctx.restore();
  }
  // popups (combo/pontos/objetivo) são desenhados na camada FX, sem recorte — ver renderFX

  if(drops===0 && state==='play'){
    ctx.font = '800 20px -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    ctx.fillText(lang==='en'?'drag and drop':'arraste e solte', W/2, 300+Math.sin(now/300)*4);
    ctx.font = '600 15px -apple-system, sans-serif';
    ctx.fillText(T('subtitle'), W/2, 326+Math.sin(now/300)*4);
  }

  // Próximas peças da fila — pílula no topo do painel
  if(queue.length && state==='play'){
    ctx.save();
    ctx.globalAlpha = .92;
    ctx.fillStyle = 'rgba(23,74,138,.55)';
    ctx.beginPath(); ctx.roundRect(W/2-88, 22, 176, 64, 16); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.font = '400 12px "Lilita One", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.fillText(T('next'), W/2, 38);
    [queue[0], queue[1]].forEach((t,i)=>{
      if(!t) return;
      const p = PIECES[t];
      const s = Math.min(30/p.h, 62/p.w, 1.1);   // altura uniforme na pílula, peças largas encolhem
      ctx.globalAlpha = i===0 ? 1 : .55;
      ctx.drawImage(IMGS[p.img], W/2 + (i===0?-40:40) - p.w*s/2, 66 - p.h*s/2, p.w*s, p.h*s);
    });
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  ctx.restore();
  ctx.restore();
}

/* ---------- Loop ---------- */
let last = performance.now();
function frame(now){
  const dt = Math.min(34, now-last); last = now;
  let warn = false;
  if(state==='play'){
    gameClock += dt;
    timeScale += (targetTS-timeScale)*.15;
    Engine.update(engine, (1000/60)*timeScale);
    for(const b of pieces){
      if(b.plugin.snapped || b.plugin.dead || b.plugin.guided===undefined) continue;
      const p = PIECES[b.plugin.tier], bh = p.h-STUD;
      Body.setPosition(b, {x:b.plugin.guided, y:b.position.y});
      Body.setVelocity(b, {x:0, y:b.velocity.y});
      if(b.angle!==0){ Body.setAngle(b, 0); Body.setAngularVelocity(b, 0); }
      let top = FLOOR_Y;
      for(const o of pieces){
        if(o===b || o.plugin.dead || !o.plugin.snapped) continue;
        if(xOverlap(b.plugin.guided-p.w/2, b.plugin.guided+p.w/2, o.bounds.min.x, o.bounds.max.x) >= 8)
          top = Math.min(top, o.bounds.min.y);
      }
      if(b.position.y + bh/2 >= top - 0.5){
        Body.setPosition(b, {x:b.plugin.guided, y:top-bh/2});
        Body.setVelocity(b, {x:0, y:0});
        b.isSensor = false; b.plugin.guided = undefined;
        trySnap(b);
      }
    }
    processMerges();

    for(const b of pieces){
      if(b.plugin.snapped) continue;
      if(b.plugin.guided===undefined){   // failsafe: não assentou em 3,5s → vaga próxima que caiba, senão manda pro topo
        b.plugin.aliveT = (b.plugin.aliveT||0)+dt;
        if(b.plugin.aliveT > 2500){ forcePlace(b); continue; }
      }
      const sp = Math.hypot(b.velocity.x, b.velocity.y);
      if(sp<.4 && Math.abs(b.angularVelocity)<.06) b.plugin.restT += dt; else b.plugin.restT = 0;
      if(b.plugin.restT > 110) trySnap(b);
      if(sp < .8) b.plugin.limboT = (b.plugin.limboT||0)+dt; else b.plugin.limboT = 0;
      if(!b.plugin.snapped && b.plugin.limboT > 1200){
        b.plugin.limboT = 0;
        trySnap(b, 44);
        if(!b.plugin.snapped){
          const steep = Math.abs(Math.sin(b.angle)) > .3;
          b.plugin.releases = b.plugin.releases||0;
          if(steep || b.plugin.releases >= 2){
            let lt = FLOOR_Y, rt = FLOOR_Y;
            for(const o of pieces){
              if(o===b || o.plugin.dead) continue;
              if(xOverlap(b.bounds.min.x-56,b.bounds.min.x,o.bounds.min.x,o.bounds.max.x)>0) lt=Math.min(lt,o.bounds.min.y);
              if(xOverlap(b.bounds.max.x,b.bounds.max.x+56,o.bounds.min.x,o.bounds.max.x)>0) rt=Math.min(rt,o.bounds.min.y);
            }
            const dir = lt>=rt ? -1 : 1;
            b.plugin.guided = undefined;
            Body.setVelocity(b, {x:dir*(3.5+Math.random()*2), y:-8-Math.random()*3});
            Body.setAngularVelocity(b, -Math.sign(b.angle||dir)*.12);
            burst(b.position.x, b.position.y, '#FFFFFF', 10);
          } else {
            b.plugin.releases++;
            let solto = false;
            for(const o of pieces){
              if(o===b || o.plugin.dead || !o.plugin.snapped) continue;
              if(xOverlap(b.bounds.min.x-4,b.bounds.max.x+4,o.bounds.min.x,o.bounds.max.x)>0 &&
                 Math.min(b.bounds.max.y+4,o.bounds.max.y)-Math.max(b.bounds.min.y-4,o.bounds.min.y)>0){
                unsnap(o, 2); solto = true;
              }
            }
            if(solto){ camShake = Math.max(camShake, 4); sUnsnap(); }
          }
        }
      }
    }
    processMerges();
    compact();
    unstick(dt);
    microBurst(now);  // micro explosões em sobreposições (usa física)

    // Reposiciona peças que saíram pelas laterais ou foram abaixo do chão
    for(const b of pieces){
      if(b.plugin.dead) continue;
      const p = PIECES[b.plugin.tier], bh = p.h-STUD;
      if(b.plugin.snapped){
        // peça encaixada também é validada: se foi arrastada p/ fora da área ou saiu do grid, re-encaixa
        if(b.position.y + bh/2 > FLOOR_Y + 1 ||
           b.position.x - p.w/2 < INNER_L - 3 || b.position.x + p.w/2 > INNER_R + 3 ||
           Math.abs(b.position.x - gridX(b.plugin.tier, b.position.x)) > 1){
          Body.setPosition(b, {x:gridX(b.plugin.tier, b.position.x), y:Math.min(b.position.y, FLOOR_Y - bh/2)});
          trySnap(b);
        }
        continue;
      }
      if(b.position.x < INNER_L-10 || b.position.x > INNER_R+10 ||
         b.position.y + bh/2 > FLOOR_Y + 10){
        // 1º tenta encaixar nos arredores
        Body.setPosition(b, {x:Math.max(INNER_L, Math.min(INNER_R, b.position.x)), y:FLOOR_Y - bh/2});
        trySnap(b);
        // Se não encaixou, manda pro topo com juice
        if(!b.plugin.snapped){
          // ── warp de volta pro topo ──
          const color = PIECES[b.plugin.tier].color;
          rings.push({x:b.position.x, y:b.position.y, w:p.w, h:bh, t0:performance.now()});
          burst(b.position.x, b.position.y, color, 14);
          burst(b.position.x, b.position.y, '#FFFFFF', 6);
          camShake = Math.max(camShake, 3);
          sWarpUp();
          const nx = INNER_L + 32 + Math.random()*(INNER_W-64);
          Body.setPosition(b, {x:nx, y:SPAWN_Y});
          Body.setVelocity(b, {x:(Math.random()-.5)*3, y:3});
          Body.setAngle(b, 0);
          Body.setAngularVelocity(b, 0);
          b.plugin.pop = performance.now();
        }
      }
    }

    if(!cur && now>=nextAt) newCurrent();
    warn = dangerCheck(dt);

    let pileTop = H;
    for(const b of pieces) if(b.plugin.snapped) pileTop = Math.min(pileTop, b.bounds.min.y);
    $('shakeBtn').classList.toggle('visible', !usedShake && pileTop < DANGER_Y+150);
  }

  for(const p of particles){ p.x+=p.vx; p.y+=p.vy; p.vy+=.25; p.rot+=p.vr; p.life-=dt/650; }
  particles = particles.filter(p=>p.life>0);
  for(const p of popups){
    if(p.vy===undefined){ p.y-=.7; p.life-=dt/900; continue; }   // 'info' continua só flutuando
    const px = p.x;
    p.x+=p.vx; p.rot+=p.vr;
    const m = p.size*.7, hw = p.size*.35, sink = p.size*.6;
    if((p.x<INNER_L+m && p.vx<0) || (p.x>INNER_R-m && p.vx>0)){ p.vx*=-.82; p.vr*=-.7; }   // paredes do painel
    let gy = pileTopAt(p.x, hw) - sink;   // chão local: topo das peças sob o texto (ou chão do painel)
    if(p.y > gy+2){   // o passo horizontal meteu o texto numa coluna mais alta?
      const gyOld = pileTopAt(px, hw) - sink;
      if(p.y <= gyOld+2){ p.x = px; p.vx*=-.82; p.vr*=-.7; gy = gyOld; }   // lateral de peça: rebate
    }
    if(p.grounded){
      p.vx*=.9; p.vr*=.9;   // rolando enquanto desvanece
      if(p.y < gy-2){ p.grounded=false; p.vy=0; }   // beirada/peça sumiu: volta a cair
      else p.y = gy;   // acompanha o chão local
    } else {
      p.y+=p.vy; p.vy+=p.grav;
      if(p.y<24 && p.vy<0) p.vy*=-.7;   // teto do painel
      if(p.vy>0 && p.y>=gy){   // tocou peça ou chão
        p.y=gy; p.landed=true; p.bounces++;
        if(p.vy<1.6){ p.vy=0; p.grounded=true; }   // quique já minúsculo: gruda e desliza
        else {
          p.vy=-p.vy*(.5+Math.random()*.12); p.vx*=.8; p.vr*=.65;
          if(p.kind==='combo') for(let i=0;i<6;i++) fxConf.push({x:p.x+(Math.random()-.5)*34, y:p.y+12,
            vx:(Math.random()-.5)*5, vy:-1-Math.random()*2.5, life:.6, color:p.color, size:2.5+Math.random()*3.5, rot:0, vr:(Math.random()-.5)*.3});
        }
      }
    }
    p.life-=dt/(p.landed?700:1800);   // some aos poucos junto com a ação — mais rápido depois do 1º toque
  }
  popups = popups.filter(p=>p.life>0 && p.y<H+340);
  // ═══ limites visíveis do fxCanvas em coords de jogo ═══
  // fxCanvas mapeia game→stage: offset=BASE_W*PANEL.l, scale=BASE_W*PANEL.w/W
  // Visível: x ∈ [-207, 687] (game coords); margem de segurança p/ sprites de 64px
  const VIS_L = -175, VIS_R = 655;

  for(const c of chars){       // arco pra fora do painel + quicadas na base (diminuindo)
    c.x+=c.vx; c.y+=c.vy; c.vy+=.30; c.rot+=c.vr;
    // Rebate nas bordas visíveis do fxCanvas (evita clipping em landscape)
    if(c.x < VIS_L) { c.x = VIS_L; c.vx = Math.abs(c.vx) * 0.55; c.vr = Math.abs(c.vr) * 0.6; }
    if(c.x > VIS_R) { c.x = VIS_R; c.vx = -Math.abs(c.vx) * 0.55; c.vr = -Math.abs(c.vr) * 0.6; }
    if(c.vy>0 && c.y>=c.y0 && c.bounces<2){
      c.y=c.y0; c.vy=-c.vy*0.5; c.vx*=0.7; c.vr*=0.55; c.bounces++;
      c.squashT=last;
      for(let i=0;i<8;i++) fxConf.push({x:c.x+(Math.random()-.5)*44, y:c.y0+26,
        vx:(Math.random()-.5)*6, vy:-1-Math.random()*3, life:.7, color:'#E4EAF2', size:3+Math.random()*4, rot:0, vr:(Math.random()-.5)*.3});
      sThud();
    }
  }
  chars = chars.filter(c=>c.y<H+320);
  for(const p of fxConf){
    p.x+=p.vx; p.y+=p.vy; p.vy+=.22; p.rot+=p.vr; p.life-=dt/1200;
    // Rebate nas bordas visíveis (evita clipping do confete em landscape)
    if(p.x < VIS_L) { p.x = VIS_L; p.vx = Math.abs(p.vx) * 0.45; }
    if(p.x > VIS_R) { p.x = VIS_R; p.vx = -Math.abs(p.vx) * 0.45; }
  }
  fxConf = fxConf.filter(p=>p.life>0 && p.y<H+260);
  camShake = Math.max(0, camShake-dt*.014);

  drawScene(warn, now);
  renderFX(now);
}
function renderFX(now){   // camada full-stage, sem recorte: comemoração, anéis E popups saem do painel
  fctx.setTransform(1,0,0,1,0,0);
  fctx.clearRect(0,0,fxCanvas.width,fxCanvas.height);
  if(!fxConf.length && !chars.length && !popups.length && !rings.length) return;
  const scx = BASE_W*PANEL.w/W, scy = BASE_H*PANEL.h/H;
  fctx.setTransform(scx,0,0,scy, BASE_W*PANEL.l, BASE_H*PANEL.t);  // desenha em coords do painel, sobre a cena toda
  for(const p of fxConf){
    fctx.save();
    fctx.globalAlpha = Math.max(0,p.life);
    fctx.translate(p.x,p.y); fctx.rotate(p.rot);
    fctx.fillStyle = p.color;
    fctx.fillRect(-p.size/2,-p.size/2,p.size,p.size);
    fctx.restore();
  }
  for(const c of chars){
    fctx.save();
    fctx.translate(c.x,c.y); fctx.rotate(c.rot);
    if(c.squashT){ const t=performance.now()-c.squashT; if(t<200){ const e=Math.sin((t/200)*Math.PI); fctx.scale(1+0.32*e, 1-0.32*e); } }
    fctx.drawImage(IMGS[c.img],-32,-32,64,64);
    fctx.restore();
  }
  // anéis de encaixe — expandem pra fora do painel sem corte
  for(const r of rings){
    const q = (now-r.t0)/260;
    if(q>=1) continue;
    fctx.globalAlpha = .7*(1-q);
    fctx.strokeStyle = '#FFFFFF'; fctx.lineWidth = 2.5;
    const g = 4+10*q;
    fctx.beginPath(); fctx.roundRect(r.x-r.w/2-g, r.y-r.h/2-g, r.w+g*2, r.h+g*2, 6); fctx.stroke();
    fctx.globalAlpha = 1;
  }
  rings = rings.filter(r=>now-r.t0<260);

  fctx.textAlign='center'; fctx.textBaseline='middle';
  for(const p of popups){
    const age = now-p.t0, q = Math.min(1,age/170), phys = p.vy!==undefined;
    const sc = phys ? 2.4-1.4*eob(q) : .5+.5*eob(q);   // físico: explode grande e assenta com overshoot
    fctx.save();
    fctx.globalAlpha = Math.max(0, Math.min(1, p.life*(phys?1.3:1.4)));
    fctx.translate(p.x, p.y);
    fctx.rotate(p.rot||0);
    fctx.scale(sc, sc);
    fctx.lineJoin = 'round';
    fctx.font = '400 '+p.size+'px "Lilita One", sans-serif';
    if(p.kind==='combo'){
      fctx.lineWidth = 6; fctx.strokeStyle = p.stroke||'rgba(14,30,55,.7)'; fctx.strokeText(p.text,0,0);
      fctx.lineWidth = 2.5; fctx.strokeStyle = 'rgba(255,255,255,.85)'; fctx.strokeText(p.text,0,0);
      fctx.fillStyle = p.color; fctx.fillText(p.text,0,0);
    } else if(p.kind==='info'){
      fctx.lineWidth = 5.5; fctx.strokeStyle = 'rgba(18,38,74,.9)'; fctx.strokeText(p.text,0,0);
      fctx.fillStyle = p.color; fctx.fillText(p.text,0,0);
    } else {
      fctx.lineWidth = 5; fctx.strokeStyle = 'rgba(18,38,74,.7)'; fctx.strokeText(p.text,0,0);
      fctx.lineWidth = 2; fctx.strokeStyle = 'rgba(255,255,255,.6)'; fctx.strokeText(p.text,0,0);
      fctx.fillStyle = p.color; fctx.fillText(p.text,0,0);
    }
    if(phys && age<90){ fctx.globalAlpha *= 1-age/90; fctx.fillStyle='#FFFFFF'; fctx.fillText(p.text,0,0); }   // clarão da explosão
    fctx.restore();
  }
  fctx.textBaseline = 'alphabetic';
}
function loop(now){ if(window.__freeze){ drawScene(false, now); renderFX(now); } else frame(now); requestAnimationFrame(loop); }

/* ---------- Resize ---------- */
function fit(){
  const s = innerHeight/BASE_H;   // altura soberana: portrait corta laterais; landscape centraliza a coluna
  const isLand = innerWidth/innerHeight > BASE_W/BASE_H;
  stage.classList.toggle('landscape', isLand);   // um fundo OU o outro
  document.body.classList.toggle('landscape', isLand);
  const sw = BASE_W*s, sh = BASE_H*s;
  stage.style.width = sw+'px'; stage.style.height = sh+'px';
  const su = (sw/100)+'px';
  stage.style.setProperty('--u', su);
  document.documentElement.style.setProperty('--u', su);
  const dpr = Math.min(2, window.devicePixelRatio||1);
  canvas.width = Math.round(W*dpr); canvas.height = Math.round(H*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  fxCanvas.width = BASE_W; fxCanvas.height = BASE_H;   // camada de comemoração cobre a cena inteira
  // Re-renderiza o frame estático se ainda estiver na tela inicial
  if(state==='idle'){ drawScene(false, performance.now()); renderFX(performance.now()); }
}
window.addEventListener('resize', fit);

/* ---------- Debug ---------- */
window.TD = {
  drop:(t,x,y)=>{ const b=spawnBody(t, x??W/2, y??SPAWN_Y); b.plugin.guided = gridX(t, x??W/2); b.isSensor = true; return b; },
  hold:doHold,
  state:()=>({state, score, best, gems, combo, charsN:chars.length, fxN:fxConf.length,
    popups:popups.map(p=>({t:p.text, x:Math.round(p.x), y:Math.round(p.y), vy:p.vy&&+p.vy.toFixed(1), b:p.bounces, life:+p.life.toFixed(2)})), char:chars[0]&&{y:Math.round(chars[0].y), vy:+chars[0].vy.toFixed(1), b:chars[0].bounces}, goalLeft, goalTotal, cur, stash, queue:[...queue],
    dangerT:Math.round(dangerT), pieces:pieces.length, snapped:pieces.filter(b=>b.plugin.snapped).length,
    pos:pieces.map(b=>({t:b.plugin.tier, x:Math.round(b.position.x), y:Math.round(b.position.y), snap:!!b.plugin.snapped})),
    discovered:[...discovered]}),
  over:doGameOver, shake, restart,
  pop:(x=W/2,y=430)=>{ addScore(77, x, y); spawnPopText({x, y:y-46, text:'×3', kind:'combo', life:1.6, size:38,
    color:'#FFCC2F', stroke:'#B8860B', vx:4, vy:-9.6, vr:.02}); },
  step:(n=60)=>{ for(let i=0;i<n;i++) frame(last+1000/60); }
};

/* ---------- Tabuleiro inicial ---------- */
// Três torres com peças de 2 e 4 pinos, espaçadas entre si.
// Pouquíssimas peças de 1 pino — só nas ameias.
function setupInitialBoard(){
  const halfY = FLOOR_Y - (FLOOR_Y - DANGER_Y) / 2;

  function place(tier, k){
    const p = PIECES[tier];
    if(k < 0 || k > (INNER_W - p.w) / GRID) return null;
    const cx = INNER_L + p.w / 2 + k * GRID;
    const bh = p.h - STUD;
    let top = FLOOR_Y;
    const l = cx - p.w / 2, r = cx + p.w / 2;
    for(const o of pieces){
      if(o.plugin.dead || !o.plugin.snapped) continue;
      if(xOverlap(l, r, o.bounds.min.x, o.bounds.max.x) >= 8)
        top = Math.min(top, o.bounds.min.y);
    }
    const ny = top - bh / 2;
    if(ny - bh / 2 < halfY) return null;
    if(!fits(null, cx, ny, p.w, bh)) return null;
    const b = spawnBody(tier, cx, ny, false);
    b.plugin.snapped = true;
    b.plugin.initial = true;
    Body.setStatic(b, true);
    return b;
  }

  // ═══ CASTELO ALEATÓRIO — dificuldade escala com o nível ═══
  let cols, minH, maxH, bases, mids, tops;
  if(level <= 5){
    cols = [0, 2, 4, 6, 8, 10];              // 6 colunas
    minH = 4; maxH = 9;
    bases = [5,5,4,4,4,3];
    mids  = [2,2,3,3,3,4,4,5,5];
    tops  = [1,1,2,2,2,3,3];
  } else if(level <= 10){
    cols = [0, 2, 3, 5, 6, 8, 9, 11, 12];   // 9 colunas densas
    minH = 7; maxH = 12;
    bases = [5,5,5,4,4,4,3,3];
    mids  = [3,3,4,4,4,5,5,5,5];             // tiers mais altos no meio
    tops  = [2,2,3,3,4,4,5];                 // tier 5 já no topo
  } else if(level <= 15){
    cols = [0,1,3,4,6,7,9,10,12,13,14];     // 11 colunas
    minH = 9; maxH = 14;
    bases = [5,5,5,4,4,4,3,3,6];            // tier 6 na base
    mids  = [3,3,4,4,5,5,5,5,6,6];          // tier 6 no meio
    tops  = [2,3,3,4,4,5,5,6];              // tier 6 no topo
  } else {
    cols = [0,1,2,3,5,6,7,8,10,11,12,13];  // 12 colunas contíguas
    minH = 10; maxH = 17;
    bases = [5,5,4,4,4,3,3,6,6];           // muitas pretas na base
    mids  = [4,4,5,5,5,6,6,6];              // domínio de tiers altos
    tops  = [3,3,4,4,5,5,6,6];              // topo pesado
  }

  for(const k of cols){
    const n = minH + (Math.random() * (maxH - minH + 1) | 0);
    if(!place(bases[Math.random() * bases.length | 0], k)) continue;
    for(let i = 1; i < n - 2; i++){
      if(!place(mids[Math.random() * mids.length | 0], k)) break;
    }
    for(let i = 0; i < 3; i++){
      if(!place(tops[Math.random() * tops.length | 0], k)) break;
    }
  }
}

function animateInitialBoard(){
  // Pega todas as peças iniciais, ordena de baixo pra cima
  // e dispara pop-in escalonado (efeito "brotando" do chão)
  const init = pieces.filter(b=>b.plugin.initial && !b.plugin.dead);
  if(!init.length) return;
  // Ordena por Y decrescente: peças mais baixas (maior Y) primeiro
  init.sort((a,b)=>b.position.y - a.position.y);
  const now = performance.now();
  // Agrupa por camada (peças com Y similar brotam juntas)
  const layers = [];
  let curLayer = [], curY = null;
  for(const b of init){
    if(curY===null || Math.abs(b.position.y-curY) < 20){
      curLayer.push(b);
    } else {
      layers.push(curLayer);
      curLayer = [b];
    }
    curY = b.position.y;
  }
  if(curLayer.length) layers.push(curLayer);
  // Atribui timestamps escalonados: ~90ms entre camadas
  layers.forEach((layer, i)=>{
    const t = now + 150 + i*90;   // 150ms de delay inicial + 90ms por camada
    for(const b of layer) b.plugin.pop = t;
  });
}

/* ---------- Boot ---------- */
SDK.init();
loadImages().then(()=>{
  // Esconde o loader com fade-out
  const loader = document.getElementById('loader');
  if(loader){ loader.classList.add('hiding'); setTimeout(()=>loader.remove(), 500); }
  fit();
  queue = []; refillQueue(); newCurrent(); heldDrawX = heldX;
  syncScore();
  syncHTML();  // traduz labels estáticos (start screen, controls, etc)
  // Popula stats na tela inicial
  if($('startBest')) $('startBest').textContent = best.toLocaleString('pt-BR');
  if($('startChars')) $('startChars').textContent = charsCollected.toLocaleString('pt-BR');
  if($('startBestLvl')) $('startBestLvl').textContent = bestLevel;
  setupInitialBoard();
  resetGoal();
  animateInitialBoard();
  // Loop já roda na tela inicial — peças animam no menu
  requestAnimationFrame(loop);
  // Inicia AudioContext e carrega BGM; toca assim que o buffer estiver pronto
  try { AC = new (window.AudioContext||window.webkitAudioContext)(); } catch(e) {}
  loadBgm().then(()=>{ startBgm(); });
  const startOverlay = document.getElementById('startOverlay');
  const playBtn = document.getElementById('playBtn');
  const langPt = document.getElementById('langPt');
  const langEn = document.getElementById('langEn');
  if(langPt) langPt.addEventListener('click', ()=>{ if(lang!=='pt') toggleLang(); });
  if(langEn) langEn.addEventListener('click', ()=>{ if(lang!=='en') toggleLang(); });
  playBtn.addEventListener('click', ()=>{
    audioInit();
    state = 'play';
    stage.classList.add('playing');
    startOverlay.classList.add('hiding');
    setTimeout(()=>{ startOverlay.remove(); }, 500);
    SDK.gameplayStart();
  });
}).catch(err=>{
  document.body.innerHTML = '<p style="color:#fff;text-align:center;margin-top:40vh">erro: '+err.message+'</p>';
});
