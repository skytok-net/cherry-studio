# Intelligent Search Orchestration - Quick Start Guide

## TL;DR

**Goal**: Add intelligent intent analysis to reduce costs by 30-50% and improve accuracy by 10-15%

**Current Problem**: SearchOrchestrationPlugin always uses assistant's model, fails when no API key

**Solution**: Dedicated lightweight orchestration model with graceful fallback hierarchy

**Timeline**: 4 weeks MVP (core → UI → metrics → optimizations)

---

## Implementation Checklist

### ✅ Phase 1: Core (Week 1-2)

- [ ] **Redux State** (`src/renderer/src/store/settings.ts`)
  - Add `OrchestrationModelConfig` interface
  - Add `orchestrationModel` to `SettingsState`
  - Add actions: `setOrchestrationModelEnabled`, `setOrchestrationModel`, `setOrchestrationModelFallback`, `setOrchestrationModelTimeout`

- [ ] **Orchestration Service** (`src/renderer/src/services/OrchestrationService.ts`)
  - Create `getOrchestrationModel()` function
  - Implement fallback hierarchy: orchestration → assistant → skip
  - Create `createModelInstance()` for AI SDK integration
  - Add `getRecommendedOrchestrationModels()` helper

- [ ] **Plugin Update** (`src/renderer/src/aiCore/plugins/searchOrchestrationPlugin.ts`)
  - Replace `getProviderByModel(assistant.model)` with `getOrchestrationModel(assistant.model)`
  - Update logging with orchestration source
  - Handle timeout gracefully

- [ ] **Tests**
  - Unit tests for `OrchestrationService`
  - Integration tests for plugin with various configurations
  - Mock provider/API key scenarios

### ✅ Phase 2: UI (Week 3)

- [ ] **Settings Component** (`src/renderer/src/pages/settings/OrchestrationSettings.tsx`)
  - Enable/disable toggle
  - Model selector dropdown
  - Fallback toggle
  - Timeout configuration
  - Quick setup button
  - Recommended models list

- [ ] **Integration**
  - Add component to `SettingsPage.tsx`
  - Add i18n translations (en-US, zh-CN, etc.)
  - Style according to existing patterns

- [ ] **Tests**
  - Component rendering tests
  - Interaction tests (toggle, select, etc.)
  - Redux action dispatch verification

### ✅ Phase 3: Monitoring (Week 4)

- [ ] **Metrics Redux Slice** (`src/renderer/src/store/orchestrationMetrics.ts`)
  - Add `OrchestrationMetric` interface
  - Add `OrchestrationMetricsState` with summary
  - Implement `addMetric` and `clearMetrics` actions
  - Auto-calculate summary statistics

- [ ] **Metrics Dashboard** (`src/renderer/src/pages/settings/OrchestrationMetrics.tsx`)
  - Statistics cards (total, success rate, latency, cost)
  - Source distribution progress bars
  - Recent queries table

- [ ] **Integration**
  - Dispatch metrics from `searchOrchestrationPlugin`
  - Track success/failure, latency, source
  - Add metrics component to settings page

- [ ] **Tests**
  - Metrics calculation verification
  - Dashboard rendering tests
  - Redux integration tests

### ✅ Phase 4: Optimizations (Week 5+)

- [ ] **Caching** (`src/renderer/src/services/IntentCache.ts`)
  - LRU cache for identical queries
  - 5-minute TTL
  - Cache hit/miss tracking

- [ ] **Pattern Library**
  - Pre-defined patterns that skip analysis
  - Math expressions, simple definitions, etc.
  - User-configurable patterns

- [ ] **Streaming**
  - Use `streamText` instead of `generateText`
  - Incremental XML parsing
  - Early return on first valid result

- [ ] **Auto-optimization**
  - Track which model performs best
  - Auto-suggest model changes
  - A/B testing framework

---

## Key Files to Create/Modify

