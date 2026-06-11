# Master Plan

## Stage 1: Initial Project Setup

- Create an Expo + React Native + TypeScript app.
- Add domain-first source folders.
- Define the initial ActivityGroup, Session, AnalysisResult, and ShareResult types.
- Add a minimal iPhone-ready home screen.
- Make the first commit.

## Stage 2: Local Session Prototype

- Add a simple create-session flow.
- Add local-only mock data.
- Let a Session reference a selected video placeholder.
- Keep ActivityGroups user-defined, even if stored locally at first.

## Stage 3: Video Selection And Session Attachment

- Add real video selection through Expo-compatible media tooling.
- Attach selected media metadata to a Session.
- Keep processing mocked until AI integration is introduced.

## Stage 4: AI Analysis Feature

- Add a BFF/proxy layer with Next.js API Routes.
- Integrate OpenAI API through the proxy.
- Store analysis output as an AnalysisResult attached to a Session.

## Stage 5: Sharing

- Generate ShareResult assets for growth cards and highlight cards.
- Optimize share outputs for Instagram and common SNS formats.
- Keep sharing separate from analysis so users can share manual and AI-assisted Sessions.

## Stage 6: Persistence And Accounts

- Introduce the database after core workflows are proven.
- Add authentication when cross-device persistence or private cloud storage is needed.

## Later Infrastructure

- GitHub repository workflows
- Vercel deployment for the BFF/proxy
- EAS Build
- TestFlight
