// --- GLOBAL STATE VARIABLES ---
let ALL_CLUES = []; // Stores all parsed game data from CSV
let ROUND_1_CLUES = [];
let ROUND_2_CLUES = [];
let CURRENT_ROUND = 1;
let CLUES = []; // Clues for the CURRENT round
let CATEGORIES = []; // Categories for the CURRENT round
let TEAMS = []; // Array of team objects: [{name: 'Team 1', score: 0}, ...]
let FINAL_JEOPARDY_CLUE = null;
let BOARD_STATE = []; // Array tracking which clues (by index) have been played (boolean or index of clue)
let PERFORMANCE_DATA = {}; // Tracks performance for each clue: { clueIndex: { teamIndex: 'correct'/'incorrect'/'pass' } }
let GAME_LIBRARY = []; // Stores the list of available default games from the manifest
let JUDGE_CODE = null; // Stores the secret code for judge mode
let JUDGE_MODE_ACTIVE = false; // Tracks whether judge mode view is currently active
let GAME_START_TIME = null;
let GAME_END_TIME = null;
let MARKETING_TEAM_NAMES = []; // Stores random team names from file
let DND_TEAM_NAMES = []; // Stores random D&D team names from file
let CURRENT_CLUE_INDEX = -1; // Index of the currently open clue in the CLUES array
let PENALIZED_TEAMS = []; // Array of team indices that have received a deduction for the current clue.
let AUTO_TIMER_ENABLED = false;
let AUTO_TIMER_SECONDS = 20;
let AUTO_TIMER_ID = null;

// --- CONSTANTS AND CONFIGURATION ---
const CSV_HEADER_MAP = {
    'category': 'Category',
    'value': 'Value',
    'clue': 'Clue',
    'answer': 'Answer',
    'explanation': 'Explanation',
    'mediaType': 'MediaType',
    'mediaUrl': 'MediaURL',
    'dailyDouble': 'DailyDouble',
    'round': 'Round'
};
const NORMALIZED_CSV_HEADERS = new Set(
    Object.values(CSV_HEADER_MAP).map(val => String(val).trim().toLowerCase())
);
const HEADER_REQUIRED = ['category', 'clue'];

const normalizeHeaderCell = (cell) => String(cell || '').trim().toLowerCase();

const isHeaderRow = (row) => {
    if (!Array.isArray(row)) return false;
    const normalized = row.map(normalizeHeaderCell);
    if (!HEADER_REQUIRED.every(req => normalized.includes(req))) return false;
    return normalized.some(cell => NORMALIZED_CSV_HEADERS.has(cell));
};

const findHeaderRowIndex = (data, startRow = 0) => {
    for (let i = startRow; i < data.length; i++) {
        if (isHeaderRow(data[i])) return i;
    }
    return -1;
};

/**
 * Populates the team name inputs with "Group 1", "Group 2", ... and starts the game.
 */
const useDefaultGroupNames = () => {
    const numTeams = parseInt($numTeams.value);
    for (let i = 0; i < numTeams; i++) {
        const input = document.getElementById(`team-name-input-${i}`);
        if (input) input.value = `Group ${i + 1}`;
    }
};
const MIN_TEAMS = 2;
const MAX_TEAMS = 10;
const EXPECTED_CLUES_PER_ROUND = 25;
// Lightweight formatting: convert **bold** markers to <strong> tags
const applySimpleFormatting = (text) => {
    if (typeof text !== 'string') return text;
    // If the author is already using HTML tags, don't try to transform
    if (text.includes('<') && text.includes('>')) return text;
    return text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
};

// Shared sanitizer wrapper for rich clue/answer/media HTML
const sanitizeHTML = (html) => {
    if (!window.DOMPurify) return html;
    return DOMPurify.sanitize(html, {
        ALLOWED_TAGS: [
            'b','i','em','strong','u','p','br','span','div','ul','ol','li','table','thead','tbody','tr','th','td','blockquote','code','pre','img','a'
        ],
        ALLOWED_ATTR: ['href','src','alt','title','target','rel','class','style'],
        ALLOW_DATA_ATTR: false,
        FORBID_ATTR: ['onerror','onclick','onload'],
        ALLOWED_URI_REGEXP: /^https?:/i
    });
};

