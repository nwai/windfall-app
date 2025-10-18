# Toast Notification System

A lightweight, dependency-free global toast notification system for the Windfall app.

## Features

- **Simple API**: Just call `showToast("message")` from anywhere in your app
- **Auto-hide**: Toasts automatically disappear after ~1.6 seconds
- **Smooth animations**: Fade and slide effects for a polished user experience
- **Configurable position**: Toasts can appear in any corner of the screen
- **No dependencies**: Pure TypeScript/React implementation

## Usage

### 1. Import the showToast function

```typescript
import { showToast } from '../lib/toastBus';
```

### 2. Call it from any event handler

```typescript
function handleCopyToClipboard() {
  navigator.clipboard.writeText(data)
    .then(() => {
      showToast('Copied to clipboard!');
    })
    .catch(() => {
      showToast('Failed to copy');
    });
}
```

### 3. The ToastContainer is already wired into App.tsx

No additional setup needed! The `ToastContainer` component is already rendered at the top level of the application.

## Current Implementations

The toast notification system is currently used in:

1. **GroupPatternPanel** - Copy JSON button
   - Shows "Zone analysis copied to clipboard" on success
   
2. **BatesPanel** - Generate button
   - Shows "Bates candidate generated" when a new candidate is created
   
3. **ParameterSearchPanel** - Adopt button
   - Shows "Parameters adopted to Bates panel" when parameters are adopted

## API Reference

### `showToast(message: string): void`

Displays a toast notification with the given message.

**Parameters:**
- `message` (string): The text to display in the toast

**Example:**
```typescript
showToast('Operation completed successfully');
```

### `subscribeToast(listener: (message: string) => void): () => void`

Subscribe to toast events. Returns an unsubscribe function.

**Parameters:**
- `listener` (function): Callback function that receives toast messages

**Returns:**
- Unsubscribe function to remove the listener

**Example:**
```typescript
const unsubscribe = subscribeToast((message) => {
  console.log('Toast shown:', message);
});

// Later, when cleanup is needed
unsubscribe();
```

### `<ToastContainer>`

React component that renders toast notifications.

**Props:**
- `position?` ('top-right' | 'top-left' | 'bottom-right' | 'bottom-left') - Default: 'top-right'
- `duration?` (number) - Duration in milliseconds before auto-hide. Default: 1600

**Example:**
```tsx
<ToastContainer position="bottom-right" duration={2000} />
```

## Architecture

### toastBus.ts
Simple pub/sub event bus that maintains a set of listeners and broadcasts toast messages to all subscribers.

### ToastContainer.tsx
React component that:
1. Subscribes to the toast bus on mount
2. Maintains a queue of active toasts
3. Handles animation states (entering, visible, exiting)
4. Auto-removes toasts after the specified duration

## Testing

The toast notification system includes comprehensive unit tests:

- **toastBus.test.ts**: Tests for the event bus
  - Subscription/unsubscription
  - Multiple subscribers
  - Error handling
  
- **ToastContainer.test.tsx**: Tests for the UI component
  - Rendering toasts
  - Auto-hide behavior
  - Multiple toasts
  - Position configuration

Run tests with:
```bash
npm test -- --testPathPattern="toast"
```

## Customization

To add toast notifications to a new component:

1. Import `showToast`:
   ```typescript
   import { showToast } from '../lib/toastBus';
   ```

2. Call it when you want to show feedback:
   ```typescript
   const handleAction = () => {
     // Your action logic
     showToast('Action completed!');
   };
   ```

That's it! The global ToastContainer will handle displaying and animating the toast.
