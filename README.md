# QuizBlast

An ad-free, tracker-free trivia app that runs entirely in the browser. Make quizzes by hand or import them from a file, then race the clock answering questions Sporcle-style. All quizzes are stored locally in your browser — nothing is sent to any server.

## What's included

- **Library** — browse and play all saved quizzes
- **Create** — build quizzes by hand with answers, accepted alternatives, hints, and a per-question timer
- **Import** — load quizzes from a JSON or CSV file (drag-drop, browse, or paste)
- **Play** — typed-answer gameplay with countdown timer, progress chips, hints, prev/skip navigation
- **Results** — per-question breakdown with your answers vs. the correct ones

## Import formats

### JSON
```json
{
  "title": "Solar Basics",
  "category": "Engineering",
  "timerSecs": 30,
  "questions": [
    {
      "question": "What does PV stand for?",
      "answer": "Photovoltaic",
      "alternatives": ["photo voltaic"],
      "hint": "Two words"
    }
  ]
}
```

### CSV
First row is a header. `question` and `answer` are required; `hint` and `alternatives` are optional. Separate multiple alternatives with `|`.

```csv
question,answer,hint,alternatives
What does PV stand for?,Photovoltaic,Two words,photo voltaic|photo-voltaic
Capital of France?,Paris,,
```

Downloadable templates for both formats are available on the Import screen.

## Notes

- Answer matching is case-insensitive and ignores punctuation. Use the **alternatives** field for spelling variants you want to accept.
- Clearing your browser data will erase saved quizzes — export anything important by keeping the source JSON/CSV files.
