/**
 * src/data/cram/sf-agentforce-specialist.ts - the Agentforce Specialist cram sheet.
 *
 * GENERATED from the course curriculum module, then reviewed. Objective text is the
 * official exam-guide wording; each rule is the deciding fact the lessons teach for that
 * objective, and each trap is the misconception the exam prices. Keeping this next to the
 * lessons means a curriculum change cannot silently leave the sheet stale: regenerate it.
 *
 * The exam headline numbers that are NOT here (minutes, pass mark) live in exam-config.ts.
 */
import type { CramSheet } from "@/lib/cram-sheets";

export const sfAgentforceSpecialistCram: CramSheet = {
  series: "sf-agentforce-specialist",
  title: "Salesforce Certified Agentforce Specialist",
  examFacts: {
    scoredQuestions: 60,
    unscoredUpTo: 5,
    versionLabel: "Spring '26",
  },
  domains: [
    { domain: "Prompt Engineering", weightPct: 20, examDraw: 12 },
    { domain: "Data 360 Fundamentals", weightPct: 20, examDraw: 12 },
    { domain: "AI Agents", weightPct: 35, examDraw: 21 },
    { domain: "Testing, Deployment, and Maintenance", weightPct: 10, examDraw: 6 },
    { domain: "Governance and Observability", weightPct: 10, examDraw: 6 },
    { domain: "Multi-Agent Orchestration", weightPct: 5, examDraw: 3 },
  ],
  objectives: [
    // Prompt Engineering
    {
      id: "pe-1",
      domain: "Prompt Engineering",
      objective: "Given business requirements, identify when it's appropriate to use Prompt Builder.",
      rules: [
        "Compute the truth, then phrase it: a formula or Flow for the exact value, a prompt template for the words.",
      ],
      trap: "Believing you need Apex or a developer to use Prompt Builder. It is declarative: you pick a type, write instructions, and bind record data, so a coding requirement in an answer is the wrong tool.",
    },
    {
      id: "pe-2",
      domain: "Prompt Engineering",
      objective: "Identify access controls governing prompt templates.",
      rules: [
        "Two permissions and one gate: Manage to author, Execute to run, and activation to publish.",
        "The template is the same for everyone; the runner's access is what makes two runs differ.",
      ],
      trap: "Believing Execute Prompt Templates is enough to author a template. Execute only allows running an activated template; creating and editing needs Manage Prompt Templates, which the Manager permission set adds.",
    },
    {
      id: "pe-3",
      domain: "Prompt Engineering",
      objective: "Identify the considerations for using a prompt template type such as field generation and flex types.",
      rules: [
        "Where does the output go, and how many objects feed it? Those two questions pick the type.",
        "Destination first, inputs second: a field, an email, a summary, or open text decides the type before the objects veto it.",
      ],
      trap: "Believing the type can be changed after creation. The type is chosen when the template is created and fixes the binding and entry points, so a wrong type means rebuilding rather than adjusting a setting.",
    },
    {
      id: "pe-4",
      domain: "Prompt Engineering",
      objective: "Given a scenario, identify the appropriate grounding technique.",
      rules: [
        "Grounding is not dumping data; it is pulling the right data into the resolved prompt at run time.",
        "Name the job first: known field, computed value, semantic search, or quick library. The technique follows.",
      ],
      trap: "Believing grounding means feeding the model all your data. Grounding means pulling the specific, relevant data into the resolved prompt, so dumping the whole record or the whole library is a different failure, not grounding.",
    },
    {
      id: "pe-5",
      domain: "Prompt Engineering",
      objective: "Explain the process for creating, activating, and executing prompt templates.",
      rules: [
        "A template is a named, versioned asset: you create it, preview the resolved prompt, activate one version, then invoke it from a flow or an agent.",
        "Activation gates availability, not content: one active version at a time, immutable once active, switched only by activating another.",
      ],
      trap: "Believing a saved template is immediately usable. A template is inactive until you activate a version, and a template with no active version is unavailable to every consuming surface.",
    },
    {
      id: "pe-6",
      domain: "Prompt Engineering",
      objective: "Explain how to implement best practices for writing effective prompts.",
      rules: [
        "Say the task, supply the context, and name the output shape: specificity beats length every time.",
        "Structure, output shape, paired constraints, right context, worked examples: name the lever that maps to the defect you see.",
      ],
      trap: "Believing a longer prompt is a better prompt. Length is not quality; specifying the task, the context, and the output shape is what improves the answer, and padding the prompt with repeated data can make the response worse.",
    },
    {
      id: "pe-7",
      domain: "Prompt Engineering",
      objective: "Identify the security and privacy features of the Trust Layer.",
      rules: [
        "Name the six trust features by heart: zero data retention, secure data retrieval, data masking, prompt defense, toxicity scoring, and the audit trail.",
        "The trust boundary is the seam between the Salesforce gateway and the external model, and masking is disabled for agents, so design the prompt as if it will cross in the clear.",
      ],
      trap: "Believing the Trust Layer is a separate product you license. It is built into the platform, so an answer that says you buy, install, or subscribe to it describes the wrong thing.",
    },
    {
      id: "pe-8",
      domain: "Prompt Engineering",
      objective: "Explain how to manage and prevent specific models from being accessed.",
      rules: [
        "Three levers, three scopes: the provider toggle blocks a vendor org wide, hiding a configuration removes a model from the author's list, and the model option sets the reasoning engine default.",
        "Withdraw access only after you re-point every reference, and remember that hiding a model never stops a template that already uses it.",
      ],
      trap: "Believing hiding a configuration and disabling a provider are the same control. Hiding removes a model from Prompt Builder selection, while the provider toggle blocks the vendor's models org wide across agents, templates, and APIs.",
    },
    // Data 360 Fundamentals
    {
      id: "df-1",
      domain: "Data 360 Fundamentals",
      objective: "Explain the considerations of Agentforce Data Library and its concepts.",
      rules: [
        "A Data Library is the wiring and Data 360 is the engine: if you cannot name the data stream, search index and retriever it builds, you do not yet understand the library.",
        "Structured data rides a data stream into a DLO and then a DMO; unstructured data is referenced by a UDLO and modeled as a UDMO. Get that order right and the ingest questions answer themselves.",
        "The index holds the chunks, the retriever points at the index, and the prompt template calls the retriever. Keep those three roles separate and the pipeline questions stop being tricky.",
        "The library builder and the library user are different people with different permissions. When retrieval returns nothing, name the running user first, then check the data space, Data Cloud User and Prompt Template User grants.",
        "A healthy status card proves the pipeline built, not that the data is fresh. Freshness lives in the data stream schedule and the last index rebuild, so check those two before blaming the agent.",
      ],
      trap: "Believing an Agentforce Data Library is just another name for a Knowledge base. A library wraps Knowledge, uploaded files, web sources or a custom retriever, so an answer that says it only indexes Knowledge articles is wrong.",
    },
    {
      id: "df-2",
      domain: "Data 360 Fundamentals",
      objective: "Explain foundational concepts of Data 360 such as chunking, indexing, and retrievers.",
      rules: [
        "Chunking decides what units exist; every later retriever can only return the chunks chunking already created.",
        "Indexing is chunk, vectorize, store; if the embedding model changes, everything already stored is stale until you rebuild.",
        "The index stores the vectors, the retriever queries them; a saved but inactive retriever grounds nothing.",
        "Walk the hops in order: ingest, chunk, index, retrieve, generate, cite; fix the first hop that does not hold.",
        "Three signatures: chunking splits the answer, indexing hides it or serves it stale, retriever filters or mis-fields it; change one stage and re-test.",
      ],
      trap: "Believing a chunk is a fixed-size slice of characters. Chunking breaks content into meaningful passages such as paragraphs or sections, so an answer that describes it as an arbitrary byte or character cut is wrong.",
    },
    // AI Agents
    {
      id: "ag-1",
      domain: "AI Agents",
      objective: "Explain how an agent works and its basic building blocks of agent script.",
      rules: [
        "An agent is a router plus scoped subagents: classify, enter, resolve instructions, act, and respond.",
        "Logic first, prompt second: the model phrases the answer, but the script decides whether the work happened.",
      ],
      trap: "Believing a subagent is just a prompt. A subagent carries its own instructions, actions, and variable access, and routing decides which one runs, so a design that puts everything in one prompt misses the structure the exam tests.",
    },
    {
      id: "ag-2",
      domain: "AI Agents",
      objective: "Explain the components and benefits of hybrid reasoning, including how Agent Script functions in Canvas and Script View.",
      rules: [
        "Determinism where you can, judgment where you must: that sentence is hybrid reasoning.",
        "Two views, one file, one graph: pick the surface for the author, not for the agent.",
      ],
      trap: "Believing hybrid reasoning means two separate agents. It is one engine that executes deterministic nodes as code and invokes the model only where a prompt instruction sits.",
    },
    {
      id: "ag-3",
      domain: "AI Agents",
      objective: "Given a use case, manage deterministic behavior for the agent using mechanisms like filters, variables, and template expressions.",
      rules: [
        "A variable holds the fact, a filter uses it to expose or hide, a template expression renders it: same fact, three jobs.",
        "Gate with a filter, remember with a variable, render with a template expression: name the job and the mechanism is obvious.",
      ],
      trap: "Believing a prompt instruction can enforce a gate. Only an available when condition removes the action from the model's tool list; asking the model politely is a suggestion it may not follow.",
    },
    {
      id: "ag-4",
      domain: "AI Agents",
      objective: "Given a scenario, select and configure standard topics, custom topics, standard Agent actions, and custom Agent actions.",
      rules: [
        "A topic is a job and an action is a tool; write the classification so jobs stay distinct, and put the deterministic rules in the tool.",
        "The classification description picks the door and the action descriptions pick the tool; fix the layer that actually failed.",
      ],
      trap: "Believing deterministic business rules belong in topic instructions. Topic and action instructions are non-deterministic, so anything that must always behave the same belongs inside the action's Flow or Apex logic, not in the natural language.",
    },
    {
      id: "ag-5",
      domain: "AI Agents",
      objective: "Explain the process for connecting agents to various channels such as digital experience, email, voice, and Slack.",
      rules: [
        "The connection tells the agent which surface it is on, so channel support and agent type have to agree before you attach one.",
        "For every channel ask three things: who is the user, is there a live session, and what context travels; the mismatch is where agents break.",
      ],
      trap: "Believing any agent can connect to any channel. Channel support varies by agent type, so a connection that a service agent supports may not be available to an employee agent; check the connection's supported types first.",
    },
    {
      id: "ag-6",
      domain: "AI Agents",
      objective: "Explain the security context in which the agent is actually running, and how it impacts agent action execution.",
      rules: [
        "The agent never exceeds its running user, so name the running user first and let least privilege follow from it.",
        "The builder runs as you and production runs as the agent user, so trace the failure through the running user first, then the action's execution context.",
      ],
      trap: "Believing the agent bypasses Salesforce permissions. The agent acts under its running user and respects licenses, object permissions, field-level security, organization-wide defaults, and sharing, so it can never do more than that identity may do.",
    },
    {
      id: "ag-7",
      domain: "AI Agents",
      objective: "Given a scenario, identify when to use an Employee or Service agent.",
      rules: [
        "The running user decides the agent type, so read a scenario for who the conversation serves and what identity the agent acts under before you read it for channels.",
        "Context variables say who the user is, but the running user or the verification says what the agent can reach, so keep those two ideas apart when you read a scenario.",
        "Translate every scenario into audience and identity before you name a type, because the channel and the login are the two places the exam hides the audience.",
      ],
      trap: "Believing an Employee agent can serve anonymous website visitors. It runs as the logged-in user, so it needs an authenticated internal user, and an unauthenticated external audience belongs to a Service agent.",
    },
    {
      id: "ag-8",
      domain: "AI Agents",
      objective: "Given a scenario, identify when it's appropriate to use Agent API.",
      rules: [
        "Agent API is the program's door into the agent: fix the base URL at api.salesforce.com, pass the instance endpoint in the session, and let bypassUser decide whose access governs.",
        "Pick the session pattern from the interaction, pick the OAuth flow from the identity that must cross the boundary, and keep client credentials on the server.",
        "Ask two questions of any scenario: is the caller outside Salesforce, and is it a human surface or a system. The answers pick the channel, the Flow action, or Agent API.",
      ],
      trap: "Believing the Agent API base URL is your instance URL. It is always api.salesforce.com, and the instance endpoint belongs inside the start session payload instead.",
    },
    // Testing, Deployment, and Maintenance
    {
      id: "td-1",
      domain: "Testing, Deployment, and Maintenance",
      objective: "Given a scenario, test an agent using Testing Center.",
      rules: [
        "Mocked data for iterating, live data for sign-off: the mode you pick is the claim your result makes.",
        "A suite is a fence with a coverage boundary: what it passes is repeatable, and what it never sees is still unproven.",
      ],
      trap: "Believing a generated test set already contains conversation history. The history column arrives in the CSV template and is not factored into generated cases, so a multi-turn scenario needs the turns added by hand.",
    },
    {
      id: "td-2",
      domain: "Testing, Deployment, and Maintenance",
      objective: "Explain how Testing Center evaluations work.",
      rules: [
        "Assertions ask whether the agent did the expected thing, the judge asks how good the reply was: different questions, different evidence.",
        "Hold the suite still, change one thing, and read the columns: a regression is a case that moved, not a case that failed.",
      ],
      trap: "Believing every scorer returns a pass or a fail. Assertions do, the judge returns a score, latency returns milliseconds, and instruction adherence returns HIGH, LOW, or UNCERTAIN.",
    },
    {
      id: "td-3",
      domain: "Testing, Deployment, and Maintenance",
      objective: "Identify the considerations for deploying an agent from sandbox to production.",
      rules: [
        "Deploy the dependencies first and the agent last, and remember a green deploy is not a live agent until it is activated and its agent user is permissioned.",
        "The definition is portable and the environment is not: anything scoped to an org, such as the agent user, connections, records, sharing, and channels, is recreated rather than deployed.",
      ],
      trap: "Believing a successful deploy makes the agent live. Deployment places the metadata; the agent still has to be activated, and the agent user must be assigned and granted the permissions its actions need.",
    },
    {
      id: "td-4",
      domain: "Testing, Deployment, and Maintenance",
      objective: "Identify the considerations for deploying a template from sandbox to production.",
      rules: [
        "The template is the blueprint you can ship; the target org still builds the agent from it, complete with its own name, agent user, and channels.",
        "A template is a blueprint and a maintenance contract: reuse it when the structure fits and the dependencies exist, and rebuild when the agent type or the grounding model does not.",
      ],
      trap: "Believing you can package and deploy the agent directly. The agent itself cannot be packaged directly; you create an agent template, include the template in the package, and create a new agent from that template in the target org.",
    },
    // Governance and Observability
    {
      id: "go-1",
      domain: "Governance and Observability",
      objective: "Explain the process for managing and monitoring agents.",
      rules: [
        "Commit freezes the version, activation makes it live, and activating the next one retires the last.",
        "Turn on Session Tracing first; every monitoring surface is downstream of it.",
      ],
      trap: "Believing you can edit an agent that is live. The active version is a committed snapshot and cannot be edited, so you create a new version, change it, and activate that instead.",
    },
    {
      id: "go-2",
      domain: "Governance and Observability",
      objective: "Explain agent analytics and agent optimization.",
      rules: [
        "Effectiveness tells you whether the agent worked; Quality Scores tell you whether the answer was right.",
        "Read the aggregate first, then the trace: the trace tells you what happened, the breakdown tells you where to look.",
        "Ask what failed in the step list: wrong subagent means topics, weak answer means instructions, failed step means actions.",
      ],
      trap: "Believing Engagement Rate counts anyone who talked to the agent. A session is engaged only when the user received a reply tied to an agent-triggered action, so a conversation with no action fired is not engaged.",
    },
    // Multi-Agent Orchestration
    {
      id: "ma-1",
      domain: "Multi-Agent Orchestration",
      objective: "Given a scenario, determine whether a Multi Agent architecture is appropriate for scalability and control.",
      rules: [
        "A connected subagent is a whole agent, not a Topic: it thinks on its own, and only the orchestrator can hand a conversation to a human.",
        "Splitting buys scale and control across boundaries and domains, and it spends latency, per-turn cost, observability, and governance surface to get them.",
      ],
      trap: "Believing a connected subagent is a Subagent inside the orchestrator. A connected subagent is a full agent with its own reasoning loop and its own scope, while a Subagent, formerly a Topic, is a domain block inside one agent, so an answer that treats the two as the same construct is wrong.",
    },
    {
      id: "ma-2",
      domain: "Multi-Agent Orchestration",
      objective: "Explain the purpose of existing open standard multi-agent protocols such as MCP and A2A.",
      rules: [
        "If the remote thing is a tool, use MCP; if it is an agent that reasons, use A2A.",
        "MCP gives the agent new hands; A2A gives it a colleague. Tool and context exposure is MCP, peer delegation is A2A.",
      ],
      trap: "Believing MCP and A2A are Salesforce proprietary. Both are open standards, with MCP originally created by Anthropic and Salesforce a founding member of the A2A effort alongside Google, Microsoft, SAP, and AWS, so an answer that calls either one Salesforce-only is wrong.",
    },
  ],
};
