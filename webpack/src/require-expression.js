function load(path) {
  const module = require('./views/' + path) //          | /^\.\/.*$/
  // require('./views' + path)                          | /^\.\/views.*$/
  // require('./views/' + path + '/index.js')           | /^\.\/.*\/index\.js$/
  // require('./views/f' + path + '.js')                | /^\.\/f.*\.js$/
  // require('./views/f' + path + '.js' + arguments[1]) | /^\.\/f.*$/

  // require(`./views/${path}`)                         | /^\.\/.*$/
  // require(`./views/${path}.js`)                      | /^\.\/.*\.js$/
  // require(`./views/${path}.js${arguments[1]}`)       | /^\.\/.*\.js.*$/
  // require(`./views/${path}/foo/${arguments[1]}`)     | /^\.\/.*\/foo\/.*$/
  return module
}

const foo = load('foo')
const bar = load('bar')

console.log(foo.message)
console.log(bar.message)
