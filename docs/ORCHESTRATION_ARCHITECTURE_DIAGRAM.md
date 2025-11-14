# Intelligent Search Orchestration - Architecture Diagrams

## System Overview

```mermaid
graph TB
    subgraph "User Interface"
        UI[User Query Input]
        Settings[Settings Panel]
        Metrics[Metrics Dashboard]
    end

    subgraph "Redux Store"
        Config[Orchestration Config]
        MetricsStore[Metrics Store]
    end

    subgraph "Core Logic"
        Plugin[SearchOrchestrationPlugin]
        OrcService[OrchestrationService]
        IntentAnalysis[Intent Analysis]
    end

    subgraph "AI Models"
        OrcModel[Orchestration Model<br/>gpt-4o-mini, claude-haiku, etc.]
        AssistantModel[Assistant's Model]
        MainModel[Main Conversation Model]
    end

    subgraph "Tools"
        WebSearch[Web Search Tool]
        KBSearch[Knowledge Base Search]
        MemSearch[Memory Search]
    end

    UI -->|Query| Plugin
    Settings -->|Configure| Config
    Config -->|Read| OrcService
    Plugin -->|Get Model| OrcService
    OrcService -->|Return| OrcModel
    OrcService -.->|Fallback| AssistantModel
    OrcModel -->|Analyze Intent| IntentAnalysis
    IntentAnalysis -->|Add Tools| WebSearch
    IntentAnalysis -->|Add Tools| KBSearch
    IntentAnalysis -->|Add Tools| MemSearch
    Plugin -->|Track| MetricsStore
    MetricsStore -->|Display| Metrics
    Plugin -->|Execute| MainModel
```

## Detailed Flow: Query Processing

```mermaid
sequenceDiagram
    participant User
    participant Plugin as SearchOrchestrationPlugin
    participant OrcSvc as OrchestrationService
    participant Redux as Redux Store
    participant OrcModel as Orchestration Model
    participant Tools as Search Tools
    participant MainModel as Main LLM

    User->>Plugin: Submit query
    
    Note over Plugin: Step 1: Get orchestration model
    Plugin->>OrcSvc: getOrchestrationModel(assistant.model)
    OrcSvc->>Redux: Get config
    Redux-->>OrcSvc: orchestrationModel config
    
    alt Orchestration Enabled & Model Valid
        OrcSvc-->>Plugin: { model: OrcModel, source: 'orchestration' }
    else Fallback to Assistant
        OrcSvc-->>Plugin: { model: AssistantModel, source: 'assistant' }
    else Skip Analysis
        OrcSvc-->>Plugin: { skipIntentAnalysis: true, source: 'fallback' }
    end

    alt Intent Analysis Needed
        Note over Plugin: Step 2: Analyze intent
        Plugin->>OrcModel: generateText(intent prompt)
        OrcModel-->>Plugin: XML structured result
        Plugin->>Plugin: extractInfoFromXML()
        
        Note over Plugin: Step 3: Add tools based on intent
        alt Web Search Needed
            Plugin->>Tools: Add webSearchTool with keywords
        end
        alt Knowledge Search Needed
            Plugin->>Tools: Add knowledgeSearchTool with rewrite
        end
        alt Memory Search Needed
            Plugin->>Tools: Add memorySearchTool
        end
    else Skip Analysis (Fallback)
        Note over Plugin: Add all tools with raw query
        Plugin->>Tools: Add all enabled tools
    end

    Note over Plugin: Step 4: Execute main LLM
    Plugin->>MainModel: Generate response with tools
    MainModel->>Tools: Call tools as needed
    Tools-->>MainModel: Tool results
    MainModel-->>Plugin: Final response
    
    Note over Plugin: Step 5: Track metrics
    Plugin->>Redux: dispatch(addMetric)
    
    Plugin-->>User: Display response
```

## Fallback Hierarchy

