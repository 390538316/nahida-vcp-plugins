; Test mandelbrot components
(print (/ 1 3))
(print (mandelbrot -2.0 0.0))
(print (mandelbrot 0.0 0.0))
(print (mandelbrot 0.5 0.0))

(define (mandelbrot cx cy)
  (letrec ((go (lambda (zr zi iter)
    (if (= iter 20) 20
      (if (> (+ (* zr zr) (* zi zi)) 4) iter
        (go (+ (- (* zr zr) (* zi zi)) cx)
            (+ (* 2 zr zi) cy)
            (+ iter 1)))))))
    (go 0 0 0)))

(print (mandelbrot -2.0 0.0))
(print (mandelbrot 0.0 0.0))
(print (mandelbrot 0.5 0.0))
(print (mandelbrot 1.0 0.0))