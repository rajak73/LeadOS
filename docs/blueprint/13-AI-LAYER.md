# 13 — AI Intelligence Layer

---

## 13.1 AI Architecture Overview

The AI layer is designed as a standalone module consumed by the rest of the system. All AI operations run **asynchronously** via BullMQ to avoid latency on user-facing requests.

```
[CRM Events] → [AI Queue] → [AI Workers] → [OpenAI API] → [Results saved to DB]
                                    │
                            [Redis Cache Layer]
                            (Identical prompts cached 24h)
```

**Design Principles:**
- AI enriches data; it never blocks user actions
- Scores and insights are displayed but users can override
- All AI outputs include confidence levels
- Model routing: cheap model → expensive model only if needed
- Cost controls enforced at the org plan level

---

## 13.2 AI Feature 1: Lead Scoring

### Purpose
Score every lead 0–100 based on their likelihood to convert. Helps sales reps prioritize outreach.

### Data Inputs
```typescript
interface LeadScoringInput {
  // Lead attributes
  source: LeadSource;
  status: LeadStatus;
  hasEmail: boolean;
  hasPhone: boolean;
  instagramHandle: string | null;
  daysOld: number; // days since lead created
  
  // Activity signals
  messageCount: number; // total DMs exchanged
  lastMessageDaysAgo: number;
  tasksCompleted: number;
  notesCount: number;
  
  // Pipeline signals
  pipelineStageName: string | null;
  stageProbability: number | null;
  
  // Custom fields (if relevant schema detected)
  customFields: Record<string, unknown>;
  
  // Historical org data (for context)
  orgAvgWinRate: number;
  orgAvgSalesCycle: number; // days
}
```

### Scoring Model
**Model:** `gpt-4o-mini` with structured output (JSON mode)

**Prompt Strategy:**
```
You are a sales intelligence engine. Score the following lead from 0 to 100 based on their likelihood to convert to a paying customer.

Scoring guidelines:
- 80-100: Hot lead. Multiple touchpoints, quick responses, clear intent.
- 60-79: Warm lead. Some engagement, some data available.
- 40-59: Neutral lead. Limited signals, needs qualification.
- 20-39: Cold lead. Minimal engagement, stale.
- 0-19: Very cold. No engagement, very old.

Lead data:
{leadData}

Historical context for this organization:
- Average win rate: {orgAvgWinRate}%
- Average sales cycle: {orgAvgSalesCycle} days

Return a JSON object with:
{
  "score": <0-100 integer>,
  "confidence": <0.0-1.0 float>,
  "factors": [
    { "factor": "string description", "impact": "positive|negative|neutral", "weight": "high|medium|low" }
  ],
  "recommendation": "string: 1-2 sentence action recommendation for the sales rep"
}
```

### Evaluation Metrics
| Metric | Target |
|---|---|
| Precision (score predicts outcome) | > 70% |
| Recall (identify hot leads) | > 80% |
| Latency | < 2 seconds (async) |
| Cost per score | < $0.001 |
| Cache hit rate | > 60% (similar leads in same org) |

### When Scoring Runs
- Lead created (async, within 60 seconds)
- Lead status changes
- New message received on linked conversation
- Task completed on lead
- Every 7 days (refresh for stale leads)

---

## 13.3 AI Feature 2: Sentiment Analysis

### Purpose
Analyze the sentiment of incoming messages to help agents prioritize urgent, frustrated, or highly interested customers.

### Data Inputs
- Last 5 messages in the conversation
- Message direction (inbound/outbound)
- Time gaps between messages

### Output
```json
{
  "sentiment": "POSITIVE | NEUTRAL | NEGATIVE | URGENT",
  "score": 0.85,
  "signals": ["Customer expressed interest in pricing", "Quick response pattern"],
  "urgency": "HIGH | MEDIUM | LOW",
  "suggestedReply": "Hi, I'd be happy to share our pricing..."
}
```

### Model
- `gpt-4o-mini` with JSON mode
- Batch: sentiment computed per conversation, not per message (cost control)
- Triggered: when conversation status changes or every 3 new messages

---

## 13.4 AI Feature 3: Opportunity Detection

### Purpose
Proactively identify hidden opportunities within existing leads and contacts.

### Signals Monitored
- Contact hasn't been contacted in 30+ days
- Deal has been in same stage for > org average time
- Lead score improved significantly (score jump ≥20 points)
- Multiple leads from same company/domain
- Seasonal patterns (e.g., same contact returns after 6 months)

### Output (in-app notification + analytics)
```json
{
  "type": "STALE_DEAL_OPPORTUNITY",
  "entity": { "type": "deal", "id": "uuid", "title": "..." },
  "insight": "This deal has been in 'Proposal' stage for 18 days (avg is 7 days). Consider reaching out to check status.",
  "suggestedAction": "Schedule a follow-up call this week",
  "confidence": 0.82,
  "detectedAt": "2026-06-18T07:00:00Z"
}
```

---

## 13.5 AI Feature 4: Follow-up Recommendations

### Purpose
Tell sales reps exactly what to do next for each open lead or deal.

### Data Inputs
- Lead/deal full record
- Last 5 activities
- Open tasks
- Time since last contact
- Conversation history (last 10 messages)
- Stage probability and deal age

