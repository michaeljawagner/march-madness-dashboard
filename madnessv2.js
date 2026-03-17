window.addEventListener("load", function () {
  const workerBase = "https://testing01.michaeljawagner.workers.dev/?url=";
  const boardTitleEl = document.getElementById("pm-board-title");
  const boardMetaEl = document.getElementById("pm-board-meta");
  const roundTabsEl = document.getElementById("pm-round-tabs");
  const sectionsEl = document.getElementById("pm-board-sections");

  const ROUND_ORDER = "First Four|Round of 64|Round of 32|Sweet Sixteen|Elite Eight|Final Four|National Championship".split("|");

  const ROUND_BY_DATE = {
    "20260317":"First Four",
    "20260318":"First Four",
    "20260319":"Round of 64",
    "20260320":"Round of 64",
    "20260321":"Round of 32",
    "20260322":"Round of 32",
    "20260326":"Sweet Sixteen",
    "20260327":"Sweet Sixteen",
    "20260328":"Elite Eight",
    "20260329":"Elite Eight",
    "20260404":"Final Four",
    "20260406":"National Championship"
  };

  let ESPN_BRACKET_SEEDS = {};
  const scoreboardCache = {};
  const allCardStates = [];

  const TEAM_ROWS = `
howrd|Howard Bison|Howard
umbc|UMBC Retrievers|UMBC
ncst|NC State Wolfpack|NC State|NC St|NCSU|North Carolina State|North Carolina State Wolfpack
tx|Texas Longhorns|Texas|UT
lehi|Lehigh Mountain Hawks|Lehigh
pvam|Prairie View A&M Panthers|Prairie View A&M
smu|SMU Mustangs|SMU
miaoh|Miami (OH) RedHawks|Miami (OH)|Miami OH
tcu|TCU Horned Frogs|TCU
ohiost|Ohio State Buckeyes|Ohio State
troy|Troy Trojans|Troy
nebr|Nebraska Cornhuskers|Nebraska
sfl|South Florida Bulls|South Florida|USF
lou|Louisville Cardinals|Louisville
hpnt|High Point Panthers|High Point
wisc|Wisconsin Badgers|Wisconsin
siena|Siena Saints|Siena
duke|Duke Blue Devils|Duke
mcnst|McNeese Cowboys|McNeese|McNeese State|McNeese State Cowboys
vand|Vanderbilt Commodores|Vanderbilt
ndkst|North Dakota State Bison|North Dakota State|N Dakota State
mst|Michigan State Spartans|Michigan State|Michigan St
hawaii|Hawaii Rainbow Warriors|Hawaii
ark|Arkansas Razorbacks|Arkansas
vcu|VCU Rams|VCU
ncar|North Carolina Tar Heels|North Carolina
txam|Texas A&M Aggies|Texas A&M|Texas AM
stmry|Saint Mary's Gaels|Saint Mary's|St. Mary's|St Mary's
penn|Penn Quakers|Penn|Pennsylvania|Pennsylvania Quakers
ill|Illinois Fighting Illini|Illinois
stlou|Saint Louis Billikens|Saint Louis|St. Louis|St Louis
ga|Georgia Bulldogs|Georgia
kenest|Kennesaw State Owls|Kennesaw State
gnzg|Gonzaga Bulldogs|Gonzaga
idaho|Idaho Vandals|Idaho
hou|Houston Cougars|Houston
sanclr|Santa Clara Broncos|Santa Clara
uk|Kentucky Wildcats|Kentucky
akron|Akron Zips|Akron
txtech|Texas Tech Red Raiders|Texas Tech
liub|LIU Brooklyn Sharks|LIU|LIU Brooklyn|Long Island University|Long Island University Sharks
arz|Arizona Wildcats|Arizona
vir|Virginia Cavaliers|Virginia
wrght|Wright State Raiders|Wright State
tenst|Tennessee State Tigers|Tennessee State
iowast|Iowa State Cyclones|Iowa State
ala|Alabama Crimson Tide|Alabama
hofst|Hofstra Pride|Hofstra
vill|Villanova Wildcats|Villanova
utahst|Utah State Aggies|Utah State
iowa|Iowa Hawkeyes|Iowa
clmsn|Clemson Tigers|Clemson
niowa|Northern Iowa Panthers|Northern Iowa
stjohn|St. John's Red Storm|St. John's|St Johns|Saint John's
ucf|UCF Knights|UCF
ucla|UCLA Bruins|UCLA
pur|Purdue Boilermakers|Purdue
queen|Queens Royals|Queens|Queens University|Queens University Royals
cabap|California Baptist Lancers|California Baptist|Cal Baptist
kan|Kansas Jayhawks|Kansas
furman|Furman Paladins|Furman
uconn|UConn Huskies|UConn|Connecticut|Connecticut Huskies
mia|Miami Hurricanes|Miami
missr|Missouri Tigers|Missouri
  `.trim();

  const POLY_TEAM_LOOKUP = {};

  function normalizeTeamLookup(str) {
    return String(str || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[’']/g, "")
      .replace(/&/g, "and")
      .replace(/\./g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  TEAM_ROWS.split("\n").forEach(function (row) {
    const parts = row.split("|");
    const slug = parts[0];
    const canonical = parts[1];
    const aliases = parts.slice(2);
    [canonical].concat(aliases).forEach(function (name) {
      POLY_TEAM_LOOKUP[normalizeTeamLookup(name)] = slug;
    });
  });

  if (!window.Chart || !sectionsEl || !roundTabsEl) {
    if (boardMetaEl) boardMetaEl.textContent = "Board failed to load.";
    return;
  }

  function proxied(url) {
    return workerBase + encodeURIComponent(url);
  }

  function parseMaybeJson(value) {
    if (Array.isArray(value)) return value;
    if (typeof value !== "string") return null;
    try { return JSON.parse(value); } catch (e) { return null; }
  }

  function normalize(str) {
    return String(str || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/'/g, "")
      .replace(/\bsaint\b/g, "st")
      .replace(/\bpennsylvania\b/g, "penn")
      .replace(/\b(university|college|state|st\.|rainbow warriors|anteaters|wildcats|tigers|bulldogs|warriors|cougars|bears|hawks|eagles|knights|panthers|bruins|trojans|huskies|gaels|boilermakers|tar heels|blue devils|cavaliers|volunteers|aggies|mustangs|owls|cardinals|badgers|cyclones|seminoles|gators|rebels|raiders|spartans|wolfpack|mountaineers|lobos|illini|hoosiers|hurricanes|crimson tide|longhorns|bearcats|terrapins|horned frogs|zags|pirates|beavers|lancers|wolverines|quakers|flyers|rams|commodores|razorbacks)\b/g, "")
      .replace(/[^a-z0-9]/g, "")
      .trim();
  }

  function normalizeSeedName(str) {
    return String(str || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/&amp;/g, "and")
      .replace(/[’']/g, "")
      .replace(/\bsaint\b/g, "st")
      .replace(/\bst\.\b/g, "st")
      .replace(/\bstate\b/g, "st")
      .replace(/[^a-z0-9]/g, "")
      .trim();
  }

  function buildSeedNameCandidates(teamObj) {
    const raw = [
      teamObj?.shortDisplayName || "",
      teamObj?.displayName || "",
      teamObj?.name || "",
      teamObj?.location || "",
      teamObj?.abbreviation || ""
    ].filter(Boolean);

    const out = new Set();

    function add(value) {
      if (!value) return;
      const v = String(value).trim();
      if (!v) return;

      out.add(v);
      out.add(v.replace(/\bState\b/g, "St"));
      out.add(v.replace(/\bSt\b/g, "State"));
      out.add(v.replace(/\bSt\.\b/g, "State"));
      out.add(v.replace(/\bSaint\b/g, "St"));
      out.add(v.replace(/\bSt\b/g, "Saint"));
      out.add(v.replace(/\bSt\.\b/g, "Saint"));
      out.add(v.replace(/\bNorth Dakota\b/g, "N Dakota"));
      out.add(v.replace(/\bN Dakota\b/g, "North Dakota"));
      out.add(v.replace(/\bSouth Dakota\b/g, "S Dakota"));
      out.add(v.replace(/\bS Dakota\b/g, "South Dakota"));
      out.add(v.replace(/\bConnecticut\b/g, "UConn"));
      out.add(v.replace(/\bUConn\b/g, "Connecticut"));
      out.add(v.replace(/\bNC State\b/g, "NC St"));
      out.add(v.replace(/\bNC St\b/g, "NC State"));
      out.add(v.replace(/\bNC St\.\b/g, "NC State"));
      out.add(v.replace(/\s+(Blue Devils|Saints|Wolfpack|Longhorns|Trojans|Cornhuskers)$/i, ""));

      if (/^duke$/i.test(v) || /^duke blue devils$/i.test(v)) {
        out.add("Duke");
        out.add("Duke Blue Devils");
      }
      if (/^siena$/i.test(v) || /^siena saints$/i.test(v)) {
        out.add("Siena");
        out.add("Siena Saints");
      }
      if (/^nc state$/i.test(v) || /^nc st\.?$/i.test(v) || /^ncsu$/i.test(v) || /^nc state wolfpack$/i.test(v)) {
        out.add("NC State");
        out.add("NC St");
        out.add("NCSU");
        out.add("NC State Wolfpack");
      }
      if (/^texas$/i.test(v) || /^texas longhorns$/i.test(v) || /^ut$/i.test(v)) {
        out.add("Texas");
        out.add("Texas Longhorns");
        out.add("UT");
      }
    }

    raw.forEach(add);
    return Array.from(out);
  }

  function getEspnBracketSeed(teamObjOrName) {
    const candidates = typeof teamObjOrName === "string"
      ? [teamObjOrName]
      : buildSeedNameCandidates(teamObjOrName);

    for (const candidate of candidates) {
      const key = normalizeSeedName(candidate);
      if (ESPN_BRACKET_SEEDS[key]) return ESPN_BRACKET_SEEDS[key];
    }

    for (const candidate of candidates) {
      const stripped = String(candidate)
        .replace(/\s+(Blue Devils|Saints|Wolfpack|Longhorns|Trojans|Cornhuskers)$/i, "")
        .trim();
      const key = normalizeSeedName(stripped);
      if (ESPN_BRACKET_SEEDS[key]) return ESPN_BRACKET_SEEDS[key];
    }

    return "";
  }

  function teamMatchesDisplayName(teamName, rawName) {
    const a = normalize(teamName);
    const b = normalize(rawName);
    if (!a || !b) return false;
    return a === b || a.includes(b) || b.includes(a);
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function formatDateKey(d) {
    return d.getFullYear().toString() + pad2(d.getMonth() + 1) + pad2(d.getDate());
  }

  function formatGameDateShort(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return (d.getMonth() + 1) + "/" + d.getDate();
  }

  function formatTip(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit"
    });
  }

  function getGamePhase(game) {
    const state = game?.status?.type?.state;
    if (state === "post") return "final";
    if (state === "in") return "live";
    return "upcoming";
  }

  function getGameBadge(game) {
    const phase = getGamePhase(game);
    if (phase === "live") return "LIVE";
    if (phase === "final") return "FINAL";
    return formatGameDateShort(game?.date);
  }

  function getTeamName(team) {
    return team?.displayName || team?.shortDisplayName || team?.name || "";
  }

  function getTeamLogo(team) {
    return team?.logo || team?.logos?.[0]?.href || "";
  }

  function setSeedText(el, seed) {
    if (!el) return;
    el.textContent = seed || "";
    el.style.display = seed ? "inline" : "none";
  }

  function setChartVisible(state, visible) {
    state.dom.chartWrapEl.classList.toggle("is-hidden", !visible);
    state.dom.chartLegendEl.classList.toggle("is-hidden", !visible);
  }

  function setStatusLine(state, leftText, rightText) {
    state.dom.statusLeftEl.textContent = leftText || "";
    state.dom.statusRightEl.textContent = rightText || "";
  }

  function renderFallbackStatus(state, game) {
    const badge = getGameBadge(game);
    const tip = formatTip(game?.date);
    const phase = getGamePhase(game);
    const exc = "EXC " + ((state.excitement != null ? state.excitement : 2.5).toFixed(1));

    if (phase === "upcoming") return setStatusLine(state, badge + " • " + tip, "");
    if (phase === "final") return setStatusLine(state, "FINAL", exc);
    return setStatusLine(state, badge, exc);
  }

  function setCompactStatus(state, badgeText, tipText, hasMarket) {
    const left = hasMarket
      ? (badgeText + " • " + tipText)
      : (badgeText + " • " + tipText + " • Odds unavailable");

    setStatusLine(state, left, "");
    state.excitement = state.excitement != null ? state.excitement : 2.5;
    state.dom.scoreAEl.textContent = "–";
    state.dom.scoreBEl.textContent = "–";
    setChartVisible(state, false);
  }

  function setLiveOrFinalCompact(state, badgeText, statusText, hasMarket) {
    const left = hasMarket
      ? (badgeText === "FINAL" ? "FINAL" : (badgeText + " • " + statusText))
      : (badgeText === "FINAL" ? "FINAL • Odds unavailable" : (badgeText + " • " + statusText + " • Odds unavailable"));

    const right = "EXC " + ((state.excitement != null ? state.excitement : 2.5).toFixed(1));
    setStatusLine(state, left, right);
    setChartVisible(state, hasMarket);
  }

  function getSeedGapBonus(seedOrange, seedBlue, finalProbOrange, probs) {
    if (!Number.isFinite(seedOrange) || !Number.isFinite(seedBlue)) return 0;

    const biggerSeed = Math.max(seedOrange, seedBlue);
    const smallerSeed = Math.min(seedOrange, seedBlue);
    const gap = biggerSeed - smallerSeed;
    if (gap < 4) return 0;

    const orangeIsUnderdogBySeed = seedOrange > seedBlue;
    const underdogLateProb = probs.length
      ? (orangeIsUnderdogBySeed ? finalProbOrange : (1 - finalProbOrange))
      : 0;

    let bonus = 0;
    if (gap >= 10) bonus += 0.5;
    else if (gap >= 7) bonus += 0.3;
    else bonus += 0.15;

    if (underdogLateProb >= 0.25) bonus += 0.2;
    if (underdogLateProb >= 0.40) bonus += 0.35;
    if (underdogLateProb >= 0.50) bonus += 0.45;

    if (underdogLateProb >= 0.5) {
      if (gap >= 10) bonus += 1.0;
      else if (gap >= 7) bonus += 0.75;
      else bonus += 0.45;
    }

    return bonus;
  }

  function getExcitementScore(history, state) {
    if (!Array.isArray(history) || history.length < 8) return null;

    const probs = history.map(p => Number(p.p)).filter(Number.isFinite);
    if (probs.length < 8) return null;

    let totalMove = 0;
    let closeCount = 0;
    let flips = 0;

    for (let i = 1; i < probs.length; i++) {
      const prev = probs[i - 1];
      const curr = probs[i];
      totalMove += Math.abs(curr - prev);
      if ((prev >= 0.5) !== (curr >= 0.5)) flips++;
      if (curr >= 0.43 && curr <= 0.57) closeCount++;
    }

    const lateStart = Math.floor(probs.length * 0.8);
    let lateMove = 0;
    let lateFlips = 0;

    for (let i = lateStart + 1; i < probs.length; i++) {
      lateMove += Math.abs(probs[i] - probs[i - 1]);
      if ((probs[i - 1] >= 0.5) !== (probs[i] >= 0.5)) lateFlips++;
    }

    const closenessRatio = closeCount / probs.length;
    let raw =
      (totalMove * 1.4) +
      (closenessRatio * 1.8) +
      (lateMove * 2.3) +
      (flips * 0.12) +
      (lateFlips * 0.45);

    const firstProb = probs[0];
    const finalProb = probs[probs.length - 1];

    if (firstProb >= 0.60 && finalProb < 0.50) raw += 0.8;
    raw += getSeedGapBonus(Number(state.seedOrange), Number(state.seedBlue), finalProb, probs);

    if (closenessRatio < 0.10 && flips === 0) raw -= 0.6;
    if (Math.max.apply(null, probs) >= 0.96 || Math.min.apply(null, probs) <= 0.04) raw -= 0.35;

    return Number(clamp(raw, 0, 9.7).toFixed(1));
  }

  function getFallbackExcitementFromScoreboard(game, scoreA, scoreB, state) {
    const a = Number(scoreA);
    const b = Number(scoreB);
    const shortDetail = String(game?.status?.type?.shortDetail || "").toLowerCase();
    const description = String(game?.status?.type?.description || "").toLowerCase();

    if (description.includes("scheduled") || description.includes("pre-game")) return 2.5;
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 2.5;

    const margin = Math.abs(a - b);
    let score = 3.6;

    if (margin <= 1) score += 2.2;
    else if (margin <= 3) score += 1.8;
    else if (margin <= 5) score += 1.2;
    else if (margin <= 8) score += 0.6;
    else if (margin >= 15) score -= 0.8;

    if (shortDetail.includes("2nd")) score += 0.7;
    if (shortDetail.includes("final")) score += 0.4;
    if (shortDetail.includes("ot") || description.includes("overtime")) score += 1.1;
    if (description.includes("halftime") && margin <= 5) score += 0.3;

    const seedOrange = Number(state.seedOrange);
    const seedBlue = Number(state.seedBlue);
    if (Number.isFinite(seedOrange) && Number.isFinite(seedBlue)) {
      const gap = Math.abs(seedOrange - seedBlue);
      const orangeIsUnderdogBySeed = seedOrange > seedBlue;
      const underdogWinning = orangeIsUnderdogBySeed ? (a > b) : !(a > b);

      if (gap >= 7 && margin <= 8) score += 0.35;
      if (gap >= 10 && margin <= 5) score += 0.45;
      if (underdogWinning && gap >= 7) score += 0.5;
      if (underdogWinning && gap >= 10) score += 0.35;
    }

    return Number(clamp(score, 2.0, 8.8).toFixed(1));
  }

  function trimHistoryAtResolution(history) {
    if (!Array.isArray(history) || history.length < 2) return history;

    const EPSILON = 0.0005;
    const lastProb = Number(history[history.length - 1].p);
    if (!Number.isFinite(lastProb)) return history;
    if (!(lastProb >= 0.999 || lastProb <= 0.001)) return history;

    let plateauStart = history.length - 1;
    for (let i = history.length - 2; i >= 0; i--) {
      const prob = Number(history[i].p);
      if (!Number.isFinite(prob)) break;
      if (Math.abs(prob - lastProb) > EPSILON) break;
      plateauStart = i;
    }

    return plateauStart === history.length - 1 ? history : history.slice(0, plateauStart + 1);
  }

  function primaryGameMarket(markets, espnGame) {
    const list = Array.isArray(markets) ? markets : [];

    function key(str) {
      return normalizeTeamLookup(str)
        .replace(/^north carolina state$/, "nc state")
        .replace(/^north carolina state wolfpack$/, "nc state")
        .replace(/^connecticut$/, "uconn")
        .replace(/^connecticut huskies$/, "uconn")
        .replace(/^pennsylvania$/, "penn")
        .replace(/^pennsylvania quakers$/, "penn")
        .replace(/^queens university$/, "queens")
        .replace(/^queens university royals$/, "queens")
        .replace(/^long island university$/, "liu")
        .replace(/^long island university sharks$/, "liu")
        .replace(/^mcneese state$/, "mcneese")
        .replace(/^mcneese state cowboys$/, "mcneese");
    }

    const teamA = key(espnGame?.team1 || "");
    const teamB = key(espnGame?.team2 || "");

    function looksLikeTeamMarket(m) {
      const outcomes = parseMaybeJson(m.outcomes);
      const prices = parseMaybeJson(m.outcomePrices);
      if (!Array.isArray(outcomes) || outcomes.length !== 2) return false;
      if (!Array.isArray(prices) || prices.length !== 2) return false;

      const o0 = String(outcomes[0] || "").trim();
      const o1 = String(outcomes[1] || "").trim();
      const k0 = key(o0);
      const k1 = key(o1);

      if (!k0 || !k1) return false;
      if (/\byes\b|\bno\b|\bover\b|\bunder\b/i.test(o0 + " " + o1)) return false;

      const aMatch =
        k0 === teamA || k1 === teamA || k0.includes(teamA) || k1.includes(teamA) || teamA.includes(k0) || teamA.includes(k1);

      const bMatch =
        k0 === teamB || k1 === teamB || k0.includes(teamB) || k1.includes(teamB) || teamB.includes(k0) || teamB.includes(k1);

      return aMatch && bMatch;
    }

    const valid = list.filter(looksLikeTeamMarket);
    valid.sort((a, b) => Number(b.volume || 0) - Number(a.volume || 0));
    return valid[0] || null;
  }

  async function getOpeningFavoriteIndex(tokenIds, startTs) {
    if (!Array.isArray(tokenIds) || tokenIds.length < 2 || !startTs) return 0;

    try {
      const endTs = Math.floor(Date.now() / 1000);
      const url =
        "https://clob.polymarket.com/prices-history?market=" +
        encodeURIComponent(tokenIds[0]) +
        "&startTs=" + startTs +
        "&endTs=" + endTs +
        "&fidelity=0.5";

      const historyRes = await fetch(proxied(url)).then(r => r.json());
      const history = Array.isArray(historyRes.history) ? historyRes.history : [];
      if (!history.length) return 0;

      const firstProb = Number(history[0].p);
      return Number.isFinite(firstProb) && firstProb < 0.5 ? 1 : 0;
    } catch (err) {
      console.error("Opening favorite lookup failed:", err);
      return 0;
    }
  }

  function extractTournamentText(game) {
    const pieces = [
      game.name || "",
      game.shortName || "",
      game.season?.slug || "",
      game.season?.type?.name || "",
      game.league?.name || "",
      game.status?.type?.description || "",
      game.status?.type?.detail || "",
      game.status?.type?.shortDetail || ""
    ];

    if (Array.isArray(game.competitions)) {
      game.competitions.forEach(function (comp) {
        pieces.push(comp.note || "", comp.headline || "", comp.type?.text || "");
        if (Array.isArray(comp.notes)) {
          comp.notes.forEach(function (n) {
            pieces.push(n?.headline || "", n?.text || "");
          });
        }
      });
    }

    return pieces.join(" ").toLowerCase();
  }

  function isMensMarchMadnessGame(game) {
    const text = extractTournamentText(game);

    if (
      text.includes("ncaa tournament") ||
      text.includes("march madness") ||
      text.includes("first four") ||
      text.includes("final four") ||
      text.includes("sweet 16") ||
      text.includes("sweet sixteen") ||
      text.includes("elite eight") ||
      text.includes("national championship")
    ) return true;

    if (
      text.includes("nit") ||
      text.includes("national invitation tournament") ||
      text.includes("sec tournament") ||
      text.includes("big ten tournament") ||
      text.includes("big 12 tournament") ||
      text.includes("acc tournament") ||
      text.includes("big east tournament") ||
      text.includes("aac tournament") ||
      text.includes("cbi")
    ) return false;

    return false;
  }

  function getFallbackRoundByDate(gameDate) {
    return ROUND_BY_DATE[formatDateKey(new Date(gameDate))] || null;
  }

  function getRoundFromText(game) {
    const text = extractTournamentText(game);
    if (text.includes("first four")) return "First Four";
    if (text.includes("round of 64") || text.includes("first round")) return "Round of 64";
    if (text.includes("round of 32") || text.includes("second round")) return "Round of 32";
    if (text.includes("sweet sixteen") || text.includes("sweet 16")) return "Sweet Sixteen";
    if (text.includes("elite eight")) return "Elite Eight";
    if (text.includes("final four")) return "Final Four";
    if (text.includes("national championship") || text.includes("championship game")) return "National Championship";
    return null;
  }

  function getMarchMadnessRound(game) {
    return getRoundFromText(game) || getFallbackRoundByDate(game.date);
  }

  function gameHasBracketSeedsOrTbd(game) {
    const competitors = game?.competitions?.[0]?.competitors || [];
    if (competitors.length < 2) return false;

    const team1 = competitors[0]?.team || {};
    const team2 = competitors[1]?.team || {};

    const name1 = getTeamName(team1);
    const name2 = getTeamName(team2);

    const hasSeedA = !!getEspnBracketSeed(team1);
    const hasSeedB = !!getEspnBracketSeed(team2);

    const isTbdA = /^tbd$/i.test(name1);
    const isTbdB = /^tbd$/i.test(name2);

    if (hasSeedA && hasSeedB) return true;
    if (hasSeedA && isTbdB) return true;
    if (hasSeedB && isTbdA) return true;

    return false;
  }

  function getTournamentDates() {
    return Object.keys(ROUND_BY_DATE);
  }

  async function fetchScoreboardByDate(scoreboardDate, forceRefresh) {
    if (!forceRefresh && scoreboardCache[scoreboardDate]) return scoreboardCache[scoreboardDate];

    const url =
      "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard" +
      "?dates=" + scoreboardDate +
      "&groups=50&limit=365";

    const data = await fetch(proxied(url)).then(r => r.json());
    const events = Array.isArray(data.events) ? data.events : [];
    scoreboardCache[scoreboardDate] = events;
    return events;
  }

  async function fetchEspnGames(scoreboardDate) {
    const events = await fetchScoreboardByDate(scoreboardDate, false);

    return events.map(function (game) {
      const comp = game.competitions?.[0];
      const competitors = comp?.competitors || [];
      if (competitors.length < 2) return null;

      const t1 = competitors[0];
      const t2 = competitors[1];
      const team1 = getTeamName(t1.team);
      const team2 = getTeamName(t2.team);

      if (!team1 || !team2) return null;

      return {
        espnId: game.id,
        game: game,
        title: team1 + " vs " + team2,
        team1: team1,
        team2: team2,
        normA: normalize(team1),
        normB: normalize(team2),
        startTime: new Date(game.date || 0).getTime(),
        round: null,
        scoreboardDate: scoreboardDate
      };
    }).filter(Boolean);
  }

  function getPolySlug(name) {
    const raw = String(name || "").trim();
    if (!raw) return null;

    const variants = [
      raw,
      raw.replace(/\s+\([^)]*\)/g, ""),
      raw.replace(/\s+(Bison|Retrievers|Wolfpack|Longhorns|Mountain Hawks|Panthers|Mustangs|RedHawks|Horned Frogs|Buckeyes|Trojans|Cornhuskers|Bulls|Cardinals|Badgers|Saints|Blue Devils|Cowboys|Commodores|Spartans|Rainbow Warriors|Razorbacks|Rams|Tar Heels|Aggies|Gaels|Quakers|Fighting Illini|Billikens|Bulldogs|Owls|Broncos|Wildcats|Zips|Red Raiders|Sharks|Cavaliers|Raiders|Tigers|Cyclones|Crimson Tide|Pride|Knights|Bruins|Boilermakers|Royals|Lancers|Jayhawks|Paladins|Huskies|Hurricanes)$/i, "").trim(),
      raw.replace(/\bSt\.\b/g, "Saint"),
      raw.replace(/\bSt\b/g, "Saint"),
      raw.replace(/\bSaint\b/g, "St"),
      raw.replace(/\bNC State\b/g, "NC St"),
      raw.replace(/\bNC St\b/g, "NC State"),
      raw.replace(/\bConnecticut\b/g, "UConn"),
      raw.replace(/\bUConn\b/g, "Connecticut"),
      raw.replace(/\bCal Baptist\b/g, "California Baptist"),
      raw.replace(/\bCalifornia Baptist\b/g, "Cal Baptist"),
      raw.replace(/\bLIU Brooklyn\b/g, "LIU"),
      raw.replace(/\bLIU\b/g, "LIU Brooklyn"),
      raw.replace(/\bMiami \(OH\)\b/g, "Miami OH"),
      raw.replace(/\bMiami OH\b/g, "Miami (OH)")
    ];

    for (const variant of variants) {
      const slug = POLY_TEAM_LOOKUP[normalizeTeamLookup(variant)];
      if (slug) return slug;
    }

    return null;
  }

  function shiftYmd(yyyymmdd, deltaDays) {
    const y = Number(yyyymmdd.slice(0, 4));
    const m = Number(yyyymmdd.slice(4, 6));
    const d = Number(yyyymmdd.slice(6, 8));
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + deltaDays);
    return dt.getFullYear().toString() + pad2(dt.getMonth() + 1) + pad2(dt.getDate());
  }

  async function fetchEventCandidates(espnGame) {
    const slugA = getPolySlug(espnGame.team1);
    const slugB = getPolySlug(espnGame.team2);

    if (!slugA || !slugB) {
      console.warn("Missing slug lookup", {
        game: espnGame.title,
        team1: espnGame.team1,
        team2: espnGame.team2,
        slugA: slugA,
        slugB: slugB
      });
      return [];
    }

    const baseDate = espnGame.scoreboardDate || formatDateKey(new Date(espnGame.game.date));
    const dateCandidates = [baseDate, shiftYmd(baseDate, -1), shiftYmd(baseDate, 1)];

    const slugCandidates = [];
    const seen = new Set();

    dateCandidates.forEach(function (ymd) {
      const dateSlug = ymd.slice(0, 4) + "-" + ymd.slice(4, 6) + "-" + ymd.slice(6, 8);
      [
        "cbb-" + slugA + "-" + slugB + "-" + dateSlug,
        "cbb-" + slugB + "-" + slugA + "-" + dateSlug
      ].forEach(function (slug) {
        if (!seen.has(slug)) {
          seen.add(slug);
          slugCandidates.push(slug);
        }
      });
    });

    const results = [];

    for (const slug of slugCandidates) {
      try {
        const eventData = await fetch(
          proxied("https://gamma-api.polymarket.com/events/slug/" + slug)
        ).then(r => {
          if (!r.ok) throw new Error("slug miss");
          return r.json();
        });

        if (eventData && eventData.slug) results.push(eventData);
      } catch (err) {}
    }

    return results;
  }

  function findBestEventForEspnGame(espnGame, eventCandidates, usedEventSlugs) {
    for (const eventData of eventCandidates) {
      const slug = String(eventData?.slug || "");
      if (slug && usedEventSlugs.has(slug)) continue;
      return eventData;
    }
    return null;
  }

  async function fetchEspnBracketSeeds() {
    const html = await fetch(
      proxied("https://www.espn.com/mens-college-basketball/bracket")
    ).then(r => r.text());

    const seedMap = {};

    function saveSeed(teamName, seed) {
      if (seed < 1 || seed > 16) return;
      if (!teamName || /^tbd$/i.test(teamName)) return;

      const key = normalizeSeedName(teamName);
      if (key && Number.isFinite(seed)) seedMap[key] = String(seed);
    }

    function parseAnchorText(anchorText) {
      const text = String(anchorText || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&#x27;|&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (!text) return;

      const m = text.match(
        /^(?:[A-Z]{2,6}\s[-+]?\d+(?:\.\d+)?\s+)?(\d{1,2})\s+(.+?)\s+(\d{1,2})\s+(.+?)\s+Mar\s+\d{1,2}\b/i
      );
      if (!m) return;

      const seedA = Number(m[1]);
      const teamA = (m[2] || "").trim();
      const seedB = Number(m[3]);
      const teamB = (m[4] || "").trim();

      saveSeed(teamA, seedA);
      saveSeed(teamB, seedB);
    }

    const anchorRegex = /<a\b[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = anchorRegex.exec(html)) !== null) parseAnchorText(match[1]);

    return seedMap;
  }

  function createSection(title, key) {
    const wrap = document.createElement("div");
    wrap.className = "pm-section";
    wrap.dataset.round = key;
    wrap.innerHTML = '<div class="pm-board-grid"></div>';
    return {
      root: wrap,
      grid: wrap.querySelector(".pm-board-grid")
    };
  }

  function createCardDom() {
    const card = document.createElement("div");
    card.className = "pm-card";
    card.innerHTML = `
      <div class="pm-scoreboard">
        <div class="pm-score-status">
          <span class="pm-score-status-left">Loading scoreboard…</span>
          <span class="pm-score-status-right"></span>
        </div>

        <div class="pm-score-row">
          <div class="pm-team">
            <img class="pm-team-logo" alt="" style="display:none;">
            <div class="pm-team-name">
              <span class="pm-team-seed"></span>
              <span class="pm-team-label">Team A</span>
            </div>
          </div>
          <div class="pm-score-wrap">
            <div class="pm-score">–</div>
            <div class="pm-score-prob pm-prob-a">–%</div>
          </div>
        </div>

        <div class="pm-score-row">
          <div class="pm-team">
            <img class="pm-team-logo" alt="" style="display:none;">
            <div class="pm-team-name">
              <span class="pm-team-seed"></span>
              <span class="pm-team-label">Team B</span>
            </div>
          </div>
          <div class="pm-score-wrap">
            <div class="pm-score">–</div>
            <div class="pm-score-prob pm-prob-b">–%</div>
          </div>
        </div>
      </div>

      <div class="pm-chart-legend">
        <div class="pm-legend-item pm-legend-orange">
          <span class="pm-legend-swatch"></span>
          <span class="pm-legend-label">Team A</span>
        </div>
        <div class="pm-legend-item pm-legend-blue">
          <span class="pm-legend-swatch"></span>
          <span class="pm-legend-label">Team B</span>
        </div>
      </div>

      <div class="pm-chart-wrap">
        <canvas></canvas>
      </div>
    `;

    return {
      root: card,
      statusLeftEl: card.querySelector(".pm-score-status-left"),
      statusRightEl: card.querySelector(".pm-score-status-right"),
      teamASeedEl: card.querySelectorAll(".pm-team-seed")[0],
      teamBSeedEl: card.querySelectorAll(".pm-team-seed")[1],
      teamALabelEl: card.querySelectorAll(".pm-team-label")[0],
      teamBLabelEl: card.querySelectorAll(".pm-team-label")[1],
      teamALogoEl: card.querySelectorAll(".pm-team-logo")[0],
      teamBLogoEl: card.querySelectorAll(".pm-team-logo")[1],
      scoreAEl: card.querySelectorAll(".pm-score")[0],
      scoreBEl: card.querySelectorAll(".pm-score")[1],
      probAEl: card.querySelectorAll(".pm-score-prob")[0],
      probBEl: card.querySelectorAll(".pm-score-prob")[1],
      legendOrangeLabelEl: card.querySelectorAll(".pm-legend-label")[0],
      legendBlueLabelEl: card.querySelectorAll(".pm-legend-label")[1],
      chartLegendEl: card.querySelector(".pm-chart-legend"),
      canvasEl: card.querySelector("canvas"),
      chartWrapEl: card.querySelector(".pm-chart-wrap")
    };
  }

  function setLogo(imgEl, url, alt) {
    if (url) {
      imgEl.src = url;
      imgEl.alt = alt || "";
      imgEl.style.display = "block";
    } else {
      imgEl.removeAttribute("src");
      imgEl.alt = "";
      imgEl.style.display = "none";
    }
  }

  function renderInitialEspnCard(state) {
    const game = state.espnGame.game;
    const comp = game?.competitions?.[0];
    const competitors = comp?.competitors || [];
    if (competitors.length < 2) return;

    const t1 = competitors[0];
    const t2 = competitors[1];
    const raw1 = getTeamName(t1.team);
    const raw2 = getTeamName(t2.team);
    const logo1 = getTeamLogo(t1.team);
    const logo2 = getTeamLogo(t2.team);
    const seed1 = getEspnBracketSeed(t1.team || {});
    const seed2 = getEspnBracketSeed(t2.team || {});

    setLogo(state.dom.teamALogoEl, logo1, raw1);
    setLogo(state.dom.teamBLogoEl, logo2, raw2);
    setSeedText(state.dom.teamASeedEl, seed1);
    setSeedText(state.dom.teamBSeedEl, seed2);

    state.seedOrange = seed1 ? Number(seed1) : null;
    state.seedBlue = seed2 ? Number(seed2) : null;

    state.teamOrange = raw1;
    state.teamBlue = raw2;

    state.dom.teamALabelEl.textContent = state.teamOrange;
    state.dom.teamBLabelEl.textContent = state.teamBlue;
    state.dom.legendOrangeLabelEl.textContent = state.teamOrange;
    state.dom.legendBlueLabelEl.textContent = state.teamBlue;
    state.dom.probAEl.textContent = "—";
    state.dom.probBEl.textContent = "—";

    renderFallbackStatus(state, game);
    setChartVisible(state, false);
  }

  async function hydrateCardMarket(state, usedEventSlugs) {
    const espnGame = state.espnGame;

    const eventCandidates = await fetchEventCandidates(espnGame);
    const eventData = findBestEventForEspnGame(espnGame, eventCandidates, usedEventSlugs);
    if (!eventData) return;

    const market = primaryGameMarket(eventData.markets || [], espnGame);
    if (!market) {
      console.warn("⚠️ No valid market:", espnGame.title, eventData.title);
      return;
    }

    const outcomes = parseMaybeJson(market.outcomes) || [espnGame.team1, espnGame.team2];
    const tokenIds = parseMaybeJson(market.clobTokenIds);
    const prices = parseMaybeJson(market.outcomePrices);

    if (
      !Array.isArray(tokenIds) || tokenIds.length < 2 ||
      !Array.isArray(outcomes) || outcomes.length < 2 ||
      !Array.isArray(prices) || prices.length < 2
    ) return;

    const startTsCandidate = Math.floor(
      new Date(market.gameStartTime || eventData.startDate || espnGame.game.date).getTime() / 1000
    );

    const orangeIndex = await getOpeningFavoriteIndex(tokenIds, startTsCandidate);
    const blueIndex = orangeIndex === 0 ? 1 : 0;

    const marketTeamOrange = outcomes[orangeIndex] || "";
    const orangePrice = Number(prices[orangeIndex]);
    const bluePrice = Number(prices[blueIndex]);

    const espnA = normalize(espnGame.team1 || "");
    const espnB = normalize(espnGame.team2 || "");
    const marketOrangeNorm = normalize(marketTeamOrange);

    const orangeIsEspnA =
      marketOrangeNorm === espnA ||
      marketOrangeNorm.includes(espnA) ||
      espnA.includes(marketOrangeNorm);

    const orangeIsEspnB =
      marketOrangeNorm === espnB ||
      marketOrangeNorm.includes(espnB) ||
      espnB.includes(marketOrangeNorm);

    state.hasMarket = true;
    state.title = eventData?.title || espnGame.title;
    state.marketSlug = market.slug || null;
    state.startTs = startTsCandidate;

    if (orangeIsEspnB && !orangeIsEspnA) {
      state.tokenOrange = tokenIds[blueIndex];
      state.dom.probAEl.textContent = Number.isFinite(bluePrice) ? Math.round(bluePrice * 100) + "%" : "—";
      state.dom.probBEl.textContent = Number.isFinite(orangePrice) ? Math.round(orangePrice * 100) + "%" : "—";
    } else {
      state.tokenOrange = tokenIds[orangeIndex];
      state.dom.probAEl.textContent = Number.isFinite(orangePrice) ? Math.round(orangePrice * 100) + "%" : "—";
      state.dom.probBEl.textContent = Number.isFinite(bluePrice) ? Math.round(bluePrice * 100) + "%" : "—";
    }

    if (eventData.slug) usedEventSlugs.add(String(eventData.slug));

    await refreshCardScoreboard(state);
    await refreshCardChart(state);
  }

  function createChartForCard(state, history) {
    const labels = history.map(() => "");
    const dataOrange = history.map(p => Math.round(Number(p.p) * 1000) / 10);
    const dataBlue = dataOrange.map(v => Math.round((100 - v) * 10) / 10);

    state.chart = new Chart(state.dom.canvasEl.getContext("2d"), {
      type: "line",
      data: {
        labels: labels,
        datasets: [
          {
            label: state.teamOrange,
            data: dataOrange,
            borderColor: "#ff6d00",
            borderWidth: 2.25,
            pointRadius: 0,
            tension: 0.25
          },
          {
            label: state.teamBlue,
            data: dataBlue,
            borderColor: "#1f77b4",
            borderWidth: 2.25,
            pointRadius: 0,
            tension: 0.25
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: function () { return ""; },
              label: function(context) {
                return context.dataset.label + ": " + context.parsed.y.toFixed(1) + "%";
              }
            }
          }
        },
        scales: {
          x: { display: false },
          y: {
            min: 0,
            max: 100,
            ticks: {
              stepSize: 25,
              color: "#7f7f7f",
              callback: value => value + "%",
              font: { size: 10 }
            },
            grid: { color: "rgba(0,0,0,0.06)" }
          }
        }
      }
    });
  }

  function updateChartForCard(state, history) {
    const labels = history.map(() => "");
    const dataOrange = history.map(p => Math.round(Number(p.p) * 1000) / 10);
    const dataBlue = dataOrange.map(v => Math.round((100 - v) * 10) / 10);

    if (!state.chart) return createChartForCard(state, history);

    state.chart.data.labels = labels;
    state.chart.data.datasets[0].label = state.teamOrange;
    state.chart.data.datasets[0].data = dataOrange;
    state.chart.data.datasets[1].label = state.teamBlue;
    state.chart.data.datasets[1].data = dataBlue;
    state.chart.update();
  }

  function stopCard(state, reason) {
    if (state.finished) return;
    state.finished = true;
    console.log("Stopped", state.title, reason);
  }

  async function isCardMarketClosed(state) {
    if (!state.hasMarket || !state.marketSlug) return false;
    try {
      const marketData = await fetch(
        proxied("https://gamma-api.polymarket.com/markets/slug/" + state.marketSlug)
      ).then(r => r.json());

      if (marketData?.closed === true || marketData?.active === false) {
        stopCard(state, "Polymarket market closed");
        return true;
      }
      return false;
    } catch (err) {
      console.error("Close check failed:", state.title, err);
      return false;
    }
  }

  async function refreshCardChart(state) {
    if (!state.hasMarket || !state.tokenOrange || !state.startTs || state.finished) {
      setChartVisible(state, false);
      return;
    }

    const phase = getGamePhase(state.espnGame.game);
    if (phase === "upcoming") setChartVisible(state, false);
    else setChartVisible(state, true);

    const endTs = Math.floor(Date.now() / 1000);
    const url =
      "https://clob.polymarket.com/prices-history?market=" +
      encodeURIComponent(state.tokenOrange) +
      "&startTs=" + state.startTs +
      "&endTs=" + endTs +
      "&fidelity=0.5";

    const historyRes = await fetch(proxied(url)).then(r => r.json());
    let history = Array.isArray(historyRes.history) ? historyRes.history : [];
    if (!history.length) {
      if (phase !== "upcoming") setChartVisible(state, false);
      return;
    }

    history = trimHistoryAtResolution(history);

    const latestProb = Number(history[history.length - 1].p);
    if (Number.isFinite(latestProb)) {
      const orangePct = Math.round(latestProb * 100);
      state.dom.probAEl.textContent = orangePct + "%";
      state.dom.probBEl.textContent = (100 - orangePct) + "%";
    }

    if (phase !== "upcoming") {
      const excitement = getExcitementScore(history, state);
      if (excitement !== null) state.excitement = excitement;

      const newestTs = history[history.length - 1].t;
      if (newestTs === state.lastHistoryTs) {
        const latestProbSame = Number(history[history.length - 1].p);
        if (Number.isFinite(latestProbSame) && (latestProbSame >= 0.999 || latestProbSame <= 0.001)) {
          stopCard(state, "Resolved probability threshold reached");
        }
        return;
      }

      state.lastHistoryTs = newestTs;
      updateChartForCard(state, history);
    }

    if (Number.isFinite(latestProb) && (latestProb >= 0.999 || latestProb <= 0.001)) {
      stopCard(state, "Resolved probability threshold reached");
    }

    await isCardMarketClosed(state);
  }

  async function refreshCardScoreboard(state) {
    try {
      const events = await fetchScoreboardByDate(state.scoreboardDate, true);

      let freshGame = null;
      for (const game of events) {
        if (String(game.id) === String(state.espnGameId)) {
          freshGame = game;
          break;
        }
      }

      if (!freshGame) {
        renderFallbackStatus(state, state.espnGame.game);
        return;
      }

      state.espnGame.game = freshGame;

      const comp = freshGame.competitions?.[0];
      const competitors = comp?.competitors || [];
      if (competitors.length < 2) return;

      const t1 = competitors[0];
      const t2 = competitors[1];
      const raw1 = getTeamName(t1.team);
      const raw2 = getTeamName(t2.team);
      const logo1 = getTeamLogo(t1.team);
      const logo2 = getTeamLogo(t2.team);
      const seed1 = getEspnBracketSeed(t1.team || {});
      const seed2 = getEspnBracketSeed(t2.team || {});
      const orangeIsT1 = teamMatchesDisplayName(state.teamOrange, raw1);

      if (orangeIsT1) {
        setLogo(state.dom.teamALogoEl, logo1, raw1);
        setLogo(state.dom.teamBLogoEl, logo2, raw2);
        setSeedText(state.dom.teamASeedEl, seed1);
        setSeedText(state.dom.teamBSeedEl, seed2);
        state.seedOrange = seed1 ? Number(seed1) : null;
        state.seedBlue = seed2 ? Number(seed2) : null;
      } else {
        setLogo(state.dom.teamALogoEl, logo2, raw2);
        setLogo(state.dom.teamBLogoEl, logo1, raw1);
        setSeedText(state.dom.teamASeedEl, seed2);
        setSeedText(state.dom.teamBSeedEl, seed1);
        state.seedOrange = seed2 ? Number(seed2) : null;
        state.seedBlue = seed1 ? Number(seed1) : null;
      }

      state.dom.teamALabelEl.textContent = state.teamOrange;
      state.dom.teamBLabelEl.textContent = state.teamBlue;
      state.dom.legendOrangeLabelEl.textContent = state.teamOrange;
      state.dom.legendBlueLabelEl.textContent = state.teamBlue;

      const phase = getGamePhase(freshGame);
      const badgeText = getGameBadge(freshGame);
      const tipText = formatTip(freshGame.date);

      if (phase === "upcoming") {
        state.excitement = 2.5;
        setCompactStatus(state, badgeText, tipText, state.hasMarket);
        return;
      }

      state.dom.scoreAEl.textContent = orangeIsT1 ? (t1.score || "0") : (t2.score || "0");
      state.dom.scoreBEl.textContent = orangeIsT1 ? (t2.score || "0") : (t1.score || "0");

      if (state.excitement == null) {
        state.excitement = getFallbackExcitementFromScoreboard(
          freshGame,
          state.dom.scoreAEl.textContent,
          state.dom.scoreBEl.textContent,
          state
        );
      }

      const shortDetail = freshGame?.status?.type?.shortDetail || "";
      const description = freshGame?.status?.type?.description || "";
      const statusText = shortDetail || description || "Live";

      if (phase === "final") {
        setLiveOrFinalCompact(state, "FINAL", "FINAL", state.hasMarket);
        if (!state.finished) stopCard(state, "ESPN final fallback");
        return;
      }

      setLiveOrFinalCompact(state, badgeText, statusText, state.hasMarket);
    } catch (err) {
      console.error("Scoreboard card error:", state.title, err);
      renderFallbackStatus(state, state.espnGame.game);
    }
  }

  function buildTabs(roundsPresent) {
    roundTabsEl.innerHTML = "";

    roundsPresent.forEach(function(roundName, index) {
      const btn = document.createElement("button");
      btn.className = "pm-round-tab" + (index === 0 ? " is-active" : "");
      btn.type = "button";
      btn.textContent = roundName;
      btn.dataset.round = roundName;

      btn.addEventListener("click", function () {
        document.querySelectorAll(".pm-round-tab").forEach(el => el.classList.remove("is-active"));
        document.querySelectorAll(".pm-section").forEach(el => el.classList.remove("is-active"));
        btn.classList.add("is-active");
        const target = sectionsEl.querySelector('.pm-section[data-round="' + roundName.replace(/"/g, '&quot;') + '"]');
        if (target) target.classList.add("is-active");
      });

      roundTabsEl.appendChild(btn);
    });
  }

  async function buildTournamentBoard() {
    boardTitleEl.textContent = "2026 March Madness";
    boardMetaEl.textContent = "Loading tournament rounds…";
    roundTabsEl.innerHTML = "";
    sectionsEl.innerHTML = "";

    ESPN_BRACKET_SEEDS = await fetchEspnBracketSeeds();

    const espnResults = await Promise.all(getTournamentDates().map(fetchEspnGames));
    const allEspnGames = espnResults.flat();

    const tourneyGames = allEspnGames
      .filter(function (g) {
        return (
          (isMensMarchMadnessGame(g.game) || !!getFallbackRoundByDate(g.game.date)) &&
          gameHasBracketSeedsOrTbd(g.game)
        );
      })
      .map(function (g) {
        g.round = getMarchMadnessRound(g.game);
        return g;
      })
      .filter(g => !!g.round);

    if (!tourneyGames.length) {
      boardMetaEl.textContent = "No March Madness games available yet. Tournament tabs will populate once ESPN exposes bracket data.";
      sectionsEl.innerHTML = '<div class="pm-empty">No March Madness Men\\\'s games found yet.</div>';
      return;
    }

    const roundsPresent = ROUND_ORDER.filter(roundName =>
      tourneyGames.some(g => g.round === roundName)
    );

    buildTabs(roundsPresent);

    const usedEventSlugs = new Set();

    for (const roundName of roundsPresent) {
      const roundGames = tourneyGames
        .filter(g => g.round === roundName)
        .sort((a, b) => a.startTime - b.startTime);

      if (!roundGames.length) continue;

      const section = createSection(roundName, roundName);
      if (roundName === roundsPresent[0]) section.root.classList.add("is-active");
      sectionsEl.appendChild(section.root);

      for (const espnGame of roundGames) {
        const dom = createCardDom();
        section.grid.appendChild(dom.root);

        const gameDateObj = new Date(espnGame.game.date);
        const state = {
          title: espnGame.title,
          dom: dom,
          chart: null,
          tokenOrange: null,
          marketSlug: null,
          startTs: null,
          lastHistoryTs: null,
          lastPregameOddsRefreshAt: null,
          finished: false,
          hasMarket: false,
          teamOrange: espnGame.team1,
          teamBlue: espnGame.team2,
          excitement: 2.5,
          seedOrange: null,
          seedBlue: null,
          espnGame: espnGame,
          espnGameId: espnGame.espnId,
          scoreboardDate:
            gameDateObj.getFullYear().toString() +
            pad2(gameDateObj.getMonth() + 1) +
            pad2(gameDateObj.getDate())
        };

        allCardStates.push(state);
        renderInitialEspnCard(state);

        setTimeout(function () {
          hydrateCardMarket(state, usedEventSlugs).catch(function (err) {
            console.error("Card hydrate error:", state.title, err);
          });
        }, 0);
      }
    }

    boardMetaEl.textContent = "Showing " + tourneyGames.length + " March Madness games across " + roundsPresent.length + " rounds.";
  }

  async function refreshBoard() {
    const activeStates = allCardStates.filter(s => !s.finished);
    const activeDates = [...new Set(activeStates.map(s => s.scoreboardDate))];
    await Promise.all(activeDates.map(date => fetchScoreboardByDate(date, true)));

    let hasLiveGame = false;
    const now = Date.now();

    for (const state of activeStates) {
      await refreshCardScoreboard(state);

      const phase = getGamePhase(state.espnGame.game);

      if (phase === "live") {
        hasLiveGame = true;
        await refreshCardChart(state);
        continue;
      }

      if (phase === "upcoming") {
        const shouldRefreshPregameOdds =
          state.lastPregameOddsRefreshAt === null ||
          (now - state.lastPregameOddsRefreshAt >= 60 * 60 * 1000);

        if (shouldRefreshPregameOdds && state.hasMarket && state.tokenOrange && state.startTs) {
          try {
            const endTs = Math.floor(Date.now() / 1000);
            const url =
              "https://clob.polymarket.com/prices-history?market=" +
              encodeURIComponent(state.tokenOrange) +
              "&startTs=" + state.startTs +
              "&endTs=" + endTs +
              "&fidelity=0.5";

            const historyRes = await fetch(proxied(url)).then(r => r.json());
            const history = Array.isArray(historyRes.history) ? historyRes.history : [];

            if (history.length) {
              const latestProb = Number(history[history.length - 1].p);
              if (Number.isFinite(latestProb)) {
                const orangePct = Math.round(latestProb * 100);
                state.dom.probAEl.textContent = orangePct + "%";
                state.dom.probBEl.textContent = (100 - orangePct) + "%";
              }
            }

            state.lastPregameOddsRefreshAt = now;
          } catch (err) {
            console.error("Pregame odds refresh failed:", state.title, err);
          }
        }

        continue;
      }

      await refreshCardChart(state);
    }

    const nextRefresh = hasLiveGame ? 10000 : 300000;
    setTimeout(refreshBoard, nextRefresh);
  }

  buildTournamentBoard()
    .then(function () {
      refreshBoard();
    })
    .catch(function (err) {
      console.error("TOURNAMENT BOARD ERROR:", err);
      boardMetaEl.textContent = "Could not load the tournament board.";
      sectionsEl.innerHTML = '<div class="pm-empty">Something went wrong while building the March Madness board.</div>';
    });
});