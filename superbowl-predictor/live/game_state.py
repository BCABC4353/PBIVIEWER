"""
Game state tracker for Super Bowl LX: Patriots vs Seahawks.

Maintains a complete snapshot of the current game situation including
scores, stats, field position, and a rolling history of prior states
for trend analysis.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass, field
from typing import Any, ClassVar, Dict, List, Optional, Tuple


REGULATION_QUARTER_SECONDS: int = 900   # 15 minutes
OT_PERIOD_SECONDS: int = 600            # 10 minutes
VALID_POSSESSIONS: Tuple[str, str] = ("NE", "SEA")


@dataclass
class GameState:
    """Complete representation of in-game state for live prediction."""

    # --- Scoreboard -----------------------------------------------------------
    score_patriots: int = 0
    score_seahawks: int = 0

    # --- Clock ----------------------------------------------------------------
    quarter: int = 1                     # 1-4 regulation, 5 = OT
    time_remaining: int = REGULATION_QUARTER_SECONDS  # seconds in current qtr

    # --- Possession / Field ---------------------------------------------------
    possession: str = "NE"               # 'NE' or 'SEA'
    field_position: int = 25             # yards from own endzone (1-99)
    down: int = 1                        # 1-4
    distance: int = 10                   # yards to first down

    # --- Cumulative Stats: New England ----------------------------------------
    ne_total_yards: int = 0
    ne_turnovers: int = 0
    ne_passing_yards: int = 0
    ne_rushing_yards: int = 0
    ne_time_of_possession: int = 0       # seconds

    # --- Cumulative Stats: Seattle --------------------------------------------
    sea_total_yards: int = 0
    sea_turnovers: int = 0
    sea_passing_yards: int = 0
    sea_rushing_yards: int = 0
    sea_time_of_possession: int = 0      # seconds

    # --- Events & History -----------------------------------------------------
    key_events: List[str] = field(default_factory=list)
    history: List[Dict[str, Any]] = field(default_factory=list)

    # --- Validation constants (not serialized) --------------------------------
    _VALID_QUARTERS: ClassVar[Tuple[int, ...]] = (1, 2, 3, 4, 5)

    # ------------------------------------------------------------------
    # Construction helpers
    # ------------------------------------------------------------------

    def __post_init__(self) -> None:
        self._validate()

    def _validate(self) -> None:
        """Run basic sanity checks on field values."""
        if self.quarter not in self._VALID_QUARTERS:
            raise ValueError(
                f"quarter must be 1-5 (5=OT), got {self.quarter}"
            )
        max_time = (
            OT_PERIOD_SECONDS if self.quarter == 5
            else REGULATION_QUARTER_SECONDS
        )
        if not (0 <= self.time_remaining <= max_time):
            raise ValueError(
                f"time_remaining must be 0-{max_time} for quarter "
                f"{self.quarter}, got {self.time_remaining}"
            )
        if self.possession not in VALID_POSSESSIONS:
            raise ValueError(
                f"possession must be 'NE' or 'SEA', got {self.possession!r}"
            )
        if not (1 <= self.field_position <= 99):
            raise ValueError(
                f"field_position must be 1-99, got {self.field_position}"
            )
        if not (1 <= self.down <= 4):
            raise ValueError(f"down must be 1-4, got {self.down}")
        if self.distance < 0:
            raise ValueError(
                f"distance must be >= 0, got {self.distance}"
            )

    # ------------------------------------------------------------------
    # Interactive factory
    # ------------------------------------------------------------------

    @classmethod
    def from_input(cls) -> "GameState":
        """Prompt the user interactively for every game-state field.

        Returns a fully-populated ``GameState`` instance.
        """

        def _ask_int(prompt: str, default: int | None = None) -> int:
            suffix = f" [{default}]" if default is not None else ""
            while True:
                raw = input(f"{prompt}{suffix}: ").strip()
                if raw == "" and default is not None:
                    return default
                try:
                    return int(raw)
                except ValueError:
                    print("  Please enter an integer.")

        def _ask_choice(prompt: str, choices: Tuple[str, ...],
                        default: str | None = None) -> str:
            choices_str = "/".join(choices)
            suffix = f" [{default}]" if default is not None else ""
            while True:
                raw = input(
                    f"{prompt} ({choices_str}){suffix}: "
                ).strip().upper()
                if raw == "" and default is not None:
                    return default
                if raw in choices:
                    return raw
                print(f"  Please enter one of: {choices_str}")

        print("\n=== Super Bowl LX Game State Entry ===\n")

        # Scoreboard
        score_patriots = _ask_int("Patriots score", 0)
        score_seahawks = _ask_int("Seahawks score", 0)

        # Clock
        quarter = _ask_int("Quarter (1-4, 5=OT)", 1)
        max_time = (
            OT_PERIOD_SECONDS if quarter == 5
            else REGULATION_QUARTER_SECONDS
        )
        minutes = _ask_int(f"Minutes remaining in quarter (0-{max_time // 60})",
                           max_time // 60)
        seconds = _ask_int("Seconds remaining (0-59)", 0)
        time_remaining = minutes * 60 + seconds

        # Possession / field
        possession = _ask_choice("Possession", VALID_POSSESSIONS, "NE")
        field_position = _ask_int(
            "Field position (yards from possessing team's own endzone, 1-99)",
            25,
        )
        down = _ask_int("Down (1-4)", 1)
        distance = _ask_int("Distance to first down", 10)

        # NE stats
        print("\n--- New England Stats ---")
        ne_total_yards = _ask_int("NE total yards", 0)
        ne_passing_yards = _ask_int("NE passing yards", 0)
        ne_rushing_yards = _ask_int("NE rushing yards", 0)
        ne_turnovers = _ask_int("NE turnovers", 0)
        ne_top_min = _ask_int("NE time of possession (minutes)", 0)
        ne_top_sec = _ask_int("NE time of possession (seconds)", 0)
        ne_time_of_possession = ne_top_min * 60 + ne_top_sec

        # SEA stats
        print("\n--- Seattle Stats ---")
        sea_total_yards = _ask_int("SEA total yards", 0)
        sea_passing_yards = _ask_int("SEA passing yards", 0)
        sea_rushing_yards = _ask_int("SEA rushing yards", 0)
        sea_turnovers = _ask_int("SEA turnovers", 0)
        sea_top_min = _ask_int("SEA time of possession (minutes)", 0)
        sea_top_sec = _ask_int("SEA time of possession (seconds)", 0)
        sea_time_of_possession = sea_top_min * 60 + sea_top_sec

        # Key events
        print("\nEnter key events (blank line to finish):")
        key_events: List[str] = []
        while True:
            ev = input("  Event: ").strip()
            if ev == "":
                break
            key_events.append(ev)

        return cls(
            score_patriots=score_patriots,
            score_seahawks=score_seahawks,
            quarter=quarter,
            time_remaining=time_remaining,
            possession=possession,
            field_position=field_position,
            down=down,
            distance=distance,
            ne_total_yards=ne_total_yards,
            ne_turnovers=ne_turnovers,
            ne_passing_yards=ne_passing_yards,
            ne_rushing_yards=ne_rushing_yards,
            ne_time_of_possession=ne_time_of_possession,
            sea_total_yards=sea_total_yards,
            sea_turnovers=sea_turnovers,
            sea_passing_yards=sea_passing_yards,
            sea_rushing_yards=sea_rushing_yards,
            sea_time_of_possession=sea_time_of_possession,
            key_events=key_events,
        )

    # ------------------------------------------------------------------
    # Derived calculations
    # ------------------------------------------------------------------

    def total_seconds_remaining(self) -> int:
        """Return the total game seconds remaining (all future quarters + current).

        Regulation has 4 quarters of 900 s each.  OT (quarter 5) has 600 s.
        """
        if self.quarter <= 4:
            full_quarters_left = 4 - self.quarter  # quarters after current
            return self.time_remaining + full_quarters_left * REGULATION_QUARTER_SECONDS
        # OT
        return self.time_remaining

    def score_differential(self) -> int:
        """Return score differential from NE perspective (positive = NE leading)."""
        return self.score_patriots - self.score_seahawks

    # ------------------------------------------------------------------
    # Serialization
    # ------------------------------------------------------------------

    def to_dict(self) -> Dict[str, Any]:
        """Serialize the current state to a plain dictionary.

        The ``history`` field is excluded to avoid recursive nesting;
        use ``snapshot()`` to persist history entries.
        """
        return {
            "score_patriots": self.score_patriots,
            "score_seahawks": self.score_seahawks,
            "quarter": self.quarter,
            "time_remaining": self.time_remaining,
            "possession": self.possession,
            "field_position": self.field_position,
            "down": self.down,
            "distance": self.distance,
            "ne_total_yards": self.ne_total_yards,
            "ne_turnovers": self.ne_turnovers,
            "ne_passing_yards": self.ne_passing_yards,
            "ne_rushing_yards": self.ne_rushing_yards,
            "ne_time_of_possession": self.ne_time_of_possession,
            "sea_total_yards": self.sea_total_yards,
            "sea_turnovers": self.sea_turnovers,
            "sea_passing_yards": self.sea_passing_yards,
            "sea_rushing_yards": self.sea_rushing_yards,
            "sea_time_of_possession": self.sea_time_of_possession,
            "key_events": list(self.key_events),
            "total_seconds_remaining": self.total_seconds_remaining(),
            "score_differential": self.score_differential(),
        }

    # ------------------------------------------------------------------
    # History management
    # ------------------------------------------------------------------

    def snapshot(self) -> None:
        """Save the current state (as a dict) to the history list.

        Call this before mutating the state so that trend analysis can
        compare previous checkpoints.
        """
        self.history.append(self.to_dict())

    # ------------------------------------------------------------------
    # Display
    # ------------------------------------------------------------------

    def __str__(self) -> str:
        qtr_label = f"Q{self.quarter}" if self.quarter <= 4 else "OT"
        mins, secs = divmod(self.time_remaining, 60)
        clock = f"{mins:02d}:{secs:02d}"
        poss_arrow = "->" if self.possession == "NE" else "<-"
        return (
            f"NE {self.score_patriots} {poss_arrow} SEA {self.score_seahawks}  "
            f"{qtr_label} {clock}  "
            f"{self._ordinal(self.down)}&{self.distance} at "
            f"{'own ' if self.field_position <= 50 else 'opp '}"
            f"{self.field_position if self.field_position <= 50 else 100 - self.field_position}"
        )

    @staticmethod
    def _ordinal(n: int) -> str:
        return {1: "1st", 2: "2nd", 3: "3rd", 4: "4th"}.get(n, f"{n}th")