```mermaid
graph TD
    Start[User Query] --> CheckEnabled{Orchestration<br/>Enabled?}
    
    CheckEnabled -->|No| Fallback3[Skip Intent Analysis<br/>Always-On Retrieval]
    CheckEnabled -->|Yes| CheckOrchModel{Orchestration<br/>Model<br/>Configured?}
    
    CheckOrchModel -->|No| CheckFallback{Fallback to<br/>Assistant?}
    CheckOrchModel -->|Yes| CheckOrchKey{Provider<br/>Has API Key?}
    
    CheckOrchKey -->|Yes| UseOrch[✅ Use Orchestration Model<br/>Source: 'orchestration']
    CheckOrchKey -->|No| CheckFallback
    
    CheckFallback -->|No| Fallback3
    CheckFallback -->|Yes| CheckAssistModel{Assistant<br/>Model Valid?}
    
    CheckAssistModel -->|Yes| CheckAssistKey{Provider<br/>Has API Key?}
    CheckAssistModel -->|No| Fallback3
    
    CheckAssistKey -->|Yes| UseAssist[⚠️ Use Assistant Model<br/>Source: 'assistant']
    CheckAssistKey -->|No| Fallback3
    
    UseOrch --> IntentAnalysis[Perform Intent Analysis]
    UseAssist --> IntentAnalysis
    Fallback3 --> AlwaysOn[Use Raw Query<br/>for All Enabled Tools]
    
    IntentAnalysis --> AddTools[Selectively Add Tools<br/>Based on Analysis]
    AlwaysOn --> AddAllTools[Add All Enabled Tools]
    
    AddTools --> Execute[Execute Main LLM]
    AddAllTools --> Execute
    
    Execute --> Response[Return Response to User]
    
    style UseOrch fill:#52c41a,color:#fff
    style UseAssist fill:#faad14,color:#fff
    style Fallback3 fill:#ff4d4f,color:#fff
```

## Data Flow: Settings to Execution

```mermaid
graph LR
    subgraph "Configuration Layer"
        UI[Settings UI]
        Redux[Redux Store]
    end
    
    subgraph "Service Layer"
        OrcSvc[OrchestrationService]
        ProvSvc[ProviderService]
    end
    
    subgraph "Execution Layer"
        Plugin[SearchOrchestrationPlugin]
        AICore[AI Core]
    end
    
    subgraph "Model Layer"
        Provider[Provider API]
        LLM[Language Model]
    end

    UI -->|dispatch action| Redux
    Redux -->|persist| LocalStorage[(Local Storage)]
    
    Plugin -->|getOrchestrationModel| OrcSvc
    OrcSvc -->|read config| Redux
    OrcSvc -->|getProviderByModel| ProvSvc
    ProvSvc -->|check API key| Provider
    
    OrcSvc -->|createModelInstance| AICore
    AICore -->|initialize| LLM
    Plugin -->|generateText| LLM
```

## Metrics Tracking Flow

```mermaid
graph TD
    Start[Intent Analysis Starts] --> StartTimer[Record Start Time]
    
    StartTimer --> TryAnalysis{Execute<br/>Intent Analysis}
    
    TryAnalysis -->|Success| CalcLatency[Calculate Latency]
    TryAnalysis -->|Error| CaptureError[Capture Error]
    
    CalcLatency --> CreateMetric[Create Metric Object]
    CaptureError --> CreateMetric
    
    CreateMetric --> MetricData["Metric Data:<br/>- timestamp<br/>- requestId<br/>- source<br/>- modelId<br/>- latency<br/>- success<br/>- error message"]
    
    MetricData --> Dispatch[dispatch addMetric]
    
    Dispatch --> Redux[Redux Store]
    
    Redux --> UpdateSummary[Update Summary Stats]
    
    UpdateSummary --> Stats["Calculate:<br/>- Total queries<br/>- Source distribution<br/>- Success rate<br/>- Avg latency<br/>- Cost savings"]
    
    Stats --> LimitSize{Metrics > 1000?}
    
    LimitSize -->|Yes| Trim[Keep Last 1000]
    LimitSize -->|No| Store[Store in Memory]
    
    Trim --> Store
    Store --> Display[Metrics Dashboard]
    
    Display --> UserView[User Views Metrics]
```

## Component Architecture

```mermaid
graph TB
    subgraph "Pages"
        SettingsPage[SettingsPage.tsx]
    end

    subgraph "Settings Components"
        OrcSettings[OrchestrationSettings.tsx]
        OrcMetrics[OrchestrationMetrics.tsx]
    end

    subgraph "Redux Slices"
        SettingsSlice[settings.ts]
        MetricsSlice[orchestrationMetrics.ts]
    end

    subgraph "Services"
        OrcService[OrchestrationService.ts]
        ProvService[ProviderService.ts]
        AssistService[AssistantService.ts]
    end

    subgraph "Plugins"
        Plugin[searchOrchestrationPlugin.ts]
    end

    subgraph "Tools"
        WebTool[WebSearchTool.ts]
        KBTool[KnowledgeSearchTool.ts]
        MemTool[MemorySearchTool.ts]
    end

    SettingsPage --> OrcSettings
    SettingsPage --> OrcMetrics
    
    OrcSettings --> SettingsSlice
    OrcMetrics --> MetricsSlice
    
    Plugin --> OrcService
    Plugin --> MetricsSlice
    
    OrcService --> SettingsSlice
    OrcService --> ProvService
    OrcService --> AssistService
    
    Plugin --> WebTool
    Plugin --> KBTool
    Plugin --> MemTool
```

