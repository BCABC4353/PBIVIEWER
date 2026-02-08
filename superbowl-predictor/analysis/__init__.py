"""
Super Bowl LX Prediction Engine - Analysis Package
===================================================

This package contains analysis modules that consume model predictions
and produce actionable insights for the Patriots vs Seahawks (SEA -4.5)
Super Bowl LX matchup.

Modules:
    ValueFinder     - Compare model outputs to Vegas lines, identify edges
    PropAnalyzer    - Player prop bet analysis using season/playoff stats
    ScenarioEngine  - What-if scenario modeling and sensitivity analysis
"""

from .value_finder import ValueFinder
from .prop_analyzer import PropAnalyzer
from .scenario_engine import ScenarioEngine

__all__ = [
    "ValueFinder",
    "PropAnalyzer",
    "ScenarioEngine",
]
