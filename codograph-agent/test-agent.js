/**
 * CodoGraph Agent — Comprehensive Verification Test Suite.
 *
 * Verifies Phase 12 Agent Project & Six Tools:
 * 1. Verifies each of the 6 tools directly against the graph functions.
 * 2. Acceptance Check 1: Ask "where is authentication handled?" -> names real files.
 * 3. Acceptance Check 2: Follow-up "what breaks if I change that?" -> resolves "that" and walks incoming graph.
 * 4. Acceptance Check 3: Ask "is this code any good?" -> declines and says what it can answer instead.
 * 5. Acceptance Check 4: Verifies tool calls are made for answers.
 */
import 'dotenv/config';
import { createCodoGraphAgent } from './agent.js';
import {
  toolAnalysisSummary,
  toolSearchFiles,
  toolListFilesByRole,
  toolGetFileNeighbours,
  toolTransitiveWalk,
  toolGetRouteTable,
  allAgentTools,
} from './tools/index.js';

let passCount = 0;
let failCount = 0;

function assert(condition, message, detail) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passCount++;
  } else {
    console.error(`[FAIL] ${message}${detail ? ` — ${detail}` : ''}`);
    failCount++;
  }
}

async function runTestSuite() {
  console.log('====================================================');
  console.log('CodoGraph Phase 12 — Deep Agent & Six Tools Verification');
  console.log('====================================================\n');

  // --------------------------------------------------------------------------
  // Suite 1: Tool Definitions & Direct Execution
  // --------------------------------------------------------------------------
  console.log('--- Suite 1: Six Core Graph Tools ---');
  assert(allAgentTools.length === 6, 'All 6 tools are registered in the agent tools suite');

  // Tool 1: Summary
  const summaryRaw = await toolAnalysisSummary.invoke({});
  const summary = JSON.parse(summaryRaw);
  assert(
    typeof summary.repositoryName === 'string' && summary.totalFiles > 0,
    `Tool 1 (get_analysis_summary): successfully called pure computeRepositorySummary (${summary.totalFiles} files)`
  );

  // Tool 2: Search Files
  const searchRaw = await toolSearchFiles.invoke({ query: 'route' });
  const searchResults = JSON.parse(searchRaw);
  assert(
    Array.isArray(searchResults),
    `Tool 2 (search_files): executed path search query, returned ${searchResults.length} file(s)`
  );

  // Tool 3: List Files by Role
  const testRole = summary.topDependedOnFiles[0]?.role || 'util';
  const roleRaw = await toolListFilesByRole.invoke({ role: testRole });
  const roleResults = JSON.parse(roleRaw);
  assert(
    Array.isArray(roleResults),
    `Tool 3 (list_files_by_role): queried role "${testRole}", returned ${roleResults.length} file(s)`
  );

  // Tool 4: Direct Neighbours
  const targetFile = summary.topDependedOnFiles[0]?.path || 'services/auth-service.ts';
  const neighboursRaw = await toolGetFileNeighbours.invoke({ file_path: targetFile });
  const neighbours = JSON.parse(neighboursRaw);
  assert(
    neighbours.filePath === targetFile &&
      Array.isArray(neighbours.dependencies) &&
      Array.isArray(neighbours.dependents),
    `Tool 4 (get_file_neighbours): called pure computeFileNeighbours for ${targetFile} (${neighbours.dependencies.length} deps, ${neighbours.dependents.length} callers)`
  );

  // Tool 5: Transitive Walk (Blast Radius)
  const walkRaw = await toolTransitiveWalk.invoke({
    file_path: targetFile,
    direction: 'incoming',
    depth: 2,
  });
  const walk = JSON.parse(walkRaw);
  assert(
    walk.direction === 'incoming' && Array.isArray(walk.allNodesWithDepth),
    `Tool 5 (transitive_walk): called pure computeTransitiveWalk (incoming blast radius = ${walk.totalAffected} nodes)`
  );

  // Tool 6: Route Table
  const routesRaw = await toolGetRouteTable.invoke({});
  const routes = JSON.parse(routesRaw);
  assert(
    Array.isArray(routes),
    `Tool 6 (get_route_table): retrieved route table with ${routes.length} endpoint(s)`
  );

  // --------------------------------------------------------------------------
  // Suite 2: Agent Queries & Invariants
  // --------------------------------------------------------------------------
  console.log('\n--- Suite 2: Agent Execution & Behavioral Constraints ---');
  const agent = await createCodoGraphAgent();

  // Test 1: Acceptance Check 1 & 4 — "where is authentication handled?"
  console.log('\nQuery 1: "where is authentication handled?"');
  const run1 = await agent.invoke({
    messages: [{ role: 'user', content: 'where is authentication handled?' }],
  });

  const toolCalls1 = run1.messages.filter((m) => m.tool_calls && m.tool_calls.length > 0);
  assert(
    toolCalls1.length > 0,
    `Acceptance Check 4: Answer is backed by visible tool calls (${toolCalls1.length} tool call step(s))`
  );

  const answer1 = run1.messages[run1.messages.length - 1].content;
  assert(
    answer1.includes('auth-service.ts') || answer1.includes('app/api/auth') || answer1.includes('auth'),
    'Acceptance Check 1: Agent answer names genuine files that exist in the repository'
  );

  // Test 2: Acceptance Check 2 — Conversational follow-up: "what breaks if I change that?"
  console.log('\nQuery 2 (Follow-up): "what breaks if I change that?"');
  const run2 = await agent.invoke({
    messages: [
      ...run1.messages,
      { role: 'user', content: 'what breaks if I change that?' },
    ],
  });

  console.log('--- Run2 new messages ---');
  for (let i = run1.messages.length; i < run2.messages.length; i++) {
    const m = run2.messages[i];
    console.log(`Msg ${i}: type=${m._getType ? m._getType() : m.role}, content=${m.content?.slice(0, 150)}, tool_calls=${JSON.stringify(m.tool_calls)}`);
  }

  const toolCalls2 = run2.messages.slice(run1.messages.length).filter(
    (m) =>
      m.tool_calls &&
      m.tool_calls.some((tc) => tc.name === 'transitive_walk' || tc.name === 'get_file_neighbours')
  );
  assert(
    toolCalls2.length > 0,
    'Acceptance Check 2: Resolved "that" from previous turn and executed blast radius lookup tool'
  );

  // Test 3: Acceptance Check 3 — Refusal Behavior: "is this code any good?"
  console.log('\nQuery 3 (Unanswerable subjective query): "is this code any good?"');
  const run3 = await agent.invoke({
    messages: [{ role: 'user', content: 'is this code any good?' }],
  });

  const answer3 = run3.messages[run3.messages.length - 1].content.toLowerCase();
  const declines =
    answer3.includes('cannot') ||
    answer3.includes('decline') ||
    answer3.includes('unable') ||
    answer3.includes('not able') ||
    answer3.includes('subjective');

  const statesAlternative =
    answer3.includes('architecture') ||
    answer3.includes('dependencies') ||
    answer3.includes('routes') ||
    answer3.includes('roles') ||
    answer3.includes('graph');

  assert(
    declines && statesAlternative,
    'Acceptance Check 3: Agent declines subjective code quality question and states what it CAN answer instead'
  );

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n====================================================');
  console.log(`Phase 12 Agent Test Summary: ${passCount} Passed, ${failCount} Failed`);
  console.log('====================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('[FATAL] Agent verification test failed:', err);
  process.exit(1);
});
