const handler = createIdempotent(async (event) => {
  const body = JSON.parse(event.body || "{}");
  const query = body.query || "Hello, World!";

  // 本地股票数据
  const stockData = [
    { symbol: "00700.HK", name: "腾讯控股", price: 408.50, change: "+2.3%" },
    { symbol: "00706.HK", name: "唯品会", price: 36.20, change: "-1.8%" },
    { symbol: "01359.HK", name: "瑞声科技", price: 15.30, change: "+0.5%" },
    { symbol: "03690.HK", name: "美团", price: 145.60, change: "+3.1%" },
    { symbol: "09616.HK", name: "京东", price: 31.25, change: "-0.9%" },
    { symbol: "02358.HK", name: "百度", price: 105.80, change: "+1.2%" },
    { symbol: "01813.HK", name: "小米集团", price: 16.45, change: "+0.8%" },
    { symbol: "01211.HK", name: "中芯国际", price: 26.30, change: "-2.1%" },
    { symbol: "06030.HK", name: "平安银行", price: 18.75, change: "+0.3%" },
    { symbol: "06016.HK", name: "中国太保", price: 32.10, change: "+1.5%" }
  ];

  const response = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>响应页面</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
          }
          h1 { color: #333; }
          .input-group { margin-bottom: 20px; }
          input[type="text"] {
            padding: 10px;
            font-size: 16px;
            border: 1px solid #ddd;
            border-radius: 4px;
            width: 300px;
          }
          button {
            padding: 10px 20px;
            font-size: 16px;
            background-color: #007bff;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
          }
          button:hover { background-color: #0056b3; }
          .result {
            background-color: #f0f0f0;
            padding: 15px;
            border-radius: 4px;
            margin-top: 20px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
          }
          th, td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
          }
          th {
            background-color: #007bff;
            color: white;
          }
          tr:nth-child(even) {
            background-color: #f2f2f2;
          }
          .positive { color: green; font-weight: bold; }
          .negative { color: red; font-weight: bold; }
        </style>
      </head>
      <body>
        <h1>本地响应式搜索页面</h1>
        <div class="input-group">
          <input type="text" id="searchInput" value="${escapeHtml(query)}" placeholder="请输入搜索关键词">
          <button onclick="handleSubmit()">搜索</button>
        </div>
        
        <h2>股市行情</h2>
        <table>
          <thead>
            <tr>
              <th>代码</th>
              <th>名称</th>
              <th>价格</th>
              <th>涨跌幅</th>
            </tr>
          </thead>
          <tbody>
            ${stockData.map(stock => `
              <tr>
                <td>${stock.symbol}</td>
                <td>${stock.name}</td>
                <td>${stock.price}</td>
                <td class="${stock.change.startsWith('+') ? 'positive' : 'negative'}">${stock.change}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div id="result" class="result" style="display: none;"></div>

        <script>
          function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
          }

          function handleSubmit() {
            const input = document.getElementById('searchInput');
            const resultDiv = document.getElementById('result');
            const query = input.value;

            if (!query.trim()) {
              alert('请输入搜索内容');
              return;
            }

            // 显示加载中
            resultDiv.style.display = 'block';
            resultDiv.innerHTML = '<p>正在处理...</p>';

            // 使用 fetch 模拟本地响应
            fetch('/api/search', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query })
            })
              .then(res => res.json())
              .then(data => {
                resultDiv.innerHTML = '<h3>搜索结果：</h3><p>' + escapeHtml(data) + '</p>';
              })
              .catch(err => {
                resultDiv.innerHTML = '<p style="color: red;">错误：' + err + '</p>';
              });
          }

          // 按 Enter 键提交
          document.getElementById('searchInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleSubmit();
          });
        </script>
      </body>
    </html>
  `;