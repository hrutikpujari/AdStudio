import type {
  AdElement,
  ButtonElement,
  CarouselElement,
  CardStackElement,
  CreativeProject,
  CubeElement,
  FanElement,
  ImageElement,
  ShapeElement,
  SliceFlipElement,
  SlideConfig,
  SpotlightElement,
  TextElement,
  VerticalSliderElement,
  VideoElement,
} from '../model/types';
import { allKeyframesCSS, animationShorthand } from '../render/animations';

/**
 * Generates a standalone HTML5 creative document from a project.
 * Emitted markup follows the reference-creative conventions:
 * .ad-container, .clickLayer, `var clickTag`, ad.size meta tag.
 *
 * `assetUrl` maps assetId -> src. The editor preview passes data URLs;
 * the ZIP exporter passes local `imgs/...` paths.
 */

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
   .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function safeUrl(url: string): string {
  const u = (url || '').trim();
  return /^(https?:|mailto:)/i.test(u) ? u : '';
}

type Ctx = {
  assetUrl: (assetId: string | undefined) => string;
  /** when set, keyframe animations are emitted paused at t=scrubMs
   *  (negative animation-delay trick) — used for timeline scrubbing */
  scrubMs?: number;
};

function slideInner(ctx: Ctx, s: SlideConfig, cls: string): string {
  if (s.assetId && ctx.assetUrl(s.assetId)) {
    return `<img src="${esc(ctx.assetUrl(s.assetId))}" alt="${esc(s.title)}" class="${cls}-img" draggable="false"/>`;
  }
  return `<div class="${cls}-ph"><div class="${cls}-ph-title">${esc(s.title)}</div><div class="${cls}-ph-sub">${esc(s.subtitle)}</div></div>`;
}

/** Card-layout slide: product image on top, title/price/CTA below —
 *  used when the imported creative's slides carry rich card markup. */
function cardInner(ctx: Ctx, s: SlideConfig, el: CarouselElement, c: CarouselElement['config']): string {
  const src = s.assetId ? ctx.assetUrl(s.assetId) : '';
  const fs = Math.max(7, Math.round(el.height * ((c.slideHPct ?? 86) / 100) * 0.055));
  const img = src
    ? `<img src="${esc(src)}" alt="${esc(s.title)}" class="cr-card-img" draggable="false"/>`
    : `<div class="cr-card-ph"></div>`;
  return (
    `<div class="cr-card" style="font-size:${fs}px">` +
    `<div class="cr-card-media">${img}</div>` +
    `<div class="cr-card-body">` +
    `<div class="cr-card-title">${esc(s.title)}</div>` +
    `<div class="cr-card-price">${s.oldPrice ? `<s>${esc(s.oldPrice)}</s>` : ''}<b>${esc(s.price ?? '')}</b></div>` +
    (s.ctaLabel ? `<div class="cr-card-cta">${esc(s.ctaLabel)}</div>` : '') +
    `</div></div>`
  );
}

/**
 * Positions an element on the artboard and attaches its animation.
 * `.ap-el`  = absolute position, rotation, opacity, z-index
 * `.ap-anim`= keyframe animation + CSS scope id for component styles
 */
function elShell(el: AdElement, zIndex: number, inner: string, extraStyle = '', scrubMs?: number): string {
  let anim = animationShorthand(el.animation);
  if (anim && scrubMs != null) {
    // replace the delay token and freeze the frame
    const parts = anim.split(' ');
    // shorthand: name duration easing delay iterations direction fill
    if (parts.length >= 7) {
      const delay = parseFloat(parts[3]) || 0;
      parts[3] = `${delay - scrubMs}ms`;
      anim = parts.join(' ') + ';animation-play-state:paused';
    }
  }
  const style =
    `left:${el.x}px;top:${el.y}px;width:${el.width}px;height:${el.height}px;z-index:${zIndex};` +
    (el.rotation ? `transform:rotate(${el.rotation}deg);` : '') +
    (el.opacity < 1 ? `opacity:${el.opacity};` : '') +
    (el.visible ? '' : 'display:none;') +
    extraStyle;
  return (
    `<div class="ap-el" data-el="${el.id}" style="${style}">` +
    `<div class="ap-anim" id="css-${el.id}"${anim ? ` style="animation:${anim}"` : ''}>${inner}</div>` +
    `</div>`
  );
}

/* ------------------------------ elements ---------------------------- */

