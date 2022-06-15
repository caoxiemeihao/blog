# Vite 整合 Electron 总结

## 前言

- Vite 是面向未来几年的构建工具，很有必要在各个场景下都试试集成进来
- Electron 作为前端标配的桌面开发工具，官方并有脚手架也没和哪个框架整合
- `@vue/cli` 官方有给出模板；但是 Vite 这块并没提供，毕竟人家定位是和 Webpack 那样的通用构建工具，甚至连 Vue 都没集成 ；🖖 那么我们尝试来做下这件事儿

*按照 Vue 在 Vite 中的集成风格 Electron 这块应当写一个插件！👉 [vite-plugin-electron](../../vite/vite-plugin-electron.md)*

## 注意 📢

1. 这里假定你简单的知道一些 Vite 的工作原理，这种文章网上有好多的
2. 同时也假定你使用或者上手过 Electron；上手非常简单，直接看官网即可

## 目录结构设计

```tree
├── dist          构建后代码文件夹，和 packages 具有相同的目录结构
|   ├── main
|   └── renderer
|
├── scripts       项目脚本目录
|   ├── build.mjs 构建脚本 npm run build
|   └── watch.mjs 启动脚本 npm run dev
|
├── packages
|   ├── main      主进程代码
|   |   ├── index.ts
|   |   └── vite.config.ts
|   └── renderer  渲染进程(直接copy脚手架生成文件)
|       ├── src
|       |   └── main.ts
|       ├── index.html
|       └── vite.config.ts
```

## vite.config.ts 配置

**渲染进程配置 renderer/vite.config.ts**

> 本文基于开启 `nodeIntegration`，如果无需在渲染进程中使用 Node.js API 可以忽略渲染进程配置

```js
import { builtinModules } = from 'module'

export default {
  root: __dirname,         // 指向渲染进程目录
  base: './',              // index.html 中静态资源加载位置；如 src="./index.js"
  build: {
    outDir: '../../dist/renderer',
    assetsDir: '',         // 这个要格外小心，使用默认的 assets 会导致在 Electron 打包后基于 file:// 加载文件失败
    rollupOptions: {
      output: {
        format: 'cjs',     // Electron 目前只支持 CommonJs 格式
      },
      external: [          // 告诉 Rollup 不要打包内建 API
        'electron',
        ...builtinModules,
      ],
    },
  },
  optimizeDeps: {
    exclude: ['electron'], // 告诉 Vite 排除预构建 electron，不然会出现 __diranme is not defined
  },
  // 其他配置略...
}
```

*渲染进程代码 main/index.ts：*  
即 `npm create vite` 生成代码 

**主进程配置 main/vite.config.ts**

Vite 提供了 `build.lib` 快捷入口，使得主进程配置十分简单；其次只需要关注下 Rollup 的 external 即可

```js
import { builtinModules } = from 'module'

export default {
  root: __dirname,         // 指向主进程目录
  build: {
    outDir: '../../dist/main',
    lib: {
      entry: 'index.ts',   // Electron 目前只支持 CommonJs 格式
      formats: ['cjs'],
      fileName: () => '[name].cjs',
    },
    rollupOptions: {
      external: [          // 告诉 Rollup 不要打包内建 API
        'electron',
        ...builtinModules,
      ],
    },
  },
}
```

*主进程代码 main/index.ts：*

```ts
import { app, BrowserWindow } from 'electron'

app.whenReady().then(() => {
  win = new BrowserWindow({
    title: 'Main window',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      nodeIntegration: true,
      contextIsolation: false,
    },
  })

  if (app.isPackaged) {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  } else {
    win.loadURL('http://localhost:3000')
  }
})
```

## 启动脚本分析

先出个结论 - Electron 的启动与 Node.js 相比行为几乎是一致的 - `可执行程序` + `入口文件`

```sh
# 当我们使用 Node.js 执行一个文件
node path/filename.js
# 这里使用的是全局的 node 命令

# 当我们使用 Electron 执行一个文件
node_modules/.bin/electron path/filename.js
# 这里使用的是项目中的 electron
```

再思考下关于 Electron 启动的问题

1. 开发环境下 Electron 加载 Vite 启动的开发服务器，即通过 `loadURL()` 加载一个 http 地址
2. 生产环境下使用 `loadFile()` 加载一个入口文件

## 启动脚本设计

Vite 提供了全量的可编程化的 Node.js API 方便我们灵活调度，比如 `vite server` 命令对应 API 中的 `createServer().listen()`。基于它我们可以很方便的在我们的脚本中启动 Vite

**scripts/watch.mjs**

