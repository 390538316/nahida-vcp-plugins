; NahidaLisp Standard Library
; Written in NahidaLisp itself - the language extending itself

; === List utilities ===
(define (cadr lst) (car (cdr lst)))
(define (caddr lst) (car (cdr (cdr lst))))
(define (caar lst) (car (car lst)))
(define (cadar lst) (car (cdr (car lst))))

(define (init lst)
  (if (null? (cdr lst)) (list)
    (cons (car lst) (init (cdr lst)))))

(define (tail lst) (last lst))

(define (repeat n x)
  (if (= n 0) (list)
    (cons x (repeat (- n 1) x))))

(define (iota n)
  (range n))

(define (enumerate lst)
  (zip (range (length lst)) lst))

; === Higher-order combinators ===
(define (curry f &rest args1)
  (lambda (&rest args2)
    (apply f (append args1 args2))))

(define (partial f &rest args1)
  (lambda (&rest args2)
    (apply f (append args1 args2))))

(define (flip f)
  (lambda (a b) (f b a)))

(define (complement f)
  (lambda (&rest args) (not (apply f args))))

(define (constantly x)
  (lambda (&rest args) x))

(define (juxt &rest fns)
  (lambda (&rest args)
    (map (lambda (f) (apply f args)) fns)))

; === Numeric utilities ===
(define (inc x) (+ x 1))
(define (dec x) (- x 1))
(define (square x) (* x x))
(define (cube x) (* x x x))
(define (sign x) (cond ((> x 0) 1) ((< x 0) -1) (else 0)))
(define (clamp x lo hi) (max lo (min hi x)))
(define (between? x lo hi) (and (>= x lo) (<= x hi)))

(define (sum lst) (reduce + 0 lst))
(define (product lst) (reduce * 1 lst))
(define (average lst) (/ (sum lst) (length lst)))

(define (factorial n)
  (if (<= n 1) 1 (* n (factorial (- n 1)))))

(define (fib n)
  (letrec ((go (lambda (a b count)
                 (if (= count 0) a
                   (go b (+ a b) (- count 1))))))
    (go 0 1 n)))

(define (gcd a b)
  (if (= b 0) a (gcd b (modulo a b))))

(define (lcm a b)
  (/ (* a b) (gcd a b)))

(define (prime? n)
  (if (<= n 1) false
    (if (<= n 3) true
      (if (= (modulo n 2) 0) false
        (letrec ((check (lambda (i)
                          (if (> (* i i) n) true
                            (if (= (modulo n i) 0) false
                              (check (+ i 2)))))))
          (check 3))))))

; === String utilities ===
(define (string-repeat n s)
  (if (= n 0) ""
    (string-append s (string-repeat (- n 1) s))))

(define (string-reverse s)
  (list->string (reverse (string->list s))))

(define (string-starts-with? s prefix)
  (equal? (substring s 0 (string-length prefix)) prefix))

(define (string-ends-with? s suffix)
  (let ((slen (string-length s))
        (plen (string-length suffix)))
    (equal? (substring s (- slen plen) slen) suffix)))

; === Functional patterns ===
(define (pipe &rest fns)
  (lambda (x)
    (reduce (lambda (acc f) (f acc)) x fns)))

(define (iterate f n x)
  (if (= n 0) x
    (iterate f (- n 1) (f x))))

(define (unfold pred f seed)
  (if (pred seed) (list)
    (cons seed (unfold pred f (f seed)))))

(define (take-while pred lst)
  (if (null? lst) (list)
    (if (pred (car lst))
      (cons (car lst) (take-while pred (cdr lst)))
      (list))))

(define (drop-while pred lst)
  (if (null? lst) (list)
    (if (pred (car lst))
      (drop-while pred (cdr lst))
      lst)))

(define (partition pred lst)
  (list (filter pred lst)
        (filter (complement pred) lst)))

(define (group-by f lst)
  (let ((h (make-hash)))
    (for-each (lambda (x)
                (let ((key (f x)))
                  (hash-set! h key (cons x (hash-ref h key (list))))))
              lst)
    h))

; === Association list operations ===
(define (alist-ref key alist default)
  (let ((pair (assoc key alist)))
    (if pair (cadr pair) default)))

(define (alist-set key value alist)
  (cons (list key value)
        (filter (lambda (pair) (not (equal? (car pair) key))) alist)))

