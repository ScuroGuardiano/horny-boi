a, b = 2, 4
b, a = a, b
assert(a == 4)
assert(b == 2)

local a = a + 1
assert(a == 5)

local a, b = b, a
assert(a == 2)
assert(b == 5)