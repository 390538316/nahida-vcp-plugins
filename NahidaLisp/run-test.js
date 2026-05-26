const fs = require('fs');
const m = require('./lisp.js');

let std = fs.readFileSync('stdlib.lisp', 'utf8');
if (std.charCodeAt(0) === 0xFEFF) std = std.slice(1);

const env = m.createGlobalEnv();

// Load stdlib - run the whole file, errors in deriv will just mean those funcs are undefined
try { m.run(std, env); console.log('Stdlib loaded fully'); }
catch(e) { console.log('Stdlib partial load, error:', e.message); }

const tests = [
    ['(cadr (list 1 2 3))', 2],
    ['(caddr (list 1 2 3))', 3],
    ['(init (list 1 2 3 4 5))', [1,2,3,4]],
    ['(repeat 3 7)', [7,7,7]],
    ['(factorial 10)', 3628800],
    ['(fib 10)', 55],
    ['(gcd 48 18)', 6],
    ['(lcm 12 8)', 24],
    ['(prime? 17)', true],
    ['(prime? 15)', false],
    ['(sum (list 1 2 3 4 5))', 15],
    ['(product (list 1 2 3 4 5))', 120],
    ['(average (list 2 4 6 8 10))', 6],
    ['(inc 5)', 6],
    ['(square 7)', 49],
    ['(string-reverse "hello")', 'olleh'],
    ['(string-repeat 3 "ab")', 'ababab'],
    ['(take-while (lambda (x) (< x 5)) (list 1 2 3 4 5 6))', [1,2,3,4]],
    ['(drop-while (lambda (x) (< x 5)) (list 1 2 3 4 5 6))', [5,6]],
    ['(iterate inc 5 0)', 5],
    ['((pipe inc inc square) 3)', 25],
    ['((curry + 5) 3)', 8],
    ['((flip -) 3 10)', 7],
    ['((complement even?) 5)', true],
];

let passed = 0;
let failures = [];
for (const [code, expected] of tests) {
    try {
        const result = m.run(code, env);
        if (JSON.stringify(result) === JSON.stringify(expected)) passed++;
        else failures.push(code + ' => ' + JSON.stringify(result) + ' (want ' + JSON.stringify(expected) + ')');
    } catch(e) { failures.push(code + ' => ERROR: ' + e.message); }
}

console.log(passed + '/' + tests.length + ' passed');
if (failures.length > 0) { console.log('Failures:'); failures.forEach(f => console.log('  ' + f)); }