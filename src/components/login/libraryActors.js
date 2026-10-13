export function createLibraryActors(context) {
  let ctx = context
  const spriteCache = new Map(), glyphCache = new Map(), palette = { ink: '#292e25' }
  function r(x,y,w,h,color) {
    if(w<=0||h<=0) return;
    const m=ctx.getTransform(), x1=Math.round(m.a*x+m.e), y1=Math.round(m.d*y+m.f);
    const x2=Math.round(m.a*(x+w)+m.e), y2=Math.round(m.d*(y+h)+m.f);
    ctx.fillStyle=color; ctx.fillRect((x1-m.e)/m.a,(y1-m.f)/m.d,(x2-x1)/m.a,(y2-y1)/m.d);
  }
  function block(x,y,w,h,color,corner=6) {
    const radius=Math.min(corner,w/2,h/2);
    for(let row=0;row<h;row++) {
      const dy=Math.min(row,h-1-row), inset=dy>=radius?0:Math.ceil(radius-Math.sqrt(radius*radius-(radius-dy-.5)**2));
      r(x+inset,y+row,w-inset*2,1,color);
    }
  }
  function noise(x,y,seed=0) { let v=Math.imul(x+seed*31,374761393)^Math.imul(y+seed*17,668265263); v=Math.imul(v^(v>>>13),1274126177); return (v>>>16)&255; }
  function star(x,y,color,size=2) { r(x-size,y,size*3,size,color);r(x,y-size,size,size*3,color); }
  // Cache the small running, blinking and thumbs-up sprites at native pixel resolution.
  function bearPaint(x,floor,scale,time,direction=1,cheer=false,blinkOverride) {
    ctx.save(); ctx.translate(Math.round(x/2)*2,Math.round(floor/2)*2); ctx.scale(scale,scale);
    ctx.translate(direction<0?80:0,0); ctx.scale(direction,1);
    const run=!cheer, bounce=run?Math.round(Math.sin(time*13)*2):0;
    ctx.translate(0,-118+bounce);
    const amber='#e48c37', light='#f6ae51', shade='#ad5726', cream='#ffe7bb', outline='#61301c';
    if(run) { r(-4,73,17,28,'#6f9478'); r(-1,74,6,25,'#9eb498'); r(2,78,4,14,'#cbd5b4'); }
    block(20,70,43,38,outline,8); block(22,70,39,36,amber,6); block(31,76,23,23,cream,6);
    const stride=run?Math.round(Math.sin(time*13)*7):0;
    block(20+stride,102,20,16,shade,4); r(22+stride,106,15,8,amber);
    block(45-stride,102,20,16,shade,4); r(47-stride,106,15,8,amber);
    block(7,73,15,29,outline,4); block(9,74,13,24,amber,4);
    if(cheer) {
      block(62,67,17,15,amber,4); block(73,48,18,22,outline,4); block(75,48,14,20,light,4);
      r(81,41,7,17,amber); r(77,61,12,3,shade);
    } else { block(62,73+stride*.4,15,28,outline,4); block(62,74+stride*.4,13,23,amber,4); }
    block(7,0,22,24,outline,6); block(9,0,18,21,light,4); block(13,6,10,12,shade,4);
    block(54,0,22,24,outline,6); block(56,0,18,21,light,4); block(60,6,10,12,shade,4);
    block(4,14,76,64,outline,14); block(6,12,72,63,amber,12); block(12,14,56,27,light,10);
    r(19,25,14,4,'#67512c'); r(50,25,14,4,'#67512c');
    const blink=blinkOverride??(time%4.7>4.48);
    if(blink) { r(20,42,13,4,palette.ink); r(49,42,13,4,palette.ink); }
    else {
      block(18,33,17,23,'#fff9e9',4); block(48,33,17,23,'#fff9e9',4);
      block(25,39,8,13,'#3c3b2e',2); block(49,39,8,13,'#3c3b2e',2); r(25,40,3,4,'#fffdf2'); r(49,40,3,4,'#fffdf2');
    }
    block(25,53,34,24,cream,8); block(35,52,15,8,'#574329',4);
    r(41,58,3,7,'#574329'); r(34,65,20,4,'#574329'); r(38,69,11,4,'#da8869');
    r(10,53,4,8,'#e78c32'); r(16,55,4,6,'#e78c32'); r(66,53,4,8,'#e78c32'); r(60,55,4,6,'#e78c32');
    r(22,76,39,5,'#8b9c70'); r(55,81,8,12,'#8b9c70');
    ctx.restore();
  }
  function bear(x,floor,scale,time,direction=1,cheer=false) {
    const blink=time%4.7>4.48;
    const phase=cheer?0:Math.floor(time*7)%8;
    const key=`${phase}-${blink}-${cheer}`;
    if(!spriteCache.has(key)) {
      const sprite=document.createElement('canvas'); sprite.width=116; sprite.height=134;
      const original=ctx; ctx=sprite.getContext('2d');
      bearPaint(12,130,1,phase/7,1,cheer,blink);
      const pixels=ctx.getImageData(0,0,116,134);
      for(let py=0;py<134;py++) for(let px=0;px<116;px++) {
        const at=(py*116+px)*4, d=pixels.data;
        if(!d[at+3]) continue;
        if(d[at]>180&&d[at+1]>115&&d[at+1]<225&&d[at+2]<130) {
          const dx=(px-54)/37, dy=(py-53)/39;
          const tint=Math.round(13-20*Math.min(1,dx*dx+dy*dy)-8*dx+(noise(px,py,9)%7)-3);
          for(let c=0;c<3;c++) d[at+c]=Math.max(0,Math.min(255,d[at+c]+tint));
        }
      }
      ctx.putImageData(pixels,0,0); ctx=original; spriteCache.set(key,sprite);
    }
    ctx.save(); ctx.translate(Math.round(x+(direction<0?80*scale:0)),Math.round(floor)); ctx.scale(direction,1);
    ctx.drawImage(spriteCache.get(key),Math.round(-12*scale),Math.round(-130*scale),Math.round(116*scale),Math.round(134*scale)); ctx.restore();
  }
  function glyph(letter,color,outline) {
    const key=letter+color;
    if(glyphCache.has(key)) return glyphCache.get(key);
    const mask=document.createElement('canvas'), sample=mask.getContext('2d');
    sample.font='900 70px Arial'; mask.width=Math.ceil(sample.measureText(letter).width)+8; mask.height=82;
    sample.font='900 70px Arial'; sample.fillStyle='#ffffff'; sample.fillText(letter,4,70);
    const data=sample.getImageData(0,0,mask.width,mask.height), output=sample.createImageData(mask.width,mask.height);
    const inside=(x,y)=>x>=0&&x<mask.width&&y>=0&&y<82&&data.data[(y*mask.width+x)*4+3]>127;
    const base=parseInt(color.slice(1),16), border=parseInt(outline.slice(1),16);
    for(let y=0;y<82;y++) for(let x=0;x<mask.width;x++) {
      const solid=inside(x,y), edge=!solid&&(inside(x-1,y)||inside(x+1,y)||inside(x,y-1)||inside(x,y+1));
      if(!solid&&!edge) continue;
      const tint=solid?Math.round(15-(y-18)*.55+(noise(x,y)%5)-2+(!inside(x,y-1)?20:0)):0;
      const rgb=solid?base:border, at=(y*mask.width+x)*4;
      output.data[at]=Math.max(0,Math.min(255,(rgb>>16)+tint));
      output.data[at+1]=Math.max(0,Math.min(255,((rgb>>8)&255)+tint));
      output.data[at+2]=Math.max(0,Math.min(255,(rgb&255)+tint)); output.data[at+3]=255;
    }
    sample.clearRect(0,0,mask.width,82); sample.putImageData(output,0,0); glyphCache.set(key,mask); return mask;
  }
  function logo(cx,cy,time) {
    const colors=['#3c5caa','#e6af27','#7c9d57','#db807c'];
    const outlines=['#263e7e','#aa7616','#4f703b','#ab5158'];
    const images=[...'Read'].map((letter,i)=>glyph(letter,colors[i],outlines[i]));
    const total=images.reduce((sum,image)=>sum+image.width,0)+6, x=Math.round(cx-total/2), y=Math.round(cy-237);
    let cursor=x;
    images.forEach((image,i)=>{ctx.drawImage(image,cursor,y+Math.round(Math.sin(time*1.6-i*.7)));cursor+=image.width+2;});
    // Finer, one-pixel headphones and eyes retain the supplied brand's personality.
    r(x+1,y+25,2,28,'#457c9b'); r(x+48,y+25,2,28,'#457c9b'); r(x+7,y+19,36,2,'#9ec8dd'); r(x+3,y+21,4,3,'#9ec8dd'); r(x+43,y+21,4,3,'#9ec8dd');
    block(x-2,y+35,7,16,'#83b3c9',2); block(x+48,y+35,7,16,'#83b3c9',2);
    block(x+15,y+31,8,11,'#fff8e8',3); block(x+28,y+31,8,11,'#fff8e8',3); r(x+19,y+35,3,5,'#233b64'); r(x+29,y+35,3,5,'#233b64');
    const bulbX=x+images[0].width+images[1].width+16; block(bulbX,y+45,11,12,'#fff4c9',4); r(bulbX+3,y+57,5,7,'#fff4c9'); r(bulbX+3,y+66,5,1,'#fff4c9');
    const bx=x+total-30; r(bx,y+54,10,16,'#72a6c1'); r(bx+10,y+54,10,16,'#aecbd7'); r(bx+9,y+54,1,17,'#fff8e7');
    for(let i=0;i<3;i++) { r(bx+2,y+58+i*3,6,1,'#e9f1e8'); r(bx+12,y+58+i*3,6,1,'#f8f0dc'); }
    star(x-17,y+51+Math.round(Math.sin(time)*3),'#bca065',2); star(x+total+12,y+26+Math.round(Math.cos(time)*3),'#bca065',2);
  }
  return {
    rect: r, block, star, drawBear: bear, drawLogo: logo,
    dispose() { spriteCache.clear(); glyphCache.clear() }
  }
}
