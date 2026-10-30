import numpy as np
import importlib.util
from typing import Optional, List


class DynamicalSystem:
    """
    Wraps a user-uploaded Python file that MUST expose:
        def dynamics(t: float, x: np.ndarray, u: float | np.ndarray) -> np.ndarray

    Auto-detects state dimension by probing the function.
    Supports both PID (output feedback) and FSF (full-state feedback) simulations.
    """

    def __init__(self, file_path: str, num_inputs: int = 1):
        self.file_path = file_path
        self.num_inputs = num_inputs

        # --- Simulation hyperparameters (set via API or Streamlit) ---
        self.dt: float = 0.01
        self.max_time: float = 5.0
        self.min_control: float = -10.0
        self.max_control: float = 10.0
        self.target: float = 0.0
        self.input_channel: int = 0
        self.output_channel: int = 0
        self.trim_values: np.ndarray = np.zeros(num_inputs)

        # --- Scenario / disturbance settings ---
        self.initial_condition_range: tuple[float, float] = (-1.0, 1.0)
        self.randomness_level: float = 0.0
        self.disturbance_level: float = 0.0

        # --- Load user code & introspect ---
        self._load_module()
        self._detect_dimension()

        # --- Metadata ---
        self.name = "Custom System"
        self.state_names = [f"x{i}" for i in range(self.num_states)]

    # ------------------------------------------------------------------ #
    #  Module loading
    # ------------------------------------------------------------------ #
    def _load_module(self) -> None:
        spec = importlib.util.spec_from_file_location("user_dynamics", self.file_path)
        if spec is None or spec.loader is None:
            raise RuntimeError(f"Cannot load dynamics file: {self.file_path}")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        if not hasattr(module, "dynamics"):
            raise RuntimeError("Uploaded file must define a top-level `dynamics(t, x, u)` function")
        self._dynamics = module.dynamics

    def _detect_dimension(self) -> None:
        """Probe dynamics(t, x, u) to discover state vector size (1 … 10)."""
        for n in range(1, 11):
            try:
                x = np.zeros(n)
                u = 0.0 if self.num_inputs == 1 else np.zeros(self.num_inputs)
                out = self._dynamics(0.0, x, u)
                if np.asarray(out).shape == (n,):
                    self.num_states = n
                    return
            except Exception:
                continue
        raise ValueError(
            "Could not auto-detect state dimension. "
            "Ensure dynamics(t, x, u) returns a 1-D array of the same length as x."
        )

    # ------------------------------------------------------------------ #
    #  Controller schema → tells UI how many sliders to draw
    # ------------------------------------------------------------------ #
    def get_param_schema(self, controller_type: str) -> dict[str, dict[str, float]]:
        """
        Returns { param_name: { "min": float, "max": float } }.
        The frontend turns each entry into a slider.
        """
        if controller_type == "FSF":
            return {f"K{i + 1}": {"min": 0.01, "max": 100.0} for i in range(self.num_states)}

        schema: dict[str, dict[str, float]] = {}
        if controller_type in ("P", "PI", "PD", "PID"):
            schema["Kp"] = {"min": 0.1, "max": 60.0}
        if controller_type in ("PI", "PID"):
            schema["Ki"] = {"min": 0.0, "max": 5.0}
        if controller_type in ("PD", "PID"):
            schema["Kd"] = {"min": 0.0, "max": 20.0}
        return schema

    # ------------------------------------------------------------------ #
    #  Simulations
    # ------------------------------------------------------------------ #
    def run_pid(
        self,
        Kp: float,
        Ki: float,
        Kd: float,
        initial_state: Optional[np.ndarray] = None,
    ) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """
        PID on the output_channel.
        Returns: (output_history, control_history, error_history)
        """
        n_steps = int(self.max_time / self.dt) + 1
        t_vec = np.arange(0, self.max_time + self.dt, self.dt)[:n_steps]

        # Initialize state: only output_channel gets random IC; others start at 0
        if initial_state is not None:
            x = initial_state.copy()
        else:
            x = np.zeros(self.num_states)
            x[self.output_channel] = np.random.uniform(*self.initial_condition_range)

        integral = 0.0
        prev_error = 0.0
        outputs: list[float] = [float(x[self.output_channel])]
        controls: list[float] = []
        errors: list[float] = []

        for i in range(len(t_vec)):
            y = x[self.output_channel]
            current_target = self.target(t_vec[i]) if callable(self.target) else self.target
            error = current_target - y

            if self.randomness_level > 0:
                error += float(np.random.normal(0.0, self.randomness_level))

            # PID law
            integral += error * self.dt
            derivative = (error - prev_error) / self.dt if i > 0 else 0.0
            u_cmd = Kp * error + Ki * integral + Kd * derivative

            if self.disturbance_level > 0:
                u_cmd += self.disturbance_level * np.sin(2 * np.pi * 5.0 * t_vec[i])

            u_cmd = float(np.clip(u_cmd, self.min_control, self.max_control))

            # Build full MIMO input vector (trim + commanded channel)
            u_full = self.trim_values.copy()
            u_full[self.input_channel] = u_cmd

            controls.append(u_cmd)
            errors.append(float(error))

            # Euler step
            try:
                u_for_dyn = u_full[0] if self.num_inputs == 1 else u_full
                x_dot = self._dynamics(t_vec[i], x, u_for_dyn)
                x = x + x_dot * self.dt
                outputs.append(float(x[self.output_channel]))
                prev_error = error
            except Exception:
                break

        # outputs has one extra sample; trim to match controls/errors length
        return np.array(outputs[:-1]), np.array(controls), np.array(errors)

    def run_fsf(
        self,
        K_values: List[float],
        initial_state: Optional[np.ndarray] = None,
    ) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """
        Full-state feedback: u = -K · (x - x_desired).
        Returns: (output_history, control_history, error_history)
        """
        K = np.array(K_values)
        n_steps = int(self.max_time / self.dt) + 1
        t_vec = np.arange(0, self.max_time + self.dt, self.dt)[:n_steps]

        if initial_state is not None:
            x = initial_state.copy()
        else:
            x = np.zeros(self.num_states)
            x[self.output_channel] = np.random.uniform(*self.initial_condition_range)

        outputs: list[float] = [float(x[self.output_channel])]
        controls: list[float] = []
        errors: list[float] = []

        for i in range(len(t_vec)):
            noise = (
                np.random.normal(0.0, self.randomness_level, self.num_states)
                if self.randomness_level > 0
                else np.zeros(self.num_states)
            )
            x_noisy = x + noise

            current_target = self.target(t_vec[i]) if callable(self.target) else self.target
            error = current_target - x_noisy[self.output_channel]
            errors.append(float(error))

            # Desired state: all zeros except output_channel = target
            x_desired = np.zeros(self.num_states)
            x_desired[self.output_channel] = current_target
            state_error = x_noisy - x_desired

            u_cmd = -np.dot(K, state_error)

            if self.disturbance_level > 0:
                u_cmd += self.disturbance_level * np.sin(2 * np.pi * 5.0 * t_vec[i])

            u_cmd = float(np.clip(u_cmd, self.min_control, self.max_control))

            u_full = self.trim_values.copy()
            u_full[self.input_channel] = u_cmd

            controls.append(u_cmd)

            try:
                u_for_dyn = u_full[0] if self.num_inputs == 1 else u_full
                x_dot = self._dynamics(t_vec[i], x, u_for_dyn)
                x = x + x_dot * self.dt
                outputs.append(float(x[self.output_channel]))
            except Exception:
                break

        return np.array(outputs[:-1]), np.array(controls), np.array(errors)