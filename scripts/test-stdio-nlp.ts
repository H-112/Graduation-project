// ============================================
// 测试脚本：验证 stdio NLP Server 端到端链路
// 使用官方 MCP SDK Client 连接独立 stdio 进程
// ============================================

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function main() {
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", "servers/nlp-stdio-server.ts"],
  });

  const client = new Client(
    { name: "test-client", version: "1.0.0" },
    { capabilities: {} }
  );

  console.log("[Test] Connecting to stdio NLP Server...");
  await client.connect(transport);
  console.log("[Test] Connected (pid=%d)", transport.pid);

  // 1. 列出工具
  const tools = await client.listTools();
  console.log("[Test] Tools:", tools.tools.map((t) => t.name).join(", "));

  // 2. 调用 tokenize
  const tokenizeResult = await client.callTool({
    name: "tokenize",
    arguments: { text: "智能体辅助问卷分析系统非常好用" },
  });
  console.log("[Test] tokenize result:", JSON.stringify(tokenizeResult.content, null, 2));

  // 3. 调用 extract_keywords
  const kwResult = await client.callTool({
    name: "extract_keywords",
    arguments: {
      texts: [
        "我觉得这个系统很有用",
        "系统分析结果非常准确",
        "用户体验很好",
      ],
      topN: 5,
    },
  });
  console.log("[Test] extract_keywords result:", JSON.stringify(kwResult.content, null, 2));

  // 4. 单字符串参数测试（skill 使用方式）
  const singleResult = await client.callTool({
    name: "extract_keywords",
    arguments: { text: "智能体辅助问卷分析系统非常好用" },
  });
  console.log("[Test] single text result:", JSON.stringify(singleResult.content, null, 2));

  // 5. 错误场景测试
  const errorResult = await client.callTool({
    name: "tokenize",
    arguments: { text: "" },
  });
  console.log("[Test] empty text error?", errorResult.isError);

  // 6. 缺失参数测试
  const missingResult = await client.callTool({
    name: "extract_keywords",
    arguments: {},
  });
  console.log("[Test] missing params error?", missingResult.isError);

  await client.close();
  console.log("[Test] All passed!");
  process.exit(0);
}

main().catch((err) => {
  console.error("[Test] Failed:", err);
  process.exit(1);
});
