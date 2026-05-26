(define size 16)

(define (bit-and a b)
  (letrec ((go (lambda (a b bit result)
    (if (and (= a 0) (= b 0)) result
      (let ((a-bit (modulo a 2))
            (b-bit (modulo b 2)))
        (go (floor (/ a 2)) (floor (/ b 2)) (* bit 2)
            (+ result (* bit (* a-bit b-bit)))))))))
    (go a b 1 0)))

(define (spaces n) (if (<= n 0) "" (string-append " " (spaces (- n 1)))))

(define (sierpinski-row y)
  (reduce (lambda (s x)
    (string-append s (if (= (bit-and x y) 0) "* " "  ")))
    "" (range size)))

(for-each (lambda (y)
  (print (string-append (spaces (- size y 1)) (sierpinski-row y))))
  (range size))