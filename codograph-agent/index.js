/**
 * CodoGraph Agent — CLI Runner & Entrypoint.
 *
 * Demonstrates the 6 tools and runs the Deep Agent over repository architecture queries.
 */
import 'dotenv/config';
import { createCodoGraphAgent } from './agent.js';
import { allAgentTools } from './tools/index.js';

console.log('🤖 CodoGraph Deep Agent — Architecture Query Service');
console.log(`📦 Loaded ${allAgentTools.length} graph tools:`);
allAgentTools.forEach((t) => console.log(`  - ${t.name}: ${t.description.slice(0, 60)}...`));

async function main() {
  const agent = await createCodoGraphAgent();

  const query =
    process.argv.slice(2).join(' ') ||
    'where is authentication handled?';

  console.log(`\n💬 Query: "${query}"\n`);
  console.log('⏳ Looking up graph relationships...\n');

  const result = await agent.invoke({
    messages: [{ role: 'user', content: query }],
  });

  const lastMessage = result.messages[result.messages.length - 1];
  console.log('📝 Answer:\n');
  console.log(lastMessage.content);
}

main().catch((err) => {
  console.error('[CodoGraph Agent Error]:', err);
  process.exit(1);
});