function genImage(ctx: Ctx, el: ImageElement, z: number): string {
  const src = el.assetId ? ctx.assetUrl(el.assetId) : '';
  const br = el.borderRadius ? `border-radius:${el.borderRadius}px;` : '';
  const inner = src
    ? `<img src="${esc(src)}" style="width:100%;height:100%;object-fit:${el.fit};${br}display:block" alt="" draggable="false"/>`
    : `<div class="ap-ph" style="${br}"><span>IMAGE</span></div>`;
  return elShell(el, z, inner, '', ctx.scrubMs);
}

function genVideo(_ctx: Ctx, el: VideoElement, z: number): string {
  if (!el.src) return elShell(el, z, `<div class="ap-ph"><span>VIDEO</span></div>`, '', _ctx.scrubMs);
  const attrs =
    (el.autoplay ? ' autoplay' : '') +
    (el.autoplay || el.muted ? ' muted' : '') +
    (el.loop ? ' loop' : '');
  const inner =
    `<video src="${esc(el.src)}"${attrs} playsinline preload="auto" ` +
    `style="width:100%;height:100%;object-fit:${el.fit};display:block"></video>`;
  return elShell(el, z, inner, '', _ctx.scrubMs);
}

function genText(_ctx: Ctx, el: TextElement, z: number): string {
  const justify = el.textAlign === 'center' ? 'center' : el.textAlign === 'right' ? 'flex-end' : 'flex-start';
  const st =
    `width:100%;height:100%;display:flex;align-items:center;overflow:hidden;` +
    `font-family:${el.fontFamily};font-size:${el.fontSize}px;font-weight:${el.fontWeight};` +
    `line-height:${el.lineHeight};letter-spacing:${el.letterSpacing}px;color:${el.color};` +
    `text-align:${el.textAlign};direction:${el.direction};justify-content:${justify};` +
    (el.background !== 'transparent' ? `background:${el.background};` : '');
  return elShell(el, z, `<div style="${st}">${esc(el.content)}</div>`, '', _ctx.scrubMs);
}

function genButton(_ctx: Ctx, el: ButtonElement, z: number): string {
  const st =
    `width:100%;height:100%;border:none;cursor:pointer;padding:0;` +
    `background:${el.background};color:${el.color};border-radius:${el.borderRadius}px;` +
    `font-family:${el.fontFamily};font-size:${el.fontSize}px;font-weight:${el.fontWeight};` +
    `direction:${el.direction ?? 'ltr'};` +
    `display:flex;align-items:center;justify-content:center;`;
  const url = el.url ? ` data-url="${esc(el.url)}"` : '';
  return elShell(el, z, `<button class="ap-cta" style="${st}"${url}>${esc(el.label)}</button>`, '', _ctx.scrubMs);
}

function genShape(_ctx: Ctx, el: ShapeElement, z: number): string {
  const st =
    `width:100%;height:100%;background:${el.fill};` +
    (el.shape === 'ellipse' ? 'border-radius:50%;' : `border-radius:${el.borderRadius}px;`) +
    (el.shape === 'line' ? `height:${Math.max(el.borderWidth, 1)}px;` : '') +
    (el.borderWidth ? `border:${el.borderWidth}px solid ${el.borderColor};box-sizing:border-box;` : '');
  return elShell(el, z, `<div style="${st}"></div>`, '', _ctx.scrubMs);
}

/* --------------------------- components ----------------------------- */

interface ComponentOut {
  css: string;
  runtime: string;
  html: string;
}

