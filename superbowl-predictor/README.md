# Super Bowl LX Prediction Engine

**New England Patriots vs. Seattle Seahawks**
February 8, 2026 — Levi's Stadium, Santa Clara, CA | Kickoff: 6:30 PM ET

A multi-methodology prediction and analysis engine that runs 6 independent statistical models, applies qualitative intangibles adjustments, and produces composite predictions with visualizations.

## Quick Start

```bash
pip install -r requirements.txt

# Pre-game analysis
python main.py

# Live game tracker (interactive CLI)
python live_game.py

# Run tests
python -m pytest tests/ -v
```

## Architecture

### Prediction Models
| Model | Weight | Methodology |
|-------|--------|-------------|
| Monte Carlo | 25% | 100,000 game simulations modeling drive-level outcomes |
| Efficiency Composite | 20% | EPA/DVOA weighted composite with success rate and explosive plays |
| Bayesian Inference | 20% | Conjugate normal Bayesian updating (regular season prior → playoff posterior) |
| Elo Rating | 15% | Elo formula with SOS and playoff adjustments |
| Logistic Regression | 10% | Scikit-learn model trained on synthetic historical features |
| Pythagorean | 10% | Points^2.37 formula with opponent strength adjustments |

### Intangibles Layer
Quantifies qualitative factors (injuries, off-field distractions, momentum, coaching, historical trends) as point spread adjustments with confidence weights.

### Live Game Engine
Interactive CLI that accepts current game state and produces updated win probabilities based on score differential, time remaining, possession, field position, and in-game efficiency vs. pre-game baselines.

## Output

- Formatted terminal report with composite predictions, model breakdown, value assessment, and sensitivity analysis
- 6 visualization charts saved to `output/` directory
- Model comparison, Monte Carlo distribution, radar chart, value map, intangibles breakdown, sensitivity tornado

## Project Structure

```
superbowl-predictor/
├── config/          # Team stats, player stats, intangibles, Vegas lines (JSON)
├── models/          # 6 prediction models + intangibles adjustment layer
├── analysis/        # Value finder, prop analyzer, scenario engine
├── live/            # Game state tracker, win probability calculator, recalculator
├── visualization/   # Charts (matplotlib) and terminal reports (rich)
├── data/            # Data loader and scraper
├── tests/           # Unit tests (20 tests)
├── main.py          # Pre-game analysis entry point
├── live_game.py     # Live game tracking entry point
└── output/          # Generated charts
```

---

*Built by Brendan Cameron | BCABC, LLC | Super Bowl Sunday 2026*
*"For entertainment and analytical purposes"*
