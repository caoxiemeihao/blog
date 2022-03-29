# Vite 官方教程插件实现与踩坑

![vite-plugin-resolve.png](https://github.com/caoxiemeihao/blog/blob/main/vite/vite-plugin-resolve.png?raw=true)

从与 Vite 的相知，相识到在工作中使用已经一年有余，用 Anthony Fu 的话说这期间 Vite 社区爆炸式的增长，大量周边生态也在不断的增加；这也表明 Vite 使用过程中难免会有一些社区可能还没有即时跟进的功能、插件。工作中这种情况很容易碰到，那么学会写一个自己的 Vite 插件是很有必要的！

本文目的针对官方的入门级插件教程做一个补充、实现；希望通过学习本文你能够自己发散下思维写一个自己的插件，或解决当下在工作中遇到的问题。

有小伙伴可能要问了，官方这个插件就这么几行代码没啥好说的呀！你确定？不信你自己用官方的代码放到自己的 Vite 项目中试试看呢。准确的来说，官方这个 Demo 放到 [Rollup](https://rollupjs.org/) 中肯定没有问题，但是放到 Vite 中不一定哦！

## Vite vs Rollup

在这之前，我们且先“肤浅”的谈谈 Vite 的大概组成

Vite 中有三个重要概念，`server`、`build`、`Pre-building` 对应着内置的三条命令 `vit serve`、`vite build`、`vite optimizer`。

- **build** 这个就是 Rollup + 内置插件。。。很短 😢

- **serve** 命令即一个 Node.js httpServer，Vite 通过 [connect](https://github.com/senchalabs/connect) 链接了一些中间件用来处理各种请求，比如比较重要的中间件 - `transformMiddleware` 以及内部引入的 `transformRequest`

> 部分 Vite 源码

```js
// src/node/server/middlewares/transform.ts
export function transformMiddleware(
  server: ViteDevServer
): Connect.NextHandleFunction

// src/node/server/transformRequest.ts
export function transformRequest(
  url: string,
  server: ViteDevServer,
  options: TransformOptions = {}
): Promise<TransformResult | null> {
  // 🚧 重点：内部实现了 Rollup plugin 的运行机制
}
```

`transformRequest` 负责的就是将请求合理的走一遍 **插件集合**，这个地方 Vite 会执行一大堆内置的插件，注意这里只是 **模仿 Rollup 而不是用到 Rollup**

> 内置插件源码

```js
// src/node/plugins/index.ts

export async function resolvePlugins(
  config: ResolvedConfig,
  prePlugins: Plugin[],
  normalPlugins: Plugin[],
  postPlugins: Plugin[]
): Promise<Plugin[]> {
  const isBuild = config.command === 'build'

  const buildPlugins = isBuild
    ? (await import('../build')).resolveBuildPlugins(config)
    : { pre: [], post: [] }

  return [
    isBuild ? metadataPlugin() : null,
    isBuild ? null : preAliasPlugin(),
    aliasPlugin({ entries: config.resolve.alias }),
    // 🚨重点③ -- 记下来，一会儿要考的
    ...prePlugins,
    config.build.polyfillModulePreload
      ? modulePreloadPolyfillPlugin(config)
      : null,
    // 🚨重点① -- 记下来，一会儿要考的
    resolvePlugin({
      ...config.resolve,
      root: config.root,
      isProduction: config.isProduction,
      isBuild,
      packageCache: config.packageCache,
      ssrConfig: config.ssr,
      asSrc: true
    }),
    isBuild ? null : optimizedDepsPlugin(),
    htmlInlineProxyPlugin(config),
    cssPlugin(config),
    config.esbuild !== false ? esbuildPlugin(config.esbuild) : null,
    jsonPlugin(
      {
        namedExports: true,
        ...config.json
      },
      isBuild
    ),
    wasmPlugin(config),
    webWorkerPlugin(config),
    workerImportMetaUrlPlugin(config),
    assetPlugin(config),
    // 🚨重点② -- 记下来，一会儿要考的
    ...normalPlugins,
    definePlugin(config),
    cssPostPlugin(config),
    config.build.ssr ? ssrRequireHookPlugin(config) : null,
    ...buildPlugins.pre,
    ...postPlugins,
    ...buildPlugins.post,
    // internal server-only plugins are always applied after everything else
    ...(isBuild
      ? []
      : [clientInjectionsPlugin(config), importAnalysisPlugin(config)])
  ].filter(Boolean) as Plugin[]
}

```

看起来一大堆插件，也可以说 Vite 是 “Rollup + 内置插件集合” 的更上层的工具，但是 Vite 在启动之前还有个重要的概念 - Pre-building

- **optimizer** 即对外宣称的 Pre-building 主要负责所有的 裸模块(bare-package) 的构建，什么是裸模块？不是绝对路径、也不是相对路径、也不是别名，或内置的标识符开头的 - 就是裸模块，听着好像很绕的亚子！不精确的一句话总结即 “npm 模块”

```js
// 都不是裸模块
import './mod1'
import '/User/project/src/mod1'
import '@/mod1'
import '/@fs/node_modules/npm-pkg'

// 我是裸模块
import 'module-name'
```

比如你有个裸模块 `vue` 那这个模块肯定会被 Pre-building 构建到 `node_modules/.vite/vue.js` 中的 - **没得跑**  
**重点来了** 这时候你用官方的 Demo 插件思路，可能写了这么个插件 - 将 vue 变成 external 模块导入，这很常见吧！Webpack 中大把大把的案例

```js
// vite.config.ts
export default {
  plugin: [
    {
      name: 'external-vue-plugin',
      resolveId(id) {
        if (id === 'vue') {
          return '\0' + 'vue'
        }
      },
      load(id) {
        if (id === '\0' + 'vue') {
          return `const vue=window.Vue; export default Vue;`
        }
      },
    },
  ],
}
```

就这么 easy 的一个 external 的插件，发到 npm 上周下载量**几k**不难，面试装逼妥妥滴~ 🤩

还记得上面的 **🚨重点①** 么，而你的插件排在 **🚨重点②** 的地方；即实际运行时候，你的插件没机会处理 vue 这裸模块，反而会被内置的 `resolvePlugin` 给传送到 `optimizer` 中给预构建掉！而后在 Vite 运行时加载裸模块且刚好找到了 node_modules/.vite/vue.js 预构建模块就会优先命中，干脆不鸟你写的 `load` 钩子。**这就是为啥说官方的 Demo 可能不是按照预期运行**

## 实现一个按照预期运行的 Demo

既然我们自己实现的，别总叫它 Demo 了，就好像喊人家张三李四似的；干脆起个名字吧 `vite-plugin-resolve` - 就是要和内置的 `resolvePlugin` 对标！

我们可以将我们的插件提前到 **🚨重点③** 的地方来实现我们的预期行为。

```js
// vite.config.ts
export default {
  plugin: [
    {
      name: 'vue-plugin-resolve',
      // 我要去 “🚨重点③” 的位置
      enforce: 'pre',
      resolveId(id) { /* 同原来的逻辑 */ },
      load(id) { /* 同原来的逻辑 */ },
      config(config) {
        // 告诉 Vite 不要预购建 vite 模块
        config.optimizeDeps.exclude.push('vue');
      },
    },
  ],
}
```

**嗯！** 就这么简单，两处改动就可能完美实现 Vite 官方的 Demo 了。是不是好神奇的！

不要小瞧这个插件，它能实现你想要的几乎所有功能，比如 externals、加载预先定义好的模板，可以是任何可执行的 js 代码。发挥空间极大！比如我们这个插件还支持自定义返回：

```js
import resolve from 'vite-plugin-resolve'

export default {
  plugins: [
    resolve({
      // 当 Webpack 的 externals 用
      vue: `const vue = window.Vue; export { vue as default }`,

      // 使用 Promise 的方式读取一个模版文件
      '@scope/name': () => require('fs').promises.readFile('path', 'utf-8'),

      // 用在 Electron 中
      electron: `const { ipcRenderer } = require('electron'); export { ipcRenderer };`,
    }),
  ],
}
```

完整代码 👉 [vite-plugin-resolve](https://github.com/caoxiemeihao/vite-plugins/tree/main/packages/resolve)  

或 npm 安装 `npm i vite-plugin-resolve -D`

## 小结

一个小小 Demo 引发的思考，现实中往往能发挥很大威力；  
希望此文章能使你对 Vite 插件有个更清晰的认识，不要因为害怕没有足够的社区插件而对 Vite 望而却步；  
同时也希望 Vite 生态有更多的小伙伴加入、共建 Vite 这个大生态！
