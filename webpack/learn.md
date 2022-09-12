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

> lib/webpack.js

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

> lib/webpack.js

- `require("./node/NodeEnvironmentPlugin")`
  内部会给 `Compiler` 对象分配 `inputFileSystem`

---

*2022-09-10*

## require expression 处理

> lib/dependencies/RequireContextPlugin.js
  ```js
  // 相当于 fast-glob
  contextModuleFactory.hooks.alternativeRequests.tap(
    "RequireContextPlugin",
    (items, options) => {
        // ...
    },
  )
  ```

> lib/ContextModuleFactory.js
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

> lib/ContextModuleFactory.js
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

> lib/Compiler.js -> lib/ResolverFactory.js
  ```js
  // 类似 Vite 中的 createResolver()
  /** @type {ResolverFactory} */
  this.resolverFactory = new ResolverFactory();
  ```

---

*2022-09-11*

#### `require-expression` 解析链路

搜索 `regExp` + Debug 断点定位

> lib/WebpackOptionsApply.js
  ```js
  new CommonJsPlugin().apply(compiler);
  ```
↓↓↓↓

> lib/dependencies/CommonJsPlugin.js
  ```js
  new CommonJsImportsParserPlugin(parserOptions).apply(parser);
  ```

↓↓↓↓

> lib/dependencies/CommonJsImportsParserPlugin.js
  ```js
  const processRequireContext = (expr, param) => {
    const dep = ContextDependencyHelpers.create(
        CommonJsRequireContextDependency,
        expr.range,
        param,
        expr,
        options,
        {
          category: "commonjs"
        },
        parser,
        undefined,
        getContext()
    );
    if (!dep) return;
    dep.loc = expr.loc;
    dep.optional = !!parser.scope.inTry;
    parser.state.current.addDependency(dep);
    return true;
  };
```

↓↓↓↓

> lib/dependencies/ContextDependencyHelpers.js
   ```js
   // [🚨 require-expression 最终正则](#### require-expression 前缀(prefix) / 后缀(postfix))
   const regExp = new RegExp(
      `^${quoteMeta(prefix)}${options.wrappedContextRegExp.source}${quoteMeta(
         postfix
      )}$`
   );
   ```

`path` to `RegExp` 解析器

> lib/util/identifier.js
  ```js
  const PATH_QUERY_FRAGMENT_REGEXP =
    /^((?:\0.|[^?#\0])*)(\?(?:\0.|[^#\0])*)?(#.*)?$/;
  const PATH_QUERY_REGEXP = /^((?:\0.|[^?\0])*)(\?.*)?$/;

  /** @typedef {{ resource: string, path: string, query: string, fragment: string }} ParsedResource */
  /** @typedef {{ resource: string, path: string, query: string }} ParsedResourceWithoutFragment */

  /**
  * @param {string} str the path with query and fragment
  * @returns {ParsedResource} parsed parts
  */
  const _parseResource = str => {
    const match = PATH_QUERY_FRAGMENT_REGEXP.exec(str);
    return {
        resource: str,
        path: match[1].replace(/\0(.)/g, "$1"),
        query: match[2] ? match[2].replace(/\0(.)/g, "$1") : "",
        fragment: match[3] || ""
    };
  };
  ```

#### 初始化 WebpackOptions 链路

> 🚨 lib/webpack.js
  ```js
  /**
  * @param {WebpackOptions} rawOptions options object
  * @returns {Compiler} a compiler
  */
  const createCompiler = rawOptions => {
    // 🚨 类似 Vite 的 resolveConfig
    const options = getNormalizedWebpackOptions(rawOptions);
    applyWebpackOptionsBaseDefaults(options);
    const compiler = new Compiler(options.context, options);
    // 🚨 初始化 compiler.inputFileSystem
    new NodeEnvironmentPlugin({
        infrastructureLogging: options.infrastructureLogging
    }).apply(compiler);
    // 🚨 执行 User Webpack plugins
    if (Array.isArray(options.plugins)) {
        for (const plugin of options.plugins) {
          if (typeof plugin === "function") {
              plugin.call(compiler, compiler);
          } else {
              plugin.apply(compiler);
          }
        }
    }
    // 🚨 会将 wrappedContextRegExp 初始化为 /.*/
    applyWebpackOptionsDefaults(options);
    compiler.hooks.environment.call();
    compiler.hooks.afterEnvironment.call();
    // 🚨 执行 Webpack 默认 plugins
    new WebpackOptionsApply().process(options, compiler);
    compiler.hooks.initialize.call();
    return compiler;
  };
  ```

