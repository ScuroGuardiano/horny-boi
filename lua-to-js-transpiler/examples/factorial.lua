function factorial(n)
    if (n == 0 or n == 1) then
        return 1
    elseif (n == 2) then
        return 2
    else
        return n * factorial(n - 1)
    end
end

print(factorial(5))
