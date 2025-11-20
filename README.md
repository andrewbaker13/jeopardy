# Professor Jeopardy-O-Matic!

A highly customizable, browser-based Jeopardy! game generator perfect for classrooms, training sessions, and social events. This application runs entirely in your browser with no server-side setup required. Create your own game boards using simple CSV/TSV files or a public Google Sheet, and enjoy a rich, interactive experience with features like multimedia clues, Daily Doubles, and Final Jeopardy.

 <!-- Suggestion: Replace with a real screenshot of your app! -->

---

## ✨ Key Features

- **Custom Game Creation**: Easily load your own game from a CSV, TSV, or a public Google Sheet.
- **Flexible Board Layout**: Supports classic 5x5 boards as well as custom sizes (1-5 categories, 2-5 clues each).
- **Rich Media Clues**: Clues can be simple text, images, embedded videos (YouTube/Vimeo), multiple-choice questions, or even custom HTML.
- **Full Jeopardy Experience**: Includes Daily Doubles and a multi-step Final Jeopardy round with wagers.
- **Theming Engine**: Choose from multiple color themes (Classic, Light, Dark, Holiday, High Contrast) to match your session's vibe.
- **Save & Load Games**: Generate a save code to pause a game and resume it later, preserving all scores and board state.
- **Judge Mode**: A special facilitator view that shows the entire board with answers, perfect for running the game from a separate device.
- **Team Management**: Supports 2-10 teams with customizable names and mid-game score editing.
- **Performance Reports**: Download a post-game CSV report detailing team performance on each clue.
- **No Backend Required**: Runs entirely in the browser. Just open `index.html`!

## 🚀 Getting Started

This project is designed to be run directly from your local file system.

1.  **Clone or Download the Repository:**
    ```bash
    git clone https://github.com/your-username/jeopardy.git
    ```
    Alternatively, you can download the project as a ZIP file and extract it.

2.  **Open the Application:**
    Navigate to the project folder and open the `index.html` file in a modern web browser (like Chrome, Firefox, or Edge).

    > **Note:** For the best experience, especially when loading games from the library, it's recommended to use a simple local server to avoid potential browser security restrictions (CORS). A tool like Live Server for VS Code is perfect for this.

## 📝 How to Create a Custom Game

You can create your own game board using the provided templates (`jeopardy_template.csv` or `jeopardy_template.tsv`).

### File Structure Basics

Your game file is a simple spreadsheet with specific columns. The first few rows can be used for optional configuration, followed by a header row, and then your clue data.

#### Optional Configuration Rows

- **Game Title**: To set a custom title for your game, make the very first row:
  `GameTitle,"Your Custom Game Title"`
- **Judge Mode**: To enable a password-protected "answer key" mode, add a row for the code:
  `JudgeCode,123456` (use any 6-digit code)

#### Header Row

Your file must contain a header row with the following column names:
`Category,Value,Clue,Answer,Explanation,MediaType,MediaURL,DailyDouble,Round,MC_Answers`

#### Column Explanations

| Column | Description | Required? | Example |
| :--- | :--- | :--- | :--- |
| **Category** | The category name for the clue. Must be identical for all clues in that category. | Yes | `HISTORY` |
| **Value** | The dollar value of the clue. | Yes | `200` |
| **Clue** | The text of the clue/question that players will see. | Yes | `This is the clue text.` |
| **Answer** | The correct response to the clue. | Yes | `What is the answer?` |
| **Explanation** | (Optional) Extra notes or context revealed after the answer. | No | `This is why the answer is correct.` |
| **MediaType** | The type of media for the clue. See details below. | No (defaults to `text`) | `image` |
| **MediaURL** | The URL for `image`/`video` types, or raw HTML for the `html` type. | Yes, for some MediaTypes | `https://.../image.png` |
| **DailyDouble** | Set to `Yes` to make this clue a Daily Double. | No | `Yes` |
| **Round** | The round number (`1` or `2`) or `FJ` for Final Jeopardy. | Yes | `1` |
| **MC_Answers** | For `mc` clues, provide 2-5 options separated by a semicolon. | Yes, for `mc` clues | `Option A;Option B;Option C` |

### Media Types (`MediaType`)

You can create engaging clues using different media formats.

- **`text`** (Default): A standard text-based clue.
- **`image`**: Displays an image above the clue text. The `MediaURL` must be a **direct link** to an image file (e.g., ending in `.jpg`, `.png`).
- **`video`**: Embeds a video player. The `MediaURL` must be an **embed URL** from YouTube or Vimeo.
  - *YouTube Example*: `https://www.youtube.com/embed/VIDEO_ID`
  - *Vimeo Example*: `https://player.vimeo.com/video/VIDEO_ID`
- **`html`**: Renders custom HTML content provided in the `MediaURL` column. Safe tags like `<b>`, `<i>`, `<ul>`, `<table>`, `<img>`, and `<a>` are allowed.
- **`mc`** (Multiple Choice): Displays a set of buttons for players to choose from. Provide the options in the `MC_Answers` column, separated by semicolons.

### Final Jeopardy

To add a Final Jeopardy round:
1.  Create one row in your file.
2.  Set the `Category` column to `FINAL JEOPARDY`.
3.  Set the `Round` column to `FJ`.
4.  The actual category name for the final clue goes in the `Value` column (e.g., `HISTORIC DOCUMENTS`).

---

## 💻 Technology Stack

- **HTML5**
- **CSS3** with **Tailwind CSS** for utility-first styling.
- **Vanilla JavaScript (ES6+)**: No front-end frameworks, keeping it lightweight and fast.
- **Papa Parse**: For robust in-browser CSV/TSV parsing.
- **DOMPurify**: For sanitizing HTML clues to prevent XSS.
- **Canvas Confetti**: For the winner celebration!

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the issues page.

## 📜 License

This project is licensed under the MIT License. See the `LICENSE` file for details.

---

*This project is not affiliated with, sponsored by, or endorsed by Jeopardy Productions, Inc.*