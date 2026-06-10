/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Resident, Participation, Relationship } from './types';

export const MOCK_RESIDENTS: Resident[] = [
  {
    id: 'R_001',
    name: '김순자',
    gender: '여성',
    age: 78,
    phone: '010-1234-5678',
    address: '서울특별시 동대문구 장안동 102호 (초록빌라)',
    dong: '면목 4동',
    isolationGroup: '관계지원군',
    notes: '초기 관절 질환으로 거동이 다소 불편하시며, 이웃 백필례 님과 하루에 한 번 꼭 안부 전화를 나누며 절친하게 지내시는 독거 어르신.',
    registeredAt: '2025-01-10'
  },
  {
    id: 'R_002',
    name: '박용섭',
    gender: '남성',
    age: 82,
    phone: '010-9876-5432',
    address: '서울특별시 동대문구 전농동 305호',
    dong: '면목 7동',
    isolationGroup: '일상위험고립군',
    notes: '배우자 사별 후 우울 척도가 높은 편이며 복지관 노래교실을 최근 가기 시작하심. 자녀와의 연락은 거의 끊긴 단절 위험군.',
    registeredAt: '2025-02-15'
  },
  {
    id: 'R_003',
    name: '이만수',
    gender: '남성',
    age: 75,
    phone: '010-5555-1212',
    address: '서울특별시 동대문구 휘경동 상가 2층',
    dong: '면목 5동',
    isolationGroup: '해당없음',
    notes: '노인일자리 은빛가로환경 지킴이에 참여 중이시며 정령이 건강하고 이웃 주민들과 소통하는 것을 전반적으로 좋아함.',
    registeredAt: '2025-03-01'
  },
  {
    id: 'R_004',
    name: '최옥분',
    gender: '여성',
    age: 80,
    phone: '010-4444-9898',
    address: '서울특별시 동대문구 장안동 반지하 B01호',
    dong: '면목 4동',
    isolationGroup: '일상지원군',
    notes: '반지하 가구로 환기가 어렵고 고혈압 복약 지도가 필요함. 매주 2회 요양보호사(장미숙)가 방문하여 밑반찬 및 안전 확인 중.',
    registeredAt: '2025-01-22'
  },
  {
    id: 'R_005',
    name: '장미숙',
    gender: '여성',
    age: 54,
    phone: '010-8888-7777',
    address: '서울특별시 동대문구 청량리동 현대아파트',
    dong: '면목 3·8동',
    isolationGroup: '해당없음',
    notes: '휘경종합복지관 소속 가사간병 및 돌봄제공 요양보호사. 최옥분 어르신과 박용섭 어르신의 생활돌봄 담당자.',
    registeredAt: '2024-11-05'
  },
  {
    id: 'R_006',
    name: '백필례',
    gender: '여성',
    age: 79,
    phone: '010-2222-3333',
    address: '서울특별시 동대문구 장안동 101호 (초록빌라)',
    dong: '면목 4동',
    isolationGroup: '해당없음',
    notes: '김순자 님 바로 옆집에 살며 반찬을 상시 나누시는 막역한 사이. 사교성이 좋아 동네 골목 대소사를 다 꿰고 계시는 마당발 성향.',
    registeredAt: '2025-01-12'
  },
  {
    id: 'R_007',
    name: '정덕수',
    gender: '남성',
    age: 85,
    phone: '010-7777-6666',
    address: '서울특별시 동대문구 제기동 경로방 아파트 경로당 리더',
    dong: '면목 7동',
    isolationGroup: '해당없음',
    notes: '노인회 회장직을 역임하였으며 마을 리더 자원봉사자. 자립심이 아주 강하며 소외 이웃들의 가정을 모니터링하여 복지관에 연계해주심.',
    registeredAt: '2024-12-01'
  },
  {
    id: 'R_008',
    name: '소외자',
    gender: '남성',
    age: 71,
    phone: '010-0000-0000',
    address: '서울특별시 동대문구 용두동 소형 임대',
    dong: '기타 동',
    isolationGroup: '긴급위기군',
    notes: '마을 내 어떠한 연결망도 부재한 고독사 고위험 초집중 밀착 관리 대상자. 최근에 이 동네로 전입해오셨으나 활동을 일절 거부하고 계심.',
    registeredAt: '2025-05-18'
  }
];

