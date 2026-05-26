(print "=== Arithmetic ===")
(print (+ 1 2 3 4 5))
(print (* 2 3 4))
(print (- 10 3 2))

(print "=== HOF ===")
(print (map (lambda (x) (* x x)) (list 1 2 3 4 5)))
(print (filter even? (range 10)))
(print (reduce + 0 (range 1 11)))
(print (sort < (list 5 3 8 1 9 2)))

(print "=== Strings ===")
(print (string-upcase "hello world"))
(print (string-append "Nahida" " " "Lisp"))
(print (string-length "NahidaLisp"))

(print "=== Quicksort ===")
(define (quicksort lst)
  (if (null? lst) (list)
    (let* ((pivot (car lst))
           (rest (cdr lst))
           (less (filter (lambda (x) (< x pivot)) rest))
           (greater (filter (lambda (x) (>= x pivot)) rest)))
      (append (quicksort less) (list pivot) (quicksort greater)))))
(print (quicksort (list 8 3 7 1 5 9 2 6 4)))

(print "=== Variadic ===")
(define (sum &rest nums) (reduce + 0 nums))
(print (sum 1 2 3 4 5))

(print "=== let* ===")
(print (let* ((x 3) (y (* x x)) (z (+ x y))) z))

(print "=== TCO ===")
(define (loop-sum n acc)
  (if (= n 0) acc
    (loop-sum (- n 1) (+ acc n))))
(print (loop-sum 100000 0))

(print "=== Control ===")
(when (> 5 3) (print "when works"))
(unless (> 3 5) (print "unless works"))
(print (and 1 2 3))
(print (or false false 42))

(print "=== Hash ===")
(define h (make-hash))
(hash-set! h "name" "Nahida")
(hash-set! h "age" 500)
(print (hash-ref h "name"))
(print (hash-keys h))

(print "=== Compose ===")
(define inc-double (compose (lambda (x) (* x 2)) (lambda (x) (+ x 1))))
(print (inc-double 5))

(print "=== ALL TESTS PASSED ===")