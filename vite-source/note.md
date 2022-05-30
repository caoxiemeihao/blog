## 学习 Vite 源码 - 乱记 :)

---

2022-05-30

#### resolveId 流程

1. 文件 `src/node/server/index.ts`
  `middlewares.use(transformMiddleware(server))`

3. 文件 `src/node/server/middlewares/transform.ts`
  `await transformRequest(url, server,`

4. 文件 `src/node/server/transformRequest.ts`
  `doTransform()`
  `await pluginContainer.resolveId(url, undefined, { ssr })` -> `await pluginContainer.load(id, { ssr })` -> ` await pluginContainer.transform(code, id`


#### import 路径处理

```js
🔨🔨🔨🔨🔨🔨🔨🔨🔨🔨🔨🔨🔨
import { jsx1 } from "./components/jsx";
console.log(jsx1);
🔨🔨🔨🔨🔨🔨🔨🔨🔨🔨🔨🔨🔨

// 中间会经过 src/node/plugins/importAnalysis.ts -> await normalizeUrl(specifier, start) 处理
// 将相对路径变成绝对路径

🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯
import { jsx1 } from "/src/components/jsx.js";
console.log(jsx1);
🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯
```

#### 小记

- Vite 的 `src/node/plugins/resolve.ts` 并不加载文件，也就是说默认的 plugins 并不会 load 文件。  
  其次文件会被 [code = await fs.readFile(file, 'utf-8')](https://github.com/vitejs/vite/blob/3d14372c8fa1acb426923c439e545211fc9d7ccd/packages/vite/src/node/server/transformRequest.ts#L166) 加载。  

- `resolveId()` 中不要乱改 id，不然要出问题 [if (e.code !== 'ENOENT')](https://github.com/vitejs/vite/blob/3d14372c8fa1acb426923c439e545211fc9d7ccd/packages/vite/src/node/server/transformRequest.ts#L169)，因为最开始拦截到得都是 “半成品” id；一旦此时盲目处理，且因为 `resolveId()` 属于 “熔断” 钩子，导致后面不会再次加工路径。  
  这时需要考虑用 `config.createResolver()` 处理成绝对路径。

```log
[Error: ENOENT: no such file or directory, open '/src/components/jsx.js'] {
  errno: -2,
  code: 'ENOENT',
  syscall: 'open',
  path: '/src/components/jsx.js'
}
```

- 尝试识别 `.js` 文件中的 `jsx` 语法插件

```js
{
  name: 'vite-plugin-jsx',
  configResolved(_config) {
    config = _config
    resolve = config.createResolver({
      tryIndex: false,
    })
  },
  enforce: 'pre',
  async resolveId(id) {
    if (id.endsWith('jsx.js')) {
      // TODO: 加载文件并用 jsx-ast 解析
      const _id = await resolve(id) + '?lang.jsx'
      return _id
    }
  },
}
```