export const MOCK_PARTICIPATIONS: Participation[] = [
  {
    id: 'P_001',
    residentId: 'R_001',
    programName: '치매예방 미술교실',
    participationDate: '2025-05-10',
    durationHours: 2,
    progressStatus: '완료',
    notes: '찰흙 만지기 과정을 하였으며 적극적으로 작품(물고기 꽃병)을 완성하시고 매우 흡족해하심.'
  },
  {
    id: 'P_002',
    residentId: 'R_002',
    programName: '실버 노래교실 <희망 가요>',
    participationDate: '2025-05-12',
    durationHours: 1.5,
    progressStatus: '진행중',
    notes: '처음에는 구석에서 노래를 소리내어 부르지 않았으나, 2회기 이후 장년 정덕수 어르신의 주도로 박수를 크게 치며 웃기 시작하심.'
  },
  {
    id: 'P_003',
    residentId: 'R_003',
    programName: '은빛가로환경 일자리 사업',
    participationDate: '2025-05-15',
    durationHours: 3,
    progressStatus: '진행중',
    notes: '지정구역 2공구 쓰레기 분리배출 캠페인 및 골목 청소 진행 완료. 지각 없이 성실히 복무하심.'
  },
  {
    id: 'P_004',
    residentId: 'R_004',
    programName: '홀몸어르신 반려식물 가꾸기',
    participationDate: '2025-05-18',
    durationHours: 1,
    progressStatus: '완료',
    notes: '스파티필룸 반려 화분을 배포 받으셨으며, 꽃이 필 때까지 잘 키워보겠다는 강력한 의지를 나타내심.'
  },
  {
    id: 'P_005',
    residentId: 'R_001',
    programName: '스마트폰 기초 활용법',
    participationDate: '2025-06-02',
    durationHours: 2,
    progressStatus: '진행중',
    notes: '카카오톡 사진 전송 기능 및 유튜브 트로트 검색 방법을 성공적으로 실습하심.'
  },
  {
    id: 'P_006',
    residentId: 'R_006',
    programName: '치매예방 미술교실',
    participationDate: '2025-05-10',
    durationHours: 2,
    progressStatus: '완료',
    notes: '단짝 김순자 어르신과 나란히 앉아 서로 작품을 칭찬해주며 화기애애하게 진행함.'
  }
];

export const MOCK_RELATIONSHIPS: Relationship[] = [
  {
    id: 'RL_001',
    sourceId: 'R_001',
    targetId: 'R_006',
    relationType: '이웃',
    strength: 5,
    notes: '옆집 살며 주 4회 이상 음식 교류를 하는 최고 밀착 절친. 김순자 어르신의 일상 생활 긴급상황 시 가장 신뢰하는 망.'
  },
  {
    id: 'RL_002',
    sourceId: 'R_005',
    targetId: 'R_004',
    relationType: '돌봄제공자',
    strength: 4,
    notes: '요양보호 자격으로 주 2회 생활 가사 지원 및 가벼운 말벗 지원 제공 중.'
  },
  {
    id: 'RL_003',
    sourceId: 'R_007',
    targetId: 'R_002',
    relationType: '지인',
    strength: 3,
    notes: '노인 복지관 노래교실에 적응하지 못하던 박용섭 어르신에게 먼저 다가가 짝을 지어주고 챙겨 준 인연.'
  },
  {
    id: 'RL_004',
    sourceId: 'R_003',
    targetId: 'R_007',
    relationType: '지인',
    strength: 3,
    notes: '골목 환경정리 일자리 과정에서 서로의 동선과 구역을 공유하며 매주 대화 나누는 주민 동료.'
  },
  {
    id: 'RL_005',
    sourceId: 'R_005',
    targetId: 'R_002',
    relationType: '돌봄제공자',
    strength: 4,
    notes: '우울감이 높은 박용섭 어르신의 복지관 외출 동행 보조 및 복약 모니터링 돌봄 지원.'
  },
  {
    id: 'RL_006',
    sourceId: 'R_001',
    targetId: 'R_007',
    relationType: '이웃',
    strength: 2,
    notes: '정덕수 회장님이 동네 순찰 중 김순자 어르신의 근황에 대해 정기적인 말벗 안부를 짧게 주고받음.'
  }
];