### New Files
```
src/renderer/src/services/OrchestrationService.ts
src/renderer/src/pages/settings/OrchestrationSettings.tsx
src/renderer/src/pages/settings/OrchestrationMetrics.tsx
src/renderer/src/store/orchestrationMetrics.ts
src/renderer/src/services/IntentCache.ts (Phase 4)
src/renderer/src/components/OrchestrationWelcome.tsx
docs/features/intelligent-orchestration.md
docs/development/orchestration-architecture.md
```

### Modified Files
```
src/renderer/src/store/settings.ts (add orchestrationModel config)
src/renderer/src/store/index.ts (increment version, add orchestrationMetrics)
src/renderer/src/store/migrate.ts (add migration for v176)
src/renderer/src/aiCore/plugins/searchOrchestrationPlugin.ts (use OrchestrationService)
src/renderer/src/pages/settings/SettingsPage.tsx (add new components)
src/renderer/src/locales/*.json (add translations)
```

---

## Architecture at a Glance

```typescript
// 1. User configures in Settings UI
settings.orchestrationModel = {
  enabled: true,
  model: { id: 'gpt-4o-mini', provider: 'openai', ... },
  fallbackToAssistantModel: true,
  timeoutMs: 5000
}

// 2. Plugin requests orchestration model
const result = getOrchestrationModel(assistant.model)
// Returns: { model: LanguageModel, source: 'orchestration'|'assistant'|'fallback', ... }

// 3. Intent analysis (if not skipped)
if (!result.skipIntentAnalysis) {
  const { text } = await generateText({
    model: result.model,
    prompt: formattedPrompt
  })
  const intent = extractInfoFromXML(text)
}

// 4. Metrics tracking
dispatch(addMetric({
  timestamp: Date.now(),
  source: result.source,
  intentAnalysisLatencyMs: elapsed,
  success: true
}))
```

---

## Fallback Hierarchy

```
1. Orchestration Model (if enabled & valid)
   ↓ FAIL
2. Assistant's Model (if fallback enabled & valid)
   ↓ FAIL
3. Skip Intent Analysis (always-on retrieval)
```

**Valid** = Provider has API key configured

---

## Recommended Models

| Model | Provider | Cost/M tokens | Speed | Best For |
|-------|----------|---------------|-------|----------|
| GPT-4o Mini | OpenAI | $0.15 | Fast | General purpose |
| Claude 3.5 Haiku | Anthropic | $0.25 | Very Fast | Structured output |
| Gemini 1.5 Flash | Google | $0.075 | Fastest | Cost optimization |
| Grok Beta | OpenRouter | Free | Medium | Free tier |

---

## Testing Strategy

```bash
# Unit tests
yarn test:renderer src/renderer/src/services/__tests__/OrchestrationService.test.ts

# Integration tests
yarn test:renderer src/renderer/src/aiCore/plugins/__tests__/searchOrchestrationPlugin.test.ts

# E2E tests
yarn test:e2e e2e/orchestration.spec.ts

# Performance benchmarks
yarn benchmark benchmarks/orchestration.bench.ts
```

---

## Migration Checklist

