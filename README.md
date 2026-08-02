# MWI Sunrishe Toolkit

MWI Sunrishe Toolkit 是《银河奶牛放置》的油猴综合工具箱。当前工程已改为单包构建，源码入口为 `src/index.js`，最终产物输出到 `dist/`。

## 目录结构

- `src/`：构建期源码，最终由 Rollup 合成单个油猴脚本。
- `src/index.js`：极简启动入口，只调用 `runMst()`。
- `src/app/`：应用装配、站点启动和顶层控制器。
- `src/common/`：跨模块公共的数据、i18n、市场、运行时和 UI 能力。
- `src/common/styles/`：全局公共 CSS，由 Rollup raw CSS 插件打进脚本。
- `src/modules/`：按用户功能聚合的业务模块，默认每个模块以一个 `index.js` 为主体。
- `tests/`：回归测试。
- `docs/`：用户说明、待办状态、业务要求、专项分析文档和资料表格。
- `references/`：游戏数据、游戏下载源码、历史脚本、外部工具和第三方素材。
- `dist/`：构建产物；开发包已加入 `.gitignore`，正式包由构建命令生成。

## 指导文档

- `AGENTS.md`：AI 协作和项目级开发入口规范。
- `docs/工程结构与开发规范.md`：文件归位、模块拆分、构建要求和验证规则。
- `docs/待办与状态.md`：当前待办、验收标准、版本状态和交付状态。
- `docs/业务功能要求.md`：长期业务规则、数据要求、UI 约束和功能要求。
- `docs/usage.md`：用户说明和更新日志。

## 常用命令

```powershell
yarn build
yarn build:dev
yarn watch
yarn test
yarn run check
```

首次开发先执行 `yarn install`。开发时使用 `yarn watch` 持续生成 `dist/mst.script.dev.user.js`；正式发布使用 `yarn build` 生成 `dist/mst.script.user.js`。源码可以多模块，发布仍然只安装一个 `.user.js`。
