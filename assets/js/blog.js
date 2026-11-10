/* 尤福金 · 个人档案 — 文章系统（浏览器端渲染 Markdown，零构建） */
(function () {
  "use strict";
  var POSTS_DIR = "../posts/";

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function fetchJson(url) {
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    });
  }

  function failHtml(err) {
    if (location.protocol === "file:") {
      return '<p class="error-state">当前是直接双击打开的（file:// 协议），浏览器禁止读取本地文章文件。<br>请在站点目录运行 <b>python3 -m http.server 8000</b>，然后访问 <b>http://localhost:8000</b>。</p>';
    }
    return '<p class="error-state">加载失败：' + escapeHtml(err.message) +
      "<br>请确认通过 HTTP 服务预览（python3 -m http.server），且站点根目录正确。</p>";
  }

  /* ---------- 文章列表 ---------- */
  function loadList() {
    var container = document.getElementById("post-list");
    fetchJson(POSTS_DIR + "posts.json").then(function (posts) {
      if (!Array.isArray(posts)) throw new Error("posts.json 格式应为数组");
      posts = posts.slice().sort(function (a, b) {
        return String(b.date || "").localeCompare(String(a.date || ""));
      });
      if (!posts.length) {
        container.innerHTML = '<p class="empty-state">NO RECORDS YET — 暂无文章，去 posts/ 目录添加第一篇吧。</p>';
        return;
      }
      container.innerHTML = posts.map(function (p, i) {
        var no = "FILE NO. A-" + String(posts.length - i).padStart(3, "0");
        var tags = (p.tags || []).map(function (t) {
          return '<span class="tag">' + escapeHtml(t) + "</span>";
        }).join("");
        return '<a class="file-card post-item" href="post.html?p=' + encodeURIComponent(p.file) + '">' +
          '<p class="file-no"><span>' + no + "</span><span>" + escapeHtml(p.date || "") + "</span></p>" +
          '<div class="post-head"><h3 class="post-title">' + escapeHtml(p.title || p.file) + "</h3></div>" +
          (p.summary ? '<p class="post-summary">' + escapeHtml(p.summary) + "</p>" : "") +
          (tags ? '<div class="post-tags">' + tags + "</div>" : "") +
          "</a>";
      }).join("");
    }).catch(function (err) {
      container.innerHTML = failHtml(err);
    });
  }

  /* ---------- 文章详情 ---------- */
  function loadPost() {
    var container = document.getElementById("post-content");
    var metaEl = document.getElementById("post-meta");
    var slug = new URLSearchParams(location.search).get("p");
    if (!slug || !/^[a-z0-9_-]+$/i.test(slug)) {
      container.innerHTML = '<p class="error-state">无效的文章地址。请从文章列表进入。</p>';
      return;
    }
    fetch(POSTS_DIR + slug + ".md").then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.text();
    }).then(function (md) {
      container.innerHTML = marked.parse(md);
      var h1 = container.querySelector("h1");
      if (h1) document.title = h1.textContent + " · 尤福金 · 个人档案";
      /* 从清单补全日期与标签 */
      return fetchJson(POSTS_DIR + "posts.json").then(function (posts) {
        var entry = (posts || []).find(function (p) { return p.file === slug; });
        if (entry) {
          var parts = [];
          if (entry.date) parts.push("DATE: " + entry.date);
          if (entry.tags && entry.tags.length) parts.push("TAGS: " + entry.tags.join(" / "));
          metaEl.textContent = parts.join(" · ");
        }
      }).catch(function () { /* 清单缺失不影响正文 */ });
    }).catch(function (err) {
      container.innerHTML = failHtml(err) + '<p class="error-state" style="padding-top:0;"><a href="index.html">← 返回文章列表</a></p>';
    });
  }

  if (document.getElementById("post-list")) loadList();
  if (document.getElementById("post-content")) loadPost();
})();
