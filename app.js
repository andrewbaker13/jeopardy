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
let GAME_START_TIME = null;
let GAME_END_TIME = null;
let CURRENT_CLUE_INDEX = -1; // Index of the currently open clue in the CLUES array
let PENALIZED_TEAMS = []; // Array of team indices that have received a deduction for the current clue.

// --- CONSTANTS AND CONFIGURATION ---
const CSV_HEADER_MAP = {
    'category': 'Category',
    'value': 'Value',
    'clue': 'Clue',
    'answer': 'Answer',
    'mediaType': 'MediaType',
    'mediaUrl': 'MediaURL',
    'dailyDouble': 'DailyDouble',
    'round': 'Round'
};
const MIN_TEAMS = 2;
const MAX_TEAMS = 10;

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
const $teamScoringButtons = document.getElementById('team-scoring-buttons');
const $downloadTemplate = document.getElementById('downloadTemplate');
const $defaultGameSelect = document.getElementById('defaultGameSelect');
const $loadDefaultGameButton = document.getElementById('loadDefaultGameButton');
const $setupMessage = document.getElementById('setup-message');
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
const $finalJeopardyButton = document.getElementById('finalJeopardyButton');
const $newGameButton = document.getElementById('newGameButton');
const $judgeModeControls = document.getElementById('judge-mode-controls');


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
    $clueMedia.innerHTML = ''; // Clear media content
};

/**
 * Closes the Daily Double wager modal.
 */
const closeDailyDoubleModal = () => {
    $dailyDoubleModal.classList.add('hidden');
    $dailyDoubleModal.classList.remove('flex');
    $clueMedia.innerHTML = ''; // Clear media content
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
        teamCard.className = `p-4 rounded-xl shadow-lg bg-gray-700`;
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

    $clueValueText.textContent = `$${clue.Value.toLocaleString()}`;

    // Use .innerHTML with sanitization to allow for rich HTML content in clues and answers.
    if (window.DOMPurify) {
        $clueText.innerHTML = DOMPurify.sanitize(clue.Clue);
        $clueAnswer.querySelector('span').innerHTML = DOMPurify.sanitize(clue.Answer);
    } else {
        // Fallback if DOMPurify fails to load
        $clueText.textContent = clue.Clue;
        $clueAnswer.querySelector('span').textContent = clue.Answer;
    }

    // Handle Media Display
    populateClueMedia(clue);

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
        $judgeClueText.innerHTML = DOMPurify.sanitize(clue.Clue);
        $judgeClueAnswer.querySelector('span').innerHTML = DOMPurify.sanitize(clue.Answer);
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
        mediaContainer.innerHTML = ''; // clear
        const iframe = document.createElement('iframe');
        iframe.id = 'clue-video-iframe';
        iframe.src = cleanUrl;
        iframe.setAttribute('frameborder', '0');
        iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
        iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
        iframe.setAttribute('allowfullscreen', '');
        iframe.style.width = '100%';
        iframe.style.aspectRatio = '16 / 9';
        mediaContainer.appendChild(iframe);

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
            mediaContainer.innerHTML = DOMPurify.sanitize(mediaUrl);
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

    if (!data || data.length === 0) {
        $setupMessage.textContent = "Error: CSV data is empty or invalid.";
        $setupMessage.classList.remove('hidden');
        return false;
    }

    // 1. Map and sanitize all data from the CSV
    ALL_CLUES = data.map((row, index) => ({
        Category: row[CSV_HEADER_MAP.category] || '',
        // For Final Jeopardy, the 'Value' is the category name (a string). Otherwise, it's a number.
        Value: String(row[CSV_HEADER_MAP.round]).toUpperCase() === 'FJ'
            ? row[CSV_HEADER_MAP.value] || ''
            : parseInt(String(row[CSV_HEADER_MAP.value]).replace(/[$,]/g, '')) || 0,
        Clue: row[CSV_HEADER_MAP.clue] || '',
        Answer: row[CSV_HEADER_MAP.answer] || '',
        MediaType: row[CSV_HEADER_MAP.mediaType] || 'text',
        MediaURL: row[CSV_HEADER_MAP.mediaUrl] || '',
        DailyDouble: row[CSV_HEADER_MAP.dailyDouble] || 'No',
        Round: String(row[CSV_HEADER_MAP.round]).toUpperCase() || '0',
        originalIndex: index // Keep track of the original position for BOARD_STATE
    })).filter(clue => (clue.Value && clue.Category) || clue.Round === 'FJ'); // Keep valid clues or FJ

    // Find and store the Final Jeopardy clue separately
    FINAL_JEOPARDY_CLUE = ALL_CLUES.find(c => c.Round === 'FJ') || null;
    ALL_CLUES = ALL_CLUES.filter(c => c.Round !== 'FJ');
    
    // 2. Separate clues into rounds
    ROUND_1_CLUES = ALL_CLUES.filter(c => c.Round === '1');
    ROUND_2_CLUES = ALL_CLUES.filter(c => c.Round === '2');

    // 3. Validate the rounds
    const isRound1Valid = ROUND_1_CLUES.length === 25 || ROUND_1_CLUES.length === 0;
    const isRound2Valid = ROUND_2_CLUES.length === 25 || ROUND_2_CLUES.length === 0;

    // Helper function to find category count issues
    const findCategoryErrors = (clues, roundNum) => {
        if (clues.length === 0) return null;
        const categoryCounts = clues.reduce((acc, clue) => {
            const cat = clue.Category.trim(); // Use trimmed category name
            acc[cat] = (acc[cat] || 0) + 1;
            return acc;
        }, {});

        const categories = Object.keys(categoryCounts);
        if (categories.length !== 5) {
            return `In Round ${roundNum}, found ${categories.length} categories instead of the required 5. The categories found were: ${categories.join(', ')}.`;
        }

        for (const cat of categories) {
            if (categoryCounts[cat] !== 5) {
                return `In Round ${roundNum}, category "${cat}" has ${categoryCounts[cat]} clues instead of the required 5.`;
            }
        }

        return null;
    };

    // New, more detailed validation logic
    if (ROUND_1_CLUES.length === 0 && ROUND_2_CLUES.length === 0) {
        $setupMessage.textContent = "CSV Error: No valid clues for Round 1 or Round 2 were found in the file.";
        $setupMessage.classList.remove('hidden');
        return false;
    }

    if (!isRound1Valid) {
        let errorMsg = findCategoryErrors(ROUND_1_CLUES, 1);
        if (!errorMsg) {
            errorMsg = `Round 1 is incomplete. Found ${ROUND_1_CLUES.length} clues instead of the required 25.`;
        }
        $setupMessage.textContent = `CSV Error: ${errorMsg}`;
        $setupMessage.classList.remove('hidden');
        return false;
    }

    if (!isRound2Valid) {
        let errorMsg = findCategoryErrors(ROUND_2_CLUES, 2);
        if (!errorMsg) {
            errorMsg = `Round 2 is incomplete. Found ${ROUND_2_CLUES.length} clues instead of the required 25.`;
        }
        $setupMessage.textContent = `CSV Error: ${errorMsg}`;
        $setupMessage.classList.remove('hidden');
        return false;
    }

    // 4. Set the initial game state
    if (ROUND_1_CLUES.length > 0) {
        CURRENT_ROUND = 1;
        CLUES = ROUND_1_CLUES;
    } else {
        CURRENT_ROUND = 2;
        CLUES = ROUND_2_CLUES;
    }
    CATEGORIES = [...new Set(CLUES.map(clue => clue.Category))];

    // 5. Initialize board state for ALL clues
    BOARD_STATE = new Array(ALL_CLUES.length).fill(false);

    // Show Final Jeopardy button if a clue exists for it
    if (FINAL_JEOPARDY_CLUE) {
        $finalJeopardyButton.classList.remove('hidden');
    } else {
        $finalJeopardyButton.classList.add('hidden');
    }

    return true;
};

