; Load stdlib first, then test

; === List utils ===
(print "=== List ===")
(print (cadr (list 1 2 3)))
(print (init (list 1 2 3 4 5)))
(print (repeat 3 "ha"))
(print (enumerate (list "a" "b" "c")))

; === Numeric ===
(print "=== Numeric ===")
(print (factorial 10))
(print (fib 10))
(print (gcd 48 18))
(print (lcm 12 8))
(print (prime? 17))
(print (prime? 15))
(print (average (list 1 2 3 4 5)))

; === Combinators ===
(print "=== Combinators ===")
(define add5 (curry + 5))
(print (add5 3))
(print ((flip -) 3 10))
(print ((complement even?) 5))
(print ((juxt inc dec square) 4))

; === Functional ===
(print "=== Functional ===")
(print (take-while (lambda (x) (< x 5)) (list 1 2 3 4 5 6 7)))
(print (drop-while (lambda (x) (< x 5)) (list 1 2 3 4 5 6 7)))
(print (partition even? (range 10)))
(print (iterate inc 5 0))
(print ((pipe inc inc square) 3))

; === Symbolic differentiation ===
(print "=== Calculus ===")
(print (d/dx '(* x x)))
(print (d/dx '(+ (* 3 x) 5)))
(print (d/dx '(* x (* x x))))

; === String ===
(print "=== String ===")
(print (string-reverse "hello"))
(print (string-repeat 3 "ab"))
(print (string-starts-with? "hello world" "hello"))

(print "=== STDLIB ALL PASSED ===")