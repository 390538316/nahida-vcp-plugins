; Connect 4: Minimax with Alpha-Beta pruning (fixed)
; Board: 6 rows x 7 columns, list of 42 cells (row-major)
; 0=empty, 1=player1(X), 2=player2(O)

(define (cadr lst) (car (cdr lst)))
(define (caddr lst) (car (cdr (cdr lst))))
(define (repeat n x) (if (= n 0) (list) (cons x (repeat (- n 1) x))))

(define rows 6)
(define cols 7)
(define board-size 42)
(define empty-board (repeat board-size 0))

; Board access
(define (rc->idx r c) (+ (* r cols) c))
(define (board-ref board r c) (nth board (rc->idx r c)))

; Drop piece in column, return new board or false if full
(define (drop-piece board col player)
  (letrec ((find-row (lambda (r)
             (cond
               ((< r 0) false)
               ((= (board-ref board r col) 0)
                (let ((idx (rc->idx r col)))
                  (append (take idx board) (list player) (drop (+ idx 1) board))))
               (else (find-row (- r 1)))))))
    (find-row (- rows 1))))

; Valid moves (columns not full)
(define (valid-moves board)
  (filter (lambda (c) (= (board-ref board 0 c) 0)) (range cols)))

; Check 4 in a row for player
(define (check-four board player)
  (letrec (
    (check-line (lambda (r c dr dc)
      (and (= (board-ref board r c) player)
           (= (board-ref board (+ r dr) (+ c dc)) player)
           (= (board-ref board (+ r (* 2 dr)) (+ c (* 2 dc))) player)
           (= (board-ref board (+ r (* 3 dr)) (+ c (* 3 dc))) player))))
    (check-all (lambda (positions)
      (if (null? positions) false
        (if (car positions) true
          (check-all (cdr positions)))))))
    (check-all
      (append
        ; Horizontal
        (map (lambda (r) (map (lambda (c) (check-line r c 0 1)) (range 4))) (range rows))
        ; Vertical
        (map (lambda (r) (map (lambda (c) (check-line r c 1 0)) (range cols))) (range 3))
        ; Diagonal down-right
        (map (lambda (r) (map (lambda (c) (check-line r c 1 1)) (range 4))) (range 3))
        ; Diagonal down-left
        (map (lambda (r) (map (lambda (c) (check-line r c 1 -1)) (range 3 7))) (range 3))))))

; Simple evaluation: count pieces in center column + basic threats
(define (score-position board player)
  (let ((opponent (if (= player 1) 2 1))
        (center-score (* 3 (length (filter (lambda (r) (= (board-ref board r 3) player)) (range rows))))))
    center-score))

; Minimax with alpha-beta (iterative deepening friendly)
; Returns score from perspective of 'player'
(define (minimax board depth is-max player opponent alpha beta)
  (cond
    ((check-four board opponent) -10000)
    ((check-four board player) 10000)
    ((null? (valid-moves board)) 0)
    ((= depth 0) (- (score-position board player) (score-position board opponent)))
    (is-max
      (letrec ((search (lambda (moves best a)
        (if (null? moves) best
          (let* ((col (car moves))
                 (new-board (drop-piece board col player))
                 (score (if new-board
                           (minimax new-board (- depth 1) false player opponent a beta)
                           -99999))
                 (new-best (max best score))
                 (new-a (max a new-best)))
            (if (>= new-a beta) new-best
              (search (cdr moves) new-best new-a)))))))
        (search (valid-moves board) -99999 alpha)))
    (else
      (letrec ((search (lambda (moves best b)
        (if (null? moves) best
          (let* ((col (car moves))
                 (new-board (drop-piece board col opponent))
                 (score (if new-board
                           (minimax new-board (- depth 1) true player opponent alpha b)
                           99999))
                 (new-best (min best score))
                 (new-b (min b new-best)))
            (if (<= new-b alpha) new-best
              (search (cdr moves) new-best new-b)))))))
        (search (valid-moves board) 99999 beta)))))

; Pick best move for player at given depth
(define (ai-move board player depth)
  (let ((opponent (if (= player 1) 2 1))
        (moves (valid-moves board)))
    (letrec ((search (lambda (moves best-col best-score)
      (if (null? moves) best-col
        (let* ((col (car moves))
               (new-board (drop-piece board col player))
               (score (if new-board
                         (minimax new-board (- depth 1) false player opponent -99999 99999)
                         -99999)))
          (if (> score best-score)
            (search (cdr moves) col score)
            (search (cdr moves) best-col best-score)))))))
      (search moves (car moves) -99999))))

; Display board
(define (display-board board)
  (print "0 1 2 3 4 5 6")
  (print "-------------")
  (for-each (lambda (r)
    (print (reduce (lambda (s c)
      (string-append s (cond ((= (board-ref board r c) 1) "X ")
                             ((= (board-ref board r c) 2) "O ")
                             (else ". ")))) "" (range cols))))
    (range rows))
  (print ""))

; Play one game
(define (play-game depth1 depth2 verbose)
  (letrec ((go (lambda (board turn)
    (cond
      ((check-four board 1) (when verbose (display-board board) (print "X wins!")) 1)
      ((check-four board 2) (when verbose (display-board board) (print "O wins!")) 2)
      ((null? (valid-moves board)) (when verbose (display-board board) (print "Draw!")) 0)
      (else
        (let* ((player (if (= (modulo turn 2) 0) 1 2))
               (depth (if (= player 1) depth1 depth2))
               (col (ai-move board player depth))
               (new-board (drop-piece board col player)))
          (when (and verbose (check-four new-board player)) (display-board new-board))
          (go new-board (+ turn 1))))))))
    (go empty-board 0)))

; Tournament: 3 games (minimax is slow in interpreted Lisp)
(print "=== Connect 4: Depth-3(X) vs Depth-1(O) - 3 games ===")
(letrec ((go (lambda (i w1 w2 d)
  (if (= i 3)
    (begin
      (print (string-append "Depth-3 wins: " (number->string w1)))
      (print (string-append "Depth-1 wins: " (number->string w2)))
      (print (string-append "Draws: " (number->string d))))
    (let ((result (play-game 3 1 false)))
      (print (string-append "Game " (number->string (+ i 1)) ": " (cond ((= result 1) "X") ((= result 2) "O") (else "Draw"))))
      (cond
        ((= result 1) (go (+ i 1) (+ w1 1) w2 d))
        ((= result 2) (go (+ i 1) w1 (+ w2 1) d))
        (else (go (+ i 1) w1 w2 (+ d 1)))))))))
  (go 0 0 0 0))

; Show one example game with board
(print "")
(print "=== Example: Depth-3(X) vs Depth-1(O) ===")
(play-game 3 1 true)