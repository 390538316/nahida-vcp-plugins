; Self-contained pattern matching

(define (atom? x) (not (list? x)))

(define (make-bindings pattern acc)
  (cond
    ((null? pattern) (list))
    ((atom? pattern) (list (list pattern acc)))
    (else (append
            (make-bindings (car pattern) (list (quote car) acc))
            (make-bindings (cdr pattern) (list (quote cdr) acc))))))

(define (pattern-matches? pattern val)
  (cond
    ((null? pattern) (null? val))
    ((atom? pattern) #t)
    ((not (list? val)) #f)
    (else (if (pattern-matches? (car pattern) (car val))
              (pattern-matches? (cdr pattern) (cdr val))
              #f))))

; Runtime match dispatcher
(define (match-dispatch val clauses)
  (cond
    ((null? clauses) "no match")
    ((pattern-matches? (car (car clauses)) val)
     (let ((pat (car (car clauses)))
           (body (cdr (car clauses))))
       ; Can't eval arbitrary body without eval, so just return the pattern that matched
       pat))
    (else (match-dispatch val (cdr clauses)))))

; === Basic tests ===
(display "atom? 42: ") (display (atom? 42)) (newline)
(display "atom? (1): ") (display (atom? (list 1))) (newline)

(display "bindings (x y): ")
(display (make-bindings (quote (x y)) (quote v)))
(newline)

(display "matches (a b) vs (1 2): ")
(display (pattern-matches? (quote (a b)) (list 1 2)))
(newline)

(display "matches (a b) vs (1 2 3): ")
(display (pattern-matches? (quote (a b)) (list 1 2 3)))
(newline)

(display "matches (a . r) vs (1 2 3): ")
(display (pattern-matches? (quote (a . r)) (list 1 2 3)))
(newline)

(display "matches x vs 42: ")
(display (pattern-matches? (quote x) 42))
(newline)

; Test dispatch
(display "dispatch (1 2 3) against ((a b) (a b c)): ")
(display (match-dispatch (list 1 2 3) (quote (((a b) "two") ((a b c) "three")))))
(newline)

; Now test destructure as a macro (single pattern, no foldr needed)
(define-macro (destructure pat expr . body)
  (let ((bindings (make-bindings pat (quote __dv))))
    `(let ((__dv ,expr))
       (let ,bindings ,@body))))

(display "destructure (x y z) from (1 2 3): ")
(display (destructure (x y z) (list 1 2 3) (+ x y z)))
(newline)

(display "destructure (a . rest) from (10 20 30): ")
(display (destructure (a . rest) (list 10 20 30) rest))
(newline)