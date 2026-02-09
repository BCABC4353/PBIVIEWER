#!/usr/bin/env python3
"""
Super Bowl LIX Backtest
========================
Run the same 7-model engine against last year's Super Bowl:
  Philadelphia Eagles (14-3) vs. Kansas City Chiefs (15-2)
  Actual result: Eagles 40, Chiefs 22

This validates model accuracy before trusting tonight's SB LX picks.
"""

import math
import random
import statistics
from dataclasses import dataclass, field
from typing import List, Dict

# Reuse the engine internals from superbowl_analyzer.py
from superbowl_analyzer import (
    TeamStats, BettingLine, NarrativeFactor, ModelResult,
    PythagoreanModel, Log5Model, EloModel, EfficiencyModel,
    MonteCarloModel, SituationalModel, EnsembleModel,
    EdgeDetector, bar,
    LEAGUE_AVG_PPG, NFL_PYTHAGOREAN_EXP, MONTE_CARLO_SIMS,
)

# ============================================================================
#  SB LIX DATA: Philadelphia Eagles vs. Kansas City Chiefs (2024 season)
# ============================================================================
#  Sources:
#    - FanDuel Research / numberFire adjusted NEP
#    - ESPN FPI, PFF, Pro-Football-Reference
#    - sportsbettingdime.com closing odds
#    - FTN Fantasy DVOA preview
# ============================================================================

def load_eagles() -> TeamStats:
    """Philadelphia Eagles 2024 regular season + playoff stats."""
    return TeamStats(
        name="Philadelphia Eagles", abbrev="PHI",
        wins=14, losses=3,
        points_for=461,          # 27.1 ppg - 3rd in NFL
        points_allowed=301,      # 17.7 ppg - 2nd in NFL
        total_yards=6072,        # 357.2 ypg
        pass_ypg=213.5,
        rush_ypg=147.3,          # Barkley 2,005 yards + others
        yards_allowed_pg=278.4,  # #1 in NFL
        pass_yd_allowed_pg=182.1,  # #1 adjusted pass defense
        rush_yd_allowed_pg=96.3,   # #3
        third_down_pct=42.1,
        third_down_def_pct=32.8,   # Elite
        redzone_pct=62.5,
        redzone_def_pct=42.0,
        turnover_diff=5,
        sacks_forced=53,           # Elite pass rush
        sacks_allowed=29,
        epa_per_play_off=0.085,    # 8th overall, solid
        epa_per_play_def=-0.115,   # #1 defense, dominant
        explosive_play_rate=10.2,
        explosive_play_def=4.6,    # #1 - allowed fewest 20+ yd plays
        fpi=6.8,                   # ESPN FPI - strong
        ats_record="13-7",
        playoff_ppg=28.0,          # 3 wins: vs GB, WAS, KC
        playoff_papg=18.3,
        dvoa_off=55.0,             # 13th
        dvoa_def=92.0,             # #1
        success_rate_off=48.5,
        success_rate_def=38.2,     # Elite
    )


def load_chiefs() -> TeamStats:
    """Kansas City Chiefs 2024 regular season + playoff stats."""
    return TeamStats(
        name="Kansas City Chiefs", abbrev="KC",
        wins=15, losses=2,
        points_for=362,          # 21.3 ppg - 21st in NFL
        points_allowed=306,      # 18.0 ppg - 4th in NFL
        total_yards=5570,        # 327.6 ypg - 20th
        pass_ypg=205.3,
        rush_ypg=122.3,
        yards_allowed_pg=306.5,  # 9th
        pass_yd_allowed_pg=210.2,  # 17th in DVOA
        rush_yd_allowed_pg=96.3,   # 9th in DVOA
        third_down_pct=52.7,       # #1 in NFL!
        third_down_def_pct=37.8,
        redzone_pct=56.2,
        redzone_def_pct=48.5,
        turnover_diff=10,          # +10, huge
        sacks_forced=41,
        sacks_allowed=26,          # Protected Mahomes well
        epa_per_play_off=0.038,    # 10th; middling for a 15-2 team
        epa_per_play_def=-0.048,   # 12th; decent not elite
        explosive_play_rate=8.4,   # 23rd - last in explosive runs (5%)
        explosive_play_def=7.2,
        fpi=4.2,                   # 8th in DVOA overall
        ats_record="8-10-1",       # Terrible ATS - won close games
        playoff_ppg=19.3,          # Beat HOU 23-14, BUF 32-29
        playoff_papg=21.5,
        dvoa_off=48.0,             # ~15th
        dvoa_def=72.0,             # ~9th
        success_rate_off=46.8,
        success_rate_def=42.5,
    )


