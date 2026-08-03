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
        __MST_IS_DEV__: 'readonly'
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
  }
];