const buildCategoryCounts = (clues = []) => {
    const counts = {};
    clues.forEach(clue => {
        const key = String(clue.Category || '').trim() || '<empty>';
        counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
};

const MIN_ROUND_CATEGORIES = 1;
const MAX_ROUND_CATEGORIES = 5;
const MIN_CLUES_PER_CATEGORY = 2;
const MAX_CLUES_PER_CATEGORY = 5;
const STANDARD_CATEGORIES = MAX_ROUND_CATEGORIES;
const STANDARD_CLUES_PER_CATEGORY = MAX_CLUES_PER_CATEGORY;

const buildRoundSummary = (roundNum, clues = [], structure = {}) => ({
    round: roundNum,
    total: clues.length,
    categories: buildCategoryCounts(clues),
    clueCountPerCategory: structure.clueCountPerCategory || 0,
    structureIssues: structure.structureIssues || [],
    isStandard: Boolean(structure.isStandard)
});

const describeCategoryIssues = (summary = {}) => {
    const categories = summary.categories || {};
    const expected = summary.clueCountPerCategory || 0;
    const issues = [];

    const entries = Object.entries(categories);
    if (!entries.length) {
        issues.push('No categories detected for this round.');
        return issues;
    }

    entries.forEach(([category, count]) => {
        const displayName = category || '<empty>';
        if (expected && expected !== count) {
            issues.push(`${displayName} has ${count} clues (expected ${expected}).`);
        }
    });
    return issues;
};

const renderValidationDetails = (roundSummaries = [], options = {}) => {
    if (!$setupErrorDetails) return;
    if (!roundSummaries || !roundSummaries.length) {
        $setupErrorDetails.innerHTML = '';
        $setupErrorDetails.classList.add('hidden');
        return;
    }

    const { hint, rowIssues = [] } = options;

    const rows = roundSummaries.map(summary => {
        const entries = Object.entries(summary.categories).sort(([a], [b]) => {
            if (summary.categories[b] === summary.categories[a]) {
                return (a || '').localeCompare(b || '');
            }
            return summary.categories[b] - summary.categories[a];
        });

        const formattedCategories = entries.length > 0
            ? entries.map(([category, count]) => {
                const displayName = category || '<empty>';
                const severityClass = summary.clueCountPerCategory > 0 && count === summary.clueCountPerCategory ? 'text-gray-300' : 'text-yellow-300';
                return `<span class="${severityClass}">${displayName} (${count})</span>`;
            }).join(', ')
            : '<span class="text-gray-500">No categories detected.</span>';

        const categoryCount = entries.length;
        const roundClues = summary.total;
        const detailIssues = describeCategoryIssues(summary);
        const structureIssuesMarkup = summary.structureIssues.length
            ? `<div class="text-yellow-200 text-[10px] mt-1">Layout issues: ${summary.structureIssues.join(' ')}</div>`
            : '';

        return `
            <div class="border-t border-yellow-500/40 pt-2">
                <div class="text-white font-semibold text-xs">Round ${summary.round}: ${roundClues} clue${roundClues === 1 ? '' : 's'} across ${categoryCount} categor${categoryCount === 1 ? 'y' : 'ies'}.</div>
                <div class="text-[11px] text-gray-300 flex flex-wrap gap-2 mt-1">${formattedCategories}</div>
                ${detailIssues.length ? `<div class="text-yellow-200 text-[10px] mt-1">Issues: ${detailIssues.join(' ')}</div>` : ''}
                ${structureIssuesMarkup}
            </div>`;
    }).join('');

    const rowIssueMarkup = rowIssues.length
        ? `<div class="text-[10px] text-yellow-200 mt-2">
               <div class="font-semibold">Row diagnostics</div>
               <ul class="list-disc list-inside space-y-1 mt-1">
                   ${rowIssues.map(issue => `<li>${issue}</li>`).join('')}
               </ul>
           </div>`
        : '';

    const hintMarkup = hint ? `<div class="mt-2 text-yellow-200 text-[11px]">${hint}</div>` : '';
    $setupErrorDetails.innerHTML = `
        <details open class="rounded-xl border border-yellow-500 bg-gray-900/60 p-3 text-gray-200 text-[11px]">
            <summary class="cursor-pointer font-semibold text-white">Diagnostic info</summary>
            <div class="mt-2 space-y-2">${rows}</div>
            ${rowIssueMarkup}
            ${hintMarkup}
        </details>`;
    $setupErrorDetails.classList.remove('hidden');
};

const buildRoundStructure = (clues = []) => {
    if (!clues.length) {
        return {
            valid: true,
            categoriesCount: 0,
            clueCountPerCategory: 0,
            structureIssues: [],
            isStandard: false
        };
    }

    const categoryCounts = buildCategoryCounts(clues);
    const categories = Object.keys(categoryCounts);
    const clueCounts = categories.map(cat => categoryCounts[cat]);
    const uniqueCounts = [...new Set(clueCounts)];
    const clueCountPerCategory = uniqueCounts[0] || 0;
    const issues = [];

    if (categories.length < MIN_ROUND_CATEGORIES) {
        issues.push(`Only ${categories.length} categor${categories.length === 1 ? 'y' : 'ies'} found; minimum is ${MIN_ROUND_CATEGORIES}.`);
    }
    if (categories.length > MAX_ROUND_CATEGORIES) {
        issues.push(`Found ${categories.length} categories; maximum is ${MAX_ROUND_CATEGORIES}.`);
    }

    if (uniqueCounts.length > 1) {
        issues.push('Categories must each have the same number of clues.');
    } else if (clueCountPerCategory < MIN_CLUES_PER_CATEGORY || clueCountPerCategory > MAX_CLUES_PER_CATEGORY) {
        issues.push(`Each category must have between ${MIN_CLUES_PER_CATEGORY} and ${MAX_CLUES_PER_CATEGORY} clues; found ${clueCountPerCategory}.`);
    }

    const valid = issues.length === 0;
    return {
        valid,
        categoriesCount: categories.length,
        clueCountPerCategory,
        structureIssues: issues,
        isStandard: valid && categories.length === STANDARD_CATEGORIES && clueCountPerCategory === STANDARD_CLUES_PER_CATEGORY
    };
};

const formatRoundLayoutDescription = (structure, roundNum) => {
    if (!structure || !structure.categoriesCount) {
        return `Round ${roundNum} has no categories.`;
    }
    const cluePlural = structure.clueCountPerCategory === 1 ? 'clue' : 'clues';
    const categoryPlural = structure.categoriesCount === 1 ? 'category' : 'categories';
    return `Round ${roundNum}: ${structure.categoriesCount} ${categoryPlural} × ${structure.clueCountPerCategory} ${cluePlural}`;
};

// --- DOM REFERENCES ---
const $gameTitle = document.getElementById('game-title');
const $csvFile = document.getElementById('csvFile');
const $numTeams = document.getElementById('numTeams');
const $startGameButton = document.getElementById('startGameButton');
const $setupScreen = document.getElementById('setup-screen');
const $gameBoard = document.getElementById('game-board');
const $scoreboard = document.getElementById('scoreboard');
const $clueModal = document.getElementById('clue-modal');
const $clueValueText = document.getElementById('clue-value-text');
const $clueText = document.getElementById('clue-text');
const $clueAnswer = document.getElementById('clue-answer');
const $clueMedia = document.getElementById('clue-media');
const $revealAnswerButton = document.getElementById('revealAnswerButton');
const $passClueButton = document.getElementById('passClueButton');
const $clueTimer = document.getElementById('clue-timer');
const $teamScoringButtons = document.getElementById('team-scoring-buttons');
const $downloadTemplate = document.getElementById('downloadTemplate');
const $defaultGameSelect = document.getElementById('defaultGameSelect');
const $loadDefaultGameButton = document.getElementById('loadDefaultGameButton');
const $setupMessage = document.getElementById('setup-message');
const $setupErrorDetails = document.getElementById('setup-error-details');
const $advancedEditButton = document.getElementById('advancedEditButton');
const $dailyDoubleModal = document.getElementById('daily-double-modal');
const $dailyDoubleTeamSelect = document.getElementById('dailyDoubleTeamSelect');
const $dailyDoubleWager = document.getElementById('dailyDoubleWager');
const $revealDailyDoubleClue = document.getElementById('revealDailyDoubleClue');
const $gameControlsContainer = document.getElementById('game-controls-container');
const $finishGameButton = document.getElementById('finishGameButton');
const $finalStandingsScreen = document.getElementById('final-standings-screen');
const $judgeModeContainer = document.getElementById('judge-mode-container');
const $judgeModeButton = document.getElementById('judgeModeButton');
const $judgeClueModal = document.getElementById('judge-clue-modal');
const $judgeClueValueText = document.getElementById('judge-clue-value-text');
const $judgeClueText = document.getElementById('judge-clue-text');
const $judgeClueAnswer = document.getElementById('judge-clue-answer');
const $saveGameModal = document.getElementById('save-game-modal');
const $saveGameButton = document.getElementById('saveGameButton');
const $closeSaveModalButton = document.getElementById('closeSaveModalButton');
const $saveCodeDisplay = document.getElementById('saveCodeDisplay');
const $generateSaveCodeButton = document.getElementById('generateSaveCodeButton');
const $loadPreviousGameButton = document.getElementById('loadPreviousGameButton');
const $loadGameModal = document.getElementById('load-game-modal');
const $closeLoadModalButton = document.getElementById('closeLoadModalButton');
const $loadCodeInput = document.getElementById('loadCodeInput');
const $loadGameButton = document.getElementById('loadGameButton');
const $judgeModeInfoModal = document.getElementById('judge-mode-info-modal');
const $cancelJudgeModeButton = document.getElementById('cancelJudgeModeButton');
const $proceedToJudgeModeButton = document.getElementById('proceedToJudgeModeButton');
const $uploadTipsButton = document.getElementById('uploadTipsButton');
const $uploadTipsModal = document.getElementById('upload-tips-modal');
const $customGameMenuButton = document.getElementById('customGameMenuButton');
const $customGameMenu = document.getElementById('customGameMenu');
const $googleSheetUrlInput = document.getElementById('googleSheetUrlInput');
const $loadFromGoogleSheetButton = document.getElementById('loadFromGoogleSheetButton');
const $googleSheetHelpLink = document.getElementById('googleSheetHelpLink');
const $googleSheetHelpModal = document.getElementById('google-sheet-help-modal');
const $closeGoogleSheetHelpButton = document.getElementById('closeGoogleSheetHelpButton');
const $finalJeopardyButton = document.getElementById('finalJeopardyButton');
const $newGameButton = document.getElementById('newGameButton');
const $autoTimerEnabled = document.getElementById('autoTimerEnabled');
const $autoTimerSeconds = document.getElementById('autoTimerSeconds');
const $autoTimerSecondsWrapper = document.getElementById('autoTimerSecondsWrapper');
const $colorTheme = document.getElementById('colorTheme');
const $judgeModeControls = document.getElementById('judge-mode-controls');
const $teamNameModal = document.getElementById('team-name-modal');
const $teamNameList = document.getElementById('team-name-list');
const $normalNamesButton = document.getElementById('normalNamesButton');
const $useDefaultNamesButton = document.getElementById('useDefaultNamesButton');
const $dndNamesButton = document.getElementById('dndNamesButton');
const $confirmNamesButton = document.getElementById('confirmNamesButton');
const $explainAnswerButton = document.getElementById('explainAnswerButton');

const clearFinalJeopardyStatus = () => {
    if ($finalJeopardyStatus) {
        $finalJeopardyStatus.classList.add('hidden');
        $finalJeopardyStatus.textContent = '';
        $finalJeopardyStatus.classList.remove('text-green-400', 'text-red-400', 'text-gray-300');
    }
};

const updateFinalJeopardyStatus = () => {
    if (!$finalJeopardyStatus) return;
    $finalJeopardyStatus.classList.remove('hidden');
    if (FINAL_JEOPARDY_CLUE) {
        $finalJeopardyStatus.textContent = 'Final Jeopardy is available.';
        $finalJeopardyStatus.classList.add('text-green-400');
        $finalJeopardyStatus.classList.remove('text-gray-300', 'text-red-400');
    } else {
        $finalJeopardyStatus.textContent = 'No Final Jeopardy round is configured.';
        $finalJeopardyStatus.classList.add('text-red-400');
        $finalJeopardyStatus.classList.remove('text-gray-300', 'text-green-400');
    }
};
const $finalJeopardyStatus = document.getElementById('final-jeopardy-status');
const $clueExplanation = document.getElementById('clue-explanation');
const $clueExplanationText = document.getElementById('clue-explanation-text');


// --- CSV TEMPLATE ---
// Moved to a separate file `jeopardy_template.csv` in the project root. The download handler
// will fetch this file when the user clicks "Download Template CSV".
let CSV_TEMPLATE = null; // lazily populated by downloadTemplate()


// Game library is loaded from game_library.json


// --- UTILITY FUNCTIONS ---

/**
 * Opens the regular clue modal with the clue's content.
 * @param {number} clueIndex - The index of the clue in the CLUES array.
 */
const showClueModal = () => {
    // Show Modal
    $clueModal.classList.remove('hidden');
    $clueModal.classList.add('flex');
};



/**
 * Closes the clue modal and resets its content.
 */
const closeClueModal = () => {
    $clueModal.classList.add('hidden');
    $clueModal.classList.remove('flex');
    $clueAnswer.classList.add('hidden');
    $revealAnswerButton.classList.remove('hidden');
    if ($clueExplanation) {
        $clueExplanation.classList.add('hidden');
        if ($clueExplanationText) {
            $clueExplanationText.innerHTML = '';
        }
    }
    if ($explainAnswerButton) {
        $explainAnswerButton.classList.add('hidden');
    }
    $clueMedia.innerHTML = ''; // Clear media content
    // Stop and hide any running auto-timer
    if (AUTO_TIMER_ID !== null) {
        clearInterval(AUTO_TIMER_ID);
        AUTO_TIMER_ID = null;
    }
    if ($clueTimer) {
        $clueTimer.classList.add('hidden');
        $clueTimer.classList.remove('animate-pulse', 'text-red-400');
    }
};

/**
 * Closes the Daily Double wager modal.
 */
const closeDailyDoubleModal = () => {
    $dailyDoubleModal.classList.add('hidden');
    $dailyDoubleModal.classList.remove('flex');
};

/**
 * Checks if the current round is finished and transitions to the next if applicable.
 */
const checkForRoundCompletion = () => {
    const allPlayed = CLUES.every((clue, index) => BOARD_STATE[clue.originalIndex]);
    if (!allPlayed) return;

    if (CURRENT_ROUND === 1 && ROUND_2_CLUES.length > 0) {
        CURRENT_ROUND = 2;
        alert("Round 1 is complete! Starting Double Jeopardy!");
        // Reset game board for the new round
        CLUES = ROUND_2_CLUES;
        CATEGORIES = [...new Set(CLUES.map(clue => clue.Category))];
        renderBoard();
    } else {
        // Game is over
        showFinalStandings();
    }
};

/**
 * Marks a clue as played on the board and updates the state.
 * @param {number} clueIndex - The index of the clue in the CLUES array.
 */
const markClueAsPlayed = (clueIndex) => {
    BOARD_STATE[clueIndex] = true;
    const tile = document.getElementById(`clue-tile-${clueIndex}`);
    if (tile) {
        tile.classList.add('played');
        tile.classList.remove('jeopardy-blue');
        tile.textContent = ''; // Clear dollar amount
        tile.onclick = null; // Disable further clicks
    }

    // Check for completion after a brief delay to allow UI to update
    setTimeout(checkForRoundCompletion, 100);
    saveGameStateToSession();
};

/**
 * Updates the scoreboard display in the DOM.
 */
const updateScoreboard = () => {
    // Clear previous content and styles
    $scoreboard.innerHTML = '';
    $scoreboard.className = 'mb-2'; // Reset class list

    const numTeams = TEAMS.length;
    let gridCols = numTeams;
    if (numTeams >= 5 && numTeams <= 8) {
        gridCols = 4; // Use 4 columns for 5-8 teams
    } else if (numTeams > 8) {
        gridCols = 5; // Use 5 columns for 9-10 teams
    }

    // Apply grid styling
    $scoreboard.classList.add('grid', 'gap-4');
    $scoreboard.style.gridTemplateColumns = `repeat(${gridCols}, minmax(0, 1fr))`;

    TEAMS.forEach((team, index) => {
        const scoreClass = team.score >= 0 ? 'text-green-400' : 'text-red-400';
        const teamCard = document.createElement('div');
        teamCard.className = `p-4 rounded-xl shadow-lg score-card`;
        const displayName = team.name && String(team.name).trim() ? team.name : `Team ${index + 1}`;
        teamCard.innerHTML = `
                    <p class="text-gray-300 font-semibold text-sm">${displayName}</p>
                    <p class="text-2xl font-bold ${scoreClass}">${team.score.toLocaleString()}</p>
                `;
        $scoreboard.appendChild(teamCard);
    });

    // This function is now only for the scoreboard itself. Button visibility is handled in startGame.
    saveGameStateToSession();
};

/**
 * Renders the Jeopardy game board grid.
 */
const renderBoard = (isJudgeMode = false) => {
    if (CLUES.length === 0) return;

    $gameBoard.innerHTML = '';
    $gameBoard.style.setProperty('--num-categories', CATEGORIES.length);

    const numCluesPerCategory = CLUES.length > 0 ? CLUES.length / CATEGORIES.length : 0;

    // 1. Create Category Headers
    CATEGORIES.forEach(category => {
        const header = document.createElement('div');
        header.className = 'jeopardy-blue text-center p-3 font-extrabold text-xl rounded-lg shadow-lg uppercase tracking-wide';
        header.textContent = category;
        $gameBoard.appendChild(header);
    });

    // 2. Create Clue Tiles (row by row, category by category)
    for (let i = 0; i < numCluesPerCategory; i++) {
        CATEGORIES.forEach((category, catIndex) => {
            // Calculate the correct index for a column-major fill
            const clueIndex = (catIndex * numCluesPerCategory) + i;

            // Check if clue index exists (safety check)
            if (!CLUES[clueIndex]) {
                console.error(`Missing clue at index ${clueIndex} (Cat ${catIndex}, Row ${i})`);
                return;
            }

            const clue = CLUES[clueIndex];

            const tile = document.createElement('div');
            tile.id = `clue-tile-${clue.originalIndex}`;
            tile.className = 'jeopardy-tile jeopardy-blue text-center p-4 font-black text-3xl rounded-lg';
            // Ensure Value is a number before formatting
            tile.textContent = `$${Number(clue.Value).toLocaleString()}`;

            if (BOARD_STATE[clue.originalIndex]) {
                tile.classList.add('played');
                tile.classList.remove('jeopardy-blue');
                tile.textContent = '';
                tile.onclick = null; // Disable future clicks
            } else {
                if (isJudgeMode) {
                    tile.onclick = () => openJudgeClue(clueIndex);
                } else {
                    tile.onclick = () => openClue(clueIndex);
                }
            }
            $gameBoard.appendChild(tile);
        });
    }

    $gameBoard.classList.remove('hidden');
};

/**
 * Renders the dynamic team scoring buttons in the clue modal.
 * This is called when the clue opens OR when a penalty is applied.
 */
const renderScoringButtons = () => {
    $teamScoringButtons.innerHTML = '';

    // Safety check
    if (CURRENT_CLUE_INDEX === -1) return;

    const value = Number(CLUES[CURRENT_CLUE_INDEX].Value);

    // Render per-team selection: None / Add / Subtract
    TEAMS.forEach((team, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'p-2 bg-gray-800 rounded flex flex-col items-center';

        const displayName = team.name && String(team.name).trim() ? team.name : `Team ${index + 1}`;
        const label = document.createElement('div');
        label.className = 'text-sm text-gray-300 mb-2';
        label.textContent = displayName;

        const select = document.createElement('select');
        select.className = 'bg-gray-700 text-white rounded p-2 w-full';
        select.id = `score-select-${index}`;

        const optNone = document.createElement('option'); optNone.value = 'none'; optNone.text = 'No Change';
        const optAdd = document.createElement('option'); optAdd.value = 'add'; optAdd.text = `Add (+${value})`;
        const optSub = document.createElement('option'); optSub.value = 'subtract'; optSub.text = `Subtract (-${value})`;

        select.appendChild(optNone);
        select.appendChild(optAdd);
        select.appendChild(optSub);

        wrapper.appendChild(label);
        wrapper.appendChild(select);

        $teamScoringButtons.appendChild(wrapper);
    });

    // Confirm / Reset Buttons
    const controls = document.createElement('div');
    controls.className = 'col-span-full flex justify-center gap-3 mt-4';

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg';
    confirmBtn.textContent = 'Confirm Scoring';
    confirmBtn.onclick = () => applyConfirmedScoring();

    const resetBtn = document.createElement('button');
    resetBtn.className = 'bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg';
    resetBtn.textContent = 'Reset Selections';
    resetBtn.onclick = () => {
        TEAMS.forEach((_, i) => {
            const sel = document.getElementById(`score-select-${i}`);
            if (sel) sel.value = 'none';
        });
    };

    controls.appendChild(confirmBtn);
    controls.appendChild(resetBtn);
    $teamScoringButtons.appendChild(controls);
};

/**
 * Applies the selections made in the scoring UI and finalizes the clue.
 */
const applyConfirmedScoring = () => {
    if (CURRENT_CLUE_INDEX === -1) return;
    const value = Number(CLUES[CURRENT_CLUE_INDEX].Value);

    TEAMS.forEach((team, index) => {
        if (!PERFORMANCE_DATA[CLUES[CURRENT_CLUE_INDEX].originalIndex]) {
            PERFORMANCE_DATA[CLUES[CURRENT_CLUE_INDEX].originalIndex] = {};
        }

        const sel = document.getElementById(`score-select-${index}`);
        if (!sel) return;
        const v = sel.value;
        if (v === 'add') {
            team.score += value;
            PERFORMANCE_DATA[CLUES[CURRENT_CLUE_INDEX].originalIndex][index] = 'Correct';
        } else if (v === 'subtract') {
            team.score -= value;
            PERFORMANCE_DATA[CLUES[CURRENT_CLUE_INDEX].originalIndex][index] = 'Incorrect';
        } else {
            PERFORMANCE_DATA[CLUES[CURRENT_CLUE_INDEX].originalIndex][index] = 'Did not guess';
        }
    });

    updateScoreboard();
    // Mark clue as played and close modal
    markClueAsPlayed(CLUES[CURRENT_CLUE_INDEX].originalIndex);
    closeClueModal();
    CURRENT_CLUE_INDEX = -1;
    PENALIZED_TEAMS = [];
};

/**
 * Handles point adjustments for teams.
 * @param {string} action - 'correct' or 'incorrect'.
 * @param {number} teamIndex - The index of the team.
 */
const handleScore = (action, teamIndex) => {
    const clue = CLUES[CURRENT_CLUE_INDEX];
    // Ensure value is a number, handling potential parsing errors
    const value = parseInt(clue.Value);

    if (isNaN(value) || value <= 0) {
        console.error("Invalid clue value:", clue.Value);
        return;
    }

    if (action === 'correct') {
        // CORRECT: Closes the clue, marks as played, and applies points.
        TEAMS[teamIndex].score += value;
        updateScoreboard();
        markClueAsPlayed(CLUES[CURRENT_CLUE_INDEX].originalIndex);
        closeClueModal();
        CURRENT_CLUE_INDEX = -1;
        PENALIZED_TEAMS = []; // Reset penalties globally
    } else if (action === 'incorrect') {
        // INCORRECT: Keeps the clue open, applies penalty once.

        // Prevent re-penalizing if the team is already on the penalized list
        if (PENALIZED_TEAMS.includes(teamIndex)) return;

        TEAMS[teamIndex].score -= value;

        // Track the penalty
        PENALIZED_TEAMS.push(teamIndex);

        updateScoreboard();
        renderScoringButtons(); // Rerender to disable the team's 'Incorrect' button

        // IMPORTANT: The modal stays open, the tile remains un-marked.
    }
};
/**
 * Extracts the src URL from a full iframe embed code string.
 * @param {string} iframeString - The full HTML <iframe> tag.
 * @returns {string} - The extracted URL, or the original string if not an iframe.
 */
const extractSrcFromIframe = (iframeString) => {
    if (typeof iframeString !== 'string' || !iframeString.trim().startsWith('<iframe')) {
        return iframeString; // Not an iframe, return original string
    }

    // Use a simple regex to find the src attribute value
    const match = iframeString.match(/src="([^"]+)"/);
    if (match && match[1]) {
        // The URL might have HTML-encoded ampersands, decode them
        return match[1].replace(/&amp;/g, '&');
    }
    return iframeString; // Fallback
};

/**
 * Converts a standard YouTube embed URL to its privacy-enhanced 'youtube-nocookie.com' equivalent.
 * @param {string} url - The video embed URL.
 * @returns {string} - The corrected URL.
 */
const useYouTubeNoCookie = (url) => {
    // Prefer the standard youtube.com embed host to avoid origin/auth issues
    if (url.includes('youtube-nocookie.com/embed/')) {
        return url.replace('youtube-nocookie.com/embed/', 'youtube.com/embed/');
    }
    if (url.includes('youtube.com/embed/')) {
        return url;
    }
    return url;
};

/**
 * Ensure the YouTube IFrame API is loaded. Returns a Promise that resolves when YT is ready.
 */
const ensureYouTubeAPI = (() => {
    let promise = null;
    return () => {
        if (window.YT && window.YT.Player) return Promise.resolve();
        if (promise) return promise;

        promise = new Promise((resolve, reject) => {
            // Create global callback for API ready
            window.onYouTubeIframeAPIReady = () => {
                resolve();
            };
            const tag = document.createElement('script');
            tag.src = 'https://www.youtube.com/iframe_api';
            tag.onerror = (e) => reject(e);
            document.head.appendChild(tag);
        });

        return promise;
    };
})();

/**
 * Append a debug panel to the clue modal showing iframe src and any player error details.
 * @param {Object} info
 */
const showVideoDebug = (info = {}) => {
    try {
        let debug = document.getElementById('clue-video-debug');
        if (!debug) {
            debug = document.createElement('pre');
            debug.id = 'clue-video-debug';
            debug.className = 'text-xs text-gray-400 mt-3 p-2 bg-gray-800 rounded';
            $clueMedia.appendChild(debug);
        }
        debug.textContent = JSON.stringify(info, null, 2);
    } catch (e) {
        console.error('Error showing video debug:', e);
    }
};

/**
 * Show a friendly error banner in the clue modal when a video cannot be played.
 * Provides a suggested action (open on YouTube) and a short explanation.
 * @param {{iframeSrc?:string, videoData?:Object, event?:Object}} info
 */
const showFriendlyVideoError = (info = {}) => {
    try {
        // Remove any previous friendly error
        let err = document.getElementById('clue-video-error');
        if (!err) {
            err = document.createElement('div');
            err.id = 'clue-video-error';
            err.className = 'mt-3 p-3 rounded bg-red-900 text-white text-sm';
            $clueMedia.appendChild(err);
        }

        const videoId = info?.videoData?.video_id || (info?.iframeSrc || '').match(/embed\/([a-zA-Z0-9_-]{11})/)?.[1] || '';
        const errorCode = info?.videoData?.errorCode || (info?.event && info.event.data) || 'unknown';

        let reason = 'This video cannot be played in the embedded player.';
        if (errorCode === 'auth' || String(errorCode) === '101' || String(errorCode) === '150') {
            reason = 'Embedding for this video is disabled or requires authentication (private/age-restricted/blocked).';
        }

        err.innerHTML = `
                    <strong>Video unavailable</strong>
                    <div class="mt-2">${reason}</div>
                    <div class="mt-2">You can try opening the video on YouTube:</div>
                    <div class="mt-2"><a id="clue-open-youtube" class="underline text-yellow-300" target="_blank" rel="noopener">Open on YouTube</a></div>
                `;

        const openLink = document.getElementById('clue-open-youtube');
        if (openLink) {
            if (videoId) {
                openLink.href = `https://www.youtube.com/watch?v=${videoId}`;
            } else if (info?.iframeSrc) {
                // Fallback: if iframe src includes an embed, try to reconstruct watch URL
                const m = (info.iframeSrc || '').match(/embed\/([a-zA-Z0-9_-]{11})/);
                openLink.href = m ? `https://www.youtube.com/watch?v=${m[1]}` : (info.iframeSrc || '#');
            } else {
                openLink.href = '#';
            }
        }
    } catch (e) {
        console.error('Error showing friendly video error:', e);
    }
};

/**
 * Normalize common video URL formats into proper embed URLs for YouTube and Vimeo.
 * - Accepts full iframe markup, standard watch URLs, short youtu.be URLs, and embed URLs.
 * - Converts YouTube URLs to the privacy-enhanced youtube-nocookie embed URL.
 * @param {string} url - The raw MediaURL string from CSV or pasted iframe/src.
 * @returns {string} - A cleaned embed URL suitable for an <iframe> src.
 */
const normalizeMediaUrl = (url) => {
    if (!url || typeof url !== 'string') return url;

    let s = url.trim();

    // If full iframe was pasted, extract the src first
    if (s.startsWith('<iframe')) {
        s = extractSrcFromIframe(s);
    }

    try {
        // If it already contains an embed path, just convert to standard youtube host where appropriate
        if (s.includes('youtube.com/embed/')) {
            s = useYouTubeNoCookie(s);
            return s;
        }

        // Try using the URL API for robust parsing (handles youtu.be with query params)
        try {
            const parsed = new URL(s);
            const host = parsed.hostname || '';

            // Short share URL: https://youtu.be/VIDEO_ID (may include query params like ?si=...)
            if (host === 'youtu.be' || host.endsWith('.youtu.be')) {
                const vid = parsed.pathname.replace(/^\//, '').split('/')[0];
                if (vid) return `https://www.youtube.com/embed/${vid}`;
            }

            // Full youtube URL: check for ?v=VIDEO_ID
            if (host.includes('youtube.com')) {
                const v = parsed.searchParams.get('v');
                if (v) return `https://www.youtube.com/embed/${v}`;
            }
        } catch (e) {
            // fall back to regex parsing below
        }

        // YouTube watch URL fallback via regex: https://www.youtube.com/watch?v=VIDEO_ID
        const ytWatch = s.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
        if (ytWatch && ytWatch[1]) {
            return `https://www.youtube.com/embed/${ytWatch[1]}`;
        }

        // youtu.be short URL fallback via regex
        const ytShort = s.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
        if (ytShort && ytShort[1]) {
            return `https://www.youtube.com/embed/${ytShort[1]}`;
        }

        // Vimeo share URL or embed id
        const vimeoMatch = s.match(/vimeo\.com\/(?:video\/)?([0-9]+)/);
        if (vimeoMatch && vimeoMatch[1]) {
            return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
        }

        // If none matched, return original (it might already be a valid embed URL)
        return s;
    } catch (e) {
        console.error('Error normalizing media URL:', e, url);
        return url;
    }
};

/**
 * Opens the modal to display the selected clue.
 * @param {number} clueIndex - The index of the clue to open.
 */
const openClue = (clueIndex) => {
      const clue = CLUES[clueIndex];
      CURRENT_CLUE_INDEX = clueIndex;
    PENALIZED_TEAMS = []; // Reset penalty tracking for new clue
    if ($clueExplanation) {
        $clueExplanation.classList.add('hidden');
    }
    if ($clueExplanationText) {
        $clueExplanationText.innerHTML = '';
    }
    if ($explainAnswerButton) {
        $explainAnswerButton.classList.add('hidden');
    }

      $clueValueText.textContent = `$${clue.Value.toLocaleString()}`;
  
      // Use .innerHTML with sanitization to allow for rich HTML content in clues and answers.
    if (window.DOMPurify) {
        $clueText.innerHTML = sanitizeHTML(applySimpleFormatting(clue.Clue));
        $clueAnswer.querySelector('span').innerHTML = sanitizeHTML(applySimpleFormatting(clue.Answer));
      } else {
          // Fallback if DOMPurify fails to load
          $clueText.textContent = clue.Clue;
          $clueAnswer.querySelector('span').textContent = clue.Answer;
      }

    // Handle Media Display
    populateClueMedia(clue);

    // Start auto timer if enabled
    if (AUTO_TIMER_ENABLED && AUTO_TIMER_SECONDS > 0 && $clueTimer) {
        let remaining = AUTO_TIMER_SECONDS;
        $clueTimer.textContent = `${remaining}`;
        $clueTimer.classList.remove('hidden', 'animate-pulse', 'text-red-400');
        $clueTimer.classList.add('block', 'text-yellow-300');

        if (AUTO_TIMER_ID !== null) {
            clearInterval(AUTO_TIMER_ID);
        }
        AUTO_TIMER_ID = setInterval(() => {
            remaining -= 1;
            if (remaining > 0) {
                $clueTimer.textContent = `${remaining}`;
            } else {
                clearInterval(AUTO_TIMER_ID);
                AUTO_TIMER_ID = null;
                $clueTimer.textContent = "TIME'S UP!";
                $clueTimer.classList.remove('text-yellow-300');
                $clueTimer.classList.add('text-red-400', 'animate-pulse');
                // Hide after 2 seconds
                setTimeout(() => {
                    if ($clueTimer) {
                        $clueTimer.classList.add('hidden');
                        $clueTimer.classList.remove('animate-pulse', 'text-red-400');
                    }
                }, 2000);
            }
        }, 1000);
    }

    // Check if it's a Daily Double
    if (clue.DailyDouble && clue.DailyDouble.toLowerCase() === 'yes') {
        openDailyDoubleWagerModal(clueIndex);
    } else {
        // It's a regular clue, show the modal immediately
        renderScoringButtons();
        showClueModal();
    }
};

/**
 * Opens the simplified modal for Judge Mode, showing question and answer.
 * @param {number} clueIndex - The index of the clue to open.
 */
  const openJudgeClue = (clueIndex) => {
      const clue = CLUES[clueIndex];
      $judgeClueValueText.textContent = `${clue.Category} - $${clue.Value.toLocaleString()}`;
  
      // Use .innerHTML with sanitization for rich content in Judge Mode as well.
      if (window.DOMPurify) {
          $judgeClueText.innerHTML = sanitizeHTML(applySimpleFormatting(clue.Clue));
          $judgeClueAnswer.querySelector('span').innerHTML = sanitizeHTML(applySimpleFormatting(clue.Answer));
      } else {
          $judgeClueText.textContent = clue.Clue;
          $judgeClueAnswer.querySelector('span').textContent = clue.Answer;
      }

    // Re-use the media population logic, but target the judge modal's media container
    populateClueMedia(clue, document.getElementById('judge-clue-media'));

    $judgeClueModal.classList.remove('hidden');
    $judgeClueModal.classList.add('flex');
};

/**
 * Updates the wager input constraints based on the selected team's score.
 */
const updateWagerInput = () => {
    const teamIndex = parseInt($dailyDoubleTeamSelect.value);
    if (isNaN(teamIndex) || !TEAMS[teamIndex]) return;

    const team = TEAMS[teamIndex];    
    const maxWager = Math.max(team.score, 0);

    $dailyDoubleWager.max = maxWager; // Set the max attribute for browser validation
    $dailyDoubleWager.placeholder = `Enter wager (max: $${maxWager.toLocaleString()})`;
};


/**
 * Opens the modal for the host to enter a Daily Double wager.
 * @param {number} clueIndex The index of the clue.
 */
const openDailyDoubleWagerModal = (clueIndex) => {
    // Populate team dropdown
    $dailyDoubleTeamSelect.innerHTML = '';
    TEAMS.forEach((team, index) => {
        const option = document.createElement('option');
        option.value = index;
        const displayName = team.name && String(team.name).trim() ? team.name : `Team ${index + 1}`;
        option.textContent = `${displayName} (Score: ${team.score})`;
        $dailyDoubleTeamSelect.appendChild(option);
    });

    // Set up dynamic wager validation
    updateWagerInput();
    $dailyDoubleTeamSelect.onchange = updateWagerInput;

    // Clear previous wager
    $dailyDoubleWager.value = '';

    // Show the wager modal
    $dailyDoubleModal.classList.remove('hidden');
    $dailyDoubleModal.classList.add('flex');

    // Set up the button to reveal the clue *after* wager is set
    $revealDailyDoubleClue.onclick = () => {
        const teamIndex = parseInt($dailyDoubleTeamSelect.value);
        const wager = parseInt($dailyDoubleWager.value);
        const team = TEAMS[teamIndex];

        // Basic validation
        const maxWager = Math.max(team.score, 0);
        if (isNaN(wager) || wager < 0 || wager > maxWager) {
            // A wager can be $0.
            alert(`Invalid wager. Must be between $0 and $${maxWager.toLocaleString()}.`);
            return;
        }

        closeDailyDoubleModal();
        // Overwrite the clue's value display with the wager amount
        $clueValueText.textContent = `Wager: $${wager.toLocaleString()}`;
        renderDailyDoubleScoring(teamIndex, wager);
        showClueModal(); // Now show the actual clue
    };
};

/**
 * Replaces the standard scoring buttons with Daily Double 'Correct'/'Incorrect' buttons.
 * @param {number} teamIndex The index of the team that wagered.
 * @param {number} wager The amount wagered.
 */
const renderDailyDoubleScoring = (teamIndex, wager) => {
    $teamScoringButtons.innerHTML = '';
    const team = TEAMS[teamIndex];
    const displayName = team.name && String(team.name).trim() ? team.name : `Team ${teamIndex + 1}`;

    const wrapper = document.createElement('div');
    wrapper.className = 'col-span-full flex flex-col items-center gap-3';
    wrapper.innerHTML = `<p class="text-white text-lg">${displayName} wagered <span class="font-bold text-yellow-400">$${wager.toLocaleString()}</span></p>`;

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'flex gap-4';

    const correctBtn = document.createElement('button');
    correctBtn.className = 'bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded-lg';
    correctBtn.textContent = 'Correct';
    correctBtn.onclick = () => {
        if (!PERFORMANCE_DATA[CLUES[CURRENT_CLUE_INDEX].originalIndex]) {
            PERFORMANCE_DATA[CLUES[CURRENT_CLUE_INDEX].originalIndex] = {};
        }
        PERFORMANCE_DATA[CLUES[CURRENT_CLUE_INDEX].originalIndex][teamIndex] = 'Correct';
        team.score += wager;
        finalizeClue();
    };

    const incorrectBtn = document.createElement('button');
    incorrectBtn.className = 'bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-lg';
    incorrectBtn.textContent = 'Incorrect';
    incorrectBtn.onclick = () => {
        if (!PERFORMANCE_DATA[CLUES[CURRENT_CLUE_INDEX].originalIndex]) {
            PERFORMANCE_DATA[CLUES[CURRENT_CLUE_INDEX].originalIndex] = {};
        }
        PERFORMANCE_DATA[CLUES[CURRENT_CLUE_INDEX].originalIndex][teamIndex] = 'Incorrect';
        team.score -= wager;
        finalizeClue();
    };

    buttonContainer.appendChild(correctBtn);
    buttonContainer.appendChild(incorrectBtn);
    wrapper.appendChild(buttonContainer);
    $teamScoringButtons.appendChild(wrapper);
};

/**
 * Populates the media container in the clue modal based on the clue's data.
 * @param {object} clue The clue object.
 */
const populateClueMedia = (clue, mediaContainer = $clueMedia) => {
    if (!mediaContainer) return;
    mediaContainer.innerHTML = '';
    const mediaType = clue.MediaType ? clue.MediaType.toLowerCase() : 'text';
    let mediaUrl = clue.MediaURL;

    if (mediaType === 'image' && mediaUrl) {
        // Use an empty image source with an onerror fallback
        mediaContainer.innerHTML = `<img src="${mediaUrl}" alt="Visual Clue" class="object-contain" onerror="this.onerror=null;this.src='https://placehold.co/400x200/cc0000/fff?text=Error:+Image+URL';" />`;
    } else if (mediaType === 'video' && mediaUrl) {

        // --- VIDEO FIXES APPLIED HERE ---
        // Normalize common URL formats (watch?v=, youtu.be, iframe code) to proper embed URLs
        let cleanUrl = normalizeMediaUrl(mediaUrl);

        // Ensure YouTube embeds include useful params to avoid related-video previews
        // and provide an origin & enablejsapi (needed for some videos that require auth checks).
        if (cleanUrl.includes('youtube-nocookie.com') || cleanUrl.includes('youtube.com/embed/')) {
            try {
                const [base, query] = cleanUrl.split('?');
                const params = new URLSearchParams(query || '');
                if (!params.has('rel')) params.set('rel', '0');
                if (!params.has('autoplay')) params.set('autoplay', '0');
                if (!params.has('playsinline')) params.set('playsinline', '1');
                // Enable JS API to allow origin-based auth when needed
                if (!params.has('enablejsapi')) params.set('enablejsapi', '1');
                // Ensure origin is present (use current page origin)
                try { params.set('origin', location.origin); } catch (e) { /* ignore */ }
                cleanUrl = `${base}?${params.toString()}`;
            } catch (e) {
                // Fallback: conservatively append params if parsing fails
                if (!cleanUrl.includes('?')) {
                    cleanUrl += '?rel=0&autoplay=0&enablejsapi=1&playsinline=1';
                } else {
                    if (!/[?&]rel=/.test(cleanUrl)) cleanUrl += '&rel=0';
                    if (!/[?&]autoplay=/.test(cleanUrl)) cleanUrl += '&autoplay=0';
                    if (!/[?&]enablejsapi=/.test(cleanUrl)) cleanUrl += '&enablejsapi=1';
                    if (!/[?&]playsinline=/.test(cleanUrl)) cleanUrl += '&playsinline=1';
                }
            }
        }

        // Create iframe element so we can hook into the YouTube IFrame API for better debugging
        // Only embed trusted providers (YouTube/Vimeo). Otherwise, show a safe link.
        try {
            const u = new URL(cleanUrl);
            const host = u.hostname || '';
            const isYouTube = /youtube\.(com|nocookie\.com)$/.test(host) || host.endsWith('.youtube.com');
            const isVimeo = host === 'player.vimeo.com';
            if (isYouTube || isVimeo) {
                mediaContainer.innerHTML = ''; // clear
                const iframe = document.createElement('iframe');
                iframe.id = 'clue-video-iframe';
                iframe.src = cleanUrl;
                iframe.setAttribute('frameborder', '0');
                iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
                iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
                iframe.setAttribute('allowfullscreen', '');
                iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
                iframe.style.width = '100%';
                iframe.style.aspectRatio = '16 / 9';
                mediaContainer.appendChild(iframe);
            } else {
                const a = document.createElement('a');
                a.href = cleanUrl;
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                a.textContent = 'Open media link in a new tab';
                mediaContainer.appendChild(a);
            }
        } catch (e) {
            const a = document.createElement('a');
            a.href = cleanUrl;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.textContent = 'Open media link in a new tab';
            mediaContainer.appendChild(a);
        }

        // If this is a YouTube embed, try to initialize the IFrame API to capture error events
        if (/youtube\.com\/embed\//.test(cleanUrl) || /youtube-nocookie\.com/.test(cleanUrl)) {
            // Load API and attach player to get detailed onError info
            ensureYouTubeAPI().then(() => {
                try {
                    // eslint-disable-next-line no-undef
                    const player = new YT.Player(iframe.id, {
                        events: {
                            onReady: () => {
                                console.log('YouTube player ready for', cleanUrl);
                                // Check if the player reports the video as playable; if not, show friendly advice
                                try {
                                    const data = (player && typeof player.getVideoData === 'function') ? player.getVideoData() : null;
                                    if (data && data.video_id) {
                                        // If the embedded video is not playable, surface a user-friendly message
                                        // Some videos are private, age-restricted, or embedding-disabled and will show errorCode 'auth'
                                        const playable = !(data.isPlayable === false || data.errorCode);
                                        if (!playable) {
                                            showFriendlyVideoError({ iframeSrc: iframe.src, videoData: data });
                                        }
                                    }
                                } catch (e) {
                                    console.warn('Could not inspect player videoData onReady', e);
                                }
                            },
                            onError: (err) => {
                                console.error('YouTube player error event:', err);
                                // Show a small debug panel in the modal
                                showVideoDebug({
                                    message: 'YouTube player reported an error',
                                    event: err,
                                    iframeSrc: iframe.src,
                                    videoData: (player && typeof player.getVideoData === 'function') ? player.getVideoData() : null
                                });
                            }
                        }
                    });
                } catch (e) {
                    console.error('Error creating YT.Player:', e);
                }
            }).catch(err => {
                console.warn('Could not load YouTube IFrame API:', err);
            });
        }
    } else if (mediaType === 'html' && mediaUrl) {
        // Sanitize the HTML from the MediaURL column to prevent XSS attacks.
        // This allows for safe rendering of rich content like tables or formatted text.
        if (window.DOMPurify) {
            mediaContainer.innerHTML = sanitizeHTML(mediaUrl);
        } else {
            mediaContainer.textContent = mediaUrl;
        }
    }
};

/**
 * A helper function to finalize a clue after scoring (used by Daily Double and Pass).
 */
const finalizeClue = () => {
    // If this is a pass, mark all teams as 'Did not guess'
    if (!PERFORMANCE_DATA[CLUES[CURRENT_CLUE_INDEX].originalIndex]) {
        PERFORMANCE_DATA[CLUES[CURRENT_CLUE_INDEX].originalIndex] = {};
        TEAMS.forEach((_, i) => PERFORMANCE_DATA[CLUES[CURRENT_CLUE_INDEX].originalIndex][i] = 'Did not guess');
    }
    markClueAsPlayed(CLUES[CURRENT_CLUE_INDEX].originalIndex);
    updateScoreboard();
    closeClueModal();
    CURRENT_CLUE_INDEX = -1;
};

// --- CSV PARSING AND GAME INITIALIZATION ---

/**
 * Processes data from CSV or default string and populates CLUES/CATEGORIES.
 * @param {Array<Object>} data - Array of row objects from Papa Parse.
 * @returns {boolean} - True if data is valid and set up.
 */
const setupClues = (data) => {
    $setupMessage.classList.add('hidden'); // Clear previous messages
    renderValidationDetails(null);
    clearFinalJeopardyStatus();

    if (!data || data.length === 0) {
        $setupMessage.textContent = "Error: CSV data is empty or invalid.";
        $setupMessage.classList.remove('hidden');
        return false;
    }

    const mappedClues = data.map((row, index) => {
        const trimmedCategory = String(row[CSV_HEADER_MAP.category] || '').trim();
        const rawRound = String(row[CSV_HEADER_MAP.round] || '').trim().toUpperCase();
        const normalizedRound = ['1', '2', 'FJ'].includes(rawRound) ? rawRound : '0';
        const isFinal = normalizedRound === 'FJ';
        const rawValue = row[CSV_HEADER_MAP.value];
        const parsedValue = isFinal
            ? (rawValue || '')
            : parseInt(String(rawValue || '').replace(/[$,]/g, ''), 10) || 0;

        const clue = {
            Category: trimmedCategory,
            Value: isFinal ? (rawValue || '') : parsedValue,
            Clue: row[CSV_HEADER_MAP.clue] || '',
            Answer: row[CSV_HEADER_MAP.answer] || '',
            Explanation: row[CSV_HEADER_MAP.explanation] || '',
            MediaType: row[CSV_HEADER_MAP.mediaType] || 'text',
            MediaURL: row[CSV_HEADER_MAP.mediaUrl] || '',
            DailyDouble: row[CSV_HEADER_MAP.dailyDouble] || 'No',
            Round: normalizedRound,
            originalIndex: index,
            sourceRow: row.__rowNumber || (index + 1)
        };

        const issues = [];
        const hasValidRound = normalizedRound !== '0';
        const hasCategory = Boolean(trimmedCategory);
        const hasValue = isFinal ? Boolean(rawValue) : Boolean(parsedValue);

        if (!hasValidRound) {
            issues.push('Round missing or invalid.');
        }
        if (!isFinal && !hasCategory) {
            issues.push('Category missing.');
        }
        if (!isFinal && !hasValue) {
            issues.push('Value missing or not a number.');
        }
        if (isFinal && !hasCategory) {
            issues.push('Final Jeopardy category missing.');
        }

        if (issues.length) {
            clue.__reason = issues.join(' ');
        }
        clue.__isPlayable = hasValidRound && (isFinal || (hasCategory && hasValue));
        return clue;
    });

    const rowIssues = mappedClues
        .filter(clue => !clue.__isPlayable)
        .map(clue => `${clue.sourceRow ? `Row ${clue.sourceRow}` : 'Unknown row'}: ${clue.__reason || 'Missing required fields.'}`);

    FINAL_JEOPARDY_CLUE = mappedClues.find(clue => clue.Round === 'FJ' && clue.__isPlayable) || null;
    const playableClues = mappedClues.filter(clue => clue.__isPlayable && clue.Round !== 'FJ');
    ALL_CLUES = playableClues;
    ALL_CLUES.forEach((clue, idx) => {
        clue.originalIndex = idx;
    });

    ROUND_1_CLUES = ALL_CLUES.filter(c => c.Round === '1');
    ROUND_2_CLUES = ALL_CLUES.filter(c => c.Round === '2');

    const roundStructures = {
        1: buildRoundStructure(ROUND_1_CLUES),
        2: buildRoundStructure(ROUND_2_CLUES)
    };

    const validationRoundSummaries = [
        buildRoundSummary(1, ROUND_1_CLUES, roundStructures[1]),
        buildRoundSummary(2, ROUND_2_CLUES, roundStructures[2]),
    ];

    const isRound1Valid = !ROUND_1_CLUES.length || roundStructures[1].valid;
    const isRound2Valid = !ROUND_2_CLUES.length || roundStructures[2].valid;

    if (!ROUND_1_CLUES.length && !ROUND_2_CLUES.length) {
        $setupMessage.textContent = "CSV Error: No valid clues for Round 1 or Round 2 were found in the file.";
        $setupMessage.classList.remove('hidden');
        renderValidationDetails(validationRoundSummaries, {
            hint: 'No clues detected for either round. Check the header row and delimiter.',
            rowIssues
        });
        return false;
    }

    if (!isRound1Valid) {
        const errorMsg = roundStructures[1].structureIssues.join(' ') || 'Round 1 layout is invalid.';
        $setupMessage.textContent = `CSV Error: ${errorMsg}`;
        $setupMessage.classList.remove('hidden');
        renderValidationDetails(validationRoundSummaries, { hint: errorMsg, rowIssues });
        return false;
    }

    if (!isRound2Valid) {
        const errorMsg = roundStructures[2].structureIssues.join(' ') || 'Round 2 layout is invalid.';
        $setupMessage.textContent = `CSV Error: ${errorMsg}`;
        $setupMessage.classList.remove('hidden');
        renderValidationDetails(validationRoundSummaries, { hint: errorMsg, rowIssues });
        return false;
    }

    const layoutWarnings = [];
    if (ROUND_1_CLUES.length && !roundStructures[1].isStandard) {
        layoutWarnings.push(formatRoundLayoutDescription(roundStructures[1], 1));
    }
    if (ROUND_2_CLUES.length && !roundStructures[2].isStandard) {
        layoutWarnings.push(formatRoundLayoutDescription(roundStructures[2], 2));
    }

    if (layoutWarnings.length) {
        const warningText = layoutWarnings.join('; ');
        const proceed = window.confirm(`This game uses a non-standard board: ${warningText}. Continue?`);
        if (!proceed) {
            $setupMessage.textContent = 'Loading canceled because the board layout does not match the classic 5×5 format.';
            $setupMessage.classList.remove('hidden');
            return false;
        }
        $setupMessage.textContent = `Confirmed layout: ${warningText}`;
        $setupMessage.classList.remove('hidden');
        $setupMessage.classList.add('text-yellow-400');
    }

    if (ROUND_1_CLUES.length > 0) {
        CURRENT_ROUND = 1;
        CLUES = ROUND_1_CLUES;
    } else {
        CURRENT_ROUND = 2;
        CLUES = ROUND_2_CLUES;
    }
    CATEGORIES = [...new Set(CLUES.map(clue => clue.Category))];

    BOARD_STATE = new Array(ALL_CLUES.length).fill(false);

    if (FINAL_JEOPARDY_CLUE) {
        $finalJeopardyButton.classList.remove('hidden');
    } else {
        $finalJeopardyButton.classList.add('hidden');
    }

    renderValidationDetails(null);
    updateFinalJeopardyStatus();
    return true;
};

/**
 * Starts the game by initializing teams and rendering the board.
 * @param {number} numTeams - The number of teams to initialize.
 * @param {Array<number>} [initialScores=[]] - Optional array of scores for loading state.
 * @param {Array<boolean>} [initialBoardState=[]] - Optional array of played status for loading state.
 */
const startGame = (numTeams, initialScores = [], initialBoardState = [], options = {}) => {
    const { preservePerformance = false, preserveStartTime = false } = options;
    if (!preservePerformance) {
        PERFORMANCE_DATA = {}; // Reset performance data for a new game
    }
    if (!preserveStartTime) {
        GAME_START_TIME = new Date();
    }
    GAME_END_TIME = null;
    JUDGE_MODE_ACTIVE = false;
    if ($judgeModeControls) {
        $judgeModeControls.classList.add('hidden');
    }

    // Initialize teams if not already configured
    if (!Array.isArray(TEAMS) || TEAMS.length !== numTeams) {
        TEAMS = Array.from({ length: numTeams }, (_, i) => ({ name: `Team ${i + 1}`, score: 0 }));
    }

    // Apply initial scores if provided
    if (Array.isArray(initialScores) && initialScores.length === TEAMS.length) {
        TEAMS.forEach((t, i) => { t.score = parseInt(initialScores[i], 10) || 0; });
    }

    // Accept an initial board state only if it matches total clues
    if (Array.isArray(initialBoardState) && initialBoardState.length === ALL_CLUES.length) {
        BOARD_STATE = initialBoardState.slice();
    } else if (!Array.isArray(BOARD_STATE) || BOARD_STATE.length !== ALL_CLUES.length) {
        BOARD_STATE = new Array(ALL_CLUES.length).fill(false);
    }

    $setupScreen.classList.add('hidden');
    $gameBoard.classList.remove('hidden');
    $gameControlsContainer.classList.remove('hidden');

    updateScoreboard();
    renderBoard();
};

/**
 * Opens a modal to allow the user to customize team names.
 */
const openTeamNameModal = () => {
    const numTeams = parseInt($numTeams.value);
    if (isNaN(numTeams) || numTeams < MIN_TEAMS || numTeams > MAX_TEAMS) {
        return;
    }

    $teamNameList.innerHTML = '';
    for (let i = 0; i < numTeams; i++) {
        const row = document.createElement('div');
        row.className = 'flex items-center gap-3';
        const label = document.createElement('label');
        label.htmlFor = `team-name-input-${i}`;
        label.className = 'text-gray-300 w-20 text-right';
        label.textContent = `Team ${i + 1}:`;

        const input = document.createElement('input');
        input.type = 'text';
        input.id = `team-name-input-${i}`;
        input.value = `Team ${i + 1}`;
        input.className = 'flex-1 bg-gray-700 text-white p-2 rounded border border-gray-600';
        input.maxLength = 32;

        row.appendChild(label);
        row.appendChild(input);
        $teamNameList.appendChild(row);
    }

    $teamNameModal.classList.remove('hidden');
    $teamNameModal.classList.add('flex');
};

/**
 * Populates the team name inputs with random names from the marketing list.
 * @param {string[]} nameSource - The array of names to draw from.
 */
const randomizeTeamNames = (nameSource) => {
    const numTeams = parseInt($numTeams.value);
    if (nameSource.length < numTeams) {
        alert('Not enough unique random names available for the number of teams selected.');
        return;
    }

    // Shuffle the array and take the first `numTeams` elements
    const shuffledNames = [...nameSource].sort(() => 0.5 - Math.random());
    const selectedNames = shuffledNames.slice(0, numTeams);

    for (let i = 0; i < numTeams; i++) {
        const input = document.getElementById(`team-name-input-${i}`);
        if (input) {
            input.value = selectedNames[i];
        }
    }
};

/**
 * Confirms the team names from the modal and starts the game.
 */
const confirmTeamNamesAndStart = () => {
    const numTeams = parseInt($numTeams.value);
    const teamNames = [];
    for (let i = 0; i < numTeams; i++) {
        const input = document.getElementById(`team-name-input-${i}`);
        teamNames.push(input.value.trim() || `Team ${i + 1}`);
    }

    // 1. Initialize the TEAMS array with the correct names.
    TEAMS = [];
    for (let i = 0; i < numTeams; i++) {
        TEAMS.push({ name: teamNames[i], score: 0 });
    }

    // 2. Start the game. It will use the TEAMS array we just created.
    if (typeof $teamNameModal !== 'undefined' && $teamNameModal) {
        $teamNameModal.classList.add('hidden');
        $teamNameModal.classList.remove('flex');
    }
    startGame(numTeams);
};

// --- FINAL JEOPARDY LOGIC ---
const $fjScreen = document.getElementById('final-jeopardy-screen');
const $fjStep1 = document.getElementById('fj-step-1-category');
const $fjStep2 = document.getElementById('fj-step-2-wager');
const $fjStep3 = document.getElementById('fj-step-3-clue');
const $fjCategoryText = document.getElementById('fj-category-text');
const $fjWagerList = document.getElementById('fj-wager-list');
const $fjClueText = document.getElementById('fj-clue-text');
const $fjAnswerContainer = document.getElementById('fj-answer-container');
const $fjAnswerText = document.getElementById('fj-answer-text');
const $fjScoringList = document.getElementById('fj-scoring-list');

const startFinalJeopardy = () => {
    if (!FINAL_JEOPARDY_CLUE) return;

    // Hide main game board and controls
    $gameBoard.classList.add('hidden');
    $gameControlsContainer.classList.add('hidden');

    // Show FJ screen and Step 1
    $fjScreen.classList.remove('hidden');
    $fjScreen.classList.add('flex');
    $fjStep1.classList.remove('hidden');
    $fjStep2.classList.add('hidden');
    $fjStep3.classList.add('hidden');

    // Populate Category (Value holds the FJ Category)
    $fjCategoryText.textContent = FINAL_JEOPARDY_CLUE.Value || '';
};

const proceedToWager = () => {
    $fjStep1.classList.add('hidden');
    $fjStep2.classList.remove('hidden');

    $fjWagerList.innerHTML = '';
    TEAMS.forEach((team, index) => {
        const maxWager = Math.max(0, team.score);
        const wagerRow = document.createElement('div');
        wagerRow.className = 'grid grid-cols-3 items-center gap-4 text-white';
        const displayName = team.name && String(team.name).trim() ? team.name : `Team ${index + 1}`;
        wagerRow.innerHTML = `
            <label for="fj-wager-${index}" class="text-lg text-right">${displayName}</label>
            <input type="number" id="fj-wager-${index}" min="0" max="${maxWager}" placeholder="Wager (max: ${maxWager.toLocaleString()})" class="col-span-2 bg-gray-700 text-white p-2 rounded border border-gray-600">
        `;
        $fjWagerList.appendChild(wagerRow);
    });
};

const lockWagersAndShowClue = () => {
    // Store wagers and validate them
    let allWagersValid = true;
    TEAMS.forEach((team, index) => {
        const input = document.getElementById(`fj-wager-${index}`);
        const wager = parseInt(input.value, 10);
        const maxWager = Math.max(0, team.score);

        if (isNaN(wager) || wager < 0 || wager > maxWager) {
            alert(`Invalid wager for ${team.name}. Please enter a number between 0 and ${maxWager}.`);
            allWagersValid = false;
        } else {
            team.wager = wager; // Store wager on the team object
        }
    });

    if (!allWagersValid) return;

    // Proceed to show clue
    $fjStep2.classList.add('hidden');
    $fjStep3.classList.remove('hidden');
    $fjAnswerContainer.classList.add('hidden');
    document.getElementById('fj-reveal-answer').classList.remove('hidden');

    $fjClueText.innerHTML = DOMPurify.sanitize(FINAL_JEOPARDY_CLUE.Clue);
};

const revealFinalAnswer = () => {
    document.getElementById('fj-reveal-answer').classList.add('hidden');
    $fjAnswerContainer.classList.remove('hidden');
    $fjAnswerText.innerHTML = DOMPurify.sanitize(FINAL_JEOPARDY_CLUE.Answer);

    // Render scoring buttons
    $fjScoringList.innerHTML = '';
    TEAMS.forEach((team, index) => {
        const displayName = team.name && String(team.name).trim() ? team.name : `Team ${index + 1}`;
        const scoringRow = document.createElement('div');
        scoringRow.className = 'flex justify-between items-center p-2 bg-gray-800 rounded';
        scoringRow.innerHTML = `
            <span class="text-white">${displayName} (Wager: $${team.wager.toLocaleString()})</span>
            <div class="flex gap-2">
                <button onclick="scoreFinalJeopardy(${index}, true)" class="bg-green-600 hover:bg-green-700 text-white font-bold py-1 px-3 rounded">Correct</button>
                <button onclick="scoreFinalJeopardy(${index}, false)" class="bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-3 rounded">Incorrect</button>
                    </div>
        `;
        $fjScoringList.appendChild(scoringRow);
    });
};

const scoreFinalJeopardy = (teamIndex, isCorrect) => {
    const team = TEAMS[teamIndex];
    if (team.fjScored) return; // Prevent scoring the same team twice

    team.score += isCorrect ? team.wager : -team.wager;
    team.fjScored = true; // Mark this team as scored
    updateScoreboard();

    // Visually disable the buttons for this team
    const buttons = $fjScoringList.children[teamIndex].querySelectorAll('button');
    buttons.forEach(b => { b.disabled = true; b.classList.add('opacity-50', 'cursor-not-allowed'); });

    // Check if all teams have been scored
    const allScored = TEAMS.every(t => t.fjScored);
    if (allScored) {
        document.getElementById('fj-finish-game').classList.remove('hidden');
    }
};

// --- JUDGE MODE LOGIC ---

/**
 * Starts the game in Judge Mode (no scores, just the board).
 */
const startJudgeMode = () => {
    JUDGE_MODE_ACTIVE = true;
    $setupScreen.classList.add('hidden');
    $gameControlsContainer.classList.add('hidden');
    $judgeModeControls.classList.remove('hidden');
    $judgeModeControls.innerHTML = ''; // Clear previous buttons

    // If there are two rounds, create toggle buttons
    if (ROUND_1_CLUES.length > 0 && ROUND_2_CLUES.length > 0) {
        const round1Button = document.createElement('button');
        round1Button.id = 'judge-round-1';
        round1Button.className = 'bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg';
        round1Button.textContent = 'View Round 1';
        round1Button.onclick = () => switchJudgeRound(1);

        const round2Button = document.createElement('button');
        round2Button.id = 'judge-round-2';
        round2Button.className = 'bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg';
        round2Button.textContent = 'View Round 2';
        round2Button.onclick = () => switchJudgeRound(2);

        $judgeModeControls.appendChild(round1Button);
        $judgeModeControls.appendChild(round2Button);
    }

    renderBoard(true); // Render the board in judge mode
};

/**
 * Switches the board view in Judge Mode between rounds.
 * @param {number} roundNum - The round number to switch to (1 or 2).
 */
const switchJudgeRound = (roundNum) => {
    CLUES = roundNum === 1 ? ROUND_1_CLUES : ROUND_2_CLUES;
    CATEGORIES = [...new Set(CLUES.map(clue => clue.Category))];
    renderBoard(true);

    // Update button styles to show which is active
    const r1Btn = document.getElementById('judge-round-1');
    const r2Btn = document.getElementById('judge-round-2');
    if (r1Btn && r2Btn) {
        r1Btn.className = `font-bold py-2 px-4 rounded-lg ${roundNum === 1 ? 'bg-blue-600 text-white' : 'bg-gray-600 text-white hover:bg-gray-700'}`;
        r2Btn.className = `font-bold py-2 px-4 rounded-lg ${roundNum === 2 ? 'bg-blue-600 text-white' : 'bg-gray-600 text-white hover:bg-gray-700'}`;
    }
};

// --- ADVANCED EDIT (Rename teams + edit scores) ---
const $advancedEditModal = document.getElementById('advanced-edit-modal');
const $advancedEditList = document.getElementById('advanced-edit-list');
const $advancedSaveButton = document.getElementById('advancedSaveButton');
const $advancedCancelButton = document.getElementById('advancedCancelButton');

const renderAdvancedEditForm = () => {
    if (!$advancedEditList) return;
    $advancedEditList.innerHTML = '';
    TEAMS.forEach((team, index) => {
        const row = document.createElement('div');
        row.className = 'flex items-center gap-3 bg-gray-800 p-3 rounded';

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.maxLength = 32;
        nameInput.value = team.name || `Team ${index + 1}`;
        nameInput.className = 'flex-1 bg-gray-700 text-white p-2 rounded border border-gray-600';
        nameInput.id = `advanced-name-${index}`;

        const scoreInput = document.createElement('input');
        scoreInput.type = 'number';
        scoreInput.value = team.score || 0;
        scoreInput.className = 'w-32 bg-gray-700 text-white p-2 rounded border border-gray-600';
        scoreInput.id = `advanced-score-${index}`;

        row.appendChild(nameInput);
        row.appendChild(scoreInput);
        $advancedEditList.appendChild(row);
    });
};

const openAdvancedEdit = () => {
    renderAdvancedEditForm();
    if ($advancedEditModal) {
        $advancedEditModal.classList.remove('hidden');
        $advancedEditModal.classList.add('flex');
    }
};

const closeAdvancedEditModal = () => {
    if ($advancedEditModal) {
        $advancedEditModal.classList.add('hidden');
        $advancedEditModal.classList.remove('flex');
    }
};

const saveAdvancedEdits = () => {
    // Read inputs and apply to TEAMS
    TEAMS.forEach((team, index) => {
        const nameEl = document.getElementById(`advanced-name-${index}`);
        const scoreEl = document.getElementById(`advanced-score-${index}`);
        if (nameEl) {
            team.name = String(nameEl.value).substring(0, 32);
        }
        if (scoreEl) {
            const s = parseInt(scoreEl.value, 10);
            team.score = isNaN(s) ? 0 : s;
        }
    });

    updateScoreboard();
    closeAdvancedEditModal();
};

// --- FINISH GAME LOGIC ---

/**
 * Renders and displays the final standings screen.
 */
const showFinalStandings = () => {
    $fjScreen.classList.add('hidden'); // Ensure Final Jeopardy screen is hidden
    GAME_END_TIME = new Date();
    // Hide all game elements
    clearSessionState();
    $gameControlsContainer.classList.add('hidden');

    // --- It's time to party! ---
    // Tiny fanfare using Web Audio API (no external audio needed)
    const _playFanfare = () => {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            const ctx = new AudioCtx();
            const now = ctx.currentTime;
            const notes = [261.63, 329.63, 392.0, 523.25]; // C, E, G, C
            notes.forEach((f, i) => {
                const o = ctx.createOscillator();
                const g = ctx.createGain();
                o.type = 'triangle';
                o.frequency.value = f;
                o.connect(g);
                g.connect(ctx.destination);
                const t = now + i * 0.12;
                g.gain.setValueAtTime(0.0001, t);
                g.gain.exponentialRampToValueAtTime(0.3, t + 0.01);
                g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
                o.start(t);
                o.stop(t + 0.32);
            });
        } catch (e) { /* ignore */ }
    };

    _playFanfare();
    if (window.confetti) {
        // A little burst from the center
        confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 }
        });
        // And a continuous rain
        const duration = 5 * 1000;
        const end = Date.now() + duration;
        (function frame() { if (Date.now() < end) { confetti({ particleCount: 2, angle: 60, spread: 55, origin: { x: 0 } }); confetti({ particleCount: 2, angle: 120, spread: 55, origin: { x: 1 } }); requestAnimationFrame(frame); } }());
    }

    // Sort teams by score in descending order
    const sortedTeams = [...TEAMS].sort((a, b) => b.score - a.score);

    const standingsList = document.getElementById('standings-list');
    const winnerContainer = document.getElementById('winner-container');
    standingsList.innerHTML = '';
    winnerContainer.innerHTML = '';

    sortedTeams.forEach((team, index) => {
        const scoreClass = team.score >= 0 ? 'text-green-400' : 'text-red-400';
        const displayName = team.name && String(team.name).trim() ? team.name : `Team ${index + 1}`;

        if (index === 0) { // The Winner
            winnerContainer.innerHTML = `
                <div class="relative bg-yellow-600 text-gray-900 p-4 rounded-lg shadow-lg">
                    <img src="https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExMHBxM3g1b2VsMnJ5NnV6NWIzaGdnYjU4YWk3dGtnNTJ3ZWFyejl6cCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/4GUSoSoFHfs4HuLPf2/giphy.gif" alt="Dancing Capybara" class="absolute -bottom-4 -right-4 w-24 h-24 opacity-80" />
                    <div class="text-2xl font-bold">🏆 WINNER 🏆</div>
                    <div class="text-4xl font-extrabold mt-2">${displayName}</div>
                    <div class="text-3xl font-bold mt-1">${team.score.toLocaleString()}</div>
                </div>
            `;
            // Replace with an even more dramatic winner card
            const _sillyTitles = [
                'Emperor of Insights',
                'Lord of Likert Scales',
                'Conqueror of Crosstabs',
                'Baron of Brand Awareness',
                'Duke of Data Hygiene',
                'Wizard of A/B-olition',
                'Sultan of Segmentation',
                'Quasi-Experimental Extraordinaire'
            ];
            const _title = _sillyTitles[Math.floor(Math.random() * _sillyTitles.length)];
            winnerContainer.innerHTML = `
                <div class="relative bg-yellow-500 text-gray-900 p-6 rounded-2xl shadow-2xl overflow-hidden">
                    <div class="absolute -top-4 -left-4 text-6xl">🎉</div>
                    <div class="absolute -top-4 -right-4 text-6xl">🎉</div>
                    <div class="absolute -bottom-4 -left-4 text-6xl">🎉</div>
                    <div class="absolute -bottom-4 -right-4 text-6xl">🎉</div>
                    <div class="text-3xl sm:text-4xl font-extrabold winner-glow text-center">ALL HAIL THE GRAND CHAMPION</div>
                    <div class="mt-2 text-center text-sm font-semibold">aka <span class="italic">${_title}</span></div>
                    <div class="mt-3 text-center relative">
                        <span class="absolute -top-8 left-1/2 -translate-x-1/2 text-5xl">👑</span>
                        <div class="text-5xl sm:text-6xl font-extrabold">${displayName}</div>
                        <div class="text-3xl sm:text-4xl font-bold mt-1">$${team.score.toLocaleString()}</div>
                    </div>
                    <img src="https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExMHBxM3g1b2VsMnJ5NnV6NWIzaGdnYjU4YWk3dGtnNTJ3ZWFyejl6cCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/4GUSoSoFHfs4HuLPf2/giphy.gif" alt="Dancing Capybara" class="capy-dance absolute -bottom-6 -right-6 w-32 h-32 opacity-90" />
                </div>
            `;
        } else { // Other teams
            standingsList.innerHTML += `
                <div class="standings-fade-in bg-gray-700 p-3 rounded-lg flex justify-between items-center">
                    <span class="text-2xl font-bold text-white">${index + 1}. ${displayName}</span>
                    <span class="text-2xl font-semibold ${scoreClass}">${team.score.toLocaleString()}</span>
                </div>
            `;
        }
    });

    $finalStandingsScreen.classList.remove('hidden');
    $finalStandingsScreen.classList.add('flex');
};

