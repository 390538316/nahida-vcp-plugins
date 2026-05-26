(load "stdlib.lisp")
(load "lsystem.lisp")
(load "turtle.lisp")

(display "=== Koch Gen 2 ===") (newline)
(define k2 (lsystem-iterate koch-rules koch-axiom 2))
(display (render (turtle-interpret k2))) (newline)

(display "=== Plant Gen 3 ===") (newline)
(define p3 (lsystem-iterate plant-rules plant-axiom 3))
(display "Symbols: ") (display (length p3)) (newline)
(display (render (turtle-interpret p3))) (newline)

(display "=== Stochastic Seed 42 Gen 3 ===") (newline)
(set-seed! 42)
(define sp (stochastic-iterate stochastic-plant-rules plant-axiom 3))
(display "Symbols: ") (display (length sp)) (newline)
(display (render (turtle-interpret sp)))