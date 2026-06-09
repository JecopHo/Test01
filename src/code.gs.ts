/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const GOOGLE_APPS_SCRIPT_CODE = `/**
 * 구글 스프레드시트 기반 풀스택 주민 정보 & 관계망 관리 API
 * 
 * [설치 방법]
 * 1. 구글 스프레드시트를 새로 생성합니다.
 * 2. 상단 메뉴에서 [확장 프로그램] -> [Apps Script]를 클릭합니다.
 * 3. 기존의 myFunction 코드를 지우고 본 코드를 그대로 붙여넣습니다.
 * 4. 상단 [저장] 버튼(디스켓 모양)을 누릅니다.
 * 5. 우측 상단 [배포] -> [새 배포]를 클릭합니다.
 * 6. 유형 선택(톱니바퀴)에서 [웹 앱]을 선택합니다.
 * 7. 다음 설정을 적용합니다:
 *    - 설명: 주민 관리 API 배포
 *    - 웹 앱을 실행할 사용자: 나 (귀하의 구글 계정)
 *    - 액세스 권한이 있는 사용자: 모든 사람 (Anyone) - 로그인 없이 React 웹에서 접근해야 하므로 필수적입니다.
 * 8. [배포]를 클릭하고 약관에 동의(고급 -> 이동 클릭)한 후, 생성된 **웹 앱 URL**을 복사하여 웹사이트 설정 창에 입력하세요!
 */

// 시트 이름 정의
const SHEETS = {
  RESIDENTS: '주민',
  PARTICIPATION: '참여이력',
  RELATIONSHIPS: '관계망'
};

// CORS 및 CORS 예비 요청 지원을 위한 편의 함수
function doGet(e) {
  // 스프레드시트 검증 및 기본 헤더 생성
  initSpreadsheet();
  
  const action = e.parameter.action;
  let responseData;

  try {
    if (action === 'getAll') {
      responseData = {
        success: true,
        data: {
          residents: getSheetData(SHEETS.RESIDENTS),
          participations: getSheetData(SHEETS.PARTICIPATION),
          relationships: getSheetData(SHEETS.RELATIONSHIPS)
        }
      };
    } else {
      responseData = {
        success: false,
        error: '지원하지 않는 GET 액션입니다.'
      };
    }
  } catch (error) {
    responseData = { success: false, error: error.toString() };
  }

  return createJsonResponse(responseData);
}

function doPost(e) {
  initSpreadsheet();
  
  let responseData;
  try {
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;
    const body = payload.data;

    if (!action) {
      throw new Error('액션(action) 파라미터가 비어 있습니다.');
    }

    switch (action) {
      // 주민 CRUD
      case 'saveResident':
        responseData = saveRow(SHEETS.RESIDENTS, body);
        break;
      case 'deleteResident':
        responseData = deleteRow(SHEETS.RESIDENTS, body.id);
        // 주민이 삭제되면 해당 주민과 관련된 참여이력 및 관계망도 같이 연쇄 삭제해 데이터 무결성 지키기
        cascadeDelete(body.id);
        break;

      // 참여이력 CRUD
      case 'saveParticipation':
        responseData = saveRow(SHEETS.PARTICIPATION, body);
        break;
      case 'deleteParticipation':
        responseData = deleteRow(SHEETS.PARTICIPATION, body.id);
        break;

      // 관계망 CRUD
      case 'saveRelationship':
        responseData = saveRow(SHEETS.RELATIONSHIPS, body);
        break;
      case 'deleteRelationship':
        responseData = deleteRow(SHEETS.RELATIONSHIPS, body.id);
        break;

      default:
        throw new Error('알 수 없는 POST 액션입니다: ' + action);
    }
  } catch (error) {
    responseData = { success: false, error: error.toString() };
  }

  return createJsonResponse(responseData);
}

// JSON 응답 생성 (CORS 해결용 헤더 필수 포함)
function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// 초기화: 시트가 비어있다면 테이블 헤더(스키마) 생성
function initSpreadsheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 주민 시트 체크
  let sResidents = ss.getSheetByName(SHEETS.RESIDENTS);
  if (!sResidents) {
    sResidents = ss.insertSheet(SHEETS.RESIDENTS);
    sResidents.appendRow(['id', 'name', 'gender', 'age', 'phone', 'address', 'notes', 'registeredAt']);
  }

  // 참여이력 시트 체크
  let sParticipation = ss.getSheetByName(SHEETS.PARTICIPATION);
  if (!sParticipation) {
    sParticipation = ss.insertSheet(SHEETS.PARTICIPATION);
    sParticipation.appendRow(['id', 'residentId', 'programName', 'participationDate', 'durationHours', 'progressStatus', 'notes']);
  }

  // 관계망 시트 체크
  let sRelationships = ss.getSheetByName(SHEETS.RELATIONSHIPS);
  if (!sRelationships) {
    sRelationships = ss.insertSheet(SHEETS.RELATIONSHIPS);
    sRelationships.appendRow(['id', 'sourceId', 'targetId', 'relationType', 'strength', 'notes']);
  }
}

// 시트 전체 데이터를 JSON 오브젝트 배열로 읽기
function getSheetData(sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return []; // 데이터 없음 (헤더만 있음)

  const headers = rows[0];
  const data = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const item = {};
    let isEmpty = true;
    for (let j = 0; j < headers.length; j++) {
      item[headers[j]] = row[j];
      if (row[j] !== '') isEmpty = false;
    }
    if (!isEmpty) {
      // 숫자 및 날짜 필드 수동 타입 조절
      if (item.age) item.age = isNaN(Number(item.age)) ? item.age : Number(item.age);
      if (item.durationHours) item.durationHours = Number(item.durationHours);
      if (item.strength) item.strength = Number(item.strength);
      
      data.push(item);
    }
  }
  return data;
}

// 데이터 삽입 및 업데이트 (id 기준으로 자동 식별)
function saveRow(sheetName, item) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  
  if (!item.id) {
    // ID가 없을 경우 새로운 UUID 성격의 고유 키 자동생성
    item.id = 'ID_' + Math.random().toString(36).substr(2, 9).toUpperCase();
  }

  const newRowValues = headers.map(header => {
    return item[header] !== undefined ? item[header] : '';
  });

  // 기존 행 업데이트 검사
  let foundRowIndex = -1;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === item.id) {
      foundRowIndex = i + 1; // 1-based index 및 1번은 헤더이므로 보정
      break;
    }
  }

  if (foundRowIndex !== -1) {
    // 업뎃
    const range = sheet.getRange(foundRowIndex, 1, 1, headers.length);
    range.setValues([newRowValues]);
  } else {
    // 추가
    sheet.appendRow(newRowValues);
  }

  return { success: true, data: item };
}

// 데이터 삭제
function deleteRow(sheetName, id) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const rows = sheet.getDataRange().getValues();
  
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === id) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { success: false, error: '삭제할 데이터를 찾지 못했습니다.' };
}

// 주민이 탈퇴되거나 삭제될 시 연쇄 삭제 처리
function cascadeDelete(residentId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 참여이력 삭제
  const sPart = ss.getSheetByName(SHEETS.PARTICIPATION);
  const rowsPart = sPart.getDataRange().getValues();
  for (let i = rowsPart.length - 1; i >= 1; i--) {
    if (rowsPart[i][1] === residentId) { // residentId 컬럼
      sPart.deleteRow(i + 1);
    }
  }

  // 관계망 삭제 (sourceId 혹은 targetId 둘 다 체크)
  const sRel = ss.getSheetByName(SHEETS.RELATIONSHIPS);
  const rowsRel = sRel.getDataRange().getValues();
  for (let i = rowsRel.length - 1; i >= 1; i--) {
    if (rowsRel[i][1] === residentId || rowsRel[i][2] === residentId) { // sourceId 혹은 targetId
      sRel.deleteRow(i + 1);
    }
  }
}
`;