## Performance Optimization Flow (Phase 4)

```mermaid
graph TD
    Query[User Query] --> CheckCache{Check<br/>Intent Cache}
    
    CheckCache -->|Hit| UseCached[Use Cached Intent]
    CheckCache -->|Miss| CheckPattern{Check<br/>Pattern Library}
    
    CheckPattern -->|Match| SkipAnalysis[Skip Analysis<br/>Use Pattern Result]
    CheckPattern -->|No Match| DoAnalysis[Perform Intent Analysis]
    
    DoAnalysis --> UseStreaming{Streaming<br/>Enabled?}
    
    UseStreaming -->|Yes| Stream[streamText with<br/>Incremental Parsing]
    UseStreaming -->|No| Standard[generateText]
    
    Stream --> EarlyReturn{Valid Result<br/>Found Early?}
    EarlyReturn -->|Yes| Return[Return Early]
    EarlyReturn -->|No| Continue[Continue Streaming]
    
    Standard --> ParseResult[Parse Complete Result]
    Continue --> ParseResult
    Return --> CacheResult[Cache Result]
    ParseResult --> CacheResult
    
    UseCached --> Execute[Execute with Tools]
    SkipAnalysis --> Execute
    CacheResult --> Execute
    
    Execute --> Response[Return Response]
    
    style UseCached fill:#52c41a,color:#fff
    style SkipAnalysis fill:#52c41a,color:#fff
    style Return fill:#52c41a,color:#fff
```

## Error Handling & Recovery

```mermaid
graph TD
    Start[Intent Analysis Attempt] --> Try{Execute}
    
    Try -->|Success| Success[Return Intent Result]
    Try -->|Timeout| Timeout[Timeout After 5s]
    Try -->|Network Error| NetErr[Network Error]
    Try -->|Parse Error| ParseErr[XML Parse Error]
    Try -->|Rate Limit| RateErr[Rate Limit Hit]
    Try -->|Auth Error| AuthErr[Auth Error]
    
    Timeout --> LogWarn1[Log Warning]
    NetErr --> LogWarn2[Log Warning]
    ParseErr --> LogWarn3[Log Warning]
    RateErr --> LogWarn4[Log Warning]
    AuthErr --> LogError[Log Error]
    
    LogWarn1 --> Fallback[Use Fallback Result]
    LogWarn2 --> Fallback
    LogWarn3 --> TryRegex{Try Regex<br/>Extraction?}
    LogWarn4 --> Backoff[Exponential Backoff]
    LogError --> Fallback
    
    TryRegex -->|Success| PartialResult[Use Partial Result]
    TryRegex -->|Fail| Fallback
    
    Backoff --> Retry{Retry<br/>Count < 3?}
    Retry -->|Yes| Try
    Retry -->|No| Fallback
    
    Success --> TrackSuccess[Track Success Metric]
    Fallback --> TrackFail[Track Failure Metric]
    PartialResult --> TrackPartial[Track Partial Success]
    
    TrackSuccess --> Continue[Continue with Intent]
    TrackFail --> Continue
    TrackPartial --> Continue
    
    Continue --> MainLLM[Execute Main LLM]
```

## Cost Comparison: With vs Without Orchestration

