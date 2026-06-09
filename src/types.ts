/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Resident {
  id: string;
  name: string;
  gender: '남성' | '여성';
  age: number | string;
  phone: string;
  address: string;
  dong?: '면목 4동' | '면목 7동' | '면목 5동' | '면목 3·8동' | '기타 동';
  notes: string;
  registeredAt: string;
  disabilityType?: '없음' | '경증(4~5등급)' | '중증(1~3등급)';
  disabilityDetails?: string;
}

export interface Participation {
  id: string;
  residentId: string;
  programName: string;
  participationDate: string;
  durationHours: number;
  progressStatus: '참여예정' | '진행중' | '완료' | '중도포기';
  notes: string;
}

export interface Relationship {
  id: string;
  sourceId: string; // Resident ID
  targetId: string; // Resident ID
  relationType: '이웃' | '친척' | '친구' | '지인' | '돌봄제공자' | '공공기관' | '기타';
  strength: number; // 1 (낮음) to 5 (매우 높음)
  notes: string;
}

export interface GASConfig {
  url: string;
  isEnabled: boolean;
}
