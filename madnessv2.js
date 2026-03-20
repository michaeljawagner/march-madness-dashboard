window.addEventListener("load", function () {
  const workerBase = "https://testing01.michaeljawagner.workers.dev/?url=";
  const excitementWorkerBase = "https://march-excitement-worker.michaeljawagner.workers.dev";
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
  // Seed display should stay card-local to avoid cross-game contamination.
  const scoreboardCache = {};
  const allCardStates = [];
  const HYDRATE_BATCH_SIZE = 3;

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
mich|Michigan Wolverines|Michigan
byu|BYU Cougars|BYU
tenn|Tennessee Volunteers|Tennessee
fla|Florida Gators|Florida
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

  async function fetchHistoricSummary(gameId) {
    if (!gameId) return null;

    try {
      const res = await fetch(
        excitementWorkerBase + "/summary?gameId=" + encodeURIComponent(gameId)
      );
      const data = await res.json();
      return data?.ok ? data.summary : null;
    } catch (err) {
      console.error("Historic summary fetch failed:", gameId, err);
      return null;
    }
  }

  async function fetchHistoricHistory(gameId) {
    if (!gameId) return null;

    try {
      const res = await fetch(
        excitementWorkerBase + "/history?gameId=" + encodeURIComponent(gameId)
      );
      const data = await res.json();
      return data?.ok ? data.history : null;
    } catch (err) {
      console.error("Historic history fetch failed:", gameId, err);
      return null;
    }
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

  function getSeedDisplayKey(str) {
    return normalizeSeedName(String(str || ""));
  }

  function getTeamSeedKeys(teamObj, rawName) {
    const keys = new Set();

    function add(value) {
      const key = getSeedDisplayKey(value);
      if (key) keys.add(key);
    }

    add(rawName || "");

    if (teamObj && typeof teamObj === "object") {
      add(teamObj.shortDisplayName || "");
      add(teamObj.displayName || "");
      add(teamObj.name || "");
      add(teamObj.location || "");
      add(teamObj.abbreviation || "");

      buildSeedNameCandidates(teamObj).forEach(add);
    }

    return Array.from(keys);
  }

  function rememberSeedForCard(seedMap, teamObj, rawName, seed) {
    const seedStr = String(seed || "").trim();
    if (!seedStr) return;

    getTeamSeedKeys(teamObj, rawName).forEach(function (key) {
      seedMap[key] = seedStr;
    });
  }

  function getRememberedSeedForCard(seedMap, teamObj, rawName) {
    const keys = getTeamSeedKeys(teamObj, rawName);
    for (const key of keys) {
      if (seedMap[key]) return seedMap[key];
    }
    return "";
  }

  const MANUAL_SEED_LOOKUP = {
    [normalizeSeedName("Howard")]: "16",
    [normalizeSeedName("Howard Bison")]: "16",
    [normalizeSeedName("UMBC")]: "16",
    [normalizeSeedName("UMBC Retrievers")]: "16",

    [normalizeSeedName("NC State")]: "11",
    [normalizeSeedName("NC State Wolfpack")]: "11",
    [normalizeSeedName("Texas")]: "11",
    [normalizeSeedName("Texas Longhorns")]: "11",

    [normalizeSeedName("Lehigh")]: "16",
    [normalizeSeedName("Lehigh Mountain Hawks")]: "16",
    [normalizeSeedName("Prairie View A&M")]: "16",
    [normalizeSeedName("Prairie View A&M Panthers")]: "16",

    [normalizeSeedName("SMU")]: "11",
    [normalizeSeedName("SMU Mustangs")]: "11",
    [normalizeSeedName("Miami (OH)")]: "11",
    [normalizeSeedName("Miami (OH) RedHawks")]: "11",
    [normalizeSeedName("Miami OH")]: "11"
  };

  function getPreferredSeed(competitor) {
    const bracketSeed = getEspnBracketSeed(competitor?.team || {});
    if (bracketSeed) return bracketSeed;

    const rawCandidates = [
      competitor?.team?.shortDisplayName || "",
      competitor?.team?.displayName || "",
      competitor?.team?.name || "",
      competitor?.team?.location || "",
      competitor?.team?.abbreviation || ""
    ].filter(Boolean);

    for (const candidate of rawCandidates) {
      const manualSeed = MANUAL_SEED_LOOKUP[normalizeSeedName(candidate)];
      if (manualSeed) return manualSeed;
    }

    const scoreboardSeed =
      competitor?.tournamentSeed ??
      competitor?.seed ??
      competitor?.team?.seed;

    const seedNum = Number(scoreboardSeed);
    if (Number.isFinite(seedNum) && seedNum >= 1 && seedNum <= 16) {
      return String(seedNum);
    }

    return "";
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

  function getCachedTeamSeed(teamObjOrName) {
  const candidates = typeof teamObjOrName === "string"
    ? [teamObjOrName]
    : buildSeedNameCandidates(teamObjOrName);

  for (const candidate of candidates) {
    const key = normalizeSeedName(candidate);
    if (TEAM_SEED_CACHE[key]) return TEAM_SEED_CACHE[key];
  }

  return "";
}

function rememberTeamSeed(teamObjOrName, seed) {
  const seedStr = String(seed || "").trim();
  if (!seedStr) return;

  const candidates = typeof teamObjOrName === "string"
    ? [teamObjOrName]
    : buildSeedNameCandidates(teamObjOrName);

  for (const candidate of candidates) {
    const key = normalizeSeedName(candidate);
    if (key) TEAM_SEED_CACHE[key] = seedStr;
  }
}

  function isKnownBracketTeam(teamObjOrName) {
    if (!teamObjOrName) return false;

    if (typeof teamObjOrName === "string") {
      const key = normalizeSeedName(teamObjOrName);
      return !!ESPN_BRACKET_SEEDS[key] || !!MANUAL_SEED_LOOKUP[key];
    }

    const candidates = buildSeedNameCandidates(teamObjOrName);
    for (const candidate of candidates) {
      const key = normalizeSeedName(candidate);
      if (ESPN_BRACKET_SEEDS[key] || MANUAL_SEED_LOOKUP[key]) return true;
    }

    return false;
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

  function smartRoundPct(value) {
    const num = Number(value || 0) * 100;

    // Close game → show 1 decimal (40%–60%)
    if (num >= 40 && num <= 60) {
      return (Math.round(num * 10) / 10).toFixed(1) + "%";
    }

    // Otherwise → whole number rounding
    const decimal = num % 1;
    const rounded = decimal >= 0.5 ? Math.ceil(num) : Math.floor(num);
    return rounded + "%";
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

    function parseProbText(text) {
    const n = Number(String(text || "").replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? (n / 100) : null;
  }

  function getClockContext(game) {
    const shortDetail = String(game?.status?.type?.shortDetail || "");
    const description = String(game?.status?.type?.description || "");
    const combined = (shortDetail + " " + description).toLowerCase();

    if (combined.includes("halftime")) {
      return { period: 1.5, remainingSeconds: 0, isHalftime: true, isOT: false };
    }

    if (combined.includes("ot") || combined.includes("overtime")) {
      return { period: 3, remainingSeconds: null, isHalftime: false, isOT: true };
    }

    const match = shortDetail.match(/(\d+):(\d+)\s*-\s*(\d)(?:st|nd)/i);
    if (match) {
      return {
        period: Number(match[3]),
        remainingSeconds: (Number(match[1]) * 60) + Number(match[2]),
        isHalftime: false,
        isOT: false
      };
    }

    return { period: null, remainingSeconds: null, isHalftime: false, isOT: false };
  }

  function getScoreNumbers(state) {
    return {
      a: Number(state?.dom?.scoreAEl?.textContent || 0),
      b: Number(state?.dom?.scoreBEl?.textContent || 0)
    };
  }

  function getSeedGap(state) {
    if (!Number.isFinite(Number(state.seedOrange)) || !Number.isFinite(Number(state.seedBlue))) return null;
    return Math.abs(Number(state.seedOrange) - Number(state.seedBlue));
  }

  function getUnderdogSide(state) {
    const seedA = Number(state.seedOrange);
    const seedB = Number(state.seedBlue);
    if (!Number.isFinite(seedA) || !Number.isFinite(seedB) || seedA === seedB) return null;
    return seedA > seedB ? "A" : "B";
  }

  function getFavoriteSide(state) {
    const seedA = Number(state.seedOrange);
    const seedB = Number(state.seedBlue);
    if (!Number.isFinite(seedA) || !Number.isFinite(seedB) || seedA === seedB) return null;
    return seedA < seedB ? "A" : "B";
  }

  function getWinnerSide(state) {
    const scores = getScoreNumbers(state);
    if (!Number.isFinite(scores.a) || !Number.isFinite(scores.b) || scores.a === scores.b) return null;
    return scores.a > scores.b ? "A" : "B";
  }

  function getBadgeStyles(tone) {
    const styles = {
      neutral: { background: "#f3f4f6", border: "#d1d5db", text: "#4b5563" },
      amber: { background: "#fff7ed", border: "#fdba74", text: "#9a3412" },
      blue: { background: "#eff6ff", border: "#93c5fd", text: "#1d4ed8" },
      red: { background: "#fef2f2", border: "#fca5a5", text: "#b91c1c" },
      purple: { background: "#faf5ff", border: "#d8b4fe", text: "#7e22ce" },
      green: { background: "#ecfdf5", border: "#86efac", text: "#166534" }
    };
    return styles[tone] || styles.neutral;
  }

  function getLiveBadge(state) {
    const game = state.espnGame.game;
    const phase = getGamePhase(game);
    if (phase !== "live") return null;

    const clock = getClockContext(game);
    if (!clock.isOT && clock.period !== 2) return null;

    const probs = {
      a: parseProbText(state.dom.probAEl.textContent),
      b: parseProbText(state.dom.probBEl.textContent)
    };
    const scores = getScoreNumbers(state);
    const margin = Math.abs(scores.a - scores.b);
    const seedGap = getSeedGap(state);
    const underdogSide = getUnderdogSide(state);
    const favoriteSide = getFavoriteSide(state);

    if (clock.isOT) {
      return { label: "OT DRAMA", tone: "purple" };
    }

    if (
      Number.isFinite(clock.remainingSeconds) &&
      clock.remainingSeconds <= 240 &&
      margin <= 4 &&
      Number.isFinite(probs.a) &&
      Number.isFinite(probs.b) &&
      probs.a >= 0.35 && probs.a <= 0.65 &&
      probs.b >= 0.35 && probs.b <= 0.65
    ) {
      return { label: "TIGHT FINISH", tone: "amber" };
    }

    if (
      Number.isFinite(seedGap) &&
      seedGap >= 4 &&
      underdogSide &&
      (clock.remainingSeconds === null || clock.remainingSeconds <= 600)
    ) {
      const underdogProb = underdogSide === "A" ? probs.a : probs.b;
      const underdogLeading = underdogSide === "A" ? (scores.a > scores.b) : (scores.b > scores.a);
      if ((Number.isFinite(underdogProb) && underdogProb >= 0.6) || underdogLeading) {
        return { label: "UPSET ALERT", tone: "red" };
      }
    }

    if (
      favoriteSide &&
      (clock.remainingSeconds === null || clock.remainingSeconds <= 600)
    ) {
      const favoriteProb = favoriteSide === "A" ? probs.a : probs.b;
      if (Number.isFinite(favoriteProb) && favoriteProb <= 0.4) {
        return { label: "FAVORITE IN TROUBLE", tone: "blue" };
      }
    }

    if (
      Number(state.excitement) >= 8.3 &&
      (clock.remainingSeconds === null || clock.remainingSeconds <= 720)
    ) {
      return { label: "PURE CHAOS", tone: "purple" };
    }

    return null;
  }

  function getFinalBadge(state) {
    const game = state.espnGame.game;
    const phase = getGamePhase(game);
    if (phase !== "final") return null;

    const clock = getClockContext(game);
    const scores = getScoreNumbers(state);
    const margin = Math.abs(scores.a - scores.b);
    const winnerSide = getWinnerSide(state);
    const seedGap = getSeedGap(state);
    const underdogSide = getUnderdogSide(state);
    const fullHistory = Array.isArray(state.latestHistory) ? state.latestHistory : [];
    const displayHistory = Array.isArray(state.latestDisplayHistory) ? state.latestDisplayHistory : [];

    // ALL-TIME UPSET first
    if (
      Number.isFinite(seedGap) &&
      seedGap >= 10 &&
      winnerSide &&
      underdogSide &&
      winnerSide === underdogSide
    ) {
      return { label: "ALL-TIME UPSET", tone: "red" };
    }

    // PURE CHAOS (high threshold) now #2 priority
    if (Number(state.excitement) >= 9) {
      return { label: "PURE CHAOS", tone: "purple" };
    }

    // OT DRAMA after PURE CHAOS
    if (clock.isOT) {
      return { label: "OT DRAMA", tone: "purple" };
    }

    if (winnerSide && displayHistory.length >= 5) {
      let wasTrailing = false;

      for (let i = 0; i < displayHistory.length; i++) {
        const p = winnerSide === "A"
          ? Number(displayHistory[i].p)
          : (1 - Number(displayHistory[i].p));

        if (Number.isFinite(p) && p < 0.5) {
          wasTrailing = true;
          break;
        }
      }

      if (wasTrailing) {
        const winnerMinProb = displayHistory.reduce(function (min, point) {
          const p = winnerSide === "A"
            ? Number(point.p)
            : (1 - Number(point.p));
          return Number.isFinite(p) ? Math.min(min, p) : min;
        }, 1);

        if (winnerMinProb <= 0.35) {
          return { label: "DON'T CALL IT A COMEBACK", tone: "green" };
        }
      }
    }

    // MARKET MISS block removed

    // replaced UPSET/ALL-TIME UPSET block with above

    if (margin <= 3 && Number(state.excitement) >= 7) {
      return { label: "TIGHT FINISH", tone: "amber" };
    }

    if (Number(state.excitement) <= 3.2) {
      if (margin >= 30) {
        return { label: "BELT TO ASS", tone: "neutral" };
      }
      return { label: "SNOOZE FEST", tone: "neutral" };
    }

    if (winnerSide && displayHistory.length >= 3) {
      const winnerStayedAhead = displayHistory.every(function (point) {
        const p = winnerSide === "A" ? Number(point.p) : (1 - Number(point.p));
        return Number.isFinite(p) ? p >= 0.5 : false;
      });
      if (winnerStayedAhead) {
        return { label: "WIRE TO WIRE", tone: "blue" };
      }
    }

    if (margin >= 30) {
      return { label: "BELT TO ASS", tone: "neutral" };
    }

    if (Number(state.excitement) >= 8.5 && Number(state.excitement) < 9) {
      return { label: "PURE CHAOS", tone: "purple" };
    }

    // Insert UPSET ALERT block after PURE CHAOS
    if (
      Number.isFinite(seedGap) &&
      seedGap >= 4 &&
      winnerSide &&
      underdogSide &&
      winnerSide === underdogSide
    ) {
      return { label: "UPSET ALERT", tone: "red" };
    }

    return null;
  }

  function getNarrativeBadge(state) {
    return getGamePhase(state.espnGame.game) === "final"
      ? getFinalBadge(state)
      : getLiveBadge(state);
  }

  function renderCardFooter(state, rightText) {
    const badgeEl = state.dom.footerBadgeEl;
    const excEl = state.dom.footerExcEl;
    const excText = String(rightText || ("EXC " + ((state.excitement != null ? state.excitement : 2.5).toFixed(1))));
    const excLabel = excText.split(" • ")[0];
    const badge = getNarrativeBadge(state);

    badgeEl.textContent = "";
    badgeEl.style.background = "";
    badgeEl.style.color = "";
    badgeEl.style.border = "";
    badgeEl.style.borderRadius = "";
    badgeEl.style.padding = "";
    badgeEl.style.fontWeight = "";
    badgeEl.style.fontSize = "";
    badgeEl.style.letterSpacing = "";
    badgeEl.style.textTransform = "";
    badgeEl.style.boxShadow = "";
    badgeEl.style.display = "flex";
    badgeEl.style.alignItems = "center";

    if (badge) {
      const badgeStyles = getBadgeStyles(badge.tone);
      badgeEl.textContent = badge.label;
      badgeEl.style.background = badgeStyles.background;
      badgeEl.style.color = badgeStyles.text;
      badgeEl.style.border = `1px solid ${badgeStyles.border}`;
      badgeEl.style.borderRadius = "999px";
      badgeEl.style.padding = "2px 10px";
      badgeEl.style.fontWeight = "700";
      badgeEl.style.fontSize = "14px";
      badgeEl.style.letterSpacing = "0.02em";
      badgeEl.style.textTransform = "uppercase";
      badgeEl.style.boxShadow = "0 1px 2px rgba(0,0,0,0.06)";
      badgeEl.style.display = "inline-flex";
    }

    excEl.textContent = excLabel;
    excEl.style.background = "";
    excEl.style.color = "";
    excEl.style.fontWeight = "";
    excEl.style.padding = "";
    excEl.style.borderRadius = "";
    excEl.style.display = "";
    excEl.style.lineHeight = "";
    excEl.style.border = "";
    excEl.style.boxShadow = "";
    excEl.style.alignItems = "";
    excEl.style.justifyContent = "";
    excEl.style.minWidth = "";
    excEl.style.boxSizing = "";

    const phase = getGamePhase(state.espnGame.game);
    const exc = state.excitement;

    // Hide excitement pill before tip (upcoming games)
    if (phase === "upcoming") {
      excEl.style.display = "none";
      return;
    } else {
      excEl.style.display = "inline-flex";
    }
    const styles = getExcitementStyles(exc);
    if (styles) {
      excEl.style.background = styles.background;
      excEl.style.color = styles.text;
      excEl.style.fontWeight = "700";
      excEl.style.padding = "4px 10px";
      excEl.style.borderRadius = "999px";
      excEl.style.display = "inline-flex";
      excEl.style.alignItems = "center";
      excEl.style.justifyContent = "center";
      excEl.style.lineHeight = "1";
      excEl.style.border = `1px solid ${styles.border}`;
      excEl.style.boxShadow = "0 1px 2px rgba(0,0,0,0.06)";
      excEl.style.minWidth = "78px";
      excEl.style.boxSizing = "border-box";
    }
  }

  function isStateVisible(state) {
    return !!state?.dom?.root?.closest(".pm-section.is-active");
  }

  async function hydrateStatesInBatches(states, usedEventSlugs) {
    for (let i = 0; i < states.length; i += HYDRATE_BATCH_SIZE) {
      const batch = states.slice(i, i + HYDRATE_BATCH_SIZE);
      await Promise.all(
        batch.map(function (state) {
          return hydrateCardMarket(state, usedEventSlugs).catch(function (err) {
            console.error("Card hydrate error:", state.title, err);
          });
        })
      );
    }
  }

function getExcitementStyles(exc) {
  if (!Number.isFinite(exc)) return null;

  // Neutral pill for lower excitement so layout stays fixed
  if (exc < 6) {
    return {
      background: "#f3f3f3",
      border: "#d8d8d8",
      text: "#8c8c8c"
    };
  }

  // Normalize 6 → 10 range to 0 → 1
  const t = Math.min(1, (exc - 6) / 4);

  // Background: very pale rose → deeper accessible red
  const bgR = 255;
  const bgG = Math.round(240 - (t * 110)); // 240 → 130
  const bgB = Math.round(240 - (t * 130)); // 240 → 110

  // Border: medium red → dark red
  const borderR = 180;
  const borderG = Math.round(95 - (t * 55)); // 95 → 40
  const borderB = Math.round(95 - (t * 55)); // 95 → 40

  // Text: always dark for contrast
  const textR = 90;
  const textG = 20;
  const textB = 20;

  return {
    background: `rgb(${bgR}, ${bgG}, ${bgB})`,
    border: `rgb(${borderR}, ${borderG}, ${borderB})`,
    text: `rgb(${textR}, ${textG}, ${textB})`
  };
}

function setStatusLine(state, leftText, rightText) {
  state.dom.statusLeftEl.textContent = leftText || "";
  state.dom.statusRightEl.textContent = "";
  renderCardFooter(state, rightText);
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
      text.includes("elite 8") ||
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
    if (text.includes("elite eight") || text.includes("elite 8")) return "Elite Eight";
    if (text.includes("final four")) return "Final Four";
    if (text.includes("national championship") || text.includes("championship game")) return "National Championship";
    return null;
  }

  function getMarchMadnessRound(game) {
  const textRound = getRoundFromText(game);
  const fallback = getFallbackRoundByDate(game.date);
  const result = textRound || fallback;

  if (!result) {
    console.warn("[MISSING ROUND]", {
      game: game?.name || game?.shortName || "",
      date: game?.date || "",
      textRound: textRound,
      fallbackRound: fallback
    });
  }

  return result;
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

  const text = extractTournamentText(game);
  const looksLikeTournament =
    text.includes("ncaa tournament") ||
    text.includes("march madness") ||
    text.includes("first four") ||
    text.includes("final four") ||
    text.includes("sweet 16") ||
    text.includes("sweet sixteen") ||
    text.includes("elite eight") ||
    text.includes("elite 8") ||
    text.includes("national championship");

  if (looksLikeTournament && getFallbackRoundByDate(game?.date)) return true;

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

  async function findFreshGameAcrossDates(state, forceRefresh) {
    const baseDate = state.scoreboardDate;
    const dateCandidates = [
      baseDate,
      shiftYmd(baseDate, -1),
      shiftYmd(baseDate, 1)
    ];

    for (const scoreboardDate of dateCandidates) {
      const events = await fetchScoreboardByDate(scoreboardDate, forceRefresh);
      for (const game of events) {
        if (String(game.id) === String(state.espnGameId)) {
          if (scoreboardDate !== state.scoreboardDate) {
            console.log("[SCOREBOARD DATE SHIFT]", {
              espnGameId: state.espnGameId,
              title: state.title,
              from: state.scoreboardDate,
              to: scoreboardDate
            });
            state.scoreboardDate = scoreboardDate;
          }
          return game;
        }
      }
    }

    return null;
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
    card.dataset.hiddenNoMarket = "false";

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
            <div class="pm-score" style="min-width:22px;text-align:right;margin-right:2px;font-variant-numeric:tabular-nums;">–</div>
            <div class="pm-score-prob pm-prob-a" style="min-width:36px;text-align:right;font-variant-numeric:tabular-nums;">–%</div>
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
            <div class="pm-score" style="min-width:22px;text-align:right;margin-right:2px;font-variant-numeric:tabular-nums;">–</div>
            <div class="pm-score-prob pm-prob-b" style="min-width:36px;text-align:right;font-variant-numeric:tabular-nums;">–%</div>
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

      <div class="pm-card-footer" style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:10px;">
        <div class="pm-card-badge" style="min-height:28px;display:flex;align-items:center;"></div>
        <div class="pm-card-exc"></div>
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
      chartWrapEl: card.querySelector(".pm-chart-wrap"),
      footerBadgeEl: card.querySelector(".pm-card-badge"),
      footerExcEl: card.querySelector(".pm-card-exc")
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
    const seed1 = getPreferredSeed(t1);
    const seed2 = getPreferredSeed(t2);

    setLogo(state.dom.teamALogoEl, logo1, raw1);
    setLogo(state.dom.teamBLogoEl, logo2, raw2);
    setSeedText(state.dom.teamASeedEl, seed1);
    setSeedText(state.dom.teamBSeedEl, seed2);

    state.seedOrange = seed1 ? Number(seed1) : null;
    state.seedBlue = seed2 ? Number(seed2) : null;

    state.teamOrange = raw1;
    state.teamBlue = raw2;
    state.seedMap = {};
    rememberSeedForCard(state.seedMap, t1.team || {}, raw1, seed1);
    rememberSeedForCard(state.seedMap, t2.team || {}, raw2, seed2);

    state.dom.teamALabelEl.textContent = state.teamOrange;
    state.dom.teamBLabelEl.textContent = state.teamBlue;
    state.dom.legendOrangeLabelEl.textContent = state.teamOrange;
    state.dom.legendBlueLabelEl.textContent = state.teamBlue;
    state.dom.probAEl.textContent = "—";
    state.dom.probBEl.textContent = "—";

    renderFallbackStatus(state, game);
    setChartVisible(state, false);
  }

  function setCardHiddenNoMarket(state, hidden) {
    state.dom.root.dataset.hiddenNoMarket = hidden ? "true" : "false";
    state.dom.root.style.display = hidden ? "none" : "";
  }

  async function hydrateCardMarket(state, usedEventSlugs) {
console.log("[HYDRATE START]", state.title);
const espnGame = state.espnGame;
setCardHiddenNoMarket(state, false);

  try {
    const eventCandidates = await fetchEventCandidates(espnGame);
console.log("[EVENT CANDIDATES]", {
  title: state.title,
  count: eventCandidates.length,
  slugs: eventCandidates.map(function (e) { return e.slug; })
});
const eventData = findBestEventForEspnGame(espnGame, eventCandidates, usedEventSlugs);
    if (!eventData) {
      if (!isKnownBracketTeam(espnGame.team1) || !isKnownBracketTeam(espnGame.team2)) {
        setCardHiddenNoMarket(state, true);
      }
      return;
    }

    const market = primaryGameMarket(eventData.markets || [], espnGame);
    if (!market) {
      console.warn("⚠️ No valid market:", espnGame.title, eventData.title);
      if (!isKnownBracketTeam(espnGame.team1) || !isKnownBracketTeam(espnGame.team2)) {
        setCardHiddenNoMarket(state, true);
      }
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

    const tipTsCandidate = Math.floor(
  new Date(espnGame.game.date).getTime() / 1000
);

// Fetch 1 hour before tip so live charts have data ready
const startTsCandidate = tipTsCandidate - (60 * 60);

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

    function outcomeMatchesTeam(outcomeName, teamName) {
      const a = key(outcomeName || "");
      const b = key(teamName || "");
      return !!a && !!b && (a === b || a.includes(b) || b.includes(a));
    }

    let teamAIndex = -1;
    let teamBIndex = -1;

    for (let i = 0; i < outcomes.length; i++) {
      if (teamAIndex === -1 && outcomeMatchesTeam(outcomes[i], espnGame.team1)) teamAIndex = i;
      if (teamBIndex === -1 && outcomeMatchesTeam(outcomes[i], espnGame.team2)) teamBIndex = i;
    }

    if (teamAIndex === -1 || teamBIndex === -1 || teamAIndex === teamBIndex) {
      console.warn("⚠️ Outcome/team mapping failed:", espnGame.title, outcomes);
      return;
    }

    const teamAPrice = Number(prices[teamAIndex]);
    const teamBPrice = Number(prices[teamBIndex]);

    state.hasMarket = true;
    setCardHiddenNoMarket(state, false);
    state.title = eventData?.title || espnGame.title;
    state.marketSlug = market.slug || null;
    state.startTs = startTsCandidate;
    state.displayStartTs = tipTsCandidate;
    state.tokenOrange = tokenIds[teamAIndex];

    state.dom.probAEl.textContent = Number.isFinite(teamAPrice) ? smartRoundPct(teamAPrice) : "—";
    state.dom.probBEl.textContent = Number.isFinite(teamBPrice) ? smartRoundPct(teamBPrice) : "—";

    if (eventData.slug) usedEventSlugs.add(String(eventData.slug));

    await Promise.all([
      refreshCardChart(state),
      refreshCardScoreboard(state)
    ]);
  } finally {
    state.marketHydrationDone = true;
  }
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

  function lockChart(state, history, reason) {
    if (state.chartLocked) return;
    state.chartLocked = true;
    state.lockedHistory = Array.isArray(history) ? history.slice() : null;

    if (state.lockedHistory && state.lockedHistory.length) {
      updateChartForCard(state, state.lockedHistory);
      setChartVisible(state, true);
    }

    saveLockedChartToStorage(state);

    if (reason) {
      console.log("Chart locked", state.title, reason);
    }
  }

  function getLockedChartStorageKey(gameId) {
    return "pm_locked_chart_" + String(gameId || "");
  }

  function getLockedChartPayload(state) {
    return {
      gameId: String(state.espnGameId),
      title: state.title || "",
      savedAt: Date.now(),
      teamOrange: state.teamOrange || "",
      teamBlue: state.teamBlue || "",
      excitement: Number.isFinite(Number(state.excitement)) ? Number(state.excitement) : null,
      latestHistory: Array.isArray(state.latestHistory) ? state.latestHistory : null,
      latestDisplayHistory: Array.isArray(state.latestDisplayHistory) ? state.latestDisplayHistory : null,
      lockedHistory: state.lockedHistory
    };
  }

  function applyLockedChartPayload(state, payload) {
    const lockedHistory = Array.isArray(payload?.lockedHistory) ? payload.lockedHistory : null;
    if (!lockedHistory || !lockedHistory.length) return false;

    state.chartLocked = true;
    state.lockedHistory = lockedHistory.slice();
    state.latestHistory = Array.isArray(payload?.latestHistory) && payload.latestHistory.length
      ? payload.latestHistory
      : lockedHistory.slice();
    state.latestDisplayHistory = Array.isArray(payload?.latestDisplayHistory) && payload.latestDisplayHistory.length
      ? payload.latestDisplayHistory
      : lockedHistory.slice();

    if (Number.isFinite(Number(payload?.excitement))) {
      state.excitement = Number(payload.excitement);
    }

    updateChartForCard(state, state.lockedHistory);
    setChartVisible(state, true);
    return true;
  }

  function saveLockedChartToStorage(state) {
    if (!state || !state.espnGameId || !state.lockedHistory || !state.lockedHistory.length) return;

    try {
      localStorage.setItem(
        getLockedChartStorageKey(state.espnGameId),
        JSON.stringify(getLockedChartPayload(state))
      );
    } catch (err) {
      console.warn("Could not persist locked chart:", state.title, err);
    }
  }

  async function saveLockedChartToWorker(state) {
    if (!state || !state.espnGameId || !state.lockedHistory || !state.lockedHistory.length) return false;

    try {
      const res = await fetch(excitementWorkerBase + "/locked-chart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(getLockedChartPayload(state))
      });

      return !!res.ok;
    } catch (err) {
      console.warn("Could not persist locked chart remotely:", state.title, err);
      return false;
    }
  }

  async function saveLockedChartEverywhere(state) {
    saveLockedChartToStorage(state);
    await saveLockedChartToWorker(state);
  }

  function loadLockedChartFromStorage(state) {
    if (!state || !state.espnGameId) return false;

    try {
      const raw = localStorage.getItem(getLockedChartStorageKey(state.espnGameId));
      if (!raw) return false;

      const payload = JSON.parse(raw);
      return applyLockedChartPayload(state, payload);
    } catch (err) {
      console.warn("Could not restore locked chart:", state.title, err);
      return false;
    }
  }

  async function loadLockedChartFromWorker(state) {
    if (!state || !state.espnGameId) return false;

    try {
      const res = await fetch(
        excitementWorkerBase + "/locked-chart?gameId=" + encodeURIComponent(state.espnGameId)
      );
      if (!res.ok) return false;

      const data = await res.json();
      const payload = data?.chart || data?.lockedChart || data;
      return applyLockedChartPayload(state, payload);
    } catch (err) {
      console.warn("Could not restore locked chart remotely:", state.title, err);
      return false;
    }
  }

  async function loadLockedChartEverywhere(state) {
    if (await loadLockedChartFromWorker(state)) {
      saveLockedChartToStorage(state);
      return true;
    }
    return loadLockedChartFromStorage(state);
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
    if (!state.hasMarket || !state.tokenOrange || !state.startTs) {
      if (await loadLockedChartEverywhere(state)) {
        return;
      }
      setChartVisible(state, false);
      return;
    }

   if (state.chartLocked) {
  if (state.lockedHistory && state.lockedHistory.length) {
    updateChartForCard(state, state.lockedHistory);
    setChartVisible(state, true);
  } else if (state.chart) {
    setChartVisible(state, true);
  }
  return;
}

if (state.finished) {
  if (state.chart) {
    setChartVisible(state, true);
  }
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

console.log("[CHART FETCH]", {
  title: state.title,
  token: state.tokenOrange,
  startTs: state.startTs,
  displayStartTs: state.displayStartTs,
  now: endTs
});

const historyRes = await fetch(proxied(url)).then(r => r.json());

console.log("[CHART RESPONSE]", {
  title: state.title,
  points: historyRes?.history?.length || 0
});
    let history = Array.isArray(historyRes.history) ? historyRes.history : [];
    if (!history.length) {
      if (phase !== "upcoming") setChartVisible(state, false);
      return;
    }

    history = trimHistoryAtResolution(history);

    const latestProb = Number(history[history.length - 1].p);
    const displayStartTs = Number(state.displayStartTs || 0);
    const displayHistory = displayStartTs
      ? history.filter(function (point) {
          return Number(point.t) >= displayStartTs;
        })
      : history;

    if (Number.isFinite(latestProb)) {
      state.dom.probAEl.textContent = smartRoundPct(latestProb);
      state.dom.probBEl.textContent = smartRoundPct(1 - latestProb);
    }

    state.latestHistory = history;
    state.latestDisplayHistory = displayHistory.length ? displayHistory : history;

    if (phase !== "upcoming") {
      const excitement = getExcitementScore(displayHistory.length ? displayHistory : history, state);
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
      updateChartForCard(state, displayHistory.length ? displayHistory : history);
    }

    if (Number.isFinite(latestProb) && (latestProb >= 0.999 || latestProb <= 0.001)) {
      stopCard(state, "Resolved probability threshold reached");
    }

    await isCardMarketClosed(state);
  }

 async function refreshCardScoreboard(state) {
  try {
    console.log("[SCOREBOARD REFRESH START]", state.title);

    const freshGame = await findFreshGameAcrossDates(state, true);

    console.log("[SCOREBOARD RESULT]", {
      title: state.title,
      found: !!freshGame,
      status: freshGame?.status?.type?.state,
      date: freshGame?.date
    });

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
      const seed1Raw = getPreferredSeed(t1);
      const seed2Raw = getPreferredSeed(t2);
      const orangeIsT1 = teamMatchesDisplayName(state.teamOrange, raw1);

      const seedMap = state.seedMap || {};

      const previousSeedForRaw1 = getRememberedSeedForCard(seedMap, t1.team || {}, raw1);
      const previousSeedForRaw2 = getRememberedSeedForCard(seedMap, t2.team || {}, raw2);

      const seed1 = seed1Raw || previousSeedForRaw1 || "";
      const seed2 = seed2Raw || previousSeedForRaw2 || "";

      rememberSeedForCard(seedMap, t1.team || {}, raw1, seed1);
      rememberSeedForCard(seedMap, t2.team || {}, raw2, seed2);
      state.seedMap = seedMap;

      if (orangeIsT1) {
        setLogo(state.dom.teamALogoEl, logo1, raw1);
        setLogo(state.dom.teamBLogoEl, logo2, raw2);
        setSeedText(state.dom.teamASeedEl, seed1);
        setSeedText(state.dom.teamBSeedEl, seed2);
        state.seedOrange = seed1 ? Number(seed1) : state.seedOrange;
        state.seedBlue = seed2 ? Number(seed2) : state.seedBlue;
      } else {
        setLogo(state.dom.teamALogoEl, logo2, raw2);
        setLogo(state.dom.teamBLogoEl, logo1, raw1);
        setSeedText(state.dom.teamASeedEl, seed2);
        setSeedText(state.dom.teamBSeedEl, seed1);
        state.seedOrange = seed2 ? Number(seed2) : state.seedOrange;
        state.seedBlue = seed1 ? Number(seed1) : state.seedBlue;
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
        const [summary, historicHistory] = await Promise.all([
          fetchHistoricSummary(state.espnGameId),
          fetchHistoricHistory(state.espnGameId)
        ]);

        if (await loadLockedChartEverywhere(state)) {
          if (summary && summary.finalExcitement != null) {
            state.excitement = Number(summary.finalExcitement);
          }

          if (summary && summary.finalExcitement != null) {
            setStatusLine(
              state,
              "FINAL",
              "EXC " + Number(summary.finalExcitement).toFixed(1) +
              " • PEAK " + Number(summary.peakExcitement || summary.finalExcitement).toFixed(1)
            );
          } else {
            const fallbackExc = state.excitement != null ? state.excitement : 2.5;
            setStatusLine(state, "FINAL", "EXC " + Number(fallbackExc).toFixed(1));
          }

          setChartVisible(state, true);
          return;
        }

        let hasHistoricChart = false;
        let finalChartSource = state.chart ? "existing-live-chart" : null;

        if (historicHistory && Array.isArray(historicHistory.snapshots) && historicHistory.snapshots.length) {
          const chartHistory = historicHistory.snapshots
            .map(function (snap) {
              return {
                t: Number(snap.historyTs || 0),
                p: Number(snap.probA)
              };
            })
            .filter(function (point) {
              return Number.isFinite(point.t) && Number.isFinite(point.p);
            });

          if (chartHistory.length) {
            let historicExcitement = getExcitementScore(chartHistory, state);
            if (historicExcitement === null && chartHistory.length >= 3) {
              const probs = chartHistory.map(function (p) { return p.p; }).filter(Number.isFinite);
              if (probs.length >= 3) {
                let swing = 0;
                for (let i = 1; i < probs.length; i++) {
                  swing += Math.abs(probs[i] - probs[i - 1]);
                }
                historicExcitement = Number(
                  Math.min(9.5, Math.max(2.5, 2.5 + swing * 8))
                ).toFixed(1);
              }
            }

            if (historicExcitement !== null) {
              state.excitement = Number(historicExcitement);
            }

            if (!state.chart) {
              state.lastHistoryTs = chartHistory[chartHistory.length - 1].t;
              state.latestHistory = chartHistory;
              state.latestDisplayHistory = chartHistory;
              updateChartForCard(state, chartHistory);
              finalChartSource = "worker-historic-history";
            } else {
              finalChartSource = "existing-live-chart-preserved-over-worker-history";
            }

            hasHistoricChart = true;
          }
        }

        if (!hasHistoricChart && !state.chart && state.hasMarket && state.tokenOrange && state.startTs) {
          try {
            await refreshCardChart(state);
            hasHistoricChart = !!state.chart;
            if (hasHistoricChart) {
              finalChartSource = "final-live-market-fallback";
            }
          } catch (err) {
            console.error("Final chart backfill failed:", state.title, err);
          }
        } else if (!hasHistoricChart && state.chart) {
          hasHistoricChart = true;
          finalChartSource = finalChartSource || "existing-live-chart";
        }

        console.log("[FINAL CHART SOURCE]", {
          espnGameId: state.espnGameId,
          title: state.title,
          finalChartSource: finalChartSource,
          hasHistoricChart: hasHistoricChart,
          hasExistingChart: !!state.chart,
          usedWorkerHistory: finalChartSource === "worker-historic-history",
          preservedExistingChart: finalChartSource === "existing-live-chart" || finalChartSource === "existing-live-chart-preserved-over-worker-history",
          usedLiveFallback: finalChartSource === "final-live-market-fallback",
          workerSnapshotCount: historicHistory?.snapshots?.length || 0,
          lastHistoryTs: state.lastHistoryTs || null,
          excitement: state.excitement
        });

        const historyToLock =
  (Array.isArray(state.latestDisplayHistory) && state.latestDisplayHistory.length && state.latestDisplayHistory) ||
  (Array.isArray(state.latestHistory) && state.latestHistory.length && state.latestHistory) ||
  null;

if (historyToLock) {
  const shouldPersistLockedChart = !state.chartLocked;
  lockChart(state, historyToLock, "FINAL");
  if (shouldPersistLockedChart) {
    await saveLockedChartEverywhere(state);
  }
}

if (summary && summary.finalExcitement != null) {
  setStatusLine(
    state,
    "FINAL",
    "EXC " + Number(summary.finalExcitement).toFixed(1) +
    " • PEAK " + Number(summary.peakExcitement || summary.finalExcitement).toFixed(1)
  );
  setChartVisible(state, hasHistoricChart || state.hasMarket || !!state.chartLocked);
} else {
  const fallbackExc = state.excitement != null ? state.excitement : 2.5;
  setStatusLine(state, "FINAL", "EXC " + Number(fallbackExc).toFixed(1));
  setChartVisible(state, hasHistoricChart || state.hasMarket || !!state.chartLocked);
}
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
allCardStates.length = 0;

    ESPN_BRACKET_SEEDS = await fetchEspnBracketSeeds();

    const espnResults = await Promise.all(getTournamentDates().map(fetchEspnGames));
    const allEspnGames = espnResults.flat();

    const tourneyGames = allEspnGames
      .filter(function (g) {
  const game = g.game;

  console.log("[FILTER CHECK]", {
    title: g.title,
    phase: getGamePhase(game),
    roundFromText: getRoundFromText(game),
    fallbackRound: getFallbackRoundByDate(game.date),
    isTournament: isMensMarchMadnessGame(game)
  });
        

        // 🔒 HARD FILTER: only allow games where BOTH teams exist in our lookup
        const competitors = game?.competitions?.[0]?.competitors || [];
        if (competitors.length < 2) return false;

        const team1 = getTeamName(competitors[0]?.team);
        const team2 = getTeamName(competitors[1]?.team);

        const slug1 = getPolySlug(team1);
        const slug2 = getPolySlug(team2);
        const phase = getGamePhase(game);
        const isTournamentText = isMensMarchMadnessGame(game);
        const fallbackRound = getFallbackRoundByDate(game.date);

        const names = [team1, team2];
        const hasRealTeams = names.every(function (n) { return n && !/^tbd$/i.test(n); });
        const tbdCount = names.filter(function (n) { return /^tbd$/i.test(n); }).length;

        const bracketTeamCount = competitors.reduce(function (count, competitor) {
          return count + (isKnownBracketTeam(competitor?.team || {}) ? 1 : 0);
        }, 0);

        const hasAnySeed =
          getPreferredSeed(competitors[0]) ||
          getPreferredSeed(competitors[1]);

        const hasMarketLookup = !!slug1 && !!slug2;

        // Strong signal always wins.
        if (isTournamentText) {
          return true;
        }

        // No tournament date fallback = not our board.
        if (!fallbackRound) {
          return false;
        }

        // LIVE games: keep valid real matchups on tournament dates.
        if (phase === "live") {
          return hasRealTeams;
        }

        // UPCOMING games: allow future bracket games even if Polymarket lookup is not ready yet.
        if (phase === "upcoming") {
          if (hasRealTeams) {
            return bracketTeamCount === 2 || !!hasAnySeed || hasMarketLookup;
          }
          return tbdCount === 1 && bracketTeamCount >= 1;
        }

        // FINAL games: be stricter so junk completed games stay out.
        if (phase === "final") {
          return hasRealTeams && (bracketTeamCount === 2 || !!hasAnySeed || hasMarketLookup);
        }

        return false;
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

console.log("[ROUNDS PRESENT]", roundsPresent);

    buildTabs(roundsPresent);

    const usedEventSlugs = new Set();
    const statesToHydrate = [];

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

        const state = {
          title: espnGame.title,
          dom: dom,
          chart: null,
          tokenOrange: null,
          marketSlug: null,
          startTs: null,
          displayStartTs: null,
          lastHistoryTs: null,
          latestHistory: null,
          latestDisplayHistory: null,
          lockedHistory: null,
          chartLocked: false,
          lastPregameOddsRefreshAt: null,
          finished: false,
          hasMarket: false,
          marketHydrationDone: false,
          teamOrange: espnGame.team1,
          teamBlue: espnGame.team2,
          excitement: 2.5,
          seedOrange: null,
          seedBlue: null,
          seedMap: {},
          espnGame: espnGame,
          espnGameId: espnGame.espnId,
          scoreboardDate: espnGame.scoreboardDate
        };

        allCardStates.push(state);
        statesToHydrate.push(state);
        renderInitialEspnCard(state);
      }
    }

    boardMetaEl.textContent = "Showing " + tourneyGames.length + " March Madness games across " + roundsPresent.length + " rounds.";

    hydrateStatesInBatches(statesToHydrate, usedEventSlugs);
  }

  async function refreshBoard() {
    const activeStates = allCardStates.filter(s => !s.finished);
    const activeDates = [...new Set(activeStates.map(s => s.scoreboardDate))];

    const expandedDates = new Set();

    activeDates.forEach(function (date) {
      expandedDates.add(date);
      expandedDates.add(shiftYmd(date, -1));
      expandedDates.add(shiftYmd(date, 1));
    });

    await Promise.all(
      Array.from(expandedDates).map(function (date) {
        return fetchScoreboardByDate(date, true);
      })
    );

    let hasLiveVisibleGame = false;
    const now = Date.now();

    for (const state of activeStates) {
      await refreshCardScoreboard(state);

      const phase = getGamePhase(state.espnGame.game);
      const visible = isStateVisible(state);

      if (phase === "final") {
        if (!state.marketHydrationDone) {
          continue;
        }

        console.log("[FINAL STOP]", {
          espnGameId: state.espnGameId,
          title: state.title,
          hasChart: !!state.chart,
          hasMarket: state.hasMarket,
          lastHistoryTs: state.lastHistoryTs || null,
          excitement: state.excitement
        });

        if (state.hasMarket) {
          await isCardMarketClosed(state);
        }

        const fallbackExc = state.excitement != null ? state.excitement : 2.5;
        setStatusLine(state, "FINAL", "EXC " + Number(fallbackExc).toFixed(1));
        setChartVisible(state, state.hasMarket || !!state.chart || !!state.chartLocked);

        stopCard(state, "Final game - stop polling");
        continue;
      }

      if (phase === "live") {
        hasLiveVisibleGame = true;

        // Always build chart once market is ready (even if not visible)
        if (state.hasMarket && state.tokenOrange && state.startTs) {
          await refreshCardChart(state);
        }

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
                state.dom.probAEl.textContent = smartRoundPct(latestProb);
                state.dom.probBEl.textContent = smartRoundPct(1 - latestProb);
              }
            }

            state.lastPregameOddsRefreshAt = now;
          } catch (err) {
            console.error("Pregame odds refresh failed:", state.title, err);
          }
        }
      }
    }

    const nextRefresh = hasLiveVisibleGame ? 10000 : 300000;
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
