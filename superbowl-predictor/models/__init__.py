"""
Super Bowl LX Prediction Engine - Models Package
=================================================

This package contains all prediction models for the Super Bowl LX matchup
between the New England Patriots and Seattle Seahawks (Seahawks -4.5).

Each model implements a consistent interface:
    predict(patriots_stats, seahawks_stats) -> dict with:
        - patriots_win_prob: float (0-1)
        - seahawks_win_prob: float (0-1)
        - predicted_spread: float (negative = SEA favored)
        - predicted_total: float

Models:
    EloModel           - Elo rating system with playoff adjustments
    RegressionModel    - Logistic/linear regression on efficiency features
    PythagoreanModel   - Pythagorean wins / point differential approach
    EfficiencyModel    - EPA/DVOA composite efficiency model
    BayesianModel      - Bayesian inference with prior updating
    MonteCarloModel    - Monte Carlo drive-by-drive simulation
    IntangiblesModel   - Qualitative / intangible factor adjustments
"""

from .elo_model import EloModel
from .regression_model import RegressionModel
from .point_differential import PythagoreanModel
from .efficiency_model import EfficiencyModel
from .bayesian_model import BayesianModel
from .monte_carlo import MonteCarloModel
from .intangibles_model import IntangiblesModel

__all__ = [
    "EloModel",
    "RegressionModel",
    "PythagoreanModel",
    "EfficiencyModel",
    "BayesianModel",
    "MonteCarloModel",
    "IntangiblesModel",
]
