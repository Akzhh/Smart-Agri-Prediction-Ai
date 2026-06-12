# Smart Agriculture AI System - Launcher

Write-Host "Starting Smart Agriculture AI System..." -ForegroundColor Green

# Ensure Python Virtual Environment is setup
if (-not (Test-Path "backend/venv")) {
    Write-Host "Python virtual environment not found. Creating venv..." -ForegroundColor Yellow
    
    $pyExecutable = "python"
    $pyArgs = @("-m", "venv", "backend/venv")

    if (Get-Command "py" -ErrorAction SilentlyContinue) {
        foreach ($ver in "3.13", "3.12", "3.11", "3.10") {
            & py -$ver -c "import sys" 2>$null
            if ($LASTEXITCODE -eq 0) {
                $pyExecutable = "py"
                $pyArgs = @("-$ver", "-m", "venv", "backend/venv")
                Write-Host "Selected Python $ver via py launcher to avoid compilation issues." -ForegroundColor Gray
                break
            }
        }
    }

    & $pyExecutable $pyArgs
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to create python virtual environment. Please ensure Python is installed and in your PATH." -ForegroundColor Red
        Exit
    }
    Write-Host "Installing backend dependencies from requirements.txt..." -ForegroundColor Yellow
    # Run pip install in the virtual environment
    Start-Process powershell -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "cd backend; .\venv\Scripts\activate.ps1; pip install -r requirements.txt" -Wait
    Write-Host "Backend dependencies installed successfully!" -ForegroundColor Green
}

# Start Backend in a new window with activated venv
Write-Host "Starting Flask Backend..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-NoExit", "-Command", "cd backend; .\venv\Scripts\activate.ps1; python app.py"

# Start Frontend in a new window
Write-Host "Starting Vite Frontend..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-NoExit", "-Command", "cd frontend; npm run dev"

Write-Host "Both services are starting! Check the new windows for logs." -ForegroundColor Green
Write-Host "Frontend: http://localhost:5173" -ForegroundColor Yellow
Write-Host "Backend API: http://localhost:5000" -ForegroundColor Yellow