function genCarousel(ctx: Ctx, el: CarouselElement, z: number): ComponentOut {
  const c = el.config;
  const stage = c.variant === 'stage';
  const cardMode = c.slideLayout === 'card';
  const slides = c.slides
    .map((s) => `<div class="cr-item"${s.url ? ` data-url="${esc(s.url)}"` : ''}>${cardMode ? cardInner(ctx, s, el, c) : slideInner(ctx, s, 'cr')}</div>`)
    .join('');
  const inner = `<div class="cr-wrap" data-hover="${c.pauseOnHover ? 1 : 0}">${slides}</div>`;
  const sw = c.slideWPct ?? 70;
  const sh = c.slideHPct ?? 86;
  const sx = c.sideXPct ?? (stage ? 110 : 75);
  const ss = c.sideScale ?? (stage ? 0.4 : 0.8);
  const css = `
#css-${el.id} .cr-wrap{position:absolute;inset:0}
#css-${el.id} .cr-item{position:absolute;top:50%;left:50%;width:${sw}%;height:${sh}%;display:flex;justify-content:center;align-items:center;
 transition:transform ${c.transitionMs}ms ease-in-out,opacity ${c.transitionMs}ms ease-in-out,filter ${c.transitionMs}ms ease-in-out;
 transform:translate(calc(-50% + 180%),-50%) scale(.5);opacity:0;z-index:0}
#css-${el.id} .cr-item.center{transform:translate(-50%,-50%) scale(1);opacity:1;z-index:3;filter:none}
#css-${el.id} .cr-item.left{transform:translate(calc(-50% - ${sx}%),-50%) scale(${ss});opacity:.5;z-index:2${stage ? ';filter:brightness(.45) saturate(.5)' : ''}}
#css-${el.id} .cr-item.right{transform:translate(calc(-50% + ${sx}%),-50%) scale(${ss});opacity:.5;z-index:2${stage ? ';filter:brightness(.45) saturate(.5)' : ''}}
#css-${el.id} .cr-item.hidden{transform:translate(calc(-50% - 160%),-50%) scale(.4);opacity:0;z-index:0}
#css-${el.id} .cr-img{object-fit:${c.slideFit ?? 'cover'}}${
    cardMode ? `
#css-${el.id} .cr-card{width:${c.cardWPct ?? 90}%;height:100%;margin:0 auto;background:#fff;border-radius:.6em;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 .15em .6em rgba(0,0,0,.1)}
#css-${el.id} .cr-card-media{height:55%;flex-shrink:0;overflow:hidden}
#css-${el.id} .cr-card-img{width:100%;height:100%;object-fit:${c.slideFit ?? 'cover'};display:block}
#css-${el.id} .cr-card-ph{width:100%;height:100%;background:#f0f0f0}
#css-${el.id} .cr-card-body{flex:1;min-height:0;padding:.4em .6em;display:flex;flex-direction:column;font-family:Arial,sans-serif;color:#222}
#css-${el.id} .cr-card-title{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#css-${el.id} .cr-card-price{font-weight:700;font-size:1.15em;color:#c73a1d;margin-top:.15em;display:flex;gap:.4em}
#css-${el.id} .cr-card-price s{color:#999;font-weight:400}
#css-${el.id} .cr-card-cta{margin-top:auto;background:#333;color:#fff;border-radius:.25em;text-align:center;font-weight:700;font-size:.9em;padding:.35em 0}` : ''}`;
  const runtime = `(function(){
 var wrap=document.querySelector('#css-${el.id} .cr-wrap');if(!wrap)return;
 var slides=Array.prototype.slice.call(wrap.querySelectorAll('.cr-item'));
 var n=slides.length;if(!n)return;
 var cur=0,anim=false;
 function apply(idx){
  slides.forEach(function(s){s.classList.remove('center','left','right','hidden');});
  var li=(idx-1+n)%n,ri=(idx+1)%n;
  slides[idx].classList.add('center');
  if(n>1){slides[li].classList.add('left');slides[ri].classList.add('right');}
  slides.forEach(function(s,i){if(i!==idx&&i!==li&&i!==ri)s.classList.add('hidden');});
 }
 function go(i){if(anim)return;anim=true;
  requestAnimationFrame(function(){apply(i);});
  setTimeout(function(){cur=i;anim=false;},${c.transitionMs});
 }
 apply(0);
 var timer=null;
 function start(){timer=setInterval(function(){go((cur+1)%n);},${c.intervalMs});}
 if(${c.autoplay ? 'true' : 'false'})start();
 if(wrap.getAttribute('data-hover')==='1'){
  wrap.addEventListener('mouseenter',function(){clearInterval(timer);timer=null;});
  wrap.addEventListener('mouseleave',function(){if(!timer)start();});
 }
})();`;
  return { css, runtime, html: elShell(el, z, inner, '', ctx.scrubMs) };
}