- [ ] Increment Redux persist version to 176
- [ ] Add migration function for `orchestrationModel` config
- [ ] Add `orchestrationMetrics` to blacklist (don't persist)
- [ ] Test migration on production data snapshot
- [ ] Create rollback plan
- [ ] Prepare user notification/welcome modal

---

## Success Metrics

### Target Improvements
- ✅ 30-50% cost reduction
- ✅ 10-15% accuracy improvement
- ✅ 40-60% faster response for non-retrieval queries
- ✅ <5% hallucination rate
- ✅ >95% intent analysis success rate

### Monitoring Dashboard Metrics
- Total queries processed
- Orchestration usage rate
- Average intent analysis latency
- Estimated cost savings
- Success rate
- Source distribution (orchestration / assistant / fallback)

---

## Common Issues & Solutions

### Issue: "Provider not found or missing API key"
**Solution**: 
1. Check if orchestration model is configured in Settings
2. Verify provider has API key
3. Enable fallback to assistant's model
4. Check metrics to see which source is being used

### Issue: Intent analysis timeout
**Solution**:
1. Increase timeout in settings (default 5000ms)
2. Use faster model (e.g., Gemini 1.5 Flash)
3. Check network connectivity
4. Review logs for specific error

### Issue: High cost despite orchestration
**Solution**:
1. Check metrics - is orchestration actually being used?
2. Verify orchestration model is cheap (< $0.30/M tokens)
3. Consider enabling caching (Phase 4)
4. Review pattern library to skip more queries

### Issue: Lower accuracy than before
**Solution**:
1. Disable orchestration temporarily
2. Check which queries are incorrectly classified
3. Adjust prompts or use different orchestration model
4. File issue with examples for investigation

---

## Configuration Examples

### Minimal Setup (Cheapest)
```typescript
{
  enabled: true,
  model: { id: 'gemini-1.5-flash', provider: 'google' },
  fallbackToAssistantModel: true,
  timeoutMs: 5000
}
```

### Balanced Setup (Recommended)
```typescript
{
  enabled: true,
  model: { id: 'gpt-4o-mini', provider: 'openai' },
  fallbackToAssistantModel: true,
  timeoutMs: 5000
}
```

### High-Quality Setup
```typescript
{
  enabled: true,
  model: { id: 'claude-3-5-haiku-20241022', provider: 'anthropic' },
  fallbackToAssistantModel: false, // Don't fallback, maintain consistency
  timeoutMs: 8000
}
```

### Conservative Setup (Existing Behavior)
```typescript
{
  enabled: false, // Disabled
  model: null,
  fallbackToAssistantModel: true,
  timeoutMs: 5000
}
```

---

## Next Steps

1. ✅ Review full specification: `docs/INTENT_ORCHESTRATION_IMPLEMENTATION_SPEC.md`
2. ⏭️ Set up development environment
3. ⏭️ Create feature branch: `feature/intelligent-orchestration`
4. ⏭️ Start with Phase 1: Redux state + OrchestrationService
5. ⏭️ Write tests as you go (TDD approach)
6. ⏭️ Open draft PR for early feedback
7. ⏭️ Complete Phase 2-4 iteratively
8. ⏭️ Performance testing & benchmarking
9. ⏭️ Documentation & user guide
10. ⏭️ Gradual rollout (10% → 50% → 100%)

---

## Questions?

- **Full Specification**: See `docs/INTENT_ORCHESTRATION_IMPLEMENTATION_SPEC.md`
- **Architecture Deep Dive**: See `docs/development/orchestration-architecture.md` (to be created)
- **User Guide**: See `docs/features/intelligent-orchestration.md` (to be created)
- **Research References**: See appendix in full specification

---

## Estimated Effort

| Phase | Effort | Complexity |
|-------|--------|------------|
| Phase 1: Core | 16-24 hours | Medium |
| Phase 2: UI | 8-12 hours | Low |
| Phase 3: Monitoring | 8-12 hours | Low |
| Phase 4: Optimizations | 8-16 hours | Medium |
| Testing | 12-16 hours | Medium |
| Documentation | 4-8 hours | Low |
| **Total MVP** | **56-88 hours** | **Medium** |

**Developer weeks at 40h/week**: 1.4 - 2.2 weeks (≈ 2 weeks)

---

## Approval Checklist

Before starting implementation:

- [ ] Product approval for features & UI
- [ ] Architecture review completed
- [ ] Security review (API keys, data handling)
- [ ] Performance targets agreed upon
- [ ] Rollout plan approved
- [ ] Support team briefed
- [ ] Documentation requirements clarified

---

**Ready to implement? Start with Phase 1! 🚀**



