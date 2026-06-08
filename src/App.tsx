/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, 
  Map, 
  Layers, 
  Database, 
  Plus, 
  Search, 
  Trash2, 
  Edit, 
  ExternalLink, 
  Copy, 
  Check, 
  RefreshCw, 
  UserPlus, 
  Calendar, 
  Link as LinkIcon, 
  Info, 
  X,
  AlertTriangle,
  UserCheck,
  Activity,
  HeartHandshake
} from 'lucide-react';
import { Resident, Participation, Relationship, GASConfig } from './types';
import { MOCK_RESIDENTS, MOCK_PARTICIPATIONS, MOCK_RELATIONSHIPS } from './mockData';
import { GOOGLE_APPS_SCRIPT_CODE } from './code.gs';
import NetworkGraph from './components/NetworkGraph';

export default function App() {
  // --- 메인 상태 ---
  const [residents, setResidents] = useState<Resident[]>([]);
  const [participations, setParticipations] = useState<Participation[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  
  // GAS 연동 상태
  const [gasConfig, setGasConfig] = useState<GASConfig>({
    url: '',
    isEnabled: false
  });
  
  // UI 컨트롤
  const [activeTab, setActiveTab] = useState<'residents' | 'graph' | 'programs' | 'gasSetup'>('residents');
  const [selectedResident, setSelectedResident] = useState<Resident | null>(null);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);

  // 모달 제어 상태
  const [showResidentModal, setShowResidentModal] = useState<boolean>(false);
  const [showParticipationModal, setShowParticipationModal] = useState<boolean>(false);
  const [showRelationshipModal, setShowRelationshipModal] = useState<boolean>(false);

  // 폼 입력용 임시 상태
  const [editingResident, setEditingResident] = useState<Partial<Resident> | null>(null);
  const [newParticipation, setNewParticipation] = useState<Partial<Participation>>({
    programName: '',
    participationDate: new Date().toISOString().split('T')[0],
    durationHours: 2,
    progressStatus: '참여예정',
    notes: ''
  });
  const [newRelationship, setNewRelationship] = useState<Partial<Relationship>>({
    sourceId: '',
    targetId: '',
    relationType: '이웃',
    strength: 3,
    notes: ''
  });

  // 주민 명록 검색 및 필터링
  const [residentSearch, setResidentSearch] = useState<string>('');
  const [genderFilter, setGenderFilter] = useState<string>('모두');
  const [ageRangeFilter, setAgeRangeFilter] = useState<string>('모두');

  // --- 데이터 불러오기 및 초기화 ---
  useEffect(() => {
    // 1. 로컬 스토리지에서 GAS 설정 로드
    const storedGasUrl = localStorage.getItem('gas_url');
    const storedGasEnabled = localStorage.getItem('gas_enabled') === 'true';
    
    if (storedGasUrl) {
      setGasConfig({ url: storedGasUrl, isEnabled: storedGasEnabled });
    }

    // 2. 가용 데이터 로드
    if (storedGasEnabled && storedGasUrl) {
      // GAS 시트 연동 로드
      fetchFromGAS(storedGasUrl);
    } else {
      // 로컬 스토리지 캐시 로드, 없다면 기본 모크 데이터 시드 생성
      const cachedRes = localStorage.getItem('sa_residents');
      const cachedPart = localStorage.getItem('sa_participations');
      const cachedRel = localStorage.getItem('sa_relationships');

      if (cachedRes && cachedPart && cachedRel) {
        setResidents(JSON.parse(cachedRes));
        setParticipations(JSON.parse(cachedPart));
        setRelationships(JSON.parse(cachedRel));
      } else {
        // 기본 셋업
        setResidents(MOCK_RESIDENTS);
        setParticipations(MOCK_PARTICIPATIONS);
        setRelationships(MOCK_RELATIONSHIPS);
        saveToLocalStorage(MOCK_RESIDENTS, MOCK_PARTICIPATIONS, MOCK_RELATIONSHIPS);
      }
    }
  }, []);

  // 오프라인 로컬 저장 헬퍼
  const saveToLocalStorage = (res: Resident[], part: Participation[], rel: Relationship[]) => {
    localStorage.setItem('sa_residents', JSON.stringify(res));
    localStorage.setItem('sa_participations', JSON.stringify(part));
    localStorage.setItem('sa_relationships', JSON.stringify(rel));
  };

  // --- GAS 웹앱 시트 API 비동기 통신 메소드 ---
  const fetchFromGAS = async (url: string) => {
    setIsLoading(true);
    setSyncStatus('idle');
    setSyncError(null);
    try {
      // CORS 우회를 위해 Apps Script 웹앱 URL에 익스텐션 쿼리 추가
      const response = await fetch(`${url}?action=getAll`);
      const payload = await response.json();
      
      if (payload.success && payload.data) {
        const { residents: res, participations: part, relationships: rel } = payload.data;
        setResidents(res || []);
        setParticipations(part || []);
        setRelationships(rel || []);
        saveToLocalStorage(res || [], part || [], rel || []);
        setSyncStatus('success');
      } else {
        throw new Error(payload.error || '스프레드시트 데이터를 로드하는 도중 오류가 발생했습니다.');
      }
    } catch (err: any) {
      console.error(err);
      setSyncStatus('error');
      setSyncError(err.toString());
      // 통신 실패 시 캐시된 최신 로컬 데이터 반환
      const cachedRes = localStorage.getItem('sa_residents');
      const cachedPart = localStorage.getItem('sa_participations');
      const cachedRel = localStorage.getItem('sa_relationships');
      if (cachedRes) setResidents(JSON.parse(cachedRes));
      if (cachedPart) setParticipations(JSON.parse(cachedPart));
      if (cachedRel) setRelationships(JSON.parse(cachedRel));
    } finally {
      setIsLoading(false);
    }
  };

  const postToGAS = async (action: string, data: any) => {
    if (!gasConfig.isEnabled || !gasConfig.url) return true;
    
    setIsLoading(true);
    try {
      const response = await fetch(gasConfig.url, {
        method: 'POST',
        mode: 'no-cors', // GAS의 CORS Redirect 한계를 피하기 위해 no-cors 모드로 송출
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action, data })
      });
      // no-cors 설정 시 response.json() 해독이 아예 거절되나, 데이터 쓰기는 정상 인입됩니다.
      return true;
    } catch (err) {
      console.error('GAS POST 에러:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // --- 데이터 갱신 동기화 수동 조작 ---
  const handleManualSync = () => {
    if (gasConfig.url) {
      fetchFromGAS(gasConfig.url);
    }
  };

  // --- 연동 URL 저장 프로세서 ---
  const handleSaveGasConfig = async (newUrl: string, enable: boolean) => {
    const cleanUrl = newUrl.trim();
    localStorage.setItem('gas_url', cleanUrl);
    localStorage.setItem('gas_enabled', enable ? 'true' : 'false');
    setGasConfig({ url: cleanUrl, isEnabled: enable });

    if (enable && cleanUrl) {
      await fetchFromGAS(cleanUrl);
    } else {
      // 연동 오프 시 로컬 캐시로 즉시 안전 이관
      const cachedRes = localStorage.getItem('sa_residents');
      const cachedPart = localStorage.getItem('sa_participations');
      const cachedRel = localStorage.getItem('sa_relationships');
      if (cachedRes) {
        setResidents(JSON.parse(cachedRes));
        setParticipations(JSON.parse(cachedPart));
        setRelationships(JSON.parse(cachedRel));
      }
      setSyncStatus('idle');
    }
  };

  // --- 복사 이벤트 핸들러 ---
  const handleCopyCode = () => {
    navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_CODE);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  // --- CRUD 기능 동작 구현 ---

  // 주민 추가 및 수정
  const handleSaveResidentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingResident?.name) return;

    let updatedResidents = [...residents];
    const isNew = !editingResident.id;
    const residentId = editingResident.id || 'R_' + Date.now();
    
    const targetResident: Resident = {
      id: residentId,
      name: editingResident.name,
      gender: (editingResident.gender || '여성') as '남성' | '여성',
      age: Number(editingResident.age || 70),
      phone: editingResident.phone || '010-0000-0000',
      address: editingResident.address || '미정',
      notes: editingResident.notes || '',
      registeredAt: editingResident.registeredAt || new Date().toISOString().split('T')[0]
    };

    if (isNew) {
      updatedResidents.unshift(targetResident);
    } else {
      updatedResidents = updatedResidents.map(r => r.id === residentId ? targetResident : r);
    }

    setResidents(updatedResidents);
    saveToLocalStorage(updatedResidents, participations, relationships);

    // 상세 프로필 뷰 동기화
    if (selectedResident && selectedResident.id === residentId) {
      setSelectedResident(targetResident);
    }

    // Google Sheets 데이터 비동기 업로드
    await postToGAS('saveResident', targetResident);
    
    setShowResidentModal(false);
    setEditingResident(null);

    // 연동된 시트 실시간 패치
    if (gasConfig.isEnabled && gasConfig.url) {
      setTimeout(() => fetchFromGAS(gasConfig.url), 1000);
    }
  };

  // 주민 삭제
  const handleDeleteResident = async (id: string) => {
    if (!confirm('해당 주민 정보를 삭제하시겠습니까?\n프로파일 제거 시, 이 주민과 얽힌 모든 "프로그램 참여 이력" 과 "네트워크 이웃 관계망" 도 무결성을 위해 완전히 영구 삭제 처리됩니다.')) {
      return;
    }

    const updatedResidents = residents.filter(r => r.id !== id);
    // 연쇄 폭포 삭제 (Cascade Delete)
    const updatedParticipations = participations.filter(p => p.residentId !== id);
    const updatedRelationships = relationships.filter(rel => rel.sourceId !== id && rel.targetId !== id);

    setResidents(updatedResidents);
    setParticipations(updatedParticipations);
    setRelationships(updatedRelationships);
    saveToLocalStorage(updatedResidents, updatedParticipations, updatedRelationships);

    if (selectedResident?.id === id) {
      setSelectedResident(null);
    }

    // Google Sheets 데이터 비동기 삭제
    await postToGAS('deleteResident', { id });

    if (gasConfig.isEnabled && gasConfig.url) {
      setTimeout(() => fetchFromGAS(gasConfig.url), 1000);
    }
  };

  // 참여이력 추가
  const handleAddParticipationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newParticipation.residentId || !newParticipation.programName) return;

    const participationId = 'P_' + Date.now();
    const item: Participation = {
      id: participationId,
      residentId: newParticipation.residentId,
      programName: newParticipation.programName,
      participationDate: newParticipation.participationDate || new Date().toISOString().split('T')[0],
      durationHours: Number(newParticipation.durationHours || 2),
      progressStatus: (newParticipation.progressStatus || '참여예정') as '참여예정' | '진행중' | '완료' | '중도포기',
      notes: newParticipation.notes || ''
    };

    const updatedParticipations = [item, ...participations];
    setParticipations(updatedParticipations);
    saveToLocalStorage(residents, updatedParticipations, relationships);

    await postToGAS('saveParticipation', item);

    setShowParticipationModal(false);
    setNewParticipation({
      programName: '',
      participationDate: new Date().toISOString().split('T')[0],
      durationHours: 2,
      progressStatus: '참여예정',
      notes: ''
    });

    if (gasConfig.isEnabled && gasConfig.url) {
      setTimeout(() => fetchFromGAS(gasConfig.url), 1000);
    }
  };

  // 참여이력 삭제
  const handleDeleteParticipation = async (id: string) => {
    if (!confirm('이 참여 기록을 기록장부에서 영구 삭제하시겠습니까?')) return;

    const updated = participations.filter(p => p.id !== id);
    setParticipations(updated);
    saveToLocalStorage(residents, updated, relationships);

    await postToGAS('deleteParticipation', { id });

    if (gasConfig.isEnabled && gasConfig.url) {
      setTimeout(() => fetchFromGAS(gasConfig.url), 1000);
    }
  };

  // 관계망 추가
  const handleAddRelationshipSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRelationship.sourceId || !newRelationship.targetId) return;
    if (newRelationship.sourceId === newRelationship.targetId) {
      alert('동일인물 간의 관계는 정의할 수 없습니다. 서로 다른 이웃을 매핑해주세요.');
      return;
    }

    // 중복 관계선이 존재하는지 검증
    const alreadyConnected = relationships.some(rel => 
      (rel.sourceId === newRelationship.sourceId && rel.targetId === newRelationship.targetId) ||
      (rel.sourceId === newRelationship.targetId && rel.targetId === newRelationship.sourceId)
    );

    if (alreadyConnected) {
      alert('해당 주민들 간 정의된 관계망 연결 고리가 이미 존재합니다. 다시 한 번 조회하십시오.');
      return;
    }

    const relationshipId = 'RL_' + Date.now();
    const item: Relationship = {
      id: relationshipId,
      sourceId: newRelationship.sourceId,
      targetId: newRelationship.targetId,
      relationType: (newRelationship.relationType || '이웃') as '이웃' | '친척' | '친구' | '지인' | '돌봄제공자' | '기타',
      strength: Number(newRelationship.strength || 3),
      notes: newRelationship.notes || ''
    };

    const updatedRelationships = [item, ...relationships];
    setRelationships(updatedRelationships);
    saveToLocalStorage(residents, participations, updatedRelationships);

    await postToGAS('saveRelationship', item);

    setShowRelationshipModal(false);
    setNewRelationship({
      sourceId: '',
      targetId: '',
      relationType: '이웃',
      strength: 3,
      notes: ''
    });

    if (gasConfig.isEnabled && gasConfig.url) {
      setTimeout(() => fetchFromGAS(gasConfig.url), 1000);
    }
  };

  // 관계망 삭제
  const handleDeleteRelationship = async (id: string) => {
    if (!confirm('이 주민들 간 네트워크 관계 연결고리를 삭제하여 대화망에서 분리하시겠습니까?')) return;

    const updated = relationships.filter(r => r.id !== id);
    setRelationships(updated);
    saveToLocalStorage(residents, participations, updated);

    await postToGAS('deleteRelationship', { id });

    if (gasConfig.isEnabled && gasConfig.url) {
      setTimeout(() => fetchFromGAS(gasConfig.url), 1000);
    }
  };

  // --- 필터 처리된 주민 목록 ---
  const filteredResidents = useMemo(() => {
    return residents.filter(res => {
      const matchSearch = res.name.toLowerCase().includes(residentSearch.toLowerCase()) || 
                          res.phone.includes(residentSearch) || 
                          (res.address && res.address.toLowerCase().includes(residentSearch.toLowerCase()));
      const matchGender = genderFilter === '모두' || res.gender === genderFilter;
      
      let matchAge = true;
      if (ageRangeFilter === '70미만') matchAge = res.age < 70;
      else if (ageRangeFilter === '70대') matchAge = res.age >= 70 && res.age < 80;
      else if (ageRangeFilter === '80이상') matchAge = res.age >= 80;

      return matchSearch && matchGender && matchAge;
    });
  }, [residents, residentSearch, genderFilter, ageRangeFilter]);

  // 해당 주민과 얽힌 프로그램 참여 이력 목록
  const currentResidentParticipations = useMemo(() => {
    if (!selectedResident) return [];
    return participations.filter(p => p.residentId === selectedResident.id);
  }, [selectedResident, participations]);

  // 해당 주민과 얽힌 관계인 서클
  const currentResidentRelationships = useMemo(() => {
    if (!selectedResident) return [];
    return relationships.filter(r => r.sourceId === selectedResident.id || r.targetId === selectedResident.id);
  }, [selectedResident, relationships]);

  // --- 통합 대시보드 통계 계산기 ---
  const dashboardStats = useMemo(() => {
    const total = residents.length;
    const female = residents.filter(r => r.gender === '여성').length;
    const male = residents.filter(r => r.gender === '남성').length;
    
    // 외톨이 / 무관계(Isolated) 선별
    const isolatedCount = residents.filter(r => {
      const linksCount = relationships.filter(rel => 
        (rel.sourceId === r.id || rel.targetId === r.id) &&
        residents.some(x => x.id === rel.sourceId) &&
        residents.some(x => x.id === rel.targetId)
      ).length;
      return linksCount === 0;
    }).length;

    // 진행 프로그램 종목 수 추출
    const programKinds = Array.from(new Set(participations.map(p => p.programName))).length;

    return { total, female, male, isolatedCount, programKinds };
  }, [residents, relationships, participations]);

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-800 flex flex-col" id="service-root">
      {/* 🚀 상단 메인 GNB 헤더 가이드바 */}
      <header className="bg-indigo-900 border-b border-indigo-950 sticky top-0 z-40 px-6 py-3 flex flex-wrap justify-between items-center gap-4 shadow-md text-white" id="main-header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-500 rounded flex items-center justify-center text-white shadow-sm">
            <HeartHandshake className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-md font-bold text-white tracking-tight flex items-center gap-2">
              지역복지 주민 통합 관리 시스템
              <span className="text-xs bg-indigo-800 text-indigo-200 border border-indigo-700 px-1.5 py-0.5 rounded font-normal">
                v2.4.0
              </span>
              <span className="text-xs bg-indigo-700 text-indigo-100 px-1.5 py-0.5 rounded font-semibold hidden md:inline">
                GAS 풀스택 API 연결지원
              </span>
            </h1>
            <p className="text-xs text-indigo-300">종합사회복지관 2팀 · 구글 스프레드시트 소셜 관계 데이터 분석 엣지</p>
          </div>
        </div>

        {/* 연동 동기화 클라우드 컨트롤 박스 */}
        <div className="flex items-center gap-3" id="cloud-database-status">
          <div className={`flex items-center gap-2 px-3 py-1 text-xs font-semibold border rounded ${
            gasConfig.isEnabled 
              ? 'bg-indigo-800/80 text-indigo-200 border-indigo-700' 
              : 'bg-amber-900/60 text-amber-200 border-amber-800'
          }`}>
            <Database className="w-3.5 h-3.5" />
            <span>{gasConfig.isEnabled ? '실시간 구글 시트 연동 중' : '체험 모드 (로컬 저장)'}</span>
            {gasConfig.isEnabled && (
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping"></span>
            )}
          </div>

          <div className="flex gap-1.5">
            {gasConfig.isEnabled && (
              <button 
                onClick={handleManualSync}
                disabled={isLoading}
                className="bg-indigo-800 hover:bg-indigo-700 border border-indigo-700 p-1.5 px-3 rounded text-indigo-200 font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                <span>데이터 동기화</span>
              </button>
            )}
            <button
              onClick={() => setActiveTab('gasSetup')}
              className={`p-1.5 px-3 rounded border text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'gasSetup' 
                  ? 'bg-indigo-500 text-white border-indigo-400' 
                  : 'bg-indigo-850 hover:bg-indigo-800 text-indigo-200 border-indigo-750'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              연결 설정
            </button>
          </div>
        </div>
      </header>

      {/* 📊 상단 핵심 대시보드 통계 카드 */}
      <section className="px-6 pt-4" id="brief-welfare-dashboard">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          <div className="bg-white p-3 rounded border border-slate-200 shadow-sm flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">등록 주민</div>
              <div className="text-xl font-bold text-slate-900">{dashboardStats.total}명</div>
              <div className="text-[10px] text-slate-500 mt-0.5">남 {dashboardStats.male} · 여 {dashboardStats.female}</div>
            </div>
          </div>

          <div className="bg-white p-3 rounded border border-slate-200 shadow-sm flex items-center gap-3">
            <div className="p-2.5 bg-rose-50 text-rose-600 rounded">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">고립 위기선별</div>
              <div className="text-xl font-bold text-rose-600">{dashboardStats.isolatedCount}명</div>
              <div className="text-[10px] text-rose-500 mt-0.5">이웃 관계 단절 위험 대상</div>
            </div>
          </div>

          <div className="bg-white p-3 rounded border border-slate-200 shadow-sm flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">등록 연결 고리</div>
              <div className="text-xl font-bold text-indigo-950">{relationships.length}쌍</div>
              <div className="text-[10px] text-slate-500 mt-0.5">마을 내 수집된 밀착관계 전반</div>
            </div>
          </div>

          <div className="bg-white p-3 rounded border border-slate-200 shadow-sm flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">운영 프로그램</div>
              <div className="text-xl font-bold text-blue-900">{dashboardStats.programKinds}개</div>
              <div className="text-[10px] text-slate-500 mt-0.5">등록된 사회 활동 카테고리</div>
            </div>
          </div>

          <div className="bg-slate-800 text-white p-3 rounded border border-slate-700 shadow-sm flex flex-col justify-between col-span-2 md:col-span-4 lg:col-span-1">
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-indigo-300 font-bold uppercase tracking-wider">Cloud Space</span>
              <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
            </div>
            <div className="mt-1">
              <div className="text-[10px] text-slate-300 font-semibold">데이터 저장 인원 제한</div>
              <div className="text-lg font-bold text-white">∞ 무제한 무료</div>
              <div className="text-[9px] text-indigo-300 mt-0.5">GAS API 기반 무제한 추가 수집</div>
            </div>
          </div>
        </div>
      </section>

      {/* 📁 메인 콘텐츠 영역 */}
      <main className="flex-1 px-6 py-4 flex flex-col gap-4">
        {/* 네비게이션 탭 아이템 바 */}
        <div className="flex border-b border-slate-200">
          <button
            onClick={() => { setActiveTab('residents'); setSelectedResident(null); }}
            className={`px-5 py-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'residents' 
                ? 'border-indigo-600 text-indigo-700 font-bold bg-indigo-50/45 rounded-t-lg' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            주민 원장 및 돌봄 명록
          </button>
          <button
            onClick={() => { setActiveTab('graph'); setSelectedResident(null); }}
            className={`px-5 py-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'graph' 
                ? 'border-indigo-600 text-indigo-700 font-bold bg-indigo-50/45 rounded-t-lg' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Map className="w-4 h-4" />
            이웃 인공지능 관계망 지도
          </button>
          <button
            onClick={() => { setActiveTab('programs'); setSelectedResident(null); }}
            className={`px-5 py-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'programs' 
                ? 'border-indigo-600 text-indigo-700 font-bold bg-indigo-50/45 rounded-t-lg' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            복지관 서비스 수혜 현황
          </button>
          <button
            onClick={() => { setActiveTab('gasSetup'); setSelectedResident(null); }}
            className={`px-5 py-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer ml-auto ${
              activeTab === 'gasSetup' 
                ? 'border-indigo-650 text-indigo-700 font-bold bg-indigo-50/45 rounded-t-lg' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Database className="w-4 h-4" />
            구글 시트 연동 설계실 (Apps Script)
          </button>
        </div>

        {/* 탭 분기 내용 그리기 */}
        <section className="flex-1">
          {/* TAB 1: 주민 명부(Residents Ledger) 및 사이드바 상세 프로필 */}
          {activeTab === 'residents' && (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start" id="view-residents-tab">
              {/* 주민 리스트 구역 */}
              <div className={`${selectedResident ? 'xl:col-span-2' : 'xl:col-span-3'} bg-white border border-slate-200 rounded shadow-sm p-4 flex flex-col gap-3`}>
                <div className="flex flex-wrap justify-between items-center gap-4">
                  <div>
                    <h2 className="text-sm font-bold text-slate-950">지역 주민 대장 ({filteredResidents.length}명)</h2>
                    <p className="text-xs text-slate-400">인적정보 및 최근의 상담기록, 연락망 정보를 검색·조정할 수 있습니다.</p>
                  </div>
                  <button
                    onClick={() => {
                      setEditingResident({
                        name: '',
                        gender: '여성',
                        age: 78,
                        phone: '',
                        address: '',
                        notes: '',
                        registeredAt: new Date().toISOString().split('T')[0]
                      });
                      setShowResidentModal(true);
                    }}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3.5 py-2 rounded flex items-center gap-1.5 cursor-pointer shadow transition-colors ml-auto"
                  >
                    <UserPlus className="w-4 h-4" />
                    새로운 주민 등록
                  </button>
                </div>

                {/* 검색 필터 바 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded border border-slate-200">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="이름, 연락처, 주소 검색"
                      value={residentSearch}
                      onChange={(e) => setResidentSearch(e.target.value)}
                      className="w-full text-xs pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded outline-hidden focus:ring-2 focus:ring-indigo-500"
                    />
                    <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  </div>
                  <div>
                    <select
                      value={genderFilter}
                      onChange={(e) => setGenderFilter(e.target.value)}
                      className="w-full text-xs bg-white border border-slate-200 rounded p-1.5 outline-hidden focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="모두">성별: 모두</option>
                      <option value="남성">성별: 남성</option>
                      <option value="여성">성별: 여성</option>
                    </select>
                  </div>
                  <div>
                    <select
                      value={ageRangeFilter}
                      onChange={(e) => setAgeRangeFilter(e.target.value)}
                      className="w-full text-xs bg-white border border-slate-200 rounded p-1.5 outline-hidden focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="모두">연령 분포: 모두</option>
                      <option value="70미만">70세 미만</option>
                      <option value="70대">70대 (70~79세)</option>
                      <option value="80이상">80세 이상 할아버지/할머니</option>
                    </select>
                  </div>
                </div>

                {/* 주민 테이블 그리드 */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                        <th className="p-2.5">성명</th>
                        <th className="p-2.5">성별 / 연령</th>
                        <th className="p-2.5">연락처</th>
                        <th className="p-2.5">실제 주소지</th>
                        <th className="p-2.5">참여 수 / 이웃 수</th>
                        <th className="p-2.5 text-right">상세진단</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredResidents.map(res => {
                        const partCount = participations.filter(p => p.residentId === res.id).length;
                        const relCount = relationships.filter(rel => rel.sourceId === res.id || rel.targetId === res.id).length;
                        
                        return (
                          <tr 
                            key={res.id} 
                            onClick={() => setSelectedResident(res)}
                            className={`hover:bg-slate-50 transition-colors cursor-pointer ${selectedResident?.id === res.id ? 'bg-indigo-50/70 border-l-4 border-indigo-600 font-medium' : ''}`}
                          >
                            <td className="p-2.5 font-semibold text-slate-900">{res.name}</td>
                            <td className="p-2.5">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold mr-1.5 ${
                                res.gender === '남성' ? 'bg-cyan-50 text-cyan-700 border border-cyan-100' : 'bg-rose-50 text-rose-700 border border-rose-100'
                              }`}>
                                {res.gender}
                              </span>
                              {res.age}세
                            </td>
                            <td className="p-2.5 text-slate-600 font-mono">{res.phone}</td>
                            <td className="p-2.5 text-slate-500 max-w-xs truncate">{res.address}</td>
                            <td className="p-2.5">
                              <span className="bg-blue-50 text-blue-700 font-bold px-1.5 py-0.5 rounded mr-1">{partCount}</span>
                              <span className="bg-indigo-50 text-indigo-700 font-bold px-1.5 py-0.5 rounded">{relCount}</span>
                              {relCount === 0 && (
                                <span className="ml-2 bg-red-100 text-red-700 text-[9px] px-1.5 py-0.5 rounded font-bold">고립위험</span>
                              )}
                            </td>
                            <td className="p-2.5 text-right">
                              <div className="flex gap-2 justify-end" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => {
                                    setEditingResident(res);
                                    setShowResidentModal(true);
                                  }}
                                  className="p-1 px-1.5 border border-slate-200 hover:border-indigo-500 rounded bg-white hover:text-indigo-600 transition-colors cursor-pointer"
                                  title="편적정보 수정"
                                >
                                  <Edit className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => handleDeleteResident(res.id)}
                                  className="p-1 px-1.5 border border-slate-200 hover:border-red-500 rounded bg-white hover:text-red-600 transition-colors cursor-pointer"
                                  title="데이터 삭제"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}

                      {filteredResidents.length === 0 && (
                        <tr>
                          <td colSpan={6} className="text-center p-8 text-slate-400 bg-slate-50 rounded-xl">
                            검색 조건에 해당되는 주민 정보가 부재합니다. 다시 한 번 조회하십시오.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 주민 1인 심화 프로필 뷰 영역 */}
              {selectedResident && (
                <div className="xl:col-span-1 bg-white border border-indigo-600/35 rounded shadow-sm p-4 flex flex-col gap-3 relative max-h-[85vh] xl:max-h-[850px]">
                  <button
                    onClick={() => setSelectedResident(null)}
                    className="absolute top-4 right-4 p-1 rounded hover:bg-slate-100 text-slate-400 transition-colors cursor-pointer z-10"
                  >
                    <X className="w-4 h-4" />
                  </button>

                  <div className="border-b border-slate-200 pb-2.5 flex-none select-none">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      selectedResident.gender === '남성' ? 'bg-cyan-50 text-cyan-700 border border-cyan-150' : 'bg-rose-50 text-rose-700 border border-rose-150'
                    }`}>
                      {selectedResident.gender} (만 {selectedResident.age}세)
                    </span>
                    <h3 className="text-sm font-bold text-slate-900 mt-1">{selectedResident.name} 어르신 상세 프로파일</h3>
                    <p className="text-[10px] text-slate-400">등록일: {selectedResident.registeredAt}</p>
                  </div>

                  {/* 스크롤 가능한 본문 영역 */}
                  <div className="flex-1 overflow-y-auto pr-1 space-y-4 max-h-[60vh] xl:max-h-[700px] scrollbar-thin">
                    {/* 인적 사유 정보 */}
                    <div className="space-y-2 text-xs text-slate-700 bg-slate-50 p-2.5 rounded border border-slate-200">
                      <div>
                        <span className="font-semibold text-slate-500 block text-[10px]">📞 안부 비상연락처</span>
                        <span className="font-mono text-slate-800">{selectedResident.phone || '등록대기'}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-slate-500 block text-[10px]">🏠 실제 주소지</span>
                        <span className="text-slate-800 leading-relaxed text-[11px]">{selectedResident.address || '기재대기'}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-slate-500 block text-[10px]">📝 사례 진단 특이사항</span>
                        <p className="text-[11px] text-slate-600 bg-white p-2 rounded border border-slate-200 leading-relaxed mt-1 whitespace-pre-wrap">
                          {selectedResident.notes || '접수된 구체적인 인적상태 진단 요약이 존재하지 않습니다.'}
                        </p>
                      </div>
                    </div>

                    {/* 1. 참여 이력 세부 목록 */}
                    <div>
                      <div className="flex justify-between items-center mb-1.5">
                        <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-blue-500" />
                          복지 서비스 참여기록 ({currentResidentParticipations.length}건)
                        </h4>
                        <button
                          onClick={() => {
                            setNewParticipation(prev => ({ ...prev, residentId: selectedResident.id }));
                            setShowParticipationModal(true);
                          }}
                          className="text-[10px] bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold px-2 py-0.5 rounded border border-blue-200 flex items-center gap-0.5 cursor-pointer transition-colors"
                        >
                          <Plus className="w-2.5 h-2.5" />
                          기록 추가
                        </button>
                      </div>
                      
                      <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                        {currentResidentParticipations.map(p => (
                          <div key={p.id} className="p-2 bg-blue-50/40 border border-blue-100 rounded flex justify-between items-start text-xs group">
                            <div className="flex-1 min-w-0 pr-2">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-blue-900 truncate text-[11px]">{p.programName}</span>
                                <span className={`text-[9px] px-1.5 py-0.2 rounded font-semibold capitalize ${
                                  p.progressStatus === '완료' 
                                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' 
                                    : p.progressStatus === '진행중' 
                                    ? 'bg-blue-50 text-blue-800 border border-blue-205'
                                    : 'bg-amber-55 text-amber-800'
                                }`}>
                                  {p.progressStatus}
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-400 mt-0.5">{p.participationDate} (총 {p.durationHours}시간)</div>
                              {p.notes && <p className="text-[10px] text-slate-600 mt-1 bg-white p-1 rounded border border-blue-50">{p.notes}</p>}
                            </div>
                            <button
                              onClick={() => handleDeleteParticipation(p.id)}
                              className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer p-0.5"
                              title="기록 삭제"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                        {currentResidentParticipations.length === 0 && (
                          <div className="text-center p-3 text-slate-400 bg-slate-50 rounded border border-slate-200 text-[11px]">
                            참여한 프로그램 기록이 비어있습니다.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 2. 소셜 관계인 교보 목록 */}
                    <div>
                      <div className="flex justify-between items-center mb-1.5">
                        <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1">
                          <LinkIcon className="w-3.5 h-3.5 text-indigo-500" />
                          지역 이웃 관계망 ({currentResidentRelationships.length}명)
                        </h4>
                        <button
                          onClick={() => {
                            setNewRelationship(prev => ({ ...prev, sourceId: selectedResident.id }));
                            setShowRelationshipModal(true);
                          }}
                          className="text-[10px] bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold px-2 py-0.5 rounded border border-indigo-200 flex items-center gap-0.5 cursor-pointer transition-colors"
                        >
                          <Plus className="w-2.5 h-2.5" />
                          관계선 추가
                        </button>
                      </div>

                      <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                        {currentResidentRelationships.map(rel => {
                          const otherId = rel.sourceId === selectedResident.id ? rel.targetId : rel.sourceId;
                          const otherResident = residents.find(r => r.id === otherId);

                          if (!otherResident) return null;

                          return (
                            <div key={rel.id} className="p-2 bg-indigo-50/40 border border-indigo-100 rounded flex justify-between items-center text-xs group">
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-slate-800 text-[11px]">{otherResident.name}</span>
                                  <span className="text-[10px] bg-indigo-100 text-indigo-800 px-1.5 py-0.2 rounded font-semibold">{rel.relationType}</span>
                                  <span className="text-amber-500 font-semibold text-[9px]">{'★'.repeat(rel.strength)}</span>
                                </div>
                                <div className="text-[10px] text-slate-500 mt-0.5">상세: {rel.notes || '상태교류 일지 미작성'}</div>
                              </div>
                              <button
                                onClick={() => handleDeleteRelationship(rel.id)}
                                className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer p-0.5"
                                title="관계 끊기"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          );
                        })}
                        {currentResidentRelationships.length === 0 && (
                          <div className="text-center p-3 text-red-500 bg-red-50 border border-red-200 rounded text-[11px] font-semibold flex flex-col items-center justify-center gap-1">
                            <AlertTriangle className="w-4 h-4 text-red-400" />
                            <span>이웃 관계망 분석 격리 상태입니다!</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: d3.js 네트워크 관계망 시각화 디스플레이 */}
          {activeTab === 'graph' && (
            <div className="bg-white border border-slate-200 rounded shadow-sm p-4" id="view-network-tab">
              <div className="mb-4">
                <h2 className="text-sm font-bold text-slate-950 flex items-center gap-1.5">
                  <Map className="w-5 h-5 text-indigo-650" />
                  지역 주민 대화 이력 및 소셜 지형 관계도 (D3 물리 그래프)
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  복지관 소속 요양보호사, 마당발 이웃, 밀접 친지 정보와 고독 위험 소외 가구들을 피직스 노드 레이아웃으로 실시간 시뮬레이션 및 모니터링합니다.
                </p>
              </div>

              {/* D3 컴포넌트 호출 */}
              <NetworkGraph 
                residents={residents} 
                relationships={relationships} 
                onSelectResident={(res) => {
                  setSelectedResident(res);
                  setActiveTab('residents'); // 상세 조회로 탭 이관
                }}
              />
            </div>
          )}

          {/* TAB 3: 참여 프로그램 관리 (Program List) */}
          {activeTab === 'programs' && (
            <div className="bg-white border border-slate-200 rounded shadow-sm p-4" id="view-programs-tab">
              <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
                <div>
                  <h2 className="text-sm font-bold text-slate-950">복지 서비스 참여수혜 총괄장부</h2>
                  <p className="text-xs text-slate-400">마을 주민들이 어떤 복지 프로그램이나 일자리에 등록하여 자생을 꾸려가는지 원 데이터 통계를 전단 조회합니다.</p>
                </div>
                <button
                  onClick={() => {
                    setNewParticipation({
                      residentId: residents[0]?.id || '',
                      programName: '',
                      participationDate: new Date().toISOString().split('T')[0],
                      durationHours: 2,
                      progressStatus: '참여예정',
                      notes: ''
                    });
                    setShowParticipationModal(true);
                  }}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3.5 py-2 rounded flex items-center gap-1.5 cursor-pointer shadow transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  새로운 수혜 등록
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                      <th className="p-2.5">수혜자성명</th>
                      <th className="p-2.5">참여 프로그램명</th>
                      <th className="p-2.5">수혜 일조</th>
                      <th className="p-2.5">수당 (시간)</th>
                      <th className="p-2.5">진행 상태</th>
                      <th className="p-2.5">기록내용 및 비고</th>
                      <th className="p-2.5 text-right">삭제</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {participations.map(p => {
                      const res = residents.find(r => r.id === p.residentId);
                      return (
                        <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-2.5">
                            {res ? (
                              <button 
                                onClick={() => { setSelectedResident(res); setActiveTab('residents'); }}
                                className="font-bold text-indigo-650 hover:underline text-left cursor-pointer"
                              >
                                {res.name} 어르신 ({res.age}세)
                              </button>
                            ) : (
                              <span className="text-red-400">[탈퇴 주민]</span>
                            )}
                          </td>
                          <td className="p-2.5 font-semibold text-slate-900">{p.programName}</td>
                          <td className="p-2.5 text-slate-500 font-mono">{p.participationDate}</td>
                          <td className="p-2.5 font-mono text-slate-600">{p.durationHours}시간</td>
                          <td className="p-2.5">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              p.progressStatus === '완료' 
                                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' 
                                : p.progressStatus === '진행중' 
                                ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                                : p.progressStatus === '참여예정'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-gray-100 text-gray-700'
                            }`}>
                              {p.progressStatus}
                            </span>
                          </td>
                          <td className="p-2.5 text-slate-500 max-w-sm truncate" title={p.notes}>{p.notes || '기록된 특이사항이 없습니다.'}</td>
                          <td className="p-2.5 text-right">
                            <button
                              onClick={() => handleDeleteParticipation(p.id)}
                              className="text-slate-400 hover:text-red-500 transition-colors cursor-pointer p-1 rounded hover:bg-red-50"
                              title="수혜 명세 삭제"
                            >
                              <Trash2 className="w-4 h-4 inline" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}

                    {participations.length === 0 && (
                      <tr>
                        <td colSpan={7} className="text-center p-8 text-slate-400 bg-slate-50 rounded">
                          수혜 장부 기록이 비어있습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: 스프레드시트 API 연동 가이드 및 저장소  */}
          {activeTab === 'gasSetup' && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start" id="view-gas-tab">
              {/* 우회 원리 설명 및 URL 저장 세션 */}
              <div className="bg-white border border-slate-200 rounded shadow-sm p-4 space-y-3">
                <div className="flex items-center gap-2.5 text-slate-950">
                  <Database className="w-5 h-5 text-indigo-650" />
                  <h3 className="font-bold text-sm">구글 스프레드시트 풀스택 연동 원리</h3>
                </div>
                
                <div className="text-xs text-slate-600 leading-relaxed space-y-2.5">
                  <p>
                    AppSheet의 인원 수 제한은 <b>AppSheet 서버가 중간에 사용자 계정을 검증</b>하기 때문입니다. 
                    본 솔루션은 구글 스프레드를 DB로 삼되, <b>구글 앱스 스크립트(Google Apps Script, GAS)를 활용해 독립적인 Web App API</b>로 무료 래핑합니다.
                  </p>
                  <div className="p-3 bg-slate-50 rounded border border-slate-250 font-medium text-slate-700">
                    💡 <b>성능 이점:</b> 동시 접속자 수 무제한 무료, 구글 정책상 일일 호출 쿼타 제한(약 20,000회)으로 소규모 복지관이나 사회 단체에서 완벽하게 상시 배포할 수 있습니다.
                  </div>
                </div>

                <hr className="border-slate-200" />

                {/* API 주소 연동 폼 */}
                <div>
                  <h4 className="text-xs font-bold text-slate-900 mb-2">📡 구글 웹앱 데몬 URL 등록</h4>
                  <div className="space-y-3">
                    <input
                      type="text"
                      placeholder="https://script.google.com/macros/s/.../exec"
                      defaultValue={gasConfig.url}
                      onBlur={(e) => handleSaveGasConfig(e.target.value, gasConfig.isEnabled)}
                      className="w-full text-xs p-2.5 border border-slate-200 rounded font-mono outline-hidden focus:ring-2 focus:ring-indigo-500"
                    />
                    
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={gasConfig.isEnabled}
                          onChange={(e) => handleSaveGasConfig(gasConfig.url, e.target.checked)}
                          className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                        />
                        <span>이 구글 시트 웹앱 API 연동을 활성화합니다.</span>
                      </label>
                      
                      {syncStatus === 'success' && (
                        <span className="text-[10px] text-indigo-700 font-bold bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                          ✓ 연동검증 성공
                        </span>
                      )}
                      {syncStatus === 'error' && (
                        <span className="text-[10px] text-red-650 font-bold bg-red-50 px-2 py-0.5 rounded border border-red-200" title={syncError || ''}>
                          ✗ 연동응답 확인 실패
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded border border-slate-200 space-y-2">
                  <div className="text-xs font-bold text-slate-900">사용 순서 가이드</div>
                  <ol className="text-[11px] text-slate-500 space-y-1 list-decimal list-inside leading-relaxed">
                    <li>우측에 준비된 <b>Apps Script 코드 복사</b></li>
                    <li>구글 스프레드시트 개설 후 <b>[확장 프로그램] → [Apps Script]</b> 이동</li>
                    <li>복사한 코드를 교체 장착하고 디스크 모양 <b>[저장]</b> 클릭</li>
                    <li>우측 상단 <b>[배포] → [새 배포] → [웹 앱]</b> 지정</li>
                    <li>액세스 사용자를 반드시 <b>[모든 사람(Anyone)]</b>으로 설정해 배포</li>
                    <li>생성된 URL을 위 입력단에 삽입 후 연동 활성화 체크!</li>
                  </ol>
                </div>
              </div>

              {/* Apps Script code.gs 소스 가상 모니터링 */}
              <div className="bg-white border border-slate-200 rounded shadow-sm p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1.5 font-bold text-slate-950">
                    <UserCheck className="w-5 h-5 text-indigo-600" />
                    <h4>복사 전용 code.gs 소스코드</h4>
                  </div>
                  <button
                    onClick={handleCopyCode}
                    className="text-xs font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200 hover:bg-indigo-100 px-3 py-1.5 rounded flex items-center gap-1 transition-all cursor-pointer"
                  >
                    {isCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-600">복사 완료!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>전체 코드 복사하기</span>
                      </>
                    )}
                  </button>
                </div>

                <p className="text-xs text-slate-400">
                  아래의 코드는 주민 데이터 삭제 시 관계망에서 연결된 이웃 관계선도 cascade 처리하여 무결성을 유지하는 최적화된 자동구축 코드입니다.
                </p>

                <div className="bg-slate-950 rounded p-3 overflow-hidden relative border border-slate-800">
                  <pre className="text-[10px] text-slate-300 font-mono overflow-y-auto max-h-[360px] scrollbar-thin leading-relaxed select-all">
                    {GOOGLE_APPS_SCRIPT_CODE}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* 🔮 MODAL GROUP */}

      {/* 1. 주민 추가 및 수정 입력 모달 */}
      {showResidentModal && editingResident && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded border border-slate-300 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl p-5 relative">
            <button
              onClick={() => { setShowResidentModal(false); setEditingResident(null); }}
              className="absolute top-4 right-4 p-1 hover:bg-slate-100 text-slate-400 rounded transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
            
            <h3 className="text-sm font-bold text-slate-950 mb-1">
              {editingResident.id ? '어르신 편적 정보 수정' : '새로운 관리 주민 등록'}
            </h3>
            <p className="text-xs text-slate-400 mb-3">개인상담, 위험도 수집을 위해 실거주 및 연락 명세 상태를 추가 조견합니다.</p>

            <form onSubmit={handleSaveResidentSubmit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">성명 (필수)</label>
                  <input
                    type="text"
                    required
                    value={editingResident.name || ''}
                    onChange={(e) => setEditingResident({ ...editingResident, name: e.target.value })}
                    className="w-full text-xs p-2 border border-slate-200 rounded outline-hidden bg-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">성별</label>
                  <select
                    value={editingResident.gender || '여성'}
                    onChange={(e) => setEditingResident({ ...editingResident, gender: e.target.value as '남성' | '여성' })}
                    className="w-full text-xs p-2 border border-slate-200 rounded outline-hidden bg-white focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="여성">여성</option>
                    <option value="남성">남성</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">실 연령</label>
                  <input
                    type="number"
                    value={editingResident.age || ''}
                    onChange={(e) => setEditingResident({ ...editingResident, age: Number(e.target.value) })}
                    className="w-full text-xs p-2 border border-slate-200 rounded outline-hidden bg-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">안부 비상연락처</label>
                  <input
                    type="text"
                    value={editingResident.phone || ''}
                    placeholder="010-0000-0000"
                    onChange={(e) => setEditingResident({ ...editingResident, phone: e.target.value })}
                    className="w-full text-xs p-2 border border-slate-200 rounded outline-hidden bg-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">실 거주지 상세주소</label>
                <input
                  type="text"
                  value={editingResident.address || ''}
                  onChange={(e) => setEditingResident({ ...editingResident, address: e.target.value })}
                  className="w-full text-xs p-2 border border-slate-200 rounded outline-hidden bg-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">사례관리 의견 요약 (진단)</label>
                <textarea
                  rows={3}
                  value={editingResident.notes || ''}
                  onChange={(e) => setEditingResident({ ...editingResident, notes: e.target.value })}
                  placeholder="예: 독거 상태, 주거위생 지원 필요, 우울 진단 고독사 선별 대상..."
                  className="w-full text-xs p-2 border border-slate-200 rounded outline-hidden bg-white leading-relaxed focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => { setShowResidentModal(false); setEditingResident(null); }}
                  className="px-3.5 py-1.5 border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 rounded cursor-pointer text-xs"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 font-bold text-white rounded cursor-pointer shadow-sm text-xs"
                >
                  저장 및 동기화
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. 참여 수혜기록 추가 입력 모달 */}
      {showParticipationModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded border border-slate-300 max-w-md w-full shadow-2xl p-5 relative">
            <button
              onClick={() => setShowParticipationModal(false)}
              className="absolute top-4 right-4 p-1 hover:bg-slate-100 text-slate-400 rounded transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-sm font-bold text-slate-950 mb-1">프로그램 참여 기록장 기록</h3>
            <p className="text-xs text-slate-400 mb-3">현재 주민의 행사, 노래교실, 일자리, 배달 수혜내용을 등재합니다.</p>

            <form onSubmit={handleAddParticipationSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">어르신 성명</label>
                <select
                  value={newParticipation.residentId || ''}
                  onChange={(e) => setNewParticipation({ ...newParticipation, residentId: e.target.value })}
                  className="w-full text-xs p-2 border border-slate-200 rounded outline-hidden bg-white focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="" disabled>어르신 선택</option>
                  {residents.map(r => (
                    <option key={r.id} value={r.id}>{r.name} ({r.age}세) — {r.address}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">참여 프로그램 / 서비스 명칭</label>
                <input
                  type="text"
                  required
                  placeholder="예: 치매예방 미술교실, 반찬배달"
                  value={newParticipation.programName || ''}
                  onChange={(e) => setNewParticipation({ ...newParticipation, programName: e.target.value })}
                  className="w-full text-xs p-2 border border-slate-200 rounded outline-hidden bg-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">수혜 일조</label>
                  <input
                    type="date"
                    required
                    value={newParticipation.participationDate || ''}
                    onChange={(e) => setNewParticipation({ ...newParticipation, participationDate: e.target.value })}
                    className="w-full text-xs p-2 border border-slate-200 rounded outline-hidden bg-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">체류 / 수여시간 (시간)</label>
                  <input
                    type="number"
                    step="0.5"
                    required
                    value={newParticipation.durationHours || 2}
                    onChange={(e) => setNewParticipation({ ...newParticipation, durationHours: Number(e.target.value) })}
                    className="w-full text-xs p-2 border border-slate-200 rounded outline-hidden bg-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">이수 및 도중 상태</label>
                <select
                  value={newParticipation.progressStatus || '참여예정'}
                  onChange={(e) => setNewParticipation({ ...newParticipation, progressStatus: e.target.value as any })}
                  className="w-full text-xs p-2 border border-slate-200 rounded outline-hidden bg-white focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="참여예정">참여예정</option>
                  <option value="진행중">진행중</option>
                  <option value="완료">완료</option>
                  <option value="중도포기">중도포기</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">상담 및 활동 구체내역</label>
                <textarea
                  rows={2}
                  placeholder="예: 찰흙 만지기를 적극 하셨고 다음회기 기대를 나타냄"
                  value={newParticipation.notes || ''}
                  onChange={(e) => setNewParticipation({ ...newParticipation, notes: e.target.value })}
                  className="w-full text-xs p-2 border border-slate-200 rounded outline-hidden bg-white leading-relaxed focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowParticipationModal(false)}
                  className="px-3.5 py-1.5 border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 rounded cursor-pointer text-xs"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 font-bold text-white rounded cursor-pointer text-xs"
                >
                  저장
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. 소셜 관계선 추가 입력 모달 */}
      {showRelationshipModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded border border-slate-300 max-w-md w-full shadow-2xl p-5 relative">
            <button
              onClick={() => setShowRelationshipModal(false)}
              className="absolute top-4 right-4 p-1 hover:bg-slate-100 text-slate-400 rounded transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-sm font-bold text-slate-950 mb-1">주민 연계망 연결고리 생성</h3>
            <p className="text-xs text-slate-400 mb-3">어르신들끼리 혹은 전담 요양보호사/리더관 간 활성 지형 데이터를 매핑합니다.</p>

            <form onSubmit={handleAddRelationshipSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">이웃 1 (원천)</label>
                <select
                  value={newRelationship.sourceId || ''}
                  onChange={(e) => setNewRelationship({ ...newRelationship, sourceId: e.target.value })}
                  className="w-full text-xs p-2 border border-slate-200 rounded outline-hidden bg-white focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="" disabled>어르신 선택</option>
                  {residents.map(r => (
                    <option key={r.id} value={r.id}>{r.name} ({r.age}세) — {r.address}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">이웃 2 (대상)</label>
                <select
                  value={newRelationship.targetId || ''}
                  onChange={(e) => setNewRelationship({ ...newRelationship, targetId: e.target.value })}
                  className="w-full text-xs p-2 border border-slate-200 rounded outline-hidden bg-white focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="" disabled>어르신 선택</option>
                  {residents.map(r => (
                    <option key={r.id} value={r.id}>{r.name} ({r.age}세) — {r.address}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">관계 분류</label>
                  <select
                    value={newRelationship.relationType || '이웃'}
                    onChange={(e) => setNewRelationship({ ...newRelationship, relationType: e.target.value as any })}
                    className="w-full text-xs p-2 border border-slate-200 rounded outline-hidden bg-white focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="이웃">이웃</option>
                    <option value="친척">친척</option>
                    <option value="친구">친구</option>
                    <option value="지인">지인</option>
                    <option value="돌봄제공자">돌봄제공자</option>
                    <option value="기타">기타</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">접촉 친밀도 지수</label>
                  <select
                    value={newRelationship.strength || 3}
                    onChange={(e) => setNewRelationship({ ...newRelationship, strength: Number(e.target.value) })}
                    className="w-full text-xs p-2 border border-slate-200 rounded outline-hidden bg-white focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value={1}>★ 기면관계 (1/5)</option>
                    <option value={2}>★★ 안부교류 (2/5)</option>
                    <option value={3}>★★★ 보통교류 (3/5)</option>
                    <option value={4}>★★★★ 정기교류 (4/5)</option>
                    <option value={5}>★★★★★ 매일안부/절친 (5/5)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">교류 상태 및 상담원 진도 비고</label>
                <textarea
                  rows={2}
                  placeholder="예: 옆집 살면서 가볍게 안부를 주고받으며, 비상시 가장 의존함."
                  value={newRelationship.notes || ''}
                  onChange={(e) => setNewRelationship({ ...newRelationship, notes: e.target.value })}
                  className="w-full text-xs p-2 border border-slate-200 rounded outline-hidden bg-white leading-relaxed focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t border-slate-205">
                <button
                  type="button"
                  onClick={() => setShowRelationshipModal(false)}
                  className="px-3.5 py-1.5 border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 rounded cursor-pointer text-xs"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 font-bold text-white rounded cursor-pointer text-xs"
                >
                  연결 접지
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🚀 하단 카피라이트 가이드라인 바 */}
      <footer className="bg-white border-t border-slate-205 px-6 py-4 mt-auto text-xs text-slate-400 flex flex-wrap justify-between items-center gap-4">
        <span>© 2026 구글 스프레드시트 풀스택 주민 정보 & 소외선 분석 명록 시스템</span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Info className="w-3.5 h-3.5 text-indigo-650" />
            구글 드라이브 앱스 스크립트 기반 동작 (CORS-Compliant CORS Tunneling)
          </span>
          <span>·</span>
          <a 
            href="#" 
            onClick={(e) => { e.preventDefault(); setActiveTab('gasSetup'); }} 
            className="text-indigo-650 font-semibold hover:underline"
          >
            Apps Script 배포 방법 다시 보기 →
          </a>
        </div>
      </footer>
    </div>
  );
}