; === Tree operations ===
(define (tree-map f tree)
  (if (list? tree)
    (map (lambda (node) (tree-map f node)) tree)
    (f tree)))

(define (tree-flatten tree)
  (if (list? tree)
    (reduce append (list) (map tree-flatten tree))
    (list tree)))

; === Symbolic differentiation (code as data!) ===
(define (deriv expr var)
  (cond
    ((number? expr) 0)
    ((symbol? expr) (if (equal? expr var) 1 0))
    ((equal? (car expr) '+)
     (list '+ (deriv (cadr expr) var) (deriv (caddr expr) var)))
    ((equal? (car expr) '-)
     (list '- (deriv (cadr expr) var) (deriv (caddr expr) var)))
    ((equal? (car expr) '*)
     (list '+ (list '* (cadr expr) (deriv (caddr expr) var))
              (list '* (deriv (cadr expr) var) (caddr expr))))
    ((equal? (car expr) '/)
     (list '/ (list '- (list '* (deriv (cadr expr) var) (caddr expr))
                       (list '* (cadr expr) (deriv (caddr expr) var)))
              (list '* (caddr expr) (caddr expr))))
    ((equal? (car expr) 'expt)
     (list '* (caddr expr)
              (list '* (list 'expt (cadr expr) (list '- (caddr expr) 1))
                       (deriv (cadr expr) var))))
    (else (error (string-append "Cannot differentiate: " (number->string expr))))))

(define (simplify expr)
  (if (not (list? expr)) expr
    (let ((op (car expr))
          (args (map simplify (cdr expr))))
      (cond
        ((and (equal? op '+) (equal? (car args) 0)) (cadr args))
        ((and (equal? op '+) (equal? (cadr args) 0)) (car args))
        ((and (equal? op '*) (equal? (car args) 0)) 0)
        ((and (equal? op '*) (equal? (cadr args) 0)) 0)
        ((and (equal? op '*) (equal? (car args) 1)) (cadr args))
        ((and (equal? op '*) (equal? (cadr args) 1)) (car args))
        ((and (equal? op '-) (equal? (cadr args) 0)) (car args))
        ((and (equal? op '/) (equal? (cadr args) 1)) (car args))
        ((and (equal? op 'expt) (equal? (cadr args) 1)) (car args))
        ((and (equal? op 'expt) (equal? (cadr args) 0)) 1)
        (else (cons op args))))))

(define (d/dx expr) (simplify (deriv expr 'x))); --- Pattern Matching (predicate-based) ---
; Usage: (match expr (pred? => handler) ... (else => handler))
(define-macro (match val . clauses)
  `(let ((__match_v ,val))
     (cond ,@(map (lambda (clause)
                    (let ((pred (car clause))
                          (fn (car (cdr (cdr clause)))))
                      (if (eq? pred (quote else))
                          `(#t (,fn __match_v))
                          `((,pred __match_v) (,fn __match_v)))))
                  clauses)))); --- Destructuring & Pattern Matching ---

; Helper: generate let-bindings from a pattern
(define (make-bindings pattern acc)
  (cond
    ((null? pattern) (list))
    ((atom? pattern) (list (list pattern acc)))
    (else (append
            (make-bindings (car pattern) (list (quote car) acc))
            (make-bindings (cdr pattern) (list (quote cdr) acc))))))

; Helper: check if value matches pattern shape
(define (pattern-matches? pattern val)
  (cond
    ((null? pattern) (null? val))
    ((atom? pattern) #t)
    ((not (list? val)) #f)
    (else (if (pattern-matches? (car pattern) (car val))
              (pattern-matches? (cdr pattern) (cdr val))
              #f))))

; Single-pattern destructuring bind
; Usage: (destructure (x y z) expr body...)
(define-macro (destructure pat expr . body)
  (let ((bindings (make-bindings pat (quote __dv))))
    `(let ((__dv ,expr))
       (let ,bindings ,@body))))

; Multi-branch pattern match
; Usage: (match-let expr (pattern body...) ...)
(define-macro (match-let expr . clauses)
  `(let ((__mv ,expr))
     ,(foldr
        (lambda (clause acc)
          (let ((pat (car clause))
                (body (cdr clause)))
            `(if (pattern-matches? (quote ,pat) __mv)
                 (let ,(make-bindings pat (quote __mv)) ,@body)
                 ,acc)))
        (quote (error "no pattern matched"))
        clauses)))