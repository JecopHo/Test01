/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Resident {
  id: string;
  name: string;
  gender: '남성' | '여성';
  age: number;
  phone: string;
  address: string;
  notes: string;
  registeredAt: string;
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
  relationType: '이웃' | '친척' | '친구' | '지인' | '돌봄제공자' | '기타';
  strength: number; // 1 (낮음) to 5 (매우 높음)
  notes: string;
}

export interface GASConfig {
  url: string;
  isEnabled: boolean;
}
