export const BUILD_ENV = __MST_BUILD_ENV__;

// 构建脚本会静态替换这些占位符，业务代码不直接读取 Node 环境变量。
export const BUILD_FLAGS = Object.freeze({
  isDev: __MST_IS_DEV__,
  showLanguageToggle: __MST_IS_DEV__,
  showDebugInfo: __MST_IS_DEV__,
  enableDevMenu: __MST_IS_DEV__
});
