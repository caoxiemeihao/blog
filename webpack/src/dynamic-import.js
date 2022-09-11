async function load(path) {
  const module = await import('./views/' + path)
  return module
}

; (async () => {
  const foo = await load('foo')
  const bar = await load('bar')

  console.log(foo.message)
  console.log(bar.message)
});
