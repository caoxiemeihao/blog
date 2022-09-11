function load(path) {
  const module = require('./views/' + path)
  return module
}

const foo = load('foo')
const bar = load('bar')

console.log(foo.message)
console.log(bar.message)
