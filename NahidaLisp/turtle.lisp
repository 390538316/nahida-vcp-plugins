;; Turtle Graphics for L-System visualization
;; 避免嵌套let（解释器TCO作用域bug的workaround）

(define (turn-right dir) (% (+ dir 1) 4))
(define (turn-left dir) (% (+ dir 3) 4))

(define (dx dir) (cond ((= dir 1) 1) ((= dir 3) -1) (else 0)))
(define (dy dir) (cond ((= dir 0) -1) ((= dir 2) 1) (else 0)))

(define (turtle-interpret symbols)
  (turtle-walk symbols 0 0 0 (list) (list)))

;; 无嵌套let版本：所有计算内联到递归调用的参数里
(define (turtle-walk symbols x y dir points stack)
  (if (null? symbols)
      points
      (if (or (equal? (car symbols) "F")
              (equal? (car symbols) "A")
              (equal? (car symbols) "B"))
          (turtle-walk (cdr symbols)
                       (+ x (dx dir))
                       (+ y (dy dir))
                       dir
                       (append points (list (list (+ x (dx dir)) (+ y (dy dir)))))
                       stack)
          (if (equal? (car symbols) "+")
              (turtle-walk (cdr symbols) x y (turn-right dir) points stack)
              (if (equal? (car symbols) "-")
                  (turtle-walk (cdr symbols) x y (turn-left dir) points stack)
                  (if (equal? (car symbols) "[")
                      (turtle-walk (cdr symbols) x y dir points (cons (list x y dir) stack))
                      (if (equal? (car symbols) "]")
                          (turtle-walk (cdr symbols)
                                       (car (car stack))
                                       (cadr (car stack))
                                       (caddr (car stack))
                                       points
                                       (cdr stack))
                          (turtle-walk (cdr symbols) x y dir points stack))))))))

;; 渲染器
(define (points-contain? points x y)
  (cond
    ((null? points) #f)
    ((and (= (car (car points)) x) (= (cadr (car points)) y)) #t)
    (else (points-contain? (cdr points) x y))))

(define (render-row points y min-x max-x)
  (if (> min-x max-x)
      ""
      (string-append
        (if (points-contain? points min-x y) "*" " ")
        (render-row points y (+ min-x 1) max-x))))

(define (find-min-x points) (foldl (lambda (p acc) (min (car p) acc)) 9999 points))
(define (find-max-x points) (foldl (lambda (p acc) (max (car p) acc)) -9999 points))
(define (find-min-y points) (foldl (lambda (p acc) (min (cadr p) acc)) 9999 points))
(define (find-max-y points) (foldl (lambda (p acc) (max (cadr p) acc)) -9999 points))

(define (render points)
  (render-rows points
               (find-min-y points) (find-max-y points)
               (find-min-x points) (find-max-x points)))

(define (render-rows points y max-y min-x max-x)
  (if (> y max-y)
      ""
      (string-append
        (render-row points y min-x max-x)
        "\n"
        (render-rows points (+ y 1) max-y min-x max-x))))