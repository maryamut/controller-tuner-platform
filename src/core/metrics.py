import numpy as np
from typing import Any


class MetricsCalculator:
    """
    Calculates control-theory performance metrics from a single simulation run.
    All methods are static: pass in the raw arrays, get back numbers.
    """

    @staticmethod
    def calculate(
        errors: np.ndarray,
        controls: np.ndarray,
        dt: float,
        min_control: float,
        max_control: float,
    ) -> dict[str, Any]:
        if len(errors) == 0:
            return {
                "mse": float("inf"),
                "rmse": float("inf"),
                "settling_time": float("inf"),
                "overshoot": 0.0,
                "stable": False,
                "ss_error": float("inf"),
                "control_effort": 0.0,
                "rise_time": float("inf"),
                "zero_crossings": 0,
            }

        t = np.arange(0, len(errors) * dt, dt)
        metrics: dict[str, Any] = {}

        # --- Basic error metrics -------------------------------------------------
        metrics["mse"] = float(np.mean(errors ** 2))
        metrics["rmse"] = float(np.sqrt(metrics["mse"]))

        initial_error = float(abs(errors[0]))

        # --- Thresholds -----------------------------------------------------------
        if initial_error > 1e-6:
            settling_threshold = 0.05 * initial_error
            stability_threshold = 0.20 * initial_error
        else:
            settling_threshold = 0.05
            stability_threshold = 0.20

        # --- Settling time --------------------------------------------------------
        # First index where error enters the 5% band AND stays there until the end.
        settled = np.where(np.abs(errors) < settling_threshold)[0]
        metrics["settling_time"] = float("inf")

        if len(settled) > 0:
            groups: list[list[int]] = []
            cur = [settled[0]]
            for idx in settled[1:]:
                if idx == cur[-1] + 1:
                    cur.append(idx)
                else:
                    groups.append(cur)
                    cur = [idx]
            groups.append(cur)

            for g in groups:
                if g[-1] == len(errors) - 1:
                    metrics["settling_time"] = float(t[g[0]])
                    break

        # --- Overshoot ------------------------------------------------------------
        metrics["overshoot"] = 0.0
        if initial_error > 1e-6:
            approach_idx = np.where(np.abs(errors) < 0.1 * initial_error)[0]
            if len(approach_idx) > 0 and approach_idx[0] < len(errors) - 1:
                first = approach_idx[0]
                after = errors[first:]
                init_sign = np.sign(errors[0])
                crossed = np.where(np.sign(after) == -init_sign)[0]
                if len(crossed) > 0:
                    max_over = float(np.max(np.abs(after[crossed])))
                    metrics["overshoot"] = (max_over / initial_error) * 100.0

        # --- Stability ------------------------------------------------------------
        final_n = max(int(0.2 * len(errors)), 10)
        final_errors = errors[-final_n:]
        bounded = bool(np.all(np.abs(final_errors) < stability_threshold))
        no_extreme = bool(np.all(np.abs(errors) < 1000.0))
        ctrl_ok = bool(np.all(np.abs(controls) < 1000.0))
        metrics["stable"] = bounded and no_extreme and ctrl_ok

        # --- Rise time ------------------------------------------------------------
        rise_thr = 0.05 * initial_error if initial_error > 1e-6 else 0.05
        rise_idx = np.where(np.abs(errors) < rise_thr)[0]
        metrics["rise_time"] = float(t[rise_idx[0]]) if len(rise_idx) > 0 else float("inf")

        # --- Oscillations ---------------------------------------------------------
        metrics["zero_crossings"] = int(len(np.where(np.diff(np.signbit(errors)))[0]))

        # --- Control effort -------------------------------------------------------
        max_u = max(abs(min_control), abs(max_control))
        if max_u > 0 and len(controls) > 0:
            metrics["control_effort"] = float(np.sum(np.abs(controls)) / (max_u * len(controls)))
        else:
            metrics["control_effort"] = 0.0

        # --- Steady-state error ---------------------------------------------------
        ss_window = errors[-int(0.1 * len(errors)) :] if len(errors) >= 10 else errors
        metrics["ss_error"] = float(np.abs(np.mean(ss_window)))

        return metrics