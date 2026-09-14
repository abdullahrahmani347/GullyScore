import { db } from '@/lib/db';
import { ensureDbSchema } from '@/lib/db-bootstrap';
import { embedSnapshot, type EmbedSnapshot, type HubMatchLike } from '@/lib/live-hub';

export const dynamic = 'force-dynamic';

/**
 * v2 §15.6 — GET /embed/match/[id]?theme=dark|light
 * Self-contained embeddable scoreboard: ONE HTML document, no external
 * assets, inline CSS + ~3 KB of JS (total well under the 15 KB budget).
 * Live updates: EventSource to the public match stream when available,
 * else 10 s polling of /api/embed/match/[id]. Served from a route handler
 * (no React runtime) so league sites and group chats can iframe it.
 * frame-ancestors * is attached to /embed/* in next.config.ts — ONLY
 * there; every other route stays frame-denying by default browser
 * policy.
 */

const CSS_DARK = `*{margin:0;padding:0;box-sizing:border-box}html,body{background:#070710}
body{font:13px/1.45 ui-monospace,'SF Mono',Menlo,Consolas,monospace;color:#F0F0F5;-webkit-font-smoothing:antialiased}
.gs{background:linear-gradient(160deg,#0B0B18,#070710);border:1px solid #1E1E32;border-radius:14px;padding:14px 16px;max-width:420px;min-width:260px;margin:0 auto}
.hd{display:flex;align-items:center;gap:8px;font-family:system-ui,sans-serif;font-size:11px;color:#8888A0;letter-spacing:.08em;text-transform:uppercase}
.dot{width:7px;height:7px;border-radius:99px;background:#00D4AA;animation:p 1.6s infinite}
@keyframes p{50%{opacity:.35}}
.live{color:#00D4AA;font-weight:700}
.bat{display:flex;align-items:baseline;gap:9px;margin:9px 0 2px}
.sq{font-size:26px;font-weight:700}
.ov{color:#8888A0;font-size:12px}
.pp{background:rgba(255,215,0,.14);color:#FFD700;font-size:9px;font-weight:700;padding:2px 5px;border-radius:5px}
.bt{display:flex;align-items:center;gap:6px;color:#B9B9CC;font-size:12px;margin-top:5px;flex-wrap:wrap}
.bt b{color:#F0F0F5}
.pl{display:flex;gap:12px;flex-wrap:wrap;color:#B9B9CC;font-size:12px;margin-top:7px}
.pl b{color:#F0F0F5}
.ac{color:#00D4AA}.wk{color:#FF4444}
.ch{display:flex;gap:4px;margin-top:9px}
.c{min-width:24px;height:24px;border-radius:99px;background:#1B1B2E;color:#F0F0F5;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0 4px}
.c4{background:rgba(78,205,196,.16);color:#4ECDC4}.c6{background:rgba(255,68,68,.16);color:#FF6B6B}.cw{background:#FF4444;color:#fff}.cd{color:#5B5B75}
.fi{color:#8888A0;font-size:11px;margin-top:8px}
.ft{display:flex;justify-content:space-between;color:#5B5B75;font-size:10px;font-family:system-ui,sans-serif;margin-top:10px;padding-top:8px;border-top:1px solid #1E1E32}
.ft a{color:#00D4AA;text-decoration:none;font-weight:600}
.res{color:#FFD700;font-weight:700;font-size:14px;margin-top:8px}
.rr{color:#FF6B6B}.tg{color:#FFD700}`;

