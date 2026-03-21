/**
 * MCP Tool Definitions for Pajama Hive
 *
 * These are exposed via an MCP server so that Claude, Cursor, Windsurf,
 * and other AI tools can orchestrate Hive agents, workflows, and knowledge bases.
 *
 * Each tool maps to an SDK method. The MCP server calls the SDK which calls the API.
 */

export const HIVE_MCP_TOOLS = [
  {
    name: 'hive_agent_invoke',
    description: 'Invoke a Pajama Hive AI agent with a message and get a response. The agent uses its configured LLM, system prompt, knowledge bases, and plugins.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agent_id: { type: 'string', description: 'The agent ID to invoke' },
        message: { type: 'string', description: 'The message to send to the agent' },
      },
      required: ['agent_id', 'message'],
    },
  },
  {
    name: 'hive_agent_list',
    description: 'List all AI agents in the workspace.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID (optional, uses default)' },
      },
    },
  },
  {
    name: 'hive_agent_create',
    description: 'Create a new AI agent with a name and optional system prompt.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Agent name' },
        system_prompt: { type: 'string', description: 'System prompt for the agent' },
        workspace_id: { type: 'string', description: 'Workspace ID' },
      },
      required: ['name'],
    },
  },
  {
    name: 'hive_workflow_run',
    description: 'Run a Pajama Hive workflow with input data. Returns the workflow execution result including node traces.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        workflow_id: { type: 'string', description: 'The workflow ID to run' },
        input: { type: 'object', description: 'Input data for the workflow' },
      },
      required: ['workflow_id'],
    },
  },
  {
    name: 'hive_workflow_list',
    description: 'List all workflows in the workspace.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
      },
    },
  },
  {
    name: 'hive_knowledge_search',
    description: 'Search a Pajama Hive knowledge base using semantic and keyword search. Returns relevant document chunks.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        knowledge_base_id: { type: 'string', description: 'The knowledge base ID to search' },
        query: { type: 'string', description: 'Search query' },
        mode: { type: 'string', enum: ['hybrid', 'vector', 'keyword'], description: 'Search mode (default: hybrid)' },
        limit: { type: 'number', description: 'Max results (default: 5)' },
      },
      required: ['knowledge_base_id', 'query'],
    },
  },
  {
    name: 'hive_knowledge_list',
    description: 'List all knowledge bases in the workspace.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
      },
    },
  },
  {
    name: 'hive_knowledge_upload',
    description: 'Upload a text document to a knowledge base. The document is automatically chunked and indexed.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        knowledge_base_id: { type: 'string', description: 'Knowledge base ID' },
        name: { type: 'string', description: 'Document name' },
        content: { type: 'string', description: 'Document text content' },
      },
      required: ['knowledge_base_id', 'name', 'content'],
    },
  },
  {
    name: 'hive_chat',
    description: 'Send a message in a Pajama Hive conversation and get the AI response. Creates a conversation if needed.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        message: { type: 'string', description: 'Message to send' },
        conversation_id: { type: 'string', description: 'Existing conversation ID (optional)' },
        agent_id: { type: 'string', description: 'Agent ID to chat with (optional)' },
      },
      required: ['message'],
    },
  },
  {
    name: 'hive_plugin_execute',
    description: 'Execute a plugin tool with input data.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tool_id: { type: 'string', description: 'Plugin tool ID' },
        input: { type: 'object', description: 'Input data for the tool' },
      },
      required: ['tool_id'],
    },
  },
  {
    name: 'hive_prompt_render',
    description: 'Render a prompt template with variables.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        prompt_id: { type: 'string', description: 'Prompt template ID' },
        variables: { type: 'object', description: 'Template variables' },
      },
      required: ['prompt_id', 'variables'],
    },
  },
  {
    name: 'hive_database_query',
    description: 'Query a user database table using natural language (NL2SQL).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        table_id: { type: 'string', description: 'Table ID' },
        query: { type: 'string', description: 'Natural language query' },
      },
      required: ['table_id', 'query'],
    },
  },
];