function genCardStack(ctx: Ctx, el: CardStackElement, z: number): ComponentOut {
  const c = el.config;
  const wScale = [1, 0.9045, 0.809, 0.7134, 0.7134, 0.7134];
  const xFrac = [0, 0.2962, 0.5923, 0.8885, 0.8885, 0.8885];
  const yFrac = [0, 0.0411, 0.0823, 0.1234, 0.1234, 0.1234];
  const W = el.width, H = el.height;
  const posCss = wScale.map((s, i) => {
    const cw = Math.round(W * 0.5923 * s);
    const ch = Math.round(H * 0.862 * s);
    const x = Math.round(W * xFrac[i]);
    const y = Math.round(H * yFrac[i]);
    const op = i < 4 ? 1 : 0;
    const zi = 4 - i;
    return `#css-${el.id} .cs-card.pos-${i + 1}{width:${cw}px;height:${ch}px;transform:translate(${x}px,${y}px);opacity:${op};z-index:${zi}}`;
  }).join('\n');
  const cards = c.slides.map((s) => `<div class="cs-card">${slideInner(ctx, s, 'cs')}</div>`).join('');
  const css = `
#css-${el.id} .cs-stack{position:absolute;inset:0}
#css-${el.id} .cs-card{position:absolute;left:0;top:0;background:#fff;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.2);
 transition:transform ${c.transitionMs}ms cubic-bezier(.25,.46,.45,.94),width ${c.transitionMs}ms cubic-bezier(.25,.46,.45,.94),height ${c.transitionMs}ms cubic-bezier(.25,.46,.45,.94),opacity ${c.transitionMs}ms}
#css-${el.id} .cs-card.exiting{opacity:0;z-index:0}
${posCss}`;
  const runtime = `(function(){
 var root=document.getElementById('css-${el.id}');if(!root)return;
 var cards=Array.prototype.slice.call(root.querySelectorAll('.cs-card'));
 var n=cards.length,order=[],anim=false,i;
 for(i=0;i<n;i++)order.push(i);
 function apply(){
  cards.forEach(function(cd){for(var k=1;k<=6;k++)cd.classList.remove('pos-'+k);cd.classList.remove('exiting');});
  for(var j=0;j<Math.min(6,n);j++)cards[order[j]].classList.add('pos-'+(j+1));
 }
 function step(){
  if(anim)return;anim=true;
  var top=order[0];
  cards[top].classList.remove('pos-1');cards[top].classList.add('exiting');
  setTimeout(function(){order.shift();order.push(top);apply();
   anim=false;},50);
 }
 apply();
 setInterval(step,${c.intervalMs});
})();`;
  return { css, runtime, html: elShell(el, z, `<div class="cs-stack">${cards}</div>`, '', ctx.scrubMs) };
}

function genFan(ctx: Ctx, el: FanElement, z: number): ComponentOut {
  const c = el.config;
  const cardW = Math.round(Math.min(el.width * 0.5, 150));
  const cardH = Math.round(el.height * 0.9);
  const slides = c.slides
    .map((s) => `<div class="fan-item" style="width:${cardW}px;height:${cardH}px;margin-left:${-cardW / 2}px;margin-top:${-cardH / 2}px">${slideInner(ctx, s, 'fan')}</div>`)
    .join('');
  const inner = `<div class="fan-scene" data-hover="${c.pauseOnHover ? 1 : 0}"><div class="fan-box">${slides}</div></div>`;
  const css = `
#css-${el.id} .fan-scene{position:absolute;inset:0;perspective:1000px}
#css-${el.id} .fan-box{position:absolute;left:50%;top:50%;width:0;height:0;transform-style:preserve-3d}
#css-${el.id} .fan-item{position:absolute;left:0;top:0;transform-style:preserve-3d;backface-visibility:hidden;
 display:flex;justify-content:center;align-items:center;background:#fff;border-radius:4px;overflow:hidden;
 box-shadow:0 4px 14px rgba(0,0,0,.25);transition:all ${c.transitionMs}ms cubic-bezier(.4,0,.2,1)}`;
  const runtime = `(function(){
 var root=document.getElementById('css-${el.id}');if(!root)return;
 var slides=Array.prototype.slice.call(root.querySelectorAll('.fan-item'));
 var n=slides.length,cur=0,anim=false,auto=true;
 function upd(){
  slides.forEach(function(s,idx){
   var off=idx-cur;
   if(off>n/2)off-=n;if(off<-n/2)off+=n;
   var ao=Math.abs(off);
   var tx=off*${c.spacing},tz=-ao*50,ry=off*-${c.fanAngle};
   var sc=Math.max(.45,1-ao*.18),op=Math.max(0,1-ao*.3),zi=10-ao;
   if(ao>2){op=0;zi=0;}
   s.style.transform='translateX('+tx+'px) translateZ('+tz+'px) rotateY('+ry+'deg) scale('+sc+')';
   s.style.opacity=op;s.style.zIndex=zi;
  });
 }
 function next(){if(anim)return;anim=true;cur=(cur+1)%n;upd();
  setTimeout(function(){anim=false;},${c.transitionMs});}
 upd();
 setInterval(function(){if(auto)next();},${c.intervalMs});
 var scene=root.querySelector('.fan-scene');
 if(scene&&scene.getAttribute('data-hover')==='1'){
  scene.addEventListener('mouseenter',function(){auto=false;});
  scene.addEventListener('mouseleave',function(){auto=true;});
 }
})();`;
  return { css, runtime, html: elShell(el, z, inner, '', ctx.scrubMs) };
}