/**
 * Generates and downloads a CSV performance report.
 */
const downloadPerformanceReport = () => {
    const metaDataRows = [];
    metaDataRows.push(['Game Title', $gameTitle.textContent]);
    if (GAME_START_TIME) {
        metaDataRows.push(['Date', GAME_START_TIME.toLocaleDateString()]);
        metaDataRows.push(['Game Started', GAME_START_TIME.toLocaleTimeString()]);
    }
    if (GAME_END_TIME) {
        metaDataRows.push(['Game Ended', GAME_END_TIME.toLocaleTimeString()]);
    }
    metaDataRows.push(['Number of Teams', TEAMS.length]);

    // Main performance data headers
    const headers = ['Category', 'Value', 'Clue'];
    const teamNames = TEAMS.map((team, i) => team.name || `Team ${i + 1}`);
    headers.push(...teamNames);

    // --- Main performance data rows ---
    const allGameClues = [...ROUND_1_CLUES, ...ROUND_2_CLUES];
    if (FINAL_JEOPARDY_CLUE) {
        // Add a simplified representation for the report
        allGameClues.push({ ...FINAL_JEOPARDY_CLUE, Category: 'FINAL JEOPARDY', Value: 'N/A' });
    }

    const rows = allGameClues.map(clue => {
        const row = [
            clue.Category,
            clue.Value,
            clue.Clue.replace(/"/g, '""') // Escape double quotes in clue text
        ];

        const performance = PERFORMANCE_DATA[clue.originalIndex];
        
        teamNames.forEach((_, teamIndex) => {
            if (performance && performance[teamIndex]) {
                row.push(performance[teamIndex]);
            } else {
                row.push('Not Played');
            }
        });
        return row;
    });

    // Combine metadata and performance data into a single CSV string
    const metaCsv = metaDataRows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const performanceCsv = [headers, ...rows].map(e => e.map(cell => `"${cell}"`).join(',')).join('\n');
    const csvContent = `${metaCsv}\n\n${performanceCsv}`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "jeopardy_performance_report.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

// --- SESSION PERSISTENCE LOGIC ---

/**
 * Clears the saved game state from sessionStorage.
 */
const clearSessionState = () => {
    sessionStorage.removeItem('jeopardyGameState');
};

/**
 * Saves the current game state to sessionStorage.
 */
const saveGameStateToSession = () => {
    // Only save if a game is active (i.e., the setup screen is hidden).
    const isGameActive = $setupScreen.classList.contains('hidden');
    if (!isGameActive || TEAMS.length === 0 || ALL_CLUES.length === 0) {
        return;
    }

    try {
        const themeValue = $colorTheme ? $colorTheme.value : 'classic';
        const gameState = {
            allClues: ALL_CLUES,
            round1Clues: ROUND_1_CLUES,
            round2Clues: ROUND_2_CLUES,
            currentRound: CURRENT_ROUND,
            teams: TEAMS,
            boardState: BOARD_STATE,
            performance: PERFORMANCE_DATA,
            gameTitle: $gameTitle.textContent
        };
        if (JUDGE_CODE) {
            gameState.judgeCode = JUDGE_CODE;
        }
        gameState.judgeModeActive = JUDGE_MODE_ACTIVE;
        gameState.autoTimerEnabled = AUTO_TIMER_ENABLED;
        gameState.autoTimerSeconds = AUTO_TIMER_SECONDS;
        gameState.colorTheme = themeValue;
        gameState.gameStartTime = GAME_START_TIME ? GAME_START_TIME.toISOString() : null;
        gameState.gameEndTime = GAME_END_TIME ? GAME_END_TIME.toISOString() : null;
        sessionStorage.setItem('jeopardyGameState', JSON.stringify(gameState));
    } catch (e) {
        console.error("Could not save game state to session storage:", e);
    }
};

/**
 * Checks for and restores a game state from sessionStorage on page load.
 */
const loadGameStateFromSession = () => {
    try {
        const savedStateJSON = sessionStorage.getItem('jeopardyGameState');
        if (!savedStateJSON) return;

        const savedState = JSON.parse(savedStateJSON);

        // Restore all state variables
        ALL_CLUES = savedState.allClues;
        ROUND_1_CLUES = savedState.round1Clues;
        ROUND_2_CLUES = savedState.round2Clues;
        CURRENT_ROUND = savedState.currentRound;
        CLUES = CURRENT_ROUND === 1 ? ROUND_1_CLUES : ROUND_2_CLUES;
        CATEGORIES = [...new Set(CLUES.map(clue => clue.Category))];
        $gameTitle.textContent = savedState.gameTitle;
        PERFORMANCE_DATA = savedState.performance && typeof savedState.performance === 'object' ? savedState.performance : {};

        JUDGE_CODE = savedState.judgeCode || null;
        if (JUDGE_CODE) {
            $judgeModeContainer.classList.remove('hidden');
        } else {
            $judgeModeContainer.classList.add('hidden');
        }

        const themeValue = savedState.colorTheme || ($colorTheme ? $colorTheme.value : 'classic');
        applyTheme(themeValue);
        if ($colorTheme) {
            $colorTheme.value = themeValue;
        }

        AUTO_TIMER_ENABLED = savedState.autoTimerEnabled === true;
        if ($autoTimerEnabled) {
            $autoTimerEnabled.checked = AUTO_TIMER_ENABLED;
        }
        const parsedSeconds = parseInt(savedState.autoTimerSeconds, 10);
        if (!Number.isNaN(parsedSeconds) && parsedSeconds >= 5 && parsedSeconds <= 120) {
            AUTO_TIMER_SECONDS = parsedSeconds;
        }
        if ($autoTimerSeconds) {
            $autoTimerSeconds.value = `${AUTO_TIMER_SECONDS}`;
        }
        updateAutoTimerSecondsVisibility();

        GAME_START_TIME = savedState.gameStartTime ? new Date(savedState.gameStartTime) : null;
        GAME_END_TIME = savedState.gameEndTime ? new Date(savedState.gameEndTime) : null;
        const resumeJudgeMode = savedState.judgeModeActive && Boolean(JUDGE_CODE);

        // Start the game with the restored data
        startGame(
            savedState.teams.length,
            savedState.teams.map(t => t.score),
            savedState.boardState,
            { preservePerformance: true, preserveStartTime: true }
        );
        // Restore team names after starting
        TEAMS.forEach((team, i) => team.name = savedState.teams[i].name);
        updateScoreboard(); // Final update with correct names
        if (resumeJudgeMode) {
            startJudgeMode();
        }

    } catch (e) {
        console.error("Could not load game state from session storage:", e);
        clearSessionState(); // Clear corrupted data
    }
};

// --- LOAD HANDLERS ---

/**
 * Loads the game data from a file, parses it, and enables the start button.
 */
const loadGameFromFile = (file) => {
    clearSessionState(); // Clear previous session when loading a new file
    // Reset to default title in case the new file doesn't have one
    JUDGE_CODE = null;
    $judgeModeContainer.classList.add('hidden');

    if ($gameTitle) $gameTitle.textContent = "Dr. Baker's Marketing Jeopardy-O-Matic!";

    Papa.parse(file, {
        header: false, // We need to manually handle headers to check for a title row
        skipEmptyLines: 'greedy',
        comments: '#',
        delimiter: '', // auto-detect
        delimitersToGuess: [',', '\t', ';', '|'],
        complete: function (results) {
            const detectedDelimiter = results && results.meta ? results.meta.delimiter : undefined;
            let data = results.data;
            let headerRowIndex = -1;
            let nextRow = 0;

            // 1. Check for a custom game title in the first row
            if (data.length > 0 && data[0][0] === 'GameTitle') {
                const customTitle = data[0][1];
                if (customTitle && $gameTitle) {
                    $gameTitle.textContent = customTitle;
                }
                nextRow = 1;
            }

            // 2. Check for a Judge Code on the next line
            if (data.length > nextRow && data[nextRow][0] === 'JudgeCode') {
                JUDGE_CODE = data[nextRow][1] ? String(data[nextRow][1]).trim() : null;
                if (JUDGE_CODE) {
                    $judgeModeContainer.classList.remove('hidden');
                }
                nextRow++;
            }

            // 3. Find the actual header row
            headerRowIndex = findHeaderRowIndex(data, nextRow);
            if (headerRowIndex === -1) headerRowIndex = nextRow; // Fallback
            const headers = data[headerRowIndex];
            const clueDataRows = data.slice(headerRowIndex + 1);

            const formattedData = clueDataRows.map((row, idx) => {
                const obj = {};
                headers.forEach((header, i) => {
                    obj[header.trim()] = row[i];
                });
                obj.__rowNumber = headerRowIndex + 2 + idx;
                return obj;
            });

            // 5. Setup clues with the formatted data
            if (setupClues(formattedData)) {
                $startGameButton.disabled = false;
                $startGameButton.classList.remove('bg-gray-600', 'text-gray-400', 'cursor-not-allowed');
                $startGameButton.classList.add('bg-green-600', 'hover:bg-green-700', 'text-white');
                
                let roundInfo = '';
                if (ROUND_1_CLUES.length > 0 && ROUND_2_CLUES.length > 0) {
                    roundInfo = 'This is a 2-round game.';
                } else if (ROUND_1_CLUES.length > 0) {
                    roundInfo = 'This is a 1-round game (Round 1).';
                } else if (ROUND_2_CLUES.length > 0) {
                    roundInfo = 'This is a 1-round game (Round 2).';
                } else {
                    roundInfo = 'This is a 1-round game.';
                }

                if (FINAL_JEOPARDY_CLUE) {
                    roundInfo += ' Final Jeopardy is available.';
                }

                const delimLabel = detectedDelimiter === '\t' ? 'TAB' : (detectedDelimiter || ',');
                $setupMessage.textContent = `Game loaded successfully! ${roundInfo} Detected delimiter: ${delimLabel}.`;
                $setupMessage.classList.remove('hidden', 'text-red-400');
                $setupMessage.classList.add('text-green-400');
            } else {
                $startGameButton.disabled = true;
                $startGameButton.classList.add('bg-gray-600', 'text-gray-400', 'cursor-not-allowed');
                $startGameButton.classList.remove('bg-green-600', 'hover:bg-green-700', 'text-white');
            }
        },
        error: function (error) {
            console.error("Papa Parse Error:", error);
            $startGameButton.disabled = true;
            $setupMessage.textContent = `CSV Parsing Error: ${error.message}. Ensure the file is a valid CSV.`;
            $setupMessage.classList.remove('hidden');
        }
    });
};

/**
 * Loads the default game data string and prepares the game.
 */
const loadDefaultGame = async () => {
    clearSessionState(); // Clear previous session when loading a new game
    JUDGE_CODE = null;
    $judgeModeContainer.classList.add('hidden');

    const selectedGameKey = $defaultGameSelect.value;
    const selectedGame = GAME_LIBRARY.find(game => game.key === selectedGameKey);

    if (!selectedGame) {
        console.error("No default game selected or found.");
        return;
    }

    try {
        const response = await fetch(selectedGame.path);
        if (!response.ok) {
            throw new Error(`Failed to fetch game file: ${selectedGame.path}`);
        }
        const csvText = await response.text();

        // Reset title to default for the default game
        if ($gameTitle) $gameTitle.textContent = selectedGame.name || 'Professor Jeopardy!';

        const results = Papa.parse(csvText, {
            header: false, // Parse manually to get judge code
            skipEmptyLines: 'greedy',
            comments: '#',
            delimiter: '',
            delimitersToGuess: [',', '\t', ';', '|']
        });

    let data = results.data;
    let headerRowIndex = -1;
    let nextRow = 0;

    // Check for GameTitle on the first line
    if (data.length > nextRow && data[nextRow][0] === 'GameTitle') {
        // This is handled by the line that sets the title from the manifest, but we need to advance the row pointer
        nextRow++;
    }

    // Check for Judge Code on the next line
    if (data.length > nextRow && data[nextRow][0] === 'JudgeCode') {
        JUDGE_CODE = data[nextRow][1] ? String(data[nextRow][1]).trim() : null;
        if (JUDGE_CODE) {
            $judgeModeContainer.classList.remove('hidden');
        }
        nextRow++;
    }

    // Manually construct data objects to pass to setupClues
    headerRowIndex = findHeaderRowIndex(data, nextRow);
    if (headerRowIndex === -1) headerRowIndex = nextRow; // Fallback
    const headers = data[headerRowIndex];
    const clueDataRows = data.slice(headerRowIndex + 1);

    const formattedData = clueDataRows.map((row, idx) => {
        const obj = {};
        headers.forEach((header, i) => {
            obj[header.trim()] = row[i];
        });
        obj.__rowNumber = headerRowIndex + 2 + idx;
        return obj;
    });

    if (setupClues(formattedData)) {
        $startGameButton.disabled = false;
        $startGameButton.classList.remove('bg-gray-600', 'text-gray-400', 'cursor-not-allowed');
        $startGameButton.classList.add('bg-green-600', 'hover:bg-green-700', 'text-white');

        let roundInfo = '';
        if (ROUND_1_CLUES.length > 0 && ROUND_2_CLUES.length > 0) {
            roundInfo = 'This is a 2-round game.';
        } else if (ROUND_1_CLUES.length > 0) {
            roundInfo = 'This is a 1-round game (Round 1).';
        } else if (ROUND_2_CLUES.length > 0) {
            roundInfo = 'This is a 1-round game (Round 2).';
        } else {
            roundInfo = 'This is a 1-round game.';
        }

        if (FINAL_JEOPARDY_CLUE) {
            roundInfo += ' Final Jeopardy is available.';
        }

        const detectedDelimiter = results && results.meta ? results.meta.delimiter : undefined;
        const delimLabel = detectedDelimiter === '\t' ? 'TAB' : (detectedDelimiter || ',');
        $setupMessage.textContent = `Game loaded successfully! ${roundInfo} Detected delimiter: ${delimLabel}.`;
        $setupMessage.classList.remove('hidden', 'text-red-400');
        $setupMessage.classList.add('text-green-400');
    } else {
        $startGameButton.disabled = true;
        $startGameButton.classList.add('bg-gray-600', 'text-gray-400', 'cursor-not-allowed');
        $startGameButton.classList.remove('bg-green-600', 'hover:bg-green-700', 'text-white');
        // The detailed error message is already set by setupClues(), so we just ensure it's visible.
        $setupMessage.classList.remove('hidden', 'text-green-400');
        $setupMessage.classList.add('text-red-400');
    }
    } catch (error) {
        console.error("Error loading default game file:", error);
        $startGameButton.disabled = true;
        $setupMessage.textContent = `Error: Could not load game from library. ${error.message}`;
        $setupMessage.classList.remove('hidden');
        $setupMessage.classList.add('text-red-400');
    }
};


// --- SAVE/LOAD STATE LOGIC ---

/**
 * Generates a Base64 save code from the current game state.
 */
const generateSaveCode = () => {
    try {
        const title = $gameTitle ? $gameTitle.textContent : "Dr. Baker's Marketing Jeopardy-O-Matic!";
        const themeValue = $colorTheme ? $colorTheme.value : 'classic';
        const state = {
            version: 2,
            title,
            allClues: ALL_CLUES,
            round1Clues: ROUND_1_CLUES,
            round2Clues: ROUND_2_CLUES,
            finalJeopardy: FINAL_JEOPARDY_CLUE,
            currentRound: CURRENT_ROUND,
            boardState: Array.isArray(BOARD_STATE) ? BOARD_STATE.slice() : [],
            teams: TEAMS.map(team => ({ ...team })),
            performance: PERFORMANCE_DATA,
            judgeCode: JUDGE_CODE,
            judgeModeActive: JUDGE_MODE_ACTIVE,
            autoTimerEnabled: AUTO_TIMER_ENABLED,
            autoTimerSeconds: AUTO_TIMER_SECONDS,
            colorTheme: themeValue,
            gameStartTime: GAME_START_TIME ? GAME_START_TIME.toISOString() : null,
            gameEndTime: GAME_END_TIME ? GAME_END_TIME.toISOString() : null,
            teamCount: TEAMS.length
        };
        // Convert state to JSON, then to Base64
        const jsonState = JSON.stringify(state);
        const base64State = btoa(jsonState);
        $saveCodeDisplay.value = base64State;
        $saveCodeDisplay.select(); // Select for easy copying
    } catch (e) {
        console.error("Error generating save code:", e);
        $saveCodeDisplay.value = "Error generating code.";
    }
};

/**
 * Returns a normalized board-state array sized to the total number of clues.
 */
const buildBoardStateSnapshot = (savedBoardState, clueCount) => {
    const length = Math.max(0, Number(clueCount) || 0);
    const board = new Array(length).fill(false);
    if (Array.isArray(savedBoardState)) {
        const limit = Math.min(length, savedBoardState.length);
        for (let i = 0; i < limit; i++) {
            board[i] = Boolean(savedBoardState[i]);
        }
    }
    return board;
};

/**
 * Restores an entire game from the versioned save-state object.
 * @param {object} state
 */
const restoreGameFromFullState = (state) => {
    const fallbackTitle = "Dr. Baker's Marketing Jeopardy-O-Matic!";
    $gameTitle.textContent = state.title || fallbackTitle;

    ALL_CLUES = Array.isArray(state.allClues) ? state.allClues : [];
    ROUND_1_CLUES = Array.isArray(state.round1Clues) ? state.round1Clues : [];
    ROUND_2_CLUES = Array.isArray(state.round2Clues) ? state.round2Clues : [];
    FINAL_JEOPARDY_CLUE = state.finalJeopardy || null;

    if (ROUND_1_CLUES.length === 0 && ROUND_2_CLUES.length === 0 && ALL_CLUES.length > 0) {
        ROUND_1_CLUES = ALL_CLUES.filter(clue => String(clue.Round) === '1');
        ROUND_2_CLUES = ALL_CLUES.filter(clue => String(clue.Round) === '2');
    }
    if (!ALL_CLUES.length) {
        ALL_CLUES = [...ROUND_1_CLUES, ...ROUND_2_CLUES];
    }

    let restoredRound = Number(state.currentRound);
    if (restoredRound !== 2) restoredRound = 1;
    if (restoredRound === 1 && ROUND_1_CLUES.length === 0 && ROUND_2_CLUES.length > 0) {
        restoredRound = 2;
    } else if (restoredRound === 2 && ROUND_2_CLUES.length === 0 && ROUND_1_CLUES.length > 0) {
        restoredRound = 1;
    }
    CURRENT_ROUND = restoredRound;

    CLUES = CURRENT_ROUND === 1 ? ROUND_1_CLUES : ROUND_2_CLUES;
    if (!CLUES.length) {
        if (ROUND_1_CLUES.length) {
            CURRENT_ROUND = 1;
            CLUES = ROUND_1_CLUES;
        } else if (ROUND_2_CLUES.length) {
            CURRENT_ROUND = 2;
            CLUES = ROUND_2_CLUES;
        } else {
            CLUES = [];
        }
    }
    CATEGORIES = CLUES.length ? [...new Set(CLUES.map(clue => clue.Category))] : [];

    const totalClues = ALL_CLUES.length || (ROUND_1_CLUES.length + ROUND_2_CLUES.length);
    const boardState = buildBoardStateSnapshot(state.boardState, totalClues);

    let normalizedTeams = Array.isArray(state.teams) ? state.teams : [];
    normalizedTeams = normalizedTeams.filter(Boolean).map((team, index) => ({
        ...team,
        name: team.name && String(team.name).trim() ? String(team.name).trim() : `Team ${index + 1}`,
        score: parseInt(team.score, 10) || 0
    }));

    let teamCount = normalizedTeams.length;
    if (!teamCount) {
        const parsed = parseInt(state.teamCount, 10);
        if (!Number.isNaN(parsed) && parsed > 0) {
            teamCount = parsed;
        }
    }
    if (!teamCount) {
        teamCount = MIN_TEAMS;
    }

    if (!normalizedTeams.length) {
        normalizedTeams = Array.from({ length: teamCount }, (_, i) => ({
            name: `Team ${i + 1}`,
            score: 0
        }));
    } else if (normalizedTeams.length !== teamCount) {
        teamCount = normalizedTeams.length;
    }

    TEAMS = normalizedTeams;
    $numTeams.value = teamCount;

    PERFORMANCE_DATA = state.performance && typeof state.performance === 'object' ? state.performance : {};
    JUDGE_CODE = state.judgeCode || null;
    if (JUDGE_CODE) {
        $judgeModeContainer.classList.remove('hidden');
    } else {
        $judgeModeContainer.classList.add('hidden');
    }

    GAME_START_TIME = state.gameStartTime ? new Date(state.gameStartTime) : null;
    GAME_END_TIME = state.gameEndTime ? new Date(state.gameEndTime) : null;

    const themeValue = state.colorTheme || ($colorTheme ? $colorTheme.value : 'classic');
    applyTheme(themeValue);
    if ($colorTheme) {
        $colorTheme.value = themeValue;
    }

    AUTO_TIMER_ENABLED = state.autoTimerEnabled === true;
    if ($autoTimerEnabled) {
        $autoTimerEnabled.checked = AUTO_TIMER_ENABLED;
    }
    const parsedSeconds = parseInt(state.autoTimerSeconds, 10);
    if (!Number.isNaN(parsedSeconds) && parsedSeconds >= 5 && parsedSeconds <= 120) {
        AUTO_TIMER_SECONDS = parsedSeconds;
    }
    if ($autoTimerSeconds) {
        $autoTimerSeconds.value = `${AUTO_TIMER_SECONDS}`;
    }
    updateAutoTimerSecondsVisibility();

    const initialScores = TEAMS.map(team => team.score);
    startGame(teamCount, initialScores, boardState, { preservePerformance: true, preserveStartTime: true });
    updateScoreboard();
    const shouldResumeJudge = Boolean(state.judgeModeActive) && Boolean(JUDGE_CODE);
    if (shouldResumeJudge) {
        startJudgeMode();
    }

    if (FINAL_JEOPARDY_CLUE) {
        $finalJeopardyButton.classList.remove('hidden');
    } else {
        $finalJeopardyButton.classList.add('hidden');
    }
};

/**
 * Restores the older (pre-versioned) save codes as best as possible.
 * @param {object} state
 */
const restoreGameFromLegacyState = (state) => {
    if (!state || !Array.isArray(state.d)) {
        throw new Error("Legacy save code is missing clue data.");
    }

    const fallbackTitle = state.title || "Dr. Baker's Marketing Jeopardy-O-Matic!";
    $gameTitle.textContent = fallbackTitle;

    ALL_CLUES = state.d;
    ROUND_1_CLUES = ALL_CLUES;
    ROUND_2_CLUES = [];
    FINAL_JEOPARDY_CLUE = null;
    CURRENT_ROUND = 1;
    CLUES = ROUND_1_CLUES;
    CATEGORIES = CLUES.length ? [...new Set(CLUES.map(clue => clue.Category))] : [];

    const boardState = buildBoardStateSnapshot(state.p, ALL_CLUES.length);
    const names = Array.isArray(state.n) ? state.n : [];
    const scores = Array.isArray(state.s) ? state.s : [];
    const teamCount = Number(state.t) || names.length || scores.length || MIN_TEAMS;
    TEAMS = Array.from({ length: teamCount }, (_, i) => ({
        name: names[i] || `Team ${i + 1}`,
        score: parseInt(scores[i], 10) || 0
    }));

    PERFORMANCE_DATA = {};
    JUDGE_CODE = null;
    $judgeModeContainer.classList.add('hidden');
    $finalJeopardyButton.classList.add('hidden');
    GAME_START_TIME = null;
    GAME_END_TIME = null;
    $numTeams.value = teamCount;

    startGame(teamCount, TEAMS.map(team => team.score), boardState, { preservePerformance: true });
    updateScoreboard();
};

/**
 * Loads a game state from a Base64 save code.
 */
const loadSaveCode = () => {
    const code = $loadCodeInput.value;
    if (!code) return;

    try {
        // Convert from Base64, then parse JSON
        const jsonState = atob(code);
        const state = JSON.parse(jsonState);

        if (state.version && state.version >= 2) {
            restoreGameFromFullState(state);
            $setupMessage.textContent = 'Save code loaded successfully.';
            $setupMessage.classList.remove('hidden', 'text-red-400', 'text-yellow-300');
            $setupMessage.classList.add('text-green-400');
        } else {
            restoreGameFromLegacyState(state);
            $setupMessage.textContent = 'Legacy save code loaded (some advanced data may be missing).';
            $setupMessage.classList.remove('hidden', 'text-green-400', 'text-red-400');
            $setupMessage.classList.add('text-yellow-300');
        }

        if ($loadGameModal) {
            $loadGameModal.classList.add('hidden');
            $loadGameModal.classList.remove('flex');
        }

    } catch (e) {
        console.error("Error loading save code:", e);
        $setupMessage.textContent = "Error: Invalid or corrupt save code.";
        $setupMessage.classList.remove('hidden', 'text-green-400', 'text-yellow-300');
        $setupMessage.classList.add('text-red-400');
    }
};

/**
 * Triggers a download of the CSV template.
 */
const downloadTemplate = async () => {
    try {
        let text = CSV_TEMPLATE;
        if (!text) {
            const res = await fetch('jeopardy_template.csv');
            if (!res.ok) throw new Error('Failed to fetch template');
            text = await res.text();
            CSV_TEMPLATE = text;
        }
        const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", "jeopardy_template.csv");
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (e) {
        console.error('Error downloading template:', e);
        $setupMessage.textContent = 'Error downloading template file.';
        $setupMessage.classList.remove('hidden');
    }
};

/**
 * Triggers a download of the TSV template (tab-separated) for text-heavy authoring.
 */
const downloadTemplateTSV = async () => {
    try {
        let csvText = CSV_TEMPLATE;
        if (!csvText) {
            const res = await fetch('jeopardy_template.csv');
            if (!res.ok) throw new Error('Failed to fetch template');
            csvText = await res.text();
            CSV_TEMPLATE = csvText;
        }
        // Extract instruction lines (start with #) to append verbatim at the end
        const csvLines = csvText.split(/\r?\n/);
        const instructionLines = csvLines.filter(l => l.trim().startsWith('#'));
        // Parse the CSV template (excluding comment stripping) and re-emit as TSV
        const parsed = Papa.parse(csvText, {
            header: false,
            skipEmptyLines: 'greedy',
            comments: false,
            delimiter: ',',
        });
        const rows = parsed.data;
        const dataTsv = rows.map(r => (Array.isArray(r) ? r.map(cell => (cell == null ? '' : String(cell))).join('\t') : '')).join('\n');
        const tsv = instructionLines.length > 0 ? `${dataTsv}\n${instructionLines.join('\n')}` : dataTsv;
        const blob = new Blob([tsv], { type: 'text/tab-separated-values;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', 'jeopardy_template.tsv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (e) {
        console.error('Error downloading TSV template:', e);
        $setupMessage.textContent = 'Error downloading TSV template file.';
        $setupMessage.classList.remove('hidden');
    }
};

/**
 * Populates the default game selection dropdown.
 */
const populateDefaultGameSelector = async () => {
    if (!$defaultGameSelect) return;

    try {
        const response = await fetch('game_library.json');
        if (!response.ok) throw new Error('Could not load game library manifest.');
        
        GAME_LIBRARY = await response.json();
        
        $defaultGameSelect.innerHTML = '';
        GAME_LIBRARY.forEach(game => {
            const option = document.createElement('option');
            option.value = game.key;
            option.textContent = game.name;
            $defaultGameSelect.appendChild(option);
        });
    } catch (error) {
        console.error("Failed to populate game selector:", error);
        // Fallback to a built-in list so the UI still works when running from file://
        const FALLBACK = [
            { key: 'mkt_res_fun', name: 'Marketing Research Fundamentals', path: 'library/mkt_res_fun.csv' },
            { key: 'digital_analytics', name: 'Digital Analytics', path: 'library/digital_analytics.csv' },
            { key: 'exp_design', name: 'Experimental Design', path: 'library/exp_design.csv' },
            { key: 'qual_research', name: 'Qualitative Research', path: 'library/qual_research.csv' },
            { key: 'interpreting_results', name: 'Interpreting Results', path: 'library/interpreting_results.csv' }
        ];
        GAME_LIBRARY = FALLBACK;
        $defaultGameSelect.innerHTML = '';
        GAME_LIBRARY.forEach(game => {
            const option = document.createElement('option');
            option.value = game.key;
            option.textContent = game.name + ' (fallback)';
            $defaultGameSelect.appendChild(option);
        });
    }
};

/**
 * Fetches and parses the list of random team names.
 */
const loadMarketingTeamNames = async () => {
    try {
        const response = await fetch('groups/Marketing_Team_Names.txt');
        if (!response.ok) {
            throw new Error('Failed to fetch team name list.');
        }
        const text = await response.text();
        MARKETING_TEAM_NAMES = text.split('\n').map(name => name.trim()).filter(name => name.length > 0);
        $normalNamesButton.disabled = MARKETING_TEAM_NAMES.length === 0;
    } catch (error) {
        console.error('Could not load marketing team names:', error);
        $normalNamesButton.disabled = true;
    }
};

/**
 * Fetches and parses the list of random D&D team names.
 */
const loadDndTeamNames = async () => {
    try {
        const response = await fetch('groups/dnd_names.txt');
        if (!response.ok) { throw new Error('Failed to fetch D&D team name list.'); }
        const text = await response.text();
        DND_TEAM_NAMES = text.split('\n').map(name => name.trim()).filter(name => name.length > 0);
        $dndNamesButton.disabled = DND_TEAM_NAMES.length === 0;
    } catch (error) {
        console.error('Could not load D&D team names:', error);
        $dndNamesButton.disabled = true;
    }
};
// --- EVENT LISTENERS ---
// Setup Screen
$csvFile.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        loadGameFromFile(e.target.files[0]);
    }
});
if ($loadDefaultGameButton) $loadDefaultGameButton.addEventListener('click', loadDefaultGame);
if ($downloadTemplate) $downloadTemplate.addEventListener('click', downloadTemplate);
const $downloadTemplateTSV = document.getElementById('downloadTemplateTSV');
if ($downloadTemplateTSV) $downloadTemplateTSV.addEventListener('click', downloadTemplateTSV);
if ($loadGameButton) $loadGameButton.addEventListener('click', loadSaveCode);

if ($advancedEditButton) $advancedEditButton.addEventListener('click', openAdvancedEdit);
if ($advancedSaveButton) $advancedSaveButton.addEventListener('click', saveAdvancedEdits);
if ($advancedCancelButton) $advancedCancelButton.addEventListener('click', closeAdvancedEditModal);

if ($saveGameButton) {
    $saveGameButton.addEventListener('click', () => {
        $saveGameModal.classList.remove('hidden');
        $saveGameModal.classList.add('flex');
    });
}
if ($closeSaveModalButton) {
    $closeSaveModalButton.addEventListener('click', () => $saveGameModal.classList.add('hidden'));
}

if ($loadPreviousGameButton) $loadPreviousGameButton.addEventListener('click', () => {
    $loadGameModal.classList.remove('hidden');
    $loadGameModal.classList.add('flex');
});

if ($closeLoadModalButton) $closeLoadModalButton.addEventListener('click', () => {
    $loadGameModal.classList.add('hidden');
    $loadGameModal.classList.remove('flex');
});

if ($uploadTipsButton) {
    $uploadTipsButton.addEventListener('click', () => {
        if ($uploadTipsModal) $uploadTipsModal.classList.remove('hidden');
    });
}
if ($customGameMenuButton && $customGameMenu) {
    $customGameMenuButton.addEventListener('click', () => {
        const isHidden = $customGameMenu.classList.contains('hidden');
        if (isHidden) {
            $customGameMenu.classList.remove('hidden');
        } else {
            $customGameMenu.classList.add('hidden');
        }
    });
}

// Auto timer settings
const updateAutoTimerSecondsVisibility = () => {
    if (!$autoTimerEnabled || !$autoTimerSecondsWrapper) return;
    if ($autoTimerEnabled.checked) {
        $autoTimerSecondsWrapper.classList.remove('hidden');
    } else {
        $autoTimerSecondsWrapper.classList.add('hidden');
    }
};
if ($autoTimerEnabled) {
    $autoTimerEnabled.addEventListener('change', () => {
        AUTO_TIMER_ENABLED = $autoTimerEnabled.checked;
        updateAutoTimerSecondsVisibility();
    });
    AUTO_TIMER_ENABLED = $autoTimerEnabled.checked;
    updateAutoTimerSecondsVisibility();
}
if ($autoTimerSeconds) {
    $autoTimerSeconds.addEventListener('change', () => {
        const v = parseInt($autoTimerSeconds.value, 10);
        if (!isNaN(v) && v >= 5 && v <= 120) {
            AUTO_TIMER_SECONDS = v;
        }
    });
    const initial = parseInt($autoTimerSeconds.value, 10);
    if (!isNaN(initial) && initial >= 5 && initial <= 120) {
        AUTO_TIMER_SECONDS = initial;
    }
}

// Color theme handling
const THEME_KEYS = ['classic', 'light', 'dark', 'christmas', 'highcontrast'];
const applyTheme = (key) => {
    const theme = THEME_KEYS.includes(key) ? key : 'classic';
    const body = document.body;
    THEME_KEYS.forEach(t => body.classList.remove(`theme-${t}`));
    body.classList.add(`theme-${theme}`);
};

if ($colorTheme) {
    $colorTheme.addEventListener('change', () => {
        applyTheme($colorTheme.value);
    });
    // Apply initial theme from select value
    applyTheme($colorTheme.value || 'classic');
} else {
    // Fallback to classic theme
    applyTheme('classic');
}

// Google Sheets Help modal
if ($googleSheetHelpLink && $googleSheetHelpModal) {
    $googleSheetHelpLink.addEventListener('click', () => {
        $googleSheetHelpModal.classList.remove('hidden');
        $googleSheetHelpModal.classList.add('flex');
    });
}
if ($closeGoogleSheetHelpButton && $googleSheetHelpModal) {
    $closeGoogleSheetHelpButton.addEventListener('click', () => {
        $googleSheetHelpModal.classList.add('hidden');
        $googleSheetHelpModal.classList.remove('flex');
    });
}

// --- GOOGLE SHEETS IMPORT ---

/**
 * Normalize a Google Sheets URL (view/edit/publish) to a direct export URL (prefer TSV).
 * @param {string} rawUrl
 * @returns {string|null} normalized URL or null if invalid
 */
const normalizeGoogleSheetUrl = (rawUrl) => {
    try {
        const u = new URL(rawUrl.trim());
        if (!/docs\.google\.com$/i.test(u.hostname) && !/docs\.google\.com$/i.test(u.hostname.replace(/^www\./,''))) {
            return null;
        }
        // Try to pull gid from query or hash
        let gid = u.searchParams.get('gid') || null;
        if (!gid && u.hash && u.hash.includes('gid=')) {
            const m = u.hash.match(/gid=(\d+)/);
            if (m && m[1]) gid = m[1];
        }
        if (!gid) gid = '0';

        const parts = u.pathname.split('/').filter(Boolean);
        const idx = parts.findIndex(p => p === 'spreadsheets');
        if (idx === -1) return null;

        // Published to web: /spreadsheets/d/e/{PUBID}/pub*  -> pub?gid=&single=true&output=tsv
        if (parts[idx+1] === 'd' && parts[idx+2] === 'e' && parts[idx+3]) {
            const pubId = parts[idx+3];
            return `https://docs.google.com/spreadsheets/d/e/${pubId}/pub?gid=${gid}&single=true&output=tsv`;
        }

        // Standard doc: /spreadsheets/d/{ID}/... -> export?format=tsv&gid=
        if (parts[idx+1] === 'd' && parts[idx+2]) {
            const sheetId = parts[idx+2];
            return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=tsv&gid=${gid}`;
        }

        // If it's already an export/pub URL, nudge format to tsv
        if (u.pathname.includes('/export') || u.pathname.includes('/pub')) {
            u.searchParams.set('output', 'tsv');
            u.searchParams.set('format', 'tsv');
            if (!u.searchParams.get('gid')) u.searchParams.set('gid', gid);
            return u.toString();
        }
        return null;
    } catch {
        return null;
    }
};

/**
 * Load a Google Sheet (public) by URL, normalize to export, fetch, parse, and set up clues.
 */
const loadFromGoogleSheet = async () => {
    const link = ($googleSheetUrlInput && $googleSheetUrlInput.value) ? $googleSheetUrlInput.value.trim() : '';
    if (!link) {
        $setupMessage.textContent = 'Please paste a public Google Sheet link.';
        $setupMessage.classList.remove('hidden');
        return;
    }

    const normalized = normalizeGoogleSheetUrl(link);
    if (!normalized) {
        $setupMessage.textContent = 'Invalid Google Sheet link. Please use a public Google Sheets URL.';
        $setupMessage.classList.remove('hidden');
        return;
    }

    clearSessionState();
    JUDGE_CODE = null;
    $judgeModeContainer.classList.add('hidden');
    if ($gameTitle) $gameTitle.textContent = "Dr. Baker's Marketing Jeopardy-O-Matic!";

    try {
        const response = await fetch(normalized, { credentials: 'omit' });
        if (!response.ok) {
            // Common 403/401 when not truly public
            throw new Error(`Could not fetch. Ensure the sheet/tab is public. HTTP ${response.status}`);
        }
        const text = await response.text();

        const results = Papa.parse(text, {
            header: false,
            skipEmptyLines: 'greedy',
            comments: '#',
            delimiter: '',
            delimitersToGuess: [',', '\t', ';', '|']
        });

        let data = results.data;
        let headerRowIndex = -1;
        let nextRow = 0;

        if (data.length > 0 && data[0][0] === 'GameTitle') {
            const customTitle = data[0][1];
            if (customTitle && $gameTitle) $gameTitle.textContent = customTitle;
            nextRow = 1;
        }
        if (data.length > nextRow && data[nextRow][0] === 'JudgeCode') {
            JUDGE_CODE = data[nextRow][1] ? String(data[nextRow][1]).trim() : null;
            if (JUDGE_CODE) $judgeModeContainer.classList.remove('hidden');
            nextRow++;
        }

        headerRowIndex = findHeaderRowIndex(data, nextRow);
        if (headerRowIndex === -1) headerRowIndex = nextRow;
        const headers = data[headerRowIndex];
        const clueDataRows = data.slice(headerRowIndex + 1);

        const formattedData = clueDataRows.map((row, idx) => {
            const obj = {};
            headers.forEach((header, i) => {
                obj[header.trim()] = row[i];
            });
            obj.__rowNumber = headerRowIndex + 2 + idx;
            return obj;
        });

        if (setupClues(formattedData)) {
            $startGameButton.disabled = false;
            $startGameButton.classList.remove('bg-gray-600', 'text-gray-400', 'cursor-not-allowed');
            $startGameButton.classList.add('bg-green-600', 'hover:bg-green-700', 'text-white');

            let roundInfo = '';
            if (ROUND_1_CLUES.length > 0 && ROUND_2_CLUES.length > 0) roundInfo = 'This is a 2-round game.';
            else if (ROUND_1_CLUES.length > 0) roundInfo = 'This is a 1-round game (Round 1).';
            else if (ROUND_2_CLUES.length > 0) roundInfo = 'This is a 1-round game (Round 2).';
            else roundInfo = 'This is a 1-round game.';

            if (FINAL_JEOPARDY_CLUE) roundInfo += ' Final Jeopardy is available.';

            const detectedDelimiter = results && results.meta ? results.meta.delimiter : undefined;
            const delimLabel = detectedDelimiter === '\t' ? 'TAB' : (detectedDelimiter || ',');
            $setupMessage.textContent = `Loaded from Google Sheet! ${roundInfo} Detected delimiter: ${delimLabel}.`;
            $setupMessage.classList.remove('hidden', 'text-red-400');
            $setupMessage.classList.add('text-green-400');
        } else {
            $startGameButton.disabled = true;
            $startGameButton.classList.add('bg-gray-600', 'text-gray-400', 'cursor-not-allowed');
            $startGameButton.classList.remove('bg-green-600', 'hover:bg-green-700', 'text-white');
            $setupMessage.classList.remove('hidden', 'text-green-400');
            $setupMessage.classList.add('text-red-400');
        }
    } catch (e) {
        console.error('Error loading Google Sheet:', e);
        $startGameButton.disabled = true;
        $setupMessage.textContent = `Error: Could not load from Google Sheet. ${e.message}. Make sure the sheet (and tab) is public and the link includes the correct tab (gid).`;
        $setupMessage.classList.remove('hidden');
        $setupMessage.classList.add('text-red-400');
    }
};

// Attach after definition to avoid TDZ errors for function expressions
if ($loadFromGoogleSheetButton) $loadFromGoogleSheetButton.addEventListener('click', loadFromGoogleSheet);
const $closeUploadTipsButton = document.getElementById('closeUploadTipsButton');
if ($closeUploadTipsButton) {
    $closeUploadTipsButton.addEventListener('click', () => $uploadTipsModal.classList.add('hidden'));
}

$judgeModeButton.addEventListener('click', () => {
    $judgeModeInfoModal.classList.remove('hidden');
    $judgeModeInfoModal.classList.add('flex');
});

$cancelJudgeModeButton.addEventListener('click', () => $judgeModeInfoModal.classList.add('hidden'));

$proceedToJudgeModeButton.addEventListener('click', () => {
    $judgeModeInfoModal.classList.add('hidden');
    const enteredCode = prompt('Enter the 6-digit code for Judge Mode:');
    if (enteredCode && JUDGE_CODE && enteredCode === JUDGE_CODE) {
        startJudgeMode();
    } else if (enteredCode) {
        alert('Incorrect code.');
    }
});

$finishGameButton.addEventListener('click', () => {
    const confirmation = prompt('Are you sure you want to end the game? Type "yes" to confirm.');
    if (confirmation && confirmation.toLowerCase() === 'yes') {
        showFinalStandings();
    }
});


$startGameButton.addEventListener('click', () => {
    const numTeams = parseInt($numTeams.value);
    openTeamNameModal();
});

// Game/Save Controls
$generateSaveCodeButton.addEventListener('click', generateSaveCode);
$saveCodeDisplay.addEventListener('click', () => $saveCodeDisplay.select());

// Clue Modal
$revealAnswerButton.addEventListener('click', () => {
    $clueAnswer.classList.remove('hidden');
    $revealAnswerButton.classList.add('hidden');
    const clue = CLUES[CURRENT_CLUE_INDEX];
    const hasExplanation = clue && typeof clue.Explanation === 'string' && clue.Explanation.trim().length > 0;
    if ($explainAnswerButton) {
        if (hasExplanation) {
            $explainAnswerButton.classList.remove('hidden');
        } else {
            $explainAnswerButton.classList.add('hidden');
        }
    }
});

if ($explainAnswerButton) {
    $explainAnswerButton.addEventListener('click', () => {
        const clue = CLUES[CURRENT_CLUE_INDEX];
        if (!$clueExplanation || !$clueExplanationText || !clue || !clue.Explanation || !clue.Explanation.trim()) {
            return;
        }
        if (window.DOMPurify) {
            $clueExplanationText.innerHTML = sanitizeHTML(applySimpleFormatting(clue.Explanation));
        } else {
            $clueExplanationText.textContent = clue.Explanation;
        }
        $clueExplanation.classList.remove('hidden');
        $explainAnswerButton.classList.add('hidden');
    });
}

$passClueButton.addEventListener('click', () => {
    finalizeClue();
    PENALIZED_TEAMS = [];
});

// Team Name Modal
$normalNamesButton.addEventListener('click', () => randomizeTeamNames(MARKETING_TEAM_NAMES));
$dndNamesButton.addEventListener('click', () => randomizeTeamNames(DND_TEAM_NAMES));
$confirmNamesButton.addEventListener('click', confirmTeamNamesAndStart);
$useDefaultNamesButton.addEventListener('click', useDefaultGroupNames);
// Safer overlay close handler for team-name modal
(() => {
    const m = document.getElementById('team-name-modal');
    if (m) {
        m.addEventListener('click', (e) => {
            if (e.target === m) {
                m.classList.add('hidden');
                m.classList.remove('flex');
            }
        });
    }
})();

if ($newGameButton) {
    $newGameButton.addEventListener('click', () => {
        if (confirm('Are you sure you want to end this game and return to the setup screen? All progress will be lost.')) {
            // Clear the session state and reload the page for a guaranteed fresh start.
            clearSessionState();
            window.location.reload();
        }
    });
}

if ($finalJeopardyButton) {
    $finalJeopardyButton.addEventListener('click', () => {
        if (confirm('Are you sure you want to proceed to Final Jeopardy? The main game board will be disabled.')) {
            startFinalJeopardy();
        }
    });
}
const _fjProceed = document.getElementById('fj-proceed-to-wager');
if (_fjProceed) _fjProceed.addEventListener('click', proceedToWager);
const _fjLock = document.getElementById('fj-lock-wagers');
if (_fjLock) _fjLock.addEventListener('click', lockWagersAndShowClue);
const _fjReveal = document.getElementById('fj-reveal-answer');
if (_fjReveal) _fjReveal.addEventListener('click', revealFinalAnswer);
const _fjFinish = document.getElementById('fj-finish-game');
if (_fjFinish) _fjFinish.addEventListener('click', () => {
    // Reset the scored flag for all teams before showing standings
    TEAMS.forEach(t => t.fjScored = false);
    showFinalStandings();
});
const _dlReport = document.getElementById('downloadReportButton');
if (_dlReport) _dlReport.addEventListener('click', downloadPerformanceReport);

// --- APP INITIALIZATION ---

/**
 * Main initialization function to set up the application.
 * This should be called after the DOM is fully loaded.
 */
const initializeApp = async () => {
    // Check for a saved game from a previous session first.
    loadGameStateFromSession();

    // Asynchronously load necessary game assets.
    // Using Promise.all to load them concurrently for better performance.
    await Promise.all([
        populateDefaultGameSelector(),
        loadMarketingTeamNames(),
        loadDndTeamNames()
    ]);
};

// Wait for the DOM to be fully loaded before running the initialization.
// This prevents race conditions where scripts try to access elements that don't exist yet.
document.addEventListener('DOMContentLoaded', initializeApp);
