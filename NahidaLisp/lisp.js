// NahidaLisp v0.3
function tokenize(input) {
    input=input.replace(new RegExp(String.fromCharCode(0x201C)+"|"+String.fromCharCode(0x201D),"g"),String.fromCharCode(34));
    input=input.replace(new RegExp(String.fromCharCode(0x2018)+"|"+String.fromCharCode(0x2019),"g"),String.fromCharCode(39));
    const tokens = [];
    let i = 0;
    while (i < input.length) {
        const ch = input[i];
        if (/\s/.test(ch)) { i++; continue; }
        if (ch === ';') { while (i < input.length && input[i] !== '\n') i++; continue; }
        if (ch === '(' || ch === ')') { tokens.push(ch); i++; continue; }
        if (ch === "'") { tokens.push("'"); i++; continue; }
        if (ch === '`') { tokens.push('`'); i++; continue; }
        if (ch === ',') {
            if (input[i+1] === '@') { tokens.push(',@'); i += 2; }
            else { tokens.push(','); i++; }
            continue;
        }
        if (ch === '"') {
            let str = '"';
            i++;
            while (i < input.length && input[i] !== '"') {
                if (input[i] === '\\') { str += input[i]; i++; str += input[i] || ''; }
                else { str += input[i]; }
                i++;
            }
            str += '"';
            i++;
            tokens.push(str);
            continue;
        }
        let token = '';
        while (i < input.length && !/[\s()";]/.test(input[i])) {
            token += input[i]; i++;
        }
        tokens.push(token);
    }
    return tokens;
}

function parse(tokens) {
    if (tokens.length === 0) throw new Error('Unexpected EOF');
    const token = tokens.shift();
    if (token === '(') {
        const list = [];
        while (tokens[0] !== ')') {
            if (tokens.length === 0) throw new Error('Missing )');
            list.push(parse(tokens));
        }
        tokens.shift();
        return list;
    }
    if (token === ')') throw new Error('Unexpected )');
    if (token === "'") return ['quote', parse(tokens)];
    if (token === '`') return ['quasiquote', parse(tokens)];
    if (token === ',') return ['unquote', parse(tokens)];
    if (token === ',@') return ['unquote-splicing', parse(tokens)];
    return atom(token);
}

function atom(token) {
    if (token === '#t' || token === 'true') return true;
    if (token === '#f' || token === 'false') return false;
    if (token === 'null' || token === 'nil') return [];
    if (token.length >= 2 && token[0] === '"' && token[token.length-1] === '"') return token;
    const num = Number(token);
    if (!isNaN(num)) return num;
    return token;
}

function read(input) { const t = tokenize(input); return parse(t); }

class Env {
    constructor(params = [], args = [], outer = null) {
        this.data = {};
        this.outer = outer;
        for (let i = 0; i < params.length; i++) this.data[params[i]] = args[i];
    }
    find(name) {
        if (name in this.data) return this;
        if (this.outer) return this.outer.find(name);
        throw new Error('Undefined symbol: ' + name);
    }
    get(name) { return this.find(name).data[name]; }
    set(name, value) { this.data[name] = value; }
}

function createGlobalEnv() {
    const env = new Env();
    env.set('+', (...a) => a.reduce((x,y) => x+y, 0));
    env.set('-', (...a) => a.length===1 ? -a[0] : a.reduce((x,y) => x-y));
    env.set('*', (...a) => a.reduce((x,y) => x*y, 1));
    env.set('/', (...a) => a.length===1 ? 1/a[0] : a.reduce((x,y) => x/y));
    env.set('%', (a,b) => a%b);
    env.set('modulo', (a,b) => ((a%b)+b)%b);
    env.set('=', (a,b) => a===b);
    env.set('<', (a,b) => a<b);
    env.set('>', (a,b) => a>b);
    env.set('<=', (a,b) => a<=b);
    env.set('>=', (a,b) => a>=b);
    env.set('equal?', (a,b) => JSON.stringify(a)===JSON.stringify(b));
    env.set('not', x => !x);
    env.set('list', (...a) => a);
    env.set('car', l => l[0]);
    env.set('cdr', l => l.slice(1));
    env.set('cons', (a,l) => [a, ...(Array.isArray(l)?l:[l])]);
    env.set('null?', x => Array.isArray(x) && x.length===0);
    env.set('pair?', x => Array.isArray(x) && x.length>0);
    env.set('list?', x => Array.isArray(x));
    env.set('length', l => l.length);
    env.set('nth', (l,n) => l[n]);
    env.set('last', l => l[l.length-1]);
    env.set('append', (...ls) => ls.reduce((a,b) => [...a,...b], []));
    env.set('reverse', l => [...l].reverse());
    env.set('range', (s,e,st) => { if(e===undefined){e=s;s=0;} if(!st)st=1; const r=[]; for(let i=s;i<e;i+=st)r.push(i); return r; });
    env.set('take', (n,l) => l.slice(0,n));
    env.set('drop', (n,l) => l.slice(n));
    env.set('flatten', l => l.flat(Infinity));
    env.set('zip', (...ls) => ls[0].map((_,i) => ls.map(l=>l[i])));
    env.set('assoc', (k,l) => l.find(p=>p[0]===k)||false);
    env.set('member', (x,l) => { const i=l.indexOf(x); return i===-1?false:l.slice(i); });
    const callFn = (fn, args) => {
        if (typeof fn === 'function') return fn(...args);
        if (fn && fn.params !== undefined) {
            const e = new Env(fn.params, args.slice(0, fn.params.length), fn.env);
            if (fn.restParam) e.set(fn.restParam, args.slice(fn.params.length));
            return evaluate(fn.body, e);
        }
        throw new Error('Not a function');
    };
    env.set('map', (fn,...ls) => ls.length===1 ? ls[0].map(x=>callFn(fn,[x])) : ls[0].map((_,i)=>callFn(fn,ls.map(l=>l[i]))));
    env.set('filter', (fn,l) => l.filter(x=>callFn(fn,[x])));
    env.set('reduce', (fn,init,l) => l.reduce((acc,x)=>callFn(fn,[acc,x]),init));
    env.set('foldl', (fn,init,l) => l.reduce((acc,x)=>callFn(fn,[x,acc]),init));
    env.set('foldr', (fn,init,l) => l.reduceRight((acc,x)=>callFn(fn,[x,acc]),init));
    env.set('for-each', (fn,l) => { l.forEach(x=>callFn(fn,[x])); return null; });
    env.set('apply', (fn,l) => callFn(fn,l));
    env.set('sort', (fn,l) => [...l].sort((a,b) => callFn(fn,[a,b])?-1:callFn(fn,[b,a])?1:0));
    env.set('compose', (...fns) => (...args) => { let r=callFn(fns[fns.length-1],args); for(let i=fns.length-2;i>=0;i--)r=callFn(fns[i],[r]); return r; });
    env.set('string-length', s => s.length);
    env.set('string-ref', (s,i) => s[i]);
    env.set('substring', (s,a,b) => s.slice(a,b));
    env.set('string-append', (...a) => a.join(''));
    env.set('string->number', s => Number(s));
    env.set('number->string', n => String(n));
    env.set('string->list', s => [...s]);
    env.set('list->string', l => l.join(''));
    env.set('string-split', (s,sep) => s.split(sep||''));
    env.set('string-contains', (s,sub) => s.includes(sub));
    env.set('string-upcase', s => s.toUpperCase());
    env.set('string-downcase', s => s.toLowerCase());
    env.set('string-trim', s => s.trim());
    env.set('string?', x => typeof x === 'string' && x[0] !== '"');
    env.set('format', (f,...a) => a.reduce((s,v)=>s.replace('~a',String(v)),f));
    env.set('abs', Math.abs);
    env.set('max', (...a) => Math.max(...a));
    env.set('min', (...a) => Math.min(...a));
    env.set('floor', Math.floor);
    env.set('ceil', Math.ceil);
    env.set('round', Math.round);
    env.set('sqrt', Math.sqrt);
    env.set('expt', Math.pow);
    env.set('log', (x,b) => b?Math.log(x)/Math.log(b):Math.log(x));
    env.set('sin', Math.sin);
    env.set('cos', Math.cos);
    env.set('tan', Math.tan);
    env.set('random', n => n?Math.floor(Math.random()*n):Math.random());
    env.set('pi', Math.PI);
    env.set('e', Math.E);
    env.set('number?', x => typeof x === 'number');
    env.set('boolean?', x => typeof x === 'boolean');
    env.set('symbol?', x => typeof x === 'string' && x[0] !== '"');
    env.set('procedure?', x => typeof x === 'function' || (x && x.params !== undefined));
    env.set('even?', x => x%2===0);
    env.set('odd?', x => x%2!==0);
    env.set('zero?', x => x===0);
    env.set('positive?', x => x>0);
    env.set('negative?', x => x<0);
    env.set('void', () => null);
    env.set('identity', x => x);
    env.set('print', (...a) => { console.log(...a); return a[a.length-1]; });
    env.set('display', (...a) => { process.stdout.write(a.map(String).join('')); return null; });
    env.set('newline', () => { process.stdout.write('\n'); return null; });
    env.set('error', m => { throw new Error(m); });
    env.set('make-hash', () => new Map());
    env.set('hash-set!', (h,k,v) => { h.set(k,v); return h; });
    env.set('hash-ref', (h,k,d) => h.has(k)?h.get(k):(d!==undefined?d:null));
    env.set('hash-has?', (h,k) => h.has(k));
    env.set('hash-keys', h => [...h.keys()]);
    env.set('hash-values', h => [...h.values()]);
    return env;
}

function evaluate(expr, env) {
    while (true) {
        if (typeof expr === 'string') {
            if (expr.length >= 2 && expr[0] === '"' && expr[expr.length-1] === '"') return expr.slice(1,-1);
            return env.get(expr);
        }
        if (typeof expr === 'number' || typeof expr === 'boolean') return expr;
        if (expr === null || expr === undefined) return null;
        if (!Array.isArray(expr)) return expr;
        if (expr.length === 0) return [];
        const [first, ...rest] = expr;
        switch (first) {
            case 'define': {
                if (Array.isArray(rest[0])) {
                    const [sig,...body] = rest;
                    const [name,...params] = sig;
                    const ri = params.indexOf('&rest');
                    if (ri !== -1) {
                        env.set(name, {params:params.slice(0,ri), restParam:params[ri+1], body:body.length===1?body[0]:['begin',...body], env});
                    } else {
                        env.set(name, {params, body:body.length===1?body[0]:['begin',...body], env});
                    }
                } else { env.set(rest[0], evaluate(rest[1], env)); }
                return null;
            }
            case 'define-macro': {
                const [sig,...body] = rest;
                const [name,...params] = sig;
                env.set(name, {params, body:body.length===1?body[0]:['begin',...body], isMacro:true, env});
                return null;
            }
            case 'lambda': {
                const [params,...body] = rest;
                const ri = params.indexOf('&rest');
                if (ri !== -1) return {params:params.slice(0,ri), restParam:params[ri+1], body:body.length===1?body[0]:['begin',...body], env};
                return {params, body:body.length===1?body[0]:['begin',...body], env};
            }
            case 'if': { expr = evaluate(rest[0],env) ? rest[1] : (rest[2]!==undefined?rest[2]:null); continue; }
            case 'cond': {
                for (const cl of rest) {
                    const [t,...b] = cl;
                    if (t==='else'||evaluate(t,env)) { for(let i=0;i<b.length-1;i++)evaluate(b[i],env); expr=b[b.length-1]; break; }
                }
                continue;
            }
            case 'let': {
                const [binds,...body] = rest;
                env = new Env(binds.map(b=>b[0]), binds.map(b=>evaluate(b[1],env)), env);
                for(let i=0;i<body.length-1;i++)evaluate(body[i],env);
                expr=body[body.length-1]; continue;
            }
            case 'let*': {
                const [binds,...body] = rest;
                let le = new Env([],[],env);
                for (const [n,v] of binds) le.set(n, evaluate(v,le));
                env=le; for(let i=0;i<body.length-1;i++)evaluate(body[i],env);
                expr=body[body.length-1]; continue;
            }
            case 'letrec': {
                const [binds,...body] = rest;
                const le = new Env([],[],env);
                for (const [n] of binds) le.set(n,null);
                for (const [n,v] of binds) le.set(n,evaluate(v,le));
                env=le; for(let i=0;i<body.length-1;i++)evaluate(body[i],env);
                expr=body[body.length-1]; continue;
            }
            case 'begin': {
                for(let i=0;i<rest.length-1;i++)evaluate(rest[i],env);
                expr=rest[rest.length-1]; continue;
            }
            case 'and': {
                if(rest.length===0) return true;
                for(let i=0;i<rest.length-1;i++){if(!evaluate(rest[i],env))return false;}
                expr=rest[rest.length-1]; continue;
            }
            case 'or': {
                if(rest.length===0) return false;
                for(let i=0;i<rest.length-1;i++){const v=evaluate(rest[i],env);if(v)return v;}
                expr=rest[rest.length-1]; continue;
            }
            case 'when': { if(evaluate(rest[0],env)){for(let i=1;i<rest.length-1;i++)evaluate(rest[i],env);expr=rest[rest.length-1];continue;}return null; }
            case 'unless': { if(!evaluate(rest[0],env)){for(let i=1;i<rest.length-1;i++)evaluate(rest[i],env);expr=rest[rest.length-1];continue;}return null; }
            case 'do': {
                const [binds,tc,...body] = rest;
                const le = new Env([],[],env);
                for(const [n,init] of binds) le.set(n,evaluate(init,le));
                const [test,...exit] = tc;
                while(!evaluate(test,le)){for(const e of body)evaluate(e,le);for(const [n,,step] of binds){if(step!==undefined)le.set(n,evaluate(step,le));}}
                if(exit.length===0)return null;
                env=le;for(let i=0;i<exit.length-1;i++)evaluate(exit[i],env);
                expr=exit[exit.length-1];continue;
            }
            case 'case': {
                const [ke,...cls] = rest;
                const key = evaluate(ke,env);
                for(const [t,...b] of cls){if(t==='else'||(Array.isArray(t)&&t.includes(key))){for(let i=0;i<b.length-1;i++)evaluate(b[i],env);expr=b[b.length-1];break;}}
                continue;
            }
            case 'set!': { env.find(rest[0]).data[rest[0]]=evaluate(rest[1],env); return null; }
            case 'quote': return rest[0];
            case 'quasiquote': return expandQQ(rest[0],env);
            case 'unquote': return evaluate(rest[0],env);
        }
        const fn = evaluate(first, env);
        if (fn && fn.isMacro) { const me=new Env(fn.params,rest,fn.env); expr=evaluate(fn.body,me); continue; }
        const args = rest.map(a => evaluate(a, env));
        if (typeof fn === 'function') return fn(...args);
        if (fn && fn.params !== undefined) {
            env = new Env(fn.params, args.slice(0,fn.params.length), fn.env);
            if (fn.restParam) env.set(fn.restParam, args.slice(fn.params.length));
            expr = fn.body; continue;
        }
        throw new Error('Not a function: ' + JSON.stringify(first));
    }
}

function expandQQ(expr, env) {
    if (!Array.isArray(expr)) return expr;
    if (expr.length>0 && expr[0]==='unquote') return evaluate(expr[1],env);
    const r = [];
    for (const item of expr) {
        if (Array.isArray(item) && item[0]==='unquote-splicing') {
            const v=evaluate(item[1],env); if(Array.isArray(v))r.push(...v);else r.push(v);
        } else { r.push(expandQQ(item,env)); }
    }
    return r;
}

function run(code, env) {
    const tokens = tokenize(code);
    const exprs = [];
    while (tokens.length > 0) exprs.push(parse(tokens));
    let result;
    for (const e of exprs) result = evaluate(e, env);
    return result;
}

if (require.main === module) {
    const env = createGlobalEnv();
    const fs = require('fs');
    const path = require('path');
    env.set('load', (file) => { let c = fs.readFileSync(path.resolve(process.cwd(), file), 'utf8'); if(c.charCodeAt(0)===0xFEFF)c=c.slice(1); run(c, env); return null; });
    const ea = process.argv.find(a=>a.startsWith('--eval='));
    if (ea) { const r=run(ea.slice(7),env); if(r!==null&&r!==undefined)console.log(r); process.exit(0); }
    const fa = process.argv.find(a=>a.startsWith('--file='));
    if (fa) { const fs=require('fs'); let c=fs.readFileSync(fa.slice(7),'utf8'); if(c.charCodeAt(0)===0xFEFF)c=c.slice(1); const r=run(c,env); if(r!==null&&r!==undefined)console.log(r); process.exit(0); }
    const rl=require('readline').createInterface({input:process.stdin,output:process.stdout});
    console.log('NahidaLisp v0.3 | (exit) to quit');
    const prompt=()=>{rl.question('> ',line=>{if(line.trim()==='(exit)'){rl.close();return;}try{const r=run(line,env);if(r!==null&&r!==undefined)console.log('=>',r);}catch(e){console.log('Error:',e.message);}prompt();});};
    prompt();
}

module.exports = { tokenize, parse, read, evaluate, run, createGlobalEnv, Env };