function genCube(ctx: Ctx, el: CubeElement, z: number): ComponentOut {
  const c = el.config;
  const half = c.faceSize / 2;
  const names = ['front', 'back', 'right', 'left', 'top', 'bottom'];
  const faces = names
    .map((n, i) => {
      const src = c.faces[i] ? ctx.assetUrl(c.faces[i]) : '';
      const inner = src
        ? `<img src="${esc(src)}" style="width:100%;height:100%;object-fit:cover;display:block" draggable="false"/>`
        : `<div class="cube-ph"><span>FACE ${i + 1}</span></div>`;
      return `<div class="cube-face cube-${n}">${inner}</div>`;
    })
    .join('');
  const css = `
@keyframes cube-spin-${el.id}{0%{transform:rotateY(0deg)}5%{transform:rotateY(0deg)}16.67%{transform:rotateY(90deg)}33.33%{transform:rotateX(-90deg)}50%{transform:rotateY(180deg)}66.67%{transform:rotateX(90deg)}83.33%{transform:rotateY(270deg)}100%{transform:rotateY(270deg)}}
#css-${el.id} .cube-scene{position:absolute;inset:0;perspective:600px;display:flex;align-items:center;justify-content:center}
#css-${el.id} .cube{position:relative;width:${c.faceSize}px;height:${c.faceSize}px;transform-style:preserve-3d;animation:cube-spin-${el.id} ${c.durationMs}ms infinite}
#css-${el.id} .cube-face{position:absolute;width:${c.faceSize}px;height:${c.faceSize}px;backface-visibility:hidden;border-radius:8px;overflow:hidden;
 box-shadow:0 4px 8px rgba(0,0,0,.3);background:#1a1a2e}
#css-${el.id} .cube-front{transform:translateZ(${half}px)}
#css-${el.id} .cube-back{transform:rotateY(180deg) translateZ(${half}px)}
#css-${el.id} .cube-right{transform:rotateY(90deg) translateZ(${half}px)}
#css-${el.id} .cube-left{transform:rotateY(-90deg) translateZ(${half}px)}
#css-${el.id} .cube-top{transform:rotateX(90deg) translateZ(${half}px)}
#css-${el.id} .cube-bottom{transform:rotateX(-90deg) translateZ(${half}px)}
#css-${el.id} .cube-ph{width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#ffd54f;font:bold 14px Arial}`;
  const inner = `<div class="cube-scene"><div class="cube">${faces}</div></div>`;
  return { css, runtime: '', html: elShell(el, z, inner, '', ctx.scrubMs) };
}

