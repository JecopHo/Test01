/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { Resident, Relationship } from '../types';
import { RotateCcw, Filter, UserMinus, ShieldCheck, HeartPulse, Search } from 'lucide-react';

interface NetworkGraphProps {
  residents: Resident[];
  relationships: Relationship[];
  onSelectResident: (resident: Resident) => void;
}

// D3 Node 및 Link 확장 타입 정의
interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  gender: '남성' | '여성';
  age: number;
  isIsolated: boolean;
  notes: string;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  id: string;
  source: string | GraphNode;
  target: string | GraphNode;
  relationType: string;
  strength: number;
  notes: string;
}

export default function NetworkGraph({ residents, relationships, onSelectResident }: NetworkGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // 필터 상태
  const [selectedRelationType, setSelectedRelationType] = useState<string>('모두');
  const [minStrength, setMinStrength] = useState<number>(1);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);

  // 컨테이너 크기 관리
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });

  // ResizeObserver로 컨테이너 가로/세로를 실시간 반응형 감지
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        // 최소 크기 지정
        setDimensions({
          width: Math.max(width, 400),
          height: Math.max(height, 500)
        });
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // 관계망 데이터 가공 (필터 고려)
  const filteredLinks = useMemo(() => {
    return relationships.filter(rel => {
      const matchType = selectedRelationType === '모두' || rel.relationType === selectedRelationType;
      const matchStrength = rel.strength >= minStrength;
      
      // 소스/타겟이 실제로 존재하는 주민인지 추가 검증
      const sourceExists = residents.some(r => r.id === rel.sourceId);
      const targetExists = residents.some(r => r.id === rel.targetId);

      return matchType && matchStrength && sourceExists && targetExists;
    });
  }, [relationships, selectedRelationType, minStrength, residents]);

  // 그래프 노드 목록 구성 (고립 여부 자동 탐색)
  const graphNodes = useMemo(() => {
    return residents.map(res => {
      // 해당 주민과 연결된 유효한 연결선 개수 조사
      const connectionCount = filteredLinks.filter(
        link => link.sourceId === res.id || link.targetId === res.id
      ).length;

      return {
        id: res.id,
        name: res.name,
        gender: res.gender,
        age: res.age,
        notes: res.notes,
        isIsolated: connectionCount === 0
      } as GraphNode;
    });
  }, [residents, filteredLinks]);

  // 고립된 주민 리스트 추출
  const isolatedResidents = useMemo(() => {
    return graphNodes.filter(n => n.isIsolated);
  }, [graphNodes]);

  // 검색 쿼리에 맞는 노드 ID 목록
  const matchedNodeIds = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return residents
      .filter(r => r.name.toLowerCase().includes(searchQuery.toLowerCase()))
      .map(r => r.id);
  }, [residents, searchQuery]);

  // D3 시뮬레이션 구현
  useEffect(() => {
    if (!svgRef.current) return;

    // 1. 기존 요소 클리어
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const { width, height } = dimensions;

    // 2. 딥 카피를 통해 원본 데이터 오염 방지 (D3가 내부 요소를 덮어씀)
    const nodesCopy: GraphNode[] = graphNodes.map(d => ({ ...d }));
    const linksCopy: GraphLink[] = filteredLinks.map(d => ({
      id: d.id,
      source: d.sourceId,
      target: d.targetId,
      relationType: d.relationType,
      strength: d.strength,
      notes: d.notes
    }));

    // 3. Zoom 동작 활성화
    const gContainer = svg.append('g').attr('class', 'graph-content');
    
    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on('zoom', (event) => {
        gContainer.attr('transform', event.transform);
      });

    svg.call(zoomBehavior);

    // 4. Force 물리 시뮬레이션 설정 (고립 상태 배려 밀어내기/끌어당기기)
    const simulation = d3.forceSimulation<GraphNode>(nodesCopy)
      .force('link', d3.forceLink<GraphNode, GraphLink>(linksCopy)
        .id(d => d.id)
        .distance(120)
      )
      .force('charge', d3.forceManyBody().strength(-280)) // 노드 간 척력
      .force('center', d3.forceCenter(width / 2, height / 2)) // 중앙 정렬력
      .force('collision', d3.forceCollide().radius(45)); // 충돌 방지 반지름

    // 5. 관계선 그리기
    const link = gContainer.append('g')
      .attr('class', 'links')
      .selectAll<SVGLineElement, GraphLink>('line')
      .data(linksCopy)
      .enter().append('line')
      .attr('stroke', d => {
        switch (d.relationType) {
          case '이웃': return '#10b981'; // 초록
          case '돌봄제공자': return '#3b82f6'; // 파랑
          case '친척': return '#f59e0b'; // 오렌지
          case '친구': return '#8b5cf6'; // 보라
          case '지인': return '#ec4899'; // 핑크
          default: return '#9ca3af'; // 그레이
        }
      })
      .attr('stroke-opacity', 0.8)
      .attr('stroke-width', d => d.strength * 1.5 + 1) // 강도에 비례한 선 두께
      .attr('stroke-dasharray', d => d.relationType === '돌봄제공자' ? '4,4' : 'none')
      .style('cursor', 'pointer');

    // 관계선 마우스 오버용 보이지 않는 두꺼운 인터랙션 라인 추가
    const linkHover = gContainer.append('g')
      .selectAll<SVGLineElement, GraphLink>('line_hover')
      .data(linksCopy)
      .enter().append('line')
      .attr('stroke', 'transparent')
      .attr('stroke-width', 15)
      .style('cursor', 'pointer');

    // 6. 노드 그룹핑 (배경 서클 + 이니셜 텍스트)
    const node = gContainer.append('g')
      .attr('class', 'nodes')
      .selectAll<SVGGElement, GraphNode>('g')
      .data(nodesCopy)
      .enter().append('g')
      .style('cursor', 'pointer');

    // 터치 및 모바일 인터랙션 상태 관리
    let touchTimer: any = null;
    let isHoldingLink = false;
    let touchStartX = 0;
    let touchStartY = 0;
    let touchMoved = false;
    let activeTouchNodeId: string | null = null;

    const activateNodeHighlight = (d: GraphNode, clientX: number, clientY: number) => {
      // 호버 시 인접한 연결 정보 하이라이트
      const adjNodeIds = new Set<string>([d.id]);
      
      linksCopy.forEach(l => {
        const sId = typeof l.source === 'object' ? l.source.id : l.source;
        const tId = typeof l.target === 'object' ? l.target.id : l.target;
        if (sId === d.id) adjNodeIds.add(tId);
        if (tId === d.id) adjNodeIds.add(sId);
      });

      // 타 노드들 불투명화
      node.style('opacity', n => adjNodeIds.has(n.id) ? 1.0 : 0.15);
      link.style('opacity', l => {
        const sId = typeof l.source === 'object' ? l.source.id : l.source;
        const tId = typeof l.target === 'object' ? l.target.id : l.target;
        return (sId === d.id || tId === d.id) ? 1.0 : 0.08;
      });

      // 툴팁 활성
      const tooltip = d3.select('#graph-tooltip');
      tooltip.style('opacity', 1)
        .html(`
          <div class="px-3 py-2 text-xs bg-white text-gray-800 border border-gray-200 rounded shadow-xl max-w-xs leading-relaxed">
            <p class="font-bold text-gray-900 text-sm flex items-center gap-1.5">
              ${d.name} <span class="text-xs text-gray-500 font-normal">(${d.gender}, ${d.age}세)</span>
              ${d.isIsolated ? '<span class="bg-red-100 text-red-700 text-[10px] px-1 rounded font-normal">고립선별</span>' : ''}
            </p>
            <p class="mt-1 text-gray-600 line-clamp-3 bg-gray-50 p-1.5 rounded text-[11px]">${d.notes || '기록된 복지 특이조건이 없습니다.'}</p>
            <p class="mt-1 text-[10px] text-gray-400">💡 클릭하면 해당 주민의 상세 프로파일로 즉시 이동합니다.</p>
          </div>
        `)
        .style('left', (clientX + 15) + 'px')
        .style('top', (clientY + 15) + 'px');
    };

    const resetNodeHighlight = () => {
      node.style('opacity', 1.0);
      link.style('opacity', 0.8);
      d3.select('#graph-tooltip').style('opacity', 0);
    };

    const activateLinkHighlight = (el: any, clientX: number, clientY: number, d: GraphLink) => {
      const sourceNode = typeof d.source === 'object' ? d.source.name : d.source;
      const targetNode = typeof d.target === 'object' ? d.target.name : d.target;
      
      // 툴팁 생성
      const tooltip = d3.select('#graph-tooltip');
      tooltip.style('opacity', 1)
        .html(`
          <div class="px-3 py-2 text-xs bg-gray-900 border border-semibold text-white rounded shadow-lg max-w-xs">
            <p class="font-bold flex items-center gap-1">
              <span class="w-2 h-2 rounded inline-block" style="background-color: ${
                d.relationType === '이웃' ? '#10b981' : d.relationType === '돌봄제공자' ? '#3b82f6' : '#8b5cf6'
              }"></span>
              ${sourceNode} ⇆ ${targetNode} [${d.relationType}]
            </p>
            <p class="mt-1 text-gray-300">내용: ${d.notes || '교류 정보 없음'}</p>
            <p class="mt-1 text-yellow-500 font-semibold text-[11px]">교류강도: ${'★'.repeat(d.strength)} (${d.strength}/5)</p>
          </div>
        `)
        .style('left', (clientX + 10) + 'px')
        .style('top', (clientY - 15) + 'px');

      d3.select(el)
        .attr('stroke', '#4b5563')
        .attr('stroke-opacity', 0.2);
    };

    const resetLinkHighlight = (el: any) => {
      d3.select('#graph-tooltip').style('opacity', 0);
      d3.select(el).attr('stroke', 'transparent');
    };

    // 관계선 인터랙션 바인딩
    linkHover
      .on('mouseenter', function (event, d) {
        activateLinkHighlight(this, event.clientX, event.clientY, d);
      })
      .on('mousemove', function (event) {
        d3.select('#graph-tooltip')
          .style('left', (event.clientX + 10) + 'px')
          .style('top', (event.clientY - 15) + 'px');
      })
      .on('mouseleave', function () {
        resetLinkHighlight(this);
      })
      .on('touchstart', function (event: any, d) {
        isHoldingLink = false;
        if (event.touches.length > 1) return;
        
        const touch = event.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        const targetEl = this;
        
        if (touchTimer) clearTimeout(touchTimer);
        touchTimer = setTimeout(() => {
          isHoldingLink = true;
          activateLinkHighlight(targetEl, touch.clientX, touch.clientY, d);
        }, 350);
      })
      .on('touchmove', function (event: any) {
        if (touchTimer) {
          const touch = event.touches[0];
          const dx = touch.clientX - touchStartX;
          const dy = touch.clientY - touchStartY;
          if (Math.sqrt(dx * dx + dy * dy) > 10) {
            clearTimeout(touchTimer);
            touchTimer = null;
          } else if (isHoldingLink) {
            d3.select('#graph-tooltip')
              .style('left', (touch.clientX + 10) + 'px')
              .style('top', (touch.clientY - 15) + 'px');
          }
        }
      })
      .on('touchend', function (event: any) {
        if (touchTimer) {
          clearTimeout(touchTimer);
          touchTimer = null;
        }
        if (isHoldingLink) {
          event.preventDefault();
          isHoldingLink = false;
          resetLinkHighlight(this);
        }
      })
      .on('touchcancel', function () {
        if (touchTimer) {
          clearTimeout(touchTimer);
          touchTimer = null;
        }
        if (isHoldingLink) {
          isHoldingLink = false;
          resetLinkHighlight(this);
        }
      });

    // 노드 인터랙션 바인딩
    node
      .on('click', (event, d) => {
        // 데스크탑 클릭: 단일 클릭 시 즉시 프로필 이동
        const clickedResident = residents.find(r => r.id === d.id);
        if (clickedResident) onSelectResident(clickedResident);
        setHighlightedNodeId(d.id);
      })
      .on('mouseenter', function (event, d) {
        activateNodeHighlight(d, event.clientX, event.clientY);
      })
      .on('mousemove', function (event) {
        d3.select('#graph-tooltip')
          .style('left', (event.clientX + 15) + 'px')
          .style('top', (event.clientY + 15) + 'px');
      })
      .on('mouseleave', function () {
        resetNodeHighlight();
      })
      .on('touchstart', function (event: any, d) {
        if (event.touches.length > 1) return;
        
        const touch = event.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        touchMoved = false;
      })
      .on('touchmove', function (event: any, d) {
        const touch = event.touches[0];
        const dx = touch.clientX - touchStartX;
        const dy = touch.clientY - touchStartY;
        // 드래그 거리 측정 (10px 이상이면 단순 탭이 아닌 드래깅으로 작동)
        if (Math.sqrt(dx * dx + dy * dy) > 10) {
          touchMoved = true;
        } else if (activeTouchNodeId === d.id) {
          // 이미 활성화된 상태의 툴팁이라면 미세하게 이동 트래킹
          d3.select('#graph-tooltip')
            .style('left', (touch.clientX + 15) + 'px')
            .style('top', (touch.clientY + 15) + 'px');
        }
      })
      .on('touchend', function (event: any, d) {
        if (touchMoved) return; // 제스처(드래그) 상태였을 경우는 리턴
        
        event.preventDefault();
        event.stopPropagation();
        
        if (activeTouchNodeId !== d.id) {
          // 첫 번째 터치: 상호 관계망 하이라이트 활성화 및 상세 설명 플로팅창 표시
          activateNodeHighlight(d, touchStartX, touchStartY);
          activeTouchNodeId = d.id;
        } else {
          // 두 번째 터치 (같은 노드 연달아 터치): 상세 정보 프로필로 진입
          const clickedResident = residents.find(r => r.id === d.id);
          if (clickedResident) onSelectResident(clickedResident);
          setHighlightedNodeId(d.id);
          
          // 리셋 후 선택 해제
          resetNodeHighlight();
          activeTouchNodeId = null;
        }
      })
      .on('touchcancel', function () {
        touchMoved = true;
      })
      .call(d3.drag<SVGGElement, GraphNode>()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended)
      );

    // 7. 노드 배경 서클 (고립 주민은 빨간 테두리&그라데이션 맥동 효과 유발)
    node.append('circle')
      .attr('r', d => d.id === highlightedNodeId ? 25 : 20)
      .attr('fill', d => {
        if (d.isIsolated) return '#fef2f2'; // 고립자는 여린 연빨강
        return d.gender === '남성' ? '#f0f9ff' : '#fff5f5'; // 남성은 마린, 여성은 로즈
      })
      .attr('stroke', d => {
        if (d.isIsolated) return '#ef4444'; // 고립경고 빨간색
        if (matchedNodeIds.includes(d.id)) return '#f59e0b'; // 검색 노드 골드색상
        return d.gender === '남성' ? '#38bdf8' : '#fb7185';
      })
      .attr('stroke-width', d => {
        if (d.isIsolated) return 3.5;
        if (matchedNodeIds.includes(d.id)) return 4;
        return 2;
      })
      .attr('class', d => d.isIsolated ? 'animate-pulse' : '');

    // 8. 주민 이름 이니셜 삽입
    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '.3em')
      .attr('font-size', '10px')
      .attr('font-weight', 'bold')
      .attr('fill', d => {
        if (d.isIsolated) return '#991b1b';
        return d.gender === '남성' ? '#0369a1' : '#9f1239';
      })
      .text(d => d.name.substring(0, 3));

    // 9. 노드 바로 아래에 세부 데이터 레이블
    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '2.1em')
      .attr('font-size', '11px')
      .attr('font-weight', '500')
      .attr('fill', '#374151')
      .text(d => `${d.name} (${d.age}세)`);

    // 시뮬레이션 매프레임 갱신 리스너
    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as GraphNode).x!)
        .attr('y1', d => (d.source as GraphNode).y!)
        .attr('x2', d => (d.target as GraphNode).x!)
        .attr('y2', d => (d.target as GraphNode).y!);

      linkHover
        .attr('x1', d => (d.source as GraphNode).x!)
        .attr('y1', d => (d.source as GraphNode).y!)
        .attr('x2', d => (d.target as GraphNode).x!)
        .attr('y2', d => (d.target as GraphNode).y!);

      node
        .attr('transform', d => `translate(${d.x!}, ${d.y!})`);
    });

    // 드래그 유틸리티 함수들
    function dragstarted(event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>, d: GraphNode) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>, d: GraphNode) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>, d: GraphNode) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    // 초기 카메라 리셋 (정중앙 줌 보정)
    svg.transition().duration(500).call(
      zoomBehavior.transform,
      d3.zoomIdentity.translate(0, 0).scale(0.95)
    );

    // 빈 배경 클릭/터치 시 하이라이트 해제 및 모바일 활성화 상태 초기화
    svg.on('click', function(event) {
      if (event.target === svgRef.current) {
        resetNodeHighlight();
        activeTouchNodeId = null;
      }
    });

    svg.on('touchstart', function(event) {
      if (event.target === svgRef.current) {
        resetNodeHighlight();
        activeTouchNodeId = null;
      }
    });

    return () => {
      simulation.stop();
    };
  }, [graphNodes, filteredLinks, dimensions, matchedNodeIds, highlightedNodeId, residents, onSelectResident]);

  // 가용 관계 필터 모음
  const relationTypes = ['모두', '이웃', '친척', '친구', '지인', '돌봄제공자', '기타'];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 h-full min-h-[600px]" id="network-graph-view">
      {/* 좌측 필터 패널 */}
      <div className="lg:col-span-1 bg-white p-4 rounded border border-slate-200 flex flex-col gap-4 shadow-sm" id="network-controls">
        <div>
          <h3 className="text-xs font-bold text-slate-950 flex items-center gap-2 mb-2">
            <Filter className="w-4 h-4 text-indigo-650" />
            인터랙티브 대화 필터링
          </h3>
          <p className="text-[11px] text-slate-500 leading-relaxed mb-3">
            주민의 인적 속성과 관계 분류를 필터링하여, 사회적 관계의 소외지역이나 핵심 거점이 되는 통로 역할을 시각적으로 파악합니다.
          </p>

          {/* 주민 이름 검색 */}
          <label className="block text-[10px] font-bold text-slate-700 mb-1">이름 검색</label>
          <div className="relative mb-3.5">
            <input
              type="text"
              placeholder="예: 김순자, 최옥분"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-8 pr-3 py-1.5 border border-slate-250 rounded hover:border-slate-350 focus:ring-2 focus:ring-indigo-500 outline-hidden transition-all bg-white"
            />
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          </div>

          {/* 관계 종류 선택 */}
          <label className="block text-[10px] font-bold text-slate-700 mb-1">관계 종류</label>
          <div className="flex flex-wrap gap-1 mb-3.5">
            {relationTypes.map((type) => (
              <button
                key={type}
                onClick={() => setSelectedRelationType(type)}
                className={`text-[10px] px-2 py-1 rounded border font-semibold transition-colors cursor-pointer ${
                  selectedRelationType === type
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {type}
              </button>
            ))}
          </div>

          {/* 친밀도 필터 */}
          <div className="mb-3.5">
            <div className="flex justify-between items-center mb-1">
              <label className="text-[10px] font-bold text-slate-700">최소 친밀도 지수</label>
              <span className="text-[10px] border border-indigo-200 text-indigo-700 font-bold bg-indigo-50 px-1.5 py-0.5 rounded">
                ★ {minStrength} 이상
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="5"
              step="1"
              value={minStrength}
              onChange={(e) => setMinStrength(Number(e.target.value))}
              className="w-full accent-indigo-600 h-1 bg-slate-200 rounded cursor-pointer"
            />
            <div className="flex justify-between text-[9px] text-slate-400 mt-1">
              <span>매우낮음(1)</span>
              <span>보통(3)</span>
              <span>매우높음(5)</span>
            </div>
          </div>
        </div>

        <hr className="border-slate-200" />

        {/* 사회 복적 모니터링: 1인 가구 및 고립 경보 */}
        <div className="flex-1 flex flex-col justify-between gap-3">
          <div>
            <h4 className="text-xs font-bold text-red-650 flex items-center gap-1.5 mb-2">
              <UserMinus className="w-4 h-4" />
              고립 위기 어르신 모니터링 ({isolatedResidents.length}명)
            </h4>
            <p className="text-[10px] text-slate-500 leading-relaxed mb-2.5">
              현재 필터 설정 기준, 마을 다른 주민들과 연결고리(이웃, 친구, 돌봄)가 등록되지 않은 '초고독 고립선별' 영가구 명단입니다.
            </p>

            {isolatedResidents.length > 0 ? (
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {isolatedResidents.map(r => (
                  <button
                    key={r.id}
                    onClick={() => {
                      const found = residents.find(res => res.id === r.id);
                      if (found) onSelectResident(found);
                      setHighlightedNodeId(r.id);
                    }}
                    className="w-full text-left p-2 rounded border border-red-150 bg-red-50/50 hover:bg-red-50 transition-colors flex items-center justify-between cursor-pointer"
                  >
                    <div>
                      <div className="text-[11px] font-bold text-slate-900">{r.name} ({r.age}세)</div>
                      <div className="text-[10px] text-red-700 font-medium mt-0.5 line-clamp-1">{r.notes || '연결 자원이 전혀 수집되지 않음'}</div>
                    </div>
                    <span className="text-[10px] uppercase font-bold text-red-650 bg-white border border-red-200 px-1.5 py-0.5 rounded">
                      고위험
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-3 bg-indigo-50 rounded border border-indigo-200/50 flex flex-col items-center justify-center text-center">
                <ShieldCheck className="w-5 h-5 text-indigo-650 mb-1" />
                <span className="text-[11px] font-bold text-indigo-900">모두 안전히 연결 상태</span>
                <span className="text-[10px] text-indigo-600 mt-0.5">네트워크 격리가 부재합니다.</span>
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-slate-200">
            <h5 className="text-[9px] font-bold text-slate-400 uppercase mb-1.5">시각화 범례</h5>
            <div className="grid grid-cols-2 gap-1.5 text-[10px] text-slate-600 font-semibold">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded bg-rose-450 inline-block"></span>
                <span>여성 주민</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded bg-cyan-450 inline-block"></span>
                <span>남성 주민</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded bg-red-500 inline-block ring-2 ring-red-150 animate-pulse"></span>
                <span>고립 주민 (적색)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded bg-amber-400 inline-block border border-amber-500"></span>
                <span>선택 하이라이트</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 우측 D3 메인 컨버스 */}
      <div className="lg:col-span-3 bg-slate-50 border border-slate-205 rounded flex flex-col relative overflow-hidden shadow-sm">
        {/* 상단 핀 컨트롤바 */}
        <div className="absolute top-3 left-3 right-3 z-10 flex flex-wrap justify-between items-center gap-2 pointer-events-none">
          <div className="bg-white/95 backdrop-blur-xs px-2.5 py-1 rounded border border-slate-200 text-[10px] font-bold text-slate-800 flex items-center gap-1.5 shadow pointer-events-auto">
            <HeartPulse className="w-3.5 h-3.5 text-indigo-600 animate-pulse" />
            <span>이웃 관계망 2D 피직스 시뮬레이션</span>
          </div>
          <div className="flex gap-2 pointer-events-auto">
            <button
              onClick={() => {
                setHighlightedNodeId(null);
                setSearchQuery('');
                setSelectedRelationType('모두');
                setMinStrength(1);
              }}
              className="bg-white hover:bg-slate-50 border border-slate-200 p-2 rounded text-slate-600 transition-colors shadow cursor-pointer"
              title="리렌더 및 상태 리셋"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* D3 툴팁 부모 및 설명창 */}
        <div
          id="graph-tooltip"
          className="fixed pointer-events-none opacity-0 transition-opacity duration-150 z-50 shadow-2xl"
        ></div>

        {/* 실제 SVG 돔 요소 */}
        <div ref={containerRef} className="relative flex-1 w-full min-h-[450px] lg:min-h-0 overflow-hidden">
          <svg
            ref={svgRef}
            width={dimensions.width}
            height={dimensions.height}
            className="absolute inset-0 w-full h-full"
          ></svg>
        </div>

        {/* 하단 단축 조작 팁 정보바 */}
        <div className="bg-white border-t border-slate-200 px-4 py-2 text-[10px] text-slate-500 flex justify-between items-center">
          <span>💡 <b>줌 & 패닝:</b> 마우스 휠 스크롤 및 지면 드래그 탐색 가능 / <b>어르신 정렬:</b> 노드를 드래그해 임시 재배치할 수 있습니다.</span>
          <span className="font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
            활성화 선 수: {filteredLinks.length}개
          </span>
        </div>
      </div>
    </div>
  );
}
