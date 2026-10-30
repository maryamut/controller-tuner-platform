# Controller Tuner

A dual-interface platform for tuning controllers on arbitrary dynamical systems. The core physics engine (`src/core/`) is framework-agnostic Python. It is consumed by an internal Streamlit prototyping tool and by a production FastAPI + React stack.

---

## Directory Layout

```
controller-tuner/
├── src/                    # Physics engine — read-only, framework-free
│   └── core/
│       ├── dynamics.py     # Loads user .py, auto-detects dimension, integrates ODEs
│       ├── simulator.py    # Controller params → trajectory + metrics
│       └── metrics.py      # Control-theory metrics (settling time, overshoot, etc.)
│
├── streamlit/              # Reference / prototyping UI
│   ├── app.py
│   └── requirements.txt
│
├── case_studies/           # Example systems for testing
│   ├── BallBeam.py
│   ├── DCMotor.py
│   └── InvPendulum.py
│
└── README.md
```

---

## Quick Start — Streamlit Prototype

The Streamlit app is the fastest way to see the engine in action and to understand the expected user flow.

```bash
cd streamlit
pip install -r requirements.txt   # installs streamlit, plotly, numpy
streamlit run app.py
# → http://localhost:8501
```

Upload any file from `case_studies/`, click **Initialize System**, select a controller type, tune the sliders, and click **Simulate & Plot**.

---

## The Physics Engine (`src/core/`)

### What it does

1. **Loads** a user-uploaded Python file that defines `dynamics(t, x, u)`.
2. **Auto-detects** the state dimension by probing the function.
3. **Simulates** the closed-loop response for either:
   - **PID** (output feedback on `output_channel`), or
   - **FSF** (full-state feedback, one gain per state).
4. **Computes** metrics: MSE, settling time, overshoot, stability, steady-state error, control effort, rise time, zero crossings.

### How to use it in code

```python
from src.core.dynamics import DynamicalSystem
from src.core.simulator import Simulator

# 1. Load a dynamics file
system = DynamicalSystem("case_studies/BallBeam.py", num_inputs=1)

# 2. Configure simulation settings
system.dt = 0.01
system.max_time = 5.0
system.target = 0.0
system.min_control = -10.0
system.max_control = 10.0
system.initial_condition_range = (-1.0, 1.0)

# 3. Run a simulation
sim = Simulator(system)
result = sim.evaluate(
    controller_type="PID",
    params={"Kp": 15.0, "Ki": 0.5, "Kd": 2.0},
    fixed_initial_state=None,   # or [1.0, 0.0] for a fixed IC
)

# result["time_points"]     → List[float]
# result["trajectory"]      → List[float]  (output history)
# result["control_signals"] → List[float]  (input history)
# result["metrics"]         → Dict[str, float | bool]
```

### Adding new controller types

Backend developers extend `src/core/dynamics.py` (add a `run_xxx` method) and `src/core/simulator.py` (route to it). The Streamlit app and FastAPI backend will both pick up the change automatically because they import from the same source.

---

## Case Studies (`case_studies/`)

| File | States | Physics | Input |
|------|--------|---------|-------|
| `BallBeam.py` | 2 | Ball position & velocity on a beam | Beam angle (rad) |
| `DCMotor.py` | 2 | Motor speed & armature current | Voltage (V) |
| `InvPendulum.py` | 2 | Pendulum angle & angular rate | Torque (N·m) |

All three files expose the same contract:

```python
import numpy as np

def dynamics(t, x, u):
    """
    t : float
    x : np.ndarray, shape (n,)
    u : float or np.ndarray
    returns : np.ndarray, shape (n,)
    """
    ...
```

Use these to test uploads, configuration, and simulation without writing custom dynamics.

---

## Development Notes

- **Python version:** 3.10+
- **Core dependency:** `numpy` (used by `src/core/`)
- **Streamlit dependencies:** `streamlit`, `plotly` (listed in `streamlit/requirements.txt`)
- **FastAPI dependency:** `pydantic` (only needed when building the REST backend)

No database is required; all system state is held in memory for the duration of a tuning session.

---

## License

Internal use only.



## Controller Tuner Platform

A full-stack application for tuning and simulating controllers
for dynamical systems.

### Technology Stack

- Backend: Python, FastAPI
- Frontend: React, Vite, Tailwind CSS, Recharts
- Deployment: Docker Compose, Nginx

### Running with Docker

Requirements:
- Docker Desktop
- Docker Compose

From the project root, run:

```bash
docker compose up --build
```

Open the application:

- Frontend: http://localhost:5173
- API Documentation: http://localhost:8000/docs

### How to Use

1. Upload a Python dynamics file from `case_studies/`.
2. Select a controller: P, PI, PD, PID, or FSF.
3. Adjust the controller parameters using the sliders.
4. Click "Run Simulation".
5. View the system response and control input charts.
6. Review the performance metrics and stability indicator.

### API Endpoints

- POST /api/v1/upload
- GET /api/v1/systems/{system_id}/schema
- POST /api/v1/systems/{system_id}/simulate

### Architecture

The FastAPI backend integrates with the original simulation
engine in `src/core/` without modifying its source code.

The React frontend communicates with the backend through
REST API endpoints.

### Important Notes

- Uploaded Python files are executed by the backend.
  Only upload trusted dynamics files.
- Uploaded systems are stored in memory and are cleared
  when the backend restarts.
- The application is intended for local development and testing.
