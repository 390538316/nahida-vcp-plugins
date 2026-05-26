// SVG renderer for L-System fractals
// 混合架构：小规模用NahidaLisp，大规模用JS原生
const { run, createGlobalEnv } = require(require('path').join(__dirname, 'lisp.js'));
const fs = require('fs');
const path = require('path');

// === Lisp 解释器（小规模） ===
const env = createGlobalEnv();
env.set('load', (f) => {
    let c = fs.readFileSync(path.resolve(__dirname, f), 'utf8');
    if (c.charCodeAt(0) === 0xFEFF) c = c.slice(1);
    run(c, env);
    return null;
});
run('(load "stdlib.lisp")', env);
run('(load "lsystem.lisp")', env);

// === JS 原生 L-system（大规模） ===
function jsLsystem(rules, axiom, n) {
    let str = axiom;
    for (let i = 0; i < n; i++) {
        let next = [];
        for (const ch of str) {
            next.push(...(rules[ch] || [ch]));
        }
        str = next;
    }
    return str;
}

// 随机L-system
let seed = 42;
function setSeed(s) { seed = s; }
function rand() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
function jsStochastic(rules, axiom, n) {
    let str = axiom;
    for (let i = 0; i < n; i++) {
        let next = [];
        for (const ch of str) {
            if (rules[ch]) {
                const r = rand();
                let cum = 0;
                for (const [prob, replacement] of rules[ch]) {
                    cum += prob;
                    if (r <= cum) { next.push(...replacement); break; }
                }
            } else {
                next.push(ch);
            }
        }
        str = next;
    }
    return str;
}

// === Turtle Graphics ===
function turtle(symbols, angle, stepLen, startX = 0, startY = 0, startDir = -90) {
    let x = startX, y = startY, dir = startDir;
    const stack = [], lines = [];
    for (const sym of symbols) {
        if (sym === 'F' || sym === 'A' || sym === 'B') {
            const rad = dir * Math.PI / 180;
            const nx = x + stepLen * Math.cos(rad);
            const ny = y + stepLen * Math.sin(rad);
            lines.push([x, y, nx, ny]);
            x = nx; y = ny;
        } else if (sym === '+') dir += angle;
        else if (sym === '-') dir -= angle;
        else if (sym === '[') stack.push([x, y, dir]);
        else if (sym === ']') { const s = stack.pop(); x = s[0]; y = s[1]; dir = s[2]; }
    }
    return lines;
}

// === SVG 输出 ===
function toSVG(lines, color, strokeW, bg = '#f8f6f0') {
    let [minX, maxX, minY, maxY] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const [x1, y1, x2, y2] of lines) {
        minX = Math.min(minX, x1, x2); maxX = Math.max(maxX, x1, x2);
        minY = Math.min(minY, y1, y2); maxY = Math.max(maxY, y1, y2);
    }
    const pad = 20, w = maxX - minX + pad * 2, h = maxY - minY + pad * 2;
    const ox = -minX + pad, oy = -minY + pad;
    let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(w)}" height="${Math.ceil(h)}">\n`;
    s += `<rect width="100%" height="100%" fill="${bg}"/>\n`;
    s += `<g stroke="${color}" stroke-width="${strokeW}" stroke-linecap="round">\n`;
    for (const [x1, y1, x2, y2] of lines)
        s += `<line x1="${(x1+ox).toFixed(1)}" y1="${(y1+oy).toFixed(1)}" x2="${(x2+ox).toFixed(1)}" y2="${(y2+oy).toFixed(1)}"/>\n`;
    s += `</g>\n</svg>`;
    return s;
}

// === 生成 ===
const outDir = __dirname;

// 1. 分形植物 4代（用Lisp生成，验证管线）
console.log('Plant gen 4 (via NahidaLisp)...');
const plant = run('(lsystem-iterate plant-rules plant-axiom 4)', env);
console.log(`  ${plant.length} symbols`);
fs.writeFileSync(path.join(outDir, 'fractal-plant.svg'),
    toSVG(turtle(plant, 25.7, 3), '#2d5016', 0.8));

// 2. Koch 雪花 4代（用Lisp）
console.log('Koch gen 4 (via NahidaLisp)...');
const koch = run('(lsystem-iterate koch-rules koch-axiom 4)', env);
console.log(`  ${koch.length} symbols`);
fs.writeFileSync(path.join(outDir, 'koch-snowflake.svg'),
    toSVG(turtle(koch, 60, 3, 0, 0, 0), '#1a3a5c', 0.6));

// 3. 龙曲线 12代（用JS原生，避免Lisp大列表问题）
console.log('Dragon gen 12 (native JS)...');
const dragon = jsLsystem(
    { 'X': ['X','+','Y','F','+'], 'Y': ['-','F','X','-','Y'] },
    ['F','X'], 12);
console.log(`  ${dragon.length} symbols`);
fs.writeFileSync(path.join(outDir, 'dragon-curve.svg'),
    toSVG(turtle(dragon, 90, 4, 0, 0, 0), '#8b1a1a', 0.5));

// 4. 随机分形森林（7棵树，JS原生）
console.log('Fractal forest (7 trees, native JS)...');
const stochasticRules = {
    'F': [[0.6, ['F','[','+','F',']','F','[','-','F',']','F']],
          [0.4, ['F','[','+','F',']','[','-','F',']']]]
};
const allLines = [];
const colors = ['#1a4d1a','#2d5016','#3d6b24','#1a5c3a','#4a7c34','#2b4a0f','#3a6320'];
for (let i = 0; i < 7; i++) {
    setSeed(42 + i * 37);
    const gen = 3 + (i % 2);
    const angle = 22 + (i % 3) * 4;
    const syms = jsStochastic(stochasticRules, ['F'], gen);
    const lines = turtle(syms, angle, gen === 4 ? 2.5 : 3.5, 80 + i * 130, 0, -90 + (i-3)*3);
    for (const l of lines) allLines.push([...l, colors[i]]);
    console.log(`  Tree ${i+1}: seed=${42+i*37} gen=${gen} ${lines.length} lines`);
}
// 森林SVG（多色）
let [minX, maxX, minY, maxY] = [Infinity, -Infinity, Infinity, -Infinity];
for (const [x1,y1,x2,y2] of allLines) {
    minX = Math.min(minX,x1,x2); maxX = Math.max(maxX,x1,x2);
    minY = Math.min(minY,y1,y2); maxY = Math.max(maxY,y1,y2);
}
const pad=30, w=maxX-minX+pad*2, h=maxY-minY+pad*2, ox=-minX+pad, oy=-minY+pad;
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(w)}" height="${Math.ceil(h)}">\n`;
svg += `<rect width="100%" height="100%" fill="#f5f0e8"/>\n`;
// 按颜色分组
const byColor = {};
for (const [x1,y1,x2,y2,c] of allLines) { (byColor[c]||(byColor[c]=[])).push([x1,y1,x2,y2]); }
for (const [c, ls] of Object.entries(byColor)) {
    svg += `<g stroke="${c}" stroke-width="0.8" stroke-linecap="round" opacity="0.85">\n`;
    for (const [x1,y1,x2,y2] of ls)
        svg += `<line x1="${(x1+ox).toFixed(1)}" y1="${(y1+oy).toFixed(1)}" x2="${(x2+ox).toFixed(1)}" y2="${(y2+oy).toFixed(1)}"/>\n`;
    svg += `</g>\n`;
}
svg += `</svg>`;
fs.writeFileSync(path.join(outDir, 'fractal-forest.svg'), svg);

console.log('All done!');