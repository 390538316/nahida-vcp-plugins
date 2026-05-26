(define width 60)
(define height 20)
(define max-iter 20)

(define (mandelbrot cx cy)
  (letrec ((go (lambda (zr zi iter)
    (if (= iter max-iter) max-iter
      (if (> (+ (* zr zr) (* zi zi)) 4) iter
        (go (+ (- (* zr zr) (* zi zi)) cx)
            (+ (* 2 zr zi) cy)
            (+ iter 1)))))))
    (go 0 0 0)))

(define chars " .:-=+*#%@")

(define (iter->char n)
  (if (= n max-iter) " "
    (nth (string->list chars) (modulo n 10))))

(define (render-row y)
  (let ((cy (- (* (/ y height) 2.5) 1.25)))
    (reduce (lambda (s x)
      (let ((cx (- (* (/ x width) 3.5) 2.5)))
        (string-append s (iter->char (mandelbrot cx cy)))))
      "" (range width))))

(for-each (lambda (y) (print (render-row y))) (range height))