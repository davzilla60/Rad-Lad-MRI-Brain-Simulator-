(function(){
"use strict";
/* ---------------------------------------------------------------
   MR-I READY — MRI BRAIN planning simulator (demonstration)
   Set-up (head position in the 32-channel head coil, head first) → 3-plane localiser acquired line by line in
   k-space → protocol → SAGITTAL T1 first (parallel to the falx, ear to ear) → drag the sagittal onto the sagittal panel →
   ANGLE the AXIAL parallel to the AC-PC line and the CORONAL perpendicular to it → images → debrief.
   Everything lives in DICOM patient space (LPS, mm): +x patient left, +y posterior, +z superior. Each panel shows an
   image with its real IPP / IOP, and plan boxes are projected onto it, so they line up on localisers and series alike.
   --------------------------------------------------------------- */
var BASE = "./assets/";
var C = window.MRS_CALIB, LN = C.loc.n, SER = C.ser, LM = C.lm, HH = LM.conf;
var ASSETS = window.SCG_ASSETS || null;
var PNG = { logo_full:1, logo_mark:1, loc_sag:1, loc_cor:1, loc_ax:1 };
function url(n){ return ASSETS ? ASSETS[n] : BASE + n + (PNG[n] ? ".png" : ".jpg"); }
function pad2(n){ return (n<10?"0":"")+n; }
function imgName(id, k){ return id+"_"+pad2(k); }
var $ = function(id){ return document.getElementById(id); };
var stage=$("scgStage"), vp=$("scgViewport"), grid=$("mreGrid"), viewEl=$("mreView"), viewCv=$("mreViewCv"),
    acqEl=$("scgAcq"), acqTitle=$("scgAcqTitle"), acqNum=$("scgAcqNum"),
    vpTL=$("scgVpTL"), vpBL=$("scgVpBL"), vpBR=$("scgVpBR"),
    railTitle=$("scgRailTitle"), railDesc=$("scgRailDesc"), railBody=$("scgRailBody"),
    cmds=$("scgCmds"), cliForm=$("scgCliForm"), cli=$("scgCli"), logEl=$("scgLog"), phaseChip=$("scgPhaseChip"),
    titleEl=$("scgTitle"), resultEl=$("scgResult"), room=$("scgRoom"), info=$("mreInfo"),
    stackUI=$("scgStackUI"), stackSlider=$("scgStackSlider"), winBtns=$("scgWinBtns"), achWrap=$("scgAch");
var CELL = {};
Array.prototype.forEach.call(grid.querySelectorAll(".mre-cell"), function(c){
  CELL[c.dataset.p] = { el:c, sq:c.querySelector(".mre-sq"), cv:c.querySelector("canvas"), img:c.querySelector("img"),
                        svg:c.querySelector("svg"), lab:c.querySelector(".mre-lab"), lab2:c.querySelector(".mre-lab2") };
});

$("scgMarkMini").innerHTML = '<img class="scg-mark-ic" src="'+url("logo_mark")+'" alt="Rad-Lad">'+
  '<div class="scg-mark-tx"><b>MR-I&nbsp;READY&nbsp;·&nbsp;BRAIN</b><span>Rad-Lad&nbsp;·&nbsp;Illuminate&nbsp;the&nbsp;Invisible</span></div>';
$("scgLogoBig").src = url("logo_full"); $("scgAchLogo").src = url("logo_mark");
$("scgT1").src = url("loc_sag"); $("scgT2").src = url("loc_cor"); $("scgT3").src = url("loc_ax");
["sag","cor","ax"].forEach(function(p){ CELL[p].img.src = url("loc_"+p); });
function playAchievement(){ achWrap.classList.remove("is-playing"); void achWrap.offsetWidth; achWrap.classList.add("is-playing"); }
$("scgAchReplay").addEventListener("click", playAchievement);

/* ---- small vector kit (3-vectors as arrays) ---- */
function add(a,b){ return [a[0]+b[0], a[1]+b[1], a[2]+b[2]]; }
function sub(a,b){ return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
function mul(a,s){ return [a[0]*s, a[1]*s, a[2]*s]; }
function dot(a,b){ return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }
function cross(a,b){ return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
function axpy(a,b,s){ return [a[0]+b[0]*s, a[1]+b[1]*s, a[2]+b[2]*s]; }

/* =============================================================
   ANATOMY + PROTOCOL DATA
   ============================================================= */
var TASKS = ["sag","ax","cor"], PANELS = ["sag","cor","ax"], FIRST = "sag";
var TYPE = { ax:"ax", cor:"cor", sag:"sag" };
var COLORS = { ax:"#5fe08a", cor:"#6fc3ff", sag:"#f0a35e" };
var NAME = { sag:"SAG", cor:"COR", ax:"AX" };
var ANGP = { ax:"sag", cor:"sag", sag:"ax" };                 // the panel each plane is angled on
var LOCK = { ax:true, cor:true, sag:false };                  // needs the real sagittal on that panel first
var REF = { ax:C.real.ax, cor:C.real.cor, sag:C.real.sag };   // reference line angles (AC-PC on the sagittal, falx on the axial)
var TOL = 5;                                                  // degrees
var MAT = { ax:384, cor:384, sag:256 };
var LIM = { ax:  { nmax:40, tmin:2, tmax:8, fmin:160, fmax:320, coarse:270, narrow:180, over:190 },
            cor: { nmax:44, tmin:2, tmax:8, fmin:160, fmax:320, coarse:270, narrow:180, over:230 },
            sag: { nmax:44, tmin:2, tmax:8, fmin:160, fmax:320, coarse:280, narrow:200, over:190 } };
var SEQ = {
  sag: { name:"SAGITTAL", dirName:"right", ideal:"sag_t1",
         start:{ c:[5,-25,10], ang:90, n:12, thk:5, gap:1.5, fov:250 },
         regions:[[-67,"left of the head (scalp)"],[-50,"left temporal lobe"],[-17,"left hemisphere · insula"],[17,"midline · corpus callosum · brainstem"],[50,"right hemisphere · insula"],[67,"right temporal lobe"],[1e9,"right of the head (scalp)"]],
         key:[["rtl","Right temporal lobe (lateral)"],["mid","Midline: corpus callosum, brainstem"],["ltl","Left temporal lobe (lateral)"],["vertex","Vertex in the FOV"],["fm","Foramen magnum in the FOV"],["fpole","Frontal pole in the FOV"],["opole","Occipital pole in the FOV"]],
         hint:"Sagittal T1: parallel to the falx (the midline) on the axial and coronal, from the outer edge of one temporal lobe to the other — about 140 mm. FOV ≈ 240–250 mm: vertex to below the foramen magnum, forehead to occiput.",
         seqs:[
           { id:"t1",   name:"T1", why:"midline anatomy: corpus callosum, pituitary, cerebellar tonsils, brainstem — and the image you plan the axial and coronal on", have:"sag_t1" },
           { id:"vol",  name:"3D T1 (1 mm volume)", why:"epilepsy, tumour or any lesion: reformat in any plane, and repeat after gadolinium", rec:true } ] },
  ax:  { name:"AXIAL", dirName:"superior", ideal:"ax_t2",
         start:{ c:[5,-25,10], ang:0, n:20, thk:5, gap:1, fov:230 },
         regions:[[-66,"below the foramen magnum (cervical cord)"],[-52,"foramen magnum · medulla · cerebellar tonsils"],[-32,"pons · cerebellum · temporal lobes"],[-14,"midbrain · temporal lobes"],[8,"basal ganglia · thalami (AC-PC level)"],[31,"lateral ventricles · corona radiata"],[66,"centrum semiovale · high convexity"],[1e9,"above the vertex"]],
         key:[["fm","Foramen magnum (bottom of the brain)"],["cbl","Inferior cerebellum"],["pons","Pons"],["ac","AC-PC level"],["vertex","Vertex (top of the brain)"],["front","Whole head in the FOV (forehead)"],["back","Whole head in the FOV (occiput)"],["rskull","Whole head in the FOV (right side)"],["lskull","Whole head in the FOV (left side)"]],
         hint:"Axial: parallel to the AC-PC line on the sagittal T1 (anterior to posterior commissure), and straight on the coronal. From the foramen magnum to the vertex — about 135 mm. FOV just bigger than the head (≈ 220–240 mm).",
         seqs:[
           { id:"t2",   name:"T2", why:"the workhorse: anatomy, CSF spaces, most pathology bright", have:"ax_t2" },
           { id:"flair",name:"FLAIR", why:"T2 with the CSF signal nulled: white-matter lesions, periventricular and cortical oedema stand out", have:"ax_flair" },
           { id:"dwi",  name:"DWI + ADC", why:"acute infarct (bright DWI, dark ADC), abscess, cellular tumour — in every routine brain", have:["ax_dwi","ax_adc"] },
           { id:"t2s",  name:"T2* / SWI", why:"blood products and calcium: microbleeds, old haemorrhage, cavernoma", have:"ax_t2s" },
           { id:"gad",  name:"T1 + gadolinium", why:"tumour, infection, inflammation — only if the request or the first images call for it" } ] },
  cor: { name:"CORONAL", dirName:"posterior", ideal:"cor_t2",
         start:{ c:[5,-25,10], ang:0, n:24, thk:5, gap:1, fov:230 },
         regions:[[-80,"in front of the frontal lobes"],[-53,"frontal lobes · orbits"],[-26,"temporal poles · frontal horns"],[2,"hippocampal heads · third ventricle"],[32,"brainstem · hippocampal tails"],[62,"occipital horns · cerebellum"],[82,"occipital lobes"],[1e9,"behind the occipital poles"]],
         key:[["fpole","Frontal pole"],["rtp","Temporal poles"],["pons","Brainstem"],["cbl","Cerebellum"],["opole","Occipital pole"],["vertex","Vertex in the FOV"],["fm","Foramen magnum in the FOV"],["rskull","Whole head in the FOV (right side)"],["lskull","Whole head in the FOV (left side)"]],
         hint:"Coronal: perpendicular to the AC-PC line on the sagittal T1 (so it runs along the brainstem), and straight on the axial. Frontal pole to occipital pole — about 165 mm. FOV ≈ 220–240 mm.",
         seqs:[
           { id:"t2",   name:"T2", why:"symmetry of the hemispheres and ventricles, the hippocampi, the posterior fossa", have:"cor_t2" },
           { id:"flair",name:"FLAIR", why:"hippocampal sclerosis (epilepsy), cortical lesions", rec:true },
           { id:"t1",   name:"T1", why:"anatomy, grey–white contrast, the pituitary and the hippocampi", have:"cor_t1" } ] }
};
var POS = {
  neutral: { label:"HEAD STRAIGHT · PADDED IN THE COIL", desc:"Head in the middle of the head coil, chin neutral (not tucked, not tipped up), foam pads either side, nose in line with the body.",
          cap:"SUPINE · HEAD FIRST · HEAD STRAIGHT", sub:"chin neutral, pads either side", short:"head straight, padded",
          fit:"Head straight in the coil, <b>chin neutral, foam pads either side</b> of the head · knee wedge for comfort",
          note:"Straight and snug: the midline is vertical on the axial and coronal, and the AC-PC line needs only a small angle. Padded heads don't drift — and a 25-minute brain is very sensitive to motion.",
          cls:"ok" },
  chinup: { label:"CHIN TIPPED UP", desc:"No support under the back of the head — the chin rises toward the roof of the coil.",
          cap:"SUPINE · HEAD FIRST · CHIN UP", sub:"neck extended, chin toward the coil roof", short:"chin tipped up (extended)",
          fit:"Head left to fall back, chin tipped up",
          note:"Neck extension swings the AC-PC line steeply: the axials need a big angle, the face and nose press on the top of the coil, and an uncomfortable neck moves. Support the head so the chin is neutral.",
          cls:"warn" },
  tilted: { label:"HEAD ROLLED TO ONE SIDE", desc:"No pads — the head has rolled toward the right shoulder.",
          cap:"SUPINE · HEAD FIRST · HEAD ROLLED", sub:"no pads: the head drifts to one side", short:"head rolled to one side (no pads)",
          fit:"Head left unpadded, rolled toward the right shoulder",
          note:"A rolled head is oblique in two planes: the midline is no longer vertical, the two sides can't be compared slice for slice, and an unsupported head keeps moving. Centre it and pad both sides.",
          cls:"warn" }
};
function regionName(q, mm){ var r=SEQ[q].regions; for(var i=0;i<r.length;i++) if(mm < r[i][0]) return r[i][1]; return r[r.length-1][1]; }
function coverage(pl){ return pl.n*pl.thk + (pl.n-1)*pl.gap; }
/* plane frame: u = screen-right, v = screen-down, n = slice direction (u × v) */
function frameOf(q, ang){
  if(TYPE[q]==="ax") return { u:[1,0,0], v:[0,1,0], n:[0,0,1] };
  var t=ang*Math.PI/180;
  return { u:[Math.cos(t), Math.sin(t), 0], v:[0,0,-1], n:[-Math.sin(t), Math.cos(t), 0] };
}
function frame(q){ return S.plan[q].f; }
function rotV(a, k, c, s){ var kd=dot(k,a), kx=cross(k,a); return [a[0]*c+kx[0]*s+k[0]*kd*(1-c), a[1]*c+kx[1]*s+k[1]*kd*(1-c), a[2]*c+kx[2]*s+k[2]*kd*(1-c)]; }
/* rotate frame f by deg about axis k, then keep it reading the right way round on screen */
function rotFrame(q, f, k, deg){
  var L=Math.hypot(k[0],k[1],k[2]); k=mul(k, 1/L);
  var t=deg*Math.PI/180, c=Math.cos(t), s=Math.sin(t), g={ u:rotV(f.u,k,c,s), v:rotV(f.v,k,c,s), n:rotV(f.n,k,c,s) };
  if(TYPE[q]==="ax"){ if(g.u[0]<0){ g.u=mul(g.u,-1); g.v=mul(g.v,-1); } }
  else {
    if(TYPE[q]==="cor" ? g.u[0] < 0 : g.u[1] < 0){ g.u=mul(g.u,-1); g.n=mul(g.n,-1); }
    if(g.v[2] > 0){ g.v=mul(g.v,-1); g.n=mul(g.n,-1); }
  }
  return g;
}
/* a stack's slice-line angle on the panel it is angled on (ANGP: screen degrees, clockwise from screen-right),
   and its tilt out of that panel's plane */
function angPanelN(q){ var L=C.loc[ANGP[q]]; return cross(L.row, L.col); }
function axAng(q){ var L=C.loc[ANGP[q]], n=S.plan[q].f.n; return normAng(q, Math.atan2(dot(n,L.col), dot(n,L.row))*180/Math.PI + 90, true); }
function tiltOf(q){ var n=S.plan[q].f.n; return Math.round(Math.asin(Math.min(1, Math.abs(dot(n, angPanelN(q)))))*180/Math.PI); }
function edges(q){ var pl=S.plan[q], s=dot(sub(pl.c, HH), frame(q).n), h=coverage(pl)/2; return [s-h, s+h]; }
function needsAngle(q){ return true; }
function angErr(q){ if(!needsAngle(q)) return 0; var d=((axAng(q)-REF[q])%180+180)%180; return d>90 ? d-180 : d; }
function angOK(q){ return !needsAngle(q) || Math.abs(angErr(q)) <= TOL; }
function inBox(q, P){
  var F=frame(q), pl=S.plan[q], d=sub(P, pl.c);
  return Math.abs(dot(d,F.n)) <= coverage(pl)/2 + 1.5 && Math.abs(dot(d,F.u)) <= pl.fov/2 && Math.abs(dot(d,F.v)) <= pl.fov/2;
}
function analyse(q){
  var pl=S.plan[q], e=edges(q), L=LIM[q], key=SEQ[q].key.map(function(k){ return { id:k[0], name:k[1], ok:inBox(q, LM[k[0]]) }; });
  return { key:key, all:key.every(function(k){ return k.ok; }), cov:coverage(pl), lo:e[0], hi:e[1], res:pl.fov/MAT[q],
           coarse:pl.fov > L.coarse, narrow:pl.fov < L.narrow, ang:angErr(q), angOK:angOK(q), over:coverage(pl) > L.over };
}
function planOK(q){ var a=analyse(q); return a.all && !a.coarse && !a.narrow && a.angOK; }
function canScan(q){ return angOK(q); }
function imaged(q){                                     // series ids this plan will produce
  var ids=[]; SEQ[q].seqs.forEach(function(s){ if(s.have && S.chosen[q][s.id]) ids=ids.concat(s.have); });
  return ids.length ? ids : [].concat(SEQ[q].seqs.filter(function(s){ return s.have; })[0].have);
}
function scanTime(id){ var s=SER[id], pl=S.plan[s.task]; return s.spl ? Math.round(30 + pl.n*s.spl) : 0; }   // ADC: calculated, no scan time
function mmss(s){ return Math.floor(s/60)+":"+pad2(s%60); }
function sgn(v){ return (v>=0?"+":"−")+Math.abs(v).toFixed(0); }

/* =============================================================
   STATE
   ============================================================= */
function clone(o){ return JSON.parse(JSON.stringify(o)); }
function startPlan(q){ var p=clone(SEQ[q].start); p.f=frameOf(q, p.ang); delete p.ang; return p; }
function freshState(){
  return { phase:"title", pos:null, loaded:false, loading:false, locDone:false,
           plan:{ ax:startPlan("ax"), cor:startPlan("cor"), sag:startPlan("sag") },
           done:{}, ids:{}, acq:{}, swap:{}, chosen:{ sag:{t1:1}, ax:{t2:1, flair:1, dwi:1}, cor:{t2:1} },
           cur:null, viewId:null, viewK:0, list:[] };
}
var S = freshState();

/* =============================================================
   SERIES GEOMETRY + IMAGES
   ============================================================= */
function sliceCentre(id, k){ var s=SER[id]; return axpy(axpy(s.ipp[k], s.row, s.ps*s.cols/2), s.col, s.ps*s.rows/2); }
function seriesCentre(id){ var s=SER[id]; return mul(add(sliceCentre(id,0), sliceCentre(id,s.n-1)), 0.5); }
function coveredSlices(id){
  var s=SER[id], q=s.task, F=frame(q), pl=S.plan[q], h=coverage(pl)/2 + s.sp/2, out=[];
  for(var k=0;k<s.n;k++){
    var d=sub(sliceCentre(id,k), pl.c);
    if(Math.abs(dot(d, F.n)) > h) continue;
    if(q==="ax" && Math.abs(dot(d, s.nrm)) > h + 2) continue;
    out.push(k);
  }
  return out;
}
function nearestSlice(id, P){
  var s=SER[id], b=0, bd=1e9;
  for(var k=0;k<s.n;k++){ var d=Math.abs(dot(sub(P, s.ipp[k]), s.nrm)); if(d<bd){ bd=d; b=k; } }
  return b;
}
var imgCache = {};
function getImg(name, cb){
  if(imgCache[name] && imgCache[name].complete){ cb(imgCache[name]); return; }
  var im = imgCache[name] || new Image();
  im.addEventListener("load", function(){ cb(im); }, { once:true });
  if(!imgCache[name]){ imgCache[name]=im; im.src=url(name); }
}
/* the crop used to show series slice k inside plan q's FOV (series' own orientation, centred on the plan) */
function cropOf(id, k, N, pl){
  var s=SER[id], d=sub(pl.c, s.ipp[k]);
  return { ic:dot(d,s.row)/s.ps, jc:dot(d,s.col)/s.ps, sc:N/(pl.fov/s.ps), N:N };
}
function cropPt(id, k, cr, P){ var s=SER[id], d=sub(P, s.ipp[k]); return [(dot(d,s.row)/s.ps - cr.ic)*cr.sc + cr.N/2, (dot(d,s.col)/s.ps - cr.jc)*cr.sc + cr.N/2]; }
function renderSeries(id, k, cv, pl, cb){
  var g=cv.getContext("2d"), N=cv.width;
  pl = pl || S.plan[SER[id].task];
  getImg(imgName(id,k), function(im){
    var cr=cropOf(id, k, N, pl);
    g.setTransform(1,0,0,1,0,0); g.globalAlpha=1; g.fillStyle="#000"; g.fillRect(0,0,N,N);
    g.imageSmoothingEnabled=true; g.imageSmoothingQuality="high";
    g.setTransform(cr.sc,0,0,cr.sc, N/2-cr.ic*cr.sc, N/2-cr.jc*cr.sc); g.drawImage(im, -0.5, -0.5);
    g.setTransform(1,0,0,1,0,0);
    if(cb) cb(cr);
  });
}

/* =============================================================
   K-SPACE (the localiser is acquired line by line)
   ============================================================= */
function fft1(re, im, inv){
  var n=re.length, i, j, k, m;
  for(i=1, j=0; i<n; i++){ var bit=n>>1; for(; j&bit; bit>>=1) j^=bit; j^=bit; if(i<j){ var t=re[i]; re[i]=re[j]; re[j]=t; t=im[i]; im[i]=im[j]; im[j]=t; } }
  for(m=2; m<=n; m<<=1){
    var ang=(inv?2:-2)*Math.PI/m, wr=Math.cos(ang), wi=Math.sin(ang);
    for(i=0; i<n; i+=m){ var cr=1, ci=0;
      for(k=0; k<m/2; k++){
        var a=i+k, b=a+m/2, tr=re[b]*cr-im[b]*ci, ti=re[b]*ci+im[b]*cr;
        re[b]=re[a]-tr; im[b]=im[a]-ti; re[a]+=tr; im[a]+=ti;
        var nr=cr*wr-ci*wi; ci=cr*wi+ci*wr; cr=nr;
      }
    }
  }
}
function fft2(re, im, n, inv){
  var r=new Float64Array(n), i2=new Float64Array(n), x, y;
  for(y=0;y<n;y++){ for(x=0;x<n;x++){ r[x]=re[y*n+x]; i2[x]=im[y*n+x]; } fft1(r,i2,inv); for(x=0;x<n;x++){ re[y*n+x]=r[x]; im[y*n+x]=i2[x]; } }
  for(x=0;x<n;x++){ for(y=0;y<n;y++){ r[y]=re[y*n+x]; i2[y]=im[y*n+x]; } fft1(r,i2,inv); for(y=0;y<n;y++){ re[y*n+x]=r[y]; im[y*n+x]=i2[y]; } }
}
var KS = {};
function prepK(p, cb){
  if(KS[p]){ cb(KS[p]); return; }
  getImg("loc_"+p, function(im){
    var n=LN, c=document.createElement("canvas"); c.width=c.height=n;
    var g=c.getContext("2d", { willReadFrequently:true }); g.drawImage(im,0,0,n,n);
    var d=g.getImageData(0,0,n,n).data, re=new Float64Array(n*n), imv=new Float64Array(n*n), i;
    for(i=0;i<n*n;i++) re[i]=d[i*4];
    fft2(re, imv, n, false);
    var mag=new Float64Array(n*n), mx=0;
    for(i=0;i<n*n;i++){ mag[i]=Math.log(1+Math.hypot(re[i],imv[i])); if(mag[i]>mx) mx=mag[i]; }
    var kc=document.createElement("canvas"); kc.width=kc.height=n;
    var kg=kc.getContext("2d"), id=kg.createImageData(n,n);
    for(var y=0;y<n;y++) for(var x=0;x<n;x++){
      var v=Math.pow(mag[((y+n/2)%n)*n+((x+n/2)%n)]/mx, 2.2)*255, j=(y*n+x)*4;
      id.data[j]=v*0.7; id.data[j+1]=v; id.data[j+2]=v*0.8; id.data[j+3]=255;
    }
    kg.putImageData(id,0,0);
    KS[p]={ re:re, im:imv, kc:kc };
    cb(KS[p]);
  });
}
function partialRecon(p, lines, cv){
  var K=KS[p], n=LN, re=new Float64Array(n*n), im=new Float64Array(n*n), y, x;
  for(var r=0;r<lines;r++){ y=(r+n/2)%n; for(x=0;x<n;x++){ re[y*n+x]=K.re[y*n+x]; im[y*n+x]=K.im[y*n+x]; } }
  fft2(re, im, n, true);
  var g=cv.getContext("2d"), id=g.createImageData(n,n), d=id.data;
  for(var i=0;i<n*n;i++){ var v=Math.hypot(re[i],im[i])/(n*n); v=v>255?255:v; d[i*4]=d[i*4+1]=d[i*4+2]=v; d[i*4+3]=255; }
  g.putImageData(id,0,0);
}

/* =============================================================
   LAYOUT + LOG
   ============================================================= */
function layoutGrid(){
  Object.keys(CELL).forEach(function(p){
    var c=CELL[p], w=c.el.clientWidth, h=c.el.clientHeight, s=Math.max(10, Math.min(w, h));
    c.sq.style.width=s+"px"; c.sq.style.height=s+"px";
  });
}
window.addEventListener("resize", layoutGrid);
if(typeof ResizeObserver!=="undefined") new ResizeObserver(layoutGrid).observe(vp);
function log(msg, cls){
  var d=document.createElement("div");
  if(cls) d.innerHTML='<span class="scg-l-'+cls+'">'+msg+'</span>'; else d.textContent=msg;
  logEl.appendChild(d); logEl.scrollTop=logEl.scrollHeight;
}
function logCmd(c){ log("$ "+c,"cmd"); }

/* =============================================================
   PLANNING OVERLAYS — boxes projected onto each panel's real image plane (SVG units: 256 across the image)
   ============================================================= */
function panelGeo(p){
  var sw=S.swap[p];
  if(sw){ var s=SER[sw.id], k=S.acq[sw.id][sw.i]; return { ipp:s.ipp[k], row:s.row, col:s.col, mmu:s.ps*s.cols/256 }; }
  var L=C.loc[p]; return { ipp:L.ipp, row:L.row, col:L.col, mmu:L.ps*L.cols/256 };
}
function proj(G, P){ var d=sub(P, G.ipp); return [dot(d,G.row)/G.mmu, dot(d,G.col)/G.mmu]; }
function projDir(G, d){ return [dot(d,G.row)/G.mmu, dot(d,G.col)/G.mmu]; }
function unproj(G, x, y){ return axpy(axpy(G.ipp, G.row, x*G.mmu), G.col, y*G.mmu); }
function f1(v){ return v.toFixed(1); }
function canRotate(p, q){ return !(p===ANGP[q] && LOCK[q] && !S.swap[ANGP[q]]); }
/* the drawable shape of plan q on panel p */
function shapeOf(p, q){
  var G=panelGeo(p), F=frame(q), pl=S.plan[q], N=cross(G.row, G.col), t=Math.abs(dot(F.n, N)), half=pl.fov/2, cov=coverage(pl);
  var sh={ G:G, F:F, parallel:t>0.6, edges:[], lines:[] }, c=pl.c;
  function P2(P){ return proj(G, P); }
  if(sh.parallel){                                   // the square FOV of the centre slice
    sh.corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(function(s){ return P2(axpy(axpy(c, F.u, s[0]*half), F.v, s[1]*half)); });
    sh.edges=[["v","lo"],["u","hi"],["v","hi"],["u","lo"]];
  } else {                                           // a stack: slices seen edge-on, along the in-plane axis this panel shows
    var a = Math.abs(dot(F.u,N)) < Math.abs(dot(F.v,N)) ? "u" : "v", A=F[a];
    sh.corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(function(s){ return P2(axpy(axpy(c, F.n, s[0]*cov/2), A, s[1]*half)); });
    sh.edges=[[a,"lo"],["n","hi"],[a,"hi"],["n","lo"]];
    var step=pl.thk+pl.gap, every=Math.max(1, Math.ceil(pl.n/40));
    for(var i=0;i<pl.n;i+=every){ var m=axpy(c, F.n, -cov/2+pl.thk/2+i*step); sh.lines.push([P2(axpy(m,A,-half)), P2(axpy(m,A,half))]); }
    sh.a=a;
  }
  var RA = sh.parallel ? F.u : F[sh.a];
  sh.rot={ c:P2(c), h:[P2(axpy(c, RA, -(half+8))), P2(axpy(c, RA, half+8))], lock:!canRotate(p, q) };
  return sh;
}
function svgBox(p, q, mode){
  var sh=shapeOf(p, q), plan=mode==="plan", off=plan && !planOK(q), cls=off?" is-off":"", pl=S.plan[q], K=sh.corners, out="";
  var poly=K.map(function(k){ return f1(k[0])+" "+f1(k[1]); });
  if(plan) out+='<path class="mre-mask" fill-rule="evenodd" d="M-400 -400H656V656H-400Z M'+poly.join("L")+'Z"/>';
  var st = plan ? "" : ' style="stroke:'+COLORS[q]+';fill:'+COLORS[q]+'14"';
  out+='<path class="mre-box'+cls+(sh.parallel?" is-fov":"")+'" data-q="'+q+'" data-h="body" d="M'+poly.join("L")+'Z"'+st+(plan?"":' pointer-events="none"')+'/>';
  sh.lines.forEach(function(l){ out+='<line class="mre-sl'+cls+'" x1="'+f1(l[0][0])+'" y1="'+f1(l[0][1])+'" x2="'+f1(l[1][0])+'" y2="'+f1(l[1][1])+'"'+(plan?"":' style="stroke:'+COLORS[q]+'88"')+'/>'; });
  if(plan){
    sh.edges.forEach(function(e, i){
      var a=K[i], b=K[(i+1)%4], mx=(a[0]+b[0])/2, my=(a[1]+b[1])/2;
      out+='<line class="mre-hd" style="cursor:'+(e[0]==="n"?"col-resize":"nwse-resize")+'" data-h="'+e[0]+'|'+e[1]+'" x1="'+f1(a[0])+'" y1="'+f1(a[1])+'" x2="'+f1(b[0])+'" y2="'+f1(b[1])+'"/>'+
           '<circle class="mre-hgrip'+cls+'" cx="'+f1(mx)+'" cy="'+f1(my)+'" r="2.6"/>';
    });
    var rc = sh.rot.lock ? " is-lock" : cls, H=sh.rot.h;
    out+='<line class="mre-rotline'+rc+'" x1="'+f1(H[0][0])+'" y1="'+f1(H[0][1])+'" x2="'+f1(H[1][0])+'" y2="'+f1(H[1][1])+'"/>';
    H.forEach(function(h, i){
      out+='<circle class="mre-rot'+rc+'" data-h="rot|'+(i?1:-1)+'" cx="'+f1(h[0])+'" cy="'+f1(h[1])+'" r="8"/>'+
           '<text class="mre-tx'+rc+'" style="font-size:9px" text-anchor="middle" x="'+f1(h[0])+'" y="'+f1(h[1]+3.2)+'" pointer-events="none">'+(sh.rot.lock?"🔒":"⟳")+'</text>';
    });
    out+='<text class="mre-tx'+rc+'" x="'+f1(H[0][0]-10)+'" y="'+f1(H[0][1]-11)+'">'+(sh.rot.lock?"angle locked":(p===ANGP[q]?"angle "+Math.round(axAng(q))+"°":"tilt"))+'</text>';
    var top=K.reduce(function(m,k){ return k[1]<m[1]?k:m; }, K[0]);
    var tx = sh.parallel ? "FOV "+pl.fov+" mm" : pl.n+" sl · "+pl.thk+" mm · "+coverage(pl).toFixed(0)+" mm";
    out+='<text class="mre-tx'+cls+'" x="'+f1(Math.max(2, Math.min(150, top[0]+2)))+'" y="'+f1(Math.max(9, top[1]-3))+'">'+NAME[q]+' · '+tx+'</text>';
  } else {
    var tp=K.reduce(function(m,k){ return k[1]<m[1]?k:m; }, K[0]);
    out+='<text class="mre-tx" style="fill:'+COLORS[q]+'" x="'+f1(tp[0]+2)+'" y="'+f1(Math.max(9, tp[1]-3))+'">'+NAME[q]+'</text>';
  }
  return out;
}
function drawOverlays(){
  PANELS.forEach(function(p){
    var svg=CELL[p].svg, out="";
    if(S.phase==="plan") out=svgBox(p, S.cur, "plan");
    else if(S.phase==="dash" || S.phase==="result") Object.keys(S.done).forEach(function(q){ out+=svgBox(p, q, "dash"); });
    svg.innerHTML=out;
    var lab2="";
    if(S.phase==="plan"){
      var q=S.cur;
      if(!canRotate(p, q)) lab2="🔒 angle: drop the sagittal T1 here first";
      else lab2 = "⟳ = angle · box = move · edges = "+(shapeOf(p, q).parallel ? "FOV" : "coverage / FOV");
    }
    CELL[p].lab2.textContent=lab2;
    var want = S.phase==="plan" && p===ANGP[S.cur] && LOCK[S.cur] && !S.swap[p], tag=CELL[p].el.querySelector(".mre-want");
    CELL[p].lab2.style.color = want ? "var(--warn)" : "";
    CELL[p].el.classList.toggle("is-want", want);
    if(want && !tag){ tag=document.createElement("div"); tag.className="mre-want"; tag.textContent="⬇ DROP THE SAGITTAL HERE TO ANGLE"; CELL[p].el.appendChild(tag); }
    if(!want && tag) tag.remove();
  });
}
/* dragging */
var drag=null;
function svgPt(svg, e){ var r=svg.getBoundingClientRect(); return [(e.clientX-r.left)/r.width*256, (e.clientY-r.top)/r.height*256]; }
function along(G, c, d, m){ var c2=proj(G, c), d2=projDir(G, d), L=d2[0]*d2[0]+d2[1]*d2[1]; return L<1e-9 ? 0 : ((m[0]-c2[0])*d2[0]+(m[1]-c2[1])*d2[1])/L; }
function angLog(q){ log(q==="ax" ? "axial angle: parallel to the AC-PC line ✓" : q==="cor" ? "coronal angle: perpendicular to the AC-PC line ✓" : "sagittal angle: parallel to the falx ✓","ok"); }
PANELS.forEach(function(p){
  var svg=CELL[p].svg;
  svg.addEventListener("pointerdown", function(e){
    if(S.phase!=="plan") return;
    var t=e.target, h=t.getAttribute && t.getAttribute("data-h");
    if(!h) return;
    e.preventDefault();
    var q=S.cur;
    drag={ p:p, h:h, q:q, start:svgPt(svg, e), G:panelGeo(p), pl0:clone(S.plan[q]), F0:frame(q) };
    if(h.indexOf("rot")===0){ var c2=proj(drag.G, S.plan[q].c); drag.c2=c2; drag.a0=Math.atan2(drag.start[1]-c2[1], drag.start[0]-c2[0]); drag.wasOK=angOK(q); }
    try{ svg.setPointerCapture(e.pointerId); }catch(_){}
    CELL[p].el.classList.add("is-active");
  });
  svg.addEventListener("pointermove", function(e){
    if(!drag || drag.p!==p) return;
    var m=svgPt(svg, e), q=drag.q, pl=S.plan[q], G=drag.G, p0=drag.pl0, F=drag.F0, L=LIM[q];
    if(drag.h==="body"){
      var d=unproj(G, m[0], m[1]), d0=unproj(G, drag.start[0], drag.start[1]);
      pl.c=add(p0.c, sub(d, d0));
    } else if(drag.h.indexOf("rot")===0){
      if(!canRotate(p, q)){ if(!drag.warned){ drag.warned=true; log("the angle unlocks on the real sagittal T1 — drag it from the tray onto the SAGITTAL panel first.","warn"); } return; }
      var a1=Math.atan2(m[1]-drag.c2[1], m[0]-drag.c2[0]), dd=(a1-drag.a0)*180/Math.PI;
      pl.f=rotFrame(q, drag.F0, cross(G.row, G.col), dd);
      if(needsAngle(q) && angOK(q) && !drag.wasOK){ drag.wasOK=true; angLog(q); }
      if(!angOK(q)) drag.wasOK=false;
    } else {
      var ax=drag.h.split("|")[0], side=drag.h.split("|")[1], s=along(G, p0.c, F[ax], m);
      if(ax==="n"){
        var cov0=coverage(p0), fixed = side==="hi" ? -cov0/2 : cov0/2;
        var n=Math.round((Math.abs(s-fixed)+p0.gap)/(p0.thk+p0.gap));
        pl.n=Math.max(3, Math.min(L.nmax, n));
        var cov=coverage(pl); pl.c=axpy(p0.c, F.n, side==="hi" ? fixed+cov/2 : fixed-cov/2);
      } else {
        pl.fov=Math.max(L.fmin, Math.min(L.fmax, Math.round(2*Math.abs(s)/5)*5));
      }
    }
    clampPlan(q); drawOverlays(); schedulePreview(); renderRail(); renderCmds();
  });
  function end(){ if(drag && drag.p===p){ CELL[p].el.classList.remove("is-active"); drag=null; render(); } }
  svg.addEventListener("pointerup", end); svg.addEventListener("pointercancel", end);
});
function normAng(q, a, exact){
  if(TYPE[q]!=="ax"){ while(a>=180) a-=180; while(a<0) a+=180; }     // coronal ~98, sagittal ~90
  else { while(a>=90) a-=180; while(a<-90) a+=180; }                  // axial ~ +8
  return exact ? a : Math.round(a);
}
function setAngle(q, a, quiet){
  if(!needsAngle(q)) return;
  var was=angOK(q);
  var d=normAng(q, a, true)-axAng(q); if(d>90) d-=180; if(d<-90) d+=180;
  S.plan[q].f=rotFrame(q, S.plan[q].f, angPanelN(q), d);
  if(!quiet){ afterPlan(); }
  if(angOK(q) && !was) angLog(q);
}
function clampPlan(q){
  var pl=S.plan[q];
  pl.c=pl.c.map(function(v, i){ return Math.round(Math.max(HH[i]-120, Math.min(HH[i]+120, v))*2)/2; });
}
var prevT=0;
function schedulePreview(){ if(prevT) return; prevT=requestAnimationFrame(function(){ prevT=0; drawPreview(); }); }
var PREV = { ax:"ax_t2", cor:"cor_t2", sag:"sag_t1" };
function drawPreview(){
  if(S.phase!=="plan") return;
  var q=S.cur, pl=S.plan[q], X=CELL.x, a=analyse(q), id=PREV[q], k=nearestSlice(id, pl.c);
  renderSeries(id, k, X.cv, pl);
  X.lab.textContent="PREVIEW · "+SEQ[q].name+" "+SER[id].seq+"\nnearest slice to the box centre · FOV "+pl.fov+" mm";
  X.lab2.textContent = a.narrow ? "FOV narrower than the head" : a.coarse ? "FOV too big for the matrix" : "matrix "+MAT[q]+" · "+a.res.toFixed(2)+" mm px";
  X.lab2.style.color = a.narrow || a.coarse ? "var(--warn)" : "";
}

/* =============================================================
   PHASES
   ============================================================= */
var PHASE_LABEL = { title:"STANDBY", setup:"PATIENT SET-UP", loc:"LOCALISER", dash:"PROTOCOL", plan:"PLANNING", acquire:"ACQUIRING", view:"IMAGES", result:"REVIEW" };
function setPhase(p){
  S.phase=p;
  phaseChip.textContent=PHASE_LABEL[p]||p;
  room.classList.toggle("scg-hidden", p!=="setup");
  grid.classList.toggle("scg-hidden", !(p==="loc"||p==="dash"||p==="plan"));
  viewEl.classList.toggle("scg-hidden", !(p==="view"||p==="result"));
  acqEl.classList.add("scg-hidden");
  stackUI.classList.toggle("scg-hidden", !(p==="view"||p==="result"));
  winBtns.classList.toggle("scg-hidden", !(p==="view"||p==="result"));
  info.classList.toggle("scg-hidden", p!=="dash");
  CELL.x.cv.style.display = (p==="dash") ? "none" : "";
  vpTL.textContent=""; vpBL.textContent=""; vpBR.textContent="";
  requestAnimationFrame(layoutGrid);
  render();
}

/* =============================================================
   COMMANDS
   ============================================================= */
var COMMANDS = [
  { id:"load", label:"LOAD PATIENT · HEAD FIRST", key:"load", phases:["setup"], needs:"canLoad", primary:true, run:function(){ loadPatient(); } },
  { id:"loc",  label:"RUN 3-PLANE LOCALISER", key:"loc", phases:["setup"], needs:"loaded", primary:true, run:function(){ runLocaliser(); } },
  { id:"auto", label:"AUTO-PLAN (coverage + FOV only)", key:"auto", phases:["plan"], run:function(){ autoPlan(); } },
  { id:"scan", label:"▶ SCAN THIS SEQUENCE", key:"scan", phases:["plan"], needs:"canScan", primary:true, run:function(){ scanSeq(); } },
  { id:"cancel", label:"◀ BACK TO PROTOCOL", key:"back", phases:["plan","view"], run:function(){ gotoDash(); } },
  { id:"finish", label:"FINISH · DEBRIEF", key:"finish", phases:["dash","view"], needs:"allDone", primary:true, run:function(){ showResult(); } },
  { id:"reset", label:"RESET", key:"reset", phases:["dash","plan","view","result"], run:function(){ resetAll(); } }
];
function cmdEnabled(c){
  if(c.phases.indexOf(S.phase)<0) return false;
  if(c.needs==="canLoad") return !!S.pos && !S.loaded && !S.loading;
  if(c.needs==="loaded") return !!S.loaded && !locRunning;
  if(c.needs==="canScan") return !!S.cur && canScan(S.cur);
  if(c.needs==="allDone") return TASKS.every(function(q){ return S.done[q]; });
  return true;
}
function scanBlockReason(q){ return !angOK(q) ? "set the angle on the axial first" : ""; }
function renderCmds(){
  cmds.innerHTML="";
  COMMANDS.forEach(function(c){
    if(c.phases.indexOf(S.phase)<0) return;
    if(c.id==="load" && S.loaded) return;
    if(c.id==="loc" && !S.loaded) return;
    var b=document.createElement("button"), en=cmdEnabled(c);
    var pulse=(c.id==="load"&&S.pos)||(c.id==="loc"&&S.loaded)||(c.id==="scan"&&S.cur&&planOK(S.cur)&&canScan(S.cur))||(c.id==="finish"&&en);
    b.className="scg-btn"+(c.primary?" is-primary":"")+(pulse?" is-pulse":"");
    b.disabled=!en;
    b.innerHTML='<span>'+(c.id==="scan" && S.cur && !canScan(S.cur) ? "▶ SCAN · "+scanBlockReason(S.cur) : c.label)+'</span><span class="scg-key">'+c.key+'</span>';
    b.onclick=function(){ logCmd(c.key); c.run(); };
    cmds.appendChild(b);
  });
}
function parseCommand(raw){
  var t=raw.trim().toLowerCase(); if(!t) return;
  logCmd(t);
  var w=t.split(/\s+/);
  if(t==="help"){
    log("commands here: "+COMMANDS.filter(function(c){ return c.phases.indexOf(S.phase)>=0; }).map(function(c){ return c.key; }).join(", ")+", help","sys");
    log("workflow: choose the head position (neutral | chinup | tilted) → load → loc → plan sag → scan → use sag_t1 → plan ax → angle → scan → plan cor → angle → scan → finish.","sys");
    log("while planning: slices <n> · thick <mm> · gap <mm> · fov <mm> · angle <deg> (axial / coronal once the sagittal T1 is on the sagittal panel; sagittal on the axial) · auto · scan · back","sys");
    log("after a scan: use <series> (e.g. use sag_t1) puts it in place of its localiser · restore <sag|cor|ax> brings the localiser back","sys");
    return;
  }
  if(S.phase==="setup" && POS[w[0]]){ choosePos(w[0]); return; }
  if(w[0]==="use" && (S.phase==="dash"||S.phase==="plan")){
    var id = SER[w[1]] ? w[1] : (SEQ[w[1]] ? Object.keys(S.acq).filter(function(i){ return SER[i].task===w[1]; })[0] : null);
    if(id && S.acq[id]) useSeries(id); else log("nothing acquired for '"+(w[1]||"")+"' yet.","warn");
    return;
  }
  if(w[0]==="restore" && CELL[w[1]] && w[1]!=="x" && (S.phase==="dash"||S.phase==="plan")){ restoreLoc(w[1]); return; }
  if(w[0]==="plan" && SEQ[w[1]] && (S.phase==="dash"||S.phase==="view"||S.phase==="plan")){ gotoPlan(w[1]); return; }
  if(S.phase==="plan" && w[0]==="angle" && !isNaN(parseFloat(w[1]))){
    if(LOCK[S.cur] && !S.swap[ANGP[S.cur]]) log("drag the completed sagittal T1 onto the SAGITTAL panel first — you set the angle on the real sagittal images.","warn");
    else setAngle(S.cur, parseFloat(w[1]));
    return;
  }
  if(S.phase==="plan" && (w[0]==="slices"||w[0]==="thick"||w[0]==="gap"||w[0]==="fov") && !isNaN(parseFloat(w[1]))){
    var v=parseFloat(w[1]);
    if(w[0]==="slices") setN(S.cur, Math.round(v)); else if(w[0]==="thick") setThk(S.cur, v); else if(w[0]==="gap") setGap(S.cur, v); else setFov(S.cur, v);
    return;
  }
  var c=COMMANDS.filter(function(c){ return c.key===t || c.id===t; })[0];
  if(!c){ log("unknown command: "+t+"  (try: help)","warn"); return; }
  if(c.phases.indexOf(S.phase)<0){ log("'"+t+"' is not available here.","warn"); return; }
  if(!cmdEnabled(c)){ log(c.id==="scan" ? scanBlockReason(S.cur)+"." : "'"+t+"' is locked right now.","warn"); return; }
  c.run();
}
cliForm.addEventListener("submit", function(e){ e.preventDefault(); var v=cli.value; cli.value=""; parseCommand(v); });

/* =============================================================
   RAIL
   ============================================================= */
function kvBlock(rows){ return '<div>'+rows.map(function(r){ return '<div class="scg-kv"><span>'+r[0]+'</span><span>'+r[1]+'</span></div>'; }).join('')+'</div>'; }
function checks(){
  var P=POS[S.pos||"neutral"];
  return [ "Request checked: <b>MRI brain</b> — 30-year-old man, 3 months of new daily headaches, normal neurological examination; query structural cause · MR safety questionnaire done, metal, hair clips and hearing aids removed",
           "Supine, <b>head first</b>, in the <b>32-channel head coil</b>",
           P.fit,
           "Ear protection: <b>earplugs + headphones</b> (the head is right inside the noisy gradients) · call bell in the hand",
           "Mirror on the coil so the patient can see out · eyes closed if possible (less motion artefact from the eyes)",
           "Coil top clicked on, clear of the nose · blanket, knees supported",
           "Landmark laser on the <b>nasion</b> (bridge of the nose) · sent to isocentre" ];
}
function seqList(q){
  return '<div class="mre-seqs">'+SEQ[q].seqs.map(function(s){
    var on=!!S.chosen[q][s.id];
    return '<label class="'+(on?"is-on":"")+'"><input type="checkbox" data-q="'+q+'" data-s="'+s.id+'"'+(on?" checked":"")+'><span><b>'+s.name+'</b>'+
      (s.have?'<em>IMAGES IN THIS DEMO</em>':(s.rec?'<em>RECOMMENDED</em>':''))+'<br>'+s.why+'</span></label>';
  }).join('')+'</div>';
}
function bindSeqList(){
  Array.prototype.forEach.call(railBody.querySelectorAll(".mre-seqs input"), function(cb){
    cb.onchange=function(){ var q=cb.dataset.q, s=cb.dataset.s; if(cb.checked) S.chosen[q][s]=1; else delete S.chosen[q][s]; renderRail(); };
  });
}
function angText(q, ok){
  return q==="ax" ? (ok ? "Angle: parallel to the AC-PC line" : "Angle: not yet parallel to the AC-PC line")
       : q==="cor" ? (ok ? "Angle: perpendicular to the AC-PC line" : "Angle: not yet perpendicular to the AC-PC line")
       : (ok ? "Angle: parallel to the falx (midline)" : "Angle: not yet parallel to the falx");
}
function covBlock(q){
  var a=analyse(q);
  return '<div class="mre-cov">'+a.key.map(function(k){ return '<div class="'+(k.ok?"ok":"miss")+'"><i>'+(k.ok?"✓":"✗")+'</i><span>'+k.name+'</span></div>'; }).join('')+
    (needsAngle(q) ? '<div class="'+(a.angOK?"ok":"miss")+'"><i>'+(a.angOK?"✓":"!")+'</i><span>'+angText(q, a.angOK)+'</span></div>' : '')+
    (a.coarse?'<div class="miss"><i>!</i><span>FOV over '+LIM[q].coarse+' mm — pixels '+a.res.toFixed(2)+' mm, too coarse for the cortex</span></div>':'')+
    (a.narrow?'<div class="miss"><i>!</i><span>FOV under '+LIM[q].narrow+' mm — narrower than the head: wrap-around</span></div>':'')+
    (a.over?'<div class="miss"><i>·</i><span>More coverage than needed — extra slices add scan time</span></div>':'')+'</div>';
}
function angleBlock(q){
  var a=analyse(q), P=ANGP[q], btns=function(lock){ return '<div class="mre-ang"><span>ROTATE</span>'+[-5,-1,1,5].map(function(d, i){ return (i===2?'<output>'+Math.round(axAng(q))+'°</output>':'')+'<button type="button"'+(lock?' class="is-lock"':'')+' data-d="'+d+'">'+(d>0?"+":"−")+Math.abs(d)+'°</button>'; }).join('')+'</div>'; };
  if(!LOCK[q]){
    return '<div class="mre-angbox '+(a.angOK?"is-ok":"is-bad")+'"><b class="t">SAGITTAL ANGLE ON THE AXIAL</b>'+btns(false)+
      '<div class="scg-hint '+(a.angOK?"is-ok":"is-warn")+'">'+(a.angOK ? "✓ Parallel to the falx — every slice is a true sagittal, and the middle one runs right down the midline."
        : "On the <b>AX</b> localiser, drag ⟳ so the slices run <b>parallel to the falx</b> (the bright line between the two hemispheres, front to back). Check it is straight on the <b>COR</b> too.")+'</div></div>';
  }
  if(!S.swap[P]){
    var ids=Object.keys(S.acq).filter(function(id){ return SER[id].plane===P; });
    return '<div class="mre-angbox is-bad"><b class="t">'+SEQ[q].name+' ANGLE ON THE SAGITTAL · 🔒 LOCKED</b>'+btns(true)+
      '<div class="scg-hint is-warn">To unlock the angle, drag your sagittal T1 below onto the <b>SAGITTAL</b> panel (top left) — or tap it. The localiser is too coarse to see the anterior and posterior commissures.</div>'+
      '<div class="mre-tray">'+ids.map(function(id){ return '<button type="button" class="mre-thumb" data-id="'+id+'" title="Drag onto the SAG localiser"><canvas width="152" height="152"></canvas><span>SAG · '+SER[id].seq+'</span></button>'; }).join('')+'</div></div>';
  }
  return '<div class="mre-angbox '+(a.angOK?"is-ok":"is-bad")+'"><b class="t">'+SEQ[q].name+' ANGLE ON THE SAGITTAL</b>'+btns(false)+
    '<div class="scg-hint '+(a.angOK?"is-ok":"is-warn")+'">'+(a.angOK ? (q==="ax" ? "✓ Parallel to the AC-PC line — the standard axial, comparable with every previous and future brain scan." : "✓ Perpendicular to the AC-PC line — a true coronal, along the brainstem.")
      : "On the midline sagittal, find the <b>anterior commissure</b> (a small white dot at the front of the third ventricle, below the fornix) and the <b>posterior commissure</b> (at the back of the third ventricle, just above the aqueduct). Drag ⟳ so the box runs "+(q==="ax"?"<b>parallel</b>":"<b>perpendicular</b>")+" to the line joining them. Straight won't do: in this head that line dips about "+Math.round(REF.ax)+"° toward the back.")+
    ' Keep it straight on the '+(q==="ax"?"<b>COR</b>":"<b>AX</b>")+' panel.</div></div>';
}
function renderRail(){
  var p=S.phase;
  if(p==="setup"){
    railTitle.textContent="Patient set-up"; railDesc.textContent="Brain · 32-channel head coil, head first";
    var CH=checks(), done=S.loaded ? CH.length : (S.loading ? S.checkN||1 : 1);
    railBody.innerHTML=(S.loaded||S.loading ? "" :
      '<div class="scg-hint">How should the <b>head</b> lie in the coil for a 25-minute brain scan? Pick a position to see it — you can change it until you load.</div>'+
      '<div class="scg-choice">'+Object.keys(POS).map(function(k){ return '<button type="button" data-p="'+k+'" class="'+(S.pos===k?"is-on":"")+'"><b>'+POS[k].label+'</b><span>'+POS[k].desc+'</span></button>'; }).join('')+'</div>')+
      (S.pos ? '<div class="scg-hint '+(POS[S.pos].cls==="ok"?"is-ok":"is-warn")+'">'+POS[S.pos].note+'</div>'+
        '<div class="scg-check">'+CH.map(function(c,i){ return '<div class="'+(i<done?"is-done":"")+'"><i>'+(i<done?"✓":"○")+'</i><span>'+c+'</span></div>'; }).join('')+'</div>'+
        '<div class="scg-hint">'+(S.loaded?"Nasion at isocentre. Command: <b>loc</b> — 3-plane localiser.":S.loading?"Table moving…":"Command: <b>load</b> — the table moves head first and the nasion is sent to isocentre.")+'</div>' : "");
    Array.prototype.forEach.call(railBody.querySelectorAll(".scg-choice button"), function(b){ b.onclick=function(){ logCmd(b.dataset.p); choosePos(b.dataset.p); }; });
  }
  else if(p==="loc"){
    railTitle.textContent="Localiser"; railDesc.textContent="3-plane gradient echo · 280 mm FOV";
    railBody.innerHTML=kvBlock([["Sequence","fast GRE · 1 sagittal · 1 coronal · 1 axial"],["FOV","280 mm · 256 matrix · 8 mm"],["Coil","32-channel head array"],["Position",POS[S.pos].short]])+
      '<div class="scg-hint">Each image is built line by line: every phase-encode step fills one row of <b>k-space</b> (bottom right). The centre rows carry the contrast, the outer rows the fine detail — watch the image appear, then sharpen. The head array is most sensitive near its elements, so the brain\'s surface looks brighter than its centre.</div>'+
      '<div class="scg-hint">This study\'s own localiser wasn\'t shared, so these three are rebuilt from the volunteer\'s real 3D T1 (see the credits). The dark blocks over the face are the dataset\'s de-identification (defacing), not an artefact.</div>';
  }
  else if(p==="dash"){
    railTitle.textContent="Protocol"; railDesc.textContent="Sagittal first — then the axial and coronal angled on it";
    railBody.innerHTML='<div class="mre-cards">'+TASKS.map(function(q){
      var d=S.done[q], ok=d && planOK(q), locked=q!==FIRST && !S.done[FIRST],
          names=SEQ[q].seqs.filter(function(s){ return S.chosen[q][s.id]; }).map(function(s){ return s.name; });
      return '<div class="mre-card'+(d?" is-done":"")+(locked?" is-locked":"")+'"><div class="mre-card-h"><i class="mre-sw" style="background:'+COLORS[q]+'"></i><b>'+SEQ[q].name+'</b>'+
        '<span class="mre-chip '+(d?(ok?"ok":"warn"):"")+'">'+(d?(ok?"✓ SCANNED":"⚠ SCANNED · GAPS"):(locked?"🔒 AFTER THE SAGITTAL":"○ NOT PLANNED"))+'</span></div>'+
        '<p>'+(names.length?names.join(" · "):"no sequence chosen")+'</p>'+
        (d?'<p>'+regionName(q, edges(q)[0])+' → '+regionName(q, edges(q)[1])+' · '+S.plan[q].n+' slices'+(needsAngle(q)?' · '+Math.round(axAng(q))+'°':'')+'</p>':
          (locked?'<p>Scan the sagittal first — the axial and coronal are angled on it.</p>':''))+
        '<button class="scg-btn'+(d||locked?"":" is-primary")+'" type="button" data-q="'+q+'"'+(locked?" disabled":"")+'><span>'+(d?"RE-PLAN":"PLAN")+' '+SEQ[q].name+'</span><span class="scg-key">plan '+q+'</span></button></div>';
    }).join('')+'</div><div class="scg-hint">The localisers on the left show every plane you have scanned so far, in its colour.</div>'+trayBlock();
    Array.prototype.forEach.call(railBody.querySelectorAll(".mre-card button"), function(b){ b.onclick=function(){ logCmd("plan "+b.dataset.q); gotoPlan(b.dataset.q); }; });
    bindTray();
  }
  else if(p==="plan"){
    var q=S.cur, pl=S.plan[q], a=analyse(q), ok=planOK(q), e=edges(q), ids=imaged(q);
    railTitle.textContent="Plan · "+SEQ[q].name; railDesc.textContent= q==="sag" ? "Angle on the axial · size on any panel" : "Angle on the sagittal T1 · size on any panel";
    railBody.innerHTML='<div class="scg-hint '+(ok?"is-ok":"is-warn")+'">'+(ok?"Whole brain covered, and the angle is right. Command: <b>scan</b>":SEQ[q].hint)+'</div>'+
      angleBlock(q)+
      kvBlock([["Covers",'<b style="color:'+(a.all?"var(--accent)":"var(--warn)")+'">'+regionName(q,e[0])+' → '+regionName(q,e[1])+'</b>'],
               ["Coverage",a.cov.toFixed(0)+" mm ("+SEQ[q].dirName+" axis)"],
               ["FOV / matrix",pl.fov+" mm · "+MAT[q]+" · "+a.res.toFixed(2)+" mm px"],
               ["Est. scan time","≈ "+mmss(ids.reduce(function(t,id){ return t+scanTime(id); },0))+" ("+ids.map(function(id){ return SER[id].seq; }).join(" + ")+")"]])+
      '<div class="mre-step"><span>SLICES</span><button type="button" data-a="n" data-d="-1">−</button><output>'+pl.n+'</output><button type="button" data-a="n" data-d="1">+</button></div>'+
      '<div class="mre-step"><span>THICK</span><button type="button" data-a="thk" data-d="-0.5">−</button><output>'+pl.thk+' mm</output><button type="button" data-a="thk" data-d="0.5">+</button></div>'+
      '<div class="mre-step"><span>GAP</span><button type="button" data-a="gap" data-d="-0.5">−</button><output>'+pl.gap.toFixed(1)+' mm</output><button type="button" data-a="gap" data-d="0.5">+</button></div>'+
      '<div class="mre-step"><span>FOV</span><button type="button" data-a="fov" data-d="-10">−</button><output>'+pl.fov+' mm</output><button type="button" data-a="fov" data-d="10">+</button></div>'+
      '<div class="scg-hint">Anatomy in this stack:</div>'+covBlock(q)+
      trayBlock()+
      '<div class="scg-hint">Sequences to run in this plane (tick what you would acquire):</div>'+seqList(q);
    Array.prototype.forEach.call(railBody.querySelectorAll(".mre-step button"), function(b){
      b.onclick=function(){ var d=parseFloat(b.dataset.d), pl=S.plan[S.cur];
        if(b.dataset.a==="n") setN(S.cur, pl.n+d); else if(b.dataset.a==="thk") setThk(S.cur, pl.thk+d); else if(b.dataset.a==="gap") setGap(S.cur, pl.gap+d); else setFov(S.cur, pl.fov+d); };
    });
    Array.prototype.forEach.call(railBody.querySelectorAll(".mre-ang button"), function(b){
      b.onclick=function(){ var d=parseFloat(b.dataset.d); logCmd("angle "+Math.round(axAng(S.cur)+d));
        if(LOCK[S.cur] && !S.swap[ANGP[S.cur]]){ log("drag the completed sagittal T1 onto the SAGITTAL panel first — you set the angle on the real sagittal images.","warn"); return; }
        setAngle(S.cur, axAng(S.cur)+d); };
    });
    bindSeqList(); bindTray();
  }
  else if(p==="acquire"){
    var cq=S.cur;
    railTitle.textContent="Acquiring · "+SEQ[cq].name; railDesc.textContent=imaged(cq).map(function(id){ return SER[id].seq; }).join(" + ");
    railBody.innerHTML=kvBlock([["Slices",S.plan[cq].n+" × "+S.plan[cq].thk+" mm"],["Est. time","≈ "+mmss(imaged(cq).reduce(function(t,id){ return t+scanTime(id); },0))+" (shown faster)"],
      ["Patient","“keep your head as still as you can — it will be loud”"]]);
  }
  else if(p==="view"){
    var v=S.viewId, vq=SER[v].task, an=analyse(vq);
    railTitle.textContent=SEQ[vq].name+" · images"; railDesc.textContent="Scroll the slices your plan covers";
    railBody.innerHTML=kvBlock([["Series",SER[v].seq+" · "+SER[v].params],["Images",S.list.length+" of "+SER[v].n+" slices"],["Covers",regionName(vq,an.lo)+" → "+regionName(vq,an.hi)],["Navigate","wheel / drag / ↑ ↓"]])+
      covBlock(vq)+'<div class="scg-hint">'+(an.all?"Everything you need for this plane is in the stack.":"Anything ticked ✗ was outside your stack or FOV — it would need another scan.")+
      (vq===FIRST?' Next: <b>back</b> to the protocol; for the axial and coronal, drag this series onto the <b>SAGITTAL</b> panel to set their angle.':' <b>back</b> returns to the protocol.')+'</div>';
  }
  else if(p==="result"){
    railTitle.textContent="Review"; railDesc.textContent="Every series you acquired · scroll each stack";
    railBody.innerHTML=kvBlock(TASKS.map(function(q){ return [SEQ[q].name, S.plan[q].n+" sl"+(needsAngle(q)?" · "+Math.round(axAng(q))+"°":"")+" · "+(planOK(q)?"✓":"⚠")]; }).concat([["POSITION",POS[S.pos].short+" · "+(POS[S.pos].cls==="ok"?"✓":"⚠")]]))+
      '<div class="scg-hint">Switch series with the buttons on the image. The full debrief, sequences to consider and credits are below.</div>';
  }
  else { railTitle.textContent="Console"; railDesc.textContent="Awaiting operator"; railBody.innerHTML=""; }
}
function setN(q, n){ var pl=S.plan[q], F=frame(q), lo=edges(q)[0]-dot(sub(pl.c,HH),F.n); pl.n=Math.max(3, Math.min(LIM[q].nmax, Math.round(n))); pl.c=axpy(pl.c, F.n, lo+coverage(pl)/2); afterPlan(); }
function setThk(q, t){ var L=LIM[q]; S.plan[q].thk=Math.max(L.tmin, Math.min(L.tmax, Math.round(t*2)/2)); afterPlan(); }
function setGap(q, g){ S.plan[q].gap = Math.max(0, Math.min(5, Math.round(g*10)/10)); afterPlan(); }
function setFov(q, f){ var L=LIM[q]; S.plan[q].fov=Math.max(L.fmin, Math.min(L.fmax, Math.round(f/5)*5)); afterPlan(); }
function afterPlan(){ clampPlan(S.cur); drawOverlays(); schedulePreview(); render(); }
function render(){ renderCmds(); renderRail(); if(S.phase==="dash"||S.phase==="plan"||S.phase==="result") drawOverlays(); if(S.phase==="dash") renderInfo(); }
function renderInfo(){
  CELL.x.lab.textContent=""; CELL.x.lab2.textContent="";
  info.innerHTML='<b>PROTOCOL · ROUTINE BRAIN</b><div>Position: '+POS[S.pos].short+' · head first · 32-channel head coil</div>'+
    TASKS.map(function(q){ var d=S.done[q];
      return '<div class="mre-row"><i class="mre-sw" style="background:'+COLORS[q]+'"></i><span><b>'+SEQ[q].name+'</b> · '+(d?(S.plan[q].n+" slices · "+coverage(S.plan[q]).toFixed(0)+" mm · "+(planOK(q)?"✓":"⚠")):(q!==FIRST&&!S.done[FIRST]?"after the sagittal":"not planned yet"))+'</span></div>'; }).join('')+
    '<div style="margin-top:6px">Order matters: the <b>sagittal T1</b> goes first, parallel to the falx, ear to ear. The <b>axial</b> and <b>coronal</b> are then angled on its midline slice — the axial parallel to the AC-PC line, the coronal perpendicular — so every brain is imaged the same way, and this scan can be compared with the next one.</div>'+
    (Object.keys(S.acq).length?'<div>Completed series can replace the localiser of the same plane — drag them in from the tray on the right.</div>':'');
}

/* =============================================================
   SET-UP
   ============================================================= */
function choosePos(p){
  if(S.loaded || S.loading || S.pos===p) return;
  S.pos=p;
  log(POS[p].note, POS[p].cls==="ok"?"ok":"warn");
  if(room3d) room3d.setPose(p);
  setRoomCaption(); render();
  log("Command: <b>load</b>","sys");
}
function setRoomCaption(){
  room.querySelector(".scg-roomcap b").textContent = S.pos ? POS[S.pos].cap : "PATIENT ON THE TABLE";
  $("scgRoomStep").textContent = S.pos ? POS[S.pos].sub+" · 32-channel head coil" : "supine, head first, in the head coil — choose how the head lies";
}
var THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js";
var room3d=null, room3dTried=false;
window.__room=function(){ return room3d; };
function init3D(){
  if(room3dTried){ if(room3d){ room3d.setPose(S.pos||"neutral"); room3d.reset(); room3d.start(); } return; }
  room3dTried=true;
  if(!window.SCG_ROOM3D) return;
  import(THREE_URL).then(function(THREE){
    try{
      room3d=window.SCG_ROOM3D(THREE, $("scgRoom3d"));
      room3d.setPose(S.pos||"neutral");
      room.classList.add("is-3d"); room3d.start();
      if(S.loading) room3d.finish();
    }catch(e){ room3d=null; room.classList.remove("is-3d"); if(window.console) console.error(e); }
  }).catch(function(){ room3d=null; });
}
function gotoSetup(){
  setPhase("setup"); setRoomCaption(); init3D();
  log("MRI brain requested — a 30-year-old man with 3 months of new daily headaches and a normal neurological examination; query a structural cause. The patient is on the table, supine, head first, in the 32-channel head coil.","sys");
}
function loadPatient(){
  if(S.loaded||S.loading||!S.pos) return;
  S.loading=true; S.checkN=3; render();
  var stepTx=$("scgRoomStep");
  function finishLoad(){ S.checkN=checks().length; S.loading=false; S.loaded=true;
    stepTx.textContent="nasion at isocentre";
    log("nasion at isocentre. Command: <b>loc</b>","ok"); render(); }
  if(room3d){
    log("table moving — head first toward the magnet…","sys");
    room3d.play(function(step){
      if(step===1){ S.checkN=5; stepTx.textContent="table moving head first"; }
      if(step===2){ S.checkN=6; stepTx.textContent="landmark laser on the nasion"; log("laser on — nasion landmarked (eyes closed for the laser).","sys"); }
      if(step===3){ stepTx.textContent="sending the landmark to isocentre"; }
      if(step===4){ stepTx.textContent="in the bore: the head sits at isocentre"; }
      render();
    }, finishLoad);
    return;
  }
  var iv=setInterval(function(){ S.checkN++; render(); if(S.checkN>=checks().length){ clearInterval(iv); finishLoad(); } }, 700);
}

/* =============================================================
   LOCALISER (k-space fill of the 3-plane localiser)
   ============================================================= */
var locRunning=false;
function runLocaliser(){
  if(locRunning||!S.loaded) return;
  locRunning=true;
  if(room3d) room3d.stop();
  setPhase("loc");
  PANELS.forEach(function(p){ var c=CELL[p]; c.img.style.display="none"; c.svg.innerHTML=""; c.cv.width=c.cv.height=256; c.el.classList.add("is-wait"); c.lab.textContent=NAME[p]+" LOCALISER\nwaiting"; c.lab2.textContent=""; });
  CELL.x.cv.width=CELL.x.cv.height=256; CELL.x.lab.textContent="K-SPACE"; CELL.x.lab2.textContent="";
  log("3-plane localiser: fast gradient echo, one slice per plane, 280 mm FOV — “keep still, about 20 seconds”.","sys");
  var order=["sag","cor","ax"], i=0;
  (function next(){
    if(S.phase!=="loc") return;
    if(i>=order.length){ locRunning=false; S.locDone=true; log("localiser complete — 3 images stored.","ok"); gotoDash(); return; }
    var p=order[i++];
    prepK(p, function(){ acquireLoc(p, next); });
  })();
}
function acquireLoc(p, done){
  var c=CELL[p], K=KS[p], kg=CELL.x.cv.getContext("2d"), dur=2300, t0=performance.now(), last=-1;
  c.el.classList.remove("is-wait"); c.el.classList.add("is-active");
  var bar=document.createElement("i"); bar.className="mre-acqbar"; c.el.appendChild(bar);
  function frame(now){
    if(S.phase!=="loc"){ bar.remove(); return; }
    var f=Math.min(1,(now-t0)/dur), lines=Math.round(f*LN);
    if(lines-last>=6 || f>=1){
      last=lines; partialRecon(p, lines, c.cv);
      kg.fillStyle="#000"; kg.fillRect(0,0,256,256);
      if(lines>0) kg.drawImage(K.kc, 0, 0, 256, lines, 0, 0, 256, lines);
      kg.fillStyle="rgba(95,224,138,.9)"; kg.fillRect(0, Math.min(255,lines), 256, 1.5);
      c.lab.textContent=NAME[p]+" LOCALISER\nphase-encode "+lines+" / 256";
      CELL.x.lab.textContent="K-SPACE · "+NAME[p]+"\nline "+lines+" / 256";
      bar.style.width=(f*100)+"%";
    }
    if(f<1){ requestAnimationFrame(frame); return; }
    bar.remove(); c.el.classList.remove("is-active");
    c.img.style.display=""; c.lab.textContent=NAME[p]+" LOCALISER\nGRE · 8 mm";
    setTimeout(done, 250);
  }
  requestAnimationFrame(frame);
}

/* =============================================================
   PROTOCOL DASHBOARD + PLANNING
   ============================================================= */
function gotoDash(){
  setPhase("dash");
  refreshCells();
  render();
  if(!Object.keys(S.done).length) log("start with the <b>sagittal</b> (<b>plan sag</b>). The axial and coronal unlock once it is scanned.","sys");
}
function gotoPlan(q){
  if(q!==FIRST && !S.done[FIRST]){ log("scan the sagittal first — the axial and coronal are angled on those images.","warn"); return; }
  S.cur=q;
  CELL.x.cv.width=CELL.x.cv.height=384;
  setPhase("plan");
  refreshCells();
  drawPreview();
  log("planning the <b>"+SEQ[q].name.toLowerCase()+"</b>: "+SEQ[q].hint,"sys");
  if(LOCK[q] && !S.swap[ANGP[q]]) log("drag your sagittal T1 from the tray onto the <b>SAGITTAL</b> panel to unlock the rotate handle.","warn");
}
/* ---- completed series can replace the localiser of the same plane ---- */
function cellLabel(p){
  var base=NAME[p]+" LOCALISER";
  if(!S.swap[p]) return base;
  var sw=S.swap[p], s=SER[sw.id], list=S.acq[sw.id];
  return NAME[p]+" · "+s.seq+" (series)\nIM "+(sw.i+1)+"/"+list.length+" · scroll";
}
function refreshCells(){
  PANELS.forEach(function(p){
    var c=CELL[p], on=!!S.swap[p];
    c.el.classList.toggle("is-series", on);
    c.img.style.display = on ? "none" : "";
    var rb=c.el.querySelector(".mre-restore"), sc=c.el.querySelector(".mre-scroll");
    if(on && !rb){
      rb=document.createElement("button"); rb.type="button"; rb.className="mre-restore"; rb.textContent="↺ LOC";
      rb.onclick=function(){ logCmd("restore "+p); restoreLoc(p); }; c.el.appendChild(rb);
      sc=document.createElement("div"); sc.className="mre-scroll";
      sc.innerHTML='<button type="button" aria-label="previous slice">▲</button><button type="button" aria-label="next slice">▼</button>';
      sc.children[0].onclick=function(){ scrollCell(p, -1); }; sc.children[1].onclick=function(){ scrollCell(p, 1); };
      c.el.appendChild(sc);
    }
    if(!on && rb){ rb.remove(); if(sc) sc.remove(); }
    if(on) drawCellSeries(p); else { if(c.cv.width!==256){ c.cv.width=c.cv.height=256; } c.cv.getContext("2d").clearRect(0,0,256,256); }
    c.lab.textContent=cellLabel(p);
  });
}
function drawCellSeries(p){
  var c=CELL[p], cv=c.cv, sw=S.swap[p], k=S.acq[sw.id][sw.i];
  if(cv.width!==512){ cv.width=cv.height=512; }
  getImg(imgName(sw.id, k), function(im){
    if(!S.swap[p] || S.acq[S.swap[p].id][S.swap[p].i]!==k) return;
    var g=cv.getContext("2d"); g.setTransform(1,0,0,1,0,0); g.imageSmoothingEnabled=true; g.imageSmoothingQuality="high";
    g.drawImage(im, 0, 0, 512, 512);
  });
}
var ACPT = LM.ac;                                              // the midline sagittal through the anterior commissure
function closestIn(id, list, P){ var b=0; list.forEach(function(k, j){ if(Math.abs(dot(sub(P, SER[id].ipp[k]), SER[id].nrm)) < Math.abs(dot(sub(P, SER[id].ipp[list[b]]), SER[id].nrm))) b=j; }); return b; }
function useSeries(id){
  if(!S.acq[id]) return;
  var p=SER[id].plane, list=S.acq[id], i=Math.floor(list.length/2);
  if(p==="sag") i=closestIn(id, list, ACPT);
  S.swap[p]={ id:id, i:i };
  log(SER[id].seq+" now replaces the "+NAME[p]+" localiser"+(p==="sag"?" — opened on the midline. Find the anterior and posterior commissures and line the axial up with them.":" — sharper anatomy to plan on."),"ok");
  refreshCells(); render(); schedulePreview();
}
function restoreLoc(p){ delete S.swap[p]; log(NAME[p]+" localiser restored.","sys"); refreshCells(); render(); schedulePreview(); }
function scrollCell(p, d){
  var sw=S.swap[p]; if(!sw) return;
  var i=Math.max(0, Math.min(S.acq[sw.id].length-1, sw.i+d)); if(i===sw.i) return;
  sw.i=i; drawCellSeries(p); CELL[p].lab.textContent=cellLabel(p); drawOverlays();
}
PANELS.forEach(function(p){
  CELL[p].el.addEventListener("wheel", function(e){ if(!S.swap[p] || !(S.phase==="plan"||S.phase==="dash")) return; e.preventDefault(); scrollCell(p, e.deltaY>0?1:-1); }, { passive:false });
});
function trayBlock(){
  var ids=Object.keys(S.acq);
  if(!ids.length) return "";
  return '<div class="scg-hint">Completed series — <b>drag one onto its localiser</b> (or tap it) to plan on the real images:</div><div class="mre-tray">'+
    ids.map(function(id){ var p=SER[id].plane; return '<button type="button" class="mre-thumb'+(S.swap[p]&&S.swap[p].id===id?" is-used":"")+'" data-id="'+id+'" title="Drag onto the '+NAME[p]+' localiser"><canvas width="152" height="152"></canvas><span>'+NAME[p]+' · '+SER[id].seq+'</span></button>'; }).join('')+'</div>';
}
var tdrag=null;
function bindTray(){
  Array.prototype.forEach.call(railBody.querySelectorAll(".mre-thumb"), function(b){
    var id=b.dataset.id, p=SER[id].plane, cv=b.querySelector("canvas"), list=S.acq[id];
    renderSeries(id, list[p==="sag" ? closestIn(id, list, ACPT) : Math.floor(list.length/2)], cv);
    b.addEventListener("pointerdown", function(e){
      e.preventDefault();
      tdrag={ id:id, p:p, x:e.clientX, y:e.clientY, moved:false, ghost:null, src:cv };
      try{ b.setPointerCapture(e.pointerId); }catch(_){}
    });
    b.addEventListener("pointermove", function(e){
      if(!tdrag) return;
      if(!tdrag.moved && Math.hypot(e.clientX-tdrag.x, e.clientY-tdrag.y) < 6) return;
      if(!tdrag.moved){
        tdrag.moved=true;
        var g=document.createElement("img"); g.className="mre-ghost"; g.src=tdrag.src.toDataURL("image/jpeg",0.8); document.body.appendChild(g); tdrag.ghost=g;
        PANELS.forEach(function(q){ CELL[q].el.classList.toggle("is-nodrop", q!==tdrag.p); });
      }
      tdrag.ghost.style.left=e.clientX+"px"; tdrag.ghost.style.top=e.clientY+"px";
      CELL[tdrag.p].el.classList.toggle("is-drop", dropCell(e.clientX, e.clientY)===tdrag.p);
    });
    function end(e){
      if(!tdrag) return;
      var d=tdrag; tdrag=null;
      if(d.ghost) d.ghost.remove();
      PANELS.forEach(function(q){ CELL[q].el.classList.remove("is-drop","is-nodrop"); });
      if(!d.moved){ if(e.type==="pointerup"){ logCmd("use "+d.id); useSeries(d.id); } return; }
      var over=e.type==="pointerup" ? dropCell(e.clientX, e.clientY) : null;
      if(!over) return;
      logCmd("use "+d.id);
      if(over!==d.p) log("the "+SER[d.id].seq+" images are "+NAME[d.p]+" slices — they can only replace the "+NAME[d.p]+" localiser.","warn");
      else useSeries(d.id);
    }
    b.addEventListener("pointerup", end); b.addEventListener("pointercancel", end);
  });
}
function dropCell(x, y){
  var el=document.elementFromPoint(x, y), cell=el && el.closest ? el.closest(".mre-cell") : null;
  return cell && cell.dataset.p!=="x" ? cell.dataset.p : null;
}
function autoPlan(){
  var q=S.cur, id=SEQ[q].ideal, s=SER[id], pl=S.plan[q];
  pl.c=seriesCentre(id).map(function(v){ return Math.round(v*2)/2; });
  pl.n=s.n; pl.thk=s.thk; pl.gap=Math.round((s.sp-s.thk)*10)/10;
  pl.fov = q==="sag" ? 250 : 230;
  log("auto-plan: the reference coverage and FOV for the "+SEQ[q].name.toLowerCase()+" — the angle is still yours to set.","sys");
  afterPlan();
}

/* =============================================================
   ACQUIRE + VIEW
   ============================================================= */
function scanSeq(){
  var q=S.cur, a=analyse(q);
  if(!canScan(q)){ log(scanBlockReason(q)+".","warn"); return; }
  if(!a.all) log("scanning with gaps: "+a.key.filter(function(k){ return !k.ok; }).map(function(k){ return k.name.toLowerCase(); }).join("; ")+" not covered.","warn");
  var ids=imaged(q);
  if(!SEQ[q].seqs.some(function(s){ return s.have && S.chosen[q][s.id]; })) log("no imaged sequence ticked — acquiring "+SER[ids[0]].seq+" so there is something to look at.","sys");
  setPhase("acquire");
  acqEl.classList.remove("scg-hidden"); acqTitle.textContent="ACQUIRING · "+SEQ[q].name;
  var t0=performance.now(), dur=2400*ids.length, total=ids.reduce(function(t,id){ return t+scanTime(id); },0);
  (function tick(now){
    if(S.phase!=="acquire") return;
    var f=Math.max(0, Math.min(1,((now||performance.now())-t0)/dur)), cur=ids[Math.min(ids.length-1, Math.floor(f*ids.length))];
    acqNum.textContent=SER[cur].seq+" · "+S.plan[q].n+" slices · "+mmss(Math.round(total*(1-f)))+" remaining";
    if(f<1){ requestAnimationFrame(tick); return; }
    S.done[q]=true;
    Object.keys(S.acq).forEach(function(id){ if(SER[id].task===q) delete S.acq[id]; });
    ids.forEach(function(id){ var l=coveredSlices(id); S.acq[id]= l.length ? l : [nearestSlice(id, S.plan[q].c)]; });
    S.ids[q]=ids;
    Object.keys(S.swap).forEach(function(p){ var sw=S.swap[p]; if(!S.acq[sw.id]) delete S.swap[p]; else sw.i=Math.min(sw.i, S.acq[sw.id].length-1); });
    if(q===FIRST) log("tip: for the axial and coronal, drag this sagittal onto the SAGITTAL panel — that is where you set their angle.","sys");
    log(SEQ[q].name.toLowerCase()+" acquired — "+ids.map(function(id){ return SER[id].seq+" "+S.acq[id].length+" images"; }).join(", ")+".", planOK(q)?"ok":"warn");
    showSeries(ids[0], "view");
  })();
}
function viewIds(){ return S.phase==="result" ? Object.keys(S.acq) : (S.ids[SER[S.viewId].task]||[S.viewId]); }
function showSeries(id, phase){
  S.viewId=id; S.list=S.acq[id];
  if(phase) setPhase(phase);
  stackSlider.max=S.list.length-1; S.viewK=Math.floor(S.list.length/2); stackSlider.value=S.viewK;
  winBtns.innerHTML=viewIds().map(function(i){ return '<button type="button" data-id="'+i+'" class="'+(i===id?"is-on":"")+'">'+NAME[SER[i].task]+' '+SER[i].seq+'</button>'; }).join('');
  Array.prototype.forEach.call(winBtns.querySelectorAll("button"), function(b){ b.onclick=function(){ showSeries(b.dataset.id, null); }; });
  drawView(); render();
}
function drawView(){
  var id=S.viewId, q=SER[id].task, k=S.list[S.viewK];
  renderSeries(id, k, viewCv);
  var pos=dot(sub(sliceCentre(id,k), HH), frame(q).n);
  vpTL.textContent=SEQ[q].name+" · "+SER[id].seq+"\nIM "+(S.viewK+1)+" / "+S.list.length+"  ·  "+SEQ[q].dirName+" "+sgn(pos)+" mm";
  vpBL.textContent=regionName(q, pos);
  vpBR.textContent="FOV "+S.plan[q].fov+" mm\nBRAIN · "+(SER[id].native?"as acquired":"3D reformat");
}
stackSlider.addEventListener("input", function(){ S.viewK=+stackSlider.value; drawView(); });
viewEl.addEventListener("wheel", function(e){ if(!(S.phase==="view"||S.phase==="result")) return; e.preventDefault(); stepView(e.deltaY>0?1:-1); }, { passive:false });
var vdrag=null;
viewEl.addEventListener("pointerdown", function(e){ vdrag={ y:e.clientY, k:S.viewK }; try{ viewEl.setPointerCapture(e.pointerId); }catch(_){} });
viewEl.addEventListener("pointermove", function(e){ if(!vdrag) return; var k=vdrag.k+Math.round((e.clientY-vdrag.y)/12); k=Math.max(0, Math.min(S.list.length-1, k)); if(k!==S.viewK){ S.viewK=k; stackSlider.value=k; drawView(); } });
viewEl.addEventListener("pointerup", function(){ vdrag=null; });
function stepView(d){ var k=Math.max(0, Math.min(S.list.length-1, S.viewK+d)); if(k!==S.viewK){ S.viewK=k; stackSlider.value=k; drawView(); } }
document.addEventListener("keydown", function(e){
  if(!(S.phase==="view"||S.phase==="result") || document.activeElement===cli) return;
  if(e.key==="ArrowDown"||e.key==="ArrowRight"){ e.preventDefault(); stepView(1); }
  if(e.key==="ArrowUp"||e.key==="ArrowLeft"){ e.preventDefault(); stepView(-1); }
});

/* =============================================================
   RESULT
   ============================================================= */
function showResult(){
  var planes=TASKS.every(planOK), posOK=POS[S.pos].cls==="ok", all=planes && posOK;
  setPhase("result");
  showSeries(S.ids.ax ? S.ids.ax[0] : S.ids.sag[0], null);
  var rows=TASKS.map(function(q){
    var a=analyse(q), ok=planOK(q);
    var refTxt = q==="ax" ? "the AC-PC line" : q==="cor" ? "the perpendicular to the AC-PC line" : "the falx";
    return '<div class="scg-drow"><i class="scg-d-'+(ok?"ok":"warn")+'">'+(ok?"✓":"⚠")+'</i><div><b>'+SEQ[q].name+'</b><em>'+S.plan[q].n+' × '+S.plan[q].thk+' mm · FOV '+S.plan[q].fov+' · '+Math.round(axAng(q))+'°</em>'+
      '<p>'+regionName(q,a.lo)+' → '+regionName(q,a.hi)+' ('+a.cov.toFixed(0)+' mm). '+
      (a.angOK ? "Angle within "+Math.abs(a.ang).toFixed(0)+"° of "+refTxt+". " : "Angle "+Math.abs(a.ang).toFixed(0)+"° away from "+refTxt+". ")+
      (a.all?"All key structures covered.":"Missed: "+a.key.filter(function(k){ return !k.ok; }).map(function(k){ return k.name; }).join("; ")+".")+
      (a.narrow?" FOV narrower than the head.":"")+(a.coarse?" FOV too coarse.":"")+
      (a.over?" More coverage than needed — extra slices add scan time.":"")+'</p></div></div>';
  }).join('');
  var seqRows=TASKS.map(function(q){
    return SEQ[q].seqs.map(function(s, i){
      var on=!!S.chosen[q][s.id];
      return '<tr class="'+(on?"is-on":"")+'"><td>'+(i===0?'<b>'+SEQ[q].name+'</b>':'')+'</td><td><b>'+s.name+'</b>'+(s.have?" ·&nbsp;shown here":"")+'</td><td>'+s.why+'</td><td>'+(on?"✓ in your protocol":(s.rec?"recommended":"optional"))+'</td></tr>';
    }).join('');
  }).join('');
  var HL={ sag:"midline · your AX + COR (solid)\nAC-PC reference (dashed)", ax:"at the AC-PC level", cor:"through the brainstem" };
  resultEl.innerHTML=
    '<div><h2'+(all?'':' class="is-bad"')+'>'+(all?"Every grey cell, square to AC-PC":"Planning debrief")+'</h2>'+
    '<div class="scg-cap">Demonstration only: how much of the brain your plans cover and how well each plane is angled. Position: <b>'+POS[S.pos].short+'</b> — '+POS[S.pos].note+'</div>'+
    '<div class="mre-heroes">'+TASKS.map(function(q){ return '<div class="scg-hero"><canvas width="320" height="320" data-q="'+q+'"></canvas><div class="scg-hero-lab">'+SEQ[q].name+' · '+SER[S.ids[q][0]].seq+'\n'+HL[q]+'</div></div>'; }).join('')+'</div>'+
    '<div class="scg-cap" style="margin-top:6px">On the sagittal: your axial (green) and coronal (blue) through the midline, with the AC-PC line and its perpendicular dashed. The axials should run parallel to that line from the foramen magnum to the vertex.</div>'+
    '<h2 style="margin-top:16px">Sequences to consider</h2><div class="scg-cap">A routine brain: a sagittal T1 to plan on, then axial T2, FLAIR and DWI (with its ADC map) in every patient, a blood-sensitive sequence (T2* or SWI), and a coronal; gadolinium only when the question needs it. Highlighted rows are the ones you ticked.</div>'+
    '<table class="mre-tbl"><tr><th>Plane</th><th>Sequence</th><th>Shows</th><th></th></tr>'+seqRows+'</table></div>'+
    '<div class="scg-debrief">'+rows+
    '<div class="scg-drow"><i class="scg-d-'+(posOK?"ok":"warn")+'">'+(posOK?"✓":"⚠")+'</i><div><b>Position</b><p>'+POS[S.pos].note+(posOK?"":" The marker needs the head straight, chin neutral and padded in the coil.")+'</p></div></div>'+
    '<button class="scg-again" type="button" id="mreAgain">↺ Plan again</button></div>'+
    '<div class="scg-credits"><b>Imaging:</b> adapted from the NIMH Healthy Research Volunteer Dataset — Nugent A. C., Thomas A. G., Mahoney M. <i>et al.</i> (2022) <i>The NIMH intramural healthy volunteer dataset: a comprehensive MEG, MRI, and behavioral resource</i>, Scientific Data 9, 518, <a href="https://doi.org/10.1038/s41597-022-01623-9" target="_blank" rel="noopener">doi:10.1038/s41597-022-01623-9</a>; OpenNeuro <a href="https://openneuro.org/datasets/ds005752" target="_blank" rel="noopener">ds005752</a> (CC0 1.0, public domain), participant sub-ON02693 — one healthy adult volunteer, GE Discovery MR750 3 T, 32-channel head coil. The dataset authors removed the face (defacing). The clinical request is fictional — the volunteer had no symptoms. '+
    '<b>Changes made:</b> the sagittal T1, axial T2 and coronal T1 / T2 are <b>reformatted</b> from the volunteer\'s 1 mm 3D MPRAGE T1 and 3D CUBE T2 in the planes a radiographer would plan — sagittal parallel to the falx, axial parallel to the AC-PC line (which dips '+Math.round(REF.ax)+'° posteriorly in this head), coronal perpendicular to it; the FLAIR, T2*, DWI and ADC are shown <b>as acquired</b> (straight axial 2D stacks, about '+Math.round(REF.ax)+'° steeper than AC-PC); the DWI is the trace of 24 b = 1000 directions and the ADC is calculated from it, both averaged from 2 mm to 4 mm; the 3-plane localiser is <b>synthesised</b> from the 3D T1 (8 mm slab, 280 mm FOV, coil shading, noise); pixel values windowed to 8-bit JPEG / PNG. Each scan shows the reference slices that fall inside your stack, cropped to your FOV; the head position doesn\'t change the images. The 3-D room shows a generic closed-bore magnet and head coil. '+
    'Sequences without images are listed for teaching only. Educational simulation — not a medical device.</div>';
  TASKS.forEach(function(q){
    var cv=resultEl.querySelector('canvas[data-q="'+q+'"]'), id=S.ids[q][0], list=S.acq[id];
    var P = q==="sag" ? ACPT : q==="ax" ? ACPT : LM.pons, k=list[closestIn(id, list, P)];
    var pl=clone(S.plan[q]); pl.fov=Math.max(pl.fov, 240);
    if(q==="sag"){ pl.c=[ACPT[0], LM.conf[1], LM.conf[2]-5]; renderSeries(id, k, cv, pl, function(cr){ heroLines(cv, id, k, cr); }); }
    else renderSeries(id, k, cv, pl);
  });
  $("mreAgain").onclick=function(){ logCmd("plan again"); S.done={}; S.ids={}; S.acq={}; S.swap={}; resultEl.classList.add("scg-hidden"); achWrap.classList.add("scg-hidden"); gotoDash(); };
  resultEl.classList.remove("scg-hidden");
  achWrap.classList.toggle("scg-hidden", !all);
  if(all) playAchievement();
  log(all?"whole brain in every plane, axial and coronal square to the AC-PC line — marker unlocked: Little Grey Cells.":"debrief ready — "+(planes?"the planning is right; the head position is not.":"some plans have gaps or an angle is off."), all?"ok":"warn");
  drawOverlays();
}
/* your axial + coronal (solid) and the AC-PC reference + its perpendicular (dashed), on the midline sagittal hero */
function heroLines(cv, id, k, cr){
  var g=cv.getContext("2d"), L=125, s=SER[id];
  function line(c, u, col, dash){
    var a=cropPt(id, k, cr, axpy(c,u,-L)), b=cropPt(id, k, cr, axpy(c,u,L));
    g.save(); g.strokeStyle=col; g.lineWidth=dash?1.5:2.2; g.setLineDash(dash?[6,5]:[]); g.globalAlpha=dash?0.85:1;
    g.beginPath(); g.moveTo(a[0],a[1]); g.lineTo(b[0],b[1]); g.stroke(); g.restore();
  }
  var acpc=sub(LM.pc, LM.ac), n=Math.hypot(acpc[0],acpc[1],acpc[2]); acpc=mul(acpc, 1/n);
  var up=cross([1,0,0], acpc);                                          // perpendicular to AC-PC in the sagittal plane
  var mid=mul(add(LM.ac, LM.pc), 0.5);
  line(mid, acpc, "#ffffff", true); line(mid, up, "#ffffff", true);
  [["ax", "v"], ["cor", "v"]].forEach(function(r){
    var q=r[0]; if(!S.done[q]) return;
    var F=frame(q), c=S.plan[q].c, cm=[mid[0], c[1], c[2]];
    var dir = q==="ax" ? F.v : F.v;                                     // the in-sagittal-plane direction of each stack
    line(cm, dir, COLORS[q], false);
  });
  [LM.ac, LM.pc].forEach(function(P){ var p=cropPt(id, k, cr, P); g.save(); g.fillStyle="#ffd21f"; g.beginPath(); g.arc(p[0], p[1], 3, 0, 7); g.fill(); g.restore(); });
}
function resetAll(){
  S=freshState();
  resultEl.classList.add("scg-hidden"); achWrap.classList.add("scg-hidden");
  logEl.innerHTML=""; gotoSetup();
}

/* =============================================================
   BOOT
   ============================================================= */
$("scgStart").onclick=function(){ titleEl.classList.add("scg-hidden"); gotoSetup(); };
window.__mrs={ S:function(){ return S; }, parse:parseCommand, useSeries:useSeries, analyse:analyse, planOK:planOK, gotoPlan:gotoPlan,
               autoPlan:autoPlan, setAngle:setAngle, angErr:angErr, axAng:axAng, shapeOf:shapeOf, REF:REF, scanSeq:scanSeq, showResult:showResult };
setPhase("title");
})();
