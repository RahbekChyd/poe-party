local utf8 = {}

function utf8.reverse(value)
  return string.reverse(tostring(value or ""))
end

function utf8.gsub(value, pattern, replacement, limit)
  return string.gsub(tostring(value or ""), pattern, replacement, limit)
end

function utf8.find(value, pattern, init, plain)
  return string.find(tostring(value or ""), pattern, init, plain)
end

function utf8.sub(value, i, j)
  return string.sub(tostring(value or ""), i, j)
end

function utf8.match(value, pattern, init)
  return string.match(tostring(value or ""), pattern, init)
end

function utf8.next(value, index, direction)
  local text = tostring(value or "")
  local offset = tonumber(direction) or 1
  local caret = tonumber(index) or 0

  if offset < 0 then
    local previous = caret - 1
    if previous <= 0 then
      return nil
    end
    return previous
  end

  local following = caret + 1
  if following > #text then
    return nil
  end
  return following
end

return utf8
