import type { Session } from '../../types';

export const mockSessions: Session[] = [
  {
    id: 'session-001',
    activityGroupId: 'group-wakeboard',
    title: 'Morning dock starts',
    notes: 'Focus on clean edge control and stable takeoff.',
    occurredAt: '2026-06-10T07:30:00.000Z',
    shareResultIds: [],
    createdAt: '2026-06-10T07:30:00.000Z',
    updatedAt: '2026-06-10T07:30:00.000Z',
  },
  {
    id: 'session-002',
    activityGroupId: 'group-wakeboard',
    title: 'Evening park set',
    notes: 'Worked on consistency through the line.',
    occurredAt: '2026-06-11T18:10:00.000Z',
    shareResultIds: [],
    createdAt: '2026-06-11T18:10:00.000Z',
    updatedAt: '2026-06-11T18:10:00.000Z',
  },
  {
    id: 'session-003',
    activityGroupId: 'group-snowboard',
    title: 'Rail line practice',
    notes: 'Short run with a few clean attempts.',
    occurredAt: '2026-06-09T10:15:00.000Z',
    shareResultIds: [],
    createdAt: '2026-06-09T10:15:00.000Z',
    updatedAt: '2026-06-09T10:15:00.000Z',
  },
];