```ts
import { spawn } from 'child_process'
import { createServer, build } from 'vite'
// electron 绝对路径，Windows 为 electron.exe
import electronPath from 'electron'

// ---- 渲染进程部分 ----
const server = await createServer({ configFile: 'packages/renderer/vite.config.ts' })
await server.listen()

// ---- 主进程部分 ----
let electronProcess = null
build({
  // 加载主进程构建配置
  configFile: 'packages/main/vite.config.ts',
  build: {
    // 通过 watch 选项监听主进程文件改动，时时编译
    watch: {},
  },
  plugins: [{
    name: 'electron-main-starter',
    // 第一次编译、重新编译后都会触发
    writeBundle() {
      if (electronProcess) {
        // 重启前先杀死当前正在运行的 electron 程序
        electronProcess.kill()
      }
      // 启动、重启 electron
      electronProcess = spawn(
        // 相当于官方的 electron . 启动方式
        electronPath, ['.'],
        // 将 electron 主进程的 console.log 输出到当前命令行
        { stdio: 'inherit' },
      )
    },
  }],
})
```

## 润

配置

```json
{
  "scripts": {
    "dev": "node scripts/watch.mjs"
  }
}
```

命令

```sh
npm run dev
```

**到这一步已经完成了，已经是一个可用的应用了！🚀**

---

## 渲染进程使用 Node.js API

**renderer/src/main.ts**

默认情况下 Vite 会将所有的 `import` 裸模块以 ESM 格式预构建到 `node_modules/.vite/` 文件夹下

1. Node.js 内置模块会被当成 external 模块处理，但只是一个简单的 polyfill 并不能在渲染进程中使用
2. electron 模块会执行预构建，得到的结果也是不可以使用的，因为 electron 导出的只是一个程序运行路径而已

上述两点，需要我们对其有正确的处理才能保障其在渲染进程中工作

1. 第一种方式，如果使用 require('electron') 可以避开预构建和 polyfill 行为，从而正常工作
2. 如果将 `import electron form 'electron'` 在与构建中排除，并在 Vite 对其 polyfill 之前进行拦截处理，也可以使其正常工作 

```js
// ❌ 不会正常工作
import { ipcRenderer } from 'electron'
// ✅ 可以正常工作
const { ipcRenderer } = require('electron')
```

到此为止，使用部分已经 OK 了！除了看起来丑陋的 `require('electron')`

## 插件分析

假设此时如果我们设计一个插件，将 `import electron from 'electron'` 拦截，按照 ESM 格式返回可以工作的代码

```js
// 使用 import { ipcRenderer } from 'electron' 将会返回如下代码

const { ipcRenderer, shell, ...othders } = require('electron')
export {
  ipcRenderer,
  shell,
  ...others,
}
```

## 插件设计

插件的功能是拦截 `import electron from 'electron'` 并返回正确的 ESM 格式代码，我们先创建好 electron.js 模板代码；然后使用 `resolve.alias` 对其进行拦截

```js
import { resolve } from 'path'
import { writeFileSync } from 'fs'

export default {
  plugins: [{
    name: 'vite-plugin-electron/renderer',
    config(config) {
      const electronJsPath = resolve(config.root, 'node_modules/.vite-plugin-electron/electron.js')
      // electron.js ESM 格式模板
      const electronJsTPL = `
const { ipcRenderer, shell, ...othders } = require('electron')
export {
  ipcRenderer,
  shell,
  ...others,
}`

      // 创建 electron.js 到 node_modules/.vite-plugin-electron/ 下
      writeFileSync(electronJsPath, electronJsTPL)

      // 利用 alias 将 import 'electron' 指向到前面创建的 electron.js
      config.resolve.alias.push({
        find: 'electron',
        replacement: electronJsPath,
      })
    },
  }]
}
```

在 **renderer/vite.config.ts** 中使用 `vitejs-plugin-electron/renderer`

```ts
import electron from 'vitejs-plugin-electron/renderer'

export default {
  plugins: [
    electron(),
  ],
  // 其他配置略...
}
```

至此，`import electron from 'electron'` 也可以正常工作了

```js
// ✅ 可以正常工作
import { ipcRenderer } from 'electron'
```

🎉 🎉 🎉 🎉

## 总结

- Vite 个人觉得是个不错的方案，毕竟打包工具早晚会推出历史舞台；Vite 往前又迈了 `0.5步`
- Electron 的集成只是一个案例，从一个案例出发到写一个插件，你会更好的理解 Vite 设计、思想
- 最后，不能什么都站在客观的角度去等待，更需要我们主动的去**建设**

项目整体所有代码在这 [electron-vite-vue](https://github.com/electron-vite/electron-vite-vue) ![GitHub stars](https://img.shields.io/github/stars/caoxiemeihao/electron-vite-vue?color=fa6470&style=flat) 可以直接 **用于生产** (亲点个 start 呗 😘)