```mermaid
graph LR
    subgraph "Without Orchestration (Current)"
        Q1[Query] --> A1[Always Retrieve]
        A1 --> W1[Web Search API $0.03]
        A1 --> K1[KB Embedding $0.01]
        A1 --> G1[Generation $0.04]
        W1 --> T1[Total: $0.08]
        K1 --> T1
        G1 --> T1
    end
    
    subgraph "With Orchestration (Intelligent)"
        Q2[Query] --> I2[Intent Analysis $0.0002]
        I2 --> D2{Need<br/>Retrieval?}
        D2 -->|Yes 60%| R2[Retrieve $0.04]
        D2 -->|No 40%| S2[Skip $0.00]
        R2 --> G2[Generation $0.04]
        S2 --> G2B[Generation $0.04]
        I2 --> T2[Average: $0.05]
        R2 --> T2
        S2 --> T2
        G2 --> T2
        G2B --> T2
    end
    
    T1 -.->|37.5% Savings| Savings["$0.03 saved<br/>per query"]
    T2 -.->|37.5% Savings| Savings
    
    style T1 fill:#ff4d4f,color:#fff
    style T2 fill:#52c41a,color:#fff
    style Savings fill:#faad14,color:#fff
```

## Deployment & Rollout Strategy

```mermaid
graph TD
    Dev[Development] --> Test[Testing Phase]
    
    Test --> UnitTests[Unit Tests]
    Test --> IntTests[Integration Tests]
    Test --> E2ETests[E2E Tests]
    Test --> PerfTests[Performance Tests]
    
    UnitTests --> TestsPass{All Tests<br/>Pass?}
    IntTests --> TestsPass
    E2ETests --> TestsPass
    PerfTests --> TestsPass
    
    TestsPass -->|No| FixBugs[Fix Issues]
    FixBugs --> Test
    
    TestsPass -->|Yes| Staging[Staging Environment]
    
    Staging --> SmokeTest[Smoke Tests]
    SmokeTest --> Internal[Internal Dogfooding]
    
    Internal --> Feedback1{Issues<br/>Found?}
    Feedback1 -->|Yes| FixBugs
    Feedback1 -->|No| Beta[Beta Release]
    
    Beta --> Rollout10[10% User Rollout]
    Rollout10 --> Monitor1[Monitor 3 Days]
    
    Monitor1 --> Check1{Metrics<br/>Good?}
    Check1 -->|No| Rollback1[Rollback]
    Check1 -->|Yes| Rollout50[50% User Rollout]
    
    Rollback1 --> FixBugs
    
    Rollout50 --> Monitor2[Monitor 3 Days]
    Monitor2 --> Check2{Metrics<br/>Good?}
    Check2 -->|No| Rollback2[Rollback]
    Check2 -->|Yes| Rollout100[100% Rollout]
    
    Rollback2 --> FixBugs
    
    Rollout100 --> Production[Production Stable]
    Production --> ContinuousMonitoring[Continuous Monitoring]
    
    ContinuousMonitoring --> OptimizationLoop[Optimization Loop]
    OptimizationLoop --> Phase4[Phase 4 Enhancements]
```

---

## Key Takeaways

### Architecture Principles

1. **Separation of Concerns**: Orchestration model separate from main conversation model
2. **Graceful Degradation**: Multiple fallback levels ensure system always works
3. **Observable**: Comprehensive metrics tracking for monitoring and optimization
4. **Configurable**: User has full control over orchestration behavior
5. **Performant**: Caching, patterns, and streaming for optimal speed

### Decision Flow Summary

```
User Query
    ↓
Is orchestration enabled?
    ├─ No → Skip intent analysis (always-on retrieval)
    └─ Yes → Get orchestration model
        ├─ Orchestration model valid? → Use it ✅
        ├─ Fallback enabled & assistant model valid? → Use it ⚠️
        └─ Neither available → Skip analysis ❌
            ↓
Perform intent analysis (or skip)
    ↓
Add appropriate tools based on intent
    ↓
Execute main LLM with tools
    ↓
Track metrics
    ↓
Return response
```

### Cost Savings Breakdown

For 1000 queries/day:

**Without Orchestration:**
- Every query: Web search ($0.03) + KB embedding ($0.01) + Generation ($0.04) = $0.08
- Daily cost: 1000 × $0.08 = $80
- Monthly cost: $2,400

**With Orchestration:**
- Intent analysis: $0.0002 per query
- 60% need retrieval: 600 × ($0.0002 + $0.04 + $0.04) = $48.12
- 40% skip retrieval: 400 × ($0.0002 + $0.04) = $16.08
- Daily cost: $64.20
- Monthly cost: $1,926

**Savings: $474/month (19.75%)**

*Note: Research suggests 30-50% savings are achievable with optimization.*

---

## References

- Full Specification: `INTENT_ORCHESTRATION_IMPLEMENTATION_SPEC.md`
- Quick Start Guide: `ORCHESTRATION_QUICK_START.md`
- Mermaid Documentation: https://mermaid.js.org/



