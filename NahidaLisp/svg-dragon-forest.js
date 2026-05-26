// 龙曲线 + 森林（纯JS，不依赖NahidaLisp解释器）
const fs = require('fs');
const path = require('path');

let seed = 42;
function setSeed(s) { seed = s; }
function rand() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }

function lsystem(rules, axiom, n) {
    let str = axiom;
    for (let i = 0; i < n; i++) {
        let next = [];
        for (const ch of str) next.push(...(rules[ch] || [ch]));
        str = next;
    }
    return str;
}

function stochastic(rules, axiom, n) {
    let str = axiom;
    for (let i = 0; i < n; i++) {
        let next = [];
        for (const ch of str) {
            if (rules[ch]) {
                const r = rand();
                let cum = 0;
                for (const [prob, repl] of rules[ch]) { cum += prob; if (r <= cum) { next.push(...repl); break; } }
            } else next.push(ch);
        }
        str = next;
    }
    return str;
}

function turtle(symbols, angle, step, sx=0, sy=0, sdir=-90) {
    let x=sx, y=sy, dir=sdir;
    const stack=[], lines=[];
    for (const sym of symbols) {
        if (sym==='F'||sym==='A'||sym==='B') {
            const rad=dir*Math.PI/180, nx=x+step*Math.cos(rad), ny=y+step*Math.sin(rad);
            lines.push([x,y,nx,ny]); x=nx; y=ny;
        } else if (sym==='+') dir+=angle;
        else if (sym==='-') dir-=angle;
        else if (sym==='[') stack.push([x,y,dir]);
        else if (sym===']') { const s=stack.pop(); x=s[0]; y=s[1]; dir=s[2]; }
    }
    return lines;
}

function toSVG(lines, color, sw, bg='#f8f6f0') {
    let [minX,maxX,minY,maxY]=[Infinity,-Infinity,Infinity,-Infinity];
    for (const [x1,y1,x2,y2] of lines) {
        minX=Math.min(minX,x1,x2); maxX=Math.max(maxX,x1,x2);
        minY=Math.min(minY,y1,y2); maxY=Math.max(maxY,y1,y2);
    }
    const p=20, w=maxX-minX+p*2, h=maxY-minY+p*2, ox=-minX+p, oy=-minY+p;
    let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(w)}" height="${Math.ceil(h)}"><rect width="100%" height="100%" fill="${bg}"/><g stroke="${color}" stroke-width="${sw}" stroke-linecap="round">`;
    for (const [x1,y1,x2,y2] of lines) s+=`<line x1="${(x1+ox).toFixed(1)}" y1="${(y1+oy).toFixed(1)}" x2="${(x2+ox).toFixed(1)}" y2="${(y2+oy).toFixed(1)}"/>`;
    return s+`</g></svg>`;
}

// 龙曲线 12代
console.log('Dragon curve gen 12...');
const dragon = lsystem({'X':['X','+','Y','F','+'],'Y':['-','F','X','-','Y']}, ['F','X'], 12);
console.log(`  ${dragon.length} symbols, ${dragon.filter(s=>s==='F').length} lines`);
fs.writeFileSync(path.join(__dirname,'dragon-curve.svg'), toSVG(turtle(dragon,90,4,0,0,0),'#8b1a1a',0.5));
console.log('  dragon-curve.svg written');

// 随机森林
console.log('Fractal forest...');
const stRules = {'F':[[0.6,['F','[','+','F',']','F','[','-','F',']','F']],[0.4,['F','[','+','F',']','[','-','F',']']]]};
const colors = ['#1a4d1a','#2d5016','#3d6b24','#1a5c3a','#4a7c34','#2b4a0f','#3a6320'];
const allLines = [];
for (let i=0; i<7; i++) {
    setSeed(42+i*37);
    const gen=3+(i%2), ang=22+(i%3)*4;
    const syms = stochastic(stRules, ['F'], gen);
    const ls = turtle(syms, ang, gen===4?2.5:3.5, 80+i*130, 0, -90+(i-3)*3);
    for (const l of ls) allLines.push([...l, colors[i]]);
    console.log(`  Tree ${i+1}: ${ls.length} lines`);
}
let [minX,maxX,minY,maxY]=[Infinity,-Infinity,Infinity,-Infinity];
for (const [x1,y1,x2,y2] of allLines) { minX=Math.min(minX,x1,x2); maxX=Math.max(maxX,x1,x2); minY=Math.min(minY,y1,y2); maxY=Math.max(maxY,y1,y2); }
const p=30, w=maxX-minX+p*2, h=maxY-minY+p*2, ox=-minX+p, oy=-minY+p;
let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(w)}" height="${Math.ceil(h)}"><rect width="100%" height="100%" fill="#f5f0e8"/>`;
const byC={};
for (const [x1,y1,x2,y2,c] of allLines) (byC[c]||(byC[c]=[])).push([x1,y1,x2,y2]);
for (const [c,ls] of Object.entries(byC)) {
    svg+=`<g stroke="${c}" stroke-width="0.8" stroke-linecap="round" opacity="0.85">`;
    for (const [x1,y1,x2,y2] of ls) svg+=`<line x1="${(x1+ox).toFixed(1)}" y1="${(y1+oy).toFixed(1)}" x2="${(x2+ox).toFixed(1)}" y2="${(y2+oy).toFixed(1)}"/>`;
    svg+=`</g>`;
}
svg+=`</svg>`;
fs.writeFileSync(path.join(__dirname,'fractal-forest.svg'), svg);
console.log('  fractal-forest.svg written');
console.log('Done!');