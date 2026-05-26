// 随机分形森林 - 多棵不同形态的植物
const { createGlobalEnv, run } = require('./lisp.js');
const fs = require('fs');
const path = require('path');

const env = createGlobalEnv();
env.set('load', (f) => {
    let c = fs.readFileSync(path.resolve(__dirname, f), 'utf8');
    if (c.charCodeAt(0) === 0xFEFF) c = c.slice(1);
    run(c, env);
    return null;
});
run('(load "stdlib.lisp")', env);
run('(load "lsystem.lisp")', env);

function turtleToLines(symbols, config) {
    const { angle = 25, stepLen = 5, startX = 0, startY = 0, startAngle = -90 } = config;
    let x = startX, y = startY, dir = startAngle;
    const stack = [];
    const lines = [];
    for (const sym of symbols) {
        switch (sym) {
            case 'F': case 'A': case 'B': {
                const rad = dir * Math.PI / 180;
                const nx = x + stepLen * Math.cos(rad);
                const ny = y + stepLen * Math.sin(rad);
                lines.push({ x1: x, y1: y, x2: nx, y2: ny });
                x = nx; y = ny;
                break;
            }
            case '+': dir += angle; break;
            case '-': dir -= angle; break;
            case '[': stack.push({ x, y, dir }); break;
            case ']': { const s = stack.pop(); x = s.x; y = s.y; dir = s.dir; break; }
        }
    }
    return lines;
}

// 生成随机植物
function generateStochasticPlant(seed, generations) {
    run(`(set-seed! ${seed})`, env);
    return run(`(stochastic-iterate stochastic-plant-rules plant-axiom ${generations})`, env);
}

// 森林参数
const trees = [];
const numTrees = 7;
const spacing = 120;
const colors = ['#1a4d1a', '#2d5016', '#3d6b24', '#1a5c3a', '#4a7c34', '#2b4a0f', '#3a6320'];

for (let i = 0; i < numTrees; i++) {
    const seed = 42 + i * 37;
    const gen = 3 + (i % 2); // 交替3代和4代
    const symbols = generateStochasticPlant(seed, gen);
    const stepLen = gen === 4 ? 2.5 : 3.5;
    const angle = 22 + (i % 3) * 4; // 22-30度变化
    const lines = turtleToLines(symbols, {
        angle,
        stepLen,
        startX: 60 + i * spacing,
        startY: 500,
        startAngle: -90 + (Math.random() - 0.5) * 10
    });
    trees.push({ lines, color: colors[i % colors.length], width: gen === 4 ? 0.6 : 0.9 });
    console.log(`Tree ${i+1}: seed=${seed} gen=${gen} angle=${angle} lines=${lines.length}`);
}

// 生成SVG
let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
for (const tree of trees) {
    for (const l of tree.lines) {
        minX = Math.min(minX, l.x1, l.x2);
        maxX = Math.max(maxX, l.x1, l.x2);
        minY = Math.min(minY, l.y1, l.y2);
        maxY = Math.max(maxY, l.y1, l.y2);
    }
}

const padding = 30;
const width = maxX - minX + padding * 2;
const height = maxY - minY + padding * 2;
const ox = -minX + padding;
const oy = -minY + padding;

let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(width)}" height="${Math.ceil(height)}">\n`;
svg += `<rect width="100%" height="100%" fill="#f5f0e8"/>\n`;

// 地面线
const groundY = 500 + oy;
svg += `<line x1="0" y1="${groundY}" x2="${Math.ceil(width)}" y2="${groundY}" stroke="#8b7355" stroke-width="1.5" stroke-dasharray="4,2"/>\n`;

for (const tree of trees) {
    svg += `<g stroke="${tree.color}" stroke-width="${tree.width}" stroke-linecap="round" opacity="0.85">\n`;
    for (const l of tree.lines) {
        svg += `<line x1="${(l.x1+ox).toFixed(1)}" y1="${(l.y1+oy).toFixed(1)}" x2="${(l.x2+ox).toFixed(1)}" y2="${(l.y2+oy).toFixed(1)}"/>\n`;
    }
    svg += `</g>\n`;
}

svg += `</svg>`;
fs.writeFileSync(path.join(__dirname, 'fractal-forest.svg'), svg);
console.log(`\nForest SVG written: ${Math.ceil(width)}x${Math.ceil(height)}px`);