// 기존 app/detail.js 를 옮긴 것
// 파일 전체를 init() 안에 넣어, 이 페이지에 들어올 때마다 처음 상태로 다시 시작합니다.
// (여러 파일은 기존처럼 같은 범위를 쓰도록 실행 순서대로 이어 붙임)
// onReady: 기존 DOMContentLoaded / load 자리 — 원래처럼 나머지 코드가 다 실행된 뒤에 돔
// signal: 페이지를 떠날 때 abort 됨 — document/window 이벤트나 타이머 정리에 사용
import { getDigimonData } from './page.js';
import { t, tr, term, loadNames, applyStatic } from './i18n.js';
export function init(signal, onReady) {
// ===== 기존 app/detail.js =====
function getQueryParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}

onReady(async () => {
  applyStatic(document);
  await loadNames();
  const requestedName = decodeURIComponent(getQueryParam("name"));
  const characterName = requestedName === "포무몬" ? "폼몬" : requestedName;
  if (!characterName) {
    document.getElementById("character-name").textContent = t("캐릭터 정보를 찾을 수 없습니다.", "Digimon not found.");
    return;
  }

  // 툴팁 기능 추가
  function createTooltip(text) {
    const tooltip = document.createElement('div');
    tooltip.className = 'custom-tooltip';
    tooltip.textContent = text;
    tooltip.style.position = 'absolute';
    tooltip.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    tooltip.style.color = 'white';
    tooltip.style.padding = '4px 8px';
    tooltip.style.borderRadius = '4px';
    tooltip.style.fontSize = '12px';
    tooltip.style.zIndex = '9999';
    tooltip.style.pointerEvents = 'none';
    tooltip.style.display = 'none';
    document.body.appendChild(tooltip);
    return tooltip;
  }

  function showTooltip(element, text) {
    const tooltip = createTooltip(text);
    const rect = element.getBoundingClientRect();
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

    tooltip.style.left = (rect.left + scrollLeft + (rect.width / 2)) + 'px';
    tooltip.style.top = (rect.bottom + scrollTop + 5) + 'px';
    tooltip.style.transform = 'translateX(-50%)';
    tooltip.style.display = 'block';
    return tooltip;
  }

  function addTooltipToElement(element, text) {
    let tooltip = null;
    element.addEventListener('mouseenter', () => {
      tooltip = showTooltip(element, text);
    });
    element.addEventListener('mouseleave', () => {
      if (tooltip) {
        tooltip.remove();
        tooltip = null;
      }
    });
  }

  document.getElementById("character-name").textContent = tr(characterName);
  document.title = `${tr(characterName)} | DSRWIKI`;
  // 이름 변경 전 공유 링크와 CDN 이미지도 계속 사용할 수 있게 한다.
  const sanitizedCharacterName = (characterName === "폼몬" ? "포무몬" : characterName).replace(/:/g, "_");

  // 디지몬 데이터 가져오기
  getDigimonData()
    .then((data) => {
      const character = data[characterName];

      if (character) {
        const characterImgPath = `https://media.dsrwiki.com/dsrwiki/digimon/${sanitizedCharacterName}/${sanitizedCharacterName}.webp`;
        const evolutionStage = character.evolution_stage;
        const type = character.type;
        const fields = character.fields || [];

        // 필드 이미지 설정
        for (let i = 1; i <= 3; i++) {
          const fieldImgElement = document.getElementById(`field-img${i}`);
          if (fields[i - 1]) {
            fieldImgElement.src = `https://media.dsrwiki.com/dsrwiki/field/${fields[i - 1]}.webp`;
            fieldImgElement.alt = `${fields[i - 1]} 이미지`;
            addTooltipToElement(fieldImgElement, tr(fields[i - 1]));
            fieldImgElement.style.display = "inline";
          } else {
            fieldImgElement.style.display = "none";
          }
        }

        // 기본 정보 설정
        const characterImg = document.getElementById("character-img");
        characterImg.src = characterImgPath;
        addTooltipToElement(characterImg, tr(characterName));

        const evolutionImg = document.getElementById("evolution-img");
        evolutionImg.src = `https://media.dsrwiki.com/dsrwiki/${evolutionStage}.webp`;
        addTooltipToElement(evolutionImg, term(evolutionStage));

        const typeImg = document.getElementById("type-img");
        typeImg.src = `https://media.dsrwiki.com/dsrwiki/${type}.webp`;
        addTooltipToElement(typeImg, term(type));

        // 디지코어화 정보 가져오기
        fetch("https://media.dsrwiki.com/data/csv/digicore.json")
          .then(response => response.json())
          .then(digicoreData => {
            const digicoreContainer = document.getElementById("digicore-container");
            const characterDigicore = digicoreData.digicore[characterName];

            // 진화 단계에 따른 기본 디지코어 꾸러미 추가
            let defaultDigicore = null;

            switch (evolutionStage) {
              case "성장기":
                defaultDigicore = [
                  {
                    name: "성장기 디지코어 꾸러미",
                    probability: "100%",
                    tradeable: true,
                    count: 1
                  },
                  {
                    name: "유년기1 디지타마",
                    probability: "100%",
                    tradeable: true,
                    count: 1
                  },
                  {
                    name: "포텐셜 조각",
                    probability: "10%",
                    tradeable: true,
                    count: 1
                  }
                ];
                break;
              case "성숙기":
                defaultDigicore = [
                  {
                    name: "성숙기 디지코어 꾸러미",
                    probability: "100%",
                    tradeable: true,
                    count: 1
                  },
                  {
                    name: "포텐셜 조각",
                    probability: "10%",
                    tradeable: true,
                    count: 1
                  },
                  {
                    name: "돌연변이 치료제",
                    probability: "2.5%",
                    tradeable: true,
                    count: 1
                  }
                ];
                break;
              case "완전체":
                defaultDigicore = [
                  {
                    name: "완전체 디지코어 꾸러미",
                    probability: "100%",
                    tradeable: true,
                    count: 1
                  },
                  {
                    name: "포텐셜 조각",
                    probability: "10%",
                    tradeable: true,
                    count: 1
                  },
                  {
                    name: "돌연변이 치료제",
                    probability: "2.5%",
                    tradeable: true,
                    count: 1
                  }
                ];
                break;
              case "궁극체":
                const excludedUltimates = [
                  "갓드라몬", "그랜쿠가몬", "듀크몬", "로제몬", "마린엔젤몬",
                  "메탈가루몬", "밀레니엄몬", "바이킹몬", "발두르몬", "백호몬",
                  "세라피몬", "슬래쉬엔젤몬", "오메가몬", "오파니몬", "워그레이몬",
                  "주작몬", "청룡몬", "케루비몬(선)", "현무몬", "홀리드라몬"
                ];

                defaultDigicore = [
                  {
                    name: "궁극체 디지코어 꾸러미",
                    probability: "100%",
                    tradeable: true,
                    count: 1
                  },
                  {
                    name: "포텐셜 조각",
                    probability: "10%",
                    tradeable: true,
                    count: 1
                  }
                ];

                if (!excludedUltimates.includes(characterName)) {
                  defaultDigicore.push({
                    name: "돌연변이 치료제",
                    probability: "2.5%",
                    tradeable: true,
                    count: 1
                  });
                }
                break;
            }

            // 기본 디지코어 꾸러미와 특별 아이템 합치기
            const allItems = defaultDigicore ?
              (Array.isArray(defaultDigicore) ? [...defaultDigicore, ...(characterDigicore?.items || [])] : [defaultDigicore, ...(characterDigicore?.items || [])]) :
              (characterDigicore?.items || []);

            if (allItems.length > 0) {
              const itemsHTML = `
                <div class="digicore-items">
                  ${allItems.map(item => `
                    <div class="digicore-item">
                      <div class="digicore-item-main">
                        <div class="digicore-item-image">
                          <img loading="lazy" src="https://media.dsrwiki.com/dsrwiki/item/${item.name}.webp" alt="${item.name}" title="${item.name}">
                        </div>
                        <div class="digicore-item-info">
                          <div class="digicore-item-name">${tr(item.name)}${item.count ? ` <span class=\"item-count\">x${item.count}</span>` : ''}</div>
                          <div class="digicore-item-badges">
                            <div class="digicore-item-probability ${(item.probability === '확정' || item.probability === '100%') ? 'guaranteed' : 'probability'}">${tr(item.probability)}</div>
                            ${item.tradeable !== undefined ? `
                              <div class="digicore-item-tradeable ${item.tradeable ? 'tradeable' : 'untradeable'}">${item.tradeable ? t('거래가능', 'Tradable') : t('거래불가', 'Untradable')}</div>
                            ` : ''}
                            ${(item.mutant || item.isMutant) ? `
                              <div class="digicore-item-mutant">${t('돌연변이', 'Mutant')}</div>
                            ` : ''}
                          </div>
                        </div>
                      </div>
                      ${item.possible_items ? `
                        <div class="digicore-item-expanded">
                          <div class="digicore-item-description">${tr(item.description)}</div>
                          <div class="possible-items-title">${t('획득 가능한 아이템', 'Obtainable Items')}</div>
                          <div class="possible-items-list">
                            ${item.possible_items.map(possibleItem => `
                              <div class="possible-item">
                                <div class="possible-item-row">
                                  <div class="possible-item-image">
                                    <img loading="lazy" src="https://media.dsrwiki.com/dsrwiki/item/${possibleItem.name}.webp" alt="${possibleItem.name}" title="${tr(possibleItem.name)}">
                                  </div>
                                  <div class="possible-item-info">
                                    <div class="possible-item-name">${tr(possibleItem.name)}${possibleItem.count ? ` <span class=\"item-count\">x${possibleItem.count}</span>` : ''}</div>
                                    <div class="digicore-item-badges">
                                      <div class="possible-item-probability ${(possibleItem.probability === '확정' || possibleItem.probability === '100%') ? 'guaranteed' : 'probability'}">${tr(possibleItem.probability)}</div>
                                      ${possibleItem.tradeable !== undefined ? `
                                        <div class="digicore-item-tradeable ${possibleItem.tradeable ? 'tradeable' : 'untradeable'}">${possibleItem.tradeable ? t('거래가능', 'Tradable') : t('거래불가', 'Untradable')}</div>
                                      ` : ''}
                                      ${(possibleItem.mutant || possibleItem.isMutant) ? `
                                        <div class="digicore-item-mutant">${t('돌연변이', 'Mutant')}</div>
                                      ` : ''}
                                    </div>
                                  </div>
                                </div>
                                ${possibleItem.possible_items ? `
                                  <div class="digicore-item-expanded">
                                    <div class="digicore-item-description">${possibleItem.description}</div>
                                    <div class="possible-items-title">${t('획득 가능한 아이템', 'Obtainable Items')}</div>
                                    <div class="possible-items-list">
                                      ${possibleItem.possible_items.map(subItem => `
                                        <div class="possible-item">
                                          <div class="possible-item-row">
                                            <div class="possible-item-image">
                                              <img loading="lazy" src="https://media.dsrwiki.com/dsrwiki/item/${subItem.name}.webp" alt="${subItem.name}" title="${tr(subItem.name)}">
                                            </div>
                                            <div class="possible-item-info">
                                              <div class="possible-item-name">${tr(subItem.name)}${subItem.count ? ` <span class=\"item-count\">x${subItem.count}</span>` : ''}</div>
                                              <div class="digicore-item-badges">
                                                <div class="possible-item-probability ${(subItem.probability === '확정' || subItem.probability === '100%') ? 'guaranteed' : 'probability'}">${tr(subItem.probability)}</div>
                                                ${subItem.tradeable !== undefined ? `
                                                  <div class="digicore-item-tradeable ${subItem.tradeable ? 'tradeable' : 'untradeable'}">${subItem.tradeable ? t('거래가능', 'Tradable') : t('거래불가', 'Untradable')}</div>
                                                ` : ''}
                                                ${(subItem.mutant || subItem.isMutant) ? `
                                                  <div class="digicore-item-mutant">${t('돌연변이', 'Mutant')}</div>
                                                ` : ''}
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      `).join('')}
                                    </div>
                                  </div>
                                ` : ''}
                              </div>
                            `).join('')}
                          </div>
                        </div>
                      ` : ''}
                    </div>
                  `).join('')}
                </div>
              `;
              digicoreContainer.innerHTML = itemsHTML;
            } else {
              digicoreContainer.innerHTML = `<p class="no-digicore-message">${t('이 디지몬의 디지코어화 정보가 없습니다.', 'No Digicore info for this Digimon.')}</p>`;
            }
          })
          .catch(error => {
            console.error("디지코어화 데이터를 불러오는 중 오류가 발생했습니다:", error);
            document.getElementById("digicore-container").innerHTML =
              `<p class="error-message">${t('디지코어화 정보를 불러오는 중 오류가 발생했습니다.', 'Failed to load Digicore info.')}</p>`;
          });

        // 스탯 설정
        document.getElementById("stat-level").textContent = character.stats.level;
        document.getElementById("stat-hp").textContent = character.stats.hp;
        document.getElementById("stat-sp").textContent = character.stats.sp;
        document.getElementById("stat-STR").textContent = character.stats.STR;
        document.getElementById("stat-INT").textContent = character.stats.INT;
        document.getElementById("stat-DEF").textContent = character.stats.DEF;
        document.getElementById("stat-RES").textContent = character.stats.RES;
        document.getElementById("stat-SPD").textContent = character.stats.SPD;

        // 강점과 약점 정보
        const strengthAttr = character.strengths.attribute;
        const strengthEff = character.strengths.effect;
        const weaknessAttr = character.weaknesses.attribute;
        const weaknessEff = character.weaknesses.effect;

        // 강약점 테이블 생성
        const swTableBody = document.getElementById("sw").querySelector("tbody");
        swTableBody.innerHTML = ''; // Clear existing rows

        // 강점 행 생성
        if (strengthAttr) {
          let additionalText = "";
          if (strengthEff === "반사") {
            additionalText = t('해당 속성의 공격을 받으면 <span class="highlight">피해량의 25%</span>를 되돌려 줍니다.', 'Returns <span class="highlight">25% of the damage</span> when hit by this attribute.');
          } else if (strengthEff === "회피") {
            additionalText = t('해당 속성 공격에 대해 <span class="highlight">회피율이 2배</span>로 적용됩니다.', '<span class="highlight">Evasion rate is doubled</span> against this attribute.');
          } else if (strengthEff === "내성") {
            additionalText = t('해당 속성의 공격으로 받는 데미지는 <span class="highlight">25% 감소</span>합니다.', 'Damage taken from this attribute is <span class="highlight">reduced by 25%</span>.');
          } else if (strengthEff === "효과확률") {
            additionalText = t('해당 속성의 공격에 효과가 있을 경우, <span class="highlight">효과에 걸릴 확률</span>이 증가합니다.', 'If an attack of this attribute has an effect, <span class="highlight">the chance to be affected</span> increases.');
          }

          swTableBody.innerHTML += `
            <tr>
              <td class=\"sw-icon\">
                <div class=\"sw-icon-container\" style=\"background-image: url('https://media.dsrwiki.com/dsrwiki/strongbackground.webp');\">
                  <img loading="lazy" src=\"https://media.dsrwiki.com/dsrwiki/${strengthAttr}.webp\" alt=\"${strengthAttr} 이미지\" title=\"${term(strengthAttr)}\">
                </div>
              </td>
              <td class=\"sw-description\">${term(strengthEff)}</td>
              <td class=\"sw-description-detail\">${additionalText}</td>
            </tr>
          `;
        }

        // 약점 행 생성
        if (weaknessAttr) {
          let additionalText = "";
          if (weaknessEff === "약점") {
            additionalText = t('해당 속성의 공격으로 <span class="highlight">25% 증가된 데미지</span>를 입습니다.', 'Takes <span class="highlight">25% more damage</span> from this attribute.');
          } else if (weaknessEff === "회피불가") {
            additionalText = t('해당 속성의 공격은 <span class="highlight">회피가 불가</span>합니다.', 'Attacks of this attribute <span class="highlight">cannot be evaded</span>.');
          } else if (weaknessEff === "효과확률") {
            additionalText = t('해당 속성의 공격에 효과가 있을 경우, <span class="highlight">효과에 걸릴 확률</span>이 증가합니다.', 'If an attack of this attribute has an effect, <span class="highlight">the chance to be affected</span> increases.');
          }

          swTableBody.innerHTML += `
            <tr>
              <td class=\"sw-icon\">
                <div class=\"sw-icon-container\" style=\"background-image: url('https://media.dsrwiki.com/dsrwiki/weakbackground.webp');\">
                  <img loading="lazy" src=\"https://media.dsrwiki.com/dsrwiki/${weaknessAttr}.webp\" alt=\"${weaknessAttr} 이미지\" title=\"${term(weaknessAttr)}\">
                </div>
              </td>
              <td class=\"sw-description\">${term(weaknessEff)}</td>
              <td class=\"sw-description-detail\">${additionalText}</td>
            </tr>
          `;
        }

        // 스킬 정보 표시
        const skillDetailsTable = document.getElementById("skill-details");
        skillDetailsTable.innerHTML = "";

        character.skills.forEach((skillData, index) => {
          const skillImgPath = `https://media.dsrwiki.com/dsrwiki/digimon/${sanitizedCharacterName}/skill${index + 1}.webp`;
          const skill1ImgPath = `https://media.dsrwiki.com/dsrwiki/${skillData.attribute}.webp`;

          const levelData = skillData.multipliers.map(value => {
            let percentage = isNaN(parseFloat(value)) ? 0 : parseFloat(value) * 100;
            return `${parseFloat(percentage.toFixed(2))}%`;
          });

          // 각 스킬 행 생성
          const skillRow = document.createElement('tr');

          // 스킬 정보 셀 생성
          const skillCell = document.createElement('td');
          skillCell.innerHTML = `
            <div class="skill-row">
              <table class="skill-header-table">
                <tr>
                  <td rowspan="2" class="skill-icon-cell">
                    <img loading="lazy" src="${skillImgPath}" alt="스킬 아이콘" class="skill-icon">
                  </td>
                  <td class="skill-name-cell">
                    <div class="skill-name-container">
                      <span class="skill-name">${tr(skillData.name)}</span>
                      <img loading="lazy" src="${skill1ImgPath}" alt="속성" class="skill-attribute skill-main-attribute-img" data-tooltip="${skillData.attribute}">
                    </div>
                  </td>
                </tr>
                <tr>
                  <td class="skill-tags-cell">
                    <div class="skill-tags">
                      <span class="skill-tag tag-range ${skillData.range === '원거리' ? 'long-range' : ''}">${term(skillData.range)}</span>
                      <span class="skill-tag tag-target"> ${term(skillData.target_count)}</span>
                      <span class="skill-tag tag-hit">${isNaN(skillData.hits) ? term(skillData.hits) : t(`${skillData.hits}타`, `${skillData.hits} Hit${skillData.hits == 1 ? '' : 's'}`)}</span>
                      ${skillData.effect ? `<span class="skill-tag tag-effect">${tr(skillData.effect)}</span>` : ''}
                      ${skillData.additionalTurn ? `<span class="skill-tag tag-cast">${t(`추가 시전 턴 : ${skillData.additionalTurn}턴`, `Extra cast turns: ${skillData.additionalTurn}`)}</span>` : ''}
                      ${skillData.change && Array.isArray(skillData.change) && skillData.change.length > 0 ? `
                        <div class="skill-change-inline">
                          <span class="skill-change-inline-label">${t('변경 가능 속성 ', 'Convertible ')}</span>
                          ${skillData.change.map(attr => `
                            <img loading="lazy" src="https://media.dsrwiki.com/dsrwiki/${attr}.webp" alt="${attr}" class="skill-attribute skill-change-img" data-tooltip="${attr}">
                          `).join('')}
                        </div>
                      ` : ''}
                    </div>
                  </td>
                </tr>
              </table>
              
              <div class="level-table-container">
                <table class="level-table">
                  <tr>
                    <th>${t('1레벨', 'Lv1')}</th>
                    <th>${t('2레벨', 'Lv2')}</th>
                    <th>${t('3레벨', 'Lv3')}</th>
                    <th>${t('4레벨', 'Lv4')}</th>
                    <th>${t('5레벨', 'Lv5')}</th>
                    <th>${t('6레벨', 'Lv6')}</th>
                    <th>${t('7레벨', 'Lv7')}</th>
                    <th>${t('8레벨', 'Lv8')}</th>
                    <th>${t('9레벨', 'Lv9')}</th>
                    <th>${t('10레벨', 'Lv10')}</th>
                  </tr>
                  <tr>
                    ${levelData.map(level => `<td title="${level}">${level}</td>`).join('')}
                  </tr>
                </table>
              </div>
            </div>
          `;

          if (skillData.change && Array.isArray(skillData.change)) {
            skillCell.querySelectorAll('.skill-change-img').forEach(img => {
              const attrText = img.getAttribute('data-tooltip');
              addTooltipToElement(img, term(attrText));
            });
          }

          const mainAttrImg = skillCell.querySelector('.skill-main-attribute-img');
          if (mainAttrImg) {
            addTooltipToElement(mainAttrImg, term(skillData.attribute));
          }

          skillRow.appendChild(skillCell);
          skillDetailsTable.appendChild(skillRow);
        });
      } else {
        document.getElementById("character-name").textContent = t("캐릭터 정보를 찾을 수 없습니다.", "Digimon not found.");
      }
    })
    .catch(error => {
      console.error("데이터를 불러오는 중 오류가 발생했습니다:", error);
      document.getElementById("character-name").textContent = t("데이터를 불러오는 중 오류가 발생했습니다.", "Failed to load data.");
    });

  // 덱 정보 가져오기
  fetch("https://media.dsrwiki.com/data/csv/deck.json")
    .then(response => response.json())
    .then(deckData => {
      const deckContainer = document.getElementById("deck-container");
      deckContainer.innerHTML = "";

      // 해당 디지몬이 포함된 덱 찾기
      const matchingDecks = Object.entries(deckData).filter(([_, deck]) =>
        deck.digimon.some(d => d.name === characterName)
      );

      if (matchingDecks.length > 0) {
        matchingDecks.forEach(([deckName, deck]) => {
          const deckCard = document.createElement("div");
          deckCard.className = "deck-card";

          // 덱 카드 HTML 생성
          deckCard.innerHTML = `
            <div class="deck-header">
              <h3 class="deck-title">${tr(deckName)}</h3>
              <p class="deck-description">${tr(deck.description)}</p>
            </div>
            <div class="deck-content">
              <div class="digimon-container">
                ${deck.digimon.map(d => `
                  <div class="digimon-avatar ${d.name === characterName ? 'highlight' : ''}">
                    <img loading="lazy" src="https://media.dsrwiki.com/dsrwiki/digimon/${d.name.replace(/:/g, '_')}/${d.name.replace(/:/g, '_')}.webp" 
                         alt="${d.name}" 
                         onerror="this.src='https://media.dsrwiki.com/dsrwiki/digimon/default.webp'">
                    <div class="digimon-tooltip">Lv.${d.level} ${tr(d.name)}</div>
                  </div>
                `).join('')}
              </div>
              <div class="effects-container">
                ${deck.effects.map(effect => {
            // 숫자 강조
            const html = tr(effect).replace(/(\+\s*[\d\.]+%?)/g, '<span class=\"effect-value\">$1</span>');
            return html;
          }).join(' / ')}
              </div>
            </div>
          `;

          deckContainer.appendChild(deckCard);

          // 툴팁 기능 추가
          deckCard.querySelectorAll('.digimon-avatar').forEach(avatar => {
            const tooltip = avatar.querySelector('.digimon-tooltip');

            avatar.addEventListener('mouseover', () => {
              document.querySelectorAll('.digimon-tooltip').forEach(t => t.remove());
              const tt = document.createElement('div');
              tt.className = 'digimon-tooltip';
              tt.textContent = tooltip.textContent;
              tt.style.position = 'fixed';
              tt.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
              tt.style.color = 'white';
              tt.style.padding = '5px 10px';
              tt.style.borderRadius = '4px';
              tt.style.fontSize = '12px';
              tt.style.zIndex = '1000';
              tt.style.pointerEvents = 'none';
              tt.style.whiteSpace = 'nowrap';
              tt.style.boxShadow = '0 2px 5px rgba(0, 0, 0, 0.2)';
              document.body.appendChild(tt);
              const r = avatar.getBoundingClientRect();
              tt.style.left = r.left + r.width / 2 + 'px';
              tt.style.top = r.bottom + 10 + 'px';
              tt.style.transform = 'translateX(-50%)';
              tt.style.opacity = '1';
            });

            avatar.addEventListener('mouseout', () => {
              document.querySelectorAll('.digimon-tooltip').forEach(t => t.remove());
            });
          });
        });
      } else {
        deckContainer.innerHTML = `<p class="no-deck-message">${t('이 디지몬이 포함된 덱이 없습니다.', 'No decks include this Digimon.')}</p>`;
      }
    })
    .catch(error => {
      console.error("덱 데이터를 불러오는 중 오류가 발생했습니다:", error);
      document.getElementById("deck-container").innerHTML =
        `<p class="error-message">${t('덱 정보를 불러오는 중 오류가 발생했습니다.', 'Failed to load deck info.')}</p>`;
    });
});
}