function genVerticalSlider(ctx: Ctx, el: VerticalSliderElement, z: number): ComponentOut {
  const c = el.config;
  const slides = c.slides
    .map((s) => {
      const img = s.assetId && ctx.assetUrl(s.assetId)
        ? `<img src="${esc(ctx.assetUrl(s.assetId))}" style="width:40px;height:40px;object-fit:cover;border-radius:6px;flex-shrink:0" draggable="false"/>`
        : `<div class="vsl-thumb">${esc(s.title.slice(0, 4))}</div>`;
      return `<div class="vsl-slide"><div class="vsl-card">
 <div class="vsl-info"><div class="vsl-title">${esc(s.title)}</div>
 <div class="vsl-price"><span class="vsl-offer">${esc(s.price ?? '')}</span><span class="vsl-mrp">${esc(s.oldPrice ?? '')}</span></div></div>
 ${img}</div></div>`;
    })
    .join('');
  const inner = `<div class="vsl-box"><div class="vsl-track">${slides}</div></div>`;
  const css = `
#css-${el.id} .vsl-box{position:absolute;inset:0;overflow:hidden}
#css-${el.id} .vsl-track{display:flex;flex-direction:column;width:100%}
#css-${el.id} .vsl-slide{width:100%;flex-shrink:0;display:flex}
#css-${el.id} .vsl-card{background:#fff;width:100%;display:flex;flex-direction:row-reverse;align-items:center;border-bottom:1px solid #e0e0e0;box-sizing:border-box}
#css-${el.id} .vsl-thumb{width:40px;height:40px;background:#fff;border:2px dashed #b3e0ff;border-radius:6px;display:flex;align-items:center;justify-content:center;font:bold 10px Arial;color:#66b3e0;flex-shrink:0;box-sizing:border-box}
#css-${el.id} .vsl-info{padding:5px 8px;width:100%}
#css-${el.id} .vsl-title{font:bold 10px Arial;color:#0088cc;margin-bottom:6px;line-height:1.3}
#css-${el.id} .vsl-price{display:flex;gap:5px;font:bold 11px Arial}
#css-${el.id} .vsl-offer{color:#0088cc}
#css-${el.id} .vsl-mrp{color:#99cce6;text-decoration:line-through}`;
  const runtime = `(function(){
 var root=document.getElementById('css-${el.id}');if(!root)return;
 var box=root.querySelector('.vsl-box'),track=root.querySelector('.vsl-track');
 var slides=root.querySelectorAll('.vsl-slide'),n=slides.length;
 if(!n)return;
 var sh=box.offsetHeight||1;
 for(var i=0;i<n;i++){slides[i].style.height=sh+'px';slides[i].firstElementChild.style.height=sh+'px';}
 track.style.height=(n*sh)+'px';
 var cur=0,dir=1,last=0,scrolling=true;
 function anim(t){
  if(!last)last=t;
  var d=(t-last)/1000;last=t;
  if(scrolling){
   cur+=${c.speed}*d*dir;
   if(${c.pingPong ? 'true' : 'false'}){
    if(cur>=n-1&&dir>0)dir=-1;else if(cur<=0&&dir<0)dir=1;
   }else if(cur>=n)cur=0;
   cur=Math.max(0,Math.min(n-1,cur));
   track.style.transform='translateY(-'+(cur*sh)+'px)';
  }
  requestAnimationFrame(anim);
 }
 if(${c.pauseOnHover ? 'true' : 'false'}){box.addEventListener('mouseenter',function(){scrolling=false;});
  box.addEventListener('mouseleave',function(){scrolling=true;});}
 requestAnimationFrame(anim);
})();`;
  return { css, runtime, html: elShell(el, z, inner, '', ctx.scrubMs) };
}

function genSliceFlip(ctx: Ctx, el: SliceFlipElement, z: number): ComponentOut {
  const c = el.config;
  const W = Math.round(el.width);
  const H = Math.round(el.height);
  const N = Math.max(2, Math.min(20, Math.round(c.sliceCount) || 8));
  const urls = c.slides.map((s) => (s.assetId ? ctx.assetUrl(s.assetId) : ''));

  // each slice is a flip-card: front face = current image, back face =
  // next image pre-rotated 180°, then all inners rotate 180° staggered
  const sliceHtml: string[] = [];
  for (let i = 0; i < N; i++) {
    const left = Math.round((i * W) / N);
    const right = Math.round(((i + 1) * W) / N);
    sliceHtml.push(
      `<div class="sf-slice" style="left:${left}px;width:${right - left}px">` +
      `<div class="sf-inner">` +
      `<div class="sf-face sf-front" style="background-position:-${left}px 0"></div>` +
      `<div class="sf-face sf-back" style="background-position:-${left}px 0"></div>` +
      `</div></div>`,
    );
  }

  const css = `
#css-${el.id} .sf-wrap{position:absolute;inset:0;overflow:hidden;background:#fff}
#css-${el.id} .sf-hero{position:absolute;inset:0;background-repeat:no-repeat;background-size:${W}px ${H}px;background-position:center;z-index:1}
#css-${el.id} .sf-slices{position:absolute;inset:0;z-index:2;perspective:3000px;transform:translateZ(0)}
#css-${el.id} .sf-slice{position:absolute;top:0;height:100%;overflow:visible}
#css-${el.id} .sf-inner{position:relative;width:100%;height:100%;transform-style:preserve-3d;will-change:transform;backface-visibility:hidden}
#css-${el.id} .sf-face{position:absolute;top:0;left:0;width:100%;height:100%;background-repeat:no-repeat;background-size:${W}px ${H}px;backface-visibility:hidden}
#css-${el.id} .sf-back{transform:rotateY(180deg) translateZ(0)}`;

  const runtime = `(function(){
 var root=document.getElementById('css-${el.id}');if(!root)return;
 var imgs=${JSON.stringify(urls)}.filter(function(u){return !!u;});
 if(imgs.length<2)return;
 var hero=root.querySelector('.sf-hero'),inners=root.querySelectorAll('.sf-inner');
 var fronts=root.querySelectorAll('.sf-front'),backs=root.querySelectorAll('.sf-back');
 var cur=0,busy=false,N=inners.length;
 function setFaces(nodes,url){for(var i=0;i<nodes.length;i++)nodes[i].style.backgroundImage='url("'+url+'")';}
 setFaces(fronts,imgs[0]);setFaces(backs,imgs[1]);hero.style.backgroundImage='url("'+imgs[0]+'")';
 function flip(){
  if(busy)return;busy=true;
  var next=(cur+1)%imgs.length;
  for(var i=0;i<N;i++){
   inners[i].style.transition='transform ${c.flipMs}ms cubic-bezier(0.65,0,0.35,1) '+(i*${c.staggerMs})+'ms';
   inners[i].style.transform='rotateY(180deg)';
  }
  setTimeout(function(){
   cur=next;
   setFaces(fronts,imgs[cur]);setFaces(backs,imgs[(cur+1)%imgs.length]);
   hero.style.backgroundImage='url("'+imgs[cur]+'")';
   for(var j=0;j<N;j++){inners[j].style.transition='none';inners[j].style.transform='rotateY(0deg)';}
   busy=false;
  },${c.flipMs}+(N-1)*${c.staggerMs});
 }
 if(${c.autoplay ? 'true' : 'false'})setInterval(flip,${c.holdMs});
})();`;

  const inner = `<div class="sf-wrap"><div class="sf-hero"></div><div class="sf-slices">${sliceHtml.join('')}</div></div>`;
  return { css, runtime, html: elShell(el, z, inner, '', ctx.scrubMs) };
}

