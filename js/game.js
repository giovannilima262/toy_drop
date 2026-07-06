'use strict';
/* Toy Drop — merge-física (estilo Suika) com Kenney Toy Brick Pack.
   Layout: cenário background.png; jogo encaixado no painel azul; HUD do mockup
   (barra superior, PRÓXIMA/HOLD à esquerda, OBJETIVO à direita, bandeja de coleção). */

const BASE_W = 1024, BASE_H = 1536;   // proporção do cenário (2:3), letterbox
const W = 480, H = 828;               // resolução lógica da área de jogo (casa com o painel 0.579)
const INNER_L = 16, INNER_W = 448, INNER_R = INNER_L + INNER_W;  // 28 pinos
const FLOOR_Y = 740;
const DANGER_Y = 210, SPAWN_Y = 150;
const STUD = 8;               // altura real do pino nos sprites
const GRID = 32;              // passo real do pino (t1 = 1 pino de 32px)
const MERGE_WINDOW = 1400;
const NEXT_DELAY = 500;
const SPAWN_POOL = [1,1,1,1,2,2,2,3,3];
const MAX_TIER = 7, CELEBRATE_PTS = 400;

const PIECES = [null,
  { img:'t1', w:32,  h:22, color:'#FF5859', pts:0  },
  { img:'t2', w:32,  h:36, color:'#FFCC2F', pts:2  },
  { img:'t3', w:64,  h:36, color:'#1695ED', pts:5  },
  { img:'t4', w:64,  h:64, color:'#56C46D', pts:10 },
  { img:'t5', w:128, h:36, color:'#ECECEC', pts:20 },
  { img:'t6', w:128, h:64, color:'#24242A', pts:40 },
  { img:'t7', w:192, h:64, color:'#FFB733', pts:80 }
];
const CONFETTI = ['#FF5859','#FFCC2F','#1695ED','#56C46D','#ECECEC','#FFB733'];

const OBJ_DEFS = [
  { label:'faça o bloco verde',  icon:4, kind:'tier',   tier:4, target:1 },
  { label:'funda 12 blocos',     icon:3, kind:'merges',         target:12 },
  { label:'faça o bloco branco', icon:5, kind:'tier',   tier:5, target:1 },
  { label:'faça um combo ×3',    icon:2, kind:'combo',          target:3 },
  { label:'faça o bloco preto',  icon:6, kind:'tier',   tier:6, target:1 },
  { label:'faça o dourado!',     icon:7, kind:'tier',   tier:7, target:1 }
];

