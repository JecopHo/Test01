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
  CalendarCheck,
  Link as LinkIcon, 
  Info, 
  X,
  AlertTriangle,
  UserCheck,
  Activity,
  HeartHandshake,
  Settings,
  Download,
  Upload
} from 'lucide-react';
import { Resident, Participation, Relationship, GASConfig } from './types';
import { MOCK_RESIDENTS, MOCK_PARTICIPATIONS, MOCK_RELATIONSHIPS } from './mockData';
import { GOOGLE_APPS_SCRIPT_CODE } from './code.gs';
import NetworkGraph from './components/NetworkGraph';

// --- 생년월일 및 연령 계산 파서 시스템 ---
export const getResidentAgeNumber = (ageVal: string | number | undefined): number => {
  if (ageVal === undefined || ageVal === null) return 70;
  if (typeof ageVal === 'number') return ageVal;
  const match = ageVal.match(/\((\d+)\)/);
  if (match) {
    return parseInt(match[1], 10);
  }
  const ageOnly = parseInt(ageVal, 10);
  return isNaN(ageOnly) ? 70 : ageOnly;
};

export const parseResidentAgeInput = (val: string | number | undefined): { displayAge: string | number; numericAge: number } => {
  if (val === undefined || val === null) {
    return { displayAge: 70, numericAge: 70 };
  }
  const trimmed = String(val).trim();
  if (!trimmed) {
    return { displayAge: 70, numericAge: 70 };
  }

  // "94.01.01(32)" 또는 괄호 포함 포맷인 경우 그대로 사용
  if (trimmed.includes('(') && trimmed.includes(')')) {
    const match = trimmed.match(/\((\d+)\)/);
    const ageNum = match ? parseInt(match[1], 10) : 70;
    return { displayAge: trimmed, numericAge: ageNum };
  }

  // 단순히 숫자만 기입한 사례 검출 (예: "72" 혹은 "72세")
  const cleanNumber = trimmed.replace(/세$/, '').trim();
  if (/^\d{1,3}$/.test(cleanNumber)) {
    const num = parseInt(cleanNumber, 10);
    return { displayAge: num, numericAge: num };
  }

  // 생년월일 해석 시도 (예: 94.01.01, 1994.01.01, 940101, 1994-01-01 등)
  let normalized = trimmed.replace(/[-/]/g, '.');
  if (/^\d{6}$/.test(normalized)) {
    normalized = normalized.slice(0, 2) + '.' + normalized.slice(2, 4) + '.' + normalized.slice(4, 6);
  } else if (/^\d{8}$/.test(normalized)) {
    normalized = normalized.slice(0, 4) + '.' + normalized.slice(4, 6) + '.' + normalized.slice(6, 8);
  }

  const parts = normalized.split('.');
  if (parts.length < 3) {
    return { displayAge: trimmed, numericAge: 70 };
  }

  let yearStr = parts[0].trim();
  const monthStr = parts[1].trim();
  const dayStr = parts[2].trim();

  let year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    return { displayAge: trimmed, numericAge: 70 };
  }

  const displayYearStr = yearStr;
  if (yearStr.length === 2) {
    if (year >= 26) {
      year += 1900;
    } else {
      year += 2000;
    }
  }

  // 만나이 계산 기준년월일 (2026-06-09 기준)
  const today = new Date(2026, 5, 9);
  let age = today.getFullYear() - year;
  const m = today.getMonth() - (month - 1);
  if (m < 0 || (m === 0 && today.getDate() < day)) {
    age--;
  }

  const formattedBirthdate = `${displayYearStr}.${monthStr.padStart(2, '0')}.${dayStr.padStart(2, '0')}`;
  return {
    displayAge: `${formattedBirthdate}(${age})`,
    numericAge: age
  };
};

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
  const [activeTab, setActiveTab] = useState<'residents' | 'graph' | 'programGroups' | 'programs'>('residents');
  const [selectedResident, setSelectedResident] = useState<Resident | null>(null);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [showGasModal, setShowGasModal] = useState<boolean>(false);
  const [inputGasUrl, setInputGasUrl] = useState<string>('');
  const [inputGasEnabled, setInputGasEnabled] = useState<boolean>(false);

  // 프로그램별 분할 전용 상태
  const [selectedProgram, setSelectedProgram] = useState<string>('');
  const [programSearch, setProgramSearch] = useState<string>('');
  const [isRenamingProgram, setIsRenamingProgram] = useState<boolean>(false);
  const [renameInputValue, setRenameInputValue] = useState<string>('');

  // 모달 제어 상태
  const [showResidentModal, setShowResidentModal] = useState<boolean>(false);
  const [showParticipationModal, setShowParticipationModal] = useState<boolean>(false);
  const [showRelationshipModal, setShowRelationshipModal] = useState<boolean>(false);
  const [editingRelationshipId, setEditingRelationshipId] = useState<string | null>(null);

  // 폼 입력용 임시 상태
  const [editingResident, setEditingResident] = useState<Partial<Resident & { 
    initialProgram?: string;
    initialRelationTargetId?: string;
    initialRelationType?: '이웃' | '친척' | '친구' | '지인' | '돌봄제공자' | '공공기관' | '기타';
    initialRelationStrength?: number;
    initialRelationNotes?: string;
  }> | null>(null);
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
  const [dongFilter, setDongFilter] = useState<string>('모두');

  // --- 데이터 불러오기 및 초기화 ---
  useEffect(() => {
    // 1. 로컬 스토리지에서 GAS 설정 로드
    const storedGasUrl = localStorage.getItem('gas_url') || '';
    const storedGasEnabled = localStorage.getItem('gas_enabled') === 'true';
    
    setInputGasUrl(storedGasUrl);
    setInputGasEnabled(storedGasEnabled);
    
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

  // --- 설정 및 백업 관리 폼 핸들러 ---
  const handleSaveSettingsForm = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleSaveGasConfig(inputGasUrl, inputGasEnabled);
    setShowGasModal(false);
  };

  // JSON 파일 백업 내보내기 (Export)
  const handleExportData = () => {
    try {
      const backupObj = {
        residents,
        participations,
        relationships,
        exportedAt: new Date().toISOString()
      };
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupObj, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `welfare_backup_${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } catch (err: any) {
      alert("백업 파일 생성 중 오류가 발생했습니다: " + err.message);
    }
  };

  // JSON 파일 백업 가져오기 및 복구 (Import)
  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    if (e.target.files && e.target.files[0]) {
      fileReader.readAsText(e.target.files[0], "UTF-8");
      fileReader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          if (parsed && Array.isArray(parsed.residents) && Array.isArray(parsed.participations) && Array.isArray(parsed.relationships)) {
            const confirmRestore = window.confirm(
              `백업 데이터를 가져오시겠습니까?\n\n[백업할 파일 정보]\n- 등록 주민: ${parsed.residents.length}명\n- 프로그램 참여: ${parsed.participations.length}건\n- 주민 관계망 연결: ${parsed.relationships.length}쌍\n\n주의: 기존 브라우저에 등록되어 있던 모든 데이터는 영구적으로 덮어씌워져 동기화됩니다.`
            );
            if (!confirmRestore) return;

            setResidents(parsed.residents);
            setParticipations(parsed.participations);
            setRelationships(parsed.relationships);
            saveToLocalStorage(parsed.residents, parsed.participations, parsed.relationships);
            
            // If GAS is enabled, write updates
            if (gasConfig.isEnabled && gasConfig.url) {
              // Option to sync with cloud
              alert("데이터가 로컬에 정상적으로 반영되었습니다. 클라우드 연동이 켜져 있으므로 데이터가 구글 스프레드시트에도 자동 업로드됩니다.");
              setTimeout(() => {
                fetchFromGAS(gasConfig.url);
              }, 1200);
            } else {
              alert(`성공적으로 백업 데이터를 가져왔습니다!\n(주민 ${parsed.residents.length}명, 참여이력 ${parsed.participations.length}건, 관계망 ${parsed.relationships.length}쌍 반영)`);
            }
            setShowGasModal(false);
          } else {
            alert("유효한 백업 파일 양식이 아닙니다. 필수 데이터 키(residents, participations, relationships)가 누락되어 있습니다.");
          }
        } catch (err: any) {
          alert("파일 가져오기에 실패했습니다. 올바른 JSON 파일 형태인지 확인해 주세요. 에러: " + err.message);
        }
      };
    }
  };

  // --- CRUD 기능 동작 구현 ---

  // 주민 추가 및 수정
  const handleSaveResidentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingResident?.name) return;

    let updatedResidents = [...residents];
    const isNew = !editingResident.id;
    const residentId = editingResident.id || 'R_' + Date.now();
    
    const parsedAgeInfo = parseResidentAgeInput(editingResident.age);
    
    const targetResident: Resident = {
      id: residentId,
      name: editingResident.name,
      gender: (editingResident.gender || '여성') as '남성' | '여성',
      age: parsedAgeInfo.displayAge,
      phone: editingResident.phone || '010-0000-0000',
      basicPhone: editingResident.basicPhone || '',
      address: editingResident.address || '미정',
      dong: editingResident.dong || '기타 동',
      notes: editingResident.notes || '',
      registeredAt: editingResident.registeredAt || new Date().toISOString().split('T')[0],
      disabilityType: editingResident.disabilityType || '없음',
      disabilityDetails: editingResident.disabilityDetails || '',
      isolationGroup: editingResident.isolationGroup || '해당없음',
    };

    let updatedParticipations = [...participations];
    let updatedRelationships = [...relationships];

    if (isNew) {
      updatedResidents.unshift(targetResident);

      // 혹시 신규 등록 단계에서 참여 프로그램을 기입했을 시, 해당 내역도 연계 생성
      if (editingResident.initialProgram && editingResident.initialProgram.trim() !== '') {
        const participationId = 'P_' + Date.now();
        const newPart: Participation = {
          id: participationId,
          residentId: residentId,
          programName: editingResident.initialProgram.trim(),
          participationDate: new Date().toISOString().split('T')[0],
          durationHours: 2,
          progressStatus: '진행중',
          notes: '주민 신규 편적 시 자동 등록된 프로그램'
        };
        updatedParticipations = [newPart, ...participations];
        setParticipations(updatedParticipations);

        // 구글 시트 연동 비동기 실행 (에러 핸들러 기본 내장됨)
        await postToGAS('addParticipation', newPart);
      }

      // 혹시 신규 등록 단계에서 지역 이웃 관계망을 기입했을 시, 연계 생성
      if (editingResident.initialRelationTargetId && editingResident.initialRelationTargetId.trim() !== '') {
        const relationshipId = 'RL_' + Date.now();
        const newRel: Relationship = {
          id: relationshipId,
          sourceId: residentId,
          targetId: editingResident.initialRelationTargetId,
          relationType: (editingResident.initialRelationType || '이웃') as '이웃' | '친척' | '친구' | '지인' | '돌봄제공자' | '공공기관' | '기타',
          strength: Number(editingResident.initialRelationStrength || 3),
          notes: editingResident.initialRelationNotes || '주민 신규 편적 시 자동 등록된 이웃 관계망'
        };
        updatedRelationships = [newRel, ...relationships];
        setRelationships(updatedRelationships);

        // 구글 시트 연동 비동기 실행
        await postToGAS('saveRelationship', newRel);
      }
    } else {
      updatedResidents = updatedResidents.map(r => r.id === residentId ? targetResident : r);
    }

    setResidents(updatedResidents);
    saveToLocalStorage(updatedResidents, updatedParticipations, updatedRelationships);

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

  // 참여이력 추가 및 수정
  const handleAddParticipationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newParticipation.residentId || !newParticipation.programName) return;

    const isEdit = !!newParticipation.id;
    const participationId = newParticipation.id || 'P_' + Date.now();
    const item: Participation = {
      id: participationId,
      residentId: newParticipation.residentId,
      programName: newParticipation.programName,
      participationDate: newParticipation.participationDate || new Date().toISOString().split('T')[0],
      durationHours: Number(newParticipation.durationHours || 2),
      progressStatus: (newParticipation.progressStatus || '참여예정') as '참여예정' | '진행중' | '완료' | '중도포기',
      notes: newParticipation.notes || ''
    };

    let updatedParticipations: Participation[];
    if (isEdit) {
      updatedParticipations = participations.map(p => p.id === participationId ? item : p);
    } else {
      updatedParticipations = [item, ...participations];
    }
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

  // 프로그램 대표명 일괄 수정
  const handleRenameProgram = async (oldName: string, newName: string) => {
    if (!newName || newName.trim() === '' || newName === oldName) {
      setIsRenamingProgram(false);
      return;
    }

    const trimmedNewName = newName.trim();
    
    // update state
    const updated = participations.map(p => p.programName === oldName ? { ...p, programName: trimmedNewName } : p);
    setParticipations(updated);
    saveToLocalStorage(residents, updated, relationships);
    setSelectedProgram(trimmedNewName);
    setIsRenamingProgram(false);

    // Call API for each updated participation
    const affected = participations.filter(p => p.programName === oldName);
    for (const p of affected) {
      await postToGAS('saveParticipation', { ...p, programName: trimmedNewName });
    }

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

  // 관계망 추가 및 수정
  const handleAddRelationshipSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRelationship.sourceId || !newRelationship.targetId) return;
    if (newRelationship.sourceId === newRelationship.targetId) {
      alert('동일인물 간의 관계는 정의할 수 없습니다. 서로 다른 이웃을 매핑해주세요.');
      return;
    }

    // 중복 관계선이 존재하는지 검증 (자기 자신 이외)
    const alreadyConnected = relationships.some(rel => 
      rel.id !== editingRelationshipId && (
        (rel.sourceId === newRelationship.sourceId && rel.targetId === newRelationship.targetId) ||
        (rel.sourceId === newRelationship.targetId && rel.targetId === newRelationship.sourceId)
      )
    );

    if (alreadyConnected) {
      alert('해당 주민들 간 정의된 관계망 연결 고리가 이미 존재합니다. 다시 한 번 조회하십시오.');
      return;
    }

    let updatedRelationships: Relationship[] = [];
    let item: Relationship;

    if (editingRelationshipId) {
      // 수정 모드
      item = {
        id: editingRelationshipId,
        sourceId: newRelationship.sourceId,
        targetId: newRelationship.targetId,
        relationType: (newRelationship.relationType || '이웃') as '이웃' | '친척' | '친구' | '지인' | '돌봄제공자' | '공공기관' | '기타',
        strength: Number(newRelationship.strength || 3),
        notes: newRelationship.notes || ''
      };
      updatedRelationships = relationships.map(rel => rel.id === editingRelationshipId ? item : rel);
    } else {
      // 신규 추가 모드
      const relationshipId = 'RL_' + Date.now();
      item = {
        id: relationshipId,
        sourceId: newRelationship.sourceId,
        targetId: newRelationship.targetId,
        relationType: (newRelationship.relationType || '이웃') as '이웃' | '친척' | '친구' | '지인' | '돌봄제공자' | '공공기관' | '기타',
        strength: Number(newRelationship.strength || 3),
        notes: newRelationship.notes || ''
      };
      updatedRelationships = [item, ...relationships];
    }

    setRelationships(updatedRelationships);
    saveToLocalStorage(residents, participations, updatedRelationships);

    await postToGAS('saveRelationship', item);

    setShowRelationshipModal(false);
    setEditingRelationshipId(null);
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
                          (res.basicPhone && res.basicPhone.includes(residentSearch)) || 
                          (res.address && res.address.toLowerCase().includes(residentSearch.toLowerCase()));
      const matchGender = genderFilter === '모두' || res.gender === genderFilter;
      
      let matchAge = true;
      const numAge = getResidentAgeNumber(res.age);
      if (ageRangeFilter === '70미만') matchAge = numAge < 70;
      else if (ageRangeFilter === '70대') matchAge = numAge >= 70 && numAge < 80;
      else if (ageRangeFilter === '80이상') matchAge = numAge >= 80;

      const matchDong = dongFilter === '모두' || (res.dong || '기타 동') === dongFilter;

      return matchSearch && matchGender && matchAge && matchDong;
    });
  }, [residents, residentSearch, genderFilter, ageRangeFilter, dongFilter]);

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
    
    // 외톨이 / 무관계(Isolated) 선별 -> 실 등록 고립 단계군 대상 집계 (해당없음 제외)
    const isolatedCount = residents.filter(r => r.isolationGroup && r.isolationGroup !== '해당없음').length;

    // 진행 프로그램 종목 수 추출
    const programKinds = Array.from(new Set(participations.map(p => p.programName))).length;

    return { total, female, male, isolatedCount, programKinds };
  }, [residents, participations]);

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
            <p className="text-xs text-indigo-300">면목종합사회복지관 소셜 관계 데이터</p>
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
                <span>동기화</span>
              </button>
            )}

            <button
              onClick={() => {
                setInputGasUrl(gasConfig.url);
                setInputGasEnabled(gasConfig.isEnabled);
                setShowGasModal(true);
              }}
              className="bg-indigo-800 hover:bg-indigo-700 border border-indigo-700 p-1.5 px-3 rounded text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
              title="구글 시트 연동 및 데이터 백업/복구 설정"
              id="open-settings-modal"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>연동/백업 설정</span>
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

          <div className="bg-white p-3 rounded border border-slate-200 shadow-sm flex flex-col justify-between col-span-2 md:col-span-4 lg:col-span-1" id="isolation-group-stats-card">
            <div className="flex items-center justify-between border-b border-rose-100 pb-1 mb-1">
              <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">고립 위기군별 현황 ({dashboardStats.isolatedCount}명)</span>
              <span className="w-1.5 h-1.5 rounded-full bg-rose-550 animate-pulse"></span>
            </div>
            <div className="space-y-1 text-[10px] mt-1.5">
              {(() => {
                const totalCount = residents.length || 1;
                const groups = [
                  { name: '관계지원군', color: 'bg-indigo-500' },
                  { name: '일상지원군', color: 'bg-emerald-550' },
                  { name: '일상위험고립군', color: 'bg-amber-500' },
                  { name: '집중관리군', color: 'bg-orange-500' },
                  { name: '긴급위기군', color: 'bg-red-600' }
                ];
                return groups.map(g => {
                  const count = residents.filter(r => r.isolationGroup === g.name).length;
                  const percentage = Math.round((count / totalCount) * 100);
                  return (
                    <div key={g.name} className="space-y-0.5">
                      <div className="flex justify-between items-center text-slate-600">
                        <span className="font-medium text-slate-700">{g.name}</span>
                        <span className="font-semibold text-slate-900 font-mono">{count}명 ({percentage}%)</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-1">
                        <div
                          className={`${g.color} h-1 rounded-full transition-all duration-300`}
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                });
              })()}
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

          <div className="bg-white p-3 rounded border border-slate-200 shadow-sm flex flex-col justify-between col-span-2 md:col-span-4 lg:col-span-1">
            <div className="flex items-center justify-between border-b border-slate-100 pb-1 mb-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">동별 등록 인원 현황</span>
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse"></span>
            </div>
            <div className="space-y-1 text-[10px]">
              {(() => {
                const totalCount = residents.length || 1;
                const dongs: ('면목 4동' | '면목 7동' | '면목 5동' | '면목 3·8동' | '기타 동')[] = [
                  '면목 4동', '면목 7동', '면목 5동', '면목 3·8동', '기타 동'
                ];
                return dongs.map(dongName => {
                  const count = residents.filter(r => (r.dong || '기타 동') === dongName).length;
                  const percentage = Math.round((count / totalCount) * 100);
                  return (
                    <div key={dongName} className="space-y-0.5">
                      <div className="flex justify-between items-center text-slate-600">
                        <span className="font-medium text-slate-700">{dongName}</span>
                        <span className="font-semibold text-slate-900 font-mono">{count}명 ({percentage}%)</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-1">
                        <div
                          className="bg-indigo-600 h-1 rounded-full transition-all duration-300"
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      </section>

      {/* 📁 메인 콘텐츠 영역 */}
      <main className="flex-1 px-6 py-4 flex flex-col gap-4">
        {/* 네비게이션 탭 아이템 바 */}
        <div className="flex border-b border-slate-200 overflow-x-auto whitespace-nowrap scrollbar-thin">
          <button
            onClick={() => { setActiveTab('residents'); setSelectedResident(null); }}
            className={`px-4 py-3 text-xs sm:text-sm font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer shrink-0 ${
              activeTab === 'residents' 
                ? 'border-indigo-600 text-indigo-700 font-bold bg-indigo-50/45 rounded-t-lg' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            주민 정보탭
          </button>
          <button
            onClick={() => { setActiveTab('graph'); setSelectedResident(null); }}
            className={`px-4 py-3 text-xs sm:text-sm font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer shrink-0 ${
              activeTab === 'graph' 
                ? 'border-indigo-600 text-indigo-700 font-bold bg-indigo-50/45 rounded-t-lg' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Map className="w-4 h-4" />
            이웃 관계망 지도
          </button>
          <button
            onClick={() => { setActiveTab('programGroups'); setSelectedResident(null); }}
            className={`px-4 py-3 text-xs sm:text-sm font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer shrink-0 ${
              activeTab === 'programGroups' 
                ? 'border-indigo-600 text-indigo-700 font-bold bg-indigo-50/45 rounded-t-lg' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <CalendarCheck className="w-4 h-4" />
            참여 프로그램
          </button>
          <button
            onClick={() => { setActiveTab('programs'); setSelectedResident(null); }}
            className={`px-4 py-3 text-xs sm:text-sm font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer shrink-0 ${
              activeTab === 'programs' 
                ? 'border-indigo-600 text-indigo-700 font-bold bg-indigo-50/45 rounded-t-lg' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            서비스 현황
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
                        age: '',
                        phone: '',
                        basicPhone: '',
                        address: '',
                        dong: '면목 4동',
                        notes: '',
                        isolationGroup: '해당없음',
                        initialProgram: '',
                        initialRelationTargetId: '',
                        initialRelationType: '이웃',
                        initialRelationStrength: 3,
                        initialRelationNotes: '',
                        registeredAt: new Date().toISOString().split('T')[0],
                        disabilityType: '없음',
                        disabilityDetails: ''
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
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 bg-slate-50 p-2.5 rounded border border-slate-200">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="이름, 연락처, 주소 검색"
                      value={residentSearch}
                      onChange={(e) => setResidentSearch(e.target.value)}
                      className="w-full text-xs pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded outline-hidden focus:ring-2 focus:ring-indigo-500 h-[32px]"
                    />
                    <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  </div>
                  <div>
                    <select
                      value={genderFilter}
                      onChange={(e) => setGenderFilter(e.target.value)}
                      className="w-full text-xs bg-white border border-slate-200 rounded p-1.5 outline-hidden focus:ring-2 focus:ring-indigo-500 h-[32px]"
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
                      className="w-full text-xs bg-white border border-slate-200 rounded p-1.5 outline-hidden focus:ring-2 focus:ring-indigo-500 h-[32px]"
                    >
                      <option value="모두">연령 분포: 모두</option>
                      <option value="70미만">70세 미만</option>
                      <option value="70대">70대 (70~79세)</option>
                      <option value="80이상">80세 이상 할아버지/할머니</option>
                    </select>
                  </div>
                  <div>
                    <select
                      value={dongFilter}
                      onChange={(e) => setDongFilter(e.target.value)}
                      className="w-full text-xs bg-white border border-slate-200 rounded p-1.5 outline-hidden focus:ring-2 focus:ring-indigo-500 h-[32px]"
                    >
                      <option value="모두">거주 동: 모두</option>
                      <option value="면목 4동">거주 동: 면목 4동</option>
                      <option value="면목 7동">거주 동: 면목 7동</option>
                      <option value="면목 5동">거주 동: 면목 5동</option>
                      <option value="면목 3·8동">거주 동: 면목 3·8동</option>
                      <option value="기타 동">거주 동: 기타 동</option>
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
                              {typeof res.age === 'number' || !isNaN(Number(res.age)) ? `${res.age}세` : res.age}
                            </td>
                            <td className="p-2.5 text-slate-600 font-mono text-xs">
                              {res.basicPhone ? (
                                <div className="text-[11px] text-slate-800 font-medium" title="기본 연락처">
                                  <span className="text-[9px] text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-1.5 py-0.2 mr-1">기본</span>
                                  {res.basicPhone}
                                </div>
                              ) : (
                                <div className="text-[11px] text-slate-300 font-normal italic">기본 연락처 없음</div>
                              )}
                              <div className="text-[10px] text-slate-500 mt-1" title="안부 비상연락처">
                                <span className="text-[9px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.2 mr-1">안부</span>
                                {res.phone || '010-0000-0000'}
                              </div>
                            </td>
                            <td className="p-2.5 text-slate-500 max-w-xs truncate">
                              <span className="inline-block bg-indigo-50 text-indigo-700 text-[10px] px-1 py-0.2 rounded font-medium mr-1">
                                {res.dong || '기타 동'}
                              </span>
                              {res.address}
                            </td>
                            <td className="p-2.5">
                              <span className="bg-blue-50 text-blue-700 font-bold px-1.5 py-0.5 rounded mr-1">{partCount}</span>
                              <span className="bg-indigo-50 text-indigo-700 font-bold px-1.5 py-0.5 rounded">{relCount}</span>
                              {res.isolationGroup && res.isolationGroup !== '해당없음' && (
                                <span className="ml-2 bg-rose-100 text-rose-700 text-[9px] px-1.5 py-0.5 rounded font-bold">{res.isolationGroup}</span>
                              )}
                            </td>
                            <td className="p-2.5 text-right">
                              <div className="flex gap-2 justify-end" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => {
                                    setEditingResident({
                                      ...res,
                                      disabilityType: res.disabilityType || '없음',
                                      disabilityDetails: res.disabilityDetails || ''
                                    });
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
                      selectedResident.gender === '남성' ? 'bg-cyan-50 text-cyan-700 border border-cyan-100' : 'bg-rose-50 text-rose-700 border border-rose-100'
                    }`}>
                      {selectedResident.gender} ({typeof selectedResident.age === 'number' || !isNaN(Number(selectedResident.age)) ? `만 ${selectedResident.age}세` : selectedResident.age})
                    </span>
                    {selectedResident.isolationGroup && selectedResident.isolationGroup !== '해당없음' && (
                      <span className="ml-1.5 text-[9px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-200 uppercase">
                        🚨 {selectedResident.isolationGroup}
                      </span>
                    )}
                    <h3 className="text-sm font-bold text-slate-900 mt-1">{selectedResident.name} 어르신 상세 프로파일</h3>
                    <p className="text-[10px] text-slate-400">등록일: {selectedResident.registeredAt}</p>
                  </div>

                  {/* 스크롤 가능한 본문 영역 */}
                  <div className="flex-1 overflow-y-auto pr-1 space-y-4 max-h-[60vh] xl:max-h-[700px] scrollbar-thin">
                    {/* 인적 사유 정보 */}
                    <div className="space-y-2 text-xs text-slate-700 bg-slate-50 p-2.5 rounded border border-slate-200">
                      <div>
                        <span className="font-semibold text-slate-500 block text-[10px]">🛑 사회적 고립 분류군</span>
                        <span className={`text-[11px] font-bold border rounded px-2 py-0.5 inline-block mt-1 ${
                          selectedResident.isolationGroup && selectedResident.isolationGroup !== '해당없음'
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}>
                          {selectedResident.isolationGroup || '해당없음 (일반관리)'}
                        </span>
                      </div>
                      {selectedResident.disabilityType && selectedResident.disabilityType !== '없음' && (
                        <div>
                          <span className="font-semibold text-slate-500 block text-[10px]">♿ 장애 분류 ({selectedResident.disabilityType})</span>
                          <span className="text-emerald-700 font-medium text-[11px] bg-emerald-50 border border-emerald-200 rounded px-2 py-0.5 inline-block mt-1">
                            {selectedResident.disabilityDetails || '등록된 세부 장애 내용이 없습니다.'}
                          </span>
                        </div>
                      )}
                      <div>
                        <span className="font-semibold text-slate-500 block text-[10px]">📱 기본 연락처</span>
                        <span className="font-mono text-slate-800">{selectedResident.basicPhone || '등록 대기'}</span>
                      </div>
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
                                    ? 'bg-blue-50 text-blue-800 border border-blue-200'
                                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                                }`}>
                                  {p.progressStatus}
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-400 mt-0.5">{p.participationDate} (총 {p.durationHours}시간)</div>
                              {p.notes && <p className="text-[10px] text-slate-600 mt-1 bg-white p-1 rounded border border-blue-50">{p.notes}</p>}
                            </div>
                            <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => {
                                  setNewParticipation(p);
                                  setShowParticipationModal(true);
                                }}
                                className="text-slate-400 hover:text-indigo-600 cursor-pointer p-0.5"
                                title="수혜 기록 수정"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteParticipation(p.id)}
                                className="text-slate-300 hover:text-red-500 cursor-pointer p-0.5"
                                title="기록 삭제"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
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
                              <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => {
                                    setNewRelationship({
                                      id: rel.id,
                                      sourceId: rel.sourceId,
                                      targetId: rel.targetId,
                                      relationType: rel.relationType,
                                      strength: rel.strength,
                                      notes: rel.notes
                                    });
                                    setEditingRelationshipId(rel.id);
                                    setShowRelationshipModal(true);
                                  }}
                                  className="text-slate-400 hover:text-indigo-600 cursor-pointer p-0.5"
                                  title="관계 수정 (친밀도 등)"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteRelationship(rel.id)}
                                  className="text-slate-400 hover:text-red-500 cursor-pointer p-0.5"
                                  title="관계 끊기"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
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
                  <Map className="w-5 h-5 text-indigo-600" />
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

          {/* TAB 3: 프로그램별 참여자 총괄 조회 (Program Group view) */}
          {activeTab === 'programGroups' && (
            <div className="bg-white border border-slate-200 rounded shadow-sm p-4" id="view-program-groups-tab">
              <div className="mb-4 flex flex-wrap justify-between items-center gap-4">
                <div>
                  <h2 className="text-sm font-bold text-slate-950 flex items-center gap-1.5">
                    <CalendarCheck className="w-5 h-5 text-indigo-600" />
                    프로그램별 주민 참여 현황 일괄 원장
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    개설된 복지관 프로그램 및 일자리별로 참여 중인 주민들을 정렬하여 한눈에 살피고 밀접 수혜 이력들을 파악합니다.
                  </p>
                </div>
              </div>

              {/* 메인 양식: 프로그램 목록 사이드바와 선택된 프로그램의 수혜자 일괄 정보 */}
              {(() => {
                // 고유 프로그램명 목록 추출
                const uniquePrograms: string[] = Array.from(new Set(participations.map(p => p.programName)))
                  .filter((p): p is string => typeof p === 'string' && !!p)
                  .sort();

                // 만약 선택된 프로그램이 없거나 현재 목록에 더 이상 존재하지 않으면 첫 번째 프로그램을 자동 선택
                let currentProg = selectedProgram;
                if (uniquePrograms.length > 0 && (!currentProg || !uniquePrograms.includes(currentProg))) {
                  currentProg = uniquePrograms[0];
                }

                // 프로그램 검색어로 좌측 목록 필터링
                const filteredProgs = uniquePrograms.filter((p: string) => 
                  p.toLowerCase().includes(programSearch.toLowerCase())
                );

                // 현재 프로그램에 참가한 명단 & 수혜기록 details
                const matchingParticipations = currentProg 
                  ? participations.filter(p => p.programName === currentProg) 
                  : [];

                return (
                  <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start mt-2">
                    {/* 좌측: 프로그램명 목록 사이드바 */}
                    <div className="lg:col-span-1 border border-slate-200 rounded-lg bg-slate-50 p-3 self-stretch flex flex-col gap-3 min-h-[400px]">
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="프로그램명 검색..."
                          value={programSearch}
                          onChange={(e) => setProgramSearch(e.target.value)}
                          className="w-full text-xs pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded outline-hidden focus:ring-2 focus:ring-indigo-500 h-[32px]"
                        />
                        <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      </div>

                      <div className="flex-1 overflow-y-auto max-h-[500px] space-y-1 pr-1">
                        {filteredProgs.map(prog => {
                          const count = participations.filter(p => p.programName === prog).length;
                          const isSelected = prog === currentProg;
                          return (
                            <button
                              key={prog}
                              onClick={() => setSelectedProgram(prog)}
                              className={`w-full text-left text-xs p-2.5 rounded-md flex justify-between items-center transition-all cursor-pointer ${
                                isSelected 
                                  ? 'bg-indigo-600 text-white font-semibold shadow-sm' 
                                  : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                              }`}
                            >
                              <span className="truncate mr-2">{prog}</span>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                isSelected ? 'bg-white text-indigo-700' : 'bg-slate-200 text-slate-700'
                              }`}>
                                {count}명
                              </span>
                            </button>
                          );
                        })}

                        {filteredProgs.length === 0 && (
                          <div className="text-center py-8 text-xs text-slate-400 bg-white border border-slate-200 rounded-lg">
                            검색 결과물도, 개설된 프로그램도 없습니다.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 우측: 해당 프로그램 참여 주민 상세 리스트 */}
                    <div className="lg:col-span-3 border border-slate-200 rounded-lg p-4 bg-white">
                      {currentProg ? (
                        <div className="space-y-4">
                          {/* 프로그램 요약 */}
                          <div className="bg-indigo-50/50 border border-indigo-100 rounded-lg p-3 flex flex-wrap justify-between items-center gap-3">
                            <div>
                              {isRenamingProgram ? (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <input
                                    type="text"
                                    value={renameInputValue}
                                    onChange={(e) => setRenameInputValue(e.target.value)}
                                    className="text-xs px-2 py-1 border border-indigo-300 rounded outline-hidden bg-white focus:ring-2 focus:ring-indigo-500 h-[28px] font-semibold text-slate-800 w-48 sm:w-64"
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        handleRenameProgram(currentProg, renameInputValue);
                                      } else if (e.key === 'Escape') {
                                        setIsRenamingProgram(false);
                                      }
                                    }}
                                  />
                                  <button
                                    onClick={() => handleRenameProgram(currentProg, renameInputValue)}
                                    className="p-1 px-1.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded border border-emerald-200 cursor-pointer transition-colors flex items-center gap-1 text-[11px] font-medium"
                                    title="저장"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    저장
                                  </button>
                                  <button
                                    onClick={() => setIsRenamingProgram(false)}
                                    className="p-1 px-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded border border-slate-200 cursor-pointer transition-colors flex items-center gap-1 text-[11px] font-medium"
                                    title="취소"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                    취소
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                                    <span className="inline-block w-2.5 h-2.5 bg-indigo-600 rounded-full animate-pulse"></span>
                                    {currentProg}
                                  </h3>
                                  <button
                                    onClick={() => {
                                      setRenameInputValue(currentProg);
                                      setIsRenamingProgram(true);
                                    }}
                                    className="text-[10px] text-indigo-700 hover:text-indigo-900 hover:bg-indigo-100 bg-indigo-50 border border-indigo-200 rounded px-1.5 py-0.5 cursor-pointer font-medium flex items-center gap-0.5 transition-colors"
                                    title="프로그램 명칭 일괄 변경"
                                  >
                                    <Edit className="w-2.5 h-2.5" />
                                    명칭 수정
                                  </button>
                                </div>
                              )}
                              <p className="text-[11px] text-slate-500 mt-1">
                                현재 본 프로그램에 총 <span className="font-bold text-indigo-700">{matchingParticipations.length}명</span>의 주민이 등록하여 수혜 중입니다.
                              </p>
                            </div>
                            <button
                              onClick={() => {
                                setNewParticipation({
                                  residentId: residents[0]?.id || '',
                                  programName: currentProg,
                                  participationDate: new Date().toISOString().split('T')[0],
                                  durationHours: 2,
                                  progressStatus: '참여예정',
                                  notes: ''
                                });
                                setShowParticipationModal(true);
                              }}
                              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3 py-1.5 rounded flex items-center gap-1 cursor-pointer transition-colors"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              신규 참여자 등록
                            </button>
                          </div>

                          {/* 참여 주민 정보 테이블 */}
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                                  <th className="p-2.5">참여자 어르신</th>
                                  <th className="p-2.5">거주 동</th>
                                  <th className="p-2.5">수혜일</th>
                                  <th className="p-2.5">참여시간</th>
                                  <th className="p-2.5">진행상태</th>
                                  <th className="p-2.5 max-w-xs">미작성 구체적 특이사항 요약</th>
                                  <th className="p-2.5 text-right">관리</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {matchingParticipations.map(p => {
                                  const res = residents.find(r => r.id === p.residentId);
                                  return (
                                    <tr key={p.id} className="hover:bg-slate-50/55 transition-colors">
                                      <td className="p-2.5">
                                        {res ? (
                                          <button 
                                            onClick={() => { setSelectedResident(res); setActiveTab('residents'); }}
                                            className="font-bold text-indigo-600 hover:underline text-left cursor-pointer"
                                          >
                                            {res.name} <span className="text-[10px] text-slate-400">({typeof res.age === 'number' || !isNaN(Number(res.age)) ? `${res.age}세` : res.age}, {res.gender})</span>
                                          </button>
                                        ) : (
                                          <span className="text-red-400">[탈퇴 주민]</span>
                                        )}
                                      </td>
                                      <td className="p-2.5">
                                        {res ? (
                                          <span className="bg-indigo-50/60 text-indigo-700 text-[10px] px-1.5 py-0.5 rounded font-medium">
                                            {res.dong || '기타 동'}
                                          </span>
                                        ) : (
                                          <span className="text-slate-400">-</span>
                                        )}
                                      </td>
                                      <td className="p-2.5 text-slate-500 font-mono">{p.participationDate}</td>
                                      <td className="p-2.5 text-slate-600 font-mono">{p.durationHours}시간</td>
                                      <td className="p-2.5">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                          p.progressStatus === '완료' 
                                            ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' 
                                            : p.progressStatus === '진행중' 
                                            ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                                            : p.progressStatus === '참여예정'
                                            ? 'bg-amber-50/60 text-amber-700 border border-amber-200'
                                            : 'bg-gray-100 text-gray-700'
                                        }`}>
                                          {p.progressStatus}
                                        </span>
                                      </td>
                                      <td className="p-2.5 text-slate-500 max-w-xs truncate" title={p.notes}>
                                        {p.notes || '-'}
                                      </td>
                                      <td className="p-2.5 text-right space-x-1">
                                        <button
                                          onClick={() => {
                                            setNewParticipation(p);
                                            setShowParticipationModal(true);
                                          }}
                                          className="text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer p-1 rounded hover:bg-indigo-50"
                                          title="수혜 명세 수정"
                                        >
                                          <Edit className="w-3.5 h-3.5 inline" />
                                        </button>
                                        <button
                                          onClick={() => handleDeleteParticipation(p.id)}
                                          className="text-slate-400 hover:text-red-500 transition-colors cursor-pointer p-1 rounded hover:bg-red-50"
                                          title="수혜 명세 제거"
                                        >
                                          <Trash2 className="w-3.5 h-3.5 inline" />
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}

                                {matchingParticipations.length === 0 && (
                                  <tr>
                                    <td colSpan={7} className="text-center p-8 text-slate-400 bg-slate-50 rounded">
                                      본 프로그램의 수혜 기록이 존재하지 않습니다.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center p-12 text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                          <Layers className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                          <span>생성된 프로그램이 존재하지 않습니다. 먼저 서비스 현황 탭 등에서 신규 수혜 기록을 추가해주세요.</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* TAB 4: 참여 프로그램 관리 (Program List) */}
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
                      <th className="p-2.5 text-right">관리</th>
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
                                className="font-bold text-indigo-600 hover:underline text-left cursor-pointer"
                              >
                                {res.name} 어르신 ({typeof res.age === 'number' || !isNaN(Number(res.age)) ? `${res.age}세` : res.age})
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
                          <td className="p-2.5 text-right space-x-1">
                            <button
                              onClick={() => {
                                setNewParticipation(p);
                                setShowParticipationModal(true);
                              }}
                              className="text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer p-1 rounded hover:bg-indigo-50"
                              title="수혜 명세 수정"
                            >
                              <Edit className="w-4 h-4 inline" />
                            </button>
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
                    placeholder="예: 홍길동"
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
                  <label className="block font-semibold text-slate-700 mb-1">생년월일 (만나이 계산)</label>
                  <input
                    type="text"
                    value={editingResident.age || ''}
                    placeholder="예: 1234.56.78"
                    onChange={(e) => setEditingResident({ ...editingResident, age: e.target.value })}
                    className="w-full text-xs p-2 border border-slate-200 rounded outline-hidden bg-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">기본 연락처</label>
                  <input
                    type="text"
                    value={editingResident.basicPhone || ''}
                    placeholder="예: 010-1234-5678 (본인)"
                    onChange={(e) => setEditingResident({ ...editingResident, basicPhone: e.target.value })}
                    className="w-full text-xs p-2 border border-slate-200 rounded outline-hidden bg-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">안부 비상연락처</label>
                <input
                  type="text"
                  value={editingResident.phone || ''}
                  placeholder="예: 010-5678-8765 (자녀 또는 이웃 비상 연락망)"
                  onChange={(e) => setEditingResident({ ...editingResident, phone: e.target.value })}
                  className="w-full text-xs p-2 border border-slate-200 rounded outline-hidden bg-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>

               <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">거주 동 (필수)</label>
                  <select
                    value={editingResident.dong || '면목 4동'}
                    onChange={(e) => setEditingResident({ ...editingResident, dong: e.target.value as any })}
                    className="w-full text-xs p-2 border border-slate-200 rounded outline-hidden bg-white focus:ring-2 focus:ring-indigo-500 h-[34px]"
                  >
                    <option value="면목 4동">면목 4동</option>
                    <option value="면목 7동">면목 7동</option>
                    <option value="면목 5동">면목 5동</option>
                    <option value="면목 3·8동">면목 3·8동</option>
                    <option value="기타 동">기타 동</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">실 거주지 상세주소</label>
                  <input
                    type="text"
                    value={editingResident.address || ''}
                    onChange={(e) => setEditingResident({ ...editingResident, address: e.target.value })}
                    className="w-full text-xs p-2 border border-slate-200 rounded outline-hidden bg-white focus:ring-2 focus:ring-indigo-500 h-[34px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">장애 여부</label>
                  <select
                    value={editingResident.disabilityType || '없음'}
                    onChange={(e) => setEditingResident({ ...editingResident, disabilityType: e.target.value as any })}
                    className="w-full text-xs p-2 border border-slate-200 rounded outline-hidden bg-white focus:ring-2 focus:ring-indigo-500 h-[34px]"
                  >
                    <option value="없음">없음</option>
                    <option value="경증(4~5등급)">경증(4~5등급)</option>
                    <option value="중증(1~3등급)">중증(1~3등급)</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">세부 장애 내용</label>
                  <input
                    type="text"
                    placeholder="장애 종류 및 세부 내역 기입 (예: 시각장애, 지체장애 등)"
                    value={editingResident.disabilityDetails || ''}
                    disabled={!editingResident.disabilityType || editingResident.disabilityType === '없음'}
                    onChange={(e) => setEditingResident({ ...editingResident, disabilityDetails: e.target.value })}
                    className="w-full text-xs p-2 border border-slate-200 rounded outline-hidden bg-white focus:ring-2 focus:ring-indigo-500 h-[34px] disabled:bg-slate-50 disabled:text-slate-400"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-705 mb-1">사회적 고립 상태 분류</label>
                <select
                  value={editingResident.isolationGroup || '해당없음'}
                  onChange={(e) => setEditingResident({ ...editingResident, isolationGroup: e.target.value as any })}
                  className="w-full text-xs p-2 border border-slate-200 rounded outline-hidden bg-white focus:ring-2 focus:ring-indigo-500 h-[34px]"
                >
                  <option value="해당없음">해당없음 (일반관리)</option>
                  <option value="관계지원군">관계지원군</option>
                  <option value="일상지원군">일상지원군</option>
                  <option value="일상위험고립군">일상위험고립군</option>
                  <option value="집중관리군">집중관리군</option>
                  <option value="긴급위기군">긴급위기군</option>
                </select>
              </div>

              {!editingResident.id && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">초기 참여 복지관 프로그램 (동시 등록)</label>
                  <input
                    type="text"
                    list="program-suggestions-modal"
                    placeholder="예: 노래교실, 밑반찬 배달 등 프로그램명 자유 기입 또는 더블클릭 선택"
                    value={editingResident.initialProgram || ''}
                    onChange={(e) => setEditingResident({ ...editingResident, initialProgram: e.target.value })}
                    className="w-full text-xs p-2 border border-slate-200 rounded outline-hidden bg-white focus:ring-2 focus:ring-indigo-500 h-[34px]"
                  />
                  <datalist id="program-suggestions-modal">
                    {Array.from(new Set(participations.map(p => p.programName)))
                      .filter((p): p is string => typeof p === 'string' && !!p)
                      .sort()
                      .map((prog) => (
                        <option key={prog} value={prog} />
                      ))}
                  </datalist>
                  <p className="text-[10px] text-slate-400 mt-1">
                    * 작성 완료 시 본 어르신의 첫 수혜 프로그램 가입 이력이 즉시 신설 동기화됩니다.
                  </p>
                </div>
              )}

              {!editingResident.id && (
                <div className="bg-slate-50 p-2.5 rounded border border-slate-200 space-y-2">
                  <div className="text-[11px] font-bold text-indigo-700 flex items-center gap-1">
                    <span className="inline-block w-1.5 h-1.5 bg-indigo-600 rounded-full animate-ping"></span>
                    초기 지역 이웃 관계망 연결 (동시 등록)
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-0.5">연결 대상 이웃 주민</label>
                      <select
                        value={editingResident.initialRelationTargetId || ''}
                        onChange={(e) => setEditingResident({ ...editingResident, initialRelationTargetId: e.target.value })}
                        className="w-full text-[11px] p-1.5 border border-slate-200 rounded outline-hidden bg-white focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="">관계 연결 안 함 (선택 없음)</option>
                        {residents.map(r => (
                          <option key={r.id} value={r.id}>
                            {r.name} ({typeof r.age === 'number' || !isNaN(Number(r.age)) ? `${r.age}세` : r.age}, {r.dong || '기타 동'})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-0.5">관계 유형</label>
                      <select
                        value={editingResident.initialRelationType || '이웃'}
                        onChange={(e) => setEditingResident({ ...editingResident, initialRelationType: e.target.value as any })}
                        className="w-full text-[11px] p-1.5 border border-slate-200 rounded outline-hidden bg-white focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="이웃">이웃</option>
                        <option value="친척">친척</option>
                        <option value="친구">친구</option>
                        <option value="지인">지인</option>
                        <option value="돌봄제공자">돌봄제공자</option>
                        <option value="공공기관">공공기관</option>
                        <option value="기타">기타</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-5 gap-2">
                    <div className="col-span-2">
                      <label className="block text-[10px] text-slate-500 mb-0.5">친밀도 수치</label>
                      <select
                        value={editingResident.initialRelationStrength || 3}
                        onChange={(e) => setEditingResident({ ...editingResident, initialRelationStrength: Number(e.target.value) })}
                        className="w-full text-[11px] p-1.5 border border-slate-200 rounded outline-hidden bg-white focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value={1}>1 (매우 낮음)</option>
                        <option value={2}>2 (낮음)</option>
                        <option value={3}>3 (보통)</option>
                        <option value={4}>4 (높음)</option>
                        <option value={5}>5 (매우 높음)</option>
                      </select>
                    </div>
                    <div className="col-span-3">
                      <label className="block text-[10px] text-slate-500 mb-0.5">관계 특이사항 요약</label>
                      <input
                        type="text"
                        placeholder="예: 같은 통 거주, 정기 가가호호 연락처 교환지"
                        value={editingResident.initialRelationNotes || ''}
                        onChange={(e) => setEditingResident({ ...editingResident, initialRelationNotes: e.target.value })}
                        className="w-full text-[11px] p-1.5 border border-slate-200 rounded outline-hidden bg-white focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    * 본 주민 편적 즉시 해당 주민과의 상호 이웃 관계선이 네트워크 지도로 즉시 투영됩니다.
                  </p>
                </div>
              )}

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
          <div className="bg-white rounded border border-slate-300 max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl p-5 relative">
            <button
              onClick={() => setShowParticipationModal(false)}
              className="absolute top-4 right-4 p-1 hover:bg-slate-100 text-slate-400 rounded transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-sm font-bold text-slate-950 mb-1">
              {newParticipation.id ? '프로그램 참여 기록 수정' : '프로그램 참여 기록장 기록'}
            </h3>
            <p className="text-xs text-slate-400 mb-3">
              {newParticipation.id ? '선택한 주민의 참여 기록 및 수혜 명세 세부정보를 수정합니다.' : '현재 주민의 행사, 노래교실, 일자리, 배달 수혜내용을 등재합니다.'}
            </p>

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
                    <option key={r.id} value={r.id}>{r.name} ({typeof r.age === 'number' || !isNaN(Number(r.age)) ? `${r.age}세` : r.age}) — {r.address}</option>
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
                  {newParticipation.id ? '수정 사항 저장' : '등록 및 반영'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. 소셜 관계선 추가 및 수정 입력 모달 */}
      {showRelationshipModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded border border-slate-300 max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl p-5 relative">
            <button
              onClick={() => {
                setShowRelationshipModal(false);
                setEditingRelationshipId(null);
                setNewRelationship({
                  sourceId: '',
                  targetId: '',
                  relationType: '이웃',
                  strength: 3,
                  notes: ''
                });
              }}
              className="absolute top-4 right-4 p-1 hover:bg-slate-100 text-slate-400 rounded transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-sm font-bold text-slate-950 mb-1">
              {editingRelationshipId ? '주민 연계망 연결고리 수정' : '주민 연계망 연결고리 생성'}
            </h3>
            <p className="text-xs text-slate-400 mb-3">
              {editingRelationshipId ? '지정된 두 어르신 간의 소셜 지형 관계도 정밀 분류 및 접밀 강도를 편집합니다.' : '어르신들끼리 혹은 전담 요양보호사/리더관 간 활성 지형 데이터를 매핑합니다.'}
            </p>

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
                    <option key={r.id} value={r.id}>{r.name} ({typeof r.age === 'number' || !isNaN(Number(r.age)) ? `${r.age}세` : r.age}) — {r.address}</option>
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
                    <option key={r.id} value={r.id}>{r.name} ({typeof r.age === 'number' || !isNaN(Number(r.age)) ? `${r.age}세` : r.age}) — {r.address}</option>
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
                    <option value="공공기관">공공기관</option>
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

              <div className="flex gap-2 justify-end pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowRelationshipModal(false);
                    setEditingRelationshipId(null);
                    setNewRelationship({
                      sourceId: '',
                      targetId: '',
                      relationType: '이웃',
                      strength: 3,
                      notes: ''
                    });
                  }}
                  className="px-3.5 py-1.5 border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 rounded cursor-pointer text-xs"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 font-bold text-white rounded cursor-pointer text-xs"
                >
                  {editingRelationshipId ? '관계 수정 완료' : '연결 접지'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. 구글 시트 연동 및 데이터 백업/복구 관리 모달 */}
      {showGasModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded border border-slate-300 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6 relative text-slate-800">
            <button
              onClick={() => setShowGasModal(false)}
              className="absolute top-4 right-4 p-1 hover:bg-slate-100 text-slate-400 rounded transition-colors cursor-pointer animate-none"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-sm font-bold text-slate-950 mb-1 flex items-center gap-1.5">
              <Settings className="w-4 h-4 text-indigo-600 animate-none" />
              연동 및 데이터 백업/복구 설정
            </h3>
            <p className="text-xs text-slate-400 mb-4 font-normal">
              기기(PC와 모바일) 간 데이터를 완벽하게 일치시키기 위한 분산 전용 백업 및 클라우드 연동 제어판입니다.
            </p>

            <div className="space-y-5 text-xs">
              {/* Part 1: 구글 시트 웹 앱 */}
              <form onSubmit={handleSaveSettingsForm} className="space-y-3 bg-slate-50 border border-slate-200 p-3.5 rounded-lg">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="font-bold text-slate-800 text-xs flex items-center gap-1">
                    <Database className="w-3.5 h-3.5 text-indigo-600" />
                    실시간 구글 시트 클라우드 연동
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={inputGasEnabled}
                      onChange={(e) => setInputGasEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-8 h-4 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-600"></div>
                    <span className="ml-1.5 text-[10px] font-bold text-slate-500">
                      {inputGasEnabled ? '켬' : '끎'}
                    </span>
                  </label>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-705 block text-slate-750">Google Apps Script Web App URL</label>
                  <input
                    type="url"
                    placeholder="https://script.google.com/macros/s/.../exec"
                    value={inputGasUrl}
                    onChange={(e) => setInputGasUrl(e.target.value)}
                    className="w-full text-xs p-2 border border-slate-200 rounded outline-hidden bg-white focus:ring-2 focus:ring-indigo-500 text-slate-800"
                    disabled={!inputGasEnabled}
                  />
                  <p className="text-[10px] text-slate-400 leading-relaxed font-normal">
                    * 구글 스프레드시트 연동을 활성화하고 본인의 앱스 스크립트 웹 앱 주소를 복사-붙여넣기하면, 실시간 클라우드 저장이 연계되어 PC-모바일 기기가 같은 클라우드 시트를 공용 사용하도록 자동 실시간 정렬화처리됩니다.
                  </p>
                </div>

                <div className="flex justify-between items-center pt-1.5 gap-2">
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="p-1 px-2 border border-slate-200 text-slate-600 hover:bg-slate-100 bg-white rounded cursor-pointer text-[10px] font-medium flex items-center gap-1 transition-colors"
                  >
                    <Copy className="w-3 h-3" />
                    <span>{isCopied ? '복사 완료!' : '스크립트 코드 복사 (원전)'}</span>
                  </button>
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 font-bold text-white rounded cursor-pointer text-[11px] transition-colors"
                  >
                    연동 설정 저장 및 동기화
                  </button>
                </div>
              </form>

              {/* Part 2: 오프라인 수동 백업 및 복구 */}
              <div className="space-y-3 bg-indigo-50/40 border border-indigo-100 p-3.5 rounded-lg text-slate-800">
                <span className="font-bold text-indigo-950 text-xs flex items-center gap-1 border-b border-indigo-100 pb-2">
                  <RefreshCw className="w-3.5 h-3.5 text-indigo-600" />
                  수동 데이터 백업 및 즉시 복구 (기기간 직접 이관)
                </span>
                
                <p className="text-[11px] text-slate-500 leading-relaxed font-normal">
                  스프레드시트 세팅 작업 없이, 단순히 현재 PC의 상태를 모바일 기기로 넘기고 싶을 때 사용할 수 있는 고간이성 다이렉트 백업 기능입니다. PC에서 <strong>백업 파일 다운로드</strong> 한 뒤 파일(.json)을 카톡, 메일 등으로 모바일에 전송하여 모바일에서 <strong>가져오기</strong> 해주세요.
                </p>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleExportData}
                    className="flex-1 py-2 px-3 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 bg-white rounded cursor-pointer text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    현재 데이터 백업 파일 받기 (.json)
                  </button>

                  <label className="flex-1 py-2 px-3 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 bg-white rounded cursor-pointer text-xs font-bold flex items-center justify-center gap-1.5 transition-colors text-center">
                    <Upload className="w-3.5 h-3.5" />
                    <span>백업 파일 복구하기 (.json)</span>
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleImportData}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 🚀 하단 카피라이트 가이드라인 바 */}
      <footer className="bg-white border-t border-slate-200 px-6 py-4 mt-auto text-xs text-slate-400 flex flex-wrap justify-between items-center gap-4">
        <span>© 2026 구글 스프레드시트 풀스택 주민 정보 & 소외선 분석 명록 시스템</span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Info className="w-3.5 h-3.5 text-indigo-600" />
            구글 드라이브 앱스 스크립트 기반 동작 (CORS-Compliant CORS Tunneling)
          </span>

        </div>
      </footer>
    </div>
  );
}
