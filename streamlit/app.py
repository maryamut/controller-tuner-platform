"""
Streamlit Manual Controller Tuner
=================================
Backend developers use this to test new core features before they are exposed
via the REST API. It imports the SAME engine (src.core) that FastAPI uses.
"""

import sys
from pathlib import Path

# Add repo root to path so we can import src.core
sys.path.append(str(Path(__file__).parent.parent))

import streamlit as st
import numpy as np
import tempfile
import os
import plotly.graph_objects as go
from plotly.subplots import make_subplots

from src.core.dynamics import DynamicalSystem
from src.core.simulator import Simulator


st.set_page_config(page_title="Manual Controller Tuner", layout="wide")
st.title("Manual Controller Tuner")

uploaded_file = st.file_uploader("Upload dynamics file (.py)", type=["py"])

if uploaded_file is not None:
    # Save to temp file (survives across Streamlit reruns)
    with tempfile.NamedTemporaryFile(delete=False, suffix=".py") as tmp:
        tmp.write(uploaded_file.read())
        dynamics_path = tmp.name

    # ======================================================================== #
    #  CONFIGURATION
    # ======================================================================== #
    st.subheader("System Configuration")
    c1, c2 = st.columns(2)
    with c1:
        dt = st.number_input("dt (s)", value=0.01, min_value=0.001, format="%.3f")
        max_time = st.number_input("max_time (s)", value=5.0, min_value=0.1, format="%.1f")
        num_inputs = st.number_input("Number of inputs", value=1, min_value=1, max_value=10)
        input_channel = st.number_input("Input channel (0-indexed)", value=0, min_value=0, max_value=9)
    with c2:
        target = st.number_input("Target setpoint", value=0.0)
        output_channel = st.number_input("Output channel (0-indexed)", value=0, min_value=0, max_value=20)
        min_ctrl = st.number_input("min_ctrl", value=-10.0)
        max_ctrl = st.number_input("max_ctrl", value=10.0)

    st.subheader("Scenario Parameters")
    c3, c4, c5 = st.columns(3)
    with c3:
        ic_range = st.slider("Initial condition range", -2.0, 2.0, (-1.0, 1.0))
    with c4:
        randomness = st.slider("Measurement noise", 0.0, 0.5, 0.0)
    with c5:
        disturbance = st.slider("Input disturbance", 0.0, 2.0, 0.0)

    # Trim values
    default_trim = ",".join(["0.0"] * num_inputs)
    trim_str = st.text_input("Trim values (comma-separated)", value=default_trim)
    try:
        trim_values = [float(v.strip()) for v in trim_str.split(",") if v.strip()]
        if len(trim_values) != num_inputs:
            raise ValueError
    except Exception:
        st.warning("Invalid trim values; using zeros.")
        trim_values = [0.0] * num_inputs

    # ======================================================================== #
    #  INITIALIZE
    # ======================================================================== #
    if st.button("Initialize System", type="primary"):
        try:
            system = DynamicalSystem(dynamics_path, num_inputs=num_inputs)
            system.dt = dt
            system.max_time = max_time
            system.target = target
            system.input_channel = input_channel
            system.output_channel = output_channel
            system.min_control = min_ctrl
            system.max_control = max_ctrl
            system.trim_values = np.array(trim_values)
            system.initial_condition_range = ic_range
            system.randomness_level = randomness
            system.disturbance_level = disturbance

            st.session_state.system = system
            st.session_state.simulator = Simulator(system)
            st.success(f"System initialized: {system.num_states} states detected.")
        except Exception as e:
            st.error(f"Initialization failed: {e}")

    # ======================================================================== #
    #  TUNING UI
    # ======================================================================== #
    if "system" in st.session_state:
        system = st.session_state.system
        simulator = st.session_state.simulator

        ctrl_type = st.selectbox("Controller Type", ["P", "PI", "PD", "PID", "FSF"])

        schema = system.get_param_schema(ctrl_type)
        gain_key = f"gains_{ctrl_type}"

        if gain_key not in st.session_state:
            st.session_state[gain_key] = {
                k: (v["min"] + v["max"]) / 2 for k, v in schema.items()
            }

        st.subheader("Gain Sliders")
        params = {}
        cols = st.columns(min(len(schema), 3))
        for idx, (param_name, rng) in enumerate(sorted(schema.items())):
            with cols[idx % len(cols)]:
                val = st.slider(
                    param_name,
                    min_value=float(rng["min"]),
                    max_value=float(rng["max"]),
                    value=float(st.session_state[gain_key][param_name]),
                    step=0.01,
                    key=f"{ctrl_type}_{param_name}",
                )
                params[param_name] = val
                st.session_state[gain_key][param_name] = val

        # Fixed initial condition
        use_fixed_ic = st.checkbox("Use fixed initial condition (overrides random range)")
        fixed_ic = None
        if use_fixed_ic:
            ic_str = st.text_input(
                f"Initial state ({system.num_states} comma-separated values)",
                help="e.g. 1.0, 0.0, 0.0",
            )
            try:
                fixed_ic = np.array([float(v.strip()) for v in ic_str.split(",") if v.strip()])
                if len(fixed_ic) != system.num_states:
                    st.warning(f"Expected {system.num_states} values; using random.")
                    fixed_ic = None
            except ValueError:
                st.warning("Invalid format; using random initial condition.")
                fixed_ic = None

        # ======================================================================== #
        #  SIMULATE
        # ======================================================================== #
        if st.button("Simulate & Plot", type="primary"):
            with st.spinner("Running simulation..."):
                result = simulator.evaluate(ctrl_type, params, fixed_initial_state=fixed_ic)

            if not result["success"]:
                st.error("Simulation failed.")
                st.stop()

            traj = result["trajectory"]
            ctrl = result["control_signals"]
            time_pts = result["time_points"]
            m = result["metrics"]

            # --- Charts ---
            fig = make_subplots(
                rows=2,
                cols=1,
                subplot_titles=["System Response", "Control Input"],
                vertical_spacing=0.12,
            )
            fig.add_trace(
                go.Scatter(
                    x=time_pts, y=traj, mode="lines", name="Response",
                    line=dict(color="rgb(255,99,132)", width=2)
                ),
                row=1, col=1,
            )
            fig.add_hline(y=system.target, line_dash="dash", line_color="green", row=1, col=1)
            fig.add_trace(
                go.Scatter(
                    x=time_pts, y=ctrl, mode="lines", name="Control",
                    line=dict(color="rgb(255,159,64)", width=2)
                ),
                row=2, col=1,
            )

            gains_str = ", ".join([f"{k}={v:.2f}" for k, v in params.items()])
            fig.update_layout(
                height=700,
                showlegend=True,
                title_text=f"{ctrl_type} Controller | {gains_str}",
            )
            fig.update_xaxes(title_text="Time (s)", row=2, col=1)
            fig.update_yaxes(title_text="Output", row=1, col=1)
            fig.update_yaxes(title_text="Control Signal", row=2, col=1)
            st.plotly_chart(fig, use_container_width=True)

            # --- Metrics ---
            st.subheader("Metrics")
            m1, m2, m3 = st.columns(3)
            with m1:
                st.metric("MSE", f"{m['mse']:.4f}")
                st.metric(
                    "Settling Time",
                    f"{m['settling_time']:.2f} s"
                    if m["settling_time"] != float("inf")
                    else "∞ s",
                )
                st.metric(
                    "Rise Time",
                    f"{m['rise_time']:.2f} s"
                    if m["rise_time"] != float("inf")
                    else "∞ s",
                )
            with m2:
                st.metric("Overshoot", f"{m['overshoot']:.2f} %")
                st.metric("Steady-State Error", f"{m['ss_error']:.4f}")
                st.metric("Zero Crossings", f"{m['zero_crossings']}")
            with m3:
                st.metric("Stability", "Stable" if m["stable"] else "Unstable")
                st.metric("Control Effort", f"{m['control_effort']:.2f}")
                st.metric("RMSE", f"{m['rmse']:.4f}")

else:
    st.info("👆 Upload a `.py` dynamics file to begin tuning.")