def load_sb59_line() -> BettingLine:
    """Closing line for Super Bowl LIX."""
    return BettingLine(
        spread=1.5,                # KC -1.5 (positive = team2/KC favored)
        spread_juice_fav=-110,
        spread_juice_dog=-110,
        total=48.5,
        total_juice_over=-110,
        total_juice_under=-110,
        ml_fav=-120,               # KC
        ml_dog=+100,               # PHI
        public_spread_pct_fav=54.0,  # 54% on KC
        public_ml_pct_fav=55.0,
        public_total_over_pct=76.0,  # 76% on over
        handle_pct_fav=52.0,
    )


def load_sb59_narratives() -> List[NarrativeFactor]:
    return [
        NarrativeFactor(
            "Three-peat Bid",
            "Chiefs trying for an unprecedented third straight Super Bowl title. "
            "Historical pressure is immense -- no team has three-peated in the SB era.",
            "KC", "positive", 0.55, "momentum"
        ),
        NarrativeFactor(
            "SB LVII Revenge",
            "Eagles lost to the Chiefs in SB LVII just two years prior. "
            "Philly is hungry for revenge after blowing a 10-point halftime lead.",
            "PHI", "positive", 0.70, "revenge"
        ),
        NarrativeFactor(
            "Chiefs Win Close Games (Luck Factor)",
            "KC won 15 consecutive games decided by 7 or fewer points. "
            "Historically unsustainable -- regression is likely.",
            "KC", "negative", 0.65, "public"
        ),
        NarrativeFactor(
            "Mahomes Mystique",
            "Patrick Mahomes has never lost a playoff series. His postseason "
            "EPA/play of 0.317 is legendary. The GOAT factor.",
            "KC", "positive", 0.60, "momentum"
        ),
        NarrativeFactor(
            "Eagles Elite Defense Peaking",
            "Eagles ranked #1 in defensive DVOA since Week 7 (-27.4%). "
            "That stretch ranks as one of the 10 best since 1978.",
            "PHI", "positive", 0.75, "momentum"
        ),
        NarrativeFactor(
            "Chiefs Offense Mediocrity",
            "Despite 15-2, KC ranked 21st in PPG (21.3) and 20th in yards. "
            "Won on defense and close-game luck, not offensive dominance.",
            "KC", "negative", 0.60, "public"
        ),
        NarrativeFactor(
            "Barkley Factor",
            "Saquon Barkley's 2,005-yard rushing season is a generational weapon. "
            "KC run D is 9th -- good but not elite enough to contain him.",
            "PHI", "positive", 0.50, "momentum"
        ),
        NarrativeFactor(
            "Public Split / No Clear Contrarian Signal",
            "Betting action is nearly 50/50 (54% KC). No strong contrarian fade. "
            "Sharp money is mixed.",
            "KC", "positive", 0.15, "sharp"
        ),
    ]


# ============================================================================
#  MODIFIED SENTIMENT MODEL (generic for any SB, not SEA/NE hardcoded)
# ============================================================================