↓↓↓↓

> 🚨 lib/config/normalization.js
   ```js
   /**
    * @param {WebpackOptions} config input config
    * @returns {WebpackOptionsNormalized} normalized options
    */
   const getNormalizedWebpackOptions = config => {
      // 🚨 ...
   }
   ```

↓↓↓↓

> 🚨 lib/config/defaults.js
  ```js
  /**
  * @param {JavascriptParserOptions} parserOptions parser options
  * @param {Object} options options
  * @param {boolean} options.futureDefaults is future defaults enabled
  * @param {boolean} options.isNode is node target platform
  * @returns {void}
  */
  const applyJavascriptParserOptionsDefaults = (
    parserOptions,
    { futureDefaults, isNode }
  ) => {
    D(parserOptions, "unknownContextRequest", ".");
    D(parserOptions, "unknownContextRegExp", false);
    D(parserOptions, "unknownContextRecursive", true);
    D(parserOptions, "unknownContextCritical", true);
    D(parserOptions, "exprContextRequest", ".");
    D(parserOptions, "exprContextRegExp", false);
    D(parserOptions, "exprContextRecursive", true);
    D(parserOptions, "exprContextCritical", true);
    // 🚨 require-expression 路径正则
    D(parserOptions, "wrappedContextRegExp", /.*/);
    D(parserOptions, "wrappedContextRecursive", true);
    D(parserOptions, "wrappedContextCritical", false);
    D(parserOptions, "strictThisContextOnImports", false);
    D(parserOptions, "importMeta", true);
    D(parserOptions, "dynamicImportMode", "lazy");
    D(parserOptions, "dynamicImportPrefetch", false);
    D(parserOptions, "dynamicImportPreload", false);
    D(parserOptions, "createRequire", isNode);
    if (futureDefaults) D(parserOptions, "exportsPresence", "error");
  };
   ```

---

*2022-09-11*

#### `require` 解析链路

> lib/WebpackOptionsApply.js
  ```js
  new CommonJsPlugin().apply(compiler);
  ```
↓↓↓↓

> lib/dependencies/CommonJsPlugin.js
  ```js
  new CommonJsImportsParserPlugin(parserOptions).apply(parser);
  ```

↓↓↓↓

> lib/dependencies/CommonJsImportsParserPlugin.js
  ```js
  //#region Require as expression
  //#endregion
  ```

  ```js
  //#region Require
  //#endregion
  ```

↓↓↓↓

> lib/javascript/JavascriptParser.js
   ```js
	/**
	 * @param {ExpressionNode} expression expression node
	 * @returns {BasicEvaluatedExpression} evaluation result
	 */
	evaluateExpression(expression) {
		try {
			const hook = this.hooks.evaluate.get(expression.type);
			if (hook !== undefined) {
				const result = hook.call(expression);
				if (result !== undefined && result !== null) {
					result.setExpression(expression);
					return result;
				}
			}
		} catch (e) {
			console.warn(e);
			// ignore error
		}
		return new BasicEvaluatedExpression()
			.setRange(expression.range)
			.setExpression(expression);
	}
  ```

↓↓↓↓

> lib/javascript/BasicEvaluatedExpression.js
  ```js
	setRange(range) {
		this.range = range;
		return this;
	}
  // ...
  	setExpression(expression) {
		this.expression = expression;
		return this;
	}
  ```

#### require-expression 前缀(prefix) / 后缀(postfix)

> lib/javascript/JavascriptParser.js
  ```js
  this.hooks.evaluate
    .for("BinaryExpression")
    .tap("JavascriptParser", _expr => {
      // ...
    })

  this.hooks.evaluateCallExpressionMember
    .for("concat")
    .tap("JavascriptParser", (expr, param) => {
      // ...
    })
  ```
