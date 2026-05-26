; Tic-Tac-Toe: two AI strategies play against each other
; Board is a list of 9 cells: 0=empty, 1=player1(X), 2=player2(O)

(define empty-board (list 0 0 0 0 0 0 0 0 0))

; Board access
(define (board-ref board pos) (nth board pos))
(define (board-set board pos val)
  (append (take pos board) (list val) (drop (+ pos 1) board)))

; Win detection
(define win-lines (list
  (list 0 1 2) (list 3 4 5) (list 6 7 8)
  (list 0 3 6) (list 1 4 7) (list 2 5 8)
  (list 0 4 8) (list 2 4 6)))

(define (check-win board player)
  (let ((check-line (lambda (line)
          (and (= (board-ref board (nth line 0)) player)
               (= (board-ref board (nth line 1)) player)
               (= (board-ref board (nth line 2)) player)))))
    (reduce (lambda (acc line) (or acc (check-line line))) false win-lines)))

; Get empty positions
(define (empty-positions board)
  (filter (lambda (i) (= (board-ref board i) 0)) (range 9)))

; Strategy 1: Random - pick a random empty cell
(define (strategy-random board player)
  (let ((moves (empty-positions board)))
    (nth moves (random (length moves)))))

; Strategy 2: Smart - win if can, block if must, else center, else random
(define (find-winning-move board player)
  (let ((moves (empty-positions board)))
    (reduce (lambda (acc pos)
              (if acc acc
                (if (check-win (board-set board pos player) player) pos false)))
            false moves)))

(define (strategy-smart board player)
  (let ((opponent (if (= player 1) 2 1)))
    (cond
      ; Win if possible
      ((find-winning-move board player) (find-winning-move board player))
      ; Block opponent win
      ((find-winning-move board opponent) (find-winning-move board opponent))
      ; Take center
      ((= (board-ref board 4) 0) 4)
      ; Take a corner
      ((not (null? (filter (lambda (i) (= (board-ref board i) 0)) (list 0 2 6 8))))
       (car (filter (lambda (i) (= (board-ref board i) 0)) (list 0 2 6 8))))
      ; Any empty
      (else (car (empty-positions board))))))

; Play one game, return winner (1, 2, or 0 for draw)
(define (play-game strategy1 strategy2)
  (letrec ((go (lambda (board turn)
                 (cond
                   ((check-win board 1) 1)
                   ((check-win board 2) 2)
                   ((null? (empty-positions board)) 0)
                   (else
                     (let* ((player (if (= (modulo turn 2) 0) 1 2))
                            (strategy (if (= player 1) strategy1 strategy2))
                            (move (strategy board player))
                            (new-board (board-set board move player)))
                       (go new-board (+ turn 1))))))))
    (go empty-board 0)))

; Run N games and count results
(define (run-tournament strategy1 strategy2 n)
  (letrec ((go (lambda (i wins1 wins2 draws)
                 (if (= i n)
                   (list wins1 wins2 draws)
                   (let ((result (play-game strategy1 strategy2)))
                     (cond
                       ((= result 1) (go (+ i 1) (+ wins1 1) wins2 draws))
                       ((= result 2) (go (+ i 1) wins1 (+ wins2 1) draws))
                       (else (go (+ i 1) wins1 wins2 (+ draws 1)))))))))
    (go 0 0 0 0)))

; Display a board
(define (display-board board)
  (define (cell->char v) (cond ((= v 1) "X") ((= v 2) "O") (else ".")))
  (print (string-append (cell->char (nth board 0)) " " (cell->char (nth board 1)) " " (cell->char (nth board 2))))
  (print (string-append (cell->char (nth board 3)) " " (cell->char (nth board 4)) " " (cell->char (nth board 5))))
  (print (string-append (cell->char (nth board 6)) " " (cell->char (nth board 7)) " " (cell->char (nth board 8))))
  (print ""))

; === Tournament ===
(print "=== Random vs Random (100 games) ===")
(let ((results (run-tournament strategy-random strategy-random 100)))
  (print (string-append "X wins: " (number->string (nth results 0))))
  (print (string-append "O wins: " (number->string (nth results 1))))
  (print (string-append "Draws:  " (number->string (nth results 2)))))

(print "")
(print "=== Smart vs Random (100 games) ===")
(let ((results (run-tournament strategy-smart strategy-random 100)))
  (print (string-append "X(smart) wins: " (number->string (nth results 0))))
  (print (string-append "O(random) wins: " (number->string (nth results 1))))
  (print (string-append "Draws:          " (number->string (nth results 2)))))

(print "")
(print "=== Random vs Smart (100 games) ===")
(let ((results (run-tournament strategy-random strategy-smart 100)))
  (print (string-append "X(random) wins: " (number->string (nth results 0))))
  (print (string-append "O(smart) wins:  " (number->string (nth results 1))))
  (print (string-append "Draws:          " (number->string (nth results 2)))))

(print "")
(print "=== Smart vs Smart (100 games) ===")
(let ((results (run-tournament strategy-smart strategy-smart 100)))
  (print (string-append "X(smart) wins: " (number->string (nth results 0))))
  (print (string-append "O(smart) wins: " (number->string (nth results 1))))
  (print (string-append "Draws:         " (number->string (nth results 2)))))

; Show one example game
(print "")
(print "=== Example: Smart vs Random ===")
(letrec ((show-game (lambda (board turn)
                      (cond
                        ((check-win board 1) (display-board board) (print "X wins!"))
                        ((check-win board 2) (display-board board) (print "O wins!"))
                        ((null? (empty-positions board)) (display-board board) (print "Draw!"))
                        (else
                          (let* ((player (if (= (modulo turn 2) 0) 1 2))
                                 (strategy (if (= player 1) strategy-smart strategy-random))
                                 (move (strategy board player))
                                 (new-board (board-set board move player)))
                            (display-board new-board)
                            (show-game new-board (+ turn 1))))))))
  (show-game empty-board 0))