function genSpotlight(ctx: Ctx, el: SpotlightElement, z: number): ComponentOut {
  const { intensity, beamColor } = el.config;
  const k = (a: number) => (a * intensity).toFixed(2);
  const css = `
#css-${el.id} .sl-vignette{position:absolute;inset:0;pointer-events:none;
 background:radial-gradient(120% 80% at 50% 60%,rgba(0,0,0,0) 30%,rgba(0,0,0,${k(0.18)}) 70%,rgba(0,0,0,${k(0.32)}) 100%)}
#css-${el.id} .sl-beam{position:absolute;top:0;left:50%;width:73%;height:70%;transform:translateX(-50%);pointer-events:none;
 clip-path:polygon(46% 0%,54% 0%,90% 100%,10% 100%);filter:blur(6px);
 background:linear-gradient(to bottom,rgba(255,255,240,${k(0.85)}) 0%,rgba(255,255,235,${k(0.35)}) 45%,rgba(255,255,235,${k(0.05)}) 100%)}
#css-${el.id} .sl-pool{position:absolute;bottom:8%;left:50%;width:70%;height:31%;transform:translateX(-50%);pointer-events:none;border-radius:50%;filter:blur(6px);
 background:radial-gradient(closest-side,rgba(255,255,240,${k(0.55)}) 0%,rgba(255,255,240,${k(0.28)}) 45%,rgba(255,255,240,0) 100%)}
#css-${el.id} .sl-ring{position:absolute;bottom:10%;left:50%;width:63%;height:28%;transform:translateX(-50%);pointer-events:none;border-radius:50%;filter:blur(1.2px);
 border:1.5px solid rgba(255,255,240,${k(0.8)});box-shadow:0 0 12px rgba(255,255,240,${k(0.6)}),inset 0 0 14px rgba(255,255,240,${k(0.4)})}`;
  const inner =
    `<div class="sl-vignette"></div><div class="sl-beam"></div>` +
    `<div class="sl-pool"></div><div class="sl-ring"></div>`;
  // beamColor retained in config for future per-spotlight tinting
  void beamColor;
  return { css, runtime: '', html: elShell(el, z, inner, 'pointer-events:none', ctx.scrubMs) };
}

/* ------------------------------ driver ------------------------------ */