class SB59SentimentModel:
    """Sentiment model adapted for Eagles vs Chiefs."""

    def run(self, team1: TeamStats, team2: TeamStats,
            line: BettingLine,
            factors: List[NarrativeFactor]) -> ModelResult:

        t1_sentiment = 0.0  # PHI
        t2_sentiment = 0.0  # KC
        breakdown = []

        for f in factors:
            impact = f.weight
            if f.direction == "negative":
                impact = -impact

            if f.team_affected == team1.abbrev:
                t1_sentiment += impact
                breakdown.append(f"  [{f.team_affected}] {f.name}: {'+' if impact > 0 else ''}{impact:.2f}")
            elif f.team_affected == team2.abbrev:
                t2_sentiment += impact
                breakdown.append(f"  [{f.team_affected}] {f.name}: {'+' if impact > 0 else ''}{impact:.2f}")

        net = t1_sentiment - t2_sentiment

        adjustment = net * 0.06
        base_wp = 0.52
        t1_wp = min(0.85, max(0.15, base_wp + adjustment))

        spread = -(t1_wp - 0.5) * 28.0

        t1_pts = team1.ppg * (team2.papg / LEAGUE_AVG_PPG)
        t2_pts = team2.ppg * (team1.papg / LEAGUE_AVG_PPG)

        return ModelResult(
            model_name="Sentiment & Narrative",
            methodology="Public opinion, sharp money, drama, revenge, historical parallels",
            sea_win_pct=t1_wp,
            ne_win_pct=1.0 - t1_wp,
            predicted_spread=spread,
            predicted_total=t1_pts + t2_pts,
            confidence=0.45,
            weight=0.15,
            notes=f"PHI narrative: {t1_sentiment:+.2f} | KC narrative: {t2_sentiment:+.2f} | Net: {net:+.2f}"
        )


# ============================================================================
#  RUN BACKTEST
# ============================================================================

