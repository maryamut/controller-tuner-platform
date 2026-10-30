from .dynamics import DynamicalSystem
from .metrics import MetricsCalculator
import numpy as np
from typing import Optional


class Simulator:
    def __init__(self, system: DynamicalSystem):
        self.system = system

    def evaluate(
        self,
        controller_type: str,
        params: dict[str, float],
        fixed_initial_state: Optional[list[float]] = None,
    ) -> dict:
        """
        Run one simulation and compute metrics.
        Returns a dict ready for SimulationResponse Pydantic model.
        """
        ic = np.array(fixed_initial_state) if fixed_initial_state else None

        if controller_type == "FSF":
            K = [params.get(f"K{i + 1}", 0.0) for i in range(self.system.num_states)]
            trajectory, controls, errors = self.system.run_fsf(K, ic)
        else:
            # All other types are PID variants (P, PI, PD, PID)
            Kp = params.get("Kp", 0.0)
            Ki = params.get("Ki", 0.0)
            Kd = params.get("Kd", 0.0)
            trajectory, controls, errors = self.system.run_pid(Kp, Ki, Kd, ic)

        metrics = MetricsCalculator.calculate(
            errors,
            controls,
            self.system.dt,
            self.system.min_control,
            self.system.max_control,
        )

        time_points = np.arange(0, len(trajectory) * self.system.dt, self.system.dt).tolist()

        return {
            "success": True,
            "time_points": time_points,
            "trajectory": trajectory.tolist(),
            "control_signals": controls.tolist(),
            "metrics": metrics,
        }