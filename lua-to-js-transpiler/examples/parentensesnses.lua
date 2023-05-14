function parentheseses(a, b, c)
    return a * (b + c)
end

function noParentheses(a, b, c)
    return a + b * c
end

function moreParentheseses(a, b, c, d)
    return ((a + b) * c) * d
end

print(parentheseses(2, 2, 2))