def run_backtest():
    phi = load_eagles()
    kc = load_chiefs()
    line = load_sb59_line()
    narratives = load_sb59_narratives()

    # Run all 7 models (PHI = "sea" position, KC = "ne" position in the generic model)
    m1 = PythagoreanModel().run(phi, kc)
    m2 = Log5Model().run(phi, kc)
    m3 = EloModel().run(phi, kc)
    m4 = EfficiencyModel().run(phi, kc)
    m5 = MonteCarloModel().run(phi, kc)
    m6 = SituationalModel().run(phi, kc)
    m7 = SB59SentimentModel().run(phi, kc, line, narratives)

    all_models = [m1, m2, m3, m4, m5, m6, m7]
    ensemble = EnsembleModel().combine(all_models)
    edges = EdgeDetector().detect(ensemble, line)

    # Actual result
    ACTUAL_WINNER = "PHI"
    ACTUAL_SCORE_PHI = 40
    ACTUAL_SCORE_KC = 22
    ACTUAL_SPREAD = -(ACTUAL_SCORE_PHI - ACTUAL_SCORE_KC)  # PHI -18
    ACTUAL_TOTAL = ACTUAL_SCORE_PHI + ACTUAL_SCORE_KC       # 62

    # ── Output ──
    w = 68
    print()
    print("\u2554" + "\u2550" * w + "\u2557")
    print("\u2551" + " SUPER BOWL LIX BACKTEST".center(w) + "\u2551")
    print("\u2551" + "".center(w) + "\u2551")
    print("\u2551" + " Philadelphia Eagles (14-3) vs. Kansas City Chiefs (15-2)".center(w) + "\u2551")
    print("\u2551" + " February 9, 2025 | Caesars Superdome, New Orleans".center(w) + "\u2551")
    print("\u2551" + f" ACTUAL RESULT: Eagles {ACTUAL_SCORE_PHI}, Chiefs {ACTUAL_SCORE_KC}".center(w) + "\u2551")
    print("\u255a" + "\u2550" * w + "\u255d")

    print()
    print("\u2550" * w)
    print("  MODEL-BY-MODEL PREDICTIONS vs. ACTUAL")
    print("\u2550" * w)

    labels = [
        "Pythagorean", "Log5", "Elo", "EPA/DVOA",
        "Monte Carlo", "Situational", "Sentiment"
    ]

    correct_winner = 0
    correct_spread_side = 0
    correct_total_side = 0

    print()
    print(f"  {'MODEL':<22s} {'PHI%':>6s} {'KC%':>6s} {'SPREAD':>8s} {'TOTAL':>7s} "
          f"{'WINNER':>8s} {'RIGHT?':>7s}")
    print("  " + "-" * 65)

    for i, (label, m) in enumerate(zip(labels, all_models)):
        phi_pct = m.sea_win_pct * 100
        kc_pct = m.ne_win_pct * 100
        pick = "PHI" if m.sea_win_pct > 0.5 else ("KC" if m.sea_win_pct < 0.5 else "EVEN")
        correct = "YES" if pick == ACTUAL_WINNER else ("--" if pick == "EVEN" else "no")
        if pick == ACTUAL_WINNER:
            correct_winner += 1

        # Did spread prediction correctly identify PHI should be favored?
        if m.predicted_spread < 0:
            spread_str = f"PHI {m.predicted_spread:.1f}"
        elif m.predicted_spread > 0:
            spread_str = f"KC {-m.predicted_spread:.1f}"
        else:
            spread_str = "PICK"

        print(f"  {label:<22s} {phi_pct:>5.1f}% {kc_pct:>5.1f}% {spread_str:>8s} "
              f"{m.predicted_total:>7.1f} {pick:>8s} {correct:>7s}")

    # Ensemble
    print("  " + "-" * 65)
    ens_phi = ensemble.sea_win_pct * 100
    ens_kc = ensemble.ne_win_pct * 100
    ens_pick = "PHI" if ensemble.sea_win_pct > 0.5 else "KC"
    ens_correct = "YES" if ens_pick == ACTUAL_WINNER else "no"
    if ensemble.predicted_spread < 0:
        ens_spread = f"PHI {ensemble.predicted_spread:.1f}"
    else:
        ens_spread = f"KC {-ensemble.predicted_spread:.1f}"

    print(f"  {'ENSEMBLE':<22s} {ens_phi:>5.1f}% {ens_kc:>5.1f}% {ens_spread:>8s} "
          f"{ensemble.predicted_total:>7.1f} {ens_pick:>8s} {ens_correct:>7s}")

    # ── Summary ──
    print()
    print("\u2550" * w)
    print("  BACKTEST RESULTS")
    print("\u2550" * w)
    print()
    print(f"  Actual result:           Eagles 40, Chiefs 22")
    print(f"  Actual spread:           PHI -18.0 (blowout)")
    print(f"  Actual total:            62 points")
    print(f"  Vegas line:              KC -1.5 / O/U 48.5")
    print()
    print(f"  ENSEMBLE PREDICTION")
    print(f"    Winner:                {ens_pick} ({max(ens_phi, ens_kc):.1f}%)")
    print(f"    Predicted spread:      {ens_spread}")
    print(f"    Predicted total:       {ensemble.predicted_total:.1f}")
    print()

    # Winner accuracy
    print(f"  ACCURACY")
    print(f"    Correct winner:        {correct_winner}/7 models + ensemble = {ens_correct}")
    print(f"    Ensemble picked:       {ens_pick} -- {'CORRECT' if ens_pick == ACTUAL_WINNER else 'WRONG'}")
    print()

    # Spread accuracy
    vegas_spread_side = "KC"  # Vegas had KC -1.5
    model_spread_side = "PHI" if ensemble.predicted_spread < 0 else "KC"
    actual_cover = "PHI"  # PHI won by 18
    print(f"    Vegas spread side:     {vegas_spread_side} -1.5 -- {'CORRECT' if vegas_spread_side == actual_cover else 'WRONG (PHI covered)'}")
    print(f"    Model spread side:     {model_spread_side} -- {'CORRECT' if model_spread_side == actual_cover else 'WRONG'}")
    print()

    # Total accuracy
    model_total_side = "OVER" if ensemble.predicted_total > 48.5 else "UNDER"
    actual_total_side = "OVER"  # 62 > 48.5
    print(f"    Vegas total:           48.5")
    print(f"    Model total:           {ensemble.predicted_total:.1f} -> {model_total_side}")
    print(f"    Actual total:          62 -> OVER")
    print(f"    Model total call:      {model_total_side} -- {'CORRECT' if model_total_side == actual_total_side else 'WRONG'}")
    print()

    # Edge detection check
    print(f"  EDGE DETECTION vs. VEGAS (would your bets have won?)")
    print()
    for bet_type, e in edges.items():
        actual_result = ""
        if bet_type == "spread":
            if "PHI" in e["side"] or ("KC" not in e["side"] and model_spread_side == "PHI"):
                actual_result = "WON (PHI covered easily)"
            elif "KC" in e["side"]:
                actual_result = "LOST (PHI won by 18)"
            else:
                actual_result = "NO BET"
        elif bet_type == "total":
            if "OVER" in e["side"]:
                actual_result = "WON (62 total points)"
            elif "UNDER" in e["side"]:
                actual_result = "LOST (62 total points)"
            else:
                actual_result = "NO BET"
        elif bet_type == "moneyline":
            if "PHI" in e["side"]:
                actual_result = "WON (PHI won outright)"
            elif "KC" in e["side"]:
                actual_result = "LOST (PHI won)"
            else:
                actual_result = "NO BET"

        marker = "WIN" if "WON" in actual_result else ("LOSS" if "LOST" in actual_result else "PASS")
        print(f"    [{marker:>4s}] {bet_type.upper()}: {e['side']}")
        print(f"           {actual_result}")
        print()

    # Visual
    print("\u2550" * w)
    print("  WIN PROBABILITY VISUAL")
    print("\u2550" * w)
    print()
    print(f"  PHI {bar(ens_phi, 50)} {ens_phi:.1f}%")
    print(f"  KC  {bar(ens_kc, 50)} {ens_kc:.1f}%")
    print()
    print(f"  Model confidence: {ensemble.confidence*100:.0f}%")
    print()

    # Final grade
    print("\u2550" * w)
    print("  OVERALL BACKTEST GRADE")
    print("\u2550" * w)
    print()

    score = 0
    checks = []
    if ens_pick == ACTUAL_WINNER:
        score += 40
        checks.append("[X] Picked correct winner (+40)")
    else:
        checks.append("[ ] Picked correct winner (+0)")

    if model_spread_side == actual_cover:
        score += 25
        checks.append("[X] Correct spread side (+25)")
    else:
        checks.append("[ ] Correct spread side (+0)")

    if model_total_side == actual_total_side:
        score += 20
        checks.append("[X] Correct total side (+20)")
    else:
        checks.append("[ ] Correct total side (+0)")

    # Spread accuracy (how close was the predicted spread to actual?)
    spread_error = abs(ensemble.predicted_spread - ACTUAL_SPREAD)
    if spread_error < 5:
        score += 15
        checks.append(f"[X] Spread within 5 pts (error: {spread_error:.1f}) (+15)")
    elif spread_error < 10:
        score += 8
        checks.append(f"[~] Spread within 10 pts (error: {spread_error:.1f}) (+8)")
    else:
        checks.append(f"[ ] Spread error: {spread_error:.1f} pts (+0)")

    for c in checks:
        print(f"  {c}")

    print()
    print(f"  TOTAL SCORE: {score}/100")
    grade = "A+" if score >= 90 else "A" if score >= 80 else "B+" if score >= 75 else \
            "B" if score >= 65 else "C+" if score >= 55 else "C" if score >= 45 else \
            "D" if score >= 35 else "F"
    print(f"  GRADE: {grade}")
    print()


if __name__ == "__main__":
    run_backtest()
