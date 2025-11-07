// --- GLOBAL STATE VARIABLES ---
let CLUES = []; // Stores all parsed game data from CSV
let CATEGORIES = []; // Array of category names
let TEAMS = []; // Array of team objects: [{name: 'Team 1', score: 0}, ...]
let BOARD_STATE = []; // Array tracking which clues (by index) have been played (boolean or index of clue)
let GAME_LIBRARY = []; // Stores the list of available default games from the manifest
let JUDGE_CODE = null; // Stores the secret code for judge mode
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
    'dailyDouble': 'DailyDouble'
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
const $loadCodeInput = document.getElementById('loadCodeInput');
const $loadGameButton = document.getElementById('loadGameButton');
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
};

/**
 * Renders the Jeopardy game board grid.
 */
const renderBoard = (isJudgeMode = false) => {
    if (CLUES.length === 0) return;

    $gameBoard.innerHTML = '';
    $gameBoard.style.setProperty('--num-categories', CATEGORIES.length);

    const numCluesPerCategory = CLUES.length / CATEGORIES.length;

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
            tile.id = `clue-tile-${clueIndex}`;
            tile.className = 'jeopardy-tile jeopardy-blue text-center p-4 font-black text-3xl rounded-lg';
            // Ensure Value is a number before formatting
            tile.textContent = `$${Number(clue.Value).toLocaleString()}`;

            if (BOARD_STATE[clueIndex]) {
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
        const sel = document.getElementById(`score-select-${index}`);
        if (!sel) return;
        const v = sel.value;
        if (v === 'add') {
            team.score += value;
        } else if (v === 'subtract') {
            team.score -= value;
        }
    });

    updateScoreboard();
    // Mark clue as played and close modal
    markClueAsPlayed(CURRENT_CLUE_INDEX);
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
        markClueAsPlayed(CURRENT_CLUE_INDEX);
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
    $clueText.textContent = clue.Clue;
    $clueAnswer.querySelector('span').textContent = clue.Answer;

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
    $judgeClueValueText.textContent = `${clue.Category} - $${clue.Value}`;
    $judgeClueText.textContent = clue.Clue;
    $judgeClueAnswer.querySelector('span').textContent = clue.Answer;

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
        team.score += wager;
        finalizeClue();
    };

    const incorrectBtn = document.createElement('button');
    incorrectBtn.className = 'bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-lg';
    incorrectBtn.textContent = 'Incorrect';
    incorrectBtn.onclick = () => {
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
    }
};

/**
 * A helper function to finalize a clue after scoring (used by Daily Double and Pass).
 */
const finalizeClue = () => {
    updateScoreboard();
    markClueAsPlayed(CURRENT_CLUE_INDEX);
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

    // Map and sanitize the data
    CLUES = data.map(row => ({
        Category: row[CSV_HEADER_MAP.category] || '',
        // Parse value as integer, removing non-numeric characters like '$'
        Value: parseInt(String(row[CSV_HEADER_MAP.value]).replace(/[$,]/g, '')) || 0,
        Clue: row[CSV_HEADER_MAP.clue] || '',
        Answer: row[CSV_HEADER_MAP.answer] || '',
        MediaType: row[CSV_HEADER_MAP.mediaType] || 'text',
        MediaURL: row[CSV_HEADER_MAP.mediaUrl] || '',
        DailyDouble: row[CSV_HEADER_MAP.dailyDouble] || 'No'
    })).filter(clue => clue.Value > 0 && clue.Category); // Ensure rows have value and category

    // Determine unique categories
    CATEGORIES = [...new Set(CLUES.map(clue => clue.Category))];

    const totalClues = CLUES.length;
    const numCategories = CATEGORIES.length;

    // Final validation checks
    if (numCategories === 0 || totalClues === 0) {
        $setupMessage.textContent = "Error: No valid clues or categories found in the file.";
        $setupMessage.classList.remove('hidden');
        return false;
    }

    if (totalClues % numCategories !== 0) {
        // Error: Non-uniform board (e.g., 5 cats but one only has 4 questions)
        $setupMessage.textContent = `Error: Clue file requires the same number of questions per category. Found ${totalClues} total clues across ${numCategories} categories.`;
        $setupMessage.classList.remove('hidden');
        CLUES = [];
        CATEGORIES = [];
        return false;
    }

    // Initialize board state (all unplayed)
    BOARD_STATE = new Array(CLUES.length).fill(false);

    return true;
};

