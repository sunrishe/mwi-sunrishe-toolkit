// 构建脚本会静态替换这个占位符，业务代码不直接读取 Node 环境变量。
// 目前只有语言切换按钮需要区分 dev/prod：正式包不展示该调试入口。
export const BUILD_FLAGS = Object.freeze({
  showLanguageToggle: __MST_IS_DEV__
});
