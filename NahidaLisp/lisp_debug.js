// NahidaLisp v0.2
// ============ 1. Tokenizer============
function tokenize(input) {
    const tokens = [];
    let i = 0;
    while (i < input.length) {
        const ch = input[i];
    input = input.replace(/[\u201C\u201D]/g, String.fromCharCode(34)).replace(/[\u2018\u2019]/g, String.fromCharCode(39));
        if (/\s/.test(ch)) { i++; continue; }
        // ; 
        if (ch === ';') {
            while (i < input.length && input[i] !== '\n') i++;
            continue;
        }
        if (ch === '(' || ch === ')') { tokens.push(ch); i++; continue; }
        // 'expr (quote expr)
        if (ch === "'") { tokens.push("'"); i++; continue; }
        // / quasiquote 
        if (ch === '`') { tokens.push('`'); i++; continue; }
        if (ch === ',') {
            if (input[i+1] === '@') { tokens.push(',@'); i += 2; }
            else { tokens.push(','); i++; }
            continue;
        }
        // 
        if (ch === '"') {
            let str = '';
            i++;
            while (i < input.length && input[i] !== '"') {
                if (input[i] === '\\') { i++; str += input[i] || ''; }
                else { str += input[i]; }
                i++;
            }
            i++;
            tokens.push(`"${str}"`);
            continue;
        }
        // 
        let token = '';
        while (i < input.length && !/[\s()";]/.test(input[i])) {
            token += input[i]; i++;
        }
        tokens.push(token);
    }
    return tokens;
}

// ============ 2. Parser============
function parse(tokens) {
    if (tokens.length === 0) throw new Error('Unexpected EOF');
    const token = tokens.shift();
    if (token === '(') {
        const list = [];
        while (tokens[0] !== ')') {
            if (tokens.length === 0) throw new Error('Missing closing )');
            list.push(parse(tokens));
        }
        tokens.shift();
        return list;
    } else if (token === ')') {
        throw new Error('Unexpected )');
    } else if (token === "'") {
        return ['quote', parse(tokens)];
    } else if (token === '`') {
        return ['quasiquote', parse(tokens)];
    } else if (token === ',') {
        return ['unquote', parse(tokens)];
    } else if (token === ',@') {
        return ['unquote-splicing', parse(tokens)];
    } else {
        return atom(token);
    }
}

function atom(token) {
    if (token === '#t' || token === 'true') return true;
    if (token === '#f' || token === 'false') return false;
    if (token === 'null' || token === 'nil') return [];
    if (token.startsWith('"') && token.endsWith('"')) return token.slice(1, -1);
    const num = Number(token);
    if (!isNaN(num)) return num;
    return token;
}

function read(input) {
    const tokens = tokenize(input);
    return parse(tokens);
}

// ============ 3. Environment/============
class Env {
    constructor(params = [], args = [], outer = null) {
        this.data = {};
        this.outer = outer;
        for (let i = 0; i < params.length; i++) {
            this.data[params[i]] = args[i];
        }
    }
    find(name) {
        if (name in this.data) return this;
        if (this.outer) return this.outer.find(name);
        throw new Error(`Undefined symbol: ${name}`);
    }
    get(name) { return this.find(name).data[name]; }
    set(name, value) { this.data[name] = value; }
}

// ============ 4.  ============
function createGlobalEnv() {
    const env = new Env();

    // --- ---
    env.set('+', (...args) => args.reduce((a, b) => a + b, 0));
    env.set('-', (...args) => args.length === 1 ? -args[0] : args.reduce((a, b) => a - b));
    env.set('*', (...args) => args.reduce((a, b) => a * b, 1));
    env.set('/', (...args) => args.length === 1 ? 1/args[0] : args.reduce((a, b) => a / b));
    env.set('%', (a, b) => a % b);
    env.set('modulo', (a, b) => ((a % b) + b) % b);

    // --- ---
    env.set('=', (a, b) => a === b);
    env.set('<', (a, b) => a < b);
    env.set('>', (a, b) => a > b);
    env.set('<=', (a, b) => a <= b);
    env.set('>=', (a, b) => a >= b);
    env.set('equal?', (a, b) => JSON.stringify(a) === JSON.stringify(b));

    // --- and/or evaluate ---
    env.set('not', (x) => !x);

    // --- ---
    env.set('list', (...args) => args);
    env.set('car', (lst) => lst[0]);
    env.set('cdr', (lst) => lst.slice(1));
    env.set('cons', (a, lst) => [a, ...(Array.isArray(lst) ? lst : [lst])]);
    env.set('null?', (x) => Array.isArray(x) && x.length === 0);
    env.set('pair?', (x) => Array.isArray(x) && x.length > 0);
    env.set('list?', (x) => Array.isArray(x));
    env.set('length', (lst) => lst.length);
    env.set('nth', (lst, n) => lst[n]);
    env.set('last', (lst) => lst[lst.length - 1]);
    env.set('append', (...lists) => lists.reduce((a, b) => [...a, ...b], []));
    env.set('reverse', (lst) => [...lst].reverse());
    env.set('range', (start, end, step) => {
        if (end === undefined) { end = start; start = 0; }
        if (step === undefined) step = 1;
        const r = [];
        for (let i = start; i < end; i += step) r.push(i);
        return r;
    });
    env.set('take', (n, lst) => lst.slice(0, n));
    env.set('drop', (n, lst) => lst.slice(n));
    env.set('flatten', (lst) => lst.flat(Infinity));
    env.set('zip', (...lists) => lists[0].map((_, i) => lists.map(l => l[i])));
    env.set('assoc', (key, lst) => lst.find(pair => pair[0] === key) || false);
    env.set('member', (x, lst) => { const i = lst.indexOf(x); return i === -1 ? false : lst.slice(i); });

    // --- ---
    const callFunc = (fn, args) => {
        if (typeof fn === 'function') return fn(...args);
        if (fn && fn.params) {
            const callEnv = new Env(fn.params, args.slice(0, fn.params.length), fn.env);
            if (fn.restParam) callEnv.set(fn.restParam, args.slice(fn.params.length));
            return evaluate(fn.body, callEnv);
        }
        throw new Error('Not a function');
    };
    env.set('map', (fn, ...lists) => {
        if (lists.length === 1) return lists[0].map(x => callFunc(fn, [x]));
        return lists[0].map((_, i) => callFunc(fn, lists.map(l => l[i])));
    });
    env.set('filter', (fn, lst) => lst.filter(x => callFunc(fn, [x])));
    env.set('reduce', (fn, init, lst) => lst.reduce((acc, x) => callFunc(fn, [acc, x]), init));
    env.set('foldl', (fn, init, lst) => lst.reduce((acc, x) => callFunc(fn, [x, acc]), init));
    env.set('foldr', (fn, init, lst) => lst.reduceRight((acc, x) => callFunc(fn, [x, acc]), init));
    env.set('for-each', (fn, lst) => { lst.forEach(x => callFunc(fn, [x])); return null; });
    env.set('apply', (fn, lst) => callFunc(fn, lst));
    env.set('sort', (fn, lst) => [...lst].sort((a, b) => callFunc(fn, [a, b]) ? -1 : callFunc(fn, [b, a]) ? 1 : 0));
    env.set('compose', (...fns) => (...args) => {
        let result = callFunc(fns[fns.length - 1], args);
        for (let i = fns.length - 2; i >= 0; i--) result = callFunc(fns[i], [result]);
        return result;
    });

    // --- ---
    env.set('string-length', (s) => s.length);
    env.set('string-ref', (s, i) => s[i]);
    env.set('substring', (s, start, end) => s.slice(start, end));
    env.set('string-append', (...args) => args.join(''));
    env.set('string->number', (s) => Number(s));
    env.set('number->string', (n) => String(n));
    env.set('string->list', (s) => [...s]);
    env.set('list->string', (lst) => lst.join(''));
    env.set('string-split', (s, sep) => s.split(sep || ''));
    env.set('string-contains', (s, sub) => s.includes(sub));
    env.set('string-upcase', (s) => s.toUpperCase());
    env.set('string-downcase', (s) => s.toLowerCase());
    env.set('string-trim', (s) => s.trim());
    env.set('string?', (x) => typeof x === 'string');
    env.set('format', (fmt, ...args) => args.reduce((f, a) => f.replace('~a', String(a)), fmt));

    // --- ---
    env.set('abs', Math.abs);
    env.set('max', (...args) => Math.max(...args));
    env.set('min', (...args) => Math.min(...args));
    env.set('floor', Math.floor);
    env.set('ceil', Math.ceil);
    env.set('round', Math.round);
    env.set('sqrt', Math.sqrt);
    env.set('expt', Math.pow);
    env.set('log', (x, base) => base ? Math.log(x) / Math.log(base) : Math.log(x));
    env.set('sin', Math.sin);
    env.set('cos', Math.cos);
    env.set('tan', Math.tan);
    env.set('random', (n) => n ? Math.floor(Math.random() * n) : Math.random());
    env.set('pi', Math.PI);
    env.set('e', Math.E);
    env.set('infinity', Infinity);

    // --- ---
    env.set('number?', (x) => typeof x === 'number');
    env.set('boolean?', (x) => typeof x === 'boolean');
    env.set('symbol?', (x) => typeof x === 'string');
    env.set('procedure?', (x) => typeof x === 'function' || (x && x.params !== undefined));
    env.set('even?', (x) => x % 2 === 0);
    env.set('odd?', (x) => x % 2 !== 0);
    env.set('zero?', (x) => x === 0);
    env.set('positive?', (x) => x > 0);
    env.set('negative?', (x) => x < 0);
    env.set('void', () => null);
    env.set('identity', (x) => x);

    // --- IO ---
    env.set('print', (...args) => { console.log(...args); return args[args.length - 1]; });
    env.set('display', (...args) => { process.stdout.write(args.map(String).join('')); return null; });
    env.set('newline', () => { process.stdout.write('\n'); return null; });
    env.set('error', (msg) => { throw new Error(msg); });

    // --- ---
    env.set('make-hash', () => new Map());
    env.set('hash-set!', (h, k, v) => { h.set(k, v); return h; });
    env.set('hash-ref', (h, k, def) => h.has(k) ? h.get(k) : (def !== undefined ? def : null));
    env.set('hash-has?', (h, k) => h.has(k));
    env.set('hash-keys', (h) => [...h.keys()]);
    env.set('hash-values', (h) => [...h.values()]);

    return env;
}

// ============ 5. Eval============
function evaluate(expr, env) {
    // 
    while (true) {
        if (typeof expr === 'string') return env.get(expr);
        if (typeof expr === 'number' || typeof expr === 'boolean') return expr;
        if (expr === null || expr === undefined) return null;
        if (!Array.isArray(expr)) return expr;
        if (expr.length === 0) return [];

        const [first, ...rest] = expr;

        switch (first) {
            case 'define': {
                if (Array.isArray(rest[0])) {
                    const [signature, ...body] = rest;
                    const [name, ...params] = signature;
                    const restIdx = params.indexOf('&rest');
                    if (restIdx !== -1) {
                        const fixed = params.slice(0, restIdx);
                        const restParam = params[restIdx + 1];
                        env.set(name, { params: fixed, restParam, body: body.length === 1 ? body[0] : ['begin', ...body], env });
                    } else {
                        env.set(name, { params, body: body.length === 1 ? body[0] : ['begin', ...body], env });
                    }
                } else {
                    env.set(rest[0], evaluate(rest[1], env));
                }
                return null;
            }
            case 'define-macro': {
                const [signature, ...body] = rest;
                const [name, ...params] = signature;
                env.set(name, { params, body: body.length === 1 ? body[0] : ['begin', ...body], isMacro: true, env });
                return null;
            }
            case 'lambda': {
                const [params, ...body] = rest;
                const restIdx = params.indexOf('&rest');
                if (restIdx !== -1) {
                    const fixed = params.slice(0, restIdx);
                    const restParam = params[restIdx + 1];
                    return { params: fixed, restParam, body: body.length === 1 ? body[0] : ['begin', ...body], env };
                }
                return { params, body: body.length === 1 ? body[0] : ['begin', ...body], env };
            }
            case 'if': {
                const [cond, thenExpr, elseExpr] = rest;
                expr = evaluate(cond, env) ? thenExpr : (elseExpr !== undefined ? elseExpr : null);
                continue; // TCO
            }
            case 'cond': {
                for (const clause of rest) {
                    const [test, ...body] = clause;
                    if (test === 'else' || evaluate(test, env)) {
                        for (let i = 0; i < body.length - 1; i++) evaluate(body[i], env);
                        expr = body[body.length - 1];
                        break;
                    }
                }
                if (expr === ['cond', ...rest]) return null;
                continue; // TCO
            }
            case 'let': {
                const [bindings, ...body] = rest;
                const params = bindings.map(b => b[0]);
                const args = bindings.map(b => evaluate(b[1], env));
                env = new Env(params, args, env);
                for (let i = 0; i < body.length - 1; i++) evaluate(body[i], env);
                expr = body[body.length - 1];
                continue; // TCO
            }
            case 'let*': {
                const [bindings, ...body] = rest;
                let localEnv = new Env([], [], env);
                for (const [name, valExpr] of bindings) {
                    localEnv.set(name, evaluate(valExpr, localEnv));
                }
                env = localEnv;
                for (let i = 0; i < body.length - 1; i++) evaluate(body[i], env);
                expr = body[body.length - 1];
                continue; // TCO
            }
            case 'letrec': {
                const [bindings, ...body] = rest;
                const localEnv = new Env([], [], env);
                for (const [name] of bindings) localEnv.set(name, null);
                for (const [name, valExpr] of bindings) localEnv.set(name, evaluate(valExpr, localEnv));
                env = localEnv;
                for (let i = 0; i < body.length - 1; i++) evaluate(body[i], env);
                expr = body[body.length - 1];
                continue; // TCO
            }
            case 'begin': {
                for (let i = 0; i < rest.length - 1; i++) evaluate(rest[i], env);
                expr = rest[rest.length - 1];
                continue; // TCO
            }
            case 'and': {
                if (rest.length === 0) return true;
                for (let i = 0; i < rest.length - 1; i++) {
                    if (!evaluate(rest[i], env)) return false;
                }
                expr = rest[rest.length - 1];
                continue; // TCO
            }
            case 'or': {
                if (rest.length === 0) return false;
                for (let i = 0; i < rest.length - 1; i++) {
                    const val = evaluate(rest[i], env);
                    if (val) return val;
                }
                expr = rest[rest.length - 1];
                continue; // TCO
            }
            case 'when': {
                if (evaluate(rest[0], env)) {
                    for (let i = 1; i < rest.length - 1; i++) evaluate(rest[i], env);
                    expr = rest[rest.length - 1];
                    continue;
                }
                return null;
            }
            case 'unless': {
                if (!evaluate(rest[0], env)) {
                    for (let i = 1; i < rest.length - 1; i++) evaluate(rest[i], env);
                    expr = rest[rest.length - 1];
                    continue;
                }
                return null;
            }
            case 'do': {
                const [bindings, testClause, ...body] = rest;
                const localEnv = new Env([], [], env);
                for (const [name, init] of bindings) localEnv.set(name, evaluate(init, localEnv));
                const [test, ...exitExprs] = testClause;
                while (!evaluate(test, localEnv)) {
                    for (const e of body) evaluate(e, localEnv);
                    for (const [name, , step] of bindings) {
                        if (step !== undefined) localEnv.set(name, evaluate(step, localEnv));
                    }
                }
                if (exitExprs.length === 0) return null;
                env = localEnv;
                for (let i = 0; i < exitExprs.length - 1; i++) evaluate(exitExprs[i], env);
                expr = exitExprs[exitExprs.length - 1];
                continue;
            }
            case 'case': {
                const [keyExpr, ...clauses] = rest;
                const key = evaluate(keyExpr, env);
                for (const clause of clauses) {
                    const [test, ...body] = clause;
                    if (test === 'else' || (Array.isArray(test) && test.includes(key))) {
                        for (let i = 0; i < body.length - 1; i++) evaluate(body[i], env);
                        expr = body[body.length - 1];
                        break;
                    }
                }
                continue;
            }
            case 'set!': {
                const [name, valueExpr] = rest;
                env.find(name).data[name] = evaluate(valueExpr, env);
                return null;
            }
            case 'quote': return rest[0];
            case 'quasiquote': return expandQuasiquote(rest[0], env);
            case 'unquote': return evaluate(rest[0], env);
        }

        // 
        const fn = evaluate(first, env);

        // 
        if (fn && fn.isMacro) {
            const macroEnv = new Env(fn.params, rest, fn.env);
            const expanded = evaluate(fn.body, macroEnv);
            expr = expanded;
            continue; // 
        }

        const args = rest.map(arg => evaluate(arg, env));

        if (typeof fn === 'function') return fn(...args);
        if (fn && fn.params !== undefined) {
            // TCO env expr
            env = new Env(fn.params, args.slice(0, fn.params.length), fn.env);
            if (fn.restParam) env.set(fn.restParam, args.slice(fn.params.length));
            expr = fn.body;
            continue;
        }
        throw new Error(`Not a function: ${JSON.stringify(first)}`);
    }
}

// Quasiquote 
function expandQuasiquote(expr, env) {
    if (!Array.isArray(expr)) return expr;
    if (expr.length > 0 && expr[0] === 'unquote') return evaluate(expr[1], env);
    const result = [];
    for (const item of expr) {
        if (Array.isArray(item) && item[0] === 'unquote-splicing') {
            const val = evaluate(item[1], env);
            if (Array.isArray(val)) result.push(...val);
            else result.push(val);
        } else {
            result.push(expandQuasiquote(item, env));
        }
    }
    return result;
}

// ============ 6. REPL &  ============
function run(code, env) {
    const expressions = [];
    const tokens = tokenize(code);
    while (tokens.length > 0) expressions.push(parse(tokens));
    let result;
    for (const expr of expressions) result = evaluate(expr, env);
    return result;
}

if (require.main === module && !process.argv.find(a => a.startsWith('--eval=')) && !process.argv.find(a => a.startsWith('--file=')) && !process.stdin.isTTY) {
    process.stdin.setEncoding('utf8');
    let inputData = '';
    process.stdin.on('data', (chunk) => { inputData += chunk; });
    process.stdin.on('end', () => {
        try {
            let data = inputData;
            if (data.charCodeAt(0) === 0xFEFF) data = data.slice(1);
            const request = JSON.parse(data);
            const env = createGlobalEnv();
            const result = run(request.parameters.code, env);
            process.stdout.write(JSON.stringify({ status: 'success', result }));
        } catch (err) {
            process.stdout.write(JSON.stringify({ status: 'error', error: err.message }));
        }
    });
} else if (require.main === module) {
    const env = createGlobalEnv();
    const evalArg = process.argv.find(a => a.startsWith('--eval='));
    if (evalArg) {
        const code = evalArg.split('=').slice(1).join('=');
        const result = run(code, env);
        if (result !== null && result !== undefined) console.log(result);
        process.exit(0);
    }
    const fileArg = process.argv.find(a => a.startsWith('--file='));
    if (fileArg) { console.log(" DEBUG: file mode path:,fileArg);
        const fs = require('fs');
        const filePath = fileArg.split('=')[1];
        let code = fs.readFileSync(filePath, 'utf8');
        if (code.charCodeAt(0) === 0xFEFF) code = code.slice(1);
        const result = run(code, env);
        if (result !== null && result !== undefined) console.log(result);
        process.exit(0);
    }
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log('NahidaLisp v0.2 - NahidaLisp Interpreter');
    console.log('Features: TCO, macros, quasiquote, rest params, hash tables');
    console.log('Type (exit) to quit\n');
    const prompt = () => {
        rl.question('> ', (line) => {
            if (line.trim() === '(exit)') { rl.close(); return; }
            try {
                const result = run(line, env);
                if (result !== null && result !== undefined) console.log('=>', result);
            } catch (e) { console.log('Error:', e.message); }
            prompt();
        });
    };
    prompt();
}

module.exports = { tokenize, parse, read, evaluate, run, createGlobalEnv, Env };