const CSS_LIGHT = `*{margin:0;padding:0;box-sizing:border-box}html,body{background:#F5F5FA}
body{font:13px/1.45 ui-monospace,'SF Mono',Menlo,Consolas,monospace;color:#1A1A2E}
.gs{background:#fff;border:1px solid #E2E2EE;border-radius:14px;padding:14px 16px;max-width:420px;min-width:260px;margin:0 auto;box-shadow:0 2px 10px rgba(20,20,40,.06)}
.hd{display:flex;align-items:center;gap:8px;font-family:system-ui,sans-serif;font-size:11px;color:#7A7A92;letter-spacing:.08em;text-transform:uppercase}
.dot{width:7px;height:7px;border-radius:99px;background:#00A88A;animation:p 1.6s infinite}
@keyframes p{50%{opacity:.35}}
.live{color:#00A88A;font-weight:700}
.bat{display:flex;align-items:baseline;gap:9px;margin:9px 0 2px}
.sq{font-size:26px;font-weight:700}
.ov{color:#7A7A92;font-size:12px}
.pp{background:rgba(161,98,7,.12);color:#A16207;font-size:9px;font-weight:700;padding:2px 5px;border-radius:5px}
.bt{display:flex;align-items:center;gap:6px;color:#3A3A55;font-size:12px;margin-top:5px;flex-wrap:wrap}
.bt b{color:#1A1A2E}
.pl{display:flex;gap:12px;flex-wrap:wrap;color:#3A3A55;font-size:12px;margin-top:7px}
.pl b{color:#1A1A2E}
.ac{color:#00A88A}.wk{color:#D64545}
.ch{display:flex;gap:4px;margin-top:9px}
.c{min-width:24px;height:24px;border-radius:99px;background:#EDEDF6;color:#1A1A2E;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0 4px}
.c4{background:rgba(78,205,196,.2);color:#0E8F84}.c6{background:rgba(255,68,68,.15);color:#C33C3C}.cw{background:#E43F3F;color:#fff}.cd{color:#A0A0B8}
.fi{color:#7A7A92;font-size:11px;margin-top:8px}
.ft{display:flex;justify-content:space-between;color:#8A8AA2;font-size:10px;font-family:system-ui,sans-serif;margin-top:10px;padding-top:8px;border-top:1px solid #E2E2EE}
.ft a{color:#00A88A;text-decoration:none;font-weight:600}
.res{color:#A16207;font-weight:700;font-size:14px;margin-top:8px}
.rr{color:#C33C3C}.tg{color:#A16207}`;

