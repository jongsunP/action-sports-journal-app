import type { Session } from '../../types';

export const mockSessions: Session[] = [
  {
    id: 'session-001',
    activityGroupId: 'group-wakeboard',
    title: '아침 도크 스타트 연습',
    notes: '엣지 컨트롤과 안정적인 출발 자세에 집중.',
    occurredAt: '2026-06-10T07:30:00.000Z',
    shareResultIds: [],
    createdAt: '2026-06-10T07:30:00.000Z',
    updatedAt: '2026-06-10T07:30:00.000Z',
  },
  {
    id: 'session-002',
    activityGroupId: 'group-wakeboard',
    title: '저녁 케이블 파크 세션',
    notes: '라인 전체를 끊기지 않고 타는 감각을 확인.',
    occurredAt: '2026-06-11T18:10:00.000Z',
    shareResultIds: [],
    createdAt: '2026-06-11T18:10:00.000Z',
    updatedAt: '2026-06-11T18:10:00.000Z',
  },
  {
    id: 'session-003',
    activityGroupId: 'group-snowboard',
    title: '레일 라인 짧은 연습',
    notes: '짧게 타면서 깔끔하게 들어가는 시도 위주.',
    occurredAt: '2026-06-09T10:15:00.000Z',
    shareResultIds: [],
    createdAt: '2026-06-09T10:15:00.000Z',
    updatedAt: '2026-06-09T10:15:00.000Z',
  },
];
