(print (reduce (lambda (s x) (string-append s (number->string x))) "" (list 1 2 3)))
(print (reduce string-append "" (list "a" "b" "c")))