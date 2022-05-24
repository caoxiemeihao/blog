# 🖖 Vue2 改造 ⚡️ Vite

## 项目背景

- 本次改造的工程是公司一个很重要，迭代又很频繁的系统；现在已经有 100+ 张页面了  
- 工程模板由 `@vue/cli` 创建的 `Vue2.x` 版本，内部使用 `Webpack4.x` 构建  
- 随着项目越来越大(一年50增加张页面左右)，对项目冷启动速度的追求就越显得迫切  

## 技术分析
虽然 `Vite` 发展很快，npm 上面关于 Vite 的插件也跟进的很快；但是总有一些鞭长莫及的情况出现在我们的老项目中

这里我主要以我实际改造中碰到的问题做下技术总结，如果你在使用过程中还有碰到其他的问题，本文的解决问题思路也有一定的参考价值

以下是我碰到的改造问题点 (针对@vue/cli生成的vue2工程)

1. 需要将默认的项目根目录入口 `index.html` 指向已有的 `public/index.html`
2. 转换 css 写法 `@import '~normalize.css/normalize.css'` 中的 `~` 别名
3. 消除 `import('@/pages/' + path)` 写法在 Vite 中警告⚠️
4. 转换 `require` 为 `import` 语法 -- CommonJs to ESModule
5. 兼容 Webpack 中 `require.contex` 语法
6. 支持 `<script>` 代码块中写 `jsx` 语法 -- render 返回 jsx
7. 支持 Webpack 中 `externals` 模块

## Vite plugins

