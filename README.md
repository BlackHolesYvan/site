# 尤福金 · 个人档案

暖阳橙 Solar 风格的个人静态网站：主页 + 技术博客 + 简历。纯 HTML/CSS/JS，零构建，可直接部署 GitHub Pages。

> 头像替换：把你的头像图片放到 `assets/avatar.png` 即可（首页橙色圆形头像位），未提供时显示「尤」字占位。

## 目录结构

```
index.html               个人主页（默认）
resume.html              简历
articles/index.html      文章列表
articles/post.html       文章详情（?p=文件名，不含扩展名）
posts/posts.json         文章清单（手动维护）
posts/*.md               Markdown 文章源文件
assets/css/site.css      共享主题
assets/js/blog.js        文章列表/详情加载逻辑
assets/vendor/marked.min.js  本地 Markdown 渲染器
resume.md                简历原始文本（存档）
```

## 本地预览

文章通过 fetch 加载，必须走 HTTP（双击 file:// 无法加载列表，属正常）：

```bash
cd /root/code/site
python3 -m http.server 8000
# 打开 http://localhost:8000
```

## 发布新文章（两步）

1. 在 `posts/` 下新建 `my-post.md`（文件名只用小写字母、数字、连字符）
2. 在 `posts/posts.json` 数组中加一条：

```json
{
  "file": "my-post",
  "title": "文章标题",
  "date": "2026-11-10",
  "summary": "一句话摘要",
  "tags": ["Go", "架构"]
}
```

列表自动按日期倒序展示，点击即进入 `articles/post.html?p=my-post` 渲染全文。支持标题、列表、代码块、引用、表格、链接等常用 Markdown 语法。

## 部署

推送到 GitHub 仓库后，Settings → Pages → 选择 `main` 分支根目录即可。
