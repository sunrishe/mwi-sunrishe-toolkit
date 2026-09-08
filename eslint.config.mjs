import globals from 'globals';

// 油猴运行时和浏览器页面共享全局对象，ESLint 只在这里集中声明白名单。
export default [
  {ignores: [
      'node_modules/**', 'dist/**', 'references/**', 'vendor/**'
    ]}, {
    files: [
      'src/**/*.js', 'tests/**/*.js', 'scripts/**/*.mjs', '*.config.mjs'
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        GM: 'readonly',
        GM_getValue: 'readonly',
        GM_setValue: 'readonly',
        GM_setClipboard: 'readonly',
        GM_addValueChangeListener: 'readonly',
        GM_xmlhttpRequest: 'readonly',
        htmlToImage: 'readonly',
        LZString: 'readonly',
        Swal: 'readonly',
        TemplateRenderer: 'readonly',
        uhtml: 'readonly',
        unsafeWindow: 'readonly',
        __MST_BUILD_ENV__: 'readonly',
        __MST_IS_DEV__: 'readonly',
        __MST_PACKAGE_VERSION__: 'readonly'
      }
    },
    rules: {
      'no-undef': 'error',
      'no-redeclare': 'error',
      'no-unreachable': 'error',
      'no-extra-boolean-cast': 'warn',
      'no-unused-vars': [
        'warn', {argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', varsIgnorePattern: '^_'}
      ]
    }
  }, {
    // 源码语法兼容性校验：油猴脚本目标浏览器为 Chrome 80 / Firefox 74 / Safari 13.1，
    // 构建不做语法转译，以下 ES2021+ 语法和 ES2022+ API 会直接进产物导致旧浏览器解析失败，
    // 因此必须禁止。class 字段（含 static）Chrome 72/Firefox 69/Safari 14.1 起已支持，允许使用。
    files: [
      'src/**/*.js'
    ],
    rules: {
      'no-restricted-syntax': [
        'error', {
          selector: 'LogicalAssignmentExpression',
          message: '逻辑赋值（??=、||=、&&=）Chrome 85+ 才支持，目标浏览器无法解析，请改写为普通赋值。'
        }, {
          selector: 'StaticBlock',
          message: 'class 静态块 Chrome 94+ 才支持，目标浏览器无法解析，请移到类外或 constructor。'
        }, {
          selector: 'PrivateIdentifier',
          message: 'class 私有字段（#x）目标浏览器支持不完整，请改用普通字段。'
        }, {
          selector: 'CallExpression[callee.property.name="at"]',
          message: 'Array.prototype.at 是 ES2022 API（Chrome 92+），请改用 arr[arr.length - 1]。'
        },
        {
          selector:
            'CallExpression[callee.property.name="findLast"], CallExpression[callee.property.name="findLastIndex"]',
          message: 'Array.prototype.findLast/findLastIndex 是 ES2023 API（Chrome 97+），请改写为循环。'
        }, {
          selector:
            'CallExpression[callee.property.name="toReversed"], CallExpression[callee.property.name="toSorted"], CallExpression[callee.property.name="toSpliced"]',
          message: '数组变更复制方法（toReversed/toSorted/toSpliced）是 ES2023 API（Chrome 110+），请改用普通写法。'
        }, {
          selector: 'CallExpression[callee.object.name="Object"][callee.property.name="hasOwn"]',
          message: 'Object.hasOwn 是 ES2022 API（Chrome 93+），请改用 Object.prototype.hasOwnProperty.call。'
        }, {
          selector:
            'CallExpression[callee.object.name="Object"][callee.property.name="groupBy"], CallExpression[callee.object.name="Map"][callee.property.name="groupBy"]',
          message: 'Object.groupBy/Map.groupBy 是 ES2024 API（Chrome 117+），请改用循环。'
        }, {
          selector: 'CallExpression[callee.property.name="withResolvers"]',
          message: 'Promise.withResolvers 是 ES2024 API（Chrome 119+），请用 new Promise 实现。'
        },
        {
          selector: 'CallExpression[callee.name="structuredClone"]',
          message: 'structuredClone 是 ES2022 API（Chrome 98+），请改用 JSON 或手写深拷贝。'
        }, {
          selector: 'CallExpression[callee.name="fromAsync"]',
          message: 'Array.fromAsync 是 ES2024 API（Chrome 121+），请改用 for await 收集。'
        }
      ]
    }
  }
];