首先项目改造基于一个官方插件 [vite-plugin-vue2](https://github.com/underfin/vite-plugin-vue2)

```sh
npm i -D vite-plugin-vue2
```

你可能需要先了解下如何写一个 [Vite 插件](https://vitejs.dev/guide/api-plugin.html)

**① 将 index.html 指向 public/index.html**

插件 [vite-html](https://github.com/vite-plugin/vite-html)

```sh
npm i -D vite-html
```

摘自 `Vite` [官网的一句话](https://cn.vitejs.dev/guide/#index-html-and-project-root)

> 你可能已经注意到，在一个 Vite 项目中，index.html 在项目最外层而不是在 public 文件夹内。这是有意而为之的：在开发期间 Vite 是一个服务器，而 index.html 是该 Vite 项目的入口文件。

原理解析：

在开发模式下 `Vite` 的所有资源都是通过 `http server` 返回给浏览前的 `index.html` 也不例外
也就是说我们可以通过插件的 `configureServer` 拦截到 `/`、`/index.html` 请求然后将 `req.url` 重定向到指定文件位置

```js
{
  name: 'vite-html',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      // 拦截 / 或 /index.html 请求
      if (req.url === '/' || req.url === '/index.html') {
        req.url = '/public/index.html'
      }
      next()
    })
  },
}
```

构建模式下我们使用 `resolveId` 钩子拦截 

```js
{
  name: 'vite-html',
  resolveId(id) {
    if (id. === 'index.html') {
      return 'public/index.html'
    }
  },
}
```

有 XDM 可能会说为啥不通过 `config.root` 配置解决路径加载 `index.html` 问题；  
在 `vue2` 工程的根目录本就是源码所在目录，`index.html` 也是当做**源码**的身份出现的，而不是静态文件  

如果将 `config.root` 改成 `public` 会导致很多其他问题；比如写的 `@/views/home.vue` 本意是找 `/src/views/home.vue`，结果会因为 `root` 配置跑到 `public` 目录下寻找，会造成很多不必要的麻烦  

*官方说明 👉 [index.html 是该 Vite 项目的入口文件](https://cn.vitejs.dev/guide/#index-html-and-project-root)*  

**② 转换 css 写法 `@import '~normalize.css/normalize.css'` 中的 `~` 别名**

这个是 `Vite` 比较强大的部分，支持使用 `resolve.alias` **官方说明 👉** [Vite 的路径别名也遵从 CSS](https://cn.vitejs.dev/guide/features.html#import-inlining-and-rebasing)

**但有一坑 ！** 只能识别 `alias/xxx` 不能识别 `aliasxxx` - *@rollup/plugin-alias的锅*

你有如下配置

```js
{
  resolve: {
    alias: {
      '@': path.join(__dirname, 'src'),
      '~': path.join(__dirname, 'node_modules'), // 这个通常给 css import 用的
    }
  }
}
```

他们会被 `@/xxx`、`~/xxx` 命中，**但是不会被** `@xxx`、`~xxx` 命中  
很多小伙伴写 CSS 时候会有 `@import '~normalize.css/normalize.css'` -- **这种无法命中**，需要改成如下写法

```js
  resolve: {
    alias: [
      // 适配 @xxx、@/xxx
      { find: '@', replacement: path.join(__dirname, 'src') },
      // 适配 ~/xxx
      { find: /* ~/ *//^~(?=\/)/, replacement: path.join(__dirname, 'node_modules') },
      // 适配 ~xxx
      { find: /* ~ *//^~(?!\/)/, replacement: path.join(__dirname, 'node_modules/') },
    ]
  },
```

**③ 消除 `import('@/pages/' + path)` 写法在 Vite 中警告⚠️**

插件 [vite-plugin-dynamic-import](https://github.com/vite-plugin/vite-plugin-dynamic-import)

```shell
npm i -D vite-plugin-dynamic-import
```

这个还是挺麻烦的，需要考虑两个点

1. `@` 这种别名替换 -- Vite 报错
2. `path` 动态路径分析 -- Vite 警告

原理解析：

`impot('@/pages/' + path)` 本质上是将 pages 下的所有文件列举出来，然后生成一个 `switch` 提供匹配

如有目录结构如下：

```tree
├── src/
|   ├── pages/
|   |   ├── foo.vue
|   |   └── bar/
|   |       └── index.vue
|   └── routes.ts
```

```js
// src/routes.ts
function load(path) {
  return import('@/pages/' + path)
}

const routes = [
  {
    name: 'foo',
    path: '/foo',
    component: () => load('foo'),
  },
  {
    name: 'bar',
    path: '/bar',
    component: () => load('bar'),
  },
]
```

将会生成:
```js
function load(path) {
  return __variableDynamicImportRuntime__('@/pages/' + path)
}

// 列举出所有可能的路径
function __variableDynamicImportRuntime__(path) {
  switch (path) {
    case '@/pages/foo': return import('./pages/foo.vue');
    case '@/pages/foo.vue': return import('./pages/foo.vue');
    case '@/pages/bar': return import('./pages/bar/index.vue');
    case '@/pages/bar/index': return import('./pages/bar/index.vue');
    case '@/pages/bar/index.vue': return import('./pages/bar/index.vue');
  }
}
```

*参考链接 [dynamic-import-vars](https://github.com/rollup/plugins/tree/master/packages/dynamic-import-vars)*


**④ 转换 `require` 为 `import` 语法**

插件 [vite-plugin-commonjs](https://github.com/vite-plugin/vite-plugin-commonjs)

```sh
npm i -D vite-plugin-commonjs
```

这个问题就是 CommonJs to ESModule 方案，npm 上面找了好几个包都没实现我的功能(要么不转化，要么注入环境变量报错)；  
索性自己写了一个简化版的，也算给自己拓宽下技术线路(不能吃现成的，得会自己做不是)

技术选型：

1. `acorn` js 抽象语法树(AST)工具
2. `acorn-walk` 语法树 遍历工具

原理解析：

1. 先用 acorn 将代码转化为 `AST`
2. 在使用 acorn-walk 遍历 `AST` 分析出 require 加载得文件，然后转换成 import 格式即可

如果有代码如下

```js
const pkg = require('../package.json');

const routers = [{
  path: '/foo',
  component: require('@/pages/foo.vue').default;
}];
```

将会生成:

```js
import * as pkg  from "../package.json";
import * as __CJS_import__0__ from "@/pages/foo.vue";

const routers = [{
  path: '/foo',
  component: __CJS_import__0__.default;
}];
```

**⑤ 兼容 Webpack 中 `require.contex` 语法**

插件 [@originjs/vite-plugin-require-context](https://github.com/originjs/vite-plugins/tree/main/packages/vite-plugin-require-context)

```sh
npm i -D @originjs/vite-plugin-require-context
```

*与 `Vite` 内置的 [import.meta.globEager](https://vitejs.dev/guide/features.html#glob-import) 行为一致*

**⑥ 支持 `<script>` 代码块中写 `jsx` 语法**

在 `@vue/cli` 下配置 `babel.confg.js` 可以直接使用 `jsx`  
在 `vite-plugin-vue2` 下有两种办法解决这个问题  

1. 在文件中手动补充 `<script lang="jsx">`  指定用 jsx 语法解析
2. 使用插件 [vite-plugin-lang-jsx](https://github.com/caoxiemeihao/vite-plugins/tree/main/packages/lang-jsx) 自动处理 -- **推荐**

```sh
npm i -D vite-plugin-lang-jsx
```

**⑦ 支持 Webpack 中 `externals` 模块**

插件 [vite-plugin-resolve](https://github.com/vite-plugin/vite-plugin-resolve)

```sh
npm i -D vite-plugin-resolve
```

底层实现是通过 `load` 钩子拦截，返回符合 ESModule 格式代码

```js
// 你的代码
import vue from 'vue'

// vite-plugin-resolve 返回的代码 - 感兴趣的可以通过 Network 调试查看
const M = windows.Vue; export { M as default };
```

## 完整配置

在项目根目录添加 `vite.config.ts`

> 注意：下面的配置可能需要结合你项目的情况做一些调整

```js
import path from 'path'
import { defineConfig } from 'vite'
// 必选 * vite 支持 vue2 官方插件
import { createVuePlugin } from 'vite-plugin-vue2'
// 必选 * 加载 public/index.html
import html from 'vite-html'
// 可选 - 兼容 CommonJs 写法
import commonjs from 'vite-plugin-commonjs'
// 可选 - 兼容 import('@views/' + path)
import dynamicImport from 'vite-plugin-dynamic-import'
// 可选 - 兼容 Webpack 中 require.contex
import viteRequireContext from '@originjs/vite-plugin-require-context'
// 可选 - 支持在 <script> 中使用 jsx 语法
import langJsx from 'vite-plugin-lang-jsx'
// 可选 - 如果你有外部 lib 通过 CDN 引入
import resolve from 'vite-plugin-resolve'
import { vue } from 'vite-plugin-resolve/presets'

export default defineConfig({
  plugins: [
    /**
     * 自动检测添加 lang="jsx"，需要放到 vite-plugin-vue2 前面
     */
    langJsx(),
    /**
     * Vite 官方支持 vue2 插件
     */
    createVuePlugin({
      // 如果你需要 jsx
      jsx: true,
    }),
    /**
     * 处理 Webpack 项目中 require 写法
     */
    commonjs(),
    /**
     * 兼容 import('@views/' + path)
     */
    dynamicImport(),
    /**
     * 处理 Webpack 项目中 require.context 写法
     */
    viteRequireContext(),
    /**
     * 将 index.html 重定向到 public/index.html
     */
    html({
      template: 'public/index.html',
      // 注入 entry js
      inject: '/src/main.js',
    }),
    /**
     * 同 Webpack 中 externals
     */
    resolve({
      // 使用内置的快捷方式
      vue: vue.v2,
    }),
  ],
  resolve: {
    alias: [
      { find: '@', replacement: path.join(__dirname, 'src') },
      { find: /* ~/ *//^~(?=\/)/, replacement: path.join(__dirname, 'node_modules') },
      { find: /* ~ *//^~(?!\/)/, replacement: path.join(__dirname, 'node_modules/') },
    ],
    // 同 Webpack 中的 extensions
    extensions: ['.vue', '.js', '.jsx', '.ts', '.tsx', '.json'],
  },
  define: {
    // 同 Webpack.DefinePlugin
    'process.env': process.env,
  }
})
```

## 润

```sh
npm run vite
```

🎉 Boom shakalaka!
