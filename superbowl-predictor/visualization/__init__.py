"""
Visualization package for Super Bowl LX Prediction Engine.
Patriots vs Seahawks — February 8, 2026.

Provides chart generation (matplotlib) and terminal report formatting (rich).
"""

from visualization.charts import PredictionCharts
from visualization.report_generator import ReportGenerator

__all__ = ["PredictionCharts", "ReportGenerator"]
