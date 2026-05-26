(define (cadr lst) (car (cdr lst)))
(define (caddr lst) (car (cdr (cdr lst))))

(define (deriv expr var)
  (cond
    ((number? expr) 0)
    ((symbol? expr) (if (equal? expr var) 1 0))
    ((equal? (car expr) '+)
     (list '+ (deriv (cadr expr) var) (deriv (caddr expr) var)))
    ((equal? (car expr) '*)
     (list '+ (list '* (cadr expr) (deriv (caddr expr) var))
              (list '* (deriv (cadr expr) var) (caddr expr))))
    (else 0)))

(print (deriv '(+ x 1) 'x))
(print (deriv '(* x x) 'x))