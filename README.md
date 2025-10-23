# 本地离线记账（部署到 GitHub Pages）

## 一键部署步骤
1. 在 GitHub 新建一个 **Public** 仓库（名称随意，例如 `my-budget-app`）。
2. 把此项目推送上去：
   ```bash
   git init
   git add .
   git commit -m "init"
   git branch -M main
   git remote add origin https://github.com/<你的用户名>/<你的仓库名>.git
   git push -u origin main
   ```
3. 打开 GitHub 仓库页面 → **Settings → Pages**：
   - 在 *Build and deployment* 里把 **Source** 设置为 **GitHub Actions**（默认即可）。
4. 首次推送后，**Actions** 会自动运行 `Deploy to GitHub Pages` 工作流，完成后在 **Settings → Pages** 处会显示你的访问地址：  
   `https://<你的用户名>.github.io/<你的仓库名>/`

> 本项目的 `vite.config.js` 会在 GitHub Actions 环境下自动使用 `/<仓库名>/` 作为 `base`，因此 **无需手动修改** 路径。

## 本地开发
```bash
npm install
npm run dev
```