export function generateHtml(
  project: CreativeProject,
  assetUrl: (assetId: string | undefined) => string,
  opts?: { scrubMs?: number },
): string {
  const ctx: Ctx = { assetUrl, scrubMs: opts?.scrubMs };
  const { width: W, height: H } = project.artboard;
  const clickTag = safeUrl(project.clickTag) || 'https://www.example.com';

  const componentCss: string[] = [];
  const runtimes: string[] = [];
  const bodyParts: string[] = [];

  const bgImg = project.artboard.backgroundImageAssetId
    ? ctx.assetUrl(project.artboard.backgroundImageAssetId)
    : '';
  const bgStyle = bgImg
    ? `background:${project.artboard.backgroundColor} url('${esc(bgImg)}') ${project.artboard.backgroundFit === 'fill' ? '100% 100%' : project.artboard.backgroundFit} no-repeat`
    : `background:${project.artboard.backgroundColor}`;

  project.elements.forEach((el, i) => {
    const z = i + 1;
    let html = '';
    switch (el.type) {
      case 'image': html = genImage(ctx, el, z); break;
      case 'video': html = genVideo(ctx, el, z); break;
      case 'text': html = genText(ctx, el, z); break;
      case 'button': html = genButton(ctx, el, z); break;
      case 'shape': html = genShape(ctx, el, z); break;
      case 'carousel': { const r = genCarousel(ctx, el, z); componentCss.push(r.css); if (r.runtime) runtimes.push(r.runtime); html = r.html; break; }
      case 'card-stack': { const r = genCardStack(ctx, el, z); componentCss.push(r.css); if (r.runtime) runtimes.push(r.runtime); html = r.html; break; }
      case 'fan-carousel': { const r = genFan(ctx, el, z); componentCss.push(r.css); if (r.runtime) runtimes.push(r.runtime); html = r.html; break; }
      case 'cube': { const r = genCube(ctx, el, z); componentCss.push(r.css); html = r.html; break; }
      case 'vertical-slider': { const r = genVerticalSlider(ctx, el, z); componentCss.push(r.css); if (r.runtime) runtimes.push(r.runtime); html = r.html; break; }
      case 'slice-flip': { const r = genSliceFlip(ctx, el, z); componentCss.push(r.css); if (r.runtime) runtimes.push(r.runtime); html = r.html; break; }
      case 'spotlight': { const r = genSpotlight(ctx, el, z); componentCss.push(r.css); html = r.html; break; }
    }
    bodyParts.push(html);
  });

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<meta name="ad.size" content="width=${W},height=${H}"/>
<title>${esc(project.name)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#F2F0F0;display:flex;justify-content:center;align-items:center;min-height:100vh;font-family:Arial,sans-serif}
.ad-container{width:${W}px;height:${H}px;${bgStyle};overflow:hidden;position:relative;cursor:pointer}
.clickLayer{position:absolute;inset:0;z-index:9999;text-indent:-9999px;background:rgba(0,0,0,0);pointer-events:none}
.ap-el{position:absolute}
.ap-anim{width:100%;height:100%;position:relative}
.ap-ph{width:100%;height:100%;background:#fff;border:2px dashed #b3e0ff;display:flex;align-items:center;justify-content:center;font:bold 10px Arial;color:#66b3e0;box-sizing:border-box}
.cr-ph,.cs-ph,.fan-ph{width:100%;height:100%;background:#fff;border:2px dashed #b3e0ff;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:Arial;color:#0088cc;text-align:center;box-sizing:border-box;padding:6px}
.cs-ph{border-color:#d4e8ff;color:#6b9bd1}
.fan-ph{border-color:#ffcccc;color:#ff6b6b}
.cr-ph-title,.cs-ph-title,.fan-ph-title{font-size:10px;font-weight:bold}
.cr-ph-sub,.cs-ph-sub,.fan-ph-sub{font-size:8px;opacity:.7;margin-top:2px}
.cr-img,.cs-img,.fan-img{width:100%;height:100%;object-fit:cover;display:block}
${allKeyframesCSS()}
${componentCss.join('\n')}
</style>
</head>
<body>
<main class="ad-container">
<a href="javascript:void(0)" id="clickLayer" class="clickLayer" aria-label="Clickthrough"></a>
${bodyParts.join('\n')}
</main>
<script>
//<![CDATA[
var clickTag=${JSON.stringify(clickTag)};
if(typeof window.clickTag==='undefined'){window.clickTag=clickTag;}
document.addEventListener('DOMContentLoaded',function(){
 var ad=document.querySelector('.ad-container');
 if(ad){ad.addEventListener('click',function(e){
  var btn=e.target&&e.target.closest?e.target.closest('[data-url]'):null;
  var url=(btn&&btn.getAttribute('data-url'))||window.clickTag||clickTag;
  if(url){e.preventDefault();window.open(url,'_blank');}
 });}
});
${runtimes.join('\n')}
//]]>
</script>
</body>
</html>`;
}
