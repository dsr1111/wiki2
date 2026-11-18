// 기존 app/calculator-math.js, app/calculator.js 를 옮긴 것
// 파일 전체를 init() 안에 넣어, 이 페이지에 들어올 때마다 처음 상태로 다시 시작합니다.
// (여러 파일은 기존처럼 같은 범위를 쓰도록 실행 순서대로 이어 붙임)
// onReady: 기존 DOMContentLoaded / load 자리 — 원래처럼 나머지 코드가 다 실행된 뒤에 돔
// signal: 페이지를 떠날 때 abort 됨 — document/window 이벤트나 타이머 정리에 사용
import { getDigimonData } from './page.js';
export function init(signal, onReady) {
// ===== 기존 app/calculator-math.js =====
// Damage and probability calculation, preserving the existing wiki formula.
async function calculateStrengthResult(value) {
  const context = getCalculationContext(value);
  if (context.hasStrengthResult) return context.strengthResult;

  function getInputValue(id) {
    const value = document.getElementById(id).value;
    return value ? parseFloat(value) : 0;
  }

  const isManualMode = document.getElementById("manual-mode").checked;
  let basePower = 0;
  let myType = "";
  let myLevel = 1;

  if (isManualMode) {
    basePower = getInputValue("manual-power");
    myType = document.getElementById("manual-type").value;
    myLevel = getInputValue("manual-level");
  } else {
    const characterName = document.getElementById("character-select").value;
    const digimonData = await context.getDigimonData();
    const digimon = digimonData[characterName];

    if (digimon) {
      basePower = parseFloat(digimon.stats.STR) || 0;
      myType = digimon.type;
      myLevel = parseInt(digimon.stats.level, 10);
    }
  }

  const potential = getInputValue("potential") / 100;
  const correction = getInputValue("correction") / 100;
  const synergy = getInputValue("synergy");
  const buff = getInputValue("buff");
  const specialization = getInputValue("specialization");
  const equipment = getInputValue("equipment1");

  const totalStrength =
    basePower +
    Math.ceil(basePower * potential) +
    Math.ceil(basePower * correction) +
    synergy +
    buff +
    specialization +
    equipment;

  if (context.isCurrent()) {
    document.getElementById("str-result").textContent = totalStrength;
  }

  context.strengthResult = totalStrength;
  context.hasStrengthResult = true;

  return totalStrength;
}




// Helper functions for probability calculation
function factorial(n) {
  if (n === 0 || n === 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

function combinations(n, k) {
  if (k < 0 || k > n) return 0;
  return factorial(n) / (factorial(k) * factorial(n - k));
}

function irwinHallCDF(x, n) {
  if (n === 0) return 0;
  let sum = 0;
  for (let k = 0; k <= Math.floor(x); k++) {
    sum += Math.pow(-1, k) * combinations(n, k) * Math.pow(x - k, n);
  }
  return sum / factorial(n);
}

// CDF of Normal Distribution approximation
function normalCDF(x, mean, stdDev) {
  return 0.5 * (1 + erf((x - mean) / (stdDev * Math.sqrt(2))));
}

function erf(x) {
  // Save the sign of x
  var sign = (x >= 0) ? 1 : -1;
  x = Math.abs(x);

  // Constants
  var a1 = 0.254829592;
  var a2 = -0.284496736;
  var a3 = 1.421413741;
  var a4 = -1.453152027;
  var a5 = 1.061405429;
  var p = 0.3275911;

  // A&S formula 7.1.26
  var t = 1.0 / (1.0 + p * x);
  var y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return sign * y;
}

async function calculateProbability(value) {
  const context = getCalculationContext(value);
  if (!context.isCurrent()) return;
  try {
    const mobName = document.getElementById("mob-select").value;
    const selectedMap = document.getElementById("map2-select").value;

    if (!mobName || !selectedMap) {
      console.log("Missing mob name or selected map");
      document.getElementById("needstr").textContent = "계산 불가";
      return;
    }

    let mobHP = 0;
    let mobDef = 0;
    let mobType = "";
    let mobStrong = "";
    let mobWeak = "";

    const mobData = await context.getMobData();
    if (!context.isCurrent()) return;
    const mobRow = mobData.find(
      (row) => row[2] === mobName && row[1] === selectedMap
    );

    if (!mobRow) {
      document.getElementById("needstr").textContent = "계산 불가";
      return;
    }

    mobHP = parseFloat(mobRow[5]);
    mobDef = parseFloat(mobRow[6]);
    mobType = mobRow[4];
    mobStrong = mobRow[8];
    mobWeak = mobRow[7];

    const isManualMode = document.getElementById("manual-mode").checked;
    let myType = "";
    let myLevel = 1;
    let skillCoefficient = 0;
    let hitCount = 1;
    let mySkillElement = "";

    if (isManualMode) {
      myType = document.getElementById("manual-type").value;
      myLevel = parseFloat(document.getElementById("manual-level").value) || 1;
      skillCoefficient = (parseFloat(document.getElementById("manual-skill-coefficient").value) || 0) / 100;
      hitCount = parseFloat(document.getElementById("manual-hit-count").value) || 1;
      mySkillElement = document.getElementById("manual-skill-element").value;
      const manualTargetType = document.getElementById("manual-target-type").value;
      if (manualTargetType === "전체") {
        const mobCount = parseInt(document.getElementById("mob-count").value);
        if (mobCount > 0) {
          skillCoefficient = skillCoefficient / mobCount;
        }
      }
    } else {
      const characterName = document.getElementById("character-select").value;
      const digimonData = await context.getDigimonData();
      if (!context.isCurrent()) return;
      const digimon = digimonData[characterName];

      if (!digimon) {
        console.log("Digimon data not found:", characterName);
        document.getElementById("needstr").textContent = "계산 불가";
        return;
      }

      myType = digimon.type;
      myLevel = parseInt(digimon.stats.level, 10);

      const skillSelect = document.getElementById("skill-select").value;
      const skillLevel = document.getElementById("skilllevel-select").value;
      const skillIndex = parseInt(skillSelect.replace('skill', '')) - 1;

      if (digimon.skills && digimon.skills[skillIndex]) {
        const skillData = digimon.skills[skillIndex];
        const levelNumber = parseInt(skillLevel.replace('레벨', '')) - 1;
        skillCoefficient = parseFloat(skillData.multipliers[levelNumber]) || 0;
        hitCount = parseFloat(skillData.hits);
        mySkillElement = document.getElementById("skill-element").value || skillData.attribute || "";

        if (skillData.target_count === "전체") {
          const mobCount = parseInt(document.getElementById("mob-count").value);
          skillCoefficient = skillCoefficient / mobCount;
        }
      }
    }

    if (!skillCoefficient) {
      skillCoefficient = 1;
    }

    // Ensure hitCount is at least 1 and integer for probability calculation logic
    // Using Round since usually hit counts are integers.
    const effectiveHits = Math.max(1, Math.round(hitCount));

    const skillCount = document.getElementById("skillcount").value;
    let targetHP = mobHP;

    if (skillCount === "2킬") {
      targetHP = mobHP / 2;
    } else if (skillCount === "3킬") {
      targetHP = mobHP / 3;
    } else if (skillCount === "4킬") {
      targetHP = mobHP / 4;
    } else if (skillCount === "5킬") {
      targetHP = mobHP / 5;
    }

    let compatibility = 1.0;

    if (myType === "백신" && mobType === "바이러스") compatibility = 1.25;
    else if (myType === "바이러스" && mobType === "데이터") compatibility = 1.25;
    else if (myType === "데이터" && mobType === "백신") compatibility = 1.25;

    else if (myType === "바이러스" && mobType === "백신") compatibility = 0.75;
    else if (myType === "데이터" && mobType === "바이러스") compatibility = 0.75;
    else if (myType === "백신" && mobType === "데이터") compatibility = 0.75;

    else if (
      myType === "프리" &&
      ["백신", "데이터", "바이러스"].includes(mobType)
    )
      compatibility = 1.0;
    else if (myType === "프리" && mobType === "언노운") compatibility = 1.25;

    else if (
      myType === "언노운" &&
      ["백신", "데이터", "바이러스"].includes(mobType)
    )
      compatibility = 1.125;
    else if (myType === "언노운" && mobType === "프리") compatibility = 0.75;

    else if (myType === mobType) compatibility = 1.0;

    let elementalFactor = 1.0;

    if (mySkillElement === mobStrong) elementalFactor = 0.75;
    else if (mySkillElement === mobWeak) elementalFactor = 1.25;

    const levelConstant = myLevel * 12 + 24;

    let equipment2Value = (parseFloat(document.getElementById("equipment2").value) || 0) + (parseFloat(document.getElementById("engraving").value) || 0);
    if (!isNaN(equipment2Value)) {
      let adjustedEquipment2Value = Math.ceil((equipment2Value / 100) * 10000) / 10000;
      let increaseValue = skillCoefficient * adjustedEquipment2Value;
      increaseValue = Math.ceil(increaseValue * 10000) / 10000;
      skillCoefficient += increaseValue;
    }



    const totalStrength = await calculateStrengthResult(context);
    if (!context.isCurrent()) return;

    // Critical Damage Parameters
    let critDmgInput = document.getElementById("crit-dmg").value.replace(/%/g, '');
    let critMultiplier = (critDmgInput === "" ? 150 : parseFloat(critDmgInput)) || 150;
    critMultiplier = critMultiplier / 100;

    // Critical Rate Parameters
    let critRateInput = document.getElementById("crit-rate").value.replace(/%/g, '');
    let critRatePercent = (critRateInput === "" ? 0 : parseFloat(critRateInput)) || 0;
    let critProbability = Math.max(0, Math.min(100, critRatePercent)) / 100;

    // Elemental Factor for Crits (remove 1.25x weakness bonus)
    let appliedElementalFactor = elementalFactor;
    if (mySkillElement === mobWeak) {
      appliedElementalFactor = 1.0;
    }

    // Damage Range Percentages
    const minRangeInput = document.getElementById("dmg-min").value;
    const maxRangeInput = document.getElementById("dmg-max").value;
    const minRangePercent = (minRangeInput === "" ? 95 : parseFloat(minRangeInput)) || 95;
    const maxRangePercent = (maxRangeInput === "" ? 105 : parseFloat(maxRangeInput)) || 105;

    // --- 1. Normal Hit Parameters ---
    const normalDamageFactor = (skillCoefficient * compatibility * elementalFactor * levelConstant) / (mobDef || 1);
    const normalBaseDmg = totalStrength * normalDamageFactor;
    const normalMinDmg = normalBaseDmg * (minRangePercent / 100);
    const normalMaxDmg = normalBaseDmg * (maxRangePercent / 100);

    // Normal Approximation stats for single normal hit
    const normalMean = (normalMinDmg + normalMaxDmg) / 2;
    const normalRange = normalMaxDmg - normalMinDmg;
    const normalVar = (normalRange * normalRange) / 12;

    // --- 2. Critical Hit Parameters ---
    const critDamageFactor = (skillCoefficient * compatibility * appliedElementalFactor * levelConstant) / (mobDef || 1);
    const critBaseDmg = totalStrength * critDamageFactor * critMultiplier;
    const critMinDmg = critBaseDmg * (minRangePercent / 100);
    const critMaxDmg = critBaseDmg * (maxRangePercent / 100);

    // Normal Approximation stats for single crit hit
    const critMean = (critMinDmg + critMaxDmg) / 2;
    const critRange = critMaxDmg - critMinDmg;
    const critVar = (critRange * critRange) / 12; // Variance of Uniform distribution

    document.dispatchEvent(new CustomEvent('calculation-detail', {detail: {skillCoefficient, compatibility, elementalFactor, appliedElementalFactor, normalMinDmg, normalMaxDmg, critMinDmg, critMaxDmg, effectiveHits, totalStrength}}));
    let totalKillProbability = 0;

    // Iterate through all possible numbers of critical hits (k from 0 to effectiveHits)
    for (let k = 0; k <= effectiveHits; k++) {
      let normalHits = effectiveHits - k;

      // Probability of getting exactly k crits (Binomial Distribution)
      let binomialProb = combinations(effectiveHits, k) * Math.pow(critProbability, k) * Math.pow(1 - critProbability, normalHits);

      if (binomialProb < 1e-9) continue; // Optimization: skip negligible probabilities

      let conditionalKillProb = 0;

      // Distribution of Total Damage for this specific combination of k crits + (N-k) normals
      if (k === 0) {
        // Case: All Normal Hits (Sum of N uniform variables)
        // Use Irwin-Hall logic (reuse existing logic but adapted)
        const totalMin = normalMinDmg * effectiveHits;
        const totalMax = normalMaxDmg * effectiveHits;

        if (totalMin >= targetHP) {
          conditionalKillProb = 1;
        } else if (totalMax < targetHP) {
          conditionalKillProb = 0;
        } else {
          if (effectiveHits > 15) {
            const totalMean = normalMean * effectiveHits;
            const totalVar = normalVar * effectiveHits;
            conditionalKillProb = 1 - normalCDF(targetHP, totalMean, Math.sqrt(totalVar));
          } else {
            const rangePerHit = normalRange;
            if (rangePerHit <= 0.0001) {
              conditionalKillProb = (normalMean * effectiveHits >= targetHP) ? 1 : 0;
            } else {
              const z_target = (targetHP - effectiveHits * normalMinDmg) / rangePerHit;
              conditionalKillProb = 1 - irwinHallCDF(z_target, effectiveHits);
            }
          }
        }

      } else if (k === effectiveHits) {
        // Case: All Critical Hits (Sum of N uniform variables)
        const totalMin = critMinDmg * effectiveHits;
        const totalMax = critMaxDmg * effectiveHits;

        if (totalMin >= targetHP) {
          conditionalKillProb = 1;
        } else if (totalMax < targetHP) {
          conditionalKillProb = 0;
        } else {
          if (effectiveHits > 15) {
            const totalMean = critMean * effectiveHits;
            const totalVar = critVar * effectiveHits;
            conditionalKillProb = 1 - normalCDF(targetHP, totalMean, Math.sqrt(totalVar));
          } else {
            const rangePerHit = critRange;
            if (rangePerHit <= 0.0001) {
              conditionalKillProb = (critMean * effectiveHits >= targetHP) ? 1 : 0;
            } else {
              const z_target = (targetHP - effectiveHits * critMinDmg) / rangePerHit;
              conditionalKillProb = 1 - irwinHallCDF(z_target, effectiveHits);
            }
          }
        }
      } else {
        // Case: Mixed Hits (Sum of k Uniform(Crit) + (N-k) Uniform(Normal))
        // Use Normal Approximation for the sum
        const totalMean = k * critMean + normalHits * normalMean;
        const totalVar = k * critVar + normalHits * normalVar;
        const totalStdDev = Math.sqrt(totalVar);

        // Approximate absolute min/max for bounds check (optional but safe)
        const absMin = k * critMinDmg + normalHits * normalMinDmg;
        const absMax = k * critMaxDmg + normalHits * normalMaxDmg;

        if (absMin >= targetHP) {
          conditionalKillProb = 1;
        } else if (absMax < targetHP) {
          conditionalKillProb = 0;
        } else {
          conditionalKillProb = 1 - normalCDF(targetHP, totalMean, totalStdDev);
        }
      }

      totalKillProbability += binomialProb * conditionalKillProb;
    }

    // Clamp and format
    let finalProbability = Math.max(0, Math.min(100, totalKillProbability * 100)); // Convert to percent
    document.getElementById("needstr").textContent = finalProbability.toFixed(2) + "%";

  } catch (error) {
    if (!context.isCurrent()) return;
    console.error("Error in calculateProbability:", error);
    document.getElementById("needstr").textContent = "계산 불가";
  }
}

// ===== 기존 app/calculator.js =====
'use strict';
const $ = id => document.getElementById(id);
const number = (id, fallback = 0) => $(id).value === '' ? fallback : Number($(id).value);
const format = value => Number(value).toLocaleString('ko-KR', {maximumFractionDigits:2});
const elements = ['강철','나무','흙','물','물리','바람','불','빛','어둠','얼음','천둥'];
const imageBase = 'https://media.dsrwiki.com/dsrwiki/';
let digimonData, mobData, calculationVersion = 0;

function options(id, values, selected) {
  const nodes = values.map(entry => {const [value, label] = Array.isArray(entry) ? entry : [entry,entry]; return new Option(label, value);});
  $(id).replaceChildren(...nodes);
  if (selected !== undefined && nodes.some(node => node.value === String(selected))) $(id).value = selected;
}
function icon(name, accessibleName = '') {
  const img = document.createElement('img'); img.src = imageBase + encodeURIComponent(name) + '.webp'; img.alt = accessibleName; img.addEventListener('error', () => img.hidden = true, {once:true}); return img;
}
function portrait(id, name) {
  const safeName = name.replace(/:/g,'_'); const img = document.createElement('img');
  img.src = `${imageBase}digimon/${encodeURIComponent(safeName)}/${encodeURIComponent(safeName)}.webp`; img.alt = name;
  img.addEventListener('error', () => { const fallback = document.createElement('span'); fallback.textContent = '이미지 없음'; $(id).replaceChildren(fallback); }, {once:true});
  $(id).replaceChildren(img);
}
function attribute(id, name) { $(id).replaceChildren(...(name ? [icon(name), document.createTextNode(name)] : [document.createTextNode('없음')])); }
function currentDigimon() { return digimonData[$('character-select').value]; }
function currentSkill() { return currentDigimon()?.skills?.[Number($('skill-select').value.replace('skill',''))-1]; }
function currentMob() {return mobData.find(row => row[0] === $('map1-select').value && row[1] === $('map2-select').value && row[2] === $('mob-select').value);}
function populateCharacters(preferred) {
  options('character-select', Object.keys(digimonData).filter(name => digimonData[name].evolution_stage === $('stage-select').value), preferred);
  populateSkills();
}
function populateSkills() {
  const d = currentDigimon();
  $('character-name').textContent = $('character-select').value;
  $('character-meta').replaceChildren(icon(d.type, d.type), document.createTextNode(`Lv.${d.stats.level}`));
  $('힘-cell').textContent = format(d.stats.STR);
  portrait('character-image-cell', $('character-select').value);
  options('skill-select', (d.skills || []).map((skill, i) => [`skill${i+1}`, `${i+1}. ${skill.name}`]));
  $('skilllevel-select').value = '1레벨'; populateElements();
}
function populateElements() {
  const skill = currentSkill();
  const convertible = [...new Set([skill?.attribute, ...(Array.isArray(skill?.change) ? skill.change : [])].filter(Boolean))];
  options('skill-element', convertible, skill?.attribute);
  $('element-options').replaceChildren(...convertible.map(element => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'element-button';
    button.dataset.element = element; button.setAttribute('aria-pressed', String(element === skill.attribute));
    button.append(icon(element), document.createTextNode(element));
    button.addEventListener('click', () => {$('skill-element').value = element; refresh();});
    return button;
  }));
}
function populateMaps() {
  options('map2-select', [...new Set(mobData.filter(row => row[0] === $('map1-select').value).map(row => row[1]))]); populateMobs();
}
function populateMobs() {
  options('mob-select', [...new Set(mobData.filter(row => row[0] === $('map1-select').value && row[1] === $('map2-select').value).map(row => row[2]))]); showMob();
}
function showMob() {
  const mob = currentMob(); if (!mob) return;
  $('mob-name').textContent = mob[2]; $('mob-meta').replaceChildren(icon(mob[4], mob[4]), document.createTextNode(`Lv.${mob[3]}`));
  portrait('mob-image-cell', mob[2]); $('mob-hp').textContent = format(mob[5]); $('mob-def').textContent = format(mob[6]); attribute('mob-weak',mob[7]); attribute('mob-strong',mob[8]);
}
function getCalculationContext(context) { return context; }
function contextFor(version) { return {hasStrengthResult:false,isCurrent:()=>version === calculationVersion,getDigimonData:async()=>digimonData,getMobData:async()=>mobData}; }
function clearResults(message) {
  $('needstr').textContent = '—'; $('result-caption').textContent = message; $('result-caption').hidden = false; $('probability-bar').style.width = '0%';
  for (const id of ['str-result','result-coefficient','normal-damage','critical-damage']) $(id).textContent = '—';
}
async function refresh() {
  const version = ++calculationVersion;
  const manual = $('manual-mode').checked;
  $('normal-inputs').hidden = manual; $('manual-inputs').hidden = !manual;
  $('manual-inputs').querySelectorAll('input,select').forEach(input => input.disabled = !manual);
  const skill = currentSkill(), mob = currentMob();
  const selectedElement = manual ? $('manual-skill-element').value : $('skill-element').value;
  document.querySelectorAll('.element-button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.element === selectedElement)));
  $('result-element').textContent = selectedElement || '없음';
  $('result-caption').textContent = '';
  $('result-caption').hidden = true;
  const targetType = manual ? $('manual-target-type').value : skill?.target_count;
  $('mob-count').disabled = targetType !== '전체';
  $('dmg-max').setCustomValidity(number('dmg-min',95) > number('dmg-max',105) ? '최대값은 최소값 이상이어야 합니다.' : '');
  const invalid = [...$('calculator-form').querySelectorAll('input,select')].find(input => !input.disabled && !input.validity.valid);
  if (invalid) {clearResults('입력 범위를 확인해 주세요. 최소 데미지는 최대값 이하이어야 합니다.'); return;}
  if (!mob || (!manual && (!skill || !(Number(currentDigimon().stats.level)>0) || !(Number(currentDigimon().stats.STR)>0)))) {
    clearResults('선택한 디지몬의 계산용 스탯 또는 스킬 데이터가 없습니다. 수동 입력을 이용해 주세요.'); return;
  }
  await calculateProbability(contextFor(version));
  if (version !== calculationVersion) return;
  $('str-result').textContent = format($('str-result').textContent);
  $('probability-bar').style.width = `${parseFloat($('needstr').textContent) || 0}%`;
}
document.addEventListener('calculation-detail', event => {  // (Astro) signal: 페이지를 떠나면 해제
  const d = event.detail;
  $('result-coefficient').textContent = d.skillCoefficient.toFixed(4);
  $('normal-damage').textContent = `${format(d.normalMinDmg*d.effectiveHits)} ~ ${format(d.normalMaxDmg*d.effectiveHits)}`;
  $('critical-damage').textContent = `${format(d.critMinDmg*d.effectiveHits)} ~ ${format(d.critMaxDmg*d.effectiveHits)}`;
}, { signal });
$('calculator-form').addEventListener('submit', event => event.preventDefault());
$('calculator-form').addEventListener('change', event => {
  const id = event.target.id;
  if (id === 'stage-select') populateCharacters();
  if (id === 'character-select') populateSkills();
  if (id === 'skill-select') populateElements();
  if (id === 'map1-select') populateMaps();
  if (id === 'map2-select') populateMobs();
  if (id === 'mob-select') showMob();
  refresh();
});
$('calculator-form').addEventListener('input', event => {if (event.target.tagName === 'INPUT' && event.target.type !== 'checkbox') refresh();});
$('reset').addEventListener('click', () => { if (!digimonData) return; HTMLFormElement.prototype.reset.call($('calculator-form')); setDefaults(); refresh(); });
function setDefaults() {
  $('stage-select').value = '성장기'; populateCharacters(digimonData['아구몬'] ? '아구몬' : undefined);
  $('map1-select').value = [...$('map1-select').options].some(option=>option.value==='현실 세계') ? '현실 세계' : $('map1-select').options[0].value; populateMaps();
}
async function load() {
  try {
    const [json,csv] = await Promise.all([getDigimonData(),fetch('https://media.dsrwiki.com/data/csv/mob.csv')]);
    if (!csv.ok) throw new Error('데이터 파일을 찾을 수 없습니다.');
    digimonData = json;
    mobData = (await csv.text()).trim().split(/\r?\n/).slice(1).map(row=>row.split(',').map(cell=>cell.trim())).filter(row=>row.length>=9 && row[2]);
    if (!Object.keys(digimonData).length || !mobData.length) throw new Error('계산 데이터가 비어 있습니다.');
    options('skilllevel-select', Array.from({length:10},(_,i)=>`${i+1}레벨`));
    options('manual-skill-element', elements, '물리');
    options('map1-select', [...new Set(mobData.map(row=>row[0]))]);
    setDefaults(); $('status').hidden=true; $('calculator-form').hidden=false; await refresh();
  } catch(error) {
    console.error(error); $('status').replaceChildren(document.createTextNode('데이터를 불러오지 못했습니다. '));
    const retry = document.createElement('button'); retry.type='button';retry.className='quiet-button';retry.textContent='다시 시도';retry.addEventListener('click',load);$('status').append(retry);
  }
}
// Suppress incidental viewport overflow only while the complete card group is
// visible. Re-enable scrolling as soon as a smaller window or longer content
// needs it; do not permanently lock the page on mobile or browser zoom.
let viewportCheckFrame = 0;
function updateViewportScrolling() {
  cancelAnimationFrame(viewportCheckFrame);
  viewportCheckFrame = requestAnimationFrame(() => {
    const workspace = document.querySelector('.workspace');
    if (!workspace) return; // (Astro) 페이지를 떠난 뒤
    const rect = workspace.getBoundingClientRect();
    const navigation = document.querySelector('custom-nav')?.shadowRoot?.querySelector('.bar');
    const navBottom = navigation?.getBoundingClientRect().bottom || 0;
    const fits = matchMedia('(min-width: 941px)').matches && rect.height > 0 &&
      rect.top + window.scrollY >= navBottom &&
      rect.bottom + window.scrollY <= window.innerHeight + 0.5;
    document.documentElement.classList.toggle('calculator-fits-viewport', fits);
  });
}
const viewportObserver = new ResizeObserver(updateViewportScrolling);
viewportObserver.observe(document.querySelector('.workspace'));
// (Astro) 페이지를 떠나면 감시를 멈추고 <html> 에 붙인 클래스도 뺌 (<html> 은 페이지를 옮겨도 그대로라서)
signal.addEventListener('abort', () => {
  viewportObserver.disconnect();
  cancelAnimationFrame(viewportCheckFrame);
  document.documentElement.classList.remove('calculator-fits-viewport');
});
window.addEventListener('resize', updateViewportScrolling, { signal });
onReady(updateViewportScrolling);
load();
}
