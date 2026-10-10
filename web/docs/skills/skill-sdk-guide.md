# Nova Canvas Skill Development SDK Guide

## Overview
Nova Canvas supports 15 Lovart-style Skills that extend the platform's capabilities. This guide documents how to develop, register, and integrate new skills.

## Skill Architecture

### Skill Interface
Every skill must implement the following interface:

```typescript
interface Skill {
  id: string;           // Unique skill identifier
  name: string;        // Display name
  description: string; // Skill description
  version: string;     // Skill version
  category: string;    // Category (touch, design, video, navigation, etc.)
  icon: string;        // Icon name (lucide-react icon)
  status: 'active' | 'disabled';
  
  // Core execution method
  execute(params: SkillParams, context: SkillContext): Promise<SkillResult>;
  
  // Optional: Validate parameters
  validateParams(params: SkillParams): ValidationResult;
  
  // Optional: Get skill help/documentation
  getHelp(): SkillHelp;
}
```

### SkillParams
```typescript
interface SkillParams {
  [key: string]: any;
  // Skill-specific parameters
}
```

### SkillContext
```typescript
interface SkillContext {
  nodeId: string;           // Current node ID
  shots: DirectorShot[];    // Current shots
  viewMode: 'grid' | 'list';
  selectedShotId: string | null;
  canvasState: CanvasState;
  userId: string;
  timestamp: number;
}
```

### SkillResult
```typescript
interface SkillResult {
  success: boolean;
  data?: any;           // Result data
  message?: string;     // Status message
  newState?: CanvasState; // Optional state update
  actions?: SkillAction[]; // Optional actions to perform
}
```

### SkillAction
```typescript
interface SkillAction {
  type: 'undo' | 'redo' | 'refresh' | 'custom';
  payload?: any;
}
```

## Registered Skills (15 Total)

### Touch Skills (5)
1. **Touch Edit** - Basic editing operations (cut, copy, paste, delete)
2. **Design Agent** - AI-assisted design suggestions
3. **Layer Split** - Split layers/elements
4. **Layer Merge** - Merge combined layers
5. **Layer Color Replace** - Replace colors in layers

### Video Skills (4)
6. **Video Deconstruct** - Analyze and deconstruct video
7. **Video Replicate** - Replicate video style/elements
8. **Video Remix** - Remix video content
9. **Batch Replicate** - Batch replication of shots

### Analysis Skills (2)
10. **Viral Discovery** - Discover viral video patterns
11. **Smart Deconstruction** - Intelligent video deconstruction

### Navigation Skills (2)
12. **Originality Guard** - Check originality
13. **Navigation History** - Track navigation history

### State Skills (2)
14. **Skill Sync** - Sync skills across sessions
15. **Canvas States** - Manage canvas states

## Skill Development Workflow

### 1. Create Skill Definition
```typescript
// skills/my-skill.ts
import { Skill, SkillParams, SkillContext, SkillResult } from '@nova-canvas/types';

export const mySkill: Skill = {
  id: 'my-skill',
  name: 'My Skill',
  description: 'Description of what this skill does',
  version: '1.0.0',
  category: 'design',
  icon: 'Palette',
  status: 'active',
  
  async execute(params: SkillParams, context: SkillContext): Promise<SkillResult> {
    // Execute skill logic
    return {
      success: true,
      data: { /* result data */ },
      message: 'Skill executed successfully',
      actions: []
    };
  },
  
  validateParams(params: SkillParams): ValidationResult {
    // Validate parameters
    return { valid: true, errors: [] };
  },
  
  getHelp(): SkillHelp {
    return {
      description: 'Description',
      usage: 'How to use this skill',
      examples: ['example usage'],
      parameters: [
        { name: 'param1', type: 'string', description: 'Parameter 1' }
      ]
    };
  }
};
```

### 2. Register Skill
```typescript
// skill-registry.ts
import { Skill } from '@nova-canvas/types';
import { mySkill } from './my-skill';

const skills: Skill[] = [
  // Existing skills...
  mySkill,
  // More skills...
];

export { skills };
```

### 3. Register in Skill Panel
```typescript
// skill-panel.tsx
import { useSkills } from '@nova-canvas/store';
import { skills } from './skill-registry';

function SkillPanel() {
  const { skills, executeSkill } = useSkills();
  
  return (
    <div className="skill-panel">
      {skills.map(skill => (
        <SkillCard
          key={skill.id}
          skill={skill}
          onExecute={executeSkill}
          help={skill.getHelp()}
        />
      ))}
    </div>
  );
}
```

## Skill Development Best Practices

### 1. Parameter Validation
Always validate input parameters:
```typescript
validateParams(params: SkillParams): ValidationResult {
  const errors: string[] = [];
  
  if (!params.name) {
    errors.push('Name is required');
  }
  
  if (params.duration && (params.duration < 0.1 || params.duration > 300)) {
    errors.push('Duration must be between 0.1 and 300 seconds');
  }
  
  return { valid: errors.length === 0, errors };
}
```

### 2. Handle Context Properly
Always use the provided context:
```typescript
async execute(params: SkillParams, context: SkillContext): Promise<SkillResult> {
  const { nodeId, shots, viewMode } = context;
  
  // Use context data
  const relevantShots = shots.filter(shot => shot.function === 'narrative');
  
  // ... execute logic
  
  return {
    success: true,
    data: { result },
    message: 'Skill executed',
    newState: { /* new canvas state */ }
  };
}
```

### 3. Provide Meaningful Help
```typescript
getHelp(): SkillHelp {
  return {
    description: 'Create animated transitions between shots',
    usage: 'Select shots and run the skill to create smooth transitions',
    examples: [
      'Select 3 shots and run the skill',
      'Adjust transition duration in the sidebar'
    ],
    parameters: [
      { name: 'duration', type: 'number', description: 'Transition duration in seconds', default: 1.0 },
      { name: 'easing', type: 'string', description: 'Easing function', default: 'ease-out' }
    ]
  };
}
```

### 4. Error Handling
```typescript
async execute(params: SkillParams, context: SkillContext): Promise<SkillResult> {
  try {
    // ... execute logic
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      message: error.message || 'Skill execution failed',
      data: null
    };
  }
}
```

## Skill Testing

### Unit Tests
```typescript
import { mySkill } from './my-skill';
import { setupContext } from '@nova-canvas/test-utils';

describe('my-skill', () => {
  test('executes successfully with valid params', async () => {
    const context = setupContext({ shots: [...] });
    const result = await mySkill.execute({ duration: 1.0 }, context);
    
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });
  
  test('fails with invalid params', async () => {
    const context = setupContext({ shots: [...] });
    const result = await mySkill.execute({ duration: -1 }, context);
    
    expect(result.success).toBe(false);
    expect(result.message).toContain('Duration must be positive');
  });
});
```

### Integration Tests
```typescript
import { SkillRegistry } from '@nova-canvas/skills';
import { SkillExecutor } from '@nova-canvas/core';

describe('Skill Integration', () => {
  test('skill executes within workflow', async () => {
    const registry = new SkillRegistry();
    const executor = new SkillExecutor(registry);
    
    const result = await executor.execute('my-skill', {
      params: { duration: 1.0 },
      context: { /* mock context */ }
    });
    
    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
  });
});
```

## Publishing Skills

### Package Structure
```
my-skill/
├── skill.json          // Skill manifest
├── index.ts            // Skill implementation
├── package.json        // Dependencies
├── README.md           // Documentation
└── tests/              // Test files
```

### Publishing to npm
```json
{
  "name": "nova-skill-my-skill",
  "version": "1.0.0",
  "description": "My Nova Canvas skill",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "publish": "npm publish"
  },
  "dependencies": {
    "@nova-canvas/types": "^1.0.0"
  }
}
```

### Skill Store Submission
1. Package skill following the structure above
2. Ensure all tests pass (100% coverage for core functionality)
3. Submit to the Nova Canvas skill store
4. Undergo review process
5. Get published to the skill marketplace

## Extending Existing Skills

### Modify Existing Skill
```typescript
// Update existing skill
import { existingSkill } from '@nova-canvas/skills';

export const updatedSkill: Skill = {
  ...existingSkill,
  version: '2.0.0',
  description: 'Updated description',
  execute: async (params, context) => {
    // Updated logic
    return { success: true, data: newResult };
  }
};
```

### Add New Feature
```typescript
// Add new capability to existing skill
const skillWithNewFeature: Skill = {
  ...existingSkill,
  execute: async (params, context) => {
    // Original logic
    const baseResult = await originalExecute(params, context);
    
    // New feature
    if (params.newFeature) {
      // Add new capability
      const newData = await newFeature(params.newFeature, context);
      return {
        ...baseResult,
        data: { ...baseResult.data, newFeatureResult: newData }
      };
    }
    
    return baseResult;
  }
};
```

## Distribution

### Internal Distribution
1. Package as npm module
2. Add to project's `package.json` dependencies
3. Make available in skill panel

### External Distribution
1. Publish to npm registry
2. Document in skill store
3. Provide support channel
4. Version tracking and updates

---

## SDK API Reference

### Core Exports
```typescript
import {
  Skill,
  SkillParams,
  SkillContext,
  SkillResult,
  SkillAction,
  SkillHelp,
  SkillRegistry,
  SkillExecutor
} from '@nova-canvas/types';
```

### Key Functions
- `SkillRegistry.register(skill: Skill)`: Register a new skill
- `SkillExecutor.execute(skillId: string, params: SkillParams, context: SkillContext)`: Execute a skill
- `SkillRegistry.getSkill(skillId: string): Skill | undefined`: Get skill by ID
- `SkillRegistry.listSkills(): Skill[]`: List all registered skills
- `SkillRegistry.validateSkill(skill: Skill): ValidationResult`: Validate a skill definition

### Example: Creating a Skill from Scratch
```typescript
import { Skill, SkillParams, SkillContext, SkillResult } from '@nova-canvas/types';

// 1. Define the skill
const mySkill: Skill = {
  id: 'custom-transition',
  name: 'Custom Transition',
  description: 'Create custom transition between shots',
  version: '1.0.0',
  category: 'design',
  icon: 'Loader2',
  status: 'active',
  
  async execute(params: SkillParams, context: SkillContext): Promise<SkillResult> {
    const { shots, selectedShotId } = context;
    
    // Find selected shot and its neighbors
    const selected = shots.find(s => s.id === selectedShotId);
    const prevShot = shots.find(s => s.id === selectedShotId); // simplified
    const nextShot = shots.find(s => s.id === selectedShotId); // simplified
    
    // Create transition
    const transition = {
      type: params.transitionType || 'crossfade',
      duration: params.duration || 1.0,
      easing: params.easing || 'ease-out'
    };
    
    return {
      success: true,
      data: {
        transition,
        affectedShots: [selected.id, prevShot.id, nextShot.id]
      },
      message: 'Transition created successfully'
    };
  },
  
  validateParams(params: SkillParams): ValidationResult {
    const errors: string[] = [];
    
    if (!params.duration || params.duration < 0.1 || params.duration > 30) {
      errors.push('Duration must be between 0.1 and 30 seconds');
    }
    
    if (!params.transitionType) {
      errors.push('Transition type is required');
    }
    
    return { valid: errors.length === 0, errors };
  },
  
  getHelp(): SkillHelp {
    return {
      description: 'Create custom transition between selected shots',
      usage: 'Select shots and choose transition type and duration',
      examples: [
        'Crossfade transition: { transitionType: "crossfade", duration: 1.0 }',
        'Slide transition: { transitionType: "slide", duration: 0.5 }'
      ],
      parameters: [
        { name: 'transitionType', type: 'string', description: 'Type of transition', 
          enum: ['crossfade', 'slide', 'fade', 'push', 'pull'] },
        { name: 'duration', type: 'number', description: 'Transition duration in seconds', minimum: 0.1, maximum: 30 },
        { name: 'easing', type: 'string', description: 'Easing function', default: 'ease-out' }
      ]
    };
  }
};

// 2. Register the skill
import { SkillRegistry } from '@nova-canvas/types';
const registry = new SkillRegistry();
registry.register(mySkill);

// 3. Use the skill
const executor = new SkillExecutor(registry);
const result = await executor.execute('custom-transition', {
  duration: 1.0,
  transitionType: 'crossfade'
}, context);
```

---

## Debugging Skills

### Common Issues
1. **Invalid params**: Check `validateParams` output
2. **Context errors**: Ensure context is properly formed
3. **State not updating**: Return `newState` in `SkillResult`
4. **Performance**: Optimize heavy computations, use throttling
5. **Memory leaks**: Clean up event listeners, timeouts

### Debug Logging
```typescript
async execute(params: SkillParams, context: SkillContext): Promise<SkillResult> {
  console.log('Skill executing:', {
    skillId: this.id,
    params,
    context: { nodeId: context.nodeId, shotCount: context.shots.length }
  });
  
  try {
    const result = await originalExecute(params, context);
    
    console.log('Skill executed successfully', {
      skillId: this.id,
      resultData: result.data
    });
    
    return result;
  } catch (error) {
    console.error('Skill execution failed', {
      skillId: this.id,
      error: error.message,
      params,
      context
    });
    
    throw error;
  }
}
```

---

## Skill Store Guidelines

### Acceptance Criteria
1. **100% test coverage** for core functionality
2. **TypeScript strict mode** compliant
3. **No console.error** in production code
4. **Proper error handling** and edge case management
5. **Documentation** included (usage examples, parameters)
6. **Performance** under 2s execution time for typical use cases
7. **No breaking changes** to existing API contracts

### Review Process
1. Submit skill package to skill store
2. Automated checks run (tests, types, lint)
3. Manual review by Nova Canvas team
4. Feedback and iterations
5. Publication to skill marketplace

### Rejection Reasons
- Missing or inadequate tests
- TypeScript errors or `any` type overuse
- Poor documentation
- Performance issues
- Security vulnerabilities
- Incompatible with current SDK version

---
*Last updated: 2024-01-15*
*Version: v1.0.0*
*Compatible with Nova Canvas v1.0.0+