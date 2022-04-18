# ⚡️ 一个插件让 Vite 与 Electron 无缝结合

![vite-plugin-electron.png](https://github.com/caoxiemeihao/blog/blob/main/vite/vite-plugin-electron.png?raw=true)

## 前言

Vite 官方并没有提供 Electron 的整合模板，这样我们好像只能通过自己动手从零开始“搭积木”；但是对于大部分前端同学来说用惯了 Vite 官方的 `npm create vite` 脚手架创建工程，真正脱离脚手架后动起手里就很可能“无从下手”；这也不是 Vite 特有的问题，@vue/cli、create-react-app 同样会使我们“变笨”。

有一说一 Vite 相对于 Webpack 使用要简单的多，概念少；你只需要一个 vite-plugin-xxx 就能解决对应的问题了，最起码这点对我们脱离脚手架自己动手算是个“利好”；就像 Vue 于刚入手前端框架的小白那样很是友好，Vite 对刚刚接触它的同学也很是友好。

本文从 Vite 插件入手，通过插件的形式接管 Electron 的启动、热重启操作；也符合 Vite 使用相对于 Webpack 更加简单的习惯，即使你不用懂 Electron 的启动原理也可以通过本文插件无感知的启动 Electron，降低心智负担。

当然有人可能会疑惑，为啥不是 Vite + Electron 的“样板工程”的方式结合两者 - 各有各的好；如果你更偏向样板工程的方式，你也可以看我做好的样板工程项目 👉 [electron-vite-boilerplate](https://github.com/electron-vite/electron-vite-boilerplate)
![GitHub stars](https://img.shields.io/github/stars/caoxiemeihao/electron-vite-boilerplate?color=fa6470) 当然，本文的插件原理其实就是对样板工程的一个包装 😄

闲言少叙，我们开始吧！

## Electron 是如何启动的

Electron 官网上有个关于启动的教程是需要你配置 npm-scripts 里面一个命令 `electron .`

```json
{
  "scripts": {
    "start": "electron ."
  }
}
```

这个命令的工作原理是：

1. `electron` 即 `node_modules/.bin/electron` 文件，里面是 Node.js 脚本

```js
// Electron App 的绝对路径
const electron = require('./');
// require('./') 即 require('electron')
// 这里说的 Electron App 实质上已经是一个可执行的二进制文件
// 在 Windows 系统中名字叫 `electron.exe`
// 在类 Unix 系统中名字叫 `electron`

const proc = require('child_process');

// 通过 Node.js 提供的 `spawn` 拉起 Electron App 进程
const child = proc.spawn(electron, process.argv.slice(2), { stdio: 'inherit', windowsHide: false });
// 这等价于我们用鼠标双击了 Electron App 的图标启动了它
// 所以说这一点都不神奇，我们也可以复刻同样的操作 ---- 在我们的插件中也是这个实现方式
```

2. `.` 即代表当前目录，`electron` 会读取当前目录的 package.json 文件并找到 main 字段对应的 js 文件加载它

3. 我给翻译翻译什么叫 `npm run start` 什么叫 `electron .`

```sh
# 假设我们的入口文件是工程下的 index.js
# 那么下面的命令在命令行中执行和 `electron .` 是一样的效果
/Users/user-name/electron-project-path/node_modules/.bin/electron /Users/user-name/electron-project-path/index.js
```

## Vite 插件简介

Vite 插件实际上是一些“钩子”的集合，在构建的特定时期会加载对应的钩子；用户通过插件钩子可以实现一些自己的逻辑比如 修改代码加载行为 `resolveId(), load()`、转换代码 `transform()`、监听构建完成 `writeBundle()`、或者通过得到 Vite 抛给用户的一些实例执行一些副作用 `config()` 等等。

```js
{
  name: 'vite-plugin-name',
  config() {},
  resolveId() {},
  load() {},
  transform() {},
  writeBundle() {},
  // ...other hooks
}
```

## Vite 编程接口 Node.js API

很多时候，我们使用 Vite 只需要一个 `vite.config.ts` + `vite cmd` 组合的形式就可以开发我们的项目了，但同时 Vite 也为我们提供了全量的、可编程的 Node.js API 供我们灵活调度，比如：

`vite serve` 对应 Vite API 中的 `createServer().listen()`

`vite build` 对应 Vite API 中的 `build()`

知道了最常用的这两个对我们来说足够用了。

## 项目工程目录结构

Electron 分为主进程、渲染进程；我们项目也根据两个进程来设计 - 基于 `npm create vite vite-electron-app -- --template vue-ts` 官方的工程模板来改造

```tree
├── electron-main  # 新增主进程目录
├   ├── index.ts
├── src            # 渲染进程目录；脚手架生成的目录结构，无需任何改动
├   ├── main.ts
├── index.html
├── vite.config.ts
```

## Vite 构建 Electron 入口文件

使用 Vite API 构建 js、ts 文件十分简单，我们以 [build.lib](https://vitejs.dev/config/#build-lib) 的方式构建我们的 Electron 入口文件

```js
import { build } from 'vite'

build({
  build: {
    outDir: 'dist/electron-main',
    lib: {
      entry: 'electron-main/index.ts',
      // 目前 Electron 只能使用 commonjs
      formats: ['cjs'],
      // 将会输出 `dist/electron-main/index.js`
      fileName: () => '[name].js',
    },
  },
})
```

看起来如此的简单，那么构建完了如何启动 Electron 呢？

## Vite 插件启动、重启 Electron

我们通过 Vite 插件的 `writeBundle` 钩子监听到文件已经被构建完成，那么我们就可以在钩子中执行 Electron **启动逻辑**。

```js
// 这里照抄 node_modules/.bin/electron 源码
const electron = require('electron');
const proc = require('child_process');

build({
  // lib 配置略...
  plugins: [
    {
      name: 'vite-plugin-electron',
      writeBundle() {
        const child = proc.spawn(
          // electron.exe 绝对路径
          electron,
          // 指定 electron.exe 入口文件，等价于 npm-script 中的 `electron .`
          ['.'],
          // 子进程的 console.log 都输出到当前命令行
          { stdio: 'inherit'}
        );
      },
    },
  ],
})
```

**重启逻辑** 也很简单，我们只需要持续监听 Vite 构建并杀死当前已经启动的 Electron 后重新拉起即可。

```js
const electron = require('electron');
const proc = require('child_process');

let child = null

build({
  // 开启持续监听 Vite 构建
  watch: {},
  plugins: [
    {
      name: 'vite-plugin-electron',
      writeBundle() {
        if (child) {
          // 每次启动前杀死正在运行的 Electron 程序
          child.kill();
        }
        child = proc.spawn(electron, ['.'], { stdio: 'inherit'});
      },
    },
  ],
})
```

## vite-plugin-electron 封装

到这里你已经知道了大致的 Vite 启动 Electron 的流程，可以说一点都不难；那么对上面的代码我们再二次封装一下，变成一个 Vite 插件。  
顺便保留一些配置给用户，毕竟有些东西我们没法确定，只能由用户指定！比如 Electron 构建主入口文件，或者用户还想修改一些构建 Electron 的 Vite 配置呢！

```ts
// Vite 插件天然支持 ts 语法，我们直接用 ts 写插件即可
import { UserConfig, build, mergeConfig } from 'vite'
import electron from 'electron'
import proc from 'child_process'

export interface Configuration {
  /** 主程序相关配置 */
  main: {
    /** build.lib.try 的一个快捷配置 */
    entry: string
    /** 支持用户自定义 Vite 构建配置 */
    vite?: UserConfig
  }
}

export default function viteElectron(config: Configuration) {
  return {
    name: 'vite-plugin-electron',
    // 这里我们使用已经加载完成的 config 钩子
    // 因为这个钩子已经确定了所有必要的配置
    configResolved(viteConfig) {
      let electronProcess: ChildProcessWithoutNullStreams | null = null

      const viteElectronConfig: UserConfig = {
        build: {
          // 将 Electron 入口文件构建到用户配置的输出目录的 electron-main 下面
          outDir: `${viteConfig.build.outDir}/electron-main`,
          lib: {
            entry: config.main.entry,
            formats: ['cjs'],
            fileName: () => '[name].js',
          },
          watch: {},
        },
        plugins: [{
          name: 'electron-main-watcher',
          writeBundle() {
            // Electron 启动、重启逻辑
            electronProcess && electronProcess.kill()
            electronProcess = spawn(electron, ['.'], { stdio: 'inherit', env })
          },
        }],
      };

      build(
        // 合并用户自定义的 Vite 配置
        mergeConfig(
          viteElectronConfig,
          config.main.vite || {},
        ),
      );
    },
  }
}
```

结合我们上面的目录结构，在 vite.config.ts 中使用 vite-plugin-electron

```ts
import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron'

export default defineConfig({
  plugins: [
    electron({
      main: {
        entry: 'electron-main/index.ts',
      },
    }),
  ],
})
```

到此为止，Vite 结合 Electron 插件的核心原理部分就介绍完了。实际中还要考虑些其他的因素，比如要监听到 Vite 的开发服务器 ViteDevServer 已经启动了我们再启动 Electron 才是更合理的！再比如构建模式 `vite build` 下就不要用 `build.watch` 了等等一些必要的处理。

行文至此，希望本教程能对你有所帮助！

完整代码在 github 👉 [vite-plugin-electron](https://github.com/electron-vite/vite-plugin-electron)  
使用案例在 github 👉 [vite-plugin-electron-quick-start](https://github.com/electron-vite/vite-plugin-electron-quick-start)  
参考模板在 github 👉 [electron-vite-vue](https://github.com/electron-vite/electron-vite-vue)