/* ---------- Pontos de integração CrazyGames ---------- */
const SDK = {
  gameplayStart(){ /* window.CrazyGames?.SDK.game.gameplayStart() */ },
  gameplayStop(){  /* window.CrazyGames?.SDK.game.gameplayStop() */ },
  happytime(){     /* window.CrazyGames?.SDK.game.happytime() */ },
  midgame(cb){ fakeAd('interstitial', cb); },
  rewarded(cb){ fakeAd('rewarded', cb); }
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
let AC = null, muted = localStorage.getItem('toydrop_mute')==='1';
function audioInit(){
  if(!AC){ try{ AC = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} }
  if(AC && AC.state==='suspended') AC.resume();
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
const aDrop = new Audio('assets/sfx_drop.ogg');   aDrop.preload='auto'; aDrop.volume=.55;
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
let state = 'play';
let pieces = [];
let cur = null, queue = [], stash = null, holdUsed = false;
let heldX = W/2, heldDrawX = W/2, heldSince = 0, nextAt = 0, drops = 0;
let score = 0, best = +(localStorage.getItem('toydrop_best')||0);
let gems = +(localStorage.getItem('toydrop_gems')||0);
let combo = 0, lastMergeAt = -9e9;
let discovered = [true,true,false,false,false,false,false,false];
let objIdx = 0, objProg = 0;
let dangerT = 0, usedShake = false;
let particles = [], popups = [], chars = [], rings = [], fxConf = [];
let pendingMerges = [];
const PANEL = { l:0.2315, t:0.193, w:0.537, h:0.616 };  // painel em % do stage (centrado)
let camShake = 0, timeScale = 1, targetTS = 1;
let gameClock = 0;   // tempo de simulação (soma dt por frame jogado): base do envelhecimento de perigo

const randTier = ()=> SPAWN_POOL[(Math.random()*SPAWN_POOL.length)|0];
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
function supportTop(self, cx, w){
  let top = FLOOR_Y;
  const l = cx-w/2, r = cx+w/2;
  for(const o of pieces){
    if(o===self || !o.plugin.snapped) continue;
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
function columnTop(cx, w, self){   // altura do topo da pilha na coluna (independe de self.y)
  let top = FLOOR_Y;
  for(const o of pieces){
    if(o===self || o.plugin.dead || !o.plugin.snapped) continue;
    if(xOverlap(cx-w/2, cx+w/2, o.bounds.min.x, o.bounds.max.x) >= 8) top = Math.min(top, o.bounds.min.y);
  }
  return top;
}
function nearestFit(tier, fromX, self, maxDist){   // coluna que comporta a peça descansando, mais próxima de fromX (dentro de maxDist)
  const p = PIECES[tier], bh = p.h-STUD;
  let best = null, bestD = 1e9;
  const kMax = (INNER_W-p.w)/GRID;
  for(let k=0;k<=kMax;k++){
    const cx = INNER_L + p.w/2 + k*GRID;
    if(maxDist!=null && Math.abs(cx-fromX) > maxDist) continue;   // nada de vaga longe (evita teleporte)
    const ny = columnTop(cx, p.w, self) - bh/2;
    if(fits(self, cx, ny, p.w, bh)){ const d = Math.abs(cx-fromX); if(d<bestD){ bestD=d; best={cx,ny}; } }
  }
  return best;
}
function forcePlace(b){   // failsafe: peça sem se posicionar há muito tempo → vaga próxima que caiba; sem vaga nos arredores, volta pro topo e cai de novo
  const p = PIECES[b.plugin.tier], bh = p.h-STUD;
  const nf = nearestFit(b.plugin.tier, b.position.x, b, GRID*4);   // só vagas perto (evita teleporte)
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
  for(const off of [0,-1,1,-2,2]){                 // vaga mais próxima de b.x (sem viés p/ direita)
    const tx = gridX(b.plugin.tier, b.position.x + off*GRID);
    const top = supportTop(b, tx, p.w);
    const ty = top - bh/2;
    if(Math.abs(ty-b.position.y) > tol || Math.abs(tx-b.position.x) > p.w/2+GRID*0.8) continue;
    if(fits(b, tx, ty, p.w, bh)){ const d = Math.abs(tx-b.position.x); if(d<bestD){ bestD=d; cx=tx; ny=ty; ok=true; } }
  }
  // Se nenhuma vaga próxima couber → procura só nos arredores (±4 pinos)
  if(!ok){
    const nf = nearestFit(b.plugin.tier, b.position.x, b, GRID*4);
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

  if(t === MAX_TIER){
    addScore(Math.round(CELEBRATE_PTS*mult), mx, my);
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
    if(!ok){                                    // sem vaga imediata: vaga mais próxima nos arredores (±4 pinos), assentada no topo da coluna
      const nf = nearestFit(nt, mx, null, GRID*4);
      if(nf){ nx = nf.cx; ny = nf.ny; ok = true; }
    }
    if(!ok){                                    // nada nos arredores: nasce solta no ponto do merge; física acomoda, e se o tempo passar o failsafe manda pro topo
      nx = Math.max(INNER_L+np.w/2, Math.min(INNER_R-np.w/2, mx));
      ny = ny0;
    }
    const nb = spawnBody(nt, nx, ny, true);
    Body.setVelocity(nb, {x:0, y:-1.5});
    popRoom(nb);
    discovered[nt] = true; syncTray();
    addScore(Math.round(PIECES[nt].pts*mult), mx, my);
    burst(mx, my, PIECES[nt].color, 16);
    camShake = Math.max(camShake, 3);
    sMerge(nt);
  }
  if(combo>1){
    const cc = ['#FFD54A','#FFD54A','#FF9F40','#FF6B6B','#FF4FA3'];
    popups.push({x:mx, y:my-52, text:'COMBO ×'+combo, kind:'combo', life:1.15,
      size:24+Math.min(combo,5)*2.5, color:cc[Math.min(combo-2,4)], t0:now});
  }
  objBump('merges', 1);
  objBump('combo', combo);
  objBump('tier', t===MAX_TIER ? MAX_TIER : t+1);
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
      pendingMerges.push([a,b]);
    }
  }
}

function addScore(pts, x, y){
  if(pts<=0) return;
  score += pts; syncScore();
  popups.push({x, y:y-20, text:'+'+pts, kind:'score', life:1, size:17, color:'#FFFFFF', t0:performance.now()});
  if(score>best){ best=score; localStorage.setItem('toydrop_best', best); }
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
  discovered[MAX_TIER] = true; syncTray();
  gems += 50; localStorage.setItem('toydrop_gems', gems); syncScore();
  camShake = Math.max(camShake, 8);
  targetTS = .42;
  setTimeout(()=>{ targetTS = 1; }, 620);
  sParty();
  SDK.happytime();
}

/* ---------- Objetivos ---------- */
function objBump(kind, val){
  const d = OBJ_DEFS[objIdx];
  if(d.kind !== kind) return;
  if(kind==='merges') objProg++;
  else if(kind==='combo'){ if(val>=d.target) objProg = d.target; }
  else if(kind==='tier'){ if(val>=d.tier) objProg = d.target; }
  if(objProg >= d.target) objComplete();
  syncObj();
}
function objComplete(){
  gems += 25; localStorage.setItem('toydrop_gems', gems); syncScore();
  popups.push({x:W/2, y:DANGER_Y+70, text:'OBJETIVO!', kind:'info', life:1.2, size:26, color:'#7BE07B', t0:performance.now()});
  objIdx = (objIdx+1) % OBJ_DEFS.length;
  objProg = 0;
  sGoal();
}

/* ---------- HUD ---------- */
const $ = id=>document.getElementById(id);
function imgSrc(t){ return 'assets/'+PIECES[t].img+'.png'; }
function syncScore(){ $('score').textContent = score.toLocaleString('pt-BR'); $('gems').textContent = gems.toLocaleString('pt-BR'); }
function syncPreview(){ $('nx0').src = imgSrc(queue[0]); $('nx1').src = queue[1]?imgSrc(queue[1]):''; }
function syncHold(){
  const card = $('holdCard');
  if(stash){ card.classList.remove('empty'); $('holdImg').src = imgSrc(stash); $('holdImg').style.display=''; }
  else { card.classList.add('empty'); $('holdImg').style.display='none'; }
}
function syncObj(){
  const d = OBJ_DEFS[objIdx];
  $('objIco').src = imgSrc(d.icon);
  $('objN').textContent = objProg;
  $('objT').textContent = d.target;
}
let trayImgs = [];
function buildTray(){
  const tray = $('tray'); tray.innerHTML = '';
  trayImgs = PIECES.slice(1).map((p,i)=>{
    const im = document.createElement('img');
    im.src = imgSrc(i+1);
    tray.appendChild(im);
    return im;
  });
}
function syncTray(){ trayImgs.forEach((im,i)=>{ im.style.opacity = discovered[i+1] ? 1 : .28; }); }

/* ---------- Fila / HOLD ---------- */
function refillQueue(){ while(queue.length < 3) queue.push(randTier()); }
function takeNext(){ const t = queue.shift(); refillQueue(); syncPreview(); return t; }
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
  syncHold();
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
  if(e.key==='Shift' || e.key.toLowerCase()==='c'){ e.preventDefault(); doHold(); }
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
function showOverlay(html){ overlay.innerHTML = '<div class="card2">'+html+'</div>'; overlay.style.display='flex'; }
function hideOverlay(){ overlay.style.display='none'; }

function fakeAd(kind, cb){
  const prev = state; state = 'ad';
  let n = 2;
  showOverlay('<h1>anúncio simulado</h1><p>('+kind+' — aqui entra o SDK da CrazyGames)</p><div class="big" id="adCount">'+n+'</div>');
  const iv = setInterval(()=>{
    n--;
    if(n<=0){ clearInterval(iv); hideOverlay(); state = (prev==='ad')?'play':prev; cb && cb(); }
    else $('adCount').textContent = n;
  }, 1000);
}
function doGameOver(){
  if(state!=='play') return;
  TD.lastOver = {score, dangerT:Math.round(dangerT),
    pecas: pieces.map(b=>({t:b.plugin.tier, x:Math.round(b.position.x), y:Math.round(b.position.y), minY:Math.round(b.bounds.min.y), snap:!!b.plugin.snapped}))};
  state = 'over'; SDK.gameplayStop(); sOver(); camShake = 6;
  const rec = score>=best && score>0;
  showOverlay('<h1>'+(rec?'novo recorde!':'fim de jogo')+'</h1>'+
    '<div class="big">'+score.toLocaleString('pt-BR')+'</div>'+
    '<p>recorde '+best.toLocaleString('pt-BR')+' · 💎 '+gems.toLocaleString('pt-BR')+'</p>'+
    '<button class="btn" id="againBtn">jogar de novo</button>'+
    '<div class="adnote">interstitial da CrazyGames entra antes do restart</div>');
  $('againBtn').addEventListener('click', ()=> SDK.midgame(restart));
}
function pause(){
  if(state!=='play') return;
  state = 'paused';
  showOverlay('<h1>pausado</h1><button class="btn" id="resumeBtn">continuar</button>');
  $('resumeBtn').addEventListener('click', resume);
}
function resume(){ if(state==='paused'){ hideOverlay(); state='play'; } }
function settings(){
  if(state!=='play' && state!=='paused') return;
  const wasPlay = state==='play'; if(wasPlay) state='paused';
  showOverlay('<h1>ajustes</h1>'+
    '<p>arraste para mirar · solte para largar<br>toque em HOLD para guardar a peça</p>'+
    '<div class="row"><button class="btn alt" id="muteBtn">'+(muted?'🔇 som off':'🔊 som on')+'</button>'+
    '<button class="btn" id="resumeBtn2">voltar</button></div>'+
    '<button class="btn alt" id="restartBtn" style="margin-top:var(--u)">reiniciar</button>');
  $('muteBtn').addEventListener('click', ()=>{
    muted=!muted; localStorage.setItem('toydrop_mute', muted?'1':'0');
    $('muteBtn').textContent = muted?'🔇 som off':'🔊 som on';
  });
  $('resumeBtn2').addEventListener('click', ()=>{ hideOverlay(); state = wasPlay?'play':'paused'; if(!wasPlay) pause(); });
  $('restartBtn').addEventListener('click', ()=>{ hideOverlay(); restart(); });
}
function restart(){
  for(const b of [...pieces]) removeBody(b);
  particles=[]; popups=[]; chars=[]; rings=[]; fxConf=[]; pendingMerges=[];
  score=0; combo=0; drops=0; dangerT=0; usedShake=false; camShake=0; targetTS=1; timeScale=1; gameClock=0;
  objIdx=0; objProg=0; stash=null; holdUsed=false;
  discovered = [true,true,false,false,false,false,false,false];
  queue = []; refillQueue(); newCurrent();
  heldDrawX = heldX;
  syncScore(); syncPreview(); syncHold(); syncObj(); syncTray();
  setupInitialBoard();
  hideOverlay(); state = 'play'; SDK.gameplayStart();
}
document.addEventListener('visibilitychange', ()=>{ if(document.hidden) pause(); });

document.addEventListener('pointerdown', e=>{   // clique em qualquer botão do layout
  if(e.target.closest('button, #holdCard')){ audioInit(); sfx(aBtn); }
}, true);
$('gearBtn').addEventListener('click', settings);
$('pauseBtn').addEventListener('click', ()=>{ if(state==='paused') resume(); else pause(); });
$('holdCard').addEventListener('click', doHold);
$('gemPlus').addEventListener('click', ()=>{
  popups.push({x:W/2, y:DANGER_Y+40, text:'loja em breve', kind:'info', life:1, size:20, color:'#FFFFFF', t0:performance.now()});
});
$('shakeBtn').addEventListener('click', ()=>{
  if(usedShake || state!=='play') return;
  SDK.rewarded(()=>{ shake(); usedShake=true; });
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
    if(t<280){ const q=t/280; const s=Math.max(.45,.45+.55*eob(q)); sx*=s; sy*=s; flash=Math.max(0,.5*(1-t/110)); }
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
  // Peças iniciais: retângulo arredondado central
  if(b.plugin.initial){
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.beginPath(); ctx.roundRect(-5, -p.h/2 + 1, 10, 6, 2.5); ctx.fill();
  }
  ctx.restore();
}

function drawScene(warn, now){
  ctx.clearRect(0,0,W,H);
  ctx.save();
  ctx.beginPath(); ctx.roundRect(1,1,W-2,H-2,30); ctx.clip();   // recorta no formato do painel

  const dx = (Math.random()-.5)*2*camShake, dy = (Math.random()-.5)*2*camShake;
  ctx.save();
  ctx.translate(dx, dy);

  drawBase();

  for(const b of [...pieces].sort((a,b)=>b.position.y-a.position.y)) drawPiece(b, now);

  for(const r of rings){
    const q = (now-r.t0)/260;
    if(q>=1) continue;
    ctx.globalAlpha = .7*(1-q);
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2.5;
    const g = 4+10*q;
    ctx.beginPath(); ctx.roundRect(r.x-r.w/2-g, r.y-r.h/2-g, r.w+g*2, r.h+g*2, 6); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  rings = rings.filter(r=>now-r.t0<260);

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
    const va = .05+.06*Math.sin(now/130)+.14*(dangerT/1400);
    ctx.fillStyle = 'rgba(255,60,60,'+Math.max(0,va)+')';
    ctx.fillRect(0,0,W,120);
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
    ctx.fillText('arraste e solte', W/2, 300+Math.sin(now/300)*4);
    ctx.font = '600 15px -apple-system, sans-serif';
    ctx.fillText('junte blocos iguais!', W/2, 326+Math.sin(now/300)*4);
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
        if(b.plugin.aliveT > 3500){ forcePlace(b); continue; }
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
    $('shakeBtn').style.display = (!usedShake && pileTop < DANGER_Y+150) ? 'block' : 'none';
  }

  for(const p of particles){ p.x+=p.vx; p.y+=p.vy; p.vy+=.25; p.rot+=p.vr; p.life-=dt/650; }
  particles = particles.filter(p=>p.life>0);
  for(const p of popups){ p.y-=.7; p.life-=dt/900; }
  popups = popups.filter(p=>p.life>0);
  for(const c of chars){       // arco pra fora do painel + quicadas na base (diminuindo)
    c.x+=c.vx; c.y+=c.vy; c.vy+=.30; c.rot+=c.vr;
    if(c.vy>0 && c.y>=c.y0 && c.bounces<2){
      c.y=c.y0; c.vy=-c.vy*0.5; c.vx*=0.7; c.vr*=0.55; c.bounces++;
      c.squashT=last;
      for(let i=0;i<8;i++) fxConf.push({x:c.x+(Math.random()-.5)*44, y:c.y0+26,
        vx:(Math.random()-.5)*6, vy:-1-Math.random()*3, life:.7, color:'#E4EAF2', size:3+Math.random()*4, rot:0, vr:(Math.random()-.5)*.3});
      sThud();
    }
  }
  chars = chars.filter(c=>c.y<H+320);
  for(const p of fxConf){ p.x+=p.vx; p.y+=p.vy; p.vy+=.22; p.rot+=p.vr; p.life-=dt/1200; }
  fxConf = fxConf.filter(p=>p.life>0 && p.y<H+260);
  camShake = Math.max(0, camShake-dt*.014);

  drawScene(warn, now);
  renderFX(now);
}
function renderFX(now){   // camada full-stage, sem recorte: comemoração E popups saem do painel
  fctx.setTransform(1,0,0,1,0,0);
  fctx.clearRect(0,0,fxCanvas.width,fxCanvas.height);
  if(!fxConf.length && !chars.length && !popups.length) return;
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
  fctx.textAlign='center'; fctx.textBaseline='middle';
  for(const p of popups){
    const age = now-p.t0, q = Math.min(1,age/160), sc = .5+.5*eob(q);
    fctx.save();
    fctx.globalAlpha = Math.max(0, Math.min(1, p.life*1.4));
    fctx.translate(p.x, p.y);
    fctx.lineJoin = 'round';
    if(p.kind==='combo'){
      fctx.rotate(Math.sin(age/70)*0.05);
      fctx.scale(sc, sc);
      fctx.font = '900 '+p.size+'px -apple-system, Segoe UI, sans-serif';
      fctx.lineWidth = 7; fctx.strokeStyle = 'rgba(18,38,74,.92)'; fctx.strokeText(p.text,0,0);
      fctx.lineWidth = 3.5; fctx.strokeStyle = '#fff'; fctx.strokeText(p.text,0,0);
      fctx.fillStyle = p.color; fctx.fillText(p.text,0,0);
    } else if(p.kind==='info'){
      fctx.scale(sc, sc);
      fctx.font = '800 '+p.size+'px -apple-system, sans-serif';
      fctx.lineWidth = 5.5; fctx.strokeStyle = 'rgba(18,38,74,.9)'; fctx.strokeText(p.text,0,0);
      fctx.fillStyle = p.color; fctx.fillText(p.text,0,0);
    } else {
      fctx.font = '800 '+Math.round(p.size*sc)+'px -apple-system, sans-serif';
      fctx.lineWidth = 4; fctx.strokeStyle = 'rgba(18,38,74,.65)'; fctx.strokeText(p.text,0,0);
      fctx.fillStyle = p.color; fctx.fillText(p.text,0,0);
    }
    fctx.restore();
  }
  fctx.textBaseline = 'alphabetic';
}
function loop(now){ if(window.__freeze){ drawScene(false, now); renderFX(now); } else frame(now); requestAnimationFrame(loop); }

/* ---------- Resize ---------- */
function fit(){
  const s = innerHeight/BASE_H;   // altura soberana: portrait corta laterais; landscape centraliza a coluna
  stage.classList.toggle('landscape', innerWidth/innerHeight > BASE_W/BASE_H);   // um fundo OU o outro
  const sw = BASE_W*s, sh = BASE_H*s;
  stage.style.width = sw+'px'; stage.style.height = sh+'px';
  stage.style.setProperty('--u', (sw/100)+'px');
  const dpr = Math.min(2, window.devicePixelRatio||1);
  canvas.width = Math.round(W*dpr); canvas.height = Math.round(H*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  fxCanvas.width = BASE_W; fxCanvas.height = BASE_H;   // camada de comemoração cobre a cena inteira
}
window.addEventListener('resize', fit);

/* ---------- Debug ---------- */
window.TD = {
  drop:(t,x,y)=>{ const b=spawnBody(t, x??W/2, y??SPAWN_Y); b.plugin.guided = gridX(t, x??W/2); b.isSensor = true; return b; },
  hold:doHold,
  state:()=>({state, score, best, gems, combo, charsN:chars.length, fxN:fxConf.length, char:chars[0]&&{y:Math.round(chars[0].y), vy:+chars[0].vy.toFixed(1), b:chars[0].bounces}, obj:OBJ_DEFS[objIdx].label, objProg, cur, stash, queue:[...queue],
    dangerT:Math.round(dangerT), pieces:pieces.length, snapped:pieces.filter(b=>b.plugin.snapped).length,
    pos:pieces.map(b=>({t:b.plugin.tier, x:Math.round(b.position.x), y:Math.round(b.position.y), snap:!!b.plugin.snapped})),
    discovered:[...discovered]}),
  over:doGameOver, shake, restart,
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

  // ═══ CASTELO ALEATÓRIO — varia a cada reload ═══
  const COLS = [0, 2, 4, 6, 8, 10];       // colunas pares (peças 64px não colidem)

  for(const k of COLS){
    // Sorteia altura: 3 a 8 peças por coluna
    const n = 3 + (Math.random() * 6 | 0);

    // Base: prefere t5 (branca 4p) ou t4 (verde 2p), às vezes t3 (azul)
    const bases = [5, 5, 4, 4, 4, 3, 3];
    if(!place(bases[Math.random() * bases.length | 0], k)) continue;

    // Meio: mistura de t2(amarelo), t3(azul), t4(verde), t5(branca)
    const mids = [2, 2, 3, 3, 3, 4, 4, 4, 5, 5];
    for(let i = 1; i < n - 2; i++){
      if(!place(mids[Math.random() * mids.length | 0], k)) break;
    }

    // Topo: peças de 1 pino e azul — espira colorida
    const tops = [1, 1, 1, 2, 2, 2, 3, 3];
    for(let i = 0; i < 3; i++){
      if(!place(tops[Math.random() * tops.length | 0], k)) break;
    }
  }
}

/* ---------- Boot ---------- */
loadImages().then(()=>{
  fit();
  buildTray();
  queue = []; refillQueue(); newCurrent(); heldDrawX = heldX;
  syncScore(); syncPreview(); syncHold(); syncObj(); syncTray();
  setupInitialBoard();
  SDK.gameplayStart();
  requestAnimationFrame(loop);
}).catch(err=>{
  document.body.innerHTML = '<p style="color:#fff;text-align:center;margin-top:40vh">erro: '+err.message+'</p>';
});