/**
 * Starts the game by initializing teams and rendering the board.
 * @param {number} numTeams - The number of teams to initialize.
 * @param {Array<number>} [initialScores=[]] - Optional array of scores for loading state.
 * @param {Array<boolean>} [initialBoardState=[]] - Optional array of played status for loading state.
 */
const startGame = (numTeams, initialScores = [], initialBoardState = []) => {

    // 1. Initialize Teams
    TEAMS = [];
    for (let i = 0; i < numTeams; i++) {
        TEAMS.push({
            name: `Team ${i + 1}`,
            score: initialScores[i] !== undefined ? initialScores[i] : 0
        });
    }

    // 2. Load Board State if provided
    if (initialBoardState.length === CLUES.length) {
        BOARD_STATE = initialBoardState;
    }

    // 3. Update UI
    $setupScreen.classList.add('hidden');
    $gameBoard.classList.remove('hidden');
    $gameControlsContainer.classList.remove('hidden');

    updateScoreboard();
    renderBoard();
};

// --- JUDGE MODE LOGIC ---

/**
 * Starts the game in Judge Mode (no scores, just the board).
 */
const startJudgeMode = () => {
    // Hide all standard game UI
    $setupScreen.classList.add('hidden');
    $gameControlsContainer.classList.add('hidden');

    renderBoard(true); // Render the board in judge mode
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
    // Hide all game elements
    $gameBoard.classList.add('hidden');
    $scoreboard.classList.add('hidden');
    $saveStateContainer.classList.add('hidden');
    $gameControlsContainer.classList.add('hidden');

    // Sort teams by score in descending order
    const sortedTeams = [...TEAMS].sort((a, b) => b.score - a.score);

    const standingsList = document.getElementById('standings-list');
    standingsList.innerHTML = '';

    sortedTeams.forEach((team, index) => {
        const scoreClass = team.score >= 0 ? 'text-green-400' : 'text-red-400';
        const displayName = team.name && String(team.name).trim() ? team.name : `Team ${index + 1}`;

        if (index === 0) { // The Winner
            standingsList.innerHTML += `
                <div class="bg-yellow-600 text-gray-900 p-4 rounded-lg shadow-lg">
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

// --- LOAD HANDLERS ---

/**
 * Loads the game data from a file, parses it, and enables the start button.
 */
const loadGameFromFile = (file) => {
    // Reset to default title in case the new file doesn't have one
    JUDGE_CODE = null;
    $judgeModeContainer.classList.add('hidden');

    if ($gameTitle) $gameTitle.textContent = 'Professor Jeopardy!';

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

            // 4. Setup clues with the formatted data
            if (setupClues(formattedData)) {
                $startGameButton.disabled = false;
                $setupMessage.classList.add('hidden');
            } else {
                $startGameButton.disabled = true;
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
    let headerRowIndex = 0;

    // Check for Judge Code on the first line of library files
    if (data.length > 0 && data[0][0] === 'JudgeCode') {
        JUDGE_CODE = data[0][1] ? String(data[0][1]).trim() : null;
        if (JUDGE_CODE) {
            $judgeModeContainer.classList.remove('hidden');
        }
        headerRowIndex = 1;
    }

    // Manually construct data objects to pass to setupClues
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
        $setupMessage.textContent = "Default game loaded successfully.";
        $setupMessage.classList.remove('hidden');
        $setupMessage.classList.remove('text-red-400');
        $setupMessage.classList.add('text-green-400');
    } else {
        $startGameButton.disabled = true;
        $setupMessage.textContent = "Error loading default game.";
        $setupMessage.classList.remove('hidden');
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
        const title = $gameTitle ? $gameTitle.textContent : 'Professor Jeopardy!';
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
        const numTeams = state.t;
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

$judgeModeButton.addEventListener('click', () => {
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

// --- INITIALIZATION ---
populateDefaultGameSelector();