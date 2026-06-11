# Project Charter

## Project

Action Sports Journal is an iOS-first React Native app for a personal action sports journal.

## Product Direction

The app starts with video upload and AI analysis, but the long-term product is organized around user-defined ActivityGroups and Sessions.

## Core Model

- ActivityGroup is the top-level user-defined group.
- Session is the center of user data.
- AI analysis is one feature attached to a Session.
- ShareResult is considered from the beginning so users can share growth cards and highlight cards to Instagram or other social platforms.

## Stage 1 Scope

- Create the Expo React Native TypeScript project.
- Add minimal documentation.
- Add the initial source structure.
- Define initial TypeScript domain types.
- Show a minimal home screen with the app title and a Select Video button.

## Explicitly Out Of Scope For Stage 1

- OpenAI API integration
- Database
- Login
- Phone authentication
- Coupons
- Expenses
- Calendar
- RAG
- Real video upload logic

## Principles

- Keep the app simple and extensible.
- Let Sessions remain the central product object.
- Avoid premature infrastructure until the product shape is clearer.
- Prefer small, readable modules over broad abstractions.
