# API Reference - Nova Canvas

## Base URL
- Development: `http://localhost:4174/api/v1`
- Production: `https://api.nova-canvas.com/v1`

## Authentication
All API requests must include an authorization token in the `Authorization: Bearer <token>` header.

### Token Types
- `access_token`: Short-lived token (1 hour) for API calls
- `refresh_token`: Long-lived token (30 days) to refresh access tokens

### Auth Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST /auth/login` | Login with credentials |
| `POST /auth/register` | Register new user |
| `POST /auth/refresh` | Refresh access token |

## Canvas API

### Shots

#### List Shots
```http
GET /shots
```
Query Parameters:
- `nodeId`: Filter shots by node ID
- `viewMode`: Filter by view mode ('grid' or 'list')
- `status`: Filter by status ('draft', 'generating', 'done')

#### Get Shot
```http
GET /shots/{shotId}
```

#### Create Shot
```http
POST /shots
```
Request Body:
```json
{
  "nodeId": "string",
  "shotType": "string",  // extreme-wide, wide, full, medium, close-up, extreme-close-up
  "cameraMove": "string",  // push-in, pull-out, pan-left, pan-right, tilt-up, tilt-down, orbit, handheld, static, aerial
  "angle": "string",  // eye-level, low-angle, high-angle, etc.
  "duration": "number",  // in seconds
  "emotion": "string",  // 好奇, 共鸣, 惊喜, 信赖, 行动, 中性
  "function": "string",  // narrative, emotion, transition, effect
  "content": "string",  // shot description
  "hook": "boolean",  // 是否为钩子镜头
  "status": "string"  // draft, generating, done
}
```

#### Update Shot
```http
PUT /shots/{shotId}
```

#### Delete Shot
```http
DELETE /shots/{shotId}
```

### Projects

#### List Projects
```http
GET /projects
```

#### Create Project
```http
POST /projects
```
Request Body:
```json
{
  "name": "string",
  "description": "string",
  "thumbnail": "string",
  "isPrivate": "boolean"
}
```

#### Get Project
```http
GET /projects/{projectId}
```

#### Update Project
```http
PUT /projects/{projectId}
```

#### Delete Project
```http
DELETE /projects/{projectId}
```

## Director API

### Workflow

#### Start Workflow
```http
POST /director/start
```
Request Body:
```json
{
  "brief": "string",  // 项目 brief
  "stylePreferences": {
    "pacing": "string",  // fast, medium, slow
    "mood": "string",  // energizing, calm, dramatic
    "visualStyle": "string"  // cinematic, documentary, experimental
  }
}
```

#### Get Current Step
```http
GET /director/step
```

#### Submit Step Result
```http
POST /director/step/{stepId}
```
Step IDs: BRIEF, CONCEPT, SCRIPT, CHARACTER, STORYBOARD, EXECUTION, REVIEW

### Shot Rules

#### Get Shot Functions
```http
GET /director/rules/functions
```

#### Get Camera Moves
```http
GET /director/rules/camera-moves
```

#### Get Shot Scales
```http
GET /director/rules/shot-scales
```

#### Get Rhythm Patterns
```http
GET /director/rules/rhythm
```

#### Get Axis Rules
```http
GET /director/rules/axis-rules
```

## Skills API

### List Skills
```http
GET /skills
```

### Execute Skill
```http
POST /skills/{skillId}/execute
```
Request Body:
```json
{
  "params": { /* skill-specific parameters */ },
  "context": { /* execution context */ }
}
```

## Video API

### Generate Video
```http
POST /video/generate
```
Request Body:
```json
{
  "shotId": "string",
  "prompt": "string",
  "model": "string",  // Seedance, OpenAI, etc.
  "parameters": {
    "duration": "number",
    "resolution": "string"
  }
}
```

### Check Generation Status
```http
GET /video/status/{taskId}
```

### Cancel Generation
```http
POST /video/cancel/{taskId}
```

## WebSocket API

### Video Editing Session
```
ws://localhost:4174/ws/video-edit

Events:
- `init`: Initialize editing session
- `instruction`: Send editing instruction
- `status`: Receive status updates
- `preview`: Receive dual-preview frames
- `complete`: Session completion
```

## Error Responses

| Status Code | Error | Description |
|-------------|-------|-------------|
| 400 | `BAD_REQUEST` | Invalid request parameters |
| 401 | `UNAUTHORIZED` | Missing or invalid token |
| 403 | `FORBIDDEN` | Insufficient permissions |
| 404 | `NOT_FOUND` | Resource not found |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Server-side error |
| 503 | `SERVICE_UNAVAILABLE` | Downstream service unavailable |

### Error Response Format
```json
{
  "error": "ERROR_TYPE",
  "message": "Human-readable error message",
  "requestId": "unique-request-id",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

---

## SDK Usage Examples

### JavaScript/TypeScript SDK
```typescript
import { NovaClient } from '@nova-canvas/sdk';

const client = new NovaClient({
  baseURL: 'http://localhost:4174/api/v1',
  token: 'your-access-token'
});

// List shots
const shots = await client.shots.list({ nodeId: 'node-123' });

// Generate video
const result = await client.video.generate({
  shotId: 'shot-123',
  prompt: 'A cinematic close-up shot',
  model: 'seedance'
});

// Execute skill
const result = await client.skills.execute('design-agent', {
  params: { /* params */ },
  context: { /* context */ }
});
```

### Python SDK
```python
from nova_canvas_sdk import NovaClient

client = NovaClient(
    base_url='http://localhost:4174/api/v1',
    token='your-access-token'
)

shots = client.shots.list(node_id='node-123')
result = client.video.generate(
    shot_id='shot-123',
    prompt='A cinematic close-up shot',
    model='seedance'
)
```

---

## Rate Limits
- **Default**: 100 requests/minute per IP
- **Heavy endpoints** (video generation): 10 requests/minute per IP
- **Burst allowance**: 20 requests in 30 seconds

## Versioning
- Current version: `v1`
- Versioning strategy: URL path versioning (`/api/v1/...`)
- Deprecation policy: 6-month notice before deprecating v1 endpoints

---

## WebSocket Protocol

### Connection
```
ws://localhost:4174/ws/api?token=YOUR_TOKEN&namespace=canvas
```

### Message Format
```json
{
  "type": "event_name",
  "data": { /* event-specific data */ },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Events
- `connection_ack`: Connection acknowledged
- `shot_updated`: Shot data updated
- `workflow_progress`: Director workflow progress
- `skill_progress`: Skill execution progress
- `video_frame`: Video generation frame update
- `error`: Error occurrence

---

## Swagger/OpenAPI
Interactive API documentation available at:
- `http://localhost:4174/api-docs`
- Swagger JSON: `http://localhost:4174/api-docs/json`

---
*Document generated: 2024-01-15*
*Version: v1.0.0*