/**
 * Starts the game by initializing teams and rendering the board.
 * @param {number} numTeams - The number of teams to initialize.
 * @param {Array<number>} [initialScores=[]] - Optional array of scores for loading state.
 * @param {Array<boolean>} [initialBoardState=[]] - Optional array of played status for loading state.
 */
const startGame = (numTeams, initialScores = [], initialBoardState = []) => {
    
    GAME_START_TIME = new Date();
    PERFORMANCE_DATA = {}; // Reset performance data for a new game
    // 1. Initialize Teams
    TEAMS = [];
    for (let i = 0; i < numTeams; i++) {
        TEAMS.push({
            name: `Team ${i + 1}`,
            score: initialScores[i] !== undefined ? initialScores[i] : 0
        });
    }

    // 2. Load Board State if provided
    if (initialBoardState.length === ALL_CLUES.length) {
        BOARD_STATE = initialBoardState;
    }

    // 3. Update UI
    $setupScreen.classList.add('hidden');
    $gameBoard.classList.remove('hidden');
    $gameControlsContainer.classList.remove('hidden');

    updateScoreboard();
    renderBoard();
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

    // Populate Category
    $fjCategoryText.textContent = FINAL_JEOPARDY_CLUE.Value; // We use 'Value' field for FJ Category
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
        } else { // Other teams
            standingsList.innerHTML += `
                <div class="bg-gray-700 p-3 rounded-lg flex justify-between items-center">
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
        const gameState = {
            allClues: ALL_CLUES,
            round1Clues: ROUND_1_CLUES,
            round2Clues: ROUND_2_CLUES,
            currentRound: CURRENT_ROUND,
            teams: TEAMS,
            boardState: BOARD_STATE,
            gameTitle: $gameTitle.textContent
        };
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

        // Start the game with the restored data
        startGame(savedState.teams.length, savedState.teams.map(t => t.score), savedState.boardState);
        // Restore team names after starting
        TEAMS.forEach((team, i) => team.name = savedState.teams[i].name);
        updateScoreboard(); // Final update with correct names

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
        skipEmptyLines: true,
        comments: "#",
        complete: function (results) {
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
            headerRowIndex = data.findIndex((row, index) => index >= nextRow && row[0] === 'Category');
            if (headerRowIndex === -1) headerRowIndex = nextRow; // Fallback
            const headers = data[headerRowIndex];
            const clueDataRows = data.slice(headerRowIndex + 1);

            const formattedData = clueDataRows.map(row => {
                const obj = {};
                headers.forEach((header, i) => {
                    obj[header.trim()] = row[i]; // Trim header to avoid issues with whitespace
                });
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

                $setupMessage.textContent = `Game loaded successfully! ${roundInfo}`;
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
        skipEmptyLines: true,
        comments: "#"
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
    headerRowIndex = data.findIndex((row, index) => index >= nextRow && row[0] === 'Category');
    if (headerRowIndex === -1) headerRowIndex = nextRow; // Fallback
    const headers = data[headerRowIndex];
    const clueDataRows = data.slice(headerRowIndex + 1);

    const formattedData = clueDataRows.map(row => {
        const obj = {};
        headers.forEach((header, i) => {
            obj[header.trim()] = row[i];
        });
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

        $setupMessage.textContent = `Game loaded successfully! ${roundInfo}`;
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
        const state = {
            c: CATEGORIES, // Categories
            d: CLUES, // Clue Data
            s: TEAMS.map(team => team.score), // Scores
            t: TEAMS.length, // Team count
            p: BOARD_STATE // Played tiles
        };
        state.title = title; // Add title to the save state
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
 * Loads a game state from a Base64 save code.
 */
const loadSaveCode = () => {
    const code = $loadCodeInput.value;
    if (!code) return;

    try {
        // Convert from Base64, then parse JSON
        const jsonState = atob(code);
        const state = JSON.parse(jsonState);

        // Validate the loaded state
        if (!state.c || !state.d || !state.s || !state.t || !state.p || !state.title) {
            throw new Error("Invalid save code format.");
        }

        // Restore global state
        CATEGORIES = state.c;
        CLUES = state.d;
        const numTeams = state.t; // This needs to be smarter for multi-round games
        const scores = state.s;
        const boardState = state.p;

        // Restore title
        if ($gameTitle) {
            $gameTitle.textContent = state.title;
        }

        // Start the game with the restored state
        $numTeams.value = numTeams; // Update UI
        startGame(numTeams, scores, boardState);

    } catch (e) {
        console.error("Error loading save code:", e);
        $setupMessage.textContent = "Error: Invalid or corrupt save code.";
        $setupMessage.classList.remove('hidden');
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
        $defaultGameSelect.innerHTML = `<option value="">Error loading library</option>`;
    }
};

// --- EVENT LISTENERS ---

// Setup Screen
$csvFile.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        loadGameFromFile(e.target.files[0]);
    }
});

$loadDefaultGameButton.addEventListener('click', loadDefaultGame);
$downloadTemplate.addEventListener('click', downloadTemplate);
$loadGameButton.addEventListener('click', loadSaveCode);

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

$loadPreviousGameButton.addEventListener('click', () => {
    $loadGameModal.classList.remove('hidden');
    $loadGameModal.classList.add('flex');
});

$closeLoadModalButton.addEventListener('click', () => {
    $loadGameModal.classList.add('hidden');
    $loadGameModal.classList.remove('flex');
});

if ($uploadTipsButton) {
    $uploadTipsButton.addEventListener('click', () => {
        if ($uploadTipsModal) $uploadTipsModal.classList.remove('hidden');
    });
}
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
    if (numTeams >= MIN_TEAMS && numTeams <= MAX_TEAMS) {
        startGame(numTeams);
    } else {
        // We're already preventing this with min/max on the input, but this is a good safeguard.
        // Using a custom modal/alert would be better, but window.alert is disallowed.
        // For now, we'll just log it.
        console.warn(`Invalid team number: ${numTeams}`);
    }
});

// Game/Save Controls
$generateSaveCodeButton.addEventListener('click', generateSaveCode);
$saveCodeDisplay.addEventListener('click', () => $saveCodeDisplay.select());

// Clue Modal
$revealAnswerButton.addEventListener('click', () => {
    $clueAnswer.classList.remove('hidden');
    $revealAnswerButton.classList.add('hidden');
});

$passClueButton.addEventListener('click', () => {
    finalizeClue();
    PENALIZED_TEAMS = [];
});

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
document.getElementById('fj-proceed-to-wager').addEventListener('click', proceedToWager);
document.getElementById('fj-lock-wagers').addEventListener('click', lockWagersAndShowClue);
document.getElementById('fj-reveal-answer').addEventListener('click', revealFinalAnswer);
document.getElementById('fj-finish-game').addEventListener('click', () => {
    // Reset the scored flag for all teams before showing standings
    TEAMS.forEach(t => t.fjScored = false);
    showFinalStandings();
});
document.getElementById('downloadReportButton').addEventListener('click', downloadPerformanceReport);

// --- INITIALIZATION ---
// Check for a saved game on page load.
loadGameStateFromSession();
populateDefaultGameSelector();