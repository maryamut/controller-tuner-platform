
import os
import tempfile
from pathlib import Path
from uuid import uuid4
import math
import numpy as np
from typing import Literal
from pydantic import BaseModel, Field
from fastapi.encoders import jsonable_encoder
from src.core.simulator import Simulator
from fastapi import FastAPI, File, UploadFile, HTTPException
from src.core.dynamics import DynamicalSystem
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Controller Tuner API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)


systems = {}


@app.post("/api/v1/upload")
async def upload_system(file: UploadFile = File(...)):

    if not file.filename or Path(file.filename).suffix.lower() != ".py":
        raise HTTPException(
            status_code=400,
            detail="Only .py files are allowed"
        )

    content = await file.read(2 * 1024 * 1024 + 1)
    await file.close()

    if len(content) > 2 * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail="File is too large (maximum 2 MB)"
        )

    if not content:
        raise HTTPException(
            status_code=400,
            detail="Uploaded file is empty"
        )

    temp_path = None

    try:
        with tempfile.NamedTemporaryFile(
            suffix=".py",
            delete=False
        ) as temp_file:
            temp_file.write(content)
            temp_path = temp_file.name

        system = DynamicalSystem(temp_path, num_inputs=1)

        system_id = str(uuid4())
        system.name = Path(file.filename).stem

        systems[system_id] = system

        return {
            "system_id": system_id,
            "name": system.name,
            "num_states": system.num_states
        }

    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Could not load dynamics: {exc}"
        )

    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)



@app.get("/api/v1/systems/{system_id}/schema")
def get_controller_schema(system_id: str, controller_type: str):

    system = systems.get(system_id)

    if system is None:
        raise HTTPException(
            status_code=404,
            detail="System not found"
        )

    allowed_types = {"P", "PI", "PD", "PID", "FSF"}

    if controller_type not in allowed_types:
        raise HTTPException(
            status_code=422,
            detail="Invalid controller type"
        )

    return system.get_param_schema(controller_type)


class SimulationConfig(BaseModel):
    dt: float = Field(default=0.01, gt=0)
    max_time: float = Field(default=5.0, gt=0)
    target: float = 0.0
    min_control: float = -10.0
    max_control: float = 10.0


class SimulationRequest(BaseModel):
    controller_type: Literal["P", "PI", "PD", "PID", "FSF"]
    params: dict[str, float]
    system_config: SimulationConfig | None = None


@app.post("/api/v1/systems/{system_id}/simulate")
def simulate_system(system_id: str, request: SimulationRequest):

    system = systems.get(system_id)

    if system is None:
        raise HTTPException(
            status_code=404,
            detail="System not found"
        )

    schema = system.get_param_schema(request.controller_type)

    missing = set(schema) - set(request.params)

    if missing:
        raise HTTPException(
            status_code=422,
            detail=f"Missing controller gains: {sorted(missing)}"
        )

    for name, value in request.params.items():
        if not math.isfinite(value):
            raise HTTPException(
                status_code=422,
                detail=f"Invalid value for {name}"
            )

    config = request.system_config or SimulationConfig()

    values = [
        config.dt,
        config.max_time,
        config.target,
        config.min_control,
        config.max_control,
    ]

    if not all(math.isfinite(v) for v in values):
        raise HTTPException(
            status_code=422,
            detail="Simulation settings must be finite"
        )

    if config.min_control >= config.max_control:
        raise HTTPException(
            status_code=422,
            detail="min_control must be less than max_control"
        )

    if config.max_time / config.dt > 20000:
        raise HTTPException(
            status_code=422,
            detail="Too many simulation steps"
        )

    system.dt = config.dt
    system.max_time = config.max_time
    system.target = config.target
    system.min_control = config.min_control
    system.max_control = config.max_control

    simulator = Simulator(system)

    result = simulator.evaluate(
        controller_type=request.controller_type,
        params=request.params
    )


    def clean_non_finite(data):
        if isinstance(data, float):
            return data if math.isfinite(data) else None

        if isinstance(data, dict):
            return {
                key: clean_non_finite(value)
                for key, value in data.items()
            }

        if isinstance(data, list):
            return [clean_non_finite(item) for item in data]

        return data

    encoded_result = jsonable_encoder(
        result,
        custom_encoder={
            np.generic: lambda value: value.item(),
            np.ndarray: lambda value: value.tolist()
        }
    )

    return clean_non_finite(encoded_result)

