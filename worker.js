// worker.js - 完整 Worker 代码
const BACKEND_URL = 'https://qw-esports-backend.vercel.app/api';

const HTML_CONTENT = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <title>QW电竞 · 护航平台</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css" />
    <style>
        /* 这里粘贴你 index.html 里完整的 CSS 样式 */
        /* 为了节省篇幅，请从你的 index.html 中复制所有样式 */
    </style>
</head>
<body>
    <!-- 这里粘贴你 index.html 里完整的 HTML 结构 -->
    <!-- 包括所有 div、按钮、导航等 -->

    <script>
        const API_URL = '/api';
        // 这里粘贴你 index.html 里完整的 JavaScript 代码
        // 包括所有登录、注册、渲染等函数
    </script>
</body>
</html>`;

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api')) {
      const targetUrl = BACKEND_URL + url.pathname + url.search;
      const newRequest = new Request(targetUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });
      const response = await fetch(newRequest);
      const newResponse = new Response(response.body, {
        status: response.status,
        headers: response.headers,
      });
      newResponse.headers.set('Access-Control-Allow-Origin', '*');
      return newResponse;
    }
    return new Response(HTML_CONTENT, {
      headers: { 'Content-Type': 'text/html;charset=UTF-8' },
    });
  },
};