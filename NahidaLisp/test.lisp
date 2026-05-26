; === NahidaLisp v0.2 Test Suite ===

; 1. Quicksort
(define (quicksort lst)
  (if (null? lst) (list)
    (let* ((pivot (car lst))
           (rest (cdr lst))
           (less (filter (lambda (x) (< x pivot)) rest))
           (greater (filter (lambda (x) (>= x pivot)) rest)))
      (append (quicksort less) (list pivot) (quicksort greater)))))

(print "=== Quicksort ===")
(print (quicksort (list 8 3 7 1 5 9 2 6 4)))

; 2. Variadic args
(define (sum &rest nums) (reduce + 0 nums))
(print "=== Variadic ===")
(print (sum 1 2 3 4 5))

; 3. Strings
(print "=== Strings ===")
(print (string-upcase "hello world"))
(print (string-append "Nahida" " " "Lisp"))
(print (string-length "NahidaLisp"))

; 4. Higher-order functions
(print "=== HOF ===")
(print (map (lambda (x) (* x x)) (list 1 2 3 4 5)))
(print (filter even? (range 10)))
(print (reduce + 0 (range 1 11)))
(print (sort < (list 5 3 8 1 9 2)))

; 5. let*/letrec
(print "=== let*/letrec ===")
(print (let* ((x 3) (y (* x x)) (z (+ x y))) z))
(letrec ((my-even? (lambda (n) (if (= n 0) true (my-odd? (- n 1)))))
         (my-odd? (lambda (n) (if (= n 0) false (my-even? (- n 1))))))
  (print (my-even? 10))
  (print (my-odd? 7)))

; 6. Hash tables
(print "=== Hash ===")
(define h (make-hash))
(hash-set! h "name" "Nahida")
(hash-set! h "age" 500)
(print (hash-ref h "name"))
(print (hash-keys h))

; 7. when/unless
(print "=== Control ===")
(when (> 5 3) (print "when: 5 > 3"))
(unless (> 3 5) (print "unless: 3 not > 5"))

; 8. Quasiquote
(print "=== Quasiquote ===")
(define x 42)
(print `(the answer is ,x))
(define nums (list 1 2 3))
(print `(numbers are ,@nums done))

; 9. Do loop
(print "=== Do loop ===")
(print (do ((i 0 (+ i 1))
            (sum 0 (+ sum i)))
           ((= i 10) sum)))

; 10. TCO
(print "=== TCO ===")
(define (loop-sum n acc)
  (if (= n 0) acc
    (loop-sum (- n 1) (+ acc n))))
(print (loop-sum 100000 0))

; 11. Compose
(print "=== Compose ===")
(define inc (lambda (x) (+ x 1)))
(define double (lambda (x) (* x 2)))
(define inc-then-double (compose double inc))
(print (inc-then-double 5))

; 12. Macros
(print "=== Macros ===")
(define-macro (unless2 cond body)
  `(if ,cond null ,body))
(print (unless2 false "macro works!"))

(print "=== ALL TESTS PASSED ===")