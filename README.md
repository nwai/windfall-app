# Windfall App

A React + TypeScript lottery analysis application built with Vite.

## Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- npm

### Installation

```bash
npm install
```

## Available Scripts

### `npm run dev`

Runs the app in development mode with hot module replacement.\
Open [http://localhost:5173](http://localhost:5173) to view it in the browser.

The page will reload automatically when you make edits.

### `npm run build`

Builds the app for production to the `dist` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include hashes for cache busting.

### `npm run preview`

Previews the production build locally.\
Run this after `npm run build` to test the production build before deployment.

### `npm run typecheck`

Runs TypeScript type checking without emitting files.\
Useful for verifying type correctness before committing.

### `npm run lint`

Runs ESLint on the source code to check for code quality issues.

### `npm run lint:fix`

Runs ESLint and automatically fixes fixable issues.

### `npm run verify`

Runs both type checking and linting.\
Use this before committing to ensure code quality.

## Project Structure

```
windfall-app/
├── src/                    # Application source code
│   ├── components/         # React components
│   ├── lib/               # Utility libraries and helpers
│   ├── utils/             # Utility functions
│   ├── types/             # TypeScript type definitions
│   ├── context/           # React context providers
│   ├── constants/         # Application constants
│   ├── App.tsx            # Main application component
│   └── main.tsx           # Application entry point
├── index.html             # HTML template
├── vite.config.ts         # Vite configuration
├── tsconfig.json          # TypeScript configuration
└── package.json           # Project dependencies and scripts
```

## Technology Stack

- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Nivo** - Data visualization charts

## Learn More

- [Vite Documentation](https://vitejs.dev/)
- [React Documentation](https://react.dev/)
- [TypeScript Documentation](https://www.typescriptlang.org/)
