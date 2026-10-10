# MCP 客户端配置

把仓库根目录的 [`mcp-config.example.json`](../mcp-config.example.json) 复制到你的 MCP 客户端配置位置，
并把 `${MCD_MCP_TOKEN}` 替换为你自己的 Token（或由客户端读取环境变量）。

```json
{
  "mcpServers": {
    "mcd-mcp": {
      "type": "streamablehttp",
      "url": "https://mcp.mcd.cn",
      "headers": {
        "Authorization": "Bearer ${MCD_MCP_TOKEN}"
      }
    }
  }
}
```

要点：

- 协议：`streamablehttp`；地址：`https://mcp.mcd.cn`；
- 鉴权：`Authorization: Bearer <token>`；
- **示例文件里只有占位符，不要往里填真实 Token**；
- 本项目的后端自己也是 MCP 客户端，Token 从 `apps/server/.env` 读取（该文件已被 `.gitignore` 忽略），
  前端永远拿不到 Token。

Token 申请：https://open.mcd.cn/mcp
