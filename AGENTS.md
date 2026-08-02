# AGENTS.md

本文件是 MST 项目的协作和 AI 开发入口规范，适用于整个仓库。用户最新明确要求优先级最高；当前待办以 `docs/待办与状态.md` 为准；业务功能细节以 `docs/业务功能要求.md` 为准；工程结构、文件归位和模块拆分以 `docs/工程结构与开发规范.md` 为准。

## 基础规则

- 默认全程使用简体中文交流，代码标识和英文专有名词保持原文。
- 修改前先阅读相关源码、测试和文档，不凭记忆改游戏数据、DOM 结构或历史脚本逻辑。
- 只改当前任务必须涉及的内容，不顺手重构无关区域。
- 不直接修改 `dist/`、`node_modules/` 和归档历史脚本；构建产物由命令生成。
- 参考资料位于 `references/`，只用于核对和测试，运行时代码不得依赖本地参考文件。

## 开发流程

1. 明确目标和成功标准。
2. 查阅相关文件，优先使用现有结构和命名。
3. 小步修改，每一步保持可构建、可测试。
4. 功能或代码行为变化必须按 SemVer 更新版本号，并同步相应文档和更新日志。
5. 根据改动风险选择验证范围；较大改动必须完成自动检查和 Playwright MCP 浏览器实际验证。

## 构建约束

- 依赖统一由 Yarn Classic `1.22.22` 管理，只维护 `yarn.lock`，不得生成或提交 `package-lock.json`。
- 最终只输出一个油猴脚本：`dist/mst.script.user.js`。
- 开发包输出 `dist/mst.script.dev.user.js`，配合 `yarn watch` 使用。
- 不拆成多个本地 `@require` 包；源码模块化只在构建期通过 Rollup 打包。
- dev/prod 差异统一通过 `src/common/build-flags.js` 和构建替换控制，不在运行时读取 Node 环境变量。

## 版本与文档

- `package.json#version` 是正式版本号的唯一来源，`userscript-header.txt` 中的版本占位符由 Rollup 自动替换，不手工维护重复版本号。
- 版本号遵循 SemVer：不兼容变更提升 major，向后兼容的新功能提升 minor，修复和兼容性调整提升 patch。
- 功能或用户可见行为发生变化时必须提升版本号；仅修改文档、注释、格式、测试或不影响产物行为的工程配置时可以不提升。
- 提升版本号时必须同步更新 `docs/usage.md` 双语更新日志和 `docs/待办与状态.md` 当前版本；业务规则、工程规范或专项算法变化还要更新对应文档。
- 开发构建的 `-dev.<timestamp>` 后缀由构建流程生成，不单独修改正式版本号。

## 验证分级

- 仅文档、注释、错别字或极小且明显低风险的改动可以不执行验证，但交付时必须说明未验证。
- 一般代码改动至少执行相关 lint、测试或构建；涉及多个文件、多个模块、公共能力、依赖或构建流程时执行完整 `yarn run check`。
- 改动范围较大，或涉及 UI、DOM、CSS、交互流程、站点兼容时，除 `yarn run check` 外，必须使用 Playwright MCP 服务打开实际目标页面，验证核心流程、页面显示和控制台错误。
- 本项目所称 Playwright MCP，只指工具名以 `mcp__playwright__` 开头的 Playwright MCP 服务调用。Browser plugin / Browser skill 内置的 Playwright API、Node REPL 浏览器控制和 `playwright-cli` 均不得替代，也不得在交付说明中记为“Playwright MCP 已通过”。
- 本地预览页、静态 Mock 和测试夹具只能补充验证布局，不能代替登录后的实际目标页面。若受登录状态限制，必须把实际页面标记为未覆盖。
- 浏览器验证无法执行时不得默认视为通过，必须明确记录阻塞原因和未覆盖风险。

## 文件归位

- 新源码只按三层归位：顶层装配进 `src/app/`，跨模块公共能力进 `src/common/`，用户功能进 `src/modules/功能名/`；具体规则见 `docs/工程结构与开发规范.md`。
- 业务模块默认以一个 `index.js` 为主体，不按 `state/view/events/controller` 机械细拆；仅纯计算、Worker、导出、稳定大数据等真实边界单独成文件。
- i18n 文案放入 `src/common/messages.js`。全局 CSS 放入 `src/common/styles/`，模块私有 CSS 放在模块目录，并通过构建打进单文件脚本。
- 测试放入 `tests/`，优先覆盖可回归的业务逻辑和 DOM 约束。
- 用户说明和更新日志维护在 `docs/usage.md`。
- 当前待办和状态维护在 `docs/待办与状态.md`。
- 长期业务要求维护在 `docs/业务功能要求.md`。
- 专项分析文档放入 `docs/analysis/`。
- 外部数据、旧脚本和第三方素材放入 `references/`。

## 完整检查

```powershell
yarn run check
```

`yarn run check` 会依次执行 lint、format check、测试、dev 构建和 prod 构建。Yarn Classic 自带同名 `yarn check` 命令，因此不得省略 `run`。新增目录或配置后，要确认该命令仍然覆盖关键文件。是否需要执行完整检查及 Playwright MCP 浏览器验证，按“验证分级”判断。
