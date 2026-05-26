; Elementary Cellular Automaton
; NahidaLisp implementation

; Query rule: bit at position idx (0-7) of rule-num
(define (rule-bit rule-num idx)
  (modulo (floor (/ rule-num (expt 2 idx))) 2))

; Get neighborhood value (left-center-right -> 0-7 index)
(define (neighborhood cells i width)
  (let ((left  (nth cells (modulo (- i 1) width)))
        (mid   (nth cells i))
        (right (nth cells (modulo (+ i 1) width))))
    (+ (* left 4) (* mid 2) right)))

; One step: apply rule to each cell
(define (step cells rule-num width)
  (map (lambda (i)
         (rule-bit rule-num (neighborhood cells i width)))
       (range 0 width)))

; Render row as string
(define (row->string cells)
  (list->string (map (lambda (c) (if (= c 1) "#" " ")) cells)))

; Run and print spacetime diagram
(define (run-automaton rule-num width generations)
  (let ((cells (map (lambda (i)
                      (if (= i (floor (/ width 2))) 1 0))
                    (range 0 width))))
    (display (format "Rule ~a | Width ~a | Gen ~a" rule-num width generations))
    (newline)
    (do ((gen 0 (+ gen 1))
         (state cells (step state rule-num width)))
        ((= gen generations) (void))
      (display (row->string state))
      (newline))))

(run-automaton 30 61 30)
(newline)
(run-automaton 110 61 30)
(newline)
(run-automaton 90 61 30)