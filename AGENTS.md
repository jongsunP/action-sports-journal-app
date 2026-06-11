# Action Sports Journal

An iOS-first React Native application for action sports athletes.

Examples:

- Wakeboard
- Waterski
- Snowboard
- Ground Tricks
- Skateboard
- Surfing

Users define their own Activity Groups.

## Expo Version Guidance

Expo has changed. Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing Expo-specific code.

## Product Philosophy

This is not an AI analysis app.

This is an Action Sports Life Log platform.

AI analysis is only one feature.

The long-term goal is helping users track growth, sessions, expenses, activity history, and progress over time.

## Core Domain Model

```text
ActivityGroup
↓
Session
↓
AnalysisResult
↓
ShareResult
```

Session is the center of the system.

Do not design features that bypass Session.

## Current Development Stage

Stage 1: Initial Setup

Current goals:

- Expo setup
- React Native setup
- TypeScript setup
- GitHub setup
- Basic folder structure
- Initial domain types
- iPhone device execution

## Do Not Implement Yet

- OpenAI integration
- Database
- Authentication
- Phone login
- Coupons
- Expense tracking
- Calendar
- RAG
- Video processing
- Backend implementation

If unsure, keep the implementation simple.

## Architecture Principles

- Prefer simple solutions.
- Avoid over-engineering.
- Avoid premature abstractions.
- Avoid creating generic frameworks.
- Create only what is required for the current stage.

## Share Strategy

Sharing is a core product requirement.

Users are expected to share growth and achievements through Instagram and social media.

Future result structures should consider:

- Best scene
- Highlight scene
- AI comment
- Growth comparison
- Share card

Do not implement sharing yet.

Only keep future extensibility in mind.

## Technology Stack

- React Native
- Expo
- TypeScript
- Node.js
- Next.js API Routes (future BFF)
- OpenAI API (future)
- Vercel (future)

## Expected Coding Style

- Strong TypeScript typing
- Small focused files
- Clear naming
- Minimal dependencies
- Simple folder structure
