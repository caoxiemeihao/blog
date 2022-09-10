## 📢 注意事项

1. 提前学下 [tapable](https://github.com/webpack/tapable)，不难的 :)

## 入口文件

- package.json -> main => lib/index.js

```js
const fn = lazyFunction(() => require("./webpack"));
module.exports = mergeExports(fn, {
	get webpack() {
		return require("./webpack");
	},
});
```

- `require('webpack')` === `require('webpack').webpack`

## CommonJs 文件

❌ CommonJsDependencyHelpers -> [CommonJsExportRequireDependency, CommonJsExportsDependency]
✅ CommonJsExportRequireDependency
✅ CommonJsExportsDependency
✅ CommonJsExportsParserPlugin
✅ CommonJsFullRequireDependency
✅ CommonJsImportsParserPlugin
   CommonJsPlugin
✅ CommonJsRequireContextDependency
✅ CommonJsRequireDependency
✅ CommonJsSelfReferenceDependency

## CommonJs 链路

> `lib/webpack.js`

2. `require("./WebpackOptionsApply")`
   ```js
   const compiler = new Compiler(options.context, options);
   // ...
   new WebpackOptionsApply().process(options, compiler);
   ```
2. `require("./dependencies/CommonJsPlugin")`
   ```js
   new CommonJsPlugin().apply(compiler);
   ```

`WebpackOptionsApply` 看起来很像 Vite 的 `resolveConfig`

## 调用 `webpack()` 执行的第一个插件

> `lib/webpack.js`

- `require("./node/NodeEnvironmentPlugin")`
   内部会给 `Compiler` 对象分配 `inputFileSystem`

---

*2022-09-10*

## require expression 处理

> `lib/dependencies/RequireContextPlugin.js`
   ```js
   // 相当于 fast-glob
   contextModuleFactory.hooks.alternativeRequests.tap(
      "RequireContextPlugin",
      (items, options) => {
         // ...
      },
   )
   ```

> `lib/ContextModuleFactory.js`
   ```js
   // 解析依赖-入口
	resolveDependencies(fs, options, callback) {
		const cmf = this;
		const {
			resource,
			resourceQuery,
			resourceFragment,
			recursive,
			regExp,
			include,
			exclude,
			referencedExports,
			category,
			typePrefix
		} = options;
		if (!regExp || !resource) return callback(null, []);
      // ...
   }
   ```

> `lib/ContextModuleFactory.js`
   ```js
   // 'foo/index.js' -> ['foo', 'foo/', 'foo/index', 'foo/index.js']
   this.hooks.alternativeRequests.callAsync(
      [obj],
      options,
      (err, alternatives) => {
         if (err) return callback(err);
         alternatives = alternatives
            // require-expression 正则匹配合规路径
            .filter(obj => regExp.test(obj.request))
            .map(obj => {
               const dep = new ContextElementDependency(
                  `${obj.request}${resourceQuery}${resourceFragment}`,
                  obj.request,
                  typePrefix,
                  category,
                  referencedExports,
                  obj.context
               );
               dep.optional = true;
               return dep;
            });
         callback(null, alternatives);
      }
   );
   ```

> `lib/Compiler.js` -> `lib/ResolverFactory.js`
   ```js
   // 类似 Vite 中的 createResolver()
   /** @type {ResolverFactory} */
   this.resolverFactory = new ResolverFactory();
   ```