const JS = `(function(){
var M=window.__GS;
var $=function(i){return document.getElementById(i)};
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;')}
function chipCls(l){
 if(l==='W')return'c cw';
 if(l==='4')return'c c4';
 if(l==='6')return'c c6';
 if(l==='\\u2022'||l==='\\u00b7')return'c cd';
 return'c'}
function render(m){
 if(!m||!m.ok){return}
 var live=m.st==='LIVE'||m.st==='INNINGS_BREAK';
 $('dot').style.display=live?'':'none';
 $('st').textContent=live?'LIVE':(m.st==='COMPLETED'?'RESULT':(m.st==='INNINGS_BREAK'?'BREAK':m.st));
 $('st').className=live?'live':'';
 $('t1n').textContent=esc(m.t[0].n);$('t2n').textContent=esc(m.t[1].n);
 $('t1n').style.color=m.t[0].c;$('t2n').style.color=m.t[1].c;
 if(m.bat.s&&m.bat.s!=='\\u2014'){$('batn').textContent=esc(m.bat.n);$('sq').textContent=esc(m.bat.s);$('sq').style.color=m.bat.c;
  $('ov').textContent='('+m.bat.o+' ov)';
  $('pp').style.display=m.pp?'':'none';}
 $('s1').innerHTML=m.s1?'\\u25cf <b>'+esc(m.s1.n)+'</b> '+esc(m.s1.r):'';
 $('s2').innerHTML=m.s2?'\\u25cb '+esc(m.s2.n)+' '+esc(m.s2.r):'';
 var pl=[];
 if(m.bw)pl.push('\\u26be <b>'+esc(m.bw.n)+'</b> '+esc(m.bw.f));
 if(m.bat.crr!=null)pl.push('CRR <b>'+m.bat.crr.toFixed(1)+'</b>');
 if(m.bat.rrr!=null&&m.bat.need>0)pl.push('<span class="rr">RRR <b>'+m.bat.rrr.toFixed(1)+'</b> \\u00b7 need <b>'+m.bat.need+'</b></span>');
 if(m.bat.inn===2&&m.bat.tgt!=null)pl.push('target <span class="tg"><b>'+m.bat.tgt+'</b></span>');
 $('pl').innerHTML=pl.join(' \\u00b7 ');
 $('ch').innerHTML=m.l6.map(function(l){return '<span class="'+chipCls(l)+'">'+esc(l)+'</span>'}).join('')||'<span class="cd" style="font-size:10px">awaiting first ball</span>';
 $('fi').textContent=m.fi?esc(m.fi.n)+' '+esc(m.fi.s):'';
 $('res').textContent=m.r||'';$('res').style.display=m.r?'':'none';
 var link=$('lnk');
 if(m.code){link.href='/live/'+m.code;link.textContent='GS-'+m.code}else{link.textContent='GullyScore'}
}
render(M);
var timer=null;
function refresh(){
 if(timer)return;
 timer=setTimeout(function(){timer=null;
  fetch('/api/embed/match/'+M.id).then(function(r){return r.json()}).then(render).catch(function(){})},400)}
var TYPES=['ball','wicket','over_complete','innings_break','match_complete','match_abandoned','undo','redo','ball_edited','status_change','target_adjusted','state'];
var es=null,polling=false;
function startPoll(){
 if(polling)return;polling=true;
 setInterval(function(){fetch('/api/embed/match/'+M.id).then(function(r){return r.json()}).then(render).catch(function(){})},10000)}
try{
 es=new EventSource('/api/matches/'+M.id+'/stream');
 for(var i=0;i<TYPES.length;i++)es.addEventListener(TYPES[i],refresh);
 es.onerror=function(){
  if(es.readyState===2){try{es.close()}catch(e){}startPoll()}}
}catch(e){startPoll()}
})();`;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureDbSchema();
  const { id } = await params;
  const url = new URL(request.url);
  const theme = url.searchParams.get('theme') === 'light' ? 'light' : 'dark';
  const code = url.searchParams.get('code')?.replace(/^GS-/i, '').toUpperCase();

  const match = await db.match.findFirst({
    where: code ? { liveCode: code } : { id },
    include: {
      team1: true,
      team2: true,
      innings: {
        include: {
          team: true,
          balls: { orderBy: { deliveryNumber: 'asc' } },
          batting: { include: { player: true } },
          bowling: { include: { player: true } },
        },
        orderBy: { inningsNumber: 'asc' },
      },
    },
  });

  if (!match) {
    return new Response('<!doctype html><meta charset="utf-8"><body style="font:13px monospace;color:#888;background:transparent;padding:12px">Match not found.</body>', {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  const snap: EmbedSnapshot = embedSnapshot(match as unknown as HubMatchLike);
  const snapJson = JSON.stringify(snap).replace(/</g, '\\u003c');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Live cricket — ${match.team1.name} v ${match.team2.name}</title>
<style>${theme === 'light' ? CSS_LIGHT : CSS_DARK}</style>
</head>
<body>
<div class="gs">
 <div class="hd"><span id="dot" class="dot"></span><span id="st" class="live">LIVE</span><span style="margin-left:auto">${match.team1.shortName || match.team1.name} v ${match.team2.shortName || match.team2.name}</span></div>
 <div class="hd" style="margin-top:2px;text-transform:none;letter-spacing:0"><span id="t1n">${match.team1.name}</span><span style="opacity:.6">v</span><span id="t2n">${match.team2.name}</span></div>
 <div class="bat"><span id="batn" style="font-size:12px;font-family:system-ui,sans-serif;font-weight:700"></span><span id="sq" class="sq"></span><span id="ov" class="ov"></span><span id="pp" class="pp" style="display:none">PP</span></div>
 <div class="bt" id="s1"></div>
 <div class="bt" id="s2"></div>
 <div class="pl" id="pl"></div>
 <div class="ch" id="ch"></div>
 <div class="fi" id="fi"></div>
 <div class="res" id="res" style="display:none"></div>
 <div class="ft"><span>powered by GullyScore</span><a id="lnk" href="/live/${match.liveCode ?? ''}" target="_blank" rel="noopener">GS-${match.liveCode ?? ''}</a></div>
</div>
<script>window.__GS=${snapJson};${JS}</script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=10, stale-while-revalidate=30',
    },
  });
}