### Output
```json
{
  "nextAction": {
    "type": "CALL | EMAIL | WHATSAPP | INSTAGRAM_DM | DEMO | PROPOSAL",
    "urgency": "NOW | TODAY | THIS_WEEK",
    "reasoning": "Rahul showed strong interest 3 days ago but you haven't followed up. His AI score is 82. A quick WhatsApp message would re-engage him.",
    "suggestedMessage": "Hi Rahul! 😊 Just checking if you had any questions about the property we discussed. Would love to set up a site visit when you're free.",
    "confidence": 0.88
  }
}
```

### Model
- `gpt-4o` (higher quality for recommendations, shown to users)
- Triggered: on demand (button click) + nightly batch for all open leads with no recent activity

---

## 13.6 AI Feature 5: Conversation Summary

### Purpose
Auto-generate a concise summary of a full conversation, including key points, customer intent, and objections.

### Data Inputs
- Full message thread
- Contact/lead record metadata
- Organization context (industry, product)

### Output
```json
{
  "summary": "Priya inquired about a 3BHK apartment in Bandra. She has a budget of ₹1.5Cr and is looking to move within 3 months. She has two concerns: parking availability and school proximity. She has seen 2 other properties and is actively comparing.",
  "keyPoints": [
    "Budget: ₹1.5 Crore",
    "Timeline: 3 months",
    "Preferred location: Bandra",
    "Objections: Parking, school proximity"
  ],
  "customerIntent": "HIGHLY_INTERESTED",
  "suggestedNextStep": "Send floor plan with parking details + list of nearby schools"
}
```

### Model
- `gpt-4o` (quality matters for summaries)
- Triggered: after each completed conversation (conversation.status = CLOSED) + on demand
- Stored in `instagram_conversations.aiSummary` (JSONB field added to schema)

---

## 13.7 AI Feature 6: Revenue Forecasting

### Purpose
Predict this month's and this quarter's expected revenue based on current pipeline data + historical win rates.

### Data Inputs
- All open deals with: value, stage, probability, age, assignee historical win rate
- Historical deal outcomes (last 6 months)
- Seasonal patterns (same months in prior years)
- Current month's already-won revenue
- Team's historical conversion rates per stage

### Forecasting Models

#### Model 1: Weighted Pipeline
Simple formula, always computed:
```
Forecast = Σ (deal.value × stage.probability / 100)
```

#### Model 2: AI-Enhanced Forecast
GPT-4o with structured historical data:
```
Given: current pipeline, historical win rates, seasonal factors
Predict: expected revenue for current month (best case, expected, worst case)
```

#### Model 3: Per-Deal Prediction
For each deal with value > ₹50,000:
- Individual probability override based on: deal age, activity recency, lead score, rep's historical win rate for similar deals
- Displayed as "AI Adjusted Probability" on deal card

### Output (displayed on Analytics page)
```json
{
  "period": "June 2026",
  "forecast": {
    "bestCase": 2850000,
    "expected": 1920000,
    "worstCase": 1100000,
    "alreadyWon": 680000,
    "currency": "INR"
  },
  "confidence": 0.74,
  "keyRisks": [
    "3 deals totaling ₹9L have been stale for 10+ days",
    "2 high-value deals closing date has passed without update"
  ],
  "generatedAt": "2026-06-18T06:00:00Z"
}
```

---

## 13.8 AI Infrastructure

### OpenAI Client Configuration
```typescript
// core/ai/openaiClient.ts

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 30_000,
  maxRetries: 3,
});

// Model routing based on feature
export const AI_MODELS = {
  LEAD_SCORING: 'gpt-4o-mini',
  SENTIMENT: 'gpt-4o-mini',
  FOLLOW_UP: 'gpt-4o',
  SUMMARY: 'gpt-4o',
  FORECAST: 'gpt-4o',
  OPPORTUNITY: 'gpt-4o-mini',
  EMBEDDINGS: 'text-embedding-3-small',
} as const;
```

### Prompt Caching Strategy
```typescript
// core/ai/promptCache.ts

export async function cachedCompletion(
  cacheKey: string,
  promptFn: () => Promise<string>,
  options: { ttl: number; model: string }
): Promise<string> {
  // Check Redis cache first
  const cached = await redis.get(`ai:${cacheKey}`);
  if (cached) return cached;
  
  // Execute AI call
  const prompt = await promptFn();
  const response = await openai.chat.completions.create({
    model: options.model,
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
  });
  
  const result = response.choices[0].message.content;
  
  // Cache result
  await redis.setex(`ai:${cacheKey}`, options.ttl, result);
  
  return result;
}
```

### Cost Controls
```typescript
// Check org's AI usage limit before processing
const checkAIUsageLimit = async (orgId: string): Promise<void> => {
  const plan = await getOrgPlan(orgId);
  const limit = AI_LIMITS[plan];
  
  const usageKey = `ai_usage:${orgId}:${currentHour()}`;
  const currentUsage = parseInt(await redis.get(usageKey) || '0');
  
  if (currentUsage >= limit) {
    throw new AppError('AI_RATE_LIMITED', 
      `AI call limit reached for this hour. Upgrade your plan for more AI capacity.`
    );
  }
  
  await redis.incr(usageKey);
  await redis.expire(usageKey, 3600);
};

const AI_LIMITS = {
  TRIAL: 50,
  STARTER: 200,
  GROWTH: 1000,
  SCALE: Infinity,
};
```
