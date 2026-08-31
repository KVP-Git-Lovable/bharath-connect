#!/bin/bash

# SBEE Cables Weekly Report Generator
# Setup and execution script

echo "🚀 SBEE Cables - Weekly Report Generator"
echo "========================================"

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 not found. Please install Python 3."
    exit 1
fi

echo "✅ Python 3 found"

# Install dependencies
echo "📦 Installing dependencies..."
pip3 install python-supabase reportlab pillow --quiet

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed"

# Load environment variables from .env if exists
if [ -f ".env.local" ]; then
    export $(cat .env.local | xargs)
    echo "✅ Loaded environment from .env.local"
elif [ -f ".env" ]; then
    export $(cat .env | xargs)
    echo "✅ Loaded environment from .env"
else
    echo "⚠️  No .env file found. Using environment variables directly."
fi

# Run the report generator
echo "🔄 Generating report..."
python3 generate_weekly_report.py

if [ $? -eq 0 ]; then
    echo "✅ Report generation complete!"
    # Find and display the generated file
    latest_report=$(ls -t SBEE_Weekly_Report_*.pdf 2>/dev/null | head -1)
    if [ -n "$latest_report" ]; then
        echo "📄 Report: $latest_report"
        echo "📊 File size: $(du -h "$latest_report" | cut -f1)"
    fi
else
    echo "❌ Report generation failed"
    exit 1
fi
