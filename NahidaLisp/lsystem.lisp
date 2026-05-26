;; L-System in NahidaLisp

;; 核心：字符替换引擎
(define (apply-rule rules ch)
  (cond
    ((null? rules) (list ch))
    ((equal? (car (car rules)) ch) (cadr (car rules)))
    (else (apply-rule (cdr rules) ch))))

;; 对整个字符串应用一代规则
(define (lsystem-step rules str)
  (if (null? str)
      (list)
      (append (apply-rule rules (car str))
              (lsystem-step rules (cdr str)))))

;; 迭代N代
(define (lsystem-iterate rules axiom n)
  (if (= n 0)
      axiom
      (lsystem-iterate rules (lsystem-step rules axiom) (- n 1))))

;; === 经典分形 ===
(define plant-rules
  (list (list "F" (list "F" "[" "+" "F" "]" "F" "[" "-" "F" "]" "F"))))
(define plant-axiom (list "F"))

(define koch-rules
  (list (list "F" (list "F" "+" "F" "-" "-" "F" "+" "F"))))
(define koch-axiom (list "F" "-" "-" "F" "-" "-" "F"))

(define sierpinski-rules
  (list
    (list "A" (list "B" "-" "A" "-" "B"))
    (list "B" (list "A" "+" "B" "+" "A"))))
(define sierpinski-axiom (list "A"))

(define dragon-rules
  (list
    (list "X" (list "X" "+" "Y" "F" "+"))
    (list "Y" (list "-" "F" "X" "-" "Y"))))
(define dragon-axiom (list "F" "X"))

;; === 随机 L-System ===
(define *seed* 42)
(define (set-seed! s) (set! *seed* s))
(define (lsys-random)
  (set! *seed* (% (+ (* *seed* 1103515245) 12345) 2147483648))
  (/ *seed* 2147483648.0))

(define (choose-rule prob-rules)
  (choose-rule-helper prob-rules (lsys-random) 0))

(define (choose-rule-helper rules r cumulative)
  (if (null? rules)
      (list)
      (let ((prob (car (car rules)))
            (replacement (cadr (car rules))))
        (if (<= r (+ cumulative prob))
            replacement
            (choose-rule-helper (cdr rules) r (+ cumulative prob))))))

(define (apply-stochastic-rule rules ch)
  (cond
    ((null? rules) (list ch))
    ((equal? (car (car rules)) ch)
     (choose-rule (cadr (car rules))))
    (else (apply-stochastic-rule (cdr rules) ch))))

(define (stochastic-step rules str)
  (if (null? str)
      (list)
      (append (apply-stochastic-rule rules (car str))
              (stochastic-step rules (cdr str)))))

(define (stochastic-iterate rules axiom n)
  (if (= n 0)
      axiom
      (stochastic-iterate rules (stochastic-step rules axiom) (- n 1))))

(define stochastic-plant-rules
  (list
    (list "F" (list
      (list 0.6 (list "F" "[" "+" "F" "]" "F" "[" "-" "F" "]" "F"))
      (list 0.4 (list "F" "[" "+" "F" "]" "[" "-" "F" "]"))))))