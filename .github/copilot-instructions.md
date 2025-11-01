# Copilot Instructions for Windfall App

## Project Overview

This is a React + TypeScript application for lottery number analysis and candidate generation. The app provides various analytical tools including zone pattern analysis, temperature transitions, Monte Carlo simulations, and candidate generation strategies.

## Project Structure

- **`src/`** - Main source directory
  - **`components/`** - React components organized by feature
    - `candidates/` - Candidate generation and analysis components
    - `controls/` - UI control components
    - `grid/` - Grid visualization components
    - `layout/` - Layout and structural components
    - `panels/` - Various analysis panels
    - `shared/` - Shared UI components
  - **`lib/`** - Core utilities and algorithms
    - Zone analysis and weighting utilities
    - Statistical functions (linear regression, p-values)
    - Temperature transitions
    - Pattern analysis
    - Draw fetching and validation
  - **`context/`** - React context providers
  - **`constants/`** - Application constants
  - **`shared/`** - Shared utilities and hooks
  - **`types/`** - TypeScript type definitions
  - **`utils/`** - General utility functions

## Technology Stack

- **React** (18.x) with TypeScript
- **Create React App** - Build tooling
- **ESLint** - Code linting
- **TypeScript** (strict mode enabled)

## Development Commands

### Linting and Type Checking
```bash
npm run lint          # Run ESLint on TypeScript files
npm run lint:fix      # Auto-fix ESLint issues
npm run typecheck     # Run TypeScript type checking
npm run verify        # Run both typecheck and lint
```

### Running the Application
```bash
npm start             # Start development server on http://localhost:3000
npm run build         # Build for production
```

**Note**: This project uses Create React App defaults but doesn't have explicit npm scripts for testing configured yet.

## Coding Standards

### TypeScript
- Use **strict mode** (enabled in tsconfig.json)
- Always provide explicit types for function parameters and return values
- Use interfaces for object shapes, types for unions/primitives
- Avoid `any` types - use `unknown` if truly needed
- Use type assertions sparingly and only when necessary

### React
- Use **functional components** with hooks (no class components)
- Explicitly type component props, including `children` when needed
- Use `useMemo` and `useCallback` for performance optimization in complex components
- Keep components focused and single-purpose
- Extract complex logic into custom hooks or utility functions

### File Organization
- Components: PascalCase (e.g., `GroupPatternPanel.tsx`)
- Utilities: camelCase (e.g., `zoneAnalysis.ts`)
- Tests: Match filename with `.test.ts` or `.test.tsx` extension
- Keep related files together (component + tests + styles)

### Code Style
- Use clear, descriptive variable and function names
- Add JSDoc comments for complex functions and algorithms
- Keep functions small and focused (prefer < 50 lines)
- Use early returns to reduce nesting
- Prefer `const` over `let`, avoid `var`
- Use arrow functions for callbacks and inline functions
- Use template literals for string interpolation

## Key Domain Concepts

### Draws and History
- **Draw**: A lottery draw with main numbers (1-45) and optional powerball
- **History**: Array of draws ordered chronologically
- Draws contain metadata like date, draw number, and results

### Zone Pattern Analysis (ZPA)
- Numbers 1-45 divided into 9 zones (Zone 1: 1-5, Zone 2: 6-10, etc.)
- Analyzes frequency trends of zones over time
- Uses linear regression for trend detection
- Provides per-number weights based on zone trends

### Candidates
- **Candidate**: A set of numbers generated for potential play
- Generated using various strategies (Monte Carlo, weighted selection, etc.)
- Can be scored and ranked using multiple criteria

### Temperature Transitions
- Tracks "temperature" (frequency state) of numbers
- Analyzes transitions between temperature states
- Used for predictive modeling

### Weighting Systems
- Numbers can be weighted based on various factors
- Common factors: zone trends, drought periods, historical patterns
- Weights typically range from 0.1 to 2.0 (1.0 = neutral)

## Testing Guidelines

### Test Organization
- Place test files next to the code they test
- Use descriptive test names: `it('should calculate zone trends correctly')`
- Group related tests with `describe` blocks

### Test Coverage
- Test public APIs and exported functions
- Test edge cases and boundary conditions
- Test error handling and validation
- Mock external dependencies appropriately

### Running Tests

Test files exist in the codebase (e.g., `*.test.ts`, `*.test.tsx`), but there are currently no npm scripts configured for running tests. Individual test files can be run directly with a test runner like Jest if needed.

## Common Patterns

### Memoization
```typescript
const expensiveResult = useMemo(() => {
  return computeExpensiveValue(dependency);
}, [dependency]);
```

### Context Usage
```typescript
const { value, setValue } = useContext(MyContext);
```

### Component Structure
```typescript
interface MyComponentProps {
  data: SomeType[];
  onUpdate: (value: number) => void;
}

export const MyComponent = ({ data, onUpdate }: MyComponentProps) => {
  // Hooks first
  const [state, setState] = useState(0);
  
  // Memoized values
  const processedData = useMemo(() => processData(data), [data]);
  
  // Event handlers
  const handleClick = useCallback(() => {
    onUpdate(state);
  }, [state, onUpdate]);
  
  // Render
  return (
    <div>{/* JSX */}</div>
  );
};
```

## Important Notes

### Pre-existing Issues
- The codebase has many TypeScript type errors that are **pre-existing**
- Focus on not introducing new errors rather than fixing all existing ones
- When making changes, ensure your code doesn't increase the error count
- Use `npm run verify` to check your changes don't break linting

### Performance Considerations
- Use `useMemo` for expensive calculations
- Use `useCallback` for event handlers passed to child components
- Be mindful of re-render triggers in large lists
- Consider virtualization for large datasets

### Documentation
- Update documentation when adding new features
- Keep README files in sync with code changes
- Document complex algorithms with comments
- Include examples for new utilities

## Making Changes

### Before Starting
1. Understand the issue requirements fully
2. Explore related code and existing patterns
3. Run `npm run verify` to check baseline state
4. Identify minimal changes needed

### During Development
1. Make small, focused changes
2. Run `npm run verify` frequently
3. Test changes manually when possible
4. Keep changes consistent with existing patterns
5. Update tests if functionality changes

### Before Committing
1. Run `npm run verify` to check for errors
2. Ensure no new linting errors were introduced
3. Review all changed files
4. Update documentation if needed

## Getting Help

- Check existing code for similar patterns
- Review documentation in `docs/` directory
- Look at test files for usage examples
- Check component README files when available
