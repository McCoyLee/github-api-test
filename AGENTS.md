# AGENTS.md

> 给 AI 看的项目说明。修改本仓库时遵循以下约定。

## 项目类型

**静态网页**，HTML + CSS + JS 三件套，无构建步骤。

## 文件结构

- `index.html` — 入口页
- `style.css` — 全局样式（CSS 变量定义在 `:root`）
- `main.js` — 可选交互逻辑
- `.github/workflows/pages.yml` — 自动部署到 GitHub Pages

## 修改约定

1. 保持三文件结构，**不要引入构建工具**（webpack/vite/parcel 等）
2. 不要引入外部 CDN 框架，除非用户明确要求
3. CSS 优先用 `:root` 里已定义的变量；新增颜色也定义成变量
4. 不要破坏 `pages.yml`（除非用户明确要求）
5. 任何修改完后，告诉用户合并 PR 后 1–2 分钟即可在 Pages URL 看到效果

## 部署

push 到 `main` 自动触发 `pages.yml`，部署到 `https://<owner>.github.io/<repo>/`。
首次启用需要用户在仓库 Settings → Pages → Source 选 "GitHub